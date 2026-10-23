import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';
import { shopifyControl } from '@oms/connectors';

/**
 * Marketplace Hub: directory, account cards, detail, network health, one-call sync and the guided connect, over the real HTTP stack,
 * the real sync engine (jobs are pumped through the real handlers) and the sandbox connectors.
 */
let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let viewer: Actor;
let staff: Actor;
let other: Actor;
let wh: { id: string };

const HUB = '/api/v1/marketplace-hub';
const seller = (p: string) => `${p}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const mockCreds = (s: string) => ({ sellerId: s, apiKey: 'sandbox_key' });
const connect = async (body: Record<string, unknown>, as: Actor = admin, headers?: Record<string, string>) => c.post(`${HUB}/connect`, body, as, headers);
const cardOf = async (id: string, as: Actor = admin) => (await c.get(`${HUB}/accounts`, as)).body.data.items.find((x: any) => x.id === id);

beforeAll(async () => {
  // one attempt: a persistent failure dead-letters at once, so the failure paths run quickly
  t = await buildTestApp({ database: true, config: { SYNC_MAX_ATTEMPTS: '1' } });
  c = clientFor(t);
});
afterAll(() => t.close());
beforeEach(async () => {
  mockControl.reset();
  mockControl.configure({ seedOrders: false });
  shopifyControl.reset();
  admin = await c.registerVendor({ businessName: 'Hub Co' });
  viewer = await c.addMember(admin, 'vendor_viewer');
  staff = await c.addMember(admin, 'vendor_staff');
  other = await c.registerVendor({ businessName: 'Other Co' });
  wh = await c.makeWarehouse(admin);
});

/** a mock account that holds an order the marketplace placed, so a sync has real work to do */
const accountWithOrder = async () => {
  const acct = await c.connectAccount(admin, 'mock');
  const v = await c.makeVariant(admin);
  await c.stock(admin, v.variantId, wh.id, 10);
  mockControl.state.seller(acct.sellerId).products.set(v.sku, { externalListingId: 'MP-1', externalSku: v.sku, title: 'x', priceMinor: 1000, currency: 'INR', quantity: 5, status: 'active' } as never);
  mockControl.placeOrder(acct.sellerId, [{ sku: v.sku, quantity: 1 }]);
  return { acct, v };
};

describe('GET /marketplaces: additive connector facts', () => {
  it('describes the setup form of every connector; ratings, reviews and prices are null (nothing invented)', async () => {
    const r = await c.get('/api/v1/marketplaces', admin);
    const by = Object.fromEntries(r.body.data.map((m: any) => [m.code, m]));
    expect(Object.keys(by).sort()).toEqual(['amazon_in', 'flipkart', 'meesho', 'mock', 'myntra', 'shopify', 'snapdeal']);
    for (const m of Object.values<any>(by)) {
      expect(m).toMatchObject({ rating: null, reviewsCount: null, pricing: null });
      expect(m.logoKey).toEqual(expect.any(String));
      expect(m.description.length).toBeGreaterThan(10);
      expect(m.authFlow.fields.length).toBeGreaterThan(0);
      expect(m.authFlow.type).toBe(m.authType);
    }
    expect(by.shopify).toMatchObject({ category: 'storefront', implementation: 'beta', redirectFlow: true, supportedRegions: ['IN', 'GLOBAL'] });
    expect(by.shopify.authFlow).toMatchObject({ mode: 'both', partnerGated: false, refreshable: false });
    expect(by.shopify.authFlow.redirectFields[0]).toMatchObject({ key: 'shopDomain', required: true, secret: false, pattern: expect.stringContaining('myshopify') });
    expect(by.shopify.authFlow.fields.map((f: any) => [f.key, f.secret])).toEqual([['shopDomain', false], ['accessToken', true]]);
    expect(by.meesho).toMatchObject({ category: 'marketplace', implementation: 'beta', redirectFlow: false });
    expect(by.meesho.authFlow).toMatchObject({ mode: 'credentials', partnerGated: true });
    expect(by.meesho.authFlow.fields.map((f: any) => [f.key, f.type, f.secret])).toEqual([['supplierId', 'text', false], ['apiKey', 'password', true]]);
    expect(by.flipkart.authFlow.mode).toBe('both');
    expect(by.flipkart.authFlow.fields.find((f: any) => f.key === 'appSecret')).toMatchObject({ secret: true, type: 'password' });
    expect(by.myntra.authFlow).toMatchObject({ mode: 'credentials', partnerGated: true });
  });
});

describe('directory', () => {
  it('lists every connector as available for a seller with no accounts, with the setup form', async () => {
    const r = await c.get(`${HUB}/directory`, other);
    expect(r.status).toBe(200);
    expect(r.body.data.summary).toEqual({ total: 7, connected: 0, needsAttention: 0, available: 7, unavailable: 0 });
    const by = Object.fromEntries(r.body.data.items.map((i: any) => [i.id, i]));
    expect(by.shopify).toMatchObject({ name: 'Shopify', category: 'storefront', status: 'available', accountCount: 0, partnerGated: false, rating: null, pricing: null });
    expect(by.meesho).toMatchObject({ partnerGated: true, status: 'available' });
    expect(by.shopify.capabilityTags).toEqual(expect.arrayContaining(['product_import', 'listings', 'inventory', 'orders', 'promotions']));
    expect(by.shopify.capabilityTags).not.toContain('shipping');
    expect(by.meesho.capabilityTags).toContain('returns');
    expect(by.shopify.authFlow.redirectFields).toHaveLength(1);
  });

  it('merges my accounts: connected, needs attention (not finished / unhealthy), account counts; filters by category and text', async () => {
    const good = await c.connectAccount(admin, 'mock');
    await c.post('/api/v1/marketplace-accounts', { marketplace: 'flipkart', displayName: 'Unfinished', mode: 'sandbox' }, admin); // never authorized
    await c.connectAccount(admin, 'myntra');
    const r = await c.get(`${HUB}/directory`, admin);
    const by = Object.fromEntries(r.body.data.items.map((i: any) => [i.id, i]));
    expect(by.mock).toMatchObject({ status: 'connected', accountCount: 1 });
    expect(by.myntra).toMatchObject({ status: 'connected', accountCount: 1 });
    expect(by.flipkart).toMatchObject({ status: 'needs_attention', accountCount: 1, statusReason: expect.stringContaining('not been authorized') });
    expect(by.snapdeal).toMatchObject({ status: 'available', accountCount: 0 });
    expect(r.body.data.summary).toMatchObject({ connected: 2, needsAttention: 1, available: 4 });
    expect((await c.get(`${HUB}/directory?category=storefront`, admin)).body.data.items.map((i: any) => i.id)).toEqual(['shopify']);
    expect((await c.get(`${HUB}/directory?q=supplier`, admin)).body.data.items.map((i: any) => i.id)).toEqual(['meesho']);
    // a second business does not see these accounts
    expect((await c.get(`${HUB}/directory`, other)).body.data.items.find((i: any) => i.id === 'mock').accountCount).toBe(0);
    expect(good.status).toBe('active');
  });
});

describe('account cards', () => {
  it('shows the real numbers of a connected account: pending orders after a sync, health, capabilities, sync times', async () => {
    const { acct } = await accountWithOrder();
    let card = await cardOf(acct.id);
    expect(card).toMatchObject({
      marketplace: 'mock', accountIdentifier: acct.sellerId, mode: 'sandbox', status: 'healthy', accountStatus: 'active', connectionStatus: 'connected', syncState: 'idle', syncProgress: null,
      stats: { activeListings: 0, pendingOrders: 0, syncedInventoryItems: 0, errorCount: 0 }, health: { pulseScore: 100, riskLevel: 'low', frictionPoints: [], rateLimitRemainingPct: expect.any(Number), syncSuccessRate24h: null },
    });
    // a live measure of the per-account request limiter, never a placeholder
    expect(card.health.rateLimitRemainingPct).toBeGreaterThanOrEqual(0);
    expect(card.health.rateLimitRemainingPct).toBeLessThanOrEqual(100);
    expect(card.capabilities).toEqual(expect.arrayContaining(['orders.fetch', 'inventory.push']));
    expect(card.capabilityTags).toEqual(expect.arrayContaining(['orders', 'inventory', 'listings', 'returns', 'shipping']));
    expect(card.connectedAt).toBeTruthy();
    expect(card.lastSyncAt).toBeNull();

    const sync = await c.post(`${HUB}/accounts/${acct.id}/sync`, { scopes: ['orders'] }, admin);
    expect(sync.status).toBe(202);
    await t.pump();
    card = await cardOf(acct.id);
    expect(card.stats.pendingOrders).toBe(1);
    expect(card.lastSyncAt).toBeTruthy();
    expect(card.nextSyncAt).toBeTruthy();
    expect(new Date(card.nextSyncAt).getTime()).toBeGreaterThan(new Date(card.lastSyncAt).getTime());
    expect(card.health).toMatchObject({ syncSuccessRate24h: 100, syncRuns24h: { finished: 1, failed: 0 } });
  });

  it('counts listings and stock the marketplace holds', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin);
    await c.stock(admin, v.variantId, wh.id, 10);
    const created = await c.post('/api/v1/listings', { variantId: v.variantId, marketplaceAccountId: acct.id }, admin);
    expect(created.status).toBe(201);
    // the listing exists but is a draft: it is not "active" and nothing was pushed
    expect((await cardOf(acct.id)).stats).toMatchObject({ activeListings: 0, syncedInventoryItems: 0 });
  });

  it('filters by marketplace, health status and text; summary counts every status', async () => {
    const a = await c.connectAccount(admin, 'mock', { displayName: 'Alpha shop' });
    const pending = (await c.post('/api/v1/marketplace-accounts', { marketplace: 'flipkart', displayName: 'Beta shop', mode: 'sandbox' }, admin)).body.data;
    const paused = await c.connectAccount(admin, 'myntra', { displayName: 'Gamma shop' });
    await c.patch(`/api/v1/marketplace-accounts/${paused.id}`, { status: 'paused' }, admin);
    const all = (await c.get(`${HUB}/accounts`, admin)).body.data;
    expect(all.summary).toEqual({ total: 3, healthy: 1, warning: 1, error: 0, paused: 1 });
    const status = (s: string) => all.items.find((x: any) => x.id === s).status;
    expect([status(a.id), status(pending.id), status(paused.id)]).toEqual(['healthy', 'warning', 'paused']);
    expect((await c.get(`${HUB}/accounts?filter[status]=paused`, admin)).body.data.items.map((x: any) => x.id)).toEqual([paused.id]);
    expect((await c.get(`${HUB}/accounts?filter[marketplace]=mock`, admin)).body.data.items.map((x: any) => x.id)).toEqual([a.id]);
    expect((await c.get(`${HUB}/accounts?q=beta`, admin)).body.data.items.map((x: any) => x.id)).toEqual([pending.id]);
    const pend = all.items.find((x: any) => x.id === pending.id);
    expect(pend.health.frictionPoints).toEqual(['The connection has not been authorized yet']);
    expect(all.items.find((x: any) => x.id === paused.id)).toMatchObject({ syncState: 'paused', health: { frictionPoints: ['Syncing is paused for this account'] } });
  });

  it('a failing marketplace lowers the score, raises the error count and names the problem', async () => {
    const { acct } = await accountWithOrder();
    mockControl.setBehavior(acct.sellerId, { failNext: 100, failKind: 'transient' });
    expect((await c.post(`${HUB}/accounts/${acct.id}/sync`, { scopes: ['orders'] }, admin)).status).toBe(202);
    await t.pump();
    const card = await cardOf(acct.id);
    expect(card.health.syncRuns24h).toEqual({ finished: 1, failed: 1 });
    expect(card.health.syncSuccessRate24h).toBe(0);
    expect(card.health.pulseScore).toBeLessThan(80);
    expect(card.stats.errorCount).toBeGreaterThanOrEqual(1);
    expect(card.health.frictionPoints.some((f: string) => /sync run failed in the last 24 hours/.test(f))).toBe(true);
    expect(['warning', 'error']).toContain(card.status);
    expect(card.syncState).toBe('error');
  });

  it('is tenant scoped', async () => {
    const mine = await c.connectAccount(admin, 'mock');
    expect((await c.get(`${HUB}/accounts`, other)).body.data).toEqual({ items: [], summary: { total: 0, healthy: 0, warning: 0, error: 0, paused: 0 } });
    expect((await c.get(`${HUB}/accounts/${mine.id}`, other)).status).toBe(404);
  });
});

describe('account detail', () => {
  it('adds the capability matrix, readiness, recent jobs, lanes, webhook status, inventory policy and listing counts', async () => {
    const { acct } = await accountWithOrder();
    await c.post(`${HUB}/accounts/${acct.id}/sync`, { scopes: ['orders'] }, admin);
    await t.pump();
    const r = await c.get(`${HUB}/accounts/${acct.id}`, admin);
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.id).toBe(acct.id);
    expect(d.capabilityMatrix).toMatchObject({ orders: { fetch: true }, inventory: { push: true }, auth: { type: expect.any(String) } });
    expect(d.readiness).toMatchObject({ sandbox: true, live: false });
    expect(d.recentJobs).toHaveLength(1);
    expect(d.recentJobs[0]).toMatchObject({ type: 'orders', status: 'succeeded', marketplaceAccountId: acct.id });
    expect(d.lanes.find((l: any) => l.key === 'orders')).toMatchObject({ status: 'healthy', successRate: 100, finished: 1, jobs: 1 });
    expect(d.lanes.find((l: any) => l.key === 'returns')).toMatchObject({ status: 'idle', successRate: null });
    expect(d.webhook).toMatchObject({ supported: true, configured: false, secretRotatedAt: null, signatureHeader: 'x-mock-signature', lastEventAt: null, events24h: {} });
    expect(d.inventoryPolicy).toEqual({ mode: 'sync', safetyBuffer: 0, allocationPercent: 100, maxQuantity: null, warehouseIds: [], isDefault: true });
    expect(d.authorization).toMatchObject({ status: 'active', rotationCount: 0 });
    expect(JSON.stringify(d)).not.toContain('sandbox_key');
  });

  it('reflects the saved inventory policy and the webhook secret', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    expect((await c.put(`/api/v1/marketplace-accounts/${acct.id}/inventory-policy`, { mode: 'paused', safetyBuffer: 3, allocationPercent: 80 }, admin)).status).toBe(200);
    expect((await c.post(`/api/v1/marketplace-accounts/${acct.id}/webhook-secret`, {}, admin)).status).toBeLessThan(300);
    const d = (await c.get(`${HUB}/accounts/${acct.id}`, admin)).body.data;
    expect(d.inventoryPolicy).toMatchObject({ mode: 'paused', safetyBuffer: 3, allocationPercent: 80, isDefault: false });
    expect(d.webhook.configured).toBe(true);
    expect(d.webhook.secretRotatedAt).toBeTruthy();
  });

  it('is 404 for an unknown id', async () => {
    expect((await c.get(`${HUB}/accounts/00000000-0000-4000-8000-000000000000`, admin)).status).toBe(404);
  });
});

describe('sync and sync-status', () => {
  it('queues one job per supported scope (202), reuses queued ones, and reports combined progress until done', async () => {
    const { acct } = await accountWithOrder();
    expect((await c.post(`${HUB}/accounts/${acct.id}/sync`, {}, staff)).status).toBe(403); // staff operate orders and stock, they do not manage connections
    const r = await c.post(`${HUB}/accounts/${acct.id}/sync`, {}, admin);
    expect(r.status).toBe(202);
    expect(r.body.data.jobs.map((j: any) => [j.scope, j.job.type, j.created])).toEqual([['orders', 'orders', true], ['inventory', 'inventory', true], ['listings', 'listing_status', true], ['catalog', 'catalog_import', true]]);
    expect(r.body.data.jobs.every((j: any) => j.job.status === 'queued' && j.job.trigger === 'manual' && j.job.requestedBy === admin.userId)).toBe(true);
    expect(r.body.data.skipped).toEqual([]);

    const again = await c.post(`${HUB}/accounts/${acct.id}/sync`, { scopes: ['orders'] }, admin);
    expect(again.body.data.jobs[0]).toMatchObject({ scope: 'orders', created: false });
    expect(again.body.data.jobs[0].job.id).toBe(r.body.data.jobs[0].job.id);

    const during = (await c.get(`${HUB}/accounts/${acct.id}/sync-status`, admin)).body.data;
    expect(during).toMatchObject({ accountId: acct.id, state: 'syncing', progress: null });
    expect(during.active).toHaveLength(4);
    expect((await cardOf(acct.id)).syncState).toBe('syncing');

    await t.pump();
    const after = (await c.get(`${HUB}/accounts/${acct.id}/sync-status`, admin)).body.data;
    expect(after).toMatchObject({ state: 'idle', active: [] });
    expect(after.latest.map((j: any) => j.type).sort()).toEqual(['catalog_import', 'inventory', 'listing_status', 'orders']);
    expect(after.latest.every((j: any) => j.status === 'succeeded')).toBe(true);
    expect(after.lastSyncedAt).toBeTruthy();
    expect(after.nextSyncAt).toBeTruthy();
    expect((await cardOf(acct.id)).stats.pendingOrders).toBe(1);
  });

  it('reports a running job as a percentage', async () => {
    const { acct } = await accountWithOrder();
    await c.post(`${HUB}/accounts/${acct.id}/sync`, { scopes: ['catalog'] }, admin);
    const job = t.pendingJobs((p) => p.name === 'sync.catalog_import')[0]!;
    await t.database!.pg.exec('RESET ROLE');
    await t.database!.pg.exec(`update sync_jobs set status = 'running', progress = '{"total":8,"done":2,"failed":0}'::jsonb where id = '${(job.envelope.data as { jobId: string }).jobId}'`);
    await t.database!.pg.exec('SET ROLE oms_app');
    const s = (await c.get(`${HUB}/accounts/${acct.id}/sync-status`, admin)).body.data;
    expect(s).toMatchObject({ state: 'syncing', progress: 25 });
    expect((await cardOf(acct.id)).syncProgress).toBe(25);
  });

  it('refuses a pending, paused or foreign account and a viewer; validates scopes', async () => {
    const pending = (await c.post('/api/v1/marketplace-accounts', { marketplace: 'mock', displayName: 'Not yet' }, admin)).body.data;
    const r = await c.post(`${HUB}/accounts/${pending.id}/sync`, {}, admin);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('ACCOUNT_NOT_CONNECTED');
    const acct = await c.connectAccount(admin, 'mock');
    await c.patch(`/api/v1/marketplace-accounts/${acct.id}`, { status: 'paused' }, admin);
    expect((await c.post(`${HUB}/accounts/${acct.id}/sync`, {}, admin)).body.error).toMatchObject({ code: 'ACCOUNT_NOT_CONNECTED', message: 'Marketplace account is paused' });
    await c.patch(`/api/v1/marketplace-accounts/${acct.id}`, { status: 'active' }, admin);
    expect((await c.post(`${HUB}/accounts/${acct.id}/sync`, {}, viewer)).status).toBe(403);
    expect((await c.get(`${HUB}/accounts/${acct.id}/sync-status`, viewer)).status).toBe(200);
    expect((await c.post(`${HUB}/accounts/${acct.id}/sync`, {}, other)).status).toBe(404);
    expect((await c.get(`${HUB}/accounts/${acct.id}/sync-status`, other)).status).toBe(404);
    expect((await c.post(`${HUB}/accounts/${acct.id}/sync`, { scopes: ['orders', 'everything'] }, admin)).status).toBe(400);
    expect((await c.post(`${HUB}/accounts/${acct.id}/sync`, { scopes: [] }, admin)).status).toBe(400);
  });
});

describe('health', () => {
  it('has an honest empty state for a business without connections', async () => {
    const r = await c.get(`${HUB}/health`, other);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      overallPulseScore: null, networkStatus: 'not_connected', connectionsCount: 0, totalActiveListings: 0, totalPendingOrders: 0, connections: [], tokenWarnings: [],
      syncReliability: { windowHours: 24, finished: 0, failed: 0, successRate: null }, summary: { total: 0 },
    });
    expect(r.body.data.dataFlowLanes.map((l: any) => [l.key, l.status])).toEqual([['orders', 'idle'], ['inventory', 'idle'], ['listings', 'idle'], ['prices', 'idle'], ['returns', 'idle'], ['tracking', 'idle']]);
  });

  it('summarises the network: pulse, lanes from the sync jobs of the last 24 hours, totals and one row per account', async () => {
    const { acct } = await accountWithOrder();
    const second = await c.connectAccount(admin, 'myntra');
    await c.post(`${HUB}/accounts/${acct.id}/sync`, {}, admin);
    await t.pump();
    const h = (await c.get(`${HUB}/health`, admin)).body.data;
    expect(h).toMatchObject({ overallPulseScore: 100, networkStatus: 'optimal', connectionsCount: 2, totalPendingOrders: 1, syncReliability: { windowHours: 24, finished: 4, failed: 0, successRate: 100 } });
    expect(h.connections.map((x: any) => x.id).sort()).toEqual([acct.id, second.id].sort());
    expect(h.summary).toMatchObject({ total: 2, healthy: 2 });
    const lanes = Object.fromEntries(h.dataFlowLanes.map((l: any) => [l.key, l]));
    expect(lanes.orders).toMatchObject({ status: 'healthy', successRate: 100, finished: 1, itemsProcessed: 1 });
    expect(lanes.inventory).toMatchObject({ status: 'healthy', jobs: 1 });
    expect(lanes.listings).toMatchObject({ jobs: 2, finished: 2 }); // listing status check + catalogue import
    expect(lanes.prices).toMatchObject({ status: 'idle' });
    // a routinely renewed access token is not a warning
    expect(h.tokenWarnings).toEqual([]);
  });

  it('turns degraded and then critical when runs fail', async () => {
    const { acct } = await accountWithOrder();
    await c.post(`${HUB}/accounts/${acct.id}/sync`, { scopes: ['orders'] }, admin);
    await t.pump();
    mockControl.setBehavior(acct.sellerId, { failNext: 100, failKind: 'transient' });
    for (let i = 0; i < 3; i++) { await c.post(`${HUB}/accounts/${acct.id}/sync`, { scopes: ['orders'] }, admin); await t.pump(); }
    const h = (await c.get(`${HUB}/health`, admin)).body.data;
    expect(h.syncReliability).toMatchObject({ finished: 4, failed: 3, successRate: 25 });
    expect(h.dataFlowLanes.find((l: any) => l.key === 'orders')).toMatchObject({ status: 'error', successRate: 25, failed: 3 });
    expect(h.overallPulseScore).toBeLessThan(90);
    expect(['degraded', 'critical']).toContain(h.networkStatus);
  });

  it('flags a disconnected account as an error and is tenant scoped and readable by a viewer', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    await c.post(`/api/v1/marketplace-accounts/${acct.id}/disconnect`, {}, admin);
    const h = (await c.get(`${HUB}/health`, viewer)).body.data;
    expect(h.summary).toMatchObject({ total: 1, error: 1 });
    expect(h.connectionsCount).toBe(0);
    expect(h.overallPulseScore).toBeNull();
    expect(h.connections[0].health.frictionPoints[0]).toMatch(/disconnected/);
    expect((await c.get(`${HUB}/health`, other)).body.data.connections).toEqual([]);
  });
});

describe('guided connect', () => {
  it('connects with credentials in one call: create, authorize, test, first sync, each reported', async () => {
    const s = seller('MK');
    const r = await connect({ marketplace: 'mock', displayName: 'Mock main', credentials: mockCreds(s) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({ status: 'connected', ok: true, cleanedUp: false, redirect: null, error: null });
    expect(d.steps.map((x: any) => [x.name, x.ok, x.skipped])).toEqual([['create_account', true, false], ['authorize', true, false], ['test', true, false], ['first_sync', true, false]]);
    expect(d.steps.every((x: any) => Number.isInteger(x.durationMs) && x.durationMs >= 0)).toBe(true);
    expect(d.steps[3].message).toBe('Queued: orders, inventory, catalog');
    expect(d.account).toMatchObject({ name: 'Mock main', marketplace: 'mock', accountIdentifier: s, accountStatus: 'active', status: 'healthy', mode: 'sandbox' });
    expect(d.jobs.map((j: any) => j.type).sort()).toEqual(['catalog_import', 'inventory', 'orders']);
    expect(JSON.stringify(r.body)).not.toContain('sandbox_key');
    await t.pump();
    expect((await c.get(`${HUB}/accounts/${d.account.id}/sync-status`, admin)).body.data.latest.every((j: any) => j.status === 'succeeded')).toBe(true);
    expect((await t.outbox('marketplace_account.connected')).filter((e) => e.vendorId === admin.vendorId)).toHaveLength(1);
    const audit = await c.get('/api/v1/audit-logs?limit=50', admin);
    if (audit.status === 200) expect(JSON.stringify(audit.body.data)).toContain('marketplace_account.authorize');
  });

  it('honours the first-sync choices', async () => {
    const off = await connect({ marketplace: 'mock', displayName: 'No sync', credentials: mockCreds(seller('MK')), syncOptions: { runFirstSync: false } });
    expect(off.body.data.steps.find((x: any) => x.name === 'first_sync')).toMatchObject({ ok: true, skipped: true, message: 'No first sync requested' });
    expect(off.body.data.jobs).toEqual([]);
    const some = await connect({ marketplace: 'mock', displayName: 'Orders only', credentials: mockCreds(seller('MK')), syncOptions: { syncCatalog: false, syncInventory: false } });
    expect(some.body.data.jobs.map((j: any) => j.type)).toEqual(['orders']);
  });

  it('wrong credentials fail at authorize, say why, and leave no account behind', async () => {
    const before = (await c.get(`${HUB}/accounts`, admin)).body.data.summary.total;
    const r = await connect({ marketplace: 'mock', displayName: 'Bad', credentials: { sellerId: 'X1', apiKey: 'definitely-wrong' } });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'failed', ok: false, account: null, cleanedUp: true, jobs: [], error: { code: 'INVALID_CREDENTIALS' } });
    expect(r.body.data.steps.map((x: any) => [x.name, x.ok])).toEqual([['create_account', true], ['authorize', false]]);
    expect(r.body.data.steps[1].message).toBeTruthy();
    expect((await c.get(`${HUB}/accounts`, admin)).body.data.summary.total).toBe(before);
    expect((await t.outbox('marketplace_account.connected')).filter((e) => e.vendorId === admin.vendorId)).toHaveLength(0);
  });

  it('refuses to connect the same marketplace account twice, without leaving a duplicate', async () => {
    const s = seller('MK');
    const first = await connect({ marketplace: 'mock', displayName: 'First', credentials: mockCreds(s), syncOptions: { runFirstSync: false } });
    expect(first.body.data.status).toBe('connected');
    const dup = await connect({ marketplace: 'mock', displayName: 'Second', credentials: mockCreds(s), syncOptions: { runFirstSync: false } });
    expect(dup.body.data).toMatchObject({ status: 'failed', cleanedUp: true, account: null, error: { code: 'CONFLICT' } });
    expect((await c.get(`${HUB}/accounts`, admin)).body.data.items.map((x: any) => x.name)).toEqual(['First']);
  });

  it('a retry with the same Idempotency-Key returns the first result and creates one account', async () => {
    const body = { marketplace: 'mock', displayName: 'Once', credentials: mockCreds(seller('MK')), syncOptions: { runFirstSync: false } };
    const key = { 'idempotency-key': `hub-connect-${seller('K')}` };
    const a = await connect(body, admin, key);
    const b = await connect(body, admin, key);
    expect(a.status).toBe(200);
    expect(b.body.data.account.id).toBe(a.body.data.account.id);
    expect((await c.get(`${HUB}/accounts`, admin)).body.data.summary.total).toBe(1);
  });

  it('reuses the pending account of the same name instead of creating a second one', async () => {
    const pending = (await c.post('/api/v1/marketplace-accounts', { marketplace: 'mock', displayName: 'Onboarding mock' }, admin)).body.data;
    const r = await connect({ marketplace: 'mock', displayName: 'Onboarding mock', credentials: mockCreds(seller('MK')), syncOptions: { runFirstSync: false } });
    expect(r.body.data.status).toBe('connected');
    expect(r.body.data.account.id).toBe(pending.id);
    expect(r.body.data.steps[0]).toMatchObject({ name: 'create_account', skipped: true });
    expect((await c.get(`${HUB}/accounts`, admin)).body.data.summary.total).toBe(1);
  });

  it('connects Shopify with an admin token: the shop domain is stored with the account, the shop is the account id', async () => {
    const shop = seller('shop').toLowerCase();
    const r = await connect({ marketplace: 'shopify', displayName: 'My store', credentials: { shopDomain: `${shop}.myshopify.com`, accessToken: `shpat_sandbox_${shop}` } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'connected', ok: true, account: { marketplace: 'shopify', accountIdentifier: `${shop}.myshopify.com`, mode: 'sandbox', connectorName: 'Shopify', category: 'storefront' } });
    const acct = (await c.get(`/api/v1/marketplace-accounts/${r.body.data.account.id}`, admin)).body.data;
    expect(acct.config).toMatchObject({ shopDomain: `${shop}.myshopify.com` });
    expect(JSON.stringify(acct)).not.toContain('shpat_sandbox');
    await t.pump();
    expect((await c.get(`${HUB}/accounts/${acct.id}/sync-status`, admin)).body.data.latest.every((j: any) => j.status === 'succeeded')).toBe(true);
  });

  it('refuses a Shopify token that does not belong to the shop and removes the half-made account', async () => {
    const r = await connect({ marketplace: 'shopify', displayName: 'Wrong token', credentials: { shopDomain: 'store-b.myshopify.com', accessToken: 'shpat_sandbox_storea' }, syncOptions: { runFirstSync: false } });
    expect(r.body.data).toMatchObject({ status: 'failed', cleanedUp: true, account: null, error: { code: 'INVALID_CREDENTIALS' } });
  });

  it('connects Meesho with its supplier credentials; a partner-gated marketplace is still a normal credentials form', async () => {
    const id = seller('SUP');
    const r = await connect({ marketplace: 'meesho', displayName: 'Meesho supplier', credentials: { supplierId: id, apiKey: `mee-sandbox-${id}` }, syncOptions: { runFirstSync: false } });
    expect(r.body.data).toMatchObject({ status: 'connected', account: { marketplace: 'meesho', accountIdentifier: id, authType: 'api_key' } });
    expect(r.body.data.account.health.tokenExpiresInDays).toBeNull();
  });

  it('redirect flow (Shopify): start -> approve on the marketplace -> finish with code and state', async () => {
    const shop = seller('rshop').toLowerCase();
    const start = await connect({ marketplace: 'shopify', displayName: 'Redirect store', config: { shopDomain: shop }, redirectUri: 'https://app.example.com/cb' });
    expect(start.status, JSON.stringify(start.body)).toBe(200);
    const sd = start.body.data;
    expect(sd).toMatchObject({ status: 'awaiting_authorization', ok: true, cleanedUp: false, error: null, account: { accountStatus: 'pending_authorization' } });
    expect(sd.steps.map((x: any) => [x.name, x.ok, x.skipped])).toEqual([['create_account', true, false], ['authorize', true, true]]);
    const url = new URL(sd.redirect.authorizationUrl);
    expect(url.host).toBe(`${shop}.myshopify.com`);
    expect(url.searchParams.get('state')).toBe(sd.redirect.state);
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/cb');
    expect(sd.redirect).toMatchObject({ accountId: sd.account.id, expiresInSeconds: 600 });

    // another business cannot finish it with the state it does not own
    const stolen = await c.post(`${HUB}/oauth/complete`, { state: sd.redirect.state, code: `shpsandbox:${shop}` }, other);
    expect(stolen.status).toBe(400);
    expect((await c.post(`${HUB}/oauth/complete`, { state: `${sd.redirect.state}x`, code: `shpsandbox:${shop}` }, admin)).status).toBe(400);
    expect((await c.post(`${HUB}/oauth/complete`, { state: 'not-a-state-at-all', code: 'x' }, admin)).status).toBe(400);

    // a code Shopify does not recognise is reported; the pending account stays so the seller can try again
    const bad = await c.post(`${HUB}/oauth/complete`, { state: sd.redirect.state, code: 'garbage', syncOptions: { runFirstSync: false } }, admin);
    expect(bad.body.data).toMatchObject({ status: 'failed', ok: false, cleanedUp: false, account: null, error: { code: 'INVALID_CREDENTIALS' } });
    expect((await c.get(`/api/v1/marketplace-accounts/${sd.account.id}`, admin)).body.data.status).toBe('pending_authorization');

    const done = await c.post(`${HUB}/oauth/complete`, { state: sd.redirect.state, code: `shpsandbox:${shop}` }, admin);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'connected', ok: true, account: { id: sd.account.id, accountStatus: 'active', accountIdentifier: `${shop}.myshopify.com` } });
    expect(done.body.data.steps[0]).toMatchObject({ name: 'create_account', skipped: true });
    expect(done.body.data.jobs.length).toBeGreaterThan(0);
  });

  it('redirect flow through /connect with code + state, on the sandbox marketplace', async () => {
    const s = seller('MK');
    const start = await connect({ marketplace: 'mock', displayName: 'Mock redirect', redirectUri: 'https://app.example.com/cb' });
    expect(start.body.data.status).toBe('awaiting_authorization');
    const done = await connect({ marketplace: 'mock', displayName: 'Mock redirect', code: `sandbox-code:${s}`, state: start.body.data.redirect.state, syncOptions: { runFirstSync: false } });
    expect(done.body.data).toMatchObject({ status: 'connected', account: { accountIdentifier: s } });
    // the state belongs to mock, not to flipkart
    const start2 = await connect({ marketplace: 'mock', displayName: 'Mock redirect 2', redirectUri: 'https://app.example.com/cb' });
    expect((await connect({ marketplace: 'flipkart', displayName: 'x', code: 'c', state: start2.body.data.redirect.state })).status).toBe(400);
  });

  it('rejects incomplete requests before anything is created', async () => {
    const before = (await c.get(`${HUB}/accounts`, admin)).body.data.summary.total;
    const noShop = await connect({ marketplace: 'shopify', displayName: 'No shop', redirectUri: 'https://app.example.com/cb' });
    expect(noShop.status).toBe(400);
    expect(noShop.body.error.details.issues[0].path).toBe('config.shopDomain');
    expect((await connect({ marketplace: 'shopify', displayName: 'No uri', config: { shopDomain: 'abc' } })).status).toBe(400);
    expect((await connect({ marketplace: 'meesho', displayName: 'No creds', redirectUri: 'https://app.example.com/cb' })).status).toBe(400);
    expect((await connect({ marketplace: 'mock', displayName: 'Both', credentials: {}, code: 'x', state: 'y'.repeat(12) })).status).toBe(400);
    expect((await connect({ marketplace: 'mock', displayName: 'Code only', code: 'x' })).status).toBe(400);
    expect((await connect({ marketplace: 'ebay', displayName: 'Unknown', credentials: {} })).status).toBe(404);
    expect((await connect({ marketplace: 'mock', displayName: 'Live mock', mode: 'live', credentials: mockCreds(seller('MK')) })).status).toBe(400);
    expect((await c.get(`${HUB}/accounts`, admin)).body.data.summary.total).toBe(before);
  });

  it('a bad shop domain fails the redirect start cleanly', async () => {
    const r = await connect({ marketplace: 'shopify', displayName: 'Evil', config: { shopDomain: 'evil.com' }, redirectUri: 'https://app.example.com/cb' });
    expect(r.body.data).toMatchObject({ status: 'failed', cleanedUp: true, account: null });
    expect(r.body.data.steps[1]).toMatchObject({ name: 'authorize', ok: false, message: expect.stringContaining('myshopify.com') });
    expect((await c.get(`${HUB}/accounts`, admin)).body.data.summary.total).toBe(0);
  });

  it('needs a verified e-mail (EMAIL_NOT_VERIFIED), write access and a login', async () => {
    const unverified = await c.registerVendor({ businessName: 'Unverified Co', verify: false });
    const r = await connect({ marketplace: 'mock', displayName: 'Mock', credentials: mockCreds(seller('MK')) }, unverified);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(r.body.error.message).toMatch(/Verify your e-mail/);
    expect((await c.get(`${HUB}/accounts`, unverified)).body.data.summary.total).toBe(0);
    expect((await connect({ marketplace: 'mock', displayName: 'Mock', credentials: mockCreds(seller('MK')) }, viewer)).status).toBe(403);
    expect((await c.post(`${HUB}/connect`, {}, undefined)).status).toBe(401);
    expect((await c.get(`${HUB}/directory`)).status).toBe(401);
  });
});

describe('connect-url', () => {
  it('gives the URL to (re)authorize an account, bound to it and to the business', async () => {
    const shop = seller('cu').toLowerCase();
    const acct = (await c.post('/api/v1/marketplace-accounts', { marketplace: 'shopify', displayName: 'Reconnect', mode: 'sandbox', config: { shopDomain: `${shop}.myshopify.com` } }, admin)).body.data;
    const r = await c.get(`${HUB}/accounts/${acct.id}/connect-url?redirectUri=${encodeURIComponent('https://app.example.com/cb')}`, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ accountId: acct.id, expiresInSeconds: 600 });
    expect(new URL(r.body.data.authorizationUrl).host).toBe(`${shop}.myshopify.com`);
    const done = await c.post(`${HUB}/oauth/complete`, { state: r.body.data.state, code: `shpsandbox:${shop}`, syncOptions: { runFirstSync: false } }, admin);
    expect(done.body.data).toMatchObject({ status: 'connected', account: { id: acct.id } });
  });

  it('is refused for connectors without a redirect flow, foreign accounts, a bad redirect URL and viewers', async () => {
    const made = await c.post('/api/v1/marketplace-accounts', { marketplace: 'meesho', displayName: 'Meesho M', mode: 'sandbox' }, admin);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const meesho = made.body.data;
    const uri = encodeURIComponent('https://app.example.com/cb');
    const r = await c.get(`${HUB}/accounts/${meesho.id}/connect-url?redirectUri=${uri}`, admin);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('CAPABILITY_UNSUPPORTED');
    expect((await c.get(`${HUB}/accounts/${meesho.id}/connect-url?redirectUri=${uri}`, other)).status).toBe(404);
    expect((await c.get(`${HUB}/accounts/${meesho.id}/connect-url?redirectUri=nope`, admin)).status).toBe(400);
    expect((await c.get(`${HUB}/accounts/${meesho.id}/connect-url?redirectUri=${uri}`, viewer)).status).toBe(403);
  });
});

describe('onboarding availability', () => {
  it('Shopify and Meesho are connectable channels now; Social Commerce is still coming soon', async () => {
    const r = await c.get('/api/v1/onboarding/channels', admin);
    const by = Object.fromEntries(r.body.data.items.map((i: any) => [i.code, i]));
    expect(by.shopify).toMatchObject({ availability: 'available', actions: ['connect'] });
    expect(by.meesho).toMatchObject({ availability: 'available', actions: ['connect'] });
    expect(by.social_commerce.availability).toBe('coming_soon');
  });
});
