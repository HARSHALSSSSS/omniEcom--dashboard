import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { adjustmentFor, signedQuantity, syncLabel } from '@oms/mod-inventory';
import { buildWorld, orderArrives, stockOf, type World } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

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

const INV = '/api/v1/inventory';
const ORD = '/api/v1/orders';
const items = (r: { body: any }) => r.body.data.items as any[];
const list = (r: { body: any }) => r.body.data as any[];
const ledgerOk = async (as: Actor) => expect((await c.get(`${INV}/ledger-check`, as)).body.data).toEqual({ healthy: true, drift: [] });

/** a vendor with warehouses and stocked variants (no marketplace) */
async function shop(stocks: Array<[string, number, number?]>, warehouses = 1) {
  const admin = await c.registerVendor({ businessName: `Readiness ${Math.random().toString(36).slice(2, 7)}` });
  const whs = [];
  for (let i = 0; i < warehouses; i++) whs.push(await c.makeWarehouse(admin, { priority: 100 + i * 100 }));
  const variants = [];
  for (const [sku, qty, cost] of stocks) {
    const v = await c.makeVariant(admin, { sku });
    if (qty > 0) await c.stock(admin, v.variantId, whs[0]!.id, qty);
    if (cost !== undefined) await sqlExec(`update product_variants set cost_price_minor = ${cost} where id = '${v.variantId}'`);
    variants.push(v);
  }
  return { admin, whs, variants };
}

// ================================================================================================
describe('pure rules', () => {
  it('maps the screen reasons to adjustments and rejects the wrong sign', () => {
    expect(adjustmentFor('audit_correction', -4)).toMatchObject({ type: 'correction', direction: 'decrease', quantity: 4 });
    expect(adjustmentFor('audit_correction', 4)).toMatchObject({ type: 'correction', direction: 'increase', quantity: 4 });
    expect(adjustmentFor('damaged', -2)).toMatchObject({ type: 'damage', direction: 'decrease', quantity: 2 });
    expect(adjustmentFor('shrinkage', -1)).toMatchObject({ type: 'manual', direction: 'decrease' });
    expect(adjustmentFor('manual_addition', 7, 'inward')).toMatchObject({ type: 'manual', direction: 'increase', quantity: 7, note: 'inward' });
    expect(() => adjustmentFor('damaged', 2)).toThrow(/negative/);
    expect(() => adjustmentFor('shrinkage', 2)).toThrow(/loss/);
    expect(() => adjustmentFor('manual_addition', -2)).toThrow(/positive/);
    expect(() => adjustmentFor('audit_correction', 0)).toThrow(/non-zero/);
  });
  it('signed quantity prefers the sellable change, else the bucket the movement is about', () => {
    const z = { deltaOnHand: 0, deltaReserved: 0, deltaIncoming: 0, deltaReturned: 0, deltaDamaged: 0, deltaQuarantined: 0 };
    expect(signedQuantity({ ...z, deltaOnHand: 5 })).toEqual({ quantity: 5, bucket: 'available' });
    expect(signedQuantity({ ...z, deltaReserved: 3 })).toEqual({ quantity: -3, bucket: 'available' }); // a reservation lowers what can be sold
    expect(signedQuantity({ ...z, deltaOnHand: -2, deltaReserved: -2 })).toEqual({ quantity: 0, bucket: 'available' }); // dispatch: sellable unchanged
    expect(signedQuantity({ ...z, deltaIncoming: 9 })).toEqual({ quantity: 9, bucket: 'incoming' });
    expect(signedQuantity({ ...z, deltaReturned: 1 })).toEqual({ quantity: 1, bucket: 'returned' });
    expect(signedQuantity({ ...z, deltaQuarantined: -4 })).toEqual({ quantity: -4, bucket: 'quarantined' });
  });
  it('sync labels', () => {
    expect(syncLabel(null)).toBe('Never synced');
    expect(syncLabel(0)).toBe('Synced just now');
    expect(syncLabel(1)).toBe('Synced 1 minute ago');
    expect(syncLabel(125)).toBe('Synced 2 hours ago');
    expect(syncLabel(3000)).toBe('Synced 2 days ago');
  });
});

// ================================================================================================
describe('GET /inventory/kpis and the ledger additions', () => {
  it('counts the four tiles, values stock at cost and tells what the reorder banner is about', async () => {
    const { admin, whs, variants } = await shop([['K-HEALTHY', 100, 1000], ['K-LOW', 3, 2000], ['K-OUT', 5], ['K-NOCOST', 10]]);
    const [healthy, low, out, nocost] = variants;
    expect((await c.put(`${INV}/reorder-level`, { variantId: low!.variantId, warehouseId: whs[0]!.id, reorderLevel: 5 }, admin)).status).toBe(200);
    expect((await c.post(`${INV}/adjust`, { variantId: out!.variantId, warehouseId: whs[0]!.id, delta: -5, reason: 'sold out' }, admin)).status).toBe(200);

    const k = (await c.get(`${INV}/kpis`, admin)).body.data;
    expect(k.totals).toMatchObject({ skus: 4, unitsAvailable: 113, unitsOnHand: 113, unitsReserved: 0, untrackedSkus: 0 });
    expect(k.health).toEqual({ healthy: 2, lowStock: 1, outOfStock: 1, excess: 0 });
    expect(k.health.healthy + k.health.lowStock + k.health.outOfStock + k.health.excess).toBe(k.totals.skus);
    expect(k.valuation).toMatchObject({ amountMinor: 100 * 1000 + 3 * 2000, currency: 'INR', basis: 'cost', skusCosted: 2, skusWithoutCost: 1 });
    expect(k.channelSync).toMatchObject({ state: 'not_connected', label: 'No channel connected', connectedChannels: 0 });
    expect(k.reorder).toMatchObject({ show: true, recommendationOnly: true, lowStockCount: 1, title: '1 product is approaching their critical stock thresholds' });
    expect(k.reorder.href).toBe('/inventory?filter[stockStatus]=low_stock');

    // a variant that was never stocked is reported, not counted in the ledger
    await c.makeVariant(admin, { sku: 'K-UNSTOCKED' });
    expect((await c.get(`${INV}/kpis`, admin)).body.data.totals).toMatchObject({ skus: 4, untrackedSkus: 1 });

    // with agingDays 0 every unsold, stocked variant is "excess" (nothing sells it and it has not moved for the window)
    const aged = (await c.get(`${INV}/kpis?agingDays=0`, admin)).body.data.health;
    expect(aged).toMatchObject({ outOfStock: 1, lowStock: 1, excess: 2, healthy: 0 });
    void healthy; void nocost;
  });

  it('ledger rows carry stockStatus, category, per-warehouse city and safety stock; filter[stockStatus] and the export follow', async () => {
    const { admin, whs, variants } = await shop([['L-A', 40], ['L-B', 2]], 2);
    const cat = await c.post('/api/v1/categories', { name: 'Outerwear', slug: 'outerwear' }, admin);
    expect(cat.status).toBe(201);
    const sub = await c.post('/api/v1/categories', { name: 'Jackets', slug: 'jackets', parentId: cat.body.data.id }, admin);
    expect(sub.status).toBe(201);
    const [a, b] = variants;
    expect((await c.patch(`/api/v1/products/${a!.productId}`, { categoryId: sub.body.data.id, version: (await c.get(`/api/v1/products/${a!.productId}`, admin)).body.data.version }, admin)).status).toBe(200);
    await sqlExec(`update warehouses set address = '{"city":"Delhi"}'::jsonb where id = '${whs[0]!.id}'`);
    await c.put(`${INV}/reorder-level`, { variantId: b!.variantId, warehouseId: whs[0]!.id, reorderLevel: 5 }, admin);
    await c.stock(admin, a!.variantId, whs[1]!.id, 7);

    const rows = items(await c.get(`${INV}/ledger?sort=sku`, admin));
    const ra = rows.find((r) => r.sku === 'L-A');
    const rb = rows.find((r) => r.sku === 'L-B');
    expect(ra).toMatchObject({ stockStatus: 'healthy', available: 47, category: { name: 'Jackets' } });
    expect(ra.warehouses).toHaveLength(2);
    expect(ra.warehouses[0]).toMatchObject({ warehouseId: whs[0]!.id, city: 'Delhi', onHand: 40, reserved: 0, available: 40, safetyStock: null });
    expect(ra.warehouses[1]).toMatchObject({ warehouseId: whs[1]!.id, city: null, available: 7 });
    expect(ra.lastMovementAt).toBeTruthy();
    expect(rb).toMatchObject({ stockStatus: 'low_stock', category: null });
    expect(rb.warehouses[0].safetyStock).toBe(5);

    expect(items(await c.get(`${INV}/ledger?filter[stockStatus]=low_stock`, admin)).map((r) => r.sku)).toEqual(['L-B']);
    expect(items(await c.get(`${INV}/ledger?filter[stockStatus]=healthy`, admin)).map((r) => r.sku)).toEqual(['L-A']);
    expect((await c.get(`${INV}/ledger?filter[stockStatus]=bogus`, admin)).status).toBe(400);
    const csv = await c.get(`${INV}/export?filter[stockStatus]=low_stock`, admin);
    expect(String(csv.raw.body).trim().split('\r\n')).toHaveLength(2); // header + L-B
    expect((await c.post(`${INV}/ledger/selection-count`, { filters: { stockStatus: 'low_stock' } }, admin)).body.data.total).toBe(1);
  });

  it('is tenant isolated and readable by a viewer', async () => {
    const a = await shop([['T-1', 5, 100]]);
    const b = await shop([['T-2', 9, 100]]);
    expect((await c.get(`${INV}/kpis`, a.admin)).body.data.totals.unitsAvailable).toBe(5);
    expect((await c.get(`${INV}/kpis`, b.admin)).body.data.totals.unitsAvailable).toBe(9);
    const viewer = await c.addMember(a.admin, 'vendor_viewer');
    expect((await c.get(`${INV}/kpis`, viewer)).status).toBe(200);
    expect((await c.get(`${INV}/kpis`)).status).toBe(401);
  });
});

// ================================================================================================
describe('POST /inventory/quick-adjust', () => {
  it('adjusts by SKU in the default warehouse with the screen reasons', async () => {
    const { admin, whs, variants } = await shop([['Q-1', 20]], 2);
    const v = variants[0]!;
    const res = await c.post(`${INV}/quick-adjust`, { sku: 'q-1', reason: 'audit_correction', quantityDelta: -3, notes: 'cycle count' }, admin); // case-insensitive SKU
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ duplicate: false, type: 'correction', variant: { sku: 'Q-1' }, warehouse: { id: whs[0]!.id }, result: { currentAvailable: 20, adjustment: -3, newAvailable: 17 }, stock: { onHand: 17, available: 17 }, totals: { available: 17 } });

    const dmg = await c.post(`${INV}/quick-adjust`, { variantId: v.variantId, warehouseId: whs[0]!.id, reason: 'damaged', quantityDelta: -2 }, admin);
    expect(dmg.body.data).toMatchObject({ type: 'damage', stock: { onHand: 15, damaged: 2, available: 15 } });
    expect((await c.post(`${INV}/quick-adjust`, { sku: 'Q-1', reason: 'shrinkage', quantityDelta: -1 }, admin)).body.data.stock.onHand).toBe(14);
    expect((await c.post(`${INV}/quick-adjust`, { sku: 'Q-1', warehouseId: whs[1]!.id, reason: 'manual_addition', quantityDelta: 6 }, admin)).body.data).toMatchObject({ warehouse: { id: whs[1]!.id }, stock: { onHand: 6 }, totals: { available: 20 } });

    // the feed shows exactly what was written
    const feed = list(await c.get(`${INV}/movements/feed?filter[variantId]=${v.variantId}`, admin));
    expect(feed[0]).toMatchObject({ typeLabel: 'Manual adjustment', type: 'manual_adjustment', quantityDelta: 6, resultingAvailable: 6, operator: { type: 'user', name: 'Asha Admin' } });
    await ledgerOk(admin);
  });

  it('validates: sign per reason, exactly one reference, unknown SKU, below reserved, idempotency, roles', async () => {
    const { admin, whs, variants } = await shop([['Q-2', 10]]);
    const body = (x: Record<string, unknown>) => ({ sku: 'Q-2', reason: 'audit_correction', quantityDelta: 1, ...x });
    const rule = async (x: Record<string, unknown>) => { const r = await c.post(`${INV}/quick-adjust`, body(x), admin); expect(r.status).toBe(400); return r.body.error.details?.rule; };
    expect(await rule({ reason: 'damaged', quantityDelta: 2 })).toBe('damaged_requires_decrease');
    expect(await rule({ reason: 'shrinkage', quantityDelta: 2 })).toBe('shrinkage_requires_decrease');
    expect(await rule({ reason: 'manual_addition', quantityDelta: -2 })).toBe('addition_requires_increase');
    expect(await rule({ quantityDelta: 0 })).toBe('delta_non_zero');
    expect(await rule({ variantId: variants[0]!.variantId })).toBe('variant_ref'); // both sku and variantId
    expect((await c.post(`${INV}/quick-adjust`, { reason: 'audit_correction', quantityDelta: 1 }, admin)).status).toBe(400); // neither
    expect((await c.post(`${INV}/quick-adjust`, body({ reason: 'nonsense' }), admin)).status).toBe(400);
    expect((await c.post(`${INV}/quick-adjust`, body({ sku: 'NOPE' }), admin)).status).toBe(404);
    expect((await c.post(`${INV}/quick-adjust`, body({ warehouseId: '00000000-0000-4000-8000-000000000000' }), admin)).status).toBe(404);
    expect((await c.post(`${INV}/quick-adjust`, body({ quantityDelta: -11 }), admin)).body.error.code).toBe('INSUFFICIENT_STOCK');

    const key = { idempotencyKey: 'quick-adjust-key-1' };
    const first = await c.post(`${INV}/quick-adjust`, body({ quantityDelta: 4, ...key }), admin);
    const again = await c.post(`${INV}/quick-adjust`, body({ quantityDelta: 4, ...key }), admin);
    expect([first.body.data.duplicate, again.body.data.duplicate]).toEqual([false, true]);
    expect(await c.available(admin, variants[0]!.variantId)).toBe(14);

    const viewer = await c.addMember(admin, 'vendor_viewer');
    expect((await c.post(`${INV}/quick-adjust`, body({}), viewer)).status).toBe(403);
    const staff = await c.addMember(admin, 'vendor_staff');
    expect((await c.post(`${INV}/quick-adjust`, body({ quantityDelta: 1 }), staff)).status).toBe(200);

    // another business can neither see nor touch this SKU
    const other = await shop([['Q-OTHER', 1]]);
    expect((await c.post(`${INV}/quick-adjust`, body({}), other.admin)).status).toBe(404);
    void whs;
    await ledgerOk(admin);
  });

  it('refuses to take stock below what orders reserved', async () => {
    const w = await buildWorld(t, c, { stock: [5] });
    await orderArrives(t, c, w, 4);
    expect((await stockOf(c, w)).totals).toMatchObject({ onHand: 5, reserved: 4, available: 1 });
    const r = await c.post(`${INV}/quick-adjust`, { sku: w.variant.sku, reason: 'shrinkage', quantityDelta: -2 }, w.admin);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect((await stockOf(c, w)).totals).toMatchObject({ onHand: 5, reserved: 4 });
  });
});

// ================================================================================================
describe('POST /inventory/transfer-now', () => {
  it('moves stock at once through a real transfer document, keeping the ledger exact', async () => {
    const { admin, whs, variants } = await shop([['X-1', 30]], 2);
    const v = variants[0]!;
    const r = await c.post(`${INV}/transfer-now`, { sku: 'X-1', from: whs[0]!.id, to: whs[1]!.id, quantity: 12, notes: 'rebalance' }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.transfer).toMatchObject({ status: 'received', fromWarehouseId: whs[0]!.id, toWarehouseId: whs[1]!.id, items: [{ sku: 'X-1', quantity: 12, receivedQuantity: 12 }] });
    expect(r.body.data.transfer.number).toMatch(/^TR-\d{6}$/);
    expect(r.body.data.source).toMatchObject({ onHand: 18, incoming: 0 });
    expect(r.body.data.destination).toMatchObject({ onHand: 12, incoming: 0 });
    expect(r.body.data.totals).toMatchObject({ onHand: 30, available: 30 });
    await ledgerOk(admin);

    // by variant id and the long names; the feed labels the transfer by its number
    expect((await c.post(`${INV}/transfer-now`, { variantId: v.variantId, fromWarehouseId: whs[1]!.id, toWarehouseId: whs[0]!.id, quantity: 2 }, admin)).status).toBe(200);
    const feed = list(await c.get(`${INV}/movements/feed?filter[type]=transfer`, admin));
    expect(feed.map((f) => f.movementType)).toEqual(['transfer_out', 'transfer_out']); // the in-transit / receive legs are labelled as stock movements of the destination
    expect(feed[0]).toMatchObject({ type: 'transfer', quantityDelta: -2, reference: { type: 'transfer' } });
    expect(feed[0].reference.label).toMatch(/^TR-/);
    expect(list(await c.get(`${INV}/movements/feed?filter[type]=inward`, admin)).some((f) => f.reference?.type === 'transfer')).toBe(true);
  });

  it('refuses without enough sellable stock (nothing changes), same warehouse, missing warehouses, bad ids, viewers', async () => {
    const w = await buildWorld(t, c, { warehouses: 2, stock: [10, 0] });
    await orderArrives(t, c, w, 8); // 8 of 10 reserved in the first warehouse
    const [a, b] = w.warehouses;
    const before = await stockOf(c, w);
    const r = await c.post(`${INV}/transfer-now`, { sku: w.variant.sku, fromWarehouseId: a!.id, toWarehouseId: b!.id, quantity: 5 }, w.admin);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect((await stockOf(c, w)).totals).toEqual(before.totals);
    expect(list(await c.get(`${INV}/transfers`, w.admin)).filter((x) => x.status !== 'received')).toEqual([]); // no half-done document is left behind
    expect((await c.post(`${INV}/transfer-now`, { sku: w.variant.sku, fromWarehouseId: a!.id, toWarehouseId: b!.id, quantity: 2 }, w.admin)).status).toBe(200);

    const same = await c.post(`${INV}/transfer-now`, { sku: w.variant.sku, fromWarehouseId: a!.id, toWarehouseId: a!.id, quantity: 1 }, w.admin);
    expect(same.status).toBe(400);
    expect((await c.post(`${INV}/transfer-now`, { sku: w.variant.sku, fromWarehouseId: a!.id, quantity: 1 }, w.admin)).status).toBe(400);
    expect((await c.post(`${INV}/transfer-now`, { sku: w.variant.sku, from: a!.id, to: b!.id, quantity: 0 }, w.admin)).status).toBe(400);
    expect((await c.post(`${INV}/transfer-now`, { sku: 'NOPE', from: a!.id, to: b!.id, quantity: 1 }, w.admin)).status).toBe(404);
    expect((await c.post(`${INV}/transfer-now`, { sku: w.variant.sku, from: a!.id, to: '00000000-0000-4000-8000-000000000000', quantity: 1 }, w.admin)).status).toBe(404);
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    expect((await c.post(`${INV}/transfer-now`, { sku: w.variant.sku, from: a!.id, to: b!.id, quantity: 1 }, viewer)).status).toBe(403);
    await ledgerOk(w.admin);
  });
});

// ================================================================================================
describe('GET /inventory/movements/feed', () => {
  it('lists human rows newest first with order numbers, operators and keyset paging', async () => {
    const w = await buildWorld(t, c, { stock: [20] });
    const order = await orderArrives(t, c, w, 3);
    await c.post(`${INV}/quick-adjust`, { sku: w.variant.sku, reason: 'manual_addition', quantityDelta: 5, notes: 'extra' }, w.admin);

    const all = await c.get(`${INV}/movements/feed?limit=2`, w.admin);
    expect(all.status).toBe(200);
    expect(all.body.meta).toMatchObject({ limit: 2, hasMore: true });
    const first = all.body.data as any[];
    expect(first[0]).toMatchObject({ sku: w.variant.sku, productTitle: 'Stage 4 tee', warehouse: { name: expect.any(String) }, type: 'manual_adjustment', quantityDelta: 5, resultingAvailable: 22, operator: { name: 'Asha Admin' } });
    expect(first[0].reason).toContain('extra');
    expect(first[1]).toMatchObject({ type: 'order_deduction', typeLabel: 'Order reserved', quantityDelta: -3, resultingAvailable: 17, reference: { type: 'order', label: order.orderNumber } });
    expect(first[1].operator.type).toBeTruthy();

    const next = await c.get(`${INV}/movements/feed?limit=2&cursor=${all.body.meta.nextCursor}`, w.admin);
    const page2 = next.body.data as any[];
    expect(page2[0].id).toBeLessThan(first[1].id);
    expect(page2.map((x) => x.id)).toEqual([...page2.map((x) => x.id)].sort((x, y) => y - x));
    // walk to the end: every movement once
    const seen: number[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const p: any = await c.get(`${INV}/movements/feed?limit=3${cursor ? `&cursor=${cursor}` : ''}`, w.admin);
      seen.push(...p.body.data.map((x: any) => x.id));
      cursor = p.body.meta.nextCursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    const raw = (await c.get(`${INV}/movements?limit=200`, w.admin)).body.data.items as any[];
    expect(seen.length).toBe(raw.length);

    // filters
    expect((await c.get(`${INV}/movements/feed?filter[type]=order_deduction`, w.admin)).body.data.every((x: any) => x.type === 'order_deduction')).toBe(true);
    expect((await c.get(`${INV}/movements/feed?q=${w.variant.sku}`, w.admin)).body.data.length).toBe(seen.length);
    expect((await c.get(`${INV}/movements/feed?q=zzzz-nothing`, w.admin)).body.data).toEqual([]);
    expect((await c.get(`${INV}/movements/feed?filter[warehouseId]=${w.warehouses[0]!.id}&filter[variantId]=${w.variant.variantId}`, w.admin)).body.data.length).toBe(seen.length);
    expect((await c.get(`${INV}/movements/feed?filter[type]=bogus`, w.admin)).status).toBe(400);
    expect((await c.get(`${INV}/movements/feed?cursor=abc`, w.admin)).status).toBe(400);
    expect((await c.get(`${INV}/movements/feed?filter[from]=2999-01-01`, w.admin)).body.data).toEqual([]);

    // another business sees nothing of this
    const other = await shop([['F-OTHER', 4]]);
    const mine = (await c.get(`${INV}/movements/feed`, other.admin)).body.data as any[];
    expect(mine.every((x) => x.sku === 'F-OTHER')).toBe(true);
  });
});

// ================================================================================================
describe('GET /inventory/channel-allocations (listings module)', () => {
  it('shows what every marketplace account may sell, from the channel policy', async () => {
    const w = await buildWorld(t, c, { stock: [20] });
    const lone = await c.makeVariant(w.admin, { sku: 'ALLOC-NOLIST' });
    await c.stock(w.admin, lone.variantId, w.warehouses[0]!.id, 4);
    const url = `${INV}/channel-allocations?variantIds=${w.variant.variantId},${lone.variantId}`;

    const plain = (await c.get(url, w.admin)).body.data as any[];
    const mine = plain.find((x) => x.variantId === w.variant.variantId);
    expect(mine).toMatchObject({ available: 20, buffer: 0 });
    expect(mine.channels).toHaveLength(1);
    expect(mine.channels[0]).toMatchObject({ channel: { code: 'mock', accountId: w.account.id }, listingId: w.variant.listingId, allocated: 20, allocationPercent: 100, safetyBuffer: 0, mode: 'sync' });
    expect(plain.find((x) => x.variantId === lone.variantId)).toMatchObject({ available: 4, buffer: null, channels: [] });

    expect((await c.put(`/api/v1/marketplace-accounts/${w.account.id}/inventory-policy`, { allocationPercent: 50, safetyBuffer: 2 }, w.admin)).status).toBe(200);
    const policed = (await c.get(url, w.admin)).body.data.find((x: any) => x.variantId === w.variant.variantId);
    expect(policed.channels[0]).toMatchObject({ allocated: 8, allocationPercent: 50, safetyBuffer: 2 }); // floor(20 x 50%) - 2
    expect(policed.buffer).toBe(12);

    // reservations lower what can be sold
    await orderArrives(t, c, w, 6);
    expect((await c.get(url, w.admin)).body.data.find((x: any) => x.variantId === w.variant.variantId)).toMatchObject({ available: 14 });
  });

  it('validates the query, needs inventory:read, and never shows another business', async () => {
    const w = await buildWorld(t, c, { stock: [5] });
    expect((await c.get(`${INV}/channel-allocations`, w.admin)).status).toBe(400);
    expect((await c.get(`${INV}/channel-allocations?variantIds=not-a-uuid`, w.admin)).status).toBe(400);
    expect((await c.get(`${INV}/channel-allocations?variantIds=${w.variant.variantId}`)).status).toBe(401);
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    expect((await c.get(`${INV}/channel-allocations?variantIds=${w.variant.variantId}`, viewer)).status).toBe(200);
    const other = await shop([['ALLOC-O', 3]]);
    const r = (await c.get(`${INV}/channel-allocations?variantIds=${w.variant.variantId}`, other.admin)).body.data[0];
    expect(r).toMatchObject({ available: 0, channels: [], buffer: null });
  });
});

// ================================================================================================
describe('orders: summary, ledger rows, export', () => {
  let w: World;
  let o1: any;
  let o2: any;
  beforeAll(async () => {
    w = await buildWorld(t, c, { warehouses: 2, stock: [50, 50] });
    o1 = await orderArrives(t, c, w, 2);
    o2 = await orderArrives(t, c, w, 1);
  });

  it('GET /orders/summary keeps its fields and adds the screen numbers', async () => {
    const s = (await c.get(`${ORD}/summary`, w.admin)).body.data;
    expect(s).toMatchObject({ total: 2, byStatus: { new: 2 }, needsAttention: expect.any(Number) });
    expect(s.statusCounts).toMatchObject({ new: 2, confirmed: 0, picking: 0, dispatched: 0, delivered: 0, cancelled: 0 });
    expect(Object.keys(s.statusCounts)).toHaveLength(10);
    expect(s.tabs).toMatchObject({ all: 2, new: 2, processing: 0, shipped: 0, delivered: 0 });
    expect(s.sla.safe + s.sla.approaching + s.sla.atRisk + s.sla.breached).toBe(2);
    expect(s.today).toMatchObject({ orders: 2, newOrders: 2, currency: 'INR', revenueMinor: o1.totalMinor + o2.totalMinor });
    expect(s).toMatchObject({ pendingDispatchCount: 2, avgFulfillmentHours: null, cancellationRatePct: 0, windowDays: 30 });
    expect((await c.get(`${ORD}/summary?asOf=2001-01-01`, w.admin)).body.data.today).toMatchObject({ orders: 0, revenueMinor: 0 });
    expect((await c.get(`${ORD}/summary?asOf=yesterday`, w.admin)).status).toBe(400);
  });

  it('the ledger rows carry the table fields', async () => {
    const rows = items(await c.get(`${ORD}/ledger`, w.admin));
    const r = rows.find((x) => x.id === o1.id);
    expect(r).toMatchObject({
      number: o1.orderNumber, status: 'new', statusLabel: 'New', itemCount: 2, lineCount: 1, priority: false,
      destination: { city: 'Bengaluru', state: 'KA', pincode: '560001' }, firstItem: { sku: w.variant.sku, title: expect.any(String), imageUrl: null }, carrier: null,
    });
    expect(r.paymentLabel).toMatch(/ - /);
    expect(r.sla.label === null || typeof r.sla.label === 'string').toBe(true);
  });

  it('GET /orders/export honours the filters of the page and has the new columns', async () => {
    const all = await c.get(`${ORD}/export?filter[marketplace]=mock&filter[status]=new&q=${w.variant.sku}`, w.admin);
    expect(all.status).toBe(200);
    expect(all.headers['content-type']).toContain('text/csv');
    const lines = String(all.raw.body).trim().split('\r\n');
    expect(lines[0]).toContain('City,Pincode,Carrier,Tracking number,Warehouse');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('Bengaluru');
    expect(String((await c.get(`${ORD}/export?filter[marketplace]=flipkart`, w.admin)).raw.body).trim().split('\r\n')).toHaveLength(1);
    expect(String((await c.get(`${ORD}/export?q=${o1.orderNumber}`, w.admin)).raw.body).trim().split('\r\n')).toHaveLength(2);
    expect(String((await c.get(`${ORD}/export?filter[status]=cancelled`, w.admin)).raw.body).trim().split('\r\n')).toHaveLength(1);
    expect((await c.get(`${ORD}/export?filter[tab]=bogus`, w.admin)).status).toBe(400);
  });
});

// ================================================================================================
describe('GET /orders/{id}/next-actions', () => {
  it('lists the allowed steps, flags fulfillment ownership and respects the role', async () => {
    const w = await buildWorld(t, c, { stock: [30] });
    const order = await orderArrives(t, c, w, 2);
    const na = async (as: Actor = w.admin) => (await c.get(`${ORD}/${order.id}/next-actions`, as)).body.data;

    const fresh = await na();
    expect(fresh).toMatchObject({ status: 'new', managedByFulfillment: false, fulfillment: null, primaryAction: 'to_confirmed' });
    expect(fresh.actions.map((a: any) => a.key)).toEqual(['to_confirmed', 'cancel']);
    expect(fresh.actions[0]).toMatchObject({ kind: 'transition', method: 'POST', enabled: true, disabledReason: null, body: { status: 'confirmed', version: order.version } });
    expect(fresh.actions[1]).toMatchObject({ kind: 'cancel', href: `/api/v1/orders/${order.id}/cancel`, enabled: true });

    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    const ro = await na(viewer);
    expect(ro.actions.every((a: any) => a.enabled === false && a.disabledReason === 'permission_required')).toBe(true);
    expect(ro.primaryAction).toBeNull();

    expect((await c.post(`${ORD}/${order.id}/transition`, { status: 'confirmed' }, w.admin)).status).toBe(200);
    expect((await na()).actions[0]).toMatchObject({ key: 'to_picking', enabled: true }); // no fulfillment yet: the manual step is allowed

    expect((await c.post(`${ORD}/${order.id}/fulfillment`, {}, w.admin)).status).toBe(201);
    const managed = await na();
    expect(managed.managedByFulfillment).toBe(true);
    expect(managed.fulfillment).toMatchObject({ status: expect.any(String) });
    const pick = managed.actions.find((a: any) => a.key === 'to_picking');
    expect(pick).toMatchObject({ enabled: false, disabledReason: 'managed_by_fulfillment', useInstead: { key: 'open_fulfillment', href: `/api/v1/fulfillments/${managed.fulfillment.id}` } });
    expect(pick.message).toMatch(/fulfillment/i);
    expect(managed.primaryAction).toBe('open_fulfillment');
    expect(managed.actions.find((a: any) => a.key === 'open_fulfillment')).toMatchObject({ kind: 'fulfillment', method: 'GET', enabled: true });
    // the disabled step really is refused by the transition endpoint, for the stated reason
    const refused = await c.post(`${ORD}/${order.id}/transition`, { status: 'picking' }, w.admin);
    expect(refused.status).toBe(409);
    expect(refused.body.error.details.rule).toBe('managed_by_fulfillment');
  });

  it('offers allocation for short orders, nothing for closed ones, 404 for strangers', async () => {
    const w = await buildWorld(t, c, { stock: [1] });
    const order = await orderArrives(t, c, w, 3);
    const open = (await c.get(`${ORD}/${order.id}/next-actions`, w.admin)).body.data;
    expect(order.inventoryStatus).not.toBe('reserved');
    expect(open.actions.map((a: any) => a.key)).toContain('allocate');

    expect((await c.post(`${ORD}/${order.id}/cancel`, { reason: 'customer asked' }, w.admin)).status).toBe(200);
    const closed = (await c.get(`${ORD}/${order.id}/next-actions`, w.admin)).body.data;
    expect(closed).toMatchObject({ status: 'cancelled', actions: [], primaryAction: null });

    const other = await shop([['NA-1', 1]]);
    expect((await c.get(`${ORD}/${order.id}/next-actions`, other.admin)).status).toBe(404);
    expect((await c.get(`${ORD}/not-a-uuid/next-actions`, w.admin)).status).toBe(400);
  });
});

// ================================================================================================
describe('POST /orders/bulk', () => {
  it('confirms many orders with per-order results (partial success is a 200)', async () => {
    const w = await buildWorld(t, c, { stock: [50] });
    const a = await orderArrives(t, c, w, 1);
    const b = await orderArrives(t, c, w, 1);
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect((await c.post(`${ORD}/${b.id}/transition`, { status: 'confirmed' }, w.admin)).status).toBe(200); // b is already confirmed

    const res = await c.post(`${ORD}/bulk`, { action: 'confirm', ids: [a.id, b.id, ghost, a.id] }, w.admin);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ action: 'confirm', total: 3, succeeded: 1, failed: 2 }); // duplicate ids collapse
    const by = Object.fromEntries((res.body.data.results as any[]).map((r) => [r.orderId, r]));
    expect(by[a.id]).toMatchObject({ ok: true, changed: true, status: 'confirmed', orderNumber: a.orderNumber });
    expect(by[b.id]).toMatchObject({ ok: false, error: { code: 'INVALID_STATE' } });
    expect(by[ghost]).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect((await c.get(`${ORD}/${a.id}`, w.admin)).body.data.status).toBe('confirmed');
    await t.pump();
    expect((await c.get(`${ORD}/${a.id}/timeline`, w.admin)).body.data.at(-1)).toMatchObject({ toStatus: 'confirmed', source: 'user' });
  });

  it('cancels with a reason, releases the stock and refuses what is already dispatched or lacks a reason', async () => {
    const w = await buildWorld(t, c, { stock: [20] });
    const a = await orderArrives(t, c, w, 4);
    const b = await orderArrives(t, c, w, 2);
    expect((await stockOf(c, w)).totals.reserved).toBe(6);
    expect((await c.post(`${ORD}/bulk`, { action: 'cancel', ids: [a.id] }, w.admin)).body.error.details.rule).toBe('reason_required');
    const res = await c.post(`${ORD}/bulk`, { action: 'cancel', ids: [a.id, b.id], params: { reason: 'out of range', reasonCode: 'other' } }, w.admin);
    expect(res.body.data).toMatchObject({ total: 2, succeeded: 2, failed: 0 });
    expect((await stockOf(c, w)).totals).toMatchObject({ reserved: 0, available: 20 });
    expect((await c.get(`${ORD}/${a.id}`, w.admin)).body.data).toMatchObject({ status: 'cancelled', cancelReason: 'out of range' });
    const again = await c.post(`${ORD}/bulk`, { action: 'cancel', ids: [a.id], params: { reason: 'twice' } }, w.admin);
    expect(again.body.data.results[0]).toMatchObject({ ok: false, error: { code: 'INVALID_STATE' } });
    await ledgerOk(w.admin);
  });

  it('assigns a warehouse by moving the reservation, only before warehouse work starts', async () => {
    const w = await buildWorld(t, c, { warehouses: 2, stock: [10, 10] });
    const [main, second] = w.warehouses;
    const order = await orderArrives(t, c, w, 4);
    const rowOf = async (wh: string) => (await c.get(`${INV}?filter[variantId]=${w.variant.variantId}&filter[warehouseId]=${wh}`, w.admin)).body.data[0];
    expect(await rowOf(main!.id)).toMatchObject({ reserved: 4 });

    const res = await c.post(`${ORD}/bulk`, { action: 'assign_warehouse', ids: [order.id], params: { warehouseId: second!.id } }, w.admin);
    expect(res.body.data.results[0]).toMatchObject({ ok: true, changed: true });
    expect(await rowOf(main!.id)).toMatchObject({ reserved: 0, available: 10 });
    expect(await rowOf(second!.id)).toMatchObject({ reserved: 4, available: 6 });
    const detail = (await c.get(`${ORD}/${order.id}`, w.admin)).body.data;
    expect(detail.warehouseId).toBe(second!.id);
    expect(items(await c.get(`${ORD}/ledger?q=${order.orderNumber}`, w.admin))[0].warehouse).toMatchObject({ id: second!.id });

    // same warehouse again: nothing to do
    expect((await c.post(`${ORD}/bulk`, { action: 'assign_warehouse', ids: [order.id], params: { warehouseId: second!.id } }, w.admin)).body.data.results[0]).toMatchObject({ ok: true, changed: false });
    expect((await c.post(`${ORD}/bulk`, { action: 'assign_warehouse', ids: [order.id] }, w.admin)).body.error.details.rule).toBe('warehouse_required');
    const ghostWh = await c.post(`${ORD}/bulk`, { action: 'assign_warehouse', ids: [order.id], params: { warehouseId: '00000000-0000-4000-8000-000000000000' } }, w.admin);
    expect(ghostWh.body.data.results[0]).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    // the target cannot cover it: nothing moves
    const big = await orderArrives(t, c, w, 6);
    await c.post(`${INV}/quick-adjust`, { sku: w.variant.sku, warehouseId: second!.id, reason: 'shrinkage', quantityDelta: -5 }, w.admin);
    const nope = await c.post(`${ORD}/bulk`, { action: 'assign_warehouse', ids: [big.id], params: { warehouseId: second!.id } }, w.admin);
    expect(nope.body.data.results[0]).toMatchObject({ ok: false, error: { code: 'INSUFFICIENT_STOCK' } });

    // once fulfillment exists the warehouse is chosen by routing
    expect((await c.post(`${ORD}/${order.id}/fulfillment`, {}, w.admin)).status).toBe(201);
    const late = await c.post(`${ORD}/bulk`, { action: 'assign_warehouse', ids: [order.id], params: { warehouseId: main!.id } }, w.admin);
    expect(late.body.data.results[0]).toMatchObject({ ok: false, error: { code: 'CONFLICT', rule: 'managed_by_fulfillment' } });
    await ledgerOk(w.admin);
  });

  it('marks and clears priority', async () => {
    const w = await buildWorld(t, c, { stock: [20] });
    const a = await orderArrives(t, c, w, 1);
    const set = await c.post(`${ORD}/bulk`, { action: 'mark_priority', ids: [a.id] }, w.admin);
    expect(set.body.data.results[0]).toMatchObject({ ok: true, changed: true });
    expect((await c.get(`${ORD}/${a.id}`, w.admin)).body.data.attentionReason).toContain('priority');
    expect(items(await c.get(`${ORD}/ledger?q=${a.orderNumber}`, w.admin))[0].priority).toBe(true);
    expect((await c.post(`${ORD}/bulk`, { action: 'mark_priority', ids: [a.id] }, w.admin)).body.data.results[0]).toMatchObject({ ok: true, changed: false }); // idempotent
    const clear = await c.post(`${ORD}/bulk`, { action: 'mark_priority', ids: [a.id], params: { priority: false } }, w.admin);
    expect(clear.body.data.results[0]).toMatchObject({ ok: true, changed: true });
    expect(items(await c.get(`${ORD}/ledger?q=${a.orderNumber}`, w.admin))[0].priority).toBe(false);
    expect((await c.get(`${ORD}/${a.id}`, w.admin)).body.data.attentionReason).toBeNull();

    expect((await c.post(`${ORD}/${a.id}/cancel`, { reason: 'changed mind' }, w.admin)).status).toBe(200);
    expect((await c.post(`${ORD}/bulk`, { action: 'mark_priority', ids: [a.id] }, w.admin)).body.data.results[0]).toMatchObject({ ok: false, error: { code: 'INVALID_STATE', rule: 'already_dispatched_or_closed' } });
  });

  it('validates the body, caps the batch at 200, needs orders:write and cannot touch other businesses', async () => {
    const w = await buildWorld(t, c, { stock: [20] });
    const a = await orderArrives(t, c, w, 1);
    expect((await c.post(`${ORD}/bulk`, { action: 'confirm', ids: [] }, w.admin)).status).toBe(400);
    expect((await c.post(`${ORD}/bulk`, { action: 'confirm', ids: ['nope'] }, w.admin)).status).toBe(400);
    expect((await c.post(`${ORD}/bulk`, { action: 'explode', ids: [a.id] }, w.admin)).status).toBe(400);
    expect((await c.post(`${ORD}/bulk`, { action: 'confirm', ids: [a.id], params: { surprise: 1 } }, w.admin)).status).toBe(400);
    const many = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect((await c.post(`${ORD}/bulk`, { action: 'confirm', ids: many }, w.admin)).status).toBe(400);
    const ok200 = await c.post(`${ORD}/bulk`, { action: 'confirm', ids: many.slice(0, 200) }, w.admin);
    expect(ok200.status).toBe(200);
    expect(ok200.body.data).toMatchObject({ total: 200, failed: 200 });

    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    expect((await c.post(`${ORD}/bulk`, { action: 'confirm', ids: [a.id] }, viewer)).status).toBe(403);
    const staff = await c.addMember(w.admin, 'vendor_staff');
    expect((await c.post(`${ORD}/bulk`, { action: 'confirm', ids: [a.id] }, staff)).body.data.succeeded).toBe(1);

    const other = await buildWorld(t, c, { stock: [5] });
    const theirs = await c.post(`${ORD}/bulk`, { action: 'mark_priority', ids: [a.id] }, other.admin);
    expect(theirs.body.data.results[0]).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect((await c.get(`${ORD}/${a.id}`, w.admin)).body.data.attentionReason ?? '').not.toContain('priority');
  });

  it('is replayed, not repeated, with the same Idempotency-Key', async () => {
    const w = await buildWorld(t, c, { stock: [20] });
    const a = await orderArrives(t, c, w, 1);
    const headers = { 'idempotency-key': 'orders-bulk-confirm-0001' };
    const first = await c.post(`${ORD}/bulk`, { action: 'confirm', ids: [a.id] }, w.admin, headers);
    const second = await c.post(`${ORD}/bulk`, { action: 'confirm', ids: [a.id] }, w.admin, headers);
    expect(first.body.data.succeeded).toBe(1);
    expect(second.body.data).toEqual(first.body.data); // the stored response, not a new INVALID_STATE
  });
});
