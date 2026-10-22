import { and, eq, schema, sql, withVendor, type Tx } from '@oms/database';
import { requireCapability, type NormalizedReturn } from '@oms/marketplace-core';
import { AppError, Errors } from '@oms/shared';
import { enqueueSyncJob, executeSyncJob, type SyncRunner } from '@oms/mod-sync';
import { systemOpCtx, type Container, type JobHandler, type OpCtx } from '@oms/module-kit';
import { RETURN_REASONS } from './domain';
import { cancelReturn, createReturn, decideReturn } from './service';

const A = schema.marketplaceAccounts;
const R = schema.returnOrders;

/** how far back the first sync of an account looks, and the overlap kept on every later one (a failed item is fetched again) */
export const RETURNS_LOOKBACK_DAYS = 30;
const OVERLAP_MS = 15 * 60_000;

// ------------------------------------------------------------------------------------------------
// vocabulary: marketplace words -> ours
// ------------------------------------------------------------------------------------------------
const REASON_PATTERNS: Array<[RegExp, string]> = [
  [/(wrong|incorrect|different).?(item|product|article)/, 'wrong_item_sent'],
  [/colou?r/, 'color_mismatch'],
  [/size|fit/, 'size_fit'],
  [/damag|broken|torn|leak/, 'damaged_in_transit'],
  [/defect|not.?work|faulty|malfunction|quality/, 'defective'],
  [/not.?as.?(described|shown|pictured)|description/, 'not_as_described'],
  [/chang(e|ed).?(of.?)?mind|no.?longer|don.?t.?(want|need|like)|unwanted/, 'changed_mind'],
  [/late|delay/, 'late_delivery'],
];

/** the reason code of our catalogue for what the marketplace said (`other` when it is not recognised; the raw words are kept as the reason text) */
export function mapReason(raw: string | undefined): string {
  const word = (raw ?? '').trim().toLowerCase();
  if (!word) return 'other';
  if (RETURN_REASONS.some((r) => r.code === word)) return word;
  return REASON_PATTERNS.find(([re]) => re.test(word))?.[1] ?? 'other';
}

/** `withdrawn`: the customer took the request back, `rejected`: the marketplace turned it down; anything else keeps its course in our own flow */
export function marketplaceDecision(status: string): 'withdrawn' | 'rejected' | null {
  const s = status.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (/^(cancel+ed|withdrawn|closed_by_customer|customer_cancel+ed|revoked)$/.test(s)) return 'withdrawn';
  if (/^(rejected|declined|denied)$/.test(s)) return 'rejected';
  return null;
}

// ------------------------------------------------------------------------------------------------
// import one marketplace return
// ------------------------------------------------------------------------------------------------
export type ImportOutcome = 'created' | 'duplicate' | 'cancelled' | 'rejected' | 'unmatched';

/**
 * Idempotent upsert by the marketplace's return id: an unknown id opens a `marketplace` return linked to the order it belongs to
 * (all lines of the order unless the marketplace names them); a known id is left alone, except that a withdrawn / rejected request
 * closes the return while nobody has handled it yet. An order we have not imported is `unmatched` (sync the orders first).
 */
export async function importMarketplaceReturn(tx: Tx, ctx: OpCtx, account: { marketplace: string; displayName: string }, r: NormalizedReturn): Promise<{ outcome: ImportOutcome; returnId?: string }> {
  const decision = marketplaceDecision(r.status);
  const [existing] = await tx.select().from(R).where(and(eq(R.vendorId, ctx.vendorId), eq(R.marketplaceReturnId, r.externalReturnId)));
  if (existing) {
    if (decision === 'withdrawn' && ['requested', 'approved', 'pickup_scheduled'].includes(existing.status)) { await cancelReturn(tx, ctx, existing.id, `Withdrawn on ${account.displayName}`); return { outcome: 'cancelled', returnId: existing.id }; }
    if (decision === 'rejected' && existing.status === 'requested') { await decideReturn(tx, ctx, existing.id, 'reject', `Rejected on ${account.displayName}`); return { outcome: 'rejected', returnId: existing.id }; }
    return { outcome: 'duplicate', returnId: existing.id };
  }
  // a request that is already withdrawn / rejected on the marketplace when we first see it never becomes a return
  if (decision) return { outcome: 'duplicate' };

  const [order] = await tx.select().from(schema.orders).where(and(eq(schema.orders.vendorId, ctx.vendorId), eq(schema.orders.marketplace, account.marketplace), eq(schema.orders.externalOrderId, r.externalOrderId)));
  if (!order) return { outcome: 'unmatched' };
  const lines = await tx.select().from(schema.orderItems).where(and(eq(schema.orderItems.vendorId, ctx.vendorId), eq(schema.orderItems.orderId, order.id)));
  const wanted: Array<{ orderItemId: string; quantity: number }> = [];
  if (r.items && r.items.length > 0) {
    for (const it of r.items) {
      const line = lines.find((l) => (it.externalItemId && l.externalItemId === it.externalItemId) || (it.sku && l.sku === it.sku));
      if (!line) throw new AppError('CONFLICT', `The returned item ${it.externalItemId ?? it.sku ?? '?'} is not on the order`, { details: { rule: 'unknown_return_item', externalOrderId: r.externalOrderId } });
      const seen = wanted.find((w) => w.orderItemId === line.id);
      if (seen) seen.quantity += it.quantity; else wanted.push({ orderItemId: line.id, quantity: Math.max(1, Math.round(it.quantity)) });
    }
  } else for (const l of lines) wanted.push({ orderItemId: l.id, quantity: l.quantity });
  if (wanted.length === 0) throw new AppError('CONFLICT', 'The order has no items to return', { details: { rule: 'no_items', externalOrderId: r.externalOrderId } });

  const created = await createReturn(tx, ctx, {
    orderId: order.id, source: 'marketplace', reasonCode: mapReason(r.reason), reasonText: r.reason && !RETURN_REASONS.some((x) => x.code === r.reason) ? r.reason : null,
    marketplaceReturnId: r.externalReturnId, items: wanted, notes: `Imported from ${account.displayName}`, marketplaceAsserted: true,
  });
  return { outcome: 'created', returnId: created.id };
}

// ------------------------------------------------------------------------------------------------
// the sync job
// ------------------------------------------------------------------------------------------------
/** pulls the returns the marketplace changed since the watermark into the ledger: page by page, one transaction per return, progress on the job */
const returnsRunner: SyncRunner = async (ctx) => {
  const { c, vendorId, accountId, host } = ctx;
  if (!accountId) throw new AppError('BAD_REQUEST', 'returns sync needs an account');
  const db = c.database.db;
  const account = await withVendor(db, vendorId, async (tx) => (await tx.select().from(A).where(and(eq(A.id, accountId), eq(A.vendorId, vendorId))))[0]);
  if (!account) throw new AppError('NOT_FOUND', 'Marketplace account not found', { details: { resource: 'marketplace_account', id: accountId } });
  const connector = c.connectors.get(account.marketplace);
  requireCapability(connector, 'returns.fetch');
  if (typeof connector.fetchReturns !== 'function') throw new AppError('UPSTREAM_ERROR', `${connector.displayName} has no returns import`, { details: { kind: 'unsupported', code: 'returns_fetch_unsupported' } });

  const state = account.syncState as { returnsSince?: string };
  const startedAt = new Date();
  const explicit = typeof ctx.payload.since === 'string' ? new Date(ctx.payload.since) : null;
  const since = explicit ?? (state.returnsSince ? new Date(state.returnsSince) : new Date(startedAt.getTime() - RETURNS_LOOKBACK_DAYS * 86_400_000));
  const opctx = systemOpCtx(c, vendorId, 'returns-sync');
  const stats = { fetched: 0, created: 0, duplicates: 0, cancelled: 0, rejected: 0, unmatched: 0, failed: 0 };
  let cursor: string | null = ((ctx.job.cursor as { cursor?: string | null } | null)?.cursor) ?? null;
  await ctx.log('info', `fetching returns changed since ${since.toISOString()}`);

  do {
    const page = await host.run(vendorId, accountId, (conn, cctx) => conn.fetchReturns!(cctx, { since, cursor }));
    for (const ret of page.items) {
      stats.fetched++;
      try {
        const res = await withVendor(db, vendorId, (tx) => importMarketplaceReturn(tx, opctx, account, ret));
        if (res.outcome === 'created') stats.created++;
        else if (res.outcome === 'duplicate') stats.duplicates++;
        else if (res.outcome === 'cancelled') stats.cancelled++;
        else if (res.outcome === 'rejected') stats.rejected++;
        else {
          stats.unmatched++; stats.failed++;
          ctx.addFailure({ ref: ret.externalReturnId, code: 'ORDER_NOT_IMPORTED', message: `Order ${ret.externalOrderId} has not been imported yet; sync the orders, then sync returns again` });
        }
      } catch (e) {
        // one bad return must not block the rest; infrastructure errors (not AppError) abort and the job retries
        if (!(e instanceof AppError)) throw e;
        stats.failed++;
        ctx.addFailure({ ref: ret.externalReturnId, code: e.code, message: e.message });
      }
    }
    cursor = page.nextCursor;
    await ctx.setCursor(cursor ? { cursor } : null);
    await ctx.progress({ done: stats.fetched, failed: stats.failed });
  } while (cursor);

  // advance the watermark only when every return was handled: failed ones are fetched again by the overlap window next time
  if (stats.failed === 0) {
    const next = new Date(startedAt.getTime() - OVERLAP_MS);
    await withVendor(db, vendorId, (tx) => tx.update(A).set({ syncState: sql`${A.syncState} || ${JSON.stringify({ returnsSince: next.toISOString() })}::jsonb` }).where(eq(A.id, accountId)));
  }
  return { stats };
};

export const returnJobHandlers: JobHandler[] = [{ queue: 'syncMarketplace', name: 'sync.returns', handle: (env, c) => executeSyncJob(c, env, returnsRunner) }];

// ------------------------------------------------------------------------------------------------
// the request: one job per account whose connector can fetch returns
// ------------------------------------------------------------------------------------------------
export type SkipReason = 'returns_fetch_not_supported' | 'connector_not_ready' | 'connector_unavailable';
export interface ReturnsSyncJobInfo { accountId: string; accountName: string; marketplace: string; jobId: string; status: string; alreadyQueued: boolean }
export interface ReturnsSyncSkipped { accountId: string; accountName: string; marketplace: string; reason: SkipReason }

const safeConnector = (c: Container, code: string) => { try { return c.connectors.get(code); } catch { return undefined; } };

/** queues the returns import of every active account that can fetch returns (or of one account); an account that cannot is reported, not hidden */
export async function requestReturnsSync(c: Container, vendorId: string, o: { accountId?: string; requestedBy?: string | null; since?: string } = {}): Promise<{ jobs: ReturnsSyncJobInfo[]; skipped: ReturnsSyncSkipped[] }> {
  const accounts = await withVendor(c.database.db, vendorId, (tx) =>
    tx.select().from(A).where(and(eq(A.vendorId, vendorId), eq(A.status, 'active'), o.accountId ? eq(A.id, o.accountId) : undefined)).orderBy(A.createdAt, A.id));
  if (o.accountId && accounts.length === 0) throw Errors.notFound('Marketplace account', o.accountId);
  const jobs: ReturnsSyncJobInfo[] = [];
  const skipped: ReturnsSyncSkipped[] = [];
  for (const a of accounts) {
    const info = { accountId: a.id, accountName: a.displayName, marketplace: a.marketplace };
    const connector = safeConnector(c, a.marketplace);
    if (!connector) { skipped.push({ ...info, reason: 'connector_unavailable' }); continue; }
    if (connector.implementation === 'planned') { skipped.push({ ...info, reason: 'connector_not_ready' }); continue; }
    if (!connector.capabilities.returns.fetch || typeof connector.fetchReturns !== 'function') { skipped.push({ ...info, reason: 'returns_fetch_not_supported' }); continue; }
    const { job, created } = await enqueueSyncJob(c, {
      vendorId, accountId: a.id, type: 'returns', trigger: o.requestedBy ? 'manual' : 'event', coalesce: true, idempotencyKey: `returns:${a.id}:${Date.now()}`,
      payload: o.since ? { since: o.since } : {}, requestedBy: o.requestedBy ?? null,
    });
    jobs.push({ ...info, jobId: job.id, status: job.status, alreadyQueued: !created });
  }
  return { jobs, skipped };
}
