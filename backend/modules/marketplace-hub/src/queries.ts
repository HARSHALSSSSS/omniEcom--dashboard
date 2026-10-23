import { and, desc, eq, gte, inArray, schema, sql, type Tx } from '@oms/database';
import { enabledCapabilities, type MarketplaceConnector } from '@oms/marketplace-core';
import type { ConnectorRegistry } from '@oms/marketplace-core';
import { connectorProfile, rateLimitRemainingPct } from '@oms/mod-marketplace-connectors';
import type { SyncJobRow } from '@oms/mod-sync';
import { capabilityTags, daysLeft, frictionPoints, healthScore, healthStatus, riskLevel, successRate, type HealthStatus, type JobCount } from './health';

const A = schema.marketplaceAccounts;
const Z = schema.marketplaceAuthorizations;
const L = schema.marketplaceListings;
const O = schema.orders;
const S = schema.syncJobs;

export const WINDOW_HOURS = 24;
/** orders that still need work in the warehouse */
const OPEN_ORDER_STATUSES = ['new', 'confirmed', 'picking', 'packed', 'ready_to_dispatch'];
const ACTIVE_JOB = ['queued', 'running', 'retrying'];
const PROBLEM_LISTING = ['rejected', 'correction_required'];
/** a quantity that has been waiting this long means the stock push is not keeping up */
const STALE_STOCK_MS = 60 * 60_000;

export type AccountRow = typeof A.$inferSelect;
export type AuthRow = typeof Z.$inferSelect;

export interface AccountStats {
  listingsByStatus: Record<string, number>;
  syncedItems: number;
  staleStock: number;
  pendingOrders: number;
  jobCounts: JobCount[];
  activeJobs: SyncJobRow[];
  latestFailure: SyncJobRow | null;
}

const empty = (): AccountStats => ({ listingsByStatus: {}, syncedItems: 0, staleStock: 0, pendingOrders: 0, jobCounts: [], activeJobs: [], latestFailure: null });

/** every number of the account cards in six grouped queries (never one query per account) */
export async function gatherStats(tx: Tx, vendorId: string, accountIds: string[], now: Date): Promise<Map<string, AccountStats>> {
  const out = new Map<string, AccountStats>(accountIds.map((id) => [id, empty()]));
  if (!accountIds.length) return out;
  const since = new Date(now.getTime() - WINDOW_HOURS * 3_600_000);
  const stale = new Date(now.getTime() - STALE_STOCK_MS);

  const listings = await tx
    .select({
      account: L.marketplaceAccountId, status: L.status, n: sql<number>`count(*)::int`,
      synced: sql<number>`count(*) filter (where ${L.quantityPushedAt} is not null and ${L.quantityDirty} = false)::int`,
      stale: sql<number>`count(*) filter (where ${L.quantityDirty} = true and ${L.quantityDirtyAt} < ${stale.toISOString()}::timestamptz)::int`,
    })
    .from(L).where(and(eq(L.vendorId, vendorId), inArray(L.marketplaceAccountId, accountIds))).groupBy(L.marketplaceAccountId, L.status);
  for (const r of listings) {
    const s = out.get(r.account)!;
    s.listingsByStatus[r.status] = r.n;
    s.syncedItems += r.synced;
    s.staleStock += r.stale;
  }

  const orders = await tx
    .select({ account: O.marketplaceAccountId, n: sql<number>`count(*)::int` })
    .from(O).where(and(eq(O.vendorId, vendorId), inArray(O.marketplaceAccountId, accountIds), inArray(O.status, OPEN_ORDER_STATUSES))).groupBy(O.marketplaceAccountId);
  for (const r of orders) out.get(r.account)!.pendingOrders = r.n;

  const jobs = await tx
    .select({ account: S.marketplaceAccountId, type: S.type, status: S.status, n: sql<number>`count(*)::int`, done: sql<number>`coalesce(sum((${S.progress}->>'done')::int), 0)::int` })
    .from(S).where(and(eq(S.vendorId, vendorId), inArray(S.marketplaceAccountId, accountIds), gte(S.createdAt, since))).groupBy(S.marketplaceAccountId, S.type, S.status);
  for (const r of jobs) out.get(r.account!)!.jobCounts.push({ type: r.type, status: r.status, n: r.n, done: r.done });

  const active = await tx.select().from(S).where(and(eq(S.vendorId, vendorId), inArray(S.marketplaceAccountId, accountIds), inArray(S.status, ACTIVE_JOB))).orderBy(S.createdAt).limit(500);
  for (const j of active) out.get(j.marketplaceAccountId!)?.activeJobs.push(j);

  const failed = await tx.select().from(S)
    .where(and(eq(S.vendorId, vendorId), inArray(S.marketplaceAccountId, accountIds), inArray(S.status, ['failed', 'dead_lettered']), gte(S.createdAt, since))).orderBy(desc(S.createdAt)).limit(500);
  for (const j of failed) { const s = out.get(j.marketplaceAccountId!); if (s && !s.latestFailure) s.latestFailure = j; }
  return out;
}

/** percent done across the running jobs; null when no job runs or none knows its total */
export function progressOf(jobs: SyncJobRow[]): number | null {
  const running = jobs.filter((j) => j.progress.total > 0);
  if (!running.length) return null;
  const total = running.reduce((n, j) => n + j.progress.total, 0);
  return Math.min(100, Math.round((running.reduce((n, j) => n + Math.min(j.progress.done, j.progress.total), 0) / total) * 100));
}

const safeConnector = (registry: ConnectorRegistry, code: string): MarketplaceConnector | null => { try { return registry.get(code); } catch { return null; } };

export function buildCard(a: AccountRow, z: AuthRow | null, stats: AccountStats, registry: ConnectorRegistry, now: Date) {
  const connector = safeConnector(registry, a.marketplace);
  const profile = connector ? connectorProfile(connector) : null;
  const enabled = connector ? enabledCapabilities(connector) : [];
  const token = { status: z?.status ?? null, expiresAt: z?.accessTokenExpiresAt ?? null, autoRenews: Boolean(connector?.capabilities.auth.refreshable) };
  const rate = successRate(stats.jobCounts);
  const score = healthScore({ connectionStatus: a.connectionStatus, successRate: rate.rate, token }, now);
  const status: HealthStatus = healthStatus({ accountStatus: a.status, connectionStatus: a.connectionStatus, score });
  const problemListings = PROBLEM_LISTING.reduce((n, k) => n + (stats.listingsByStatus[k] ?? 0), 0);
  const interval = connector?.polling?.orders?.intervalSeconds;
  const syncState = a.status === 'paused' ? 'paused' as const : stats.activeJobs.length ? 'syncing' as const : (a.connectionStatus === 'error' || stats.latestFailure) && a.status !== 'pending_authorization' ? 'error' as const : 'idle' as const;
  return {
    id: a.id, marketplace: a.marketplace, name: a.displayName, connectorName: connector?.displayName ?? a.marketplace, category: profile?.category ?? 'marketplace', logoKey: profile?.logoKey ?? a.marketplace,
    accountIdentifier: a.externalAccountId, mode: a.mode as 'live' | 'sandbox', region: a.region, status, accountStatus: a.status as never, connectionStatus: a.connectionStatus as never,
    authType: z?.authType ?? connector?.capabilities.auth.type ?? 'unknown', connectedAt: z ? z.createdAt.toISOString() : null,
    lastSyncAt: a.lastSyncedAt ? a.lastSyncedAt.toISOString() : null,
    nextSyncAt: a.status === 'active' && a.lastSyncedAt && interval ? new Date(a.lastSyncedAt.getTime() + interval * 1000).toISOString() : null,
    syncState, syncProgress: progressOf(stats.activeJobs),
    stats: { activeListings: stats.listingsByStatus.active ?? 0, pendingOrders: stats.pendingOrders, syncedInventoryItems: stats.syncedItems, errorCount: problemListings + rate.failed },
    health: {
      pulseScore: score, riskLevel: riskLevel(score),
      frictionPoints: frictionPoints({
        accountStatus: a.status, connectionStatus: a.connectionStatus, lastFailureMessage: a.lastFailureMessage, lastFailureAt: a.lastFailureAt, token, failedJobs: rate.failed,
        lastJobError: stats.latestFailure?.error?.message ?? null, problemListings, staleStockListings: stats.staleStock,
      }, now),
      rateLimitRemainingPct: connector && a.status === 'active' ? rateLimitRemainingPct(a.id, connector.capabilities.limits) : null,
      tokenExpiresInDays: daysLeft(token.expiresAt, now), tokenExpiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
      syncSuccessRate24h: rate.rate, syncRuns24h: { finished: rate.finished, failed: rate.failed },
    },
    capabilities: enabled, capabilityTags: capabilityTags(enabled), implementation: connector?.implementation ?? 'planned', version: a.version,
  };
}

export type AccountCard = ReturnType<typeof buildCard>;

export async function loadAccounts(tx: Tx, vendorId: string, o: { id?: string; marketplace?: string; q?: string } = {}) {
  return tx
    .select({ a: A, z: Z })
    .from(A)
    .leftJoin(Z, and(eq(Z.marketplaceAccountId, A.id), eq(Z.vendorId, A.vendorId)))
    .where(and(eq(A.vendorId, vendorId), o.id ? eq(A.id, o.id) : undefined, o.marketplace ? eq(A.marketplace, o.marketplace) : undefined, o.q ? sql`(${A.displayName} ILIKE ${`%${o.q.replace(/[\\%_]/g, '\\$&')}%`} OR ${A.externalAccountId} ILIKE ${`%${o.q.replace(/[\\%_]/g, '\\$&')}%`})` : undefined))
    .orderBy(A.createdAt)
    .limit(200);
}

export async function cards(tx: Tx, vendorId: string, registry: ConnectorRegistry, now: Date, o: { id?: string; marketplace?: string; q?: string } = {}) {
  const rows = await loadAccounts(tx, vendorId, o);
  const stats = await gatherStats(tx, vendorId, rows.map((r) => r.a.id), now);
  return rows.map((r) => ({ row: r, stats: stats.get(r.a.id)!, card: buildCard(r.a, r.z, stats.get(r.a.id)!, registry, now) }));
}

export const summarize = (list: Array<{ status: HealthStatus }>) => ({
  total: list.length, healthy: list.filter((c) => c.status === 'healthy').length, warning: list.filter((c) => c.status === 'warning').length,
  error: list.filter((c) => c.status === 'error').length, paused: list.filter((c) => c.status === 'paused').length,
});
