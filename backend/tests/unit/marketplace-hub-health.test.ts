import { describe, expect, it } from 'vitest';
import { buildLanes, capabilityTags, daysLeft, frictionPoints, healthScore, healthStatus, networkStatus, riskLevel, successRate, tokenHealth } from '../../modules/marketplace-hub/src/health';

const now = new Date('2026-10-17T10:00:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);
const noToken = { status: null, expiresAt: null, autoRenews: false };

describe('success rate of sync runs', () => {
  it('counts finished runs only; a partially failed run still completed', () => {
    const r = successRate([{ type: 'orders', status: 'succeeded', n: 7, done: 70 }, { type: 'orders', status: 'partially_failed', n: 1, done: 5 }, { type: 'orders', status: 'dead_lettered', n: 1, done: 0 }, { type: 'orders', status: 'failed', n: 1, done: 0 }, { type: 'orders', status: 'running', n: 4, done: 0 }, { type: 'orders', status: 'queued', n: 2, done: 0 }]);
    expect(r).toEqual({ finished: 10, succeeded: 8, failed: 2, rate: 80 });
  });
  it('is null (not 100) when nothing finished', () => {
    expect(successRate([]).rate).toBeNull();
    expect(successRate([{ type: 'orders', status: 'running', n: 1, done: 0 }]).rate).toBeNull();
  });
  it('rounds to one decimal', () => expect(successRate([{ type: 'x', status: 'succeeded', n: 2, done: 0 }, { type: 'x', status: 'failed', n: 1, done: 0 }]).rate).toBe(66.7));
});

describe('token health', () => {
  it('a credential that never expires is healthy; an authorization that expired or was revoked is 0', () => {
    expect(tokenHealth(noToken, now)).toBe(100);
    for (const status of ['expired', 'revoked', 'error']) expect(tokenHealth({ status, expiresAt: null, autoRenews: false }, now)).toBe(0);
  });
  it('penalises a token that must be renewed by hand as it approaches expiry', () => {
    expect(tokenHealth({ status: 'active', expiresAt: inDays(30), autoRenews: false }, now)).toBe(100);
    expect(tokenHealth({ status: 'active', expiresAt: inDays(10), autoRenews: false }, now)).toBe(75);
    expect(tokenHealth({ status: 'active', expiresAt: inDays(1), autoRenews: false }, now)).toBe(40);
    expect(tokenHealth({ status: 'active', expiresAt: inDays(-1), autoRenews: false }, now)).toBe(0);
  });
  it('a token the connector refreshes itself is not a problem, unless the authorization failed', () => {
    expect(tokenHealth({ status: 'active', expiresAt: new Date(now.getTime() + 600_000), autoRenews: true }, now)).toBe(100);
    expect(tokenHealth({ status: 'expired', expiresAt: null, autoRenews: true }, now)).toBe(0);
  });
  it('days left rounds down and is null for no expiry', () => {
    expect(daysLeft(null, now)).toBeNull();
    expect(daysLeft(new Date(now.getTime() + 36 * 3_600_000), now)).toBe(1);
  });
});

describe('health score', () => {
  it('weighs connection 40%, sync success 40%, token 20%', () => {
    expect(healthScore({ connectionStatus: 'connected', successRate: 100, token: noToken }, now)).toBe(100);
    expect(healthScore({ connectionStatus: 'connected', successRate: 50, token: noToken }, now)).toBe(80);
    expect(healthScore({ connectionStatus: 'degraded', successRate: 90, token: noToken }, now)).toBe(80); // 24 + 36 + 20
    expect(healthScore({ connectionStatus: 'error', successRate: null, token: { status: 'expired', expiresAt: null, autoRenews: false } }, now)).toBe(0);
  });
  it('uses the connection score when no sync has finished yet', () => {
    expect(healthScore({ connectionStatus: 'connected', successRate: null, token: noToken }, now)).toBe(100);
    expect(healthScore({ connectionStatus: 'unknown', successRate: null, token: noToken }, now)).toBe(60);
  });
  it('maps the score to status and risk', () => {
    expect(healthStatus({ accountStatus: 'active', connectionStatus: 'connected', score: 90 })).toBe('healthy');
    expect(healthStatus({ accountStatus: 'active', connectionStatus: 'degraded', score: 70 })).toBe('warning');
    expect(healthStatus({ accountStatus: 'active', connectionStatus: 'connected', score: 40 })).toBe('error');
    expect(healthStatus({ accountStatus: 'paused', connectionStatus: 'connected', score: 100 })).toBe('paused');
    expect(healthStatus({ accountStatus: 'pending_authorization', connectionStatus: 'unknown', score: 70 })).toBe('warning');
    expect(healthStatus({ accountStatus: 'active', connectionStatus: 'error', score: 95 })).toBe('error');
    expect(healthStatus({ accountStatus: 'revoked', connectionStatus: 'disconnected', score: 50 })).toBe('error');
    expect([riskLevel(100), riskLevel(70), riskLevel(10)]).toEqual(['low', 'medium', 'high']);
  });
});

describe('friction points', () => {
  const base = { accountStatus: 'active', connectionStatus: 'connected', lastFailureMessage: null, lastFailureAt: null, token: noToken, failedJobs: 0, lastJobError: null, problemListings: 0, staleStockListings: 0 };
  it('says nothing when all is well', () => expect(frictionPoints(base, now)).toEqual([]));
  it('names every real problem, in plain words', () => {
    const out = frictionPoints({ ...base, connectionStatus: 'degraded', lastFailureMessage: 'timeout', lastFailureAt: inDays(-1), token: { status: 'active', expiresAt: inDays(3), autoRenews: false }, failedJobs: 2, lastJobError: 'rate limited', problemListings: 1, staleStockListings: 4 }, now);
    expect(out).toEqual([
      'Last failure: timeout', 'The access token expires in 3 days', '2 sync runs failed in the last 24 hours: rate limited', '1 listing needs attention on the marketplace', '4 listings are waiting for a stock update',
    ]);
  });
  it('ignores an old failure and a routinely renewed token; reports an expired authorization', () => {
    expect(frictionPoints({ ...base, connectionStatus: 'degraded', lastFailureMessage: 'old', lastFailureAt: inDays(-30), token: { status: 'active', expiresAt: inDays(0), autoRenews: true } }, now)).toEqual([]);
    expect(frictionPoints({ ...base, accountStatus: 'error', token: { status: 'expired', expiresAt: null, autoRenews: true } }, now)).toEqual(['The authorization has expired: reconnect the account']);
    expect(frictionPoints({ ...base, accountStatus: 'pending_authorization' }, now)).toEqual(['The connection has not been authorized yet']);
  });
});

describe('lanes', () => {
  it('groups job types into lanes with success rate and throughput per hour; a lane without runs is idle', () => {
    const lanes = buildLanes([
      { type: 'orders', status: 'succeeded', n: 8, done: 240 }, { type: 'orders', status: 'failed', n: 2, done: 0 },
      { type: 'listing_publish', status: 'succeeded', n: 3, done: 3 }, { type: 'listing_status', status: 'succeeded', n: 1, done: 5 },
      { type: 'inventory', status: 'succeeded', n: 97, done: 0 }, { type: 'inventory', status: 'failed', n: 3, done: 0 },
    ], 24);
    const by = Object.fromEntries(lanes.map((l) => [l.key, l]));
    expect(by.orders).toMatchObject({ status: 'error', successRate: 80, finished: 10, failed: 2, itemsProcessed: 240, itemsPerHour: 10 });
    expect(by.inventory).toMatchObject({ status: 'warning', successRate: 97 });
    expect(by.listings).toMatchObject({ status: 'healthy', successRate: 100, jobs: 4, itemsProcessed: 8 });
    expect(by.returns).toMatchObject({ status: 'idle', successRate: null, jobs: 0 });
    expect(lanes.map((l) => l.key)).toEqual(['orders', 'inventory', 'listings', 'prices', 'returns', 'tracking']);
  });
  it('network status from the pulse; none when nothing is connected', () => {
    expect([networkStatus(95), networkStatus(75), networkStatus(30), networkStatus(null)]).toEqual(['optimal', 'degraded', 'critical', 'not_connected']);
  });
});

describe('capability tags', () => {
  it('turns flat capabilities into the chips of the screens', () => {
    expect(capabilityTags(['catalog.import', 'listings.create', 'inventory.push', 'orders.fetch', 'pricing.push'])).toEqual(['product_import', 'listings', 'inventory', 'orders', 'promotions']);
    expect(capabilityTags(['returns.fetch', 'shipping.createShipment'])).toEqual(['shipping', 'returns']);
    expect(capabilityTags([])).toEqual([]);
  });
});
