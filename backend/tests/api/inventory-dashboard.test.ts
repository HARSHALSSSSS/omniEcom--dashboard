import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';
import { bulkLimits, classifyHealth, healthText, imbalanced, scaleMaxDays } from '@oms/mod-inventory';
import { buildWorld, orderArrives, type World } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

// direct SQL as the system scope (the runtime role would otherwise see no tenant rows: RLS fails closed)
const withSystemScope = async <R>(fn: () => Promise<R>): Promise<R> => {
  const pg = t.database!.pg;
  await pg.query(`select set_config('app.scope', 'system', false)`);
  try { return await fn(); } finally { await pg.query(`select set_config('app.scope', '', false), set_config('app.vendor_id', '', false)`); }
};
const sqlExec = (q: string) => withSystemScope(() => t.database!.pg.exec(q));

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

const API = '/api/v1/inventory';
const ledgerOk = async (as: Actor) => expect((await c.get(`${API}/ledger-check`, as)).body.data).toEqual({ healthy: true, drift: [] });
const stockRow = async (as: Actor, variantId: string, warehouseId: string) => (await c.get(`${API}?filter[variantId]=${variantId}&filter[warehouseId]=${warehouseId}`, as)).body.data[0];
const setSettings = async (as: Actor, body: Record<string, unknown>) => expect((await c.patch('/api/v1/vendor/settings', body, as)).status).toBe(200);
const adjust = (as: Actor, body: Record<string, unknown>) => c.post(`${API}/adjustments`, { reason: 'test', ...body }, as);
const items = (r: { body: any }) => r.body.data.items as any[];
const skus = (r: { body: any }) => items(r).map((i) => i.sku).sort();

/** a vendor with a warehouse and a few stocked variants (no marketplace) */
async function plainShop(stocks: Array<[string, number]>, warehouses = 1) {
  const admin = await c.registerVendor({ businessName: `Shop ${Math.random().toString(36).slice(2, 7)}` });
  const whs = [];
  for (let i = 0; i < warehouses; i++) whs.push(await c.makeWarehouse(admin, { priority: 100 + i * 100 }));
  const variants = [];
  for (const [sku, qty] of stocks) {
    const v = await c.makeVariant(admin, { sku });
    if (qty > 0) await c.stock(admin, v.variantId, whs[0]!.id, qty);
    variants.push(v);
  }
  return { admin, whs, variants };
}

// ================================================================================================
describe('pure rules', () => {
  it('health: stockout / critical / attention / healthy, and no sales means no cover', () => {
    expect(classifyHealth({ available: 0, unitsPerDay: 3, leadTimeDays: 10 })).toEqual({ health: 'stockout', coverDays: 0 });
    expect(classifyHealth({ available: 0, unitsPerDay: 0, leadTimeDays: 10 })).toEqual({ health: 'stockout', coverDays: null });
    expect(classifyHealth({ available: 4, unitsPerDay: 1, leadTimeDays: 10 })).toEqual({ health: 'critical', coverDays: 4 }); // 4 < 10 / 2
    expect(classifyHealth({ available: 5, unitsPerDay: 1, leadTimeDays: 10 }).health).toBe('attention'); // 5 is not < 5
    expect(classifyHealth({ available: 9, unitsPerDay: 1, leadTimeDays: 10 }).health).toBe('attention');
    expect(classifyHealth({ available: 10, unitsPerDay: 1, leadTimeDays: 10 }).health).toBe('healthy');
    expect(classifyHealth({ available: 500, unitsPerDay: 0, leadTimeDays: 10 })).toEqual({ health: 'healthy', coverDays: null });
    expect(healthText({ health: 'attention', coverDays: 7, leadTimeDays: 10, unitsPerDay: 1 })).toBe('Estimated coverage is 7 days while lead time is 10 days.');
    expect(healthText({ health: 'healthy', coverDays: null, leadTimeDays: 10, unitsPerDay: 0 })).toMatch(/cannot be estimated/);
  });
  it('horizon scale and warehouse imbalance', () => {
    expect(scaleMaxDays([{ coverDays: 7, leadTimeDays: 10 }])).toBe(20);
    expect(scaleMaxDays([{ coverDays: 31, leadTimeDays: 10 }, { coverDays: null, leadTimeDays: 8 }])).toBe(35);
    const s = [{ warehouseId: 'a', name: 'A', units: 80, sharePct: 80, demandSharePct: 50 }, { warehouseId: 'b', name: 'B', units: 20, sharePct: 20, demandSharePct: 50 }, { warehouseId: 'c', name: 'C', units: 0, sharePct: 0, demandSharePct: null }];
    expect(imbalanced(s, 20).map((x) => x.warehouseId)).toEqual(['a', 'b']);
    expect(imbalanced(s, 30)).toEqual([]);
  });
});

// ================================================================================================
describe('quarantined stock bucket', () => {
  it('moves units returned -> quarantined -> on hand / damaged / written off, never negative, ledger stays exact', async () => {
    const { admin, whs, variants } = await plainShop([['Q-1', 20]]);
    const [wh, v] = [whs[0]!, variants[0]!];
    const body = (extra: Record<string, unknown>) => ({ variantId: v.variantId, warehouseId: wh.id, reason: 'inspection', ...extra });
    expect((await c.post(`${API}/returns`, body({ quantity: 5, disposition: 'hold' }), admin)).status).toBe(200);

    // returned -> quarantined (default source). Quarantined is NOT on hand, NOT sellable, NOT available
    const q1 = await c.post(`${API}/quarantine`, body({ quantity: 3 }), admin);
    expect(q1.status).toBe(200);
    expect(q1.body.data.stock).toMatchObject({ onHand: 20, available: 20, returned: 2, quarantined: 3 });
    expect((await c.post(`${API}/quarantine`, body({ quantity: 3 }), admin)).body.error.code).toBe('INSUFFICIENT_STOCK'); // only 2 left in returned
    expect(await stockRow(admin, v.variantId, wh.id)).toMatchObject({ returned: 2, quarantined: 3 });

    // from sellable stock (repair): leaves on hand and available
    const q2 = await c.post(`${API}/quarantine`, body({ quantity: 5, source: 'on_hand', reason: 'repair' }), admin);
    expect(q2.body.data.stock).toMatchObject({ onHand: 15, available: 15, quarantined: 8 });

    // release: back to sellable, to damaged, or off the books
    expect((await c.post(`${API}/quarantine/release`, body({ quantity: 2, to: 'on_hand' }), admin)).body.data.stock).toMatchObject({ onHand: 17, available: 17, quarantined: 6 });
    expect((await c.post(`${API}/quarantine/release`, body({ quantity: 1, to: 'damaged' }), admin)).body.data.stock).toMatchObject({ onHand: 17, damaged: 1, quarantined: 5 });
    expect((await c.post(`${API}/quarantine/release`, body({ quantity: 5, to: 'write_off' }), admin)).body.data.stock).toMatchObject({ onHand: 17, damaged: 1, returned: 2, quarantined: 0 });
    expect((await c.post(`${API}/quarantine/release`, body({ quantity: 1, to: 'on_hand' }), admin)).status).toBe(409); // nothing left to release
    expect((await c.get(`${API}/variants/${v.variantId}`, admin)).body.data.totals).toMatchObject({ onHand: 17, available: 17, returned: 2, damaged: 1, quarantined: 0 });

    // every step left a movement, and the cache equals the ledger INCLUDING the quarantined column
    const moves = (await c.get(`${API}/movements?filter[variantId]=${v.variantId}`, admin)).body.data.items as any[];
    expect(moves.filter((m) => m.type === 'quarantine').map((m) => [m.deltaQuarantined, m.deltaReturned, m.deltaOnHand])).toEqual([[5, 0, -5], [3, -3, 0]]);
    expect(moves.filter((m) => m.type === 'quarantine_release').map((m) => m.deltaQuarantined)).toEqual([-5, -1, -2]);
    await ledgerOk(admin);
  });

  it('cannot quarantine units that are reserved, is idempotent, and respects permissions + tenancy', async () => {
    const w = await buildWorld(t, c, { stock: [10] });
    await orderArrives(t, c, w, 6); // 6 reserved, 4 free
    const [wh, v] = [w.warehouses[0]!, w.variant];
    const q = (quantity: number, extra: Record<string, unknown> = {}) => c.post(`${API}/quarantine`, { variantId: v.variantId, warehouseId: wh.id, quantity, source: 'on_hand', reason: 'repair', ...extra }, w.admin);
    expect((await q(5)).body.error.code).toBe('INSUFFICIENT_STOCK'); // would leave 5 on hand for 6 reserved
    const ok = await q(4, { idempotencyKey: 'quarantine-key-1' });
    expect(ok.body.data.stock).toMatchObject({ onHand: 6, reserved: 6, available: 0, quarantined: 4 });
    const again = await q(4, { idempotencyKey: 'quarantine-key-1' });
    expect(again.body.data.duplicate).toBe(true);
    expect(again.body.data.stock.quarantined).toBe(4);
    await ledgerOk(w.admin);

    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    expect((await c.post(`${API}/quarantine`, { variantId: v.variantId, warehouseId: wh.id, quantity: 1, reason: 'x1' }, viewer)).status).toBe(403);
    const other = await c.registerVendor({ businessName: 'Other Q' });
    expect((await c.post(`${API}/quarantine/release`, { variantId: v.variantId, warehouseId: wh.id, quantity: 1, to: 'on_hand', reason: 'x1' }, other)).status).toBe(404);
  });
});

// ================================================================================================
describe('overview', () => {
  let w: World;
  let viewer: Actor;

  it('computes the pulse, horizon, signals, advisory, distribution and movement feed from real stock and sales', async () => {
    w = await buildWorld(t, c, { warehouses: 2, stock: [30, 10] });
    viewer = await c.addMember(w.admin, 'vendor_viewer');
    const [main, wh2] = w.warehouses as unknown as [{ id: string }, { id: string }];
    await orderArrives(t, c, w, 4); // reserved at MAIN (first by priority)
    const v = w.variant.variantId;
    expect((await adjust(w.admin, { variantId: v, warehouseId: main.id, type: 'manual', direction: 'increase', quantity: 2 })).status).toBe(200);
    expect((await adjust(w.admin, { variantId: v, warehouseId: wh2.id, type: 'damage', quantity: 2, reason: 'water damage' })).status).toBe(200);
    expect((await adjust(w.admin, { variantId: v, warehouseId: main.id, type: 'return', quantity: 3, reason: 'customer return' })).status).toBe(200);
    expect((await c.post(`${API}/quarantine`, { variantId: v, warehouseId: main.id, quantity: 1, reason: 'inspection' }, w.admin)).status).toBe(200);
    expect((await c.post(`${API}/incoming`, { variantId: v, warehouseId: main.id, quantity: 15, reason: 'PO-7' }, w.admin)).status).toBe(200);
    await t.pump();

    const r = await c.get(`${API}/overview?movements=30`, w.admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const o = r.body.data;
    expect(o).toMatchObject({ live: true, mode: 'warehouse' });
    // on hand 32 + 8 = 40, reserved 4 -> available 36
    expect(o.pulse).toEqual({ available: 36, reserved: 4, incoming: 15, returned: 2, damaged: 2, quarantined: 1, flow: { incomingToday: 40 } });
    expect(o.ledger.total).toBe(1);

    // 4 units sold over the 14 day window -> 4/14 per day; 36 available -> 126 days of cover; default lead time 7 days
    expect(o.horizon).toMatchObject({ leadTimeBasis: 'default', defaultLeadTimeDays: 7, windowDays: 14 });
    expect(o.horizon.items).toHaveLength(1);
    expect(o.horizon.items[0]).toMatchObject({ variantId: v, sku: w.variant.sku, stock: 36, unitsPerDay: 0.29, coverDays: 126, leadTimeDays: 7, leadTimeSource: 'default', health: 'healthy' });
    expect(o.horizon.items[0].action).toMatchObject({ key: 'view_product' });
    expect(o.horizon.scaleMaxDays).toBeGreaterThanOrEqual(126);

    const sig = Object.fromEntries(o.signals.map((s: any) => [s.key, s]));
    expect(Object.keys(sig)).toEqual(['low_stock', 'stockout_risk', 'inventory_mismatch', 'slow_moving', 'high_velocity', 'aging_inventory', 'warehouse_imbalance']);
    expect(sig.low_stock.count).toBe(0);
    expect(sig.stockout_risk.count).toBe(0);
    expect(sig.inventory_mismatch.count).toBe(0);
    expect(sig.high_velocity.count).toBe(1);
    expect(sig.slow_moving.count).toBe(0);
    expect(sig.aging_inventory.count).toBe(0);
    expect(sig.low_stock.trend).toHaveLength(7);
    expect(sig.stockout_risk.trend).toHaveLength(7);
    expect(sig.high_velocity.trend).toBeNull(); // history of a moving-window signal is not derivable: never faked
    expect(sig.low_stock.href).toBe('/inventory?signal=low_stock');

    // all demand (the reservation) is at MAIN while WH2 holds 22% of the stock: both warehouses deviate by more than 20 points
    expect(sig.warehouse_imbalance.count).toBe(2);
    expect(o.distribution.byWarehouse.map((x: any) => [x.warehouseId, x.units])).toEqual([[main.id, 28], [wh2.id, 8]]);
    expect(o.distribution.byWarehouse[0]).toMatchObject({ sharePct: 77.8, demandSharePct: 100 });
    expect(o.distribution.insight).toMatchObject({ warehouseId: wh2.id, advisoryOnly: true });
    expect(o.advisory).toMatchObject({ recommendationOnly: true, items: [] });

    // recent movements: human text from type + reference
    const texts = (o.recentMovements as any[]).map((m) => m.text);
    expect(texts).toContain('Sandbox marketplace order reduced master inventory');
    expect(texts).toContain('Manual stock adjustment');
    expect(texts).toContain('3 returned units moved to Returned stock');
    expect(texts).toContain('1 unit moved to Quarantine');
    expect(texts.some((x: string) => /^30 units received into /.test(x))).toBe(true);
    expect(texts.some((x: string) => /^Inventory sync completed for Sandbox marketplace/.test(x))).toBe(true);
    const reserved = (o.recentMovements as any[]).find((m) => m.type === 'order_reserved');
    expect(reserved.detail).toBe('30 -> 26'); // available at that location before / after the order
    expect(reserved.ref.type).toBe('order');

    // filtering by warehouse
    const one = (await c.get(`${API}/overview?warehouseId=${wh2.id}`, w.admin)).body.data;
    expect(one.pulse).toMatchObject({ available: 8, reserved: 0, damaged: 2, incoming: 0 });
    expect(one.distribution.byWarehouse).toHaveLength(1);
  });

  it('horizon health follows the lead time rules; no sales means null cover, never infinite', async () => {
    const w2 = await buildWorld(t, c, { stock: [30], sku: 'HZ-SELLER' });
    await orderArrives(t, c, w2, 14); // 14 sold in 14 days = exactly 1 per day; 16 left
    const wh = w2.warehouses[0]!;
    const quiet = await c.makeVariant(w2.admin, { sku: 'HZ-QUIET' });
    await c.stock(w2.admin, quiet.variantId, wh.id, 5); // stock, no sales
    const gone = await c.makeVariant(w2.admin, { sku: 'HZ-GONE' });
    await c.stock(w2.admin, gone.variantId, wh.id, 3);
    expect((await adjust(w2.admin, { variantId: gone.variantId, warehouseId: wh.id, type: 'correction', direction: 'decrease', quantity: 3 })).status).toBe(200); // available 0

    const horizon = async () => Object.fromEntries(((await c.get(`${API}/overview`, w2.admin)).body.data.horizon.items as any[]).map((i) => [i.sku, i]));
    let h = await horizon();
    expect(h['HZ-SELLER']).toMatchObject({ stock: 16, unitsPerDay: 1, coverDays: 16, leadTimeDays: 7, health: 'healthy' });
    expect(h['HZ-QUIET']).toMatchObject({ stock: 5, unitsPerDay: 0, coverDays: null, health: 'healthy' });
    expect(h['HZ-GONE']).toMatchObject({ stock: 0, coverDays: null, health: 'stockout', action: { key: 'review_stock' } });
    expect(((await c.get(`${API}/overview`, w2.admin)).body.data.horizon.items as any[]).map((i) => i.sku)[0]).toBe('HZ-GONE'); // most urgent first

    await setSettings(w2.admin, { inventory: { defaultLeadTimeDays: 20 } }); // cover 16 < 20
    h = await horizon();
    expect(h['HZ-SELLER']).toMatchObject({ leadTimeDays: 20, health: 'attention', action: { key: 'review_replenishment', label: 'Reorder attention required' } });
    await setSettings(w2.admin, { inventory: { defaultLeadTimeDays: 40 } }); // cover 16 < 20 (half of 40)
    h = await horizon();
    expect(h['HZ-SELLER']).toMatchObject({ health: 'critical', action: { label: 'Review replenishment' } });
    let o = (await c.get(`${API}/overview`, w2.admin)).body.data;
    expect(o.signals.find((s: any) => s.key === 'stockout_risk').count).toBe(1);
    expect(o.advisory.items).toEqual([expect.objectContaining({ sku: 'HZ-SELLER', units: 16, coverDays: 16, leadTimeDays: 40 })]);
    expect(o.advisory.text).toBe('1 product may stock out before its expected replenishment lead time.');

    // a variant lead time wins over the business default
    await sqlExec(`update product_variants set lead_time_days = 10 where sku = 'HZ-SELLER'`);
    h = await horizon();
    expect(h['HZ-SELLER']).toMatchObject({ leadTimeDays: 10, leadTimeSource: 'variant', health: 'healthy' });
    expect((await c.get(`${API}/overview`, w2.admin)).body.data.horizon.leadTimeBasis).toBe('variant');
    await sqlExec(`update product_variants set lead_time_days = 20 where sku = 'HZ-SELLER'`);
    expect((await horizon())['HZ-SELLER']).toMatchObject({ health: 'attention' }); // 16 < 20 but not < 10

    // signals with real thresholds
    expect((await c.put(`${API}/reorder-level`, { variantId: w2.variant.variantId, warehouseId: wh.id, reorderLevel: 20 }, w2.admin)).status).toBe(200);
    o = (await c.get(`${API}/overview`, w2.admin)).body.data;
    const sig = Object.fromEntries(o.signals.map((s: any) => [s.key, s.count]));
    expect(sig).toMatchObject({ low_stock: 1, slow_moving: 1, high_velocity: 1, aging_inventory: 0 }); // low: SELLER (16 <= 20); slow: QUIET (5 units, no sales)
    expect((await c.get(`${API}/overview?agingDays=0`, w2.admin)).body.data.signals.find((s: any) => s.key === 'aging_inventory').count).toBe(2); // SELLER + QUIET hold stock and have no movement newer than "now"
    // the 7 point trend replays the ledger: the reorder level was just set, so low stock holds on every day of the window only where stock was already at/below it
    expect(o.signals.find((s: any) => s.key === 'low_stock').trend).toHaveLength(7);
    expect(o.signals.find((s: any) => s.key === 'low_stock').trend.at(-1)).toBe(1);
    await ledgerOk(w2.admin);
  });

  it('asOf: today is live, the past is not, the future is refused', async () => {
    const { admin } = await plainShop([['AS-1', 3]]);
    const today = (await c.get(`${API}/overview`, admin)).body.data.asOf;
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await c.get(`${API}/overview?asOf=${today}`, admin)).body.data.live).toBe(true);
    const past = (await c.get(`${API}/overview?asOf=2020-01-01`, admin)).body.data;
    expect(past).toMatchObject({ asOf: '2020-01-01', live: false });
    expect(past.pulse.flow.incomingToday).toBe(0);
    expect(past.recentMovements).toEqual([]);
    expect((await c.get(`${API}/overview?asOf=2999-01-01`, admin)).status).toBe(400);
    expect((await c.get(`${API}/overview?asOf=yesterday`, admin)).status).toBe(400);
  });

  it('simple mode returns the single location and no distribution; an empty business is all zeros', async () => {
    const admin = await c.registerVendor({ businessName: 'Empty Home' });
    await setSettings(admin, { inventory: { mode: 'simple' } });
    await c.makeWarehouse(admin, { code: 'HOME', name: 'Home Inventory' });
    const o = (await c.get(`${API}/overview`, admin)).body.data;
    expect(o.mode).toBe('simple');
    expect(o.distribution).toBeUndefined();
    expect(o.location).toMatchObject({ name: 'Home Inventory' });
    expect(o.pulse).toEqual({ available: 0, reserved: 0, incoming: 0, returned: 0, damaged: 0, quarantined: 0, flow: { incomingToday: 0 } });
    expect(o.ledger.total).toBe(0);
    expect(o.signals.map((s: any) => s.key)).not.toContain('warehouse_imbalance');
    expect(o.horizon.items).toEqual([]);

    const v = await c.makeVariant(admin, { sku: 'HOME-1' });
    const wh = (await c.get('/api/v1/warehouses', admin)).body.data[0];
    await c.stock(admin, v.variantId, wh.id, 9);
    const led = (await c.get(`${API}/ledger`, admin)).body.data;
    expect(led.total).toBe(1);
    expect(led.items[0]).toMatchObject({ sku: 'HOME-1', available: 9, warehouse: null }); // no warehouse column in simple mode
  });

  it('is permission gated and tenant isolated', async () => {
    const w3 = await buildWorld(t, c, { stock: [5] });
    const viewer3 = await c.addMember(w3.admin, 'vendor_viewer');
    expect((await c.get(`${API}/overview`, viewer3)).status).toBe(200);
    expect((await c.get(`${API}/overview`)).status).toBe(401);
    const other = await c.registerVendor({ businessName: 'Spy Co' });
    const o = (await c.get(`${API}/overview`, other)).body.data;
    expect(o.pulse.available).toBe(0);
    expect(o.ledger.total).toBe(0);
    expect(o.recentMovements).toEqual([]);
    expect((await c.get(`${API}/overview?warehouseId=${w3.warehouses[0]!.id}`, other)).body.data.pulse.available).toBe(0);
    void viewer;
  });
});

// ================================================================================================
describe('channel synchronisation', () => {
  it('reports healthy, syncing, not connected, and turns a failing push into an incident with affected SKUs and a retry', async () => {
    const w = await buildWorld(t, c, { stock: [20] });
    const [wh, v] = [w.warehouses[0]!, w.variant];
    const pending = await c.post('/api/v1/marketplace-accounts', { marketplace: 'mock', displayName: 'Not yet connected', mode: 'sandbox' }, w.admin); // never authorised
    expect(pending.status).toBe(201);

    let cs = (await c.get(`${API}/channel-sync`, w.admin)).body.data;
    expect(cs.master.available).toBe(20);
    expect(cs.master.lastUpdateAt).toBeTruthy();
    const live = cs.channels.find((x: any) => x.channel.accountId === w.account.id);
    expect(live).toMatchObject({ state: 'healthy', sentUnits: 20, affectedSkus: 0, lastSyncLabel: 'reported', channel: { code: 'mock', availability: 'live' } });
    expect(cs.channels.find((x: any) => x.accountName === 'Not yet connected')).toMatchObject({ state: 'not_connected', lastSyncLabel: 'not_reported', sentUnits: 0 });
    expect(cs.incidents).toEqual([]);

    // a stock change queues an inventory job: the channel is "syncing" until it has run
    await c.stock(w.admin, v.variantId, wh.id, 1);
    await t.relayEvents();
    cs = (await c.get(`${API}/channel-sync`, w.admin)).body.data;
    expect(cs.channels.find((x: any) => x.channel.accountId === w.account.id).state).toBe('syncing');
    expect(cs.operations.syncing.channels).toBe(1);
    await t.pump();
    expect((await c.get(`${API}/channel-sync`, w.admin)).body.data.channels.find((x: any) => x.channel.accountId === w.account.id)).toMatchObject({ state: 'healthy', sentUnits: 21 });
    expect((await c.get(`${API}/ledger?filter[channel]=mock`, w.admin)).body.data.items[0]).toMatchObject({ sku: v.sku, channelSync: 'healthy' });

    // the marketplace refuses the SKU from now on
    mockControl.state.seller(w.account.sellerId).products.delete(v.sku);
    await c.stock(w.admin, v.variantId, wh.id, 4);
    await t.pump();
    cs = (await c.get(`${API}/channel-sync`, w.admin)).body.data;
    expect(cs.channels.find((x: any) => x.channel.accountId === w.account.id)).toMatchObject({ state: 'attention', affectedSkus: 1, affectedProducts: 1, sentUnits: 21 });
    expect(cs.incidents).toHaveLength(1);
    expect(cs.incidents[0]).toMatchObject({ title: 'Sandbox marketplace inventory sync needs attention', affected: { skus: 1, variants: 1, products: 1 } });
    expect(cs.incidents[0].reason).toBeTruthy();
    expect(cs.incidents[0].lastFailedAt).toBeTruthy();
    expect(cs.incidents[0].actions.map((a: any) => a.key)).toEqual(['retry_sync', 'view_affected']);
    expect(cs.operations.requireReview).toEqual({ skus: 1, channels: 1 });

    const aff = await c.get(`${API}/channel-sync/${w.account.id}/affected`, w.admin);
    expect(aff.body.data).toMatchObject({ total: 1, page: 1, pages: 1 });
    expect(aff.body.data.items[0]).toMatchObject({ variantId: v.variantId, sku: v.sku, masterAvailable: 25, channelQuantity: 21, lastError: { code: 'SKU_NOT_FOUND' } });
    expect(aff.body.data.items[0].lastTriedAt).toBeTruthy();

    // the same product shows up in the ledger and the panel, and in the mismatch signal
    expect((await c.get(`${API}/ledger?filter[channel]=mock`, w.admin)).body.data.items[0].channelSync).toBe('failed');
    expect((await c.get(`${API}/ledger?filter[channel]=flipkart`, w.admin)).body.data.total).toBe(0);
    expect((await c.get(`${API}/ledger?filter[channel]=${w.account.id}`, w.admin)).body.data.total).toBe(1);
    expect((await c.get(`${API}/ledger?filter[signal]=inventory_mismatch`, w.admin)).body.data.items.map((i: any) => i.sku)).toEqual([v.sku]);
    expect((await c.get(`${API}/overview`, w.admin)).body.data.signals.find((s: any) => s.key === 'inventory_mismatch').count).toBe(1);
    const panel = (await c.get(`${API}/variants/${v.variantId}/panel`, w.admin)).body.data;
    expect(panel.channelAvailability[0]).toMatchObject({ channel: { code: 'mock' }, status: 'failed', quantity: 25, lastError: expect.any(String) });

    // retry: one account -> 202 + a job; no account -> every connected account
    const retry = await c.post(`${API}/channel-sync`, { accountId: w.account.id }, w.admin);
    expect(retry.status, JSON.stringify(retry.body)).toBe(202);
    expect(retry.body.data).toMatchObject({ requested: 1, queued: 1, results: [{ accountId: w.account.id, status: 'queued', channel: { code: 'mock' } }] });
    const jobId = retry.body.data.results[0].jobId;
    expect((await c.get(`/api/v1/sync/jobs/${jobId}`, w.admin)).body.data).toMatchObject({ type: 'inventory', trigger: 'manual' });
    await t.pump();
    const all = await c.post(`${API}/channel-sync`, {}, w.admin);
    expect(all.status).toBe(202);
    expect(all.body.data.requested).toBe(1); // the unauthorised account is not synced
    expect((await c.post(`${API}/channel-sync`, { accountId: '00000000-0000-4000-8000-000000000000' }, w.admin)).status).toBe(404);

    // permissions + tenancy
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    expect((await c.get(`${API}/channel-sync`, viewer)).status).toBe(200);
    expect((await c.post(`${API}/channel-sync`, {}, viewer)).status).toBe(403);
    const other = await c.registerVendor({ businessName: 'Other Sync' });
    expect((await c.get(`${API}/channel-sync/${w.account.id}/affected`, other)).status).toBe(404);
    expect((await c.post(`${API}/channel-sync`, { accountId: w.account.id }, other)).status).toBe(404);
    const oc = (await c.get(`${API}/channel-sync`, other)).body.data;
    expect(oc).toMatchObject({ master: { available: 0 }, channels: [], incidents: [] });
  });
});

// ================================================================================================
describe('ledger table, filters, pagination and selection', () => {
  it('applies each filter, sorts, paginates and keeps selection-count equal to the ledger total', async () => {
    const { admin, whs, variants } = await plainShop([['F-A', 5], ['F-B', 50]], 2);
    const [wh1, wh2] = whs as unknown as [{ id: string }, { id: string }];
    const f = await c.makeVariant(admin, { sku: 'F-C' });
    await c.stock(admin, f.variantId, wh2.id, 3);
    await adjust(admin, { variantId: f.variantId, warehouseId: wh2.id, type: 'manual', direction: 'decrease', quantity: 3 });
    const g = await c.makeVariant(admin, { sku: 'F-D' });
    await c.stock(admin, g.variantId, wh2.id, 20);
    const list = (qs: string) => c.get(`${API}/ledger?${qs}`, admin);

    const first = await list('q=F-&pageSize=100');
    expect(items(first).map((i) => i.sku)).toEqual(['F-C', 'F-A', 'F-B', 'F-D']); // default order: most urgent first (stockout), then by SKU
    expect(items(first).find((i) => i.sku === 'F-B')).toMatchObject({ available: 50, reserved: 0, incoming: 0, returned: 0, damaged: 0, quarantined: 0, unitsPerDay: 0, coverDays: null, leadTimeDays: 7, health: 'healthy', channelSync: 'not_listed', thumbnailUrl: null, borderTone: 'good', warehouse: { id: wh1.id } });
    expect(items(first).find((i) => i.sku === 'F-C')).toMatchObject({ health: 'stockout', borderTone: 'bad', available: 0 });
    expect(items(first)[0].lastMovementAt).toBeTruthy();
    expect(skus(await list('q=F-'))).toEqual(['F-A', 'F-B', 'F-C', 'F-D']);
    expect(skus(await list('q=f-b'))).toEqual(['F-B']); // case-insensitive
    expect(skus(await list(`filter[warehouse]=${wh2.id}`))).toEqual(['F-C', 'F-D']);
    expect(skus(await list(`filter[warehouse]=${wh1.id}`))).toEqual(['F-A', 'F-B']);
    expect(skus(await list('filter[health]=stockout'))).toEqual(['F-C']);
    expect(skus(await list('filter[health]=healthy'))).toEqual(['F-A', 'F-B', 'F-D']);
    expect(skus(await list('filter[health]=stockout_risk'))).toEqual([]);
    expect(skus(await list('filter[stockMin]=10'))).toEqual(['F-B', 'F-D']);
    expect(skus(await list('filter[stockMax]=5'))).toEqual(['F-A', 'F-C']);
    expect(skus(await list('filter[stockMin]=5&filter[stockMax]=20'))).toEqual(['F-A', 'F-D']);
    expect(skus(await list('filter[movement]=adjusted'))).toEqual(['F-C']);
    expect(skus(await list('filter[movement]=received'))).toEqual(['F-A', 'F-B', 'F-D']);
    expect(skus(await list('filter[movement]=returned'))).toEqual([]);

    // low stock signal needs a reorder level
    await c.put(`${API}/reorder-level`, { variantId: variants[0]!.variantId, warehouseId: wh1.id, reorderLevel: 10 }, admin);
    expect(skus(await list('filter[signal]=low_stock'))).toEqual(['F-A']);
    expect(skus(await list('filter[signal]=slow_moving'))).toEqual(['F-A', 'F-B', 'F-D']); // no sales, stock on hand
    expect(skus(await list('filter[signal]=high_velocity'))).toEqual([]);
    expect(skus(await list('filter[signal]=warehouse_imbalance'))).toEqual([]); // no demand yet: no imbalance can be claimed

    // saved group
    const grp = await c.post(`${API}/groups`, { name: 'Summer edit', variantIds: [variants[0]!.variantId, g.variantId] }, admin);
    expect(grp.status).toBe(201);
    expect(skus(await list(`filter[group]=${grp.body.data.id}`))).toEqual(['F-A', 'F-D']);

    // sorting and numbered pages
    expect(items(await list('sort=-available')).map((i) => i.sku)).toEqual(['F-B', 'F-D', 'F-A', 'F-C']);
    expect(items(await list('sort=sku&pageSize=100')).map((i) => i.sku)).toEqual(['F-A', 'F-B', 'F-C', 'F-D']);
    expect(items(await list('sort=coverDays')).length).toBe(4);
    const p1 = await list('sort=sku&pageSize=3&page=1');
    const p2 = await list('sort=sku&pageSize=3&page=2');
    expect(p1.body.data).toMatchObject({ total: 4, page: 1, pageSize: 3, pages: 2 });
    expect(items(p1).map((i) => i.sku)).toEqual(['F-A', 'F-B', 'F-C']);
    expect(items(p2).map((i) => i.sku)).toEqual(['F-D']);
    expect((await list('page=0')).status).toBe(400);
    expect((await list('pageSize=101')).status).toBe(400);
    expect((await list('filter[health]=nonsense')).status).toBe(400);

    // selection count = "N products selected"
    const count = async (filters: Record<string, unknown>) => (await c.post(`${API}/ledger/selection-count`, { filters }, admin)).body.data.total;
    expect(await count({})).toBe(4);
    expect(await count({ health: 'healthy' })).toBe(3);
    expect(await count({ warehouse: wh2.id, stockMin: 10 })).toBe(1);
    expect(await count({ q: 'f-' })).toBe((await list('q=f-')).body.data.total);
    expect((await c.post(`${API}/ledger/selection-count`, { filters: { health: 'bogus' } }, admin)).status).toBe(400);
    expect((await c.post(`${API}/ledger/selection-count`, { filters: { surprise: 1 } }, admin)).status).toBe(400);

    // tenant isolation + read permission
    const other = await c.registerVendor({ businessName: 'Ledger Spy' });
    expect((await c.get(`${API}/ledger`, other)).body.data.total).toBe(0);
    expect((await c.post(`${API}/ledger/selection-count`, { filters: {} }, other)).body.data.total).toBe(0);
    expect((await c.get(`${API}/ledger?filter[group]=${grp.body.data.id}`, other)).body.data.total).toBe(0);
    const viewer = await c.addMember(admin, 'vendor_viewer');
    expect((await c.get(`${API}/ledger`, viewer)).status).toBe(200);
  });

  it('shows the quarantined bucket next to returned and damaged', async () => {
    const { admin, whs, variants } = await plainShop([['LQ-1', 10]]);
    const [wh, v] = [whs[0]!, variants[0]!];
    await c.post(`${API}/returns`, { variantId: v.variantId, warehouseId: wh.id, quantity: 4, reason: 'returns' }, admin);
    await c.post(`${API}/quarantine`, { variantId: v.variantId, warehouseId: wh.id, quantity: 2, reason: 'repair' }, admin);
    expect(items(await c.get(`${API}/ledger`, admin))[0]).toMatchObject({ available: 10, returned: 2, quarantined: 2, damaged: 0 });
    expect((await c.get(`${API}/overview`, admin)).body.data.pulse).toMatchObject({ available: 10, returned: 2, quarantined: 2 });
  });
});

// ================================================================================================
describe('variant context panel', () => {
  it('shows snapshot, stock by location, what each channel was told, health and recent movements', async () => {
    const w = await buildWorld(t, c, { warehouses: 2, stock: [30, 12] });
    await orderArrives(t, c, w, 5);
    await c.post(`${API}/incoming`, { variantId: w.variant.variantId, warehouseId: w.warehouses[0]!.id, quantity: 100, reason: 'PO' }, w.admin);
    await t.pump();
    const r = await c.get(`${API}/variants/${w.variant.variantId}/panel`, w.admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const p = r.body.data;
    expect(p.product).toMatchObject({ variantId: w.variant.variantId, sku: w.variant.sku, thumbnailUrl: null });
    expect(p.snapshot).toMatchObject({ available: 37, reserved: 5, incoming: 100, onHand: 42 });
    expect(p.byLocation.map((l: any) => [l.code, l.available, l.onHand, l.reserved])).toEqual([['MAIN', 25, 30, 5], ['WH2', 12, 12, 0]]);
    expect(p.channelAvailability).toHaveLength(1);
    expect(p.channelAvailability[0]).toMatchObject({ channel: { code: 'mock', accountId: w.account.id }, quantity: 37, status: 'healthy', lastError: null });
    expect(mockControl.quantity(w.account.sellerId, w.variant.sku)).toBe(37); // the panel shows the number that really sits on the channel
    expect(p.health).toMatchObject({ state: 'healthy', tone: 'good' });
    expect(p.health.text).toMatch(/above the 7-day lead time/);
    expect(p.metrics).toMatchObject({ unitsPerDay: 0.36, leadTimeDays: 7, windowDays: 14, lowStockThreshold: null });
    expect(p.recentMovements.length).toBeGreaterThan(0);
    expect(p.recentMovements.length).toBeLessThanOrEqual(5);
    expect(p.recentMovements[0].text).toMatch(/on the way to|order reduced master inventory/);
    expect(p.actions.map((a: any) => [a.key, a.enabled])).toEqual([['adjust_stock', true], ['transfer', true], ['view_product', true], ['view_sync_history', true]]);

    // attention text names coverage against lead time
    await setSettings(w.admin, { inventory: { defaultLeadTimeDays: 120 } });
    const att = (await c.get(`${API}/variants/${w.variant.variantId}/panel`, w.admin)).body.data;
    expect(att.health.state).toBe('attention');
    expect(att.health.text).toBe('Estimated coverage is 103.6 days while lead time is 120 days.');

    // viewers can look, not act
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    const vp = await c.get(`${API}/variants/${w.variant.variantId}/panel`, viewer);
    expect(vp.status).toBe(200);
    expect(vp.body.data.actions.find((a: any) => a.key === 'adjust_stock')).toMatchObject({ enabled: false, disabledReason: expect.any(String) });

    // unknown id and other tenants -> 404
    expect((await c.get(`${API}/variants/00000000-0000-4000-8000-000000000000/panel`, w.admin)).status).toBe(404);
    const other = await c.registerVendor({ businessName: 'Panel Spy' });
    expect((await c.get(`${API}/variants/${w.variant.variantId}/panel`, other)).status).toBe(404);
  });
});

// ================================================================================================
describe('adjustments and their preview', () => {
  it('the preview shows exactly what the write then does, for every type, without writing', async () => {
    const { admin, whs, variants } = await plainShop([['ADJ-1', 42]]);
    const [wh, v] = [whs[0]!, variants[0]!];
    const base = { variantId: v.variantId, warehouseId: wh.id };
    const movements = async () => (await c.get(`${API}/movements?filter[variantId]=${v.variantId}`, admin)).body.data.items.length;
    const cases: Array<[string, Record<string, unknown>, number, Record<string, number>]> = [
      ['damage', { type: 'damage', quantity: 6, reason: 'Damaged units' }, -6, { onHand: 36, damaged: 6, available: 36 }],
      ['return (held)', { type: 'return', quantity: 3, reason: 'Customer return' }, 0, { onHand: 36, returned: 3, available: 36 }],
      ['return (restock)', { type: 'return', quantity: 2, disposition: 'restock', reason: 'Customer return' }, 2, { onHand: 38, available: 38 }],
      ['correction up', { type: 'correction', direction: 'increase', quantity: 5, reason: 'Found stock' }, 5, { onHand: 43, available: 43 }],
      ['manual down', { type: 'manual', direction: 'decrease', quantity: 4, reason: 'Gift' }, -4, { onHand: 39, available: 39 }],
      ['count', { type: 'correction', setOnHand: 50, reason: 'Cycle count' }, 11, { onHand: 50, available: 50 }],
      ['other', { type: 'other', direction: 'decrease', quantity: 1, reason: 'Sample', note: 'Sent to photographer' }, -1, { onHand: 49, available: 49 }],
      ['restore damaged', { type: 'damage', direction: 'increase', quantity: 1, reason: 'Fixed' }, 1, { onHand: 50, damaged: 5, available: 50 }],
    ];
    for (const [name, body, delta, after] of cases) {
      const before = await movements();
      const cur = (await c.get(`${API}/variants/${v.variantId}`, admin)).body.data.totals.available;
      const pv = await c.post(`${API}/adjustments/preview`, { ...base, ...body }, admin);
      expect(pv.status, `${name}: ${JSON.stringify(pv.body)}`).toBe(200);
      expect(pv.body.data, name).toMatchObject({ currentAvailable: cur, adjustment: delta, newAvailable: cur + delta });
      expect(await movements(), `${name}: the preview wrote nothing`).toBe(before);
      expect((await c.get(`${API}/variants/${v.variantId}`, admin)).body.data.totals.available).toBe(cur);

      const wr = await c.post(`${API}/adjustments`, { ...base, ...body }, admin);
      expect(wr.status, `${name}: ${JSON.stringify(wr.body)}`).toBe(200);
      expect(wr.body.data.result, name).toMatchObject({ currentAvailable: pv.body.data.currentAvailable, adjustment: pv.body.data.adjustment, newAvailable: pv.body.data.newAvailable });
      expect(wr.body.data.stock, name).toMatchObject(after);
      expect(await movements(), name).toBe(before + 1);
    }
    await ledgerOk(admin);
    const moves = (await c.get(`${API}/movements?filter[variantId]=${v.variantId}`, admin)).body.data.items as any[];
    expect(moves.map((m) => m.reason)).toContain('Sample - Sent to photographer'); // reason + note, one audit line
  });

  it('warns about held returns, damage and low stock; refuses what the write would refuse', async () => {
    const { admin, whs, variants } = await plainShop([['ADJ-2', 10]]);
    const [wh, v] = [whs[0]!, variants[0]!];
    const base = { variantId: v.variantId, warehouseId: wh.id, reason: 'check it' };
    await c.put(`${API}/reorder-level`, { variantId: v.variantId, warehouseId: wh.id, reorderLevel: 5 }, admin);
    const warn = async (body: Record<string, unknown>) => (await c.post(`${API}/adjustments/preview`, { ...base, ...body }, admin)).body.data.warnings.map((x: any) => x.code);
    expect(await warn({ type: 'return', quantity: 1 })).toEqual(['held_for_inspection']);
    expect(await warn({ type: 'damage', quantity: 6 })).toEqual(['low_stock', 'moves_to_damaged']);
    expect(await warn({ type: 'manual', direction: 'decrease', quantity: 10 })).toEqual(['stockout']);
    expect(await warn({ type: 'manual', direction: 'increase', quantity: 1 })).toEqual([]);

    // never negative: the preview and the write fail the same way, and nothing changes
    const bad = { ...base, type: 'manual', direction: 'decrease', quantity: 11 };
    const pv = await c.post(`${API}/adjustments/preview`, bad, admin);
    const wr = await c.post(`${API}/adjustments`, bad, admin);
    expect([pv.status, wr.status]).toEqual([409, 409]);
    expect([pv.body.error.code, wr.body.error.code]).toEqual(['INSUFFICIENT_STOCK', 'INSUFFICIENT_STOCK']);
    expect((await c.post(`${API}/adjustments`, { ...base, type: 'damage', quantity: 11 }, admin)).status).toBe(409);
    expect((await c.post(`${API}/adjustments`, { ...base, type: 'damage', direction: 'increase', quantity: 1 }, admin)).status).toBe(409); // nothing is damaged
    expect(await c.available(admin, v.variantId)).toBe(10);
    await ledgerOk(admin);
  });

  it('validates the request: other needs a note, direction/quantity rules, unknown targets, permissions, tenancy, idempotency', async () => {
    const { admin, whs, variants } = await plainShop([['ADJ-3', 10]]);
    const [wh, v] = [whs[0]!, variants[0]!];
    const base = { variantId: v.variantId, warehouseId: wh.id, reason: 'valid reason' };
    const code = async (url: string, body: Record<string, unknown>) => { const r = await c.post(`${API}/${url}`, { ...base, ...body }, admin); return [r.status, r.body.error?.details?.rule]; };
    for (const url of ['adjustments', 'adjustments/preview']) {
      expect(await code(url, { type: 'other', direction: 'decrease', quantity: 1 })).toEqual([400, 'note_required']);
      expect(await code(url, { type: 'other', direction: 'decrease', quantity: 1, note: ' ' })).toEqual([400, 'note_required']);
      expect(await code(url, { type: 'manual', quantity: 1 })).toEqual([400, 'direction_required']);
      expect(await code(url, { type: 'correction', direction: 'increase' })).toEqual([400, 'quantity_required']);
      expect(await code(url, { type: 'correction', setOnHand: 5, quantity: 1 })).toEqual([400, 'quantity_xor_count']);
      expect(await code(url, { type: 'manual', setOnHand: 5 })).toEqual([400, 'set_on_hand_only_for_correction']);
      expect((await c.post(`${API}/${url}`, { ...base, type: 'bogus', quantity: 1 }, admin)).status).toBe(400);
      expect((await c.post(`${API}/${url}`, { ...base, type: 'damage', quantity: 0 }, admin)).status).toBe(400);
      expect((await c.post(`${API}/${url}`, { ...base, variantId: '00000000-0000-4000-8000-000000000000', type: 'damage', quantity: 1 }, admin)).status).toBe(404);
      expect((await c.post(`${API}/${url}`, { ...base, warehouseId: '00000000-0000-4000-8000-000000000000', type: 'damage', quantity: 1 }, admin)).status).toBe(404);
    }
    expect((await c.post(`${API}/adjustments`, { ...base, type: 'correction', setOnHand: 10 }, admin)).status).toBe(400); // count equals stock: nothing to adjust

    // idempotent
    const body = { ...base, type: 'manual', direction: 'increase', quantity: 2, idempotencyKey: 'adjustment-key-1' };
    expect((await c.post(`${API}/adjustments`, body, admin)).body.data).toMatchObject({ duplicate: false, stock: { onHand: 12 } });
    expect((await c.post(`${API}/adjustments`, body, admin)).body.data).toMatchObject({ duplicate: true, stock: { onHand: 12 } });
    expect(await c.available(admin, v.variantId)).toBe(12);

    // viewers cannot write or preview; other tenants cannot touch it
    const viewer = await c.addMember(admin, 'vendor_viewer');
    expect((await c.post(`${API}/adjustments`, body, viewer)).status).toBe(403);
    expect((await c.post(`${API}/adjustments/preview`, body, viewer)).status).toBe(403);
    const other = await c.registerVendor({ businessName: 'Adj Spy' });
    expect((await c.post(`${API}/adjustments/preview`, { ...body, idempotencyKey: undefined }, other)).status).toBe(404);
    expect((await c.post(`${API}/adjustments`, { ...body, idempotencyKey: undefined }, other)).status).toBe(404);
    await ledgerOk(admin);
    const staff = await c.addMember(admin, 'vendor_staff');
    expect((await c.post(`${API}/adjustments`, { ...base, type: 'damage', quantity: 1 }, staff)).status).toBe(200); // staff operate stock
  });
});

// ================================================================================================
describe('opening stock for a variant without a stock row', () => {
  it('finds unstocked variants by SKU / name, and opening_stock creates the row with a ledger entry, a notification and an event', async () => {
    const { admin, whs, variants } = await plainShop([['OPEN-STOCKED', 5]]);
    const wh = whs[0]!;
    const fresh = await c.makeVariant(admin, { sku: 'OPEN-NEW-1', title: 'Fresh Hoodie' });
    const stocked = variants[0]!;

    // the catalog search sees both; unstocked=true only the one without a stock row
    const all = (await c.get(`${API}/catalog-variants?q=OPEN-`, admin)).body.data as any[];
    expect(all.map((v) => [v.sku, v.stocked]).sort()).toEqual([['OPEN-NEW-1', false], ['OPEN-STOCKED', true]]);
    const unstocked = (await c.get(`${API}/catalog-variants?unstocked=true&q=hoodie`, admin)).body.data as any[];
    expect(unstocked).toEqual([expect.objectContaining({ variantId: fresh.variantId, sku: 'OPEN-NEW-1', title: 'Fresh Hoodie', stocked: false, variantName: expect.any(String) })]);
    expect((await c.get(`${API}/catalog-variants?unstocked=true&q=OPEN-STOCKED`, admin)).body.data).toEqual([]);
    expect((await stockRow(admin, fresh.variantId, wh.id))).toBeUndefined();

    // opening stock is increase-only and needs a warehouse
    const base = { variantId: fresh.variantId, warehouseId: wh.id, reason: 'Opening count', type: 'opening_stock' };
    expect((await adjust(admin, { ...base, quantity: 5, direction: 'decrease' })).body.error.details.rule).toBe('opening_stock_requires_increase');
    expect((await adjust(admin, { ...base, quantity: 5, warehouseId: undefined })).status).toBe(400);
    expect((await adjust(admin, { ...base })).body.error.details.rule).toBe('quantity_required');
    const preview = await c.post(`${API}/adjustments/preview`, { ...base, quantity: 12 }, admin);
    expect(preview.body.data).toMatchObject({ currentAvailable: 0, adjustment: 12, newAvailable: 12 });
    expect((await stockRow(admin, fresh.variantId, wh.id))).toBeUndefined(); // the preview wrote nothing

    const done = await adjust(admin, { ...base, quantity: 12, direction: 'increase', idempotencyKey: 'opening-key-1' });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.data).toMatchObject({ duplicate: false, type: 'opening_stock', stock: { warehouseId: wh.id, onHand: 12, available: 12 } });
    expect((await adjust(admin, { ...base, quantity: 12, idempotencyKey: 'opening-key-1' })).body.data).toMatchObject({ duplicate: true, stock: { onHand: 12 } });
    expect(await c.available(admin, fresh.variantId)).toBe(12);
    await ledgerOk(admin);

    // it is now a stocked variant, in the ledger, with one ledger movement of the receive kind and a stock_adjusted notification
    expect((await c.get(`${API}/catalog-variants?q=OPEN-NEW-1`, admin)).body.data[0]).toMatchObject({ stocked: true });
    expect(skus(await c.get(`${API}/ledger?q=OPEN-NEW-1`, admin))).toEqual(['OPEN-NEW-1']);
    const moves = (await c.get(`${API}/movements?filter[variantId]=${fresh.variantId}`, admin)).body.data.items as any[];
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ type: 'receive', deltaOnHand: 12 });
    await t.pump();
    const notes = (await c.get('/api/v1/notifications?limit=50', admin)).body.data.items as Array<{ type: string; title: string; body: string | null }>;
    const note = notes.find((n) => n.type === 'inventory.stock_adjusted' && n.title.includes('OPEN-NEW-1'));
    expect(note?.title).toBe('Stock adjusted (opening stock): OPEN-NEW-1');
    expect(note?.body).toMatch(/^0 to 12 available/);
    expect(stocked.sku).toBe('OPEN-STOCKED');

    // viewers read the search but cannot write; other tenants see nothing of it
    const viewer = await c.addMember(admin, 'vendor_viewer');
    expect((await c.get(`${API}/catalog-variants?q=OPEN-`, viewer)).status).toBe(200);
    expect((await adjust(viewer, { ...base, quantity: 1 })).status).toBe(403);
    const other = await c.registerVendor({ businessName: 'Catalog Spy' });
    expect((await c.get(`${API}/catalog-variants?q=OPEN-`, other)).body.data).toEqual([]);
  });
});

// ================================================================================================
describe('bulk operations, groups and export', () => {
  it('adjusts a selection per variant and reports partial failures without blocking the others', async () => {
    const { admin, whs, variants } = await plainShop([['BLK-X', 10], ['BLK-Y', 2], ['BLK-Z', 10]]);
    const wh = whs[0]!;
    const [x, y, z] = variants as [any, any, any];
    const r = await c.post(`${API}/bulk`, {
      selection: { mode: 'ids', ids: [x.variantId, y.variantId, z.variantId, '00000000-0000-4000-8000-000000000000'] },
      action: 'adjust', params: { type: 'manual', direction: 'decrease', quantity: 5, reason: 'Stock take loss', warehouseId: wh.id },
    }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ action: 'adjust', total: 4, succeeded: 2, failed: 2, jobId: null });
    const by = Object.fromEntries((r.body.data.results as any[]).map((x) => [x.sku ?? x.variantId, x]));
    expect(by['BLK-X']).toMatchObject({ ok: true });
    expect(by['BLK-Z']).toMatchObject({ ok: true });
    expect(by['BLK-Y']).toMatchObject({ ok: false, error: { code: 'INSUFFICIENT_STOCK' } });
    expect(by['00000000-0000-4000-8000-000000000000']).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect([await c.available(admin, x.variantId), await c.available(admin, y.variantId), await c.available(admin, z.variantId)]).toEqual([5, 2, 5]);
    await ledgerOk(admin);

    // no explicit location: the one holding the most stock is used
    const r2 = await c.post(`${API}/bulk`, { selection: { mode: 'ids', ids: [x.variantId] }, action: 'adjust', params: { type: 'damage', quantity: 1, reason: 'Dropped' } }, admin);
    expect(r2.body.data).toMatchObject({ succeeded: 1 });
    expect((await c.get(`${API}/variants/${x.variantId}`, admin)).body.data.totals).toMatchObject({ available: 4, damaged: 1 });

    // validation
    expect((await c.post(`${API}/bulk`, { selection: { mode: 'ids', ids: [x.variantId] }, action: 'adjust', params: { type: 'manual', quantity: 1 } }, admin)).status).toBe(400); // no reason
    expect((await c.post(`${API}/bulk`, { selection: { mode: 'ids', ids: [x.variantId] }, action: 'adjust', params: { type: 'other', direction: 'increase', quantity: 1, reason: 'no note' } }, admin)).body.error.details.rule).toBe('note_required');
    const tooMany = Array.from({ length: 501 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect((await c.post(`${API}/bulk`, { selection: { mode: 'ids', ids: tooMany }, action: 'export', params: {} }, admin)).status).toBe(400);
    expect((await c.post(`${API}/bulk`, { selection: { mode: 'ids', ids: [] }, action: 'export', params: {} }, admin)).status).toBe(400);
    expect((await c.post(`${API}/bulk`, { selection: { mode: 'everything' }, action: 'export' }, admin)).status).toBe(400);
  });

  it('all_matching applies the ledger filters; transfer, group, export and sync act per variant', async () => {
    const w = await buildWorld(t, c, { warehouses: 2, stock: [20, 0], sku: 'ALL-LIST' });
    const [main, wh2] = w.warehouses as unknown as [{ id: string }, { id: string }];
    const small = await c.makeVariant(w.admin, { sku: 'ALL-SMALL' });
    await c.stock(w.admin, small.variantId, main.id, 2);
    const big = await c.makeVariant(w.admin, { sku: 'ALL-BIG', title: '=HYPERLINK("http://evil")' });
    await c.stock(w.admin, big.variantId, main.id, 40);
    const other = await c.makeVariant(w.admin, { sku: 'ZZ-OTHER' });
    await c.stock(w.admin, other.variantId, main.id, 40);

    // transfer: one draft transfer for the variants that have enough stock in the source
    const tr = await c.post(`${API}/bulk`, { selection: { mode: 'all_matching', filters: { q: 'ALL-' } }, action: 'transfer', params: { fromWarehouseId: main.id, toWarehouseId: wh2.id, quantity: 5, notes: 'rebalance' } }, w.admin);
    expect(tr.status, JSON.stringify(tr.body)).toBe(200);
    expect(tr.body.data).toMatchObject({ total: 3, succeeded: 2, failed: 1, transfer: { status: 'draft', items: 2 } });
    expect(tr.body.data.results.find((x: any) => x.sku === 'ALL-SMALL')).toMatchObject({ ok: false, error: { code: 'INSUFFICIENT_STOCK' } });
    const transfer = (await c.get(`${API}/transfers/${tr.body.data.transfer.id}`, w.admin)).body.data;
    expect(transfer.items.map((i: any) => [i.sku, i.quantity]).sort()).toEqual([['ALL-BIG', 5], ['ALL-LIST', 5]]);
    expect((await c.post(`${API}/bulk`, { selection: { mode: 'ids', ids: [big.variantId] }, action: 'transfer', params: { fromWarehouseId: main.id, toWarehouseId: main.id, quantity: 1 } }, w.admin)).status).toBe(400);
    expect((await c.post(`${API}/bulk`, { selection: { mode: 'ids', ids: [big.variantId] }, action: 'transfer', params: { fromWarehouseId: main.id, quantity: 1 } }, w.admin)).status).toBe(400);

    // group: created by name, filled with the matching variants, idempotent
    const gr = await c.post(`${API}/bulk`, { selection: { mode: 'all_matching', filters: { q: 'ALL-' } }, action: 'group', params: { groupName: 'Bulk picks' } }, w.admin);
    expect(gr.body.data).toMatchObject({ total: 3, succeeded: 3, group: { name: 'Bulk picks', itemCount: 3 } });
    expect((await c.post(`${API}/bulk`, { selection: { mode: 'ids', ids: [other.variantId] }, action: 'group', params: { groupId: gr.body.data.group.id } }, w.admin)).body.data.group.itemCount).toBe(4);
    expect((await c.post(`${API}/bulk`, { selection: { mode: 'ids', ids: [other.variantId] }, action: 'group', params: { groupId: gr.body.data.group.id } }, w.admin)).body.data.group.itemCount).toBe(4);
    expect((await c.post(`${API}/bulk`, { selection: { mode: 'ids', ids: [other.variantId] }, action: 'group', params: { groupId: '00000000-0000-4000-8000-000000000000' } }, w.admin)).status).toBe(404);
    expect((await c.post(`${API}/bulk`, { selection: { mode: 'ids', ids: [other.variantId] }, action: 'group', params: {} }, w.admin)).status).toBe(400);

    // export action returns the CSV inline (formula cells neutralised)
    const ex = await c.post(`${API}/bulk`, { selection: { mode: 'all_matching', filters: { group: gr.body.data.group.id, stockMin: 10 } }, action: 'export', params: {} }, w.admin);
    expect(ex.body.data).toMatchObject({ total: 3, succeeded: 3, export: { contentType: 'text/csv', rows: 3 } });
    const lines = (ex.body.data.export.csv as string).trim().split('\r\n');
    expect(lines[0]).toBe('SKU,Product,Barcode,Warehouse,Available,Reserved,Incoming,Returned,Damaged,Quarantined,Units per day,Cover days,Lead time days,Health,Channel sync,Last movement');
    expect(lines).toHaveLength(4);
    expect(lines.some((l) => l.startsWith(`ALL-BIG,"'=HYPERLINK`))).toBe(true);

    // sync: variants with a live listing queue a job for their channel, the rest are reported
    const sy = await c.post(`${API}/bulk`, { selection: { mode: 'ids', ids: [w.variant.variantId, small.variantId] }, action: 'sync', params: {} }, w.admin);
    expect(sy.status, JSON.stringify(sy.body)).toBe(200);
    expect(sy.body.data.jobs).toEqual([expect.objectContaining({ accountId: w.account.id, status: 'queued', jobId: expect.any(String) })]);
    expect(sy.body.data.results.find((x: any) => x.sku === 'ALL-LIST')).toMatchObject({ ok: true });
    expect(sy.body.data.results.find((x: any) => x.sku === 'ALL-SMALL')).toMatchObject({ ok: false, error: { code: 'NOT_LISTED' } });

    // all_matching adjust honours the filters
    const adj = await c.post(`${API}/bulk`, { selection: { mode: 'all_matching', filters: { q: 'ZZ-' } }, action: 'adjust', params: { type: 'manual', direction: 'increase', quantity: 1, reason: 'Recount' } }, w.admin);
    expect(adj.body.data).toMatchObject({ total: 1, succeeded: 1 });
    expect(await c.available(w.admin, other.variantId)).toBe(41);
    expect(await c.available(w.admin, big.variantId)).toBe(40);
    await ledgerOk(w.admin);

    // permissions + tenancy
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    expect((await c.post(`${API}/bulk`, { selection: { mode: 'ids', ids: [big.variantId] }, action: 'export', params: {} }, viewer)).status).toBe(403);
    const spy = await c.registerVendor({ businessName: 'Bulk Spy' });
    const sp = await c.post(`${API}/bulk`, { selection: { mode: 'ids', ids: [big.variantId] }, action: 'adjust', params: { type: 'manual', direction: 'increase', quantity: 1, reason: 'Sneaky' } }, spy);
    expect(sp.body.data).toMatchObject({ total: 1, succeeded: 0, results: [{ ok: false, error: { code: 'NOT_FOUND' } }] });
    expect((await c.post(`${API}/bulk`, { selection: { mode: 'all_matching', filters: {} }, action: 'adjust', params: { type: 'manual', direction: 'increase', quantity: 1, reason: 'Sneaky' } }, spy)).body.data.total).toBe(0);
    expect(await c.available(w.admin, big.variantId)).toBe(40);
  });

  it('refuses to process more than the cap of matching products at once (413) and tells the user to narrow the filters', async () => {
    const { admin } = await plainShop([['CAP-1', 5], ['CAP-2', 5], ['CAP-3', 5], ['CAP-4', 5], ['OTHER-1', 5]]);
    const was = { ...bulkLimits };
    bulkLimits.allMax = 3; // the production cap is 5,000; a small one keeps the test fast and exercises the same code path
    bulkLimits.exportMax = 3;
    try {
      for (const body of [
        { selection: { mode: 'all_matching', filters: {} }, action: 'export', params: {} },
        { selection: { mode: 'all_matching', filters: { q: 'CAP-' } }, action: 'adjust', params: { type: 'manual', direction: 'increase', quantity: 1, reason: 'Recount' } },
      ]) {
        const r = await c.post(`${API}/bulk`, body, admin);
        expect(r.status).toBe(413);
        expect(r.body.error.message).toMatch(/Narrow the filters/);
      }
      expect((await c.get(`${API}/export`, admin)).status).toBe(413);
      expect(await c.available(admin, (await c.get(`${API}/ledger?q=CAP-1`, admin)).body.data.items[0].variantId)).toBe(5); // nothing was applied
      // narrowing the filters works again
      const ok = await c.post(`${API}/bulk`, { selection: { mode: 'all_matching', filters: { q: 'OTHER' } }, action: 'export', params: {} }, admin);
      expect(ok.status).toBe(200);
      expect(ok.body.data.total).toBe(1);
      expect((await c.get(`${API}/export?q=OTHER`, admin)).status).toBe(200);
      expect((await c.get(`${API}/ledger`, admin)).body.data.total).toBe(5); // the table itself is not capped
    } finally {
      Object.assign(bulkLimits, was);
    }
  });

  it('saved groups: create, list, add, remove, delete', async () => {
    const { admin, variants } = await plainShop([['GRP-1', 3], ['GRP-2', 3], ['GRP-3', 3]]);
    const [a, b, d] = variants as [any, any, any];
    const g = await c.post(`${API}/groups`, { name: 'Best sellers' }, admin);
    expect(g.status).toBe(201);
    expect(g.body.data).toMatchObject({ name: 'Best sellers', itemCount: 0 });
    expect((await c.post(`${API}/groups`, { name: 'best SELLERS' }, admin)).status).toBe(409); // names are unique, case-insensitively
    expect((await c.post(`${API}/groups`, { name: '' }, admin)).status).toBe(400);

    const add = await c.post(`${API}/groups/${g.body.data.id}/items`, { variantIds: [a.variantId, b.variantId] }, admin);
    expect(add.body.data).toMatchObject({ added: 2, alreadyInGroup: 0, group: { itemCount: 2 } });
    const again = await c.post(`${API}/groups/${g.body.data.id}/items`, { variantIds: [b.variantId, d.variantId] }, admin);
    expect(again.body.data).toMatchObject({ added: 1, alreadyInGroup: 1, group: { itemCount: 3 } });
    expect((await c.post(`${API}/groups/${g.body.data.id}/items`, { variantIds: ['00000000-0000-4000-8000-000000000000'] }, admin)).status).toBe(404);
    expect((await c.post(`${API}/groups/${g.body.data.id}/items`, { variantIds: [] }, admin)).status).toBe(400);
    expect((await c.post(`${API}/groups/00000000-0000-4000-8000-000000000000/items`, { variantIds: [a.variantId] }, admin)).status).toBe(404);

    const second = await c.post(`${API}/groups`, { name: 'Clearance', variantIds: [a.variantId] }, admin);
    expect(second.body.data.itemCount).toBe(1);
    expect((await c.get(`${API}/groups`, admin)).body.data.map((x: any) => [x.name, x.itemCount])).toEqual([['Best sellers', 3], ['Clearance', 1]]);

    expect((await c.del(`${API}/groups/${g.body.data.id}/items/${a.variantId}`, admin)).body.data.itemCount).toBe(2);
    expect((await c.del(`${API}/groups/${g.body.data.id}/items/${a.variantId}`, admin)).status).toBe(404);

    const viewer = await c.addMember(admin, 'vendor_viewer');
    expect((await c.get(`${API}/groups`, viewer)).status).toBe(200);
    expect((await c.post(`${API}/groups`, { name: 'Nope' }, viewer)).status).toBe(403);
    expect((await c.del(`${API}/groups/${g.body.data.id}`, viewer)).status).toBe(403);
    const other = await c.registerVendor({ businessName: 'Group Spy' });
    expect((await c.get(`${API}/groups`, other)).body.data).toEqual([]);
    expect((await c.del(`${API}/groups/${g.body.data.id}`, other)).status).toBe(404);
    expect((await c.post(`${API}/groups/${g.body.data.id}/items`, { variantIds: [a.variantId] }, other)).status).toBe(404);
    expect((await c.post(`${API}/groups`, { name: 'Best sellers' }, other)).status).toBe(201); // names are per business

    expect((await c.del(`${API}/groups/${g.body.data.id}`, admin)).status).toBe(200);
    expect((await c.get(`${API}/groups`, admin)).body.data.map((x: any) => x.name)).toEqual(['Clearance']);
    expect(skus(await c.get(`${API}/ledger?filter[group]=${second.body.data.id}`, admin))).toEqual(['GRP-1']); // the products stay
    expect((await c.get(`${API}/ledger`, admin)).body.data.total).toBe(3);
  });

  it('exports the filtered ledger as a CSV attachment', async () => {
    const { admin } = await plainShop([['CSV-1', 7], ['CSV-2', 0]]);
    const evil = await c.makeVariant(admin, { sku: 'CSV-EVIL', title: '=1+1, "quoted"' });
    const wh = (await c.get('/api/v1/warehouses', admin)).body.data[0];
    await c.stock(admin, evil.variantId, wh.id, 2);
    const r = await c.get(`${API}/export?q=CSV-&sort=sku`, admin);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="inventory-\d{4}-\d{2}-\d{2}\.csv"$/);
    const text = r.raw.body as string;
    const lines = text.trim().split('\r\n');
    expect(lines[0]!.startsWith('SKU,Product,Barcode,Warehouse,Available')).toBe(true);
    expect(lines).toHaveLength(3); // header + CSV-1 + CSV-EVIL (CSV-2 has no stock record)
    expect(lines.find((l) => l.startsWith('CSV-1,'))!.split(',').slice(4, 6)).toEqual(['7', '0']);
    expect(lines.find((l) => l.startsWith('CSV-EVIL,'))).toContain(`"'=1+1, ""quoted"""`);
    expect((await c.get(`${API}/export?filter[health]=stockout`, admin)).raw.body.trim().split('\r\n')).toHaveLength(1);
    expect((await c.get(`${API}/export?filter[health]=oops`, admin)).status).toBe(400);

    const viewer = await c.addMember(admin, 'vendor_viewer');
    expect((await c.get(`${API}/export`, viewer)).status).toBe(200);
    const other = await c.registerVendor({ businessName: 'Export Spy' });
    expect((await c.get(`${API}/export`, other)).raw.body.trim().split('\r\n')).toHaveLength(1);
  });
});
