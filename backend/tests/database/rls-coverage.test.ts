import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Guard rail for every FUTURE migration: a table that carries a tenant (`vendor_id`) column must have row-level security
 * ENABLED and FORCED (so even the table owner is filtered) and at least one policy. Forgetting any of the three silently
 * exposes one vendor's rows to another, so the build fails instead. Runs the REAL migrations on PGlite (no Docker).
 */
const MIGRATIONS = resolve(__dirname, '../../packages/database/migrations');
let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  await db.exec('CREATE ROLE oms_app NOLOGIN');
  const journal = JSON.parse(readFileSync(resolve(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    for (const stmt of readFileSync(resolve(MIGRATIONS, `${tag}.sql`), 'utf8').split('--> statement-breakpoint')) if (stmt.trim()) await db.exec(stmt);
  }
});
afterAll(() => db.close());

describe('row-level security coverage', () => {
  it('every table with a vendor_id column has RLS enabled, forced, and at least one policy', async () => {
    const { rows } = await db.query<{ relname: string; rls: boolean; forced: boolean; policies: number }>(`
      select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p')
         and exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'vendor_id')
       order by c.relname`);
    expect(rows.length, 'expected the tenant tables to be found').toBeGreaterThan(30);
    expect(rows.filter((r) => !r.rls).map((r) => r.relname), 'tables with vendor_id but RLS not enabled').toEqual([]);
    expect(rows.filter((r) => !r.forced).map((r) => r.relname), 'tables with vendor_id but RLS not FORCED').toEqual([]);
    expect(rows.filter((r) => r.policies === 0).map((r) => r.relname), 'tables with vendor_id but no policy').toEqual([]);
  });

  it('no table has RLS enabled without a policy (that would silently deny everything)', async () => {
    const { rows } = await db.query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
         and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});

describe('global (non-tenant) tables are read-only for the runtime role', () => {
  const as = async (sql: string) => { await db.exec('RESET ROLE'); await db.exec('SET ROLE oms_app'); try { await db.exec(sql); return 'ok'; } catch (e) { return (e as Error).message; } finally { await db.exec('RESET ROLE'); } };

  it('permissions and role_permissions: SELECT only', async () => {
    expect(await as('select 1 from permissions limit 1')).toBe('ok');
    expect(await as('select 1 from role_permissions limit 1')).toBe('ok');
    expect(await as(`insert into permissions (key, module) values ('x:y', 'x')`)).toMatch(/permission denied/);
    expect(await as(`update permissions set module = 'z'`)).toMatch(/permission denied/);
    expect(await as('delete from permissions')).toMatch(/permission denied/);
    expect(await as('delete from role_permissions')).toMatch(/permission denied/);
    expect(await as('truncate role_permissions')).toMatch(/permission denied/);
  });

  it('plans and feature_flags: staff may upsert through the API, nobody can delete', async () => {
    expect(await as(`insert into feature_flags (key, description, default_enabled) values ('rls.test', 'x', false)`)).toBe('ok');
    expect(await as(`update feature_flags set default_enabled = true where key = 'rls.test'`)).toBe('ok');
    expect(await as('delete from feature_flags')).toMatch(/permission denied/);
    expect(await as('delete from plans')).toMatch(/permission denied/);
    expect(await as('truncate plans')).toMatch(/permission denied/);
  });

  it('the owner (migrations / seed) can still write all of them', async () => {
    await db.exec('RESET ROLE');
    await db.exec(`insert into permissions (key, module) values ('owner:test', 'owner') on conflict do nothing`);
    await db.exec(`delete from permissions where key = 'owner:test'`);
  });
});
