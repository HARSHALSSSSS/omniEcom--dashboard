import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp, DbAccessDirectory, DbIdempotencyStore, InMemoryIdempotencyStore, StaticAccessDirectory } from '@oms/api';
import { parseConfig, type AppConfig } from '@oms/config';
import { createLogger } from '@oms/logging';
import { createMetrics, HealthRegistry, type ErrorTracker } from '@oms/observability';
import { signAccessToken, SYSTEM_ROLES } from '@oms/auth';
import { createConnectorRegistry, mockControl } from '@oms/connectors';
import { MemoryMailer, type Container, type ModuleDefinition } from '@oms/module-kit';
import { allModules } from '@oms/modules-registry';
import { MemoryStorage } from '@oms/storage';
import { schema, seedReferenceData, type Database, type Db } from '@oms/database';
import { newId } from '@oms/shared';

export { mockControl, MemoryMailer, MemoryStorage };

/** Deterministic test configuration. Secrets here are test-only constants. */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://oms_app:oms_app@localhost:5432/oms_test',
  JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret-0123456789',
  ENCRYPTION_KEYS: `test:${Buffer.alloc(32, 7).toString('base64')}`,
  SWAGGER_ENABLED: 'true',
  RATE_LIMIT_MAX: '100000',
  AUTH_RATE_LIMIT_MAX: '100000',
  STORAGE_DRIVER: 'memory',
};

export const testConfig = (overrides: Record<string, string> = {}): AppConfig => parseConfig({ ...TEST_ENV, ...overrides });

export const ROLE_PERMISSIONS: Record<string, string[]> = Object.fromEntries(Object.entries(SYSTEM_ROLES).map(([k, v]) => [k, v.permissions]));

// ------------------------------------------------------------------------------------------------
// in-process Postgres (PGlite) with the REAL migrations, seeded reference data and the non-owner runtime role
// ------------------------------------------------------------------------------------------------
const MIGRATIONS = fileURLToPath(new URL('../../database/migrations', import.meta.url));
let template: Promise<Blob | File | null> | undefined;

async function migrate(pg: PGlite): Promise<void> {
  await pg.exec('CREATE ROLE oms_app NOLOGIN');
  const journal = JSON.parse(readFileSync(resolve(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    for (const stmt of readFileSync(resolve(MIGRATIONS, `${tag}.sql`), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await pg.exec(stmt);
  }
  await seedReferenceData(drizzle(pg, { schema }) as never);
}

export interface TestDatabase extends Database { pg: PGlite }

/** Fresh database per call; the migrated+seeded image is built once per process and cloned (fast). */
export async function createTestDatabase(): Promise<TestDatabase> {
  template ??= (async () => {
    const base = new PGlite({ extensions: { pg_trgm } });
    await migrate(base);
    try {
      const dump = await base.dumpDataDir('none');
      await base.close();
      return dump;
    } catch {
      await base.close();
      return null;
    }
  })();
  const dump = await template;
  let pg: PGlite;
  if (dump) pg = new PGlite({ extensions: { pg_trgm }, loadDataDir: dump });
  else { pg = new PGlite({ extensions: { pg_trgm } }); await migrate(pg); }
  await pg.waitReady;
  await pg.exec('SET ROLE oms_app'); // the application never runs as the owner: RLS applies exactly as in production
  const db = drizzle(pg, { schema }) as unknown as Db;
  return { pg, db, pool: {} as never, ping: async () => void (await pg.query('select 1')), close: () => pg.close() };
}

// ------------------------------------------------------------------------------------------------
// queues: record jobs; tests run them on demand through the modules' real job handlers
// ------------------------------------------------------------------------------------------------
export interface RecordedJob { queue: string; name: string; envelope: { vendorId: string | null; correlationId: string; idempotencyKey?: string; data: unknown } }

class FakeQueues {
  readonly jobs: RecordedJob[] = [];
  async enqueue(queue: string, name: string, envelope: RecordedJob['envelope']) {
    if (envelope.idempotencyKey && this.jobs.some((j) => j.envelope.idempotencyKey === envelope.idempotencyKey)) return { id: envelope.idempotencyKey };
    this.jobs.push({ queue, name, envelope });
    return { id: String(this.jobs.length) };
  }
  queue() { return { add: async () => ({}) }; }
  async close() { /* nothing */ }
}

// ------------------------------------------------------------------------------------------------
// test app
// ------------------------------------------------------------------------------------------------
export interface TestAppOptions {
  config?: Record<string, string>;
  modules?: ModuleDefinition[];
  /** vendorId -> status for the static directory (no-database mode) */
  vendors?: Record<string, 'pending' | 'active' | 'suspended' | 'closed'>;
  healthChecks?: Record<string, () => Promise<void>>;
  /** Use a real (in-process) PostgreSQL with all migrations, real access directory and idempotency store. All modules are loaded unless `modules` is given. */
  database?: boolean;
}

export interface TestApp {
  app: FastifyInstance;
  config: AppConfig;
  container: Container;
  mailer: MemoryMailer;
  storage: MemoryStorage;
  queues: FakeQueues;
  database: TestDatabase | null;
  vendorId: string;
  /** Mint a valid access token (no-database mode, or when you want a token without a login). */
  tokenFor(input: { userId?: string; vendorId?: string | null; roles?: string[]; userType?: 'vendor' | 'platform'; sessionId?: string }): Promise<string>;
  /** Execute recorded background jobs through the real handlers (what apps/worker does). Returns how many ran. */
  runJobs(filter?: (j: RecordedJob) => boolean): Promise<number>;
  close(): Promise<void>;
}

/** Full HTTP stack. Without `database`, in-memory ports only (fast); with it, the real data layer on PGlite. */
export async function buildTestApp(opts: TestAppOptions = {}): Promise<TestApp> {
  const config = testConfig(opts.config);
  const logger = createLogger({ level: 'silent', service: 'test' });
  const health = new HealthRegistry();
  for (const [name, fn] of Object.entries(opts.healthChecks ?? {})) health.register(name, fn);
  const vendorId = newId();
  const noopTracker: ErrorTracker = { captureException: () => undefined };
  const mailer = new MemoryMailer();
  const storage = new MemoryStorage();
  const queues = new FakeQueues();
  const database = opts.database ? await createTestDatabase() : null;
  const modules = opts.modules ?? (opts.database ? allModules : []);

  const container = {
    config, logger, mailer, storage,
    database: (database ?? {}) as Database,
    queues: queues as never,
    connectors: createConnectorRegistry({ mock: config.mockMarketplaceEnabled }),
  } satisfies Container;

  const app = await buildApp({
    container, logger,
    metrics: createMetrics('test'),
    health,
    errorTracker: noopTracker,
    access: database ? new DbAccessDirectory(database) : new StaticAccessDirectory(ROLE_PERMISSIONS, { [vendorId]: 'active', ...(opts.vendors ?? {}) }),
    idempotency: database ? new DbIdempotencyStore(database) : new InMemoryIdempotencyStore(),
    modules,
  });
  await app.ready();

  const tokenCfg = { issuer: config.JWT_ISSUER, audience: config.JWT_AUDIENCE, secret: config.JWT_ACCESS_SECRET, accessTtlSeconds: 900 };
  const handlers = new Map(modules.flatMap((m) => m.jobs ?? []).map((h) => [`${h.queue}/${h.name}`, h]));
  const ran = new Set<RecordedJob>();

  return {
    app, config, container, mailer, storage, queues, database, vendorId,
    tokenFor: async ({ userId = newId(), vendorId: vid = vendorId, roles = ['vendor_admin'], userType = 'vendor', sessionId = newId() }) =>
      (await signAccessToken(tokenCfg, { sub: userId, vid: userType === 'platform' ? null : vid, utp: userType, rol: roles, sid: sessionId })).token,
    runJobs: async (filter = () => true) => {
      let n = 0;
      for (const job of [...queues.jobs]) {
        if (ran.has(job) || !filter(job)) continue;
        ran.add(job);
        const h = handlers.get(`${job.queue}/${job.name}`);
        if (!h) throw new Error(`no handler for ${job.queue}/${job.name}`);
        await h.handle(job.envelope as never, container, { id: String(n), attemptsMade: 0 });
        n++;
      }
      return n;
    },
    close: async () => { await app.close(); await database?.close(); },
  };
}

// ------------------------------------------------------------------------------------------------
// HTTP client + scenario helpers (database mode)
// ------------------------------------------------------------------------------------------------
export interface Resp<T = any> { status: number; body: T; headers: LightMyRequestResponse['headers']; raw: LightMyRequestResponse }
export type Actor = { token: string; refreshToken: string; userId: string; vendorId: string | null; email: string; password: string; sessionId: string };

export class Client {
  constructor(private readonly t: TestApp) {}

  async call<T = any>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, o: { as?: Actor | string; body?: unknown; raw?: Buffer | string; headers?: Record<string, string>; contentType?: string } = {}): Promise<Resp<T>> {
    const token = typeof o.as === 'string' ? o.as : o.as?.token;
    const res = await this.t.app.inject({
      method, url,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(o.contentType ? { 'content-type': o.contentType } : {}), ...o.headers },
      ...(o.raw !== undefined ? { payload: o.raw } : o.body !== undefined ? { payload: o.body as object } : {}),
    });
    let body: unknown = res.body;
    try { body = res.body ? JSON.parse(res.body) : null; } catch { /* non-JSON (csv, bytes) */ }
    return { status: res.statusCode, body: body as T, headers: res.headers, raw: res };
  }
  get = <T = any>(url: string, as?: Actor | string, headers?: Record<string, string>) => this.call<T>('GET', url, { as, headers });
  post = <T = any>(url: string, body: unknown, as?: Actor | string, headers?: Record<string, string>) => this.call<T>('POST', url, { as, body, headers });
  patch = <T = any>(url: string, body: unknown, as?: Actor | string) => this.call<T>('PATCH', url, { as, body });
  put = <T = any>(url: string, body: unknown, as?: Actor | string) => this.call<T>('PUT', url, { as, body });
  del = <T = any>(url: string, as?: Actor | string) => this.call<T>('DELETE', url, { as });

  async login(email: string, password: string): Promise<Actor> {
    const r = await this.post('/api/v1/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`login failed: ${r.status} ${JSON.stringify(r.body)}`);
    const d = r.body.data;
    return { token: d.accessToken, refreshToken: d.refreshToken, userId: d.user.id, vendorId: d.user.vendorId, email, password, sessionId: d.sessionId };
  }

  /** register -> verify e-mail (via the captured mail) -> login */
  async registerVendor(o: { businessName?: string; email?: string; password?: string; fullName?: string; verify?: boolean } = {}): Promise<Actor> {
    const n = newId().slice(-8);
    const email = o.email ?? `admin-${n}@acme.test`;
    const password = o.password ?? 'correct-horse-battery';
    const r = await this.post('/api/v1/auth/register', { businessName: o.businessName ?? `Acme ${n}`, fullName: o.fullName ?? 'Asha Admin', email, password });
    if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
    if (o.verify !== false) {
      const token = this.t.mailer.last('verify_email', email)!.data.token;
      const v = await this.post('/api/v1/auth/verify-email', { token });
      if (v.status !== 200) throw new Error(`verify failed: ${JSON.stringify(v.body)}`);
    }
    return this.login(email, password);
  }

  /** admin invites -> invitee accepts -> logs in */
  async addMember(admin: Actor, roleKey: 'vendor_admin' | 'vendor_staff' | 'vendor_viewer', email?: string): Promise<Actor> {
    const to = email ?? `${roleKey.replace('vendor_', '')}-${newId().slice(-8)}@acme.test`;
    const inv = await this.post('/api/v1/invitations', { email: to, roleKey }, admin);
    if (inv.status !== 201) throw new Error(`invite failed: ${inv.status} ${JSON.stringify(inv.body)}`);
    const token = this.t.mailer.last('invitation', to)!.data.token;
    const password = 'staff-password-123';
    const acc = await this.post('/api/v1/invitations/accept', { token, fullName: 'Team Member', password });
    if (acc.status !== 201) throw new Error(`accept failed: ${acc.status} ${JSON.stringify(acc.body)}`);
    return this.login(to, password);
  }

  /** Inserts a platform admin directly (the only way they exist) and signs in. */
  async platformAdmin(roleKey: 'platform_admin' | 'platform_support' = 'platform_admin'): Promise<Actor> {
    const { createPlatformUser } = await import('@oms/database');
    const { hashPassword } = await import('@oms/auth');
    const email = `${roleKey}-${newId().slice(-8)}@platform.test`;
    const password = 'platform-password-123';
    await this.t.database!.pg.exec('RESET ROLE');
    await createPlatformUser(drizzle(this.t.database!.pg, { schema }) as never, { email, fullName: 'Platform Person', passwordHash: await hashPassword(password), roleKey });
    await this.t.database!.pg.exec('SET ROLE oms_app');
    return this.login(email, password);
  }
}

export const clientFor = (t: TestApp): Client => new Client(t);

/** Smallest valid image bytes for upload tests. */
export const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
export const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
