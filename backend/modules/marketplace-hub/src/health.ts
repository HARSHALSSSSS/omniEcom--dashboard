/**
 * Pure health rules of the Marketplace Hub: how a connection is scored and described. No I/O, so every number the screens show can be
 * checked in a unit test. Inputs are facts the platform really tracks (connection status, sync job outcomes, token expiry, listing
 * problems); nothing is invented. The request allowance is the live fill of the per-account limiter in the connector host (null when the account is not active).
 */
export type HealthStatus = 'healthy' | 'warning' | 'error' | 'paused';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface JobCount { type: string; status: string; n: number; done: number }

const FINISHED = ['succeeded', 'partially_failed', 'failed', 'dead_lettered'];
/** a run that reached its end counts as a success even when single items failed (those are listed in the job); failed / dead-lettered runs do not */
const SUCCESS = ['succeeded', 'partially_failed'];

export interface SuccessRate { finished: number; succeeded: number; failed: number; rate: number | null }

export function successRate(counts: JobCount[]): SuccessRate {
  const finished = counts.filter((c) => FINISHED.includes(c.status)).reduce((n, c) => n + c.n, 0);
  const succeeded = counts.filter((c) => SUCCESS.includes(c.status)).reduce((n, c) => n + c.n, 0);
  return { finished, succeeded, failed: finished - succeeded, rate: finished === 0 ? null : Math.round((succeeded / finished) * 1000) / 10 };
}

const CONNECTION_SCORE: Record<string, number> = { connected: 100, degraded: 60, unknown: 50, disconnected: 0, error: 0 };

/** `autoRenews`: the connector refreshes the access token by itself, so its routine expiry is not a problem (only a failed refresh is) */
export interface TokenFacts { status: string | null; expiresAt: Date | null; autoRenews: boolean }

/** days left on the access token; null when it does not expire (static keys, permanent tokens) */
export const daysLeft = (expiresAt: Date | null, now: Date): number | null => (expiresAt ? Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000) : null);

/** 0-100: an expired / revoked authorization is 0, a token about to expire is penalised, a token that never expires is fine */
export function tokenHealth(t: TokenFacts, now: Date): number {
  if (t.status && ['expired', 'revoked', 'error'].includes(t.status)) return 0;
  if (t.autoRenews) return 100;
  const d = daysLeft(t.expiresAt, now);
  if (d === null) return 100;
  if (t.expiresAt!.getTime() <= now.getTime()) return 0;
  return d < 3 ? 40 : d < 14 ? 75 : 100;
}

/** 40% connection state, 40% sync success of the last 24 h (the connection score when nothing ran), 20% token */
export function healthScore(i: { connectionStatus: string; successRate: number | null; token: TokenFacts }, now: Date): number {
  const connection = CONNECTION_SCORE[i.connectionStatus] ?? 50;
  const sync = i.successRate ?? connection;
  return Math.round(connection * 0.4 + sync * 0.4 + tokenHealth(i.token, now) * 0.2);
}

export function healthStatus(i: { accountStatus: string; connectionStatus: string; score: number }): HealthStatus {
  if (i.accountStatus === 'paused') return 'paused';
  if (i.accountStatus === 'error' || i.accountStatus === 'revoked' || ['error', 'disconnected'].includes(i.connectionStatus)) return 'error';
  if (i.accountStatus === 'pending_authorization') return 'warning';
  return i.score >= 85 ? 'healthy' : i.score >= 60 ? 'warning' : 'error';
}

export const riskLevel = (score: number): RiskLevel => (score >= 85 ? 'low' : score >= 60 ? 'medium' : 'high');

export interface FrictionInput {
  accountStatus: string; connectionStatus: string; lastFailureMessage: string | null; lastFailureAt: Date | null;
  token: TokenFacts; failedJobs: number; lastJobError: string | null; problemListings: number; staleStockListings: number;
}

/** plain sentences naming what is wrong right now, most serious first */
export function frictionPoints(i: FrictionInput, now: Date): string[] {
  const out: string[] = [];
  if (i.accountStatus === 'pending_authorization') out.push('The connection has not been authorized yet');
  if (i.accountStatus === 'revoked') out.push('The account was disconnected: reconnect it to resume syncing');
  if (i.accountStatus === 'paused') out.push('Syncing is paused for this account');
  if (['error', 'degraded'].includes(i.connectionStatus) && i.lastFailureMessage && i.lastFailureAt && now.getTime() - i.lastFailureAt.getTime() < 7 * 86_400_000) out.push(`Last failure: ${i.lastFailureMessage}`);
  const d = daysLeft(i.token.expiresAt, now);
  if (i.token.status && ['expired', 'error'].includes(i.token.status)) out.push('The authorization has expired: reconnect the account');
  else if (i.token.autoRenews) { /* renewed automatically */ }
  else if (d !== null && d < 0) out.push('The access token has expired');
  else if (d !== null && d < 14) out.push(`The access token expires in ${d} day${d === 1 ? '' : 's'}`);
  if (i.failedJobs > 0) out.push(`${i.failedJobs} sync run${i.failedJobs === 1 ? '' : 's'} failed in the last 24 hours${i.lastJobError ? `: ${i.lastJobError}` : ''}`);
  if (i.problemListings > 0) out.push(`${i.problemListings} listing${i.problemListings === 1 ? ' needs' : 's need'} attention on the marketplace`);
  if (i.staleStockListings > 0) out.push(`${i.staleStockListings} listing${i.staleStockListings === 1 ? ' is' : 's are'} waiting for a stock update`);
  return out;
}

// ---------------------------------------------------------------- data-flow lanes
export const LANES = [
  { key: 'orders', label: 'Order ingestion', types: ['orders'] },
  { key: 'inventory', label: 'Inventory sync', types: ['inventory'] },
  { key: 'listings', label: 'Catalog and listings', types: ['listing_publish', 'listing_status', 'listings', 'catalog_import'] },
  { key: 'prices', label: 'Price updates', types: ['prices'] },
  { key: 'returns', label: 'Returns', types: ['returns'] },
  { key: 'tracking', label: 'Order status and tracking', types: ['order_status', 'tracking'] },
] as const;
export type LaneKey = (typeof LANES)[number]['key'];

export interface Lane { key: LaneKey; label: string; status: 'healthy' | 'warning' | 'error' | 'idle'; jobs: number; finished: number; failed: number; successRate: number | null; itemsProcessed: number; itemsPerHour: number }

export function buildLanes(counts: JobCount[], windowHours: number): Lane[] {
  return LANES.map((l) => {
    const mine = counts.filter((c) => (l.types as readonly string[]).includes(c.type));
    const r = successRate(mine);
    const items = mine.reduce((n, c) => n + c.done, 0);
    const status = r.rate === null ? 'idle' : r.rate >= 98 ? 'healthy' : r.rate >= 90 ? 'warning' : 'error';
    return { key: l.key, label: l.label, status, jobs: mine.reduce((n, c) => n + c.n, 0), finished: r.finished, failed: r.failed, successRate: r.rate, itemsProcessed: items, itemsPerHour: Math.round((items / windowHours) * 10) / 10 };
  });
}

export function networkStatus(score: number | null): 'optimal' | 'degraded' | 'critical' | 'not_connected' {
  return score === null ? 'not_connected' : score >= 90 ? 'optimal' : score >= 60 ? 'degraded' : 'critical';
}

/** the connector capability groups the screens show as chips */
export const CAPABILITY_TAGS: Array<{ tag: string; any: string[] }> = [
  { tag: 'product_import', any: ['catalog.import'] }, { tag: 'listings', any: ['listings.create', 'listings.update'] }, { tag: 'inventory', any: ['inventory.push'] },
  { tag: 'orders', any: ['orders.fetch'] }, { tag: 'shipping', any: ['shipping.createShipment', 'shipping.generateLabel'] }, { tag: 'returns', any: ['returns.fetch'] },
  { tag: 'promotions', any: ['pricing.push'] },
];
export const capabilityTags = (enabled: string[]): string[] => CAPABILITY_TAGS.filter((t) => t.any.some((a) => enabled.includes(a))).map((t) => t.tag);
