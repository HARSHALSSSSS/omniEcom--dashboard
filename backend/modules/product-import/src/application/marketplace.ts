import { and, desc, eq, inArray, schema, sql, withVendor, type Db, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import type { Container, JobHandler } from '@oms/module-kit';
import { enabledCapabilities, requireCapability, type NormalizedProduct } from '@oms/marketplace-core';
import { jobEffects } from '@oms/mod-catalog';
import { ConnectorHost } from '@oms/mod-marketplace-connectors';
import { LIMITS, TARGET_BY_KEY } from '../domain/catalogue';
import { DEFAULT_SETTINGS } from '../domain/settings';
import { appendActivity } from './activity';
import { I, R, S, type SessionRow } from './store';

const A = schema.marketplaceAccounts;
const PAGE = 100;
export const MARKETPLACE_FETCH_JOB = 'product-import.marketplace-fetch';

/** the standard fields a marketplace product is mapped to; the "columns" of such a session are their labels */
const FIELDS = ['sku', 'title', 'description', 'brand', 'category', 'sellingPrice', 'mrp', 'stock', 'barcode', 'imageUrl', 'additionalImageUrls'] as const;
const label = (k: (typeof FIELDS)[number]): string => TARGET_BY_KEY.get(k)!.label;
const HEADERS = FIELDS.map(label);
const MAPPING: Record<string, string> = Object.fromEntries(FIELDS.map((k) => [k, label(k)]));

/** one remote product as a row of the standard columns (prices stay in paise: the session's currency unit is "paise") */
export function toRawRow(p: NormalizedProduct): Record<string, string> {
  const images = p.imageUrls ?? [];
  const cells: Record<(typeof FIELDS)[number], string> = {
    sku: p.externalSku, title: p.title, description: p.description ?? '', brand: p.brand ?? '', category: p.category?.name ?? p.category?.id ?? '',
    sellingPrice: p.priceMinor === undefined ? '' : String(p.priceMinor), mrp: p.mrpMinor === undefined ? '' : String(p.mrpMinor), stock: p.quantity === undefined ? '' : String(p.quantity),
    barcode: p.barcode ?? '', imageUrl: images[0] ?? '', additionalImageUrls: images.slice(1).join('|'),
  };
  return Object.fromEntries(FIELDS.map((k) => [label(k), cells[k].slice(0, LIMITS.maxCellChars)]));
}

type AccountRow = typeof A.$inferSelect;
const connectionOf = (a: AccountRow): 'connected' | 'attention' | 'disconnected' =>
  a.status === 'pending_authorization' ? 'disconnected' : a.status === 'active' ? (a.connectionStatus === 'error' || a.connectionStatus === 'disconnected' ? 'attention' : 'connected') : 'attention';

export async function marketplaceSources(tx: Tx, c: Container, vendorId: string) {
  const accounts = (await tx.select().from(A).where(eq(A.vendorId, vendorId))).sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
  if (accounts.length === 0) return { items: [] };
  const ids = accounts.map((a) => a.id);
  const [progress] = await tx.select({ counts: schema.onboardingProgress.catalogCounts }).from(schema.onboardingProgress).where(eq(schema.onboardingProgress.vendorId, vendorId));
  const imported = await tx.select({ id: schema.importedProducts.marketplaceAccountId, n: sql<number>`count(*)::int` }).from(schema.importedProducts)
    .where(and(eq(schema.importedProducts.vendorId, vendorId), inArray(schema.importedProducts.marketplaceAccountId, ids))).groupBy(schema.importedProducts.marketplaceAccountId);
  const jobs = await tx.select({ id: schema.syncJobs.marketplaceAccountId, at: sql<Date | null>`max(${schema.syncJobs.finishedAt})` }).from(schema.syncJobs)
    .where(and(eq(schema.syncJobs.vendorId, vendorId), eq(schema.syncJobs.type, 'catalog_import'), eq(schema.syncJobs.status, 'succeeded'), inArray(schema.syncJobs.marketplaceAccountId, ids))).groupBy(schema.syncJobs.marketplaceAccountId);
  const sessions = await tx.select({ inputKey: S.inputKey, at: sql<Date | null>`max(${S.finishedAt})` }).from(S)
    .where(and(eq(S.vendorId, vendorId), eq(S.source, 'marketplace'), inArray(S.status, ['committed', 'partially_committed']))).groupBy(S.inputKey);
  return {
    items: accounts.map((a) => {
      const connector = c.connectors.has(a.marketplace) ? c.connectors.get(a.marketplace) : null;
      const connection = connectionOf(a);
      const times = [jobs.find((j) => j.id === a.id)?.at, sessions.find((s) => s.inputKey === `marketplace:${a.id}`)?.at].filter((x): x is Date => Boolean(x)).map((x) => new Date(x).getTime());
      return {
        accountId: a.id, marketplace: a.marketplace, displayName: a.displayName, mode: a.mode, connection,
        productsAvailable: progress?.counts?.[a.id]?.count ?? null,
        importedProducts: imported.find((i) => i.id === a.id)?.n ?? 0,
        lastImportAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
        canImport: connection === 'connected' && a.status === 'active' && Boolean(connector && enabledCapabilities(connector).includes('catalog.import')),
      };
    }),
  };
}

async function insertRows(tx: Tx, vendorId: string, sessionId: string, items: NormalizedProduct[], firstRow: number): Promise<void> {
  for (let i = 0; i < items.length; i += 500) {
    await tx.insert(R).values(items.slice(i, i + 500).map((p, k) => ({ vendorId, sessionId, rowNumber: firstRow + i + k, raw: toRawRow(p) })));
  }
}

const readyUpdate = (rows: number) => ({
  status: 'analyzed' as const, headers: HEADERS, mapping: MAPPING, rowCount: rows, processedRows: 0, validRows: 0, warningRows: 0, errorRows: 0, ignoredRows: 0, committedRows: 0,
  failureMessage: null, startedAt: null, finishedAt: null,
});

export interface FromMarketplaceResult { session: SessionRow; created: boolean; queued: boolean }

/**
 * Builds an import session from the live catalogue of a connected marketplace account. A catalogue that fits one page is read inside the
 * request (session `analyzed`); a larger one is read by a job (session stays `uploaded` with a growing `processed` counter until it is `analyzed`).
 */
export async function startFromMarketplace(db: Db, c: Container, vendorId: string, actorId: string | null, correlationId: string, accountId: string): Promise<FromMarketplaceResult> {
  const begun = await withVendor(db, vendorId, async (tx) => {
    const [acc] = await tx.select().from(A).where(and(eq(A.id, accountId), eq(A.vendorId, vendorId))).for('update'); // serialises concurrent starts for one account
    if (!acc) throw Errors.notFound('Marketplace account', accountId);
    const connector = c.connectors.has(acc.marketplace) ? c.connectors.get(acc.marketplace) : null;
    if (!connector) throw new AppError('CONFLICT', 'This marketplace is not available yet', { details: { rule: 'connector_missing' } });
    requireCapability(connector, 'catalog.import');
    if (acc.status !== 'active') throw new AppError('ACCOUNT_NOT_CONNECTED', undefined, { details: { status: acc.status } });
    const key = `marketplace:${accountId}`;
    const [running] = await tx.select().from(S).where(and(eq(S.vendorId, vendorId), eq(S.source, 'marketplace'), eq(S.inputKey, key), inArray(S.status, ['uploaded', 'validating', 'committing']))).orderBy(desc(S.createdAt)).limit(1);
    if (running) return { session: running, created: false, name: acc.displayName };
    const [counts] = await tx.select({ counts: schema.onboardingProgress.catalogCounts }).from(schema.onboardingProgress).where(eq(schema.onboardingProgress.vendorId, vendorId));
    const [row] = await tx.insert(S).values({
      vendorId, source: 'marketplace', fileName: `${acc.displayName} catalog`.slice(0, 255), fileSizeBytes: 0, inputKey: key, status: 'uploaded', requestedBy: actorId,
      settings: { ...DEFAULT_SETTINGS, currencyUnit: 'paise' }, startedAt: new Date(), stats: counts?.counts?.[accountId] ? { expectedRows: counts.counts[accountId]!.count } : {},
    }).returning();
    await appendActivity(tx, row!.id, [{ kind: 'stage', message: `Reading the ${acc.displayName} catalogue` }]);
    return { session: row!, created: true, name: acc.displayName };
  });
  if (!begun.created) return { session: begun.session, created: false, queued: begun.session.status === 'uploaded' };
  const sessionId = begun.session.id;
  try {
    const page = await new ConnectorHost(c).run(vendorId, accountId, async (conn, ctx) => { requireCapability(conn, 'catalog.import'); return conn.importProducts!(ctx, { limit: LIMITS.marketplaceInlineProducts }); });
    if (page.nextCursor) {
      await c.queues.enqueue('heavy', MARKETPLACE_FETCH_JOB, { vendorId, correlationId, idempotencyKey: `${MARKETPLACE_FETCH_JOB}-${sessionId}`, data: { sessionId, accountId } });
      return { session: begun.session, created: true, queued: true };
    }
    const session = await withVendor(db, vendorId, async (tx) => {
      await insertRows(tx, vendorId, sessionId, page.items, 2);
      const [row] = await tx.update(S).set({ ...readyUpdate(page.items.length), version: sql`${S.version} + 1` as never }).where(eq(S.id, sessionId)).returning();
      await appendActivity(tx, sessionId, [{ kind: 'stage', message: `Read ${page.items.length} products from ${begun.name}` }]);
      return row!;
    });
    return { session, created: true, queued: false };
  } catch (e) {
    await failFetch(db, vendorId, correlationId, sessionId, e instanceof AppError ? e.message : 'The marketplace catalogue could not be read');
    throw e;
  }
}

async function failFetch(db: Db, vendorId: string, correlationId: string, sessionId: string, message: string): Promise<void> {
  await withVendor(db, vendorId, async (tx) => {
    const [failed] = await tx.update(S).set({ status: 'failed', failureMessage: message, finishedAt: new Date() }).where(and(eq(S.id, sessionId), eq(S.status, 'uploaded'))).returning();
    if (!failed) return;
    await appendActivity(tx, sessionId, [{ kind: 'stage', message }]);
    await jobEffects(tx, { vendorId, correlationId, actorId: failed.requestedBy, jobId: sessionId }).event({ type: 'import.failed', aggregateType: 'import_session', aggregateId: sessionId, payload: { stage: 'fetch', message, created: 0, updated: 0, failed: 0 } });
  });
}

/** job: reads the whole catalogue page by page (a retry starts over: the rows of the session are dropped first) */
export const marketplaceFetchHandler: JobHandler = {
  queue: 'heavy',
  name: MARKETPLACE_FETCH_JOB,
  async handle(env, c) {
    const vendorId = env.vendorId;
    const { sessionId, accountId } = env.data as { sessionId: string; accountId: string };
    if (!vendorId) throw new Error('marketplace import without tenant');
    const db = c.database.db;
    const live = await withVendor(db, vendorId, async (tx) => { const [s] = await tx.select().from(S).where(and(eq(S.id, sessionId), eq(S.vendorId, vendorId))); return s && s.status === 'uploaded' ? s : null; });
    if (!live) return;
    try {
      await withVendor(db, vendorId, async (tx) => { await tx.delete(I).where(and(eq(I.vendorId, vendorId), eq(I.sessionId, sessionId))); await tx.delete(R).where(and(eq(R.vendorId, vendorId), eq(R.sessionId, sessionId))); });
      const host = new ConnectorHost(c);
      let cursor: string | null = null;
      let total = 0;
      let truncated = false;
      let stopped = false;
      do {
        const page: { items: NormalizedProduct[]; nextCursor: string | null } = await host.run(vendorId, accountId, async (conn, ctx) => { requireCapability(conn, 'catalog.import'); return conn.importProducts!(ctx, { cursor, limit: PAGE }); });
        const items = page.items.slice(0, LIMITS.maxRows - total);
        truncated = items.length < page.items.length || (page.nextCursor !== null && total + items.length >= LIMITS.maxRows);
        await withVendor(db, vendorId, async (tx) => {
          const [still] = await tx.select({ status: S.status }).from(S).where(eq(S.id, sessionId));
          if (still?.status !== 'uploaded') { stopped = true; return; }
          await insertRows(tx, vendorId, sessionId, items, total + 2);
          await tx.update(S).set({ rowCount: total + items.length, processedRows: total + items.length }).where(eq(S.id, sessionId));
        });
        total += items.length;
        cursor = truncated || stopped ? null : page.nextCursor;
      } while (cursor);
      if (stopped) return;
      await withVendor(db, vendorId, async (tx) => {
        const [row] = await tx.update(S).set({ ...readyUpdate(total), version: sql`${S.version} + 1` as never }).where(and(eq(S.id, sessionId), eq(S.status, 'uploaded'))).returning();
        if (row) await appendActivity(tx, sessionId, [{ kind: 'stage', message: `Read ${total} products${truncated ? ` (the first ${LIMITS.maxRows} only)` : ''}` }]);
      });
    } catch (e) {
      c.logger.error({ err: e, sessionId }, 'marketplace catalogue import failed');
      await failFetch(db, vendorId, env.correlationId, sessionId, e instanceof AppError ? e.message : 'The marketplace catalogue could not be read. Try again.');
    }
  },
};
