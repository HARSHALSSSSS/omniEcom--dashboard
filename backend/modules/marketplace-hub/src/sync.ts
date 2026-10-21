import { and, desc, eq, gte, schema, withVendor, type Tx } from '@oms/database';
import { AppError } from '@oms/shared';
import { hasCapability, type MarketplaceConnector } from '@oms/marketplace-core';
import { getAccountRow } from '@oms/mod-marketplace-accounts';
import { enqueueSyncJob, type SyncJobRow, type SyncType } from '@oms/mod-sync';
import type { Container } from '@oms/module-kit';
import { WINDOW_HOURS, progressOf } from './queries';

const S = schema.syncJobs;
export type SyncScope = 'orders' | 'inventory' | 'listings' | 'catalog';
export const ALL_SCOPES: SyncScope[] = ['orders', 'inventory', 'listings', 'catalog'];

/** scope -> the sync job type that runs it, and the capability the connector must have */
const PLAN: Record<SyncScope, { type: SyncType; supported: (c: MarketplaceConnector) => boolean; why: string }> = {
  orders: { type: 'orders', supported: (c) => hasCapability(c, 'orders.fetch'), why: 'does not support importing orders' },
  inventory: { type: 'inventory', supported: (c) => hasCapability(c, 'inventory.push'), why: 'does not support pushing stock' },
  listings: { type: 'listing_status', supported: (c) => hasCapability(c, 'listings.statusLookup'), why: 'does not support checking listing status' },
  catalog: { type: 'catalog_import', supported: (c) => hasCapability(c, 'catalog.import'), why: 'does not support importing the catalogue' },
};

/** the account must be connected and unpaused before any job is queued */
export async function assertSyncable(tx: Tx, vendorId: string, accountId: string) {
  const a = await getAccountRow(tx, vendorId, accountId);
  if (a.status !== 'active') throw new AppError('ACCOUNT_NOT_CONNECTED', a.status === 'paused' ? 'Marketplace account is paused' : undefined, { details: { status: a.status } });
  return a;
}

/**
 * Queues the sync jobs for the requested scopes (default: all the connector supports). A job of the same type that is still queued is reused
 * instead of piling up another one; unsupported scopes are reported as skipped with the reason.
 */
export async function startSync(c: Container, vendorId: string, account: { id: string; marketplace: string; displayName: string }, scopes: SyncScope[] | undefined, requestedBy: string | null) {
  const connector = c.connectors.get(account.marketplace);
  const wanted = scopes ?? ALL_SCOPES;
  const jobs: Array<{ scope: SyncScope; job: SyncJobRow; created: boolean }> = [];
  const skipped: Array<{ scope: SyncScope; reason: string }> = [];
  for (const scope of wanted) {
    const plan = PLAN[scope];
    if (!plan.supported(connector)) { skipped.push({ scope, reason: `${connector.displayName} ${plan.why}` }); continue; }
    const r = await enqueueSyncJob(c, {
      vendorId, accountId: account.id, type: plan.type, trigger: 'manual', coalesce: true, idempotencyKey: `hub-${scope}:${account.id}:${Date.now()}`, requestedBy,
    });
    jobs.push({ scope, job: r.job, created: r.created });
  }
  if (!jobs.length) throw new AppError('CAPABILITY_UNSUPPORTED', `${connector.displayName} supports none of the requested sync scopes`, { details: { marketplace: connector.code, skipped } });
  return { accountId: account.id, jobs, skipped };
}

/** combined progress of everything running for an account, plus the latest job of each type from the last 24 hours */
export async function syncStatus(c: Container, vendorId: string, accountId: string) {
  return withVendor(c.database.db, vendorId, async (tx) => {
    const a = await getAccountRow(tx, vendorId, accountId);
    const since = new Date(Date.now() - WINDOW_HOURS * 3_600_000);
    const recent = await tx.select().from(S).where(and(eq(S.vendorId, vendorId), eq(S.marketplaceAccountId, accountId), gte(S.createdAt, since))).orderBy(desc(S.createdAt)).limit(200);
    const active = recent.filter((j) => ['queued', 'running', 'retrying'].includes(j.status)).reverse();
    const latestByType = new Map<string, SyncJobRow>();
    for (const j of recent) if (!latestByType.has(j.type)) latestByType.set(j.type, j);
    const latest = [...latestByType.values()];
    const failing = latest.some((j) => ['failed', 'dead_lettered'].includes(j.status));
    const state = a.status === 'paused' ? 'paused' as const : active.length ? 'syncing' as const : failing || a.connectionStatus === 'error' ? 'error' as const : 'idle' as const;
    return { a, state, progress: progressOf(active), active, latest };
  });
}
