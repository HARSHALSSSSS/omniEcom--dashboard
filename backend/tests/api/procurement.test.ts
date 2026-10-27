import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { withVendor } from '@oms/database';
import { rollupRecent } from '../../modules/analytics/src/index';
import { createDraftPurchaseOrder } from '../../modules/procurement/src/index';
import { buildWorld, orderArrives } from '../helpers/stage4';
// pure rules are imported from the module sources (not part of the public entry point)
import { formatPoNumber, isGstin, isOnTime, lineAmounts, poTotals, scorecard, supplierCodeFor } from '../../modules/procurement/src/domain';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
const SUP = '/api/v1/suppliers';
const PO = '/api/v1/purchase-orders';
const GSTIN = '27AABCT3521Q1Z8';
const YEAR = new Date().getUTCFullYear();

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

/** a business with admin + staff + viewer, one warehouse and two variants (GST 12%) */
async function shop() {
  const admin = await c.registerVendor({ businessName: `Procure ${Math.random().toString(36).slice(2, 7)}` });
  const staff = await c.addMember(admin, 'vendor_staff');
  const viewer = await c.addMember(admin, 'vendor_viewer');
  const wh = await c.makeWarehouse(admin, { code: 'MAIN' });
  const a = await c.makeVariant(admin, { title: 'Travel Bag' });
  const b = await c.makeVariant(admin, { title: 'Backpack' });
  return { admin, staff, viewer, wh, a, b };
}
type Shop = Awaited<ReturnType<typeof shop>>;

const mkSupplier = async (s: Shop, body: Record<string, unknown> = {}) => {
  const r = await c.post(SUP, { name: 'Apex Tex Fab Industries', contactPerson: 'Rajesh Singhania', email: 'rajesh@apextexfab.in', city: 'Surat', state: 'Gujarat', paymentTerms: 'Net 30', leadTimeDays: 14, gstin: GSTIN, ...body }, s.admin);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.data as { id: string; code: string; version: number };
};
const priceList = async (s: Shop, supplierId: string, items: Array<Record<string, unknown>>) => {
  const r = await c.put(`${SUP}/${supplierId}/products`, { items }, s.admin);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r;
};
const draft = async (s: Shop, supplierId: string, lines: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}, as: Actor = s.staff) => {
  const r = await c.post(PO, { supplierId, warehouseId: s.wh.id, lines, ...extra }, as);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.data;
};
const stock = async (s: Shop, variantId: string) => (await c.get(`/api/v1/inventory/variants/${variantId}`, s.admin)).body.data.totals as { onHand: number; incoming: number; damaged: number; available: number };
const receive = (s: Shop, id: string, items: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => c.post(`${PO}/${id}/receive`, { items, ...extra }, s.staff);

/** supplier + price list for variant A (₹1,250, MOQ 10) and a submitted PO of 100 units */
async function submitted(s: Shop, qty = 100) {
  const sup = await mkSupplier(s);
  await priceList(s, sup.id, [{ variantId: s.a.variantId, costMinor: 125000, minOrderQuantity: 10, supplierSku: 'APX-TB' }]);
  const po = await draft(s, sup.id, [{ variantId: s.a.variantId, quantity: qty }]);
  const ok = await c.post(`${PO}/${po.id}/approve`, {}, s.admin);
  expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  return { sup, po: ok.body.data };
}

// ================================================================================================
describe('pure rules', () => {
  it('money maths in minor units, GST rounded half up', () => {
    expect(lineAmounts(100, 125000, 1200)).toEqual({ totalMinor: 12_500_000, taxMinor: 1_500_000 });
    expect(lineAmounts(3, 333, 500)).toEqual({ totalMinor: 999, taxMinor: 50 }); // 49.95 -> 50
    expect(lineAmounts(1, 1, 5000)).toEqual({ totalMinor: 1, taxMinor: 1 }); // 0.5 -> 1
    expect(lineAmounts(1_000_000, 1_000_000_000, 1800).taxMinor).toBe(180_000_000_000_000); // beyond 2^53 x rate, exact through BigInt
    expect(poTotals([lineAmounts(100, 125000, 1200), lineAmounts(50, 120000, 1200)], 5000)).toEqual({ subtotalMinor: 18_500_000, taxMinor: 2_220_000, shippingMinor: 5000, totalMinor: 20_725_000 });
  });
  it('numbers, codes and GSTIN shape', () => {
    expect(formatPoNumber(2026, 48)).toBe('PO-2026-0048');
    expect(formatPoNumber(2026, 12345)).toBe('PO-2026-12345');
    expect(supplierCodeFor('Apex Tex', 1)).toBe('SUP-APE-01');
    expect(supplierCodeFor('a', 7)).toBe('SUP-AXX-07');
    expect(isGstin(GSTIN)).toBe(true);
    expect(isGstin('27AABCT3521Q1Y8')).toBe(false); // 14th char must be Z
    expect(isGstin('00AABCT3521Q1Z8')).toBe(false); // no state 00
    expect(isGstin('27aabct3521q1z8')).toBe(false);
  });
  it('on time means by the end of the expected UTC day', () => {
    const expected = new Date('2026-10-14T00:00:00Z');
    expect(isOnTime(expected, new Date('2026-10-14T23:59:59Z'))).toBe(true);
    expect(isOnTime(expected, new Date('2026-10-15T00:00:01Z'))).toBe(false);
    expect(isOnTime(null, new Date())).toBe(true);
  });
  it('scorecard is null until 3 deliveries, then derived from real numbers', () => {
    expect(scorecard({ delivered: 2, onTime: 2, unitsReceived: 10, unitsDamaged: 0 })).toEqual({ onTimeRatePercent: null, rating: null });
    expect(scorecard({ delivered: 3, onTime: 3, unitsReceived: 300, unitsDamaged: 0 })).toEqual({ onTimeRatePercent: 100, rating: 5 });
    expect(scorecard({ delivered: 4, onTime: 3, unitsReceived: 100, unitsDamaged: 10 })).toEqual({ onTimeRatePercent: 75, rating: 4 }); // 5 x (0.7 x 0.75 + 0.3 x 0.9) = 3.975
  });
});

// ================================================================================================
describe('suppliers', () => {
  it('Add Supplier flow: generated code, scorecard empty, list tabs, search, version lock', async () => {
    const s = await shop();
    const a = await mkSupplier(s);
    expect(a.code).toBe('SUP-APE-01');
    const b = await c.post(SUP, { name: 'Vanguard Luggage Components', code: 'sup-vng-02', city: 'Bengaluru', state: 'Karnataka', leadTimeDays: 21, status: 'inactive' }, s.staff); // staff may create
    expect(b.status, JSON.stringify(b.body)).toBe(201);

    const list = await c.get(`${SUP}?pageSize=10`, s.viewer);
    expect(list.status).toBe(200);
    expect(list.body.data).toMatchObject({ total: 2, page: 1, pages: 1, counts: { active: 1, inactive: 1 } });
    const row = list.body.data.items.find((i: any) => i.id === a.id);
    expect(row).toMatchObject({ name: 'Apex Tex Fab Industries', location: 'Surat, Gujarat', gstin: GSTIN, leadTimeDays: 14, paymentTerms: 'Net 30', activeSkusCount: 0, openPurchaseOrders: 0, rating: null, onTimeRatePercent: null, status: 'active' });
    expect((await c.get(`${SUP}?q=vanguard`, s.viewer)).body.data.items.map((i: any) => i.code)).toEqual(['SUP-VNG-02']);
    expect((await c.get(`${SUP}?filter[status]=active`, s.viewer)).body.data.total).toBe(1);

    const up = await c.patch(`${SUP}/${a.id}`, { leadTimeDays: 10, version: a.version }, s.staff);
    expect(up.status).toBe(200);
    expect(up.body.data).toMatchObject({ leadTimeDays: 10, version: a.version + 1 });
    const stale = await c.patch(`${SUP}/${a.id}`, { leadTimeDays: 12, version: a.version }, s.staff);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('validation: GSTIN format, e-mail, unique code (case-insensitive), lead time bounds', async () => {
    const s = await shop();
    await mkSupplier(s, { code: 'ACME-1' });
    const dup = await c.post(SUP, { name: 'Other', code: 'acme-1' }, s.admin);
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toMatchObject({ rule: 'duplicate_code' });
    expect((await c.post(SUP, { name: 'Bad GST', gstin: '27AABCT3521Q1Y8' }, s.admin)).status).toBe(400);
    expect((await c.post(SUP, { name: 'Bad mail', email: 'nope' }, s.admin)).status).toBe(400);
    expect((await c.post(SUP, { name: 'Slow', leadTimeDays: 400 }, s.admin)).status).toBe(400);
    expect((await c.post(SUP, { name: 'X' }, s.admin)).status).toBe(400);
    const lower = await c.post(SUP, { name: 'Lower', gstin: GSTIN.toLowerCase() }, s.admin); // normalised to upper case
    expect(lower.body.data.gstin).toBe(GSTIN);
  });

  it('supplier price list: upsert, preferred moves between suppliers, remove, unknown variant', async () => {
    const s = await shop();
    const a = await mkSupplier(s);
    const b = await mkSupplier(s, { name: 'Dharavi Craft Leather Co.', gstin: undefined });
    await priceList(s, a.id, [{ variantId: s.a.variantId, costMinor: 125000, minOrderQuantity: 10, isPreferred: true }, { variantId: s.b.variantId, costMinor: 90000 }]);
    await priceList(s, b.id, [{ variantId: s.a.variantId, costMinor: 110000, isPreferred: true }]);
    const la = (await c.get(`${SUP}/${a.id}/products`, s.viewer)).body.data;
    expect(la.total).toBe(2);
    expect(la.items.find((i: any) => i.variantId === s.a.variantId)).toMatchObject({ sku: s.a.sku, productTitle: 'Travel Bag', costMinor: 125000, minOrderQuantity: 10, isPreferred: false }); // preferred moved to B
    expect((await c.get(`${SUP}/${b.id}/products`, s.viewer)).body.data.items[0].isPreferred).toBe(true);
    await priceList(s, a.id, [{ variantId: s.a.variantId, costMinor: 120000 }]); // upsert, no duplicate row
    expect((await c.get(`${SUP}/${a.id}/products?q=${s.a.sku}`, s.viewer)).body.data.items).toMatchObject([{ costMinor: 120000 }]);
    expect((await c.get(`${SUP}/${a.id}`, s.viewer)).body.data.activeSkusCount).toBe(2);

    expect((await c.del(`${SUP}/${a.id}/products/${s.b.variantId}`, s.staff)).status).toBe(200);
    expect((await c.del(`${SUP}/${a.id}/products/${s.b.variantId}`, s.staff)).status).toBe(404);
    expect((await c.put(`${SUP}/${a.id}/products`, { items: [{ variantId: '018f0000-0000-7000-8000-000000000000', costMinor: 1 }] }, s.admin)).status).toBe(404);
    expect((await c.put(`${SUP}/${a.id}/products`, { items: [{ variantId: s.a.variantId, costMinor: 1 }, { variantId: s.a.variantId, costMinor: 2 }] }, s.admin)).status).toBe(400);
  });

  it('delete is soft and refused while the supplier has open purchase orders', async () => {
    const s = await shop();
    const { sup, po } = await submitted(s);
    const refused = await c.del(`${SUP}/${sup.id}`, s.staff);
    expect(refused.status).toBe(409);
    expect(refused.body.error.details).toMatchObject({ rule: 'has_open_purchase_orders' });
    expect((await c.get(`${SUP}/${sup.id}`, s.viewer)).body.data.openPurchaseOrders).toBe(1);
    expect((await c.post(`${PO}/${po.id}/cancel`, { reason: 'changed plans' }, s.staff)).status).toBe(200);
    expect((await c.del(`${SUP}/${sup.id}`, s.staff)).status).toBe(200);
    expect((await c.get(`${SUP}/${sup.id}`, s.admin)).status).toBe(404);
    // the code is free again
    expect((await c.post(SUP, { name: 'Again', code: sup.code }, s.admin)).status).toBe(201);
  });

  it('supplier detail carries products and recent purchase orders', async () => {
    const s = await shop();
    const { sup, po } = await submitted(s);
    const d = (await c.get(`${SUP}/${sup.id}`, s.viewer)).body.data;
    expect(d.products).toHaveLength(1);
    expect(d.recentPurchaseOrders).toMatchObject([{ id: po.id, poNumber: po.poNumber, status: 'submitted', totalMinor: 14_000_000 }]);
  });

  it('viewer reads but cannot write; other businesses see nothing', async () => {
    const s = await shop();
    const sup = await mkSupplier(s);
    expect((await c.post(SUP, { name: 'Nope' }, s.viewer)).status).toBe(403);
    expect((await c.patch(`${SUP}/${sup.id}`, { name: 'Nope' }, s.viewer)).status).toBe(403);
    expect((await c.del(`${SUP}/${sup.id}`, s.viewer)).status).toBe(403);
    expect((await c.put(`${SUP}/${sup.id}/products`, { items: [{ variantId: s.a.variantId, costMinor: 1 }] }, s.viewer)).status).toBe(403);
    const other = await c.registerVendor();
    expect((await c.get(SUP, other)).body.data).toMatchObject({ total: 0, items: [] });
    expect((await c.get(`${SUP}/${sup.id}`, other)).status).toBe(404);
    expect((await c.patch(`${SUP}/${sup.id}`, { name: 'Hijack' }, other)).status).toBe(404);
    expect((await c.get(SUP)).status).toBe(401);
  });
});

// ================================================================================================
describe('purchase orders: create and edit drafts', () => {
  it('Issue Purchase Order flow: defaults from the price list, GST from the variant, race-safe numbers', async () => {
    const s = await shop();
    const sup = await mkSupplier(s);
    await priceList(s, sup.id, [{ variantId: s.a.variantId, costMinor: 125000, minOrderQuantity: 10 }, { variantId: s.b.variantId, costMinor: 120000 }]);
    const po = await draft(s, sup.id, [{ variantId: s.a.variantId, quantity: 100 }, { variantId: s.b.variantId, quantity: 50, unitCostMinor: 100000 }], { notes: 'Urgent festive restock', shippingMinor: 5000 });
    expect(po.poNumber).toBe(`PO-${YEAR}-0001`);
    expect(po).toMatchObject({ status: 'draft', supplierName: 'Apex Tex Fab Industries', warehouseCode: 'MAIN', itemsCount: 2, unitsOrdered: 150, unitsReceived: 0, unitsOutstanding: 150, currency: 'INR', notes: 'Urgent festive restock', paymentTerms: 'Net 30', expectedAt: null, isLate: false });
    // 100 x 1,250.00 + 50 x 1,000.00 = 175,000.00; GST 12% = 21,000.00; + 50.00 shipping
    expect(po).toMatchObject({ subtotalMinor: 17_500_000, taxMinor: 2_100_000, shippingMinor: 5000, totalMinor: 19_605_000 });
    const lineA = po.lines.find((l: any) => l.variantId === s.a.variantId);
    expect(lineA).toMatchObject({ sku: s.a.sku, title: 'Travel Bag', unitCostMinor: 125000, taxRateBps: 1200, totalMinor: 12_500_000, taxMinor: 1_500_000, quantityOutstanding: 100 });
    expect(po.lines.find((l: any) => l.variantId === s.b.variantId).unitCostMinor).toBe(100000); // explicit cost wins over the price list
    expect(po.timeline.map((e: any) => e.label)).toEqual(['Draft created']);
    expect((await draft(s, sup.id, [{ variantId: s.b.variantId, quantity: 1 }])).poNumber).toBe(`PO-${YEAR}-0002`);
    // concurrent creates get distinct numbers
    const both = await Promise.all([draft(s, sup.id, [{ variantId: s.b.variantId, quantity: 1 }]), draft(s, sup.id, [{ variantId: s.b.variantId, quantity: 2 }])]);
    expect(new Set(both.map((p: any) => p.poNumber)).size).toBe(2);
  });

  it('falls back to the default warehouse and the variant cost; refuses what cannot be priced', async () => {
    const s = await shop();
    const sup = await mkSupplier(s);
    const noCost = await c.post(PO, { supplierId: sup.id, lines: [{ variantId: s.a.variantId, quantity: 5 }] }, s.staff);
    expect(noCost.status).toBe(400);
    expect(noCost.body.error.details).toMatchObject({ rule: 'cost_required' });
    const po = (await c.post(PO, { supplierId: sup.id, lines: [{ variantId: s.a.variantId, quantity: 5, unitCostMinor: 1000 }] }, s.staff)).body.data;
    expect(po.warehouse.id).toBe(s.wh.id); // default warehouse
    await priceList(s, sup.id, [{ variantId: s.a.variantId, costMinor: 125000, minOrderQuantity: 10 }]);
    const moq = await c.post(PO, { supplierId: sup.id, lines: [{ variantId: s.a.variantId, quantity: 5 }] }, s.staff);
    expect(moq.status).toBe(400);
    expect(moq.body.error.details).toMatchObject({ rule: 'below_moq' });
    const dupLine = await c.post(PO, { supplierId: sup.id, lines: [{ variantId: s.a.variantId, quantity: 10 }, { variantId: s.a.variantId, quantity: 10 }] }, s.staff);
    expect(dupLine.body.error.details).toMatchObject({ rule: 'duplicate_line' });
    expect((await c.post(PO, { supplierId: sup.id, lines: [] }, s.staff)).status).toBe(400);
    expect((await c.post(PO, { supplierId: sup.id, lines: [{ variantId: s.a.variantId, quantity: 0 }] }, s.staff)).status).toBe(400);
    expect((await c.post(PO, { supplierId: sup.id, lines: [{ variantId: '018f0000-0000-7000-8000-000000000000', quantity: 1, unitCostMinor: 1 }] }, s.staff)).status).toBe(404);
    expect((await c.post(PO, { supplierId: sup.id, warehouseId: '018f0000-0000-7000-8000-000000000000', lines: [{ variantId: s.a.variantId, quantity: 10 }] }, s.staff)).status).toBe(404);
  });

  it('inactive and blocked suppliers get no purchase orders', async () => {
    const s = await shop();
    const sup = await mkSupplier(s, { status: 'blocked' });
    const r = await c.post(PO, { supplierId: sup.id, lines: [{ variantId: s.a.variantId, quantity: 1, unitCostMinor: 1 }] }, s.staff);
    expect(r.status).toBe(409);
    expect(r.body.error.details).toMatchObject({ rule: 'supplier_not_active', status: 'blocked' });
  });

  it('edit a draft: lines replaced and re-priced, version lock, not editable once submitted, delete only drafts', async () => {
    const s = await shop();
    const sup = await mkSupplier(s);
    await priceList(s, sup.id, [{ variantId: s.a.variantId, costMinor: 125000 }, { variantId: s.b.variantId, costMinor: 120000 }]);
    const po = await draft(s, sup.id, [{ variantId: s.a.variantId, quantity: 10 }]);
    const up = await c.patch(`${PO}/${po.id}`, { lines: [{ variantId: s.b.variantId, quantity: 20 }], notes: 'edited', shippingMinor: 1000, version: po.version }, s.staff);
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    expect(up.body.data).toMatchObject({ notes: 'edited', itemsCount: 1, unitsOrdered: 20, subtotalMinor: 2_400_000, taxMinor: 288_000, totalMinor: 2_689_000, version: po.version + 1 });
    expect(up.body.data.timeline.map((e: any) => e.label)).toEqual(['Draft created', 'Draft edited']);
    expect((await c.patch(`${PO}/${po.id}`, { notes: 'stale', version: po.version }, s.staff)).body.error.code).toBe('VERSION_CONFLICT');
    // shipping alone keeps the lines
    expect((await c.patch(`${PO}/${po.id}`, { shippingMinor: 0 }, s.staff)).body.data.totalMinor).toBe(2_688_000);

    expect((await c.post(`${PO}/${po.id}/approve`, {}, s.admin)).status).toBe(200);
    const locked = await c.patch(`${PO}/${po.id}`, { notes: 'too late' }, s.staff);
    expect(locked.status).toBe(409);
    expect(locked.body.error.details).toMatchObject({ rule: 'not_draft' });
    expect((await c.del(`${PO}/${po.id}`, s.staff)).body.error.details).toMatchObject({ rule: 'not_draft' });

    const d2 = await draft(s, sup.id, [{ variantId: s.a.variantId, quantity: 1 }]);
    expect((await c.del(`${PO}/${d2.id}`, s.staff)).status).toBe(200);
    expect((await c.get(`${PO}/${d2.id}`, s.admin)).status).toBe(404);
  });

  it('duplicate copies the lines into a new draft with a new number', async () => {
    const s = await shop();
    const { po } = await submitted(s, 40);
    const copy = await c.post(`${PO}/${po.id}/duplicate`, {}, s.staff);
    expect(copy.status).toBe(201);
    expect(copy.body.data).toMatchObject({ status: 'draft', unitsOrdered: 40, totalMinor: po.totalMinor, notes: `Copy of ${po.poNumber}` });
    expect(copy.body.data.poNumber).not.toBe(po.poNumber);
  });

  it('draft export for other modules: supplier and warehouse resolved, MOQ raised, no stock touched', async () => {
    const s = await shop();
    const sup = await mkSupplier(s);
    const sup2 = await mkSupplier(s, { name: 'Pricey Co', gstin: undefined });
    await priceList(s, sup.id, [{ variantId: s.a.variantId, costMinor: 125000, minOrderQuantity: 25, isPreferred: true }]);
    await priceList(s, sup2.id, [{ variantId: s.a.variantId, costMinor: 90000 }]);
    const vendorId = s.admin.vendorId!;
    const made = await withVendor(t.database!.db, vendorId, (tx) => createDraftPurchaseOrder(tx, vendorId, { lines: [{ variantId: s.a.variantId, quantity: 5 }], reference: 'automation:rule-1', notes: 'auto' }));
    expect(made.poNumber).toMatch(/^PO-\d{4}-\d{4}$/);
    const po = (await c.get(`${PO}/${made.id}`, s.admin)).body.data;
    expect(po).toMatchObject({ status: 'draft', supplierId: sup.id, reference: 'automation:rule-1', unitsOrdered: 25, warehouseId: s.wh.id });
    expect((await stock(s, s.a.variantId)).incoming).toBe(0);
    await expect(withVendor(t.database!.db, vendorId, (tx) => createDraftPurchaseOrder(tx, vendorId, { lines: [{ variantId: s.b.variantId, quantity: 5 }] }))).rejects.toMatchObject({ details: { rule: 'no_supplier' } });
  });
});

// ================================================================================================
describe('purchase orders: approve, acknowledge, receive, cancel', () => {
  it('only administrators approve; approval announces incoming stock and sets the expected date', async () => {
    const s = await shop();
    const sup = await mkSupplier(s);
    await priceList(s, sup.id, [{ variantId: s.a.variantId, costMinor: 125000, leadTimeDays: 20 }]);
    const po = await draft(s, sup.id, [{ variantId: s.a.variantId, quantity: 100 }]);
    const denied = await c.post(`${PO}/${po.id}/approve`, {}, s.staff);
    expect(denied.status).toBe(403);
    expect((await c.post(`${PO}/${po.id}/approve`, {}, s.viewer)).status).toBe(403);
    expect(await stock(s, s.a.variantId)).toMatchObject({ incoming: 0 });

    const before = Date.now();
    const ok = await c.post(`${PO}/${po.id}/approve`, {}, s.admin);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: 'submitted', version: po.version + 1 });
    const days = (Date.parse(ok.body.data.expectedAt) - before) / 86_400_000;
    expect(days).toBeGreaterThan(19.9);
    expect(days).toBeLessThan(20.1); // the longest lead time wins: 20 (price list) over 14 (supplier)
    expect(await stock(s, s.a.variantId)).toMatchObject({ incoming: 100, onHand: 0 });
    expect(ok.body.data.timeline.map((e: any) => e.label)).toEqual(['Draft created', 'Approved and sent to the supplier']);
    expect((await t.outbox('purchase_order.submitted')).filter((e) => e.aggregateId === po.id)).toHaveLength(1);

    const again = await c.post(`${PO}/${po.id}/approve`, {}, s.admin);
    expect(again.status).toBe(409);
    expect(again.body.error.details).toMatchObject({ rule: 'not_draft' });
    expect((await stock(s, s.a.variantId)).incoming).toBe(100); // not announced twice
  });

  it('approve respects an explicit expected date and the supplier status', async () => {
    const s = await shop();
    const sup = await mkSupplier(s);
    const po = await draft(s, sup.id, [{ variantId: s.a.variantId, quantity: 3, unitCostMinor: 100 }]);
    await c.patch(`${SUP}/${sup.id}`, { status: 'blocked' }, s.admin);
    expect((await c.post(`${PO}/${po.id}/approve`, {}, s.admin)).body.error.details).toMatchObject({ rule: 'supplier_not_active' });
    await c.patch(`${SUP}/${sup.id}`, { status: 'active' }, s.admin);
    const ok = await c.post(`${PO}/${po.id}/approve`, { expectedAt: '2026-12-01T00:00:00Z' }, s.admin);
    expect(ok.body.data.expectedAt).toBe('2026-12-01T00:00:00.000Z');
  });

  it('acknowledge records the supplier date; only a submitted PO can be acknowledged', async () => {
    const s = await shop();
    const { po } = await submitted(s);
    const early = await draft(s, po.supplierId, [{ variantId: s.a.variantId, quantity: 10 }]);
    expect((await c.post(`${PO}/${early.id}/acknowledge`, {}, s.staff)).body.error.details).toMatchObject({ rule: 'not_submitted' });
    const ack = await c.post(`${PO}/${po.id}/acknowledge`, { expectedAt: '2026-11-20T00:00:00Z' }, s.staff);
    expect(ack.status).toBe(200);
    expect(ack.body.data).toMatchObject({ status: 'acknowledged', expectedAt: '2026-11-20T00:00:00.000Z' });
    expect(ack.body.data.acknowledgedAt).toBeTruthy();
    expect((await c.post(`${PO}/${po.id}/acknowledge`, {}, s.staff)).status).toBe(409);
    expect((await c.post(`${PO}/${po.id}/acknowledge`, {}, s.viewer)).status).toBe(403);
  });

  it('receive in parts: good units on hand, damaged units damaged, incoming drains, status follows', async () => {
    const s = await shop();
    const { po } = await submitted(s, 100);
    expect((await receive(s, po.id, [{ variantId: s.a.variantId, receivedQuantity: 60, damagedQuantity: 5 }], { note: 'first batch' })).status).toBe(200);
    // 60 arrived: 55 good, 5 damaged; 40 still expected
    expect(await stock(s, s.a.variantId)).toMatchObject({ onHand: 55, damaged: 5, incoming: 40, available: 55 });
    let d = (await c.get(`${PO}/${po.id}`, s.viewer)).body.data;
    expect(d).toMatchObject({ status: 'partially_received', unitsReceived: 60, unitsDamaged: 5, unitsOutstanding: 40, receivedAt: null });
    expect(d.lines[0]).toMatchObject({ quantityReceived: 60, quantityDamaged: 5, quantityOutstanding: 40 });
    expect(d.receipts).toHaveLength(1);
    expect(d.receipts[0]).toMatchObject({ note: 'first batch', items: [{ sku: s.a.sku, received: 60, damaged: 5 }] });

    const last = await receive(s, po.id, [{ lineId: d.lines[0].id, receivedQuantity: 40 }]);
    expect(last.body.data.purchaseOrder).toMatchObject({ status: 'received', unitsOutstanding: 0 });
    expect(last.body.data.purchaseOrder.receivedAt).toBeTruthy();
    expect(await stock(s, s.a.variantId)).toMatchObject({ onHand: 95, damaged: 5, incoming: 0 });
    d = last.body.data.purchaseOrder;
    expect(d.timeline.map((e: any) => e.label)).toEqual(['Draft created', 'Approved and sent to the supplier', 'Received 60 units (5 damaged)', 'Received 40 units']);
    expect((await t.outbox('purchase_order.received')).filter((e) => e.aggregateId === po.id).map((e) => e.payload.complete)).toEqual([false, true]);
    expect((await c.get('/api/v1/inventory/ledger-check', s.admin)).body.data).toEqual({ healthy: true, drift: [] });
    // nothing left to receive
    expect((await receive(s, po.id, [{ variantId: s.a.variantId, receivedQuantity: 1 }])).body.error.details).toMatchObject({ rule: 'not_receivable' });
  });

  it('over-receipt and bad input are refused without touching stock', async () => {
    const s = await shop();
    const { po } = await submitted(s, 10);
    const over = await receive(s, po.id, [{ variantId: s.a.variantId, receivedQuantity: 11 }]);
    expect(over.status).toBe(409);
    expect(over.body.error.details).toMatchObject({ rule: 'over_receipt', outstanding: 10, received: 11 });
    expect((await receive(s, po.id, [{ variantId: s.a.variantId, receivedQuantity: 2, damagedQuantity: 3 }])).body.error.details).toMatchObject({ rule: 'damaged_exceeds_received' });
    expect((await receive(s, po.id, [{ variantId: s.a.variantId, receivedQuantity: 0 }])).body.error.details).toMatchObject({ rule: 'nothing_received' });
    expect((await receive(s, po.id, [{ variantId: s.b.variantId, receivedQuantity: 1 }])).body.error.details).toMatchObject({ rule: 'unknown_line' });
    expect((await receive(s, po.id, [{ receivedQuantity: 1 }])).status).toBe(400); // lineId or variantId required
    expect((await receive(s, po.id, [{ variantId: s.a.variantId, receivedQuantity: 1 }, { variantId: s.a.variantId, receivedQuantity: 1 }])).body.error.details).toMatchObject({ rule: 'duplicate_line' });
    expect(await stock(s, s.a.variantId)).toMatchObject({ onHand: 0, incoming: 10 });
    const draftPo = await draft(s, po.supplierId, [{ variantId: s.a.variantId, quantity: 10 }]);
    expect((await receive(s, draftPo.id, [{ variantId: s.a.variantId, receivedQuantity: 1 }])).body.error.details).toMatchObject({ rule: 'not_receivable' });
    expect((await c.post(`${PO}/${po.id}/receive`, { items: [{ variantId: s.a.variantId, receivedQuantity: 1 }] }, s.viewer)).status).toBe(403);
  });

  it('two receipts of the same line at once cannot over-receive', async () => {
    const s = await shop();
    const { po } = await submitted(s, 40);
    const [x, y] = await Promise.all([receive(s, po.id, [{ variantId: s.a.variantId, receivedQuantity: 30 }]), receive(s, po.id, [{ variantId: s.a.variantId, receivedQuantity: 30 }])]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect(await stock(s, s.a.variantId)).toMatchObject({ onHand: 30, incoming: 10 });
    expect((await c.get(`${PO}/${po.id}`, s.admin)).body.data.unitsReceived).toBe(30);
  });

  it('a repeated receiptKey (or Idempotency-Key) returns the first receipt and moves nothing', async () => {
    const s = await shop();
    const { po } = await submitted(s, 50);
    const first = await receive(s, po.id, [{ variantId: s.a.variantId, receivedQuantity: 20 }], { receiptKey: 'grn-1' });
    const again = await receive(s, po.id, [{ variantId: s.a.variantId, receivedQuantity: 20 }], { receiptKey: 'grn-1' });
    expect(first.body.data.duplicate).toBe(false);
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ duplicate: true, receiptId: first.body.data.receiptId });
    expect(await stock(s, s.a.variantId)).toMatchObject({ onHand: 20, incoming: 30 });
    expect((await c.get(`${PO}/${po.id}`, s.admin)).body.data.receipts).toHaveLength(1);
    // the generic Idempotency-Key header replays the same response
    const h = { 'idempotency-key': 'recv-header-1' };
    const r1 = await c.call('POST', `${PO}/${po.id}/receive`, { as: s.staff, body: { items: [{ variantId: s.a.variantId, receivedQuantity: 5 }] }, headers: h });
    const r2 = await c.call('POST', `${PO}/${po.id}/receive`, { as: s.staff, body: { items: [{ variantId: s.a.variantId, receivedQuantity: 5 }] }, headers: h });
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(await stock(s, s.a.variantId)).toMatchObject({ onHand: 25, incoming: 25 });
  });

  it('cancel releases the incoming quantity (only what never arrived) and needs a reason', async () => {
    const s = await shop();
    const { po } = await submitted(s, 100);
    await receive(s, po.id, [{ variantId: s.a.variantId, receivedQuantity: 30 }]);
    expect((await c.post(`${PO}/${po.id}/cancel`, {}, s.staff)).status).toBe(400);
    expect((await c.post(`${PO}/${po.id}/cancel`, { reason: 'x' }, s.staff)).status).toBe(400);
    expect((await c.post(`${PO}/${po.id}/cancel`, { reason: 'supplier cannot deliver' }, s.viewer)).status).toBe(403);
    const r = await c.post(`${PO}/${po.id}/cancel`, { reason: 'supplier cannot deliver' }, s.staff);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ releasedUnits: 70, purchaseOrder: { status: 'cancelled', cancelReason: 'supplier cannot deliver' } });
    expect(await stock(s, s.a.variantId)).toMatchObject({ onHand: 30, incoming: 0 });
    expect(r.body.data.purchaseOrder.timeline.at(-1)).toMatchObject({ label: 'Cancelled', note: 'supplier cannot deliver' });
    expect((await t.outbox('purchase_order.cancelled')).filter((e) => e.aggregateId === po.id)).toHaveLength(1);
    expect((await c.post(`${PO}/${po.id}/cancel`, { reason: 'again please' }, s.staff)).body.error.details).toMatchObject({ rule: 'not_cancellable' });
    expect((await receive(s, po.id, [{ variantId: s.a.variantId, receivedQuantity: 1 }])).status).toBe(409);
    expect((await c.get('/api/v1/inventory/ledger-check', s.admin)).body.data.healthy).toBe(true);
  });

  it('cancel a draft touches no stock; a received PO cannot be cancelled', async () => {
    const s = await shop();
    const sup = await mkSupplier(s);
    const d = await draft(s, sup.id, [{ variantId: s.a.variantId, quantity: 5, unitCostMinor: 100 }]);
    const r = await c.post(`${PO}/${d.id}/cancel`, { reason: 'not needed' }, s.staff);
    expect(r.body.data).toMatchObject({ releasedUnits: 0, purchaseOrder: { status: 'cancelled' } });
    const { po } = await submitted(s, 10);
    await receive(s, po.id, [{ variantId: s.a.variantId, receivedQuantity: 10 }]);
    expect((await c.post(`${PO}/${po.id}/cancel`, { reason: 'too late now' }, s.staff)).status).toBe(409);
  });
});

// ================================================================================================
describe('lists, scorecards and overview', () => {
  it('Purchase Orders tab: filters, search, tab counts, paging, sorting, totals', async () => {
    const s = await shop();
    const wh2 = await c.makeWarehouse(s.admin, { code: 'DC2' });
    const sup1 = await mkSupplier(s);
    const sup2 = await mkSupplier(s, { name: 'Vanguard Luggage Components', gstin: undefined });
    await priceList(s, sup1.id, [{ variantId: s.a.variantId, costMinor: 125000 }]);
    await priceList(s, sup2.id, [{ variantId: s.b.variantId, costMinor: 120000 }]);
    const d1 = await draft(s, sup1.id, [{ variantId: s.a.variantId, quantity: 100 }], { reference: 'FESTIVE-1' });
    const d2 = await draft(s, sup2.id, [{ variantId: s.b.variantId, quantity: 50 }], { warehouseId: wh2.id });
    const d3 = await draft(s, sup2.id, [{ variantId: s.b.variantId, quantity: 10 }]);
    await c.post(`${PO}/${d2.id}/approve`, {}, s.admin);
    await c.post(`${PO}/${d3.id}/cancel`, { reason: 'duplicate order' }, s.staff);

    const all = (await c.get(PO, s.viewer)).body.data;
    expect(all).toMatchObject({ total: 3, page: 1, pageSize: 25, pages: 1, counts: { all: 3, draft: 1, submitted: 1, cancelled: 1, received: 0, acknowledged: 0, partially_received: 0 } });
    const q = async (qs: string) => (await c.get(`${PO}?${qs}`, s.viewer)).body.data;
    expect((await q('filter[status]=submitted')).items.map((i: any) => i.id)).toEqual([d2.id]);
    // tab counts ignore the status filter but honour the others
    expect((await q('filter[status]=draft&filter[supplierId]=' + sup2.id)).counts).toMatchObject({ all: 2, draft: 0, submitted: 1, cancelled: 1 });
    expect((await q(`filter[warehouseId]=${wh2.id}`)).items.map((i: any) => i.id)).toEqual([d2.id]);
    expect((await q('q=vanguard')).total).toBe(2);
    expect((await q('q=festive')).items.map((i: any) => i.id)).toEqual([d1.id]);
    expect((await q(`q=${d1.poNumber}`)).items.map((i: any) => i.id)).toEqual([d1.id]);
    const today = new Date().toISOString().slice(0, 10);
    expect((await q(`filter[orderDateFrom]=${today}&filter[orderDateTo]=${today}`)).total).toBe(3);
    expect((await q('filter[orderDateTo]=2020-01-01')).total).toBe(0);
    const paged = await q('pageSize=2&page=2&sort=poNumber');
    expect(paged).toMatchObject({ total: 3, pages: 2, page: 2 });
    expect(paged.items.map((i: any) => i.id)).toEqual([d3.id]);
    expect((await q('sort=-totalMinor')).items[0].id).toBe(d1.id);
    expect((await c.get(`${PO}?filter[status]=nonsense`, s.viewer)).status).toBe(400);
    expect((await c.get(`${PO}?sort=bogus`, s.viewer)).status).toBe(400);
  });

  it('supplier rating and on-time rate appear only after 3 real deliveries', async () => {
    const s = await shop();
    const sup = await mkSupplier(s);
    await priceList(s, sup.id, [{ variantId: s.a.variantId, costMinor: 125000 }]);
    const deliver = async (expectedAt: string, damaged = 0) => {
      const d = await draft(s, sup.id, [{ variantId: s.a.variantId, quantity: 10 }]);
      await c.post(`${PO}/${d.id}/approve`, { expectedAt }, s.admin);
      expect((await receive(s, d.id, [{ variantId: s.a.variantId, receivedQuantity: 10, damagedQuantity: damaged }])).status).toBe(200);
    };
    const far = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const past = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await deliver(far);
    await deliver(far);
    let row = (await c.get(`${SUP}/${sup.id}`, s.viewer)).body.data;
    expect(row).toMatchObject({ deliveredPurchaseOrders: 2, rating: null, onTimeRatePercent: null });
    expect(row.averageLeadTimeDays).not.toBeNull(); // real, tiny in a test (minutes)
    await deliver(far, 1);
    await deliver(past); // late
    row = (await c.get(`${SUP}/${sup.id}`, s.viewer)).body.data;
    // 4 deliveries, 3 on time (75%); 40 units, 1 damaged => 5 x (0.7 x 0.75 + 0.3 x 0.975) = 4.0875 -> 4.1
    expect(row).toMatchObject({ deliveredPurchaseOrders: 4, onTimeRatePercent: 75, rating: 4.1 });
    const listRow = (await c.get(SUP, s.viewer)).body.data.items[0];
    expect(listRow).toMatchObject({ onTimeRatePercent: 75, rating: 4.1 });
  });

  it('overview tiles from real purchase orders', async () => {
    const s = await shop();
    const empty = (await c.get('/api/v1/procurement/overview', s.viewer)).body.data;
    expect(empty).toMatchObject({ awaitingApproval: 0, belowCoverCount: 0, setupIncompleteSuppliers: 0, openPurchaseOrders: 0, valueInTransitMinor: 0, unitsInTransit: 0, latePurchaseOrders: 0, dueThisWeek: 0, averageLeadTimeDays: null, activeSuppliers: 0, warehousesCount: 1, reorderSuggestionsCount: 0 });

    const sup = await mkSupplier(s);
    await priceList(s, sup.id, [{ variantId: s.a.variantId, costMinor: 125000 }, { variantId: s.b.variantId, costMinor: 120000 }]);
    const soon = await draft(s, sup.id, [{ variantId: s.a.variantId, quantity: 100 }]);
    const late = await draft(s, sup.id, [{ variantId: s.b.variantId, quantity: 50 }]);
    await c.post(`${PO}/${soon.id}/approve`, { expectedAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }, s.admin);
    await c.post(`${PO}/${late.id}/approve`, { expectedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }, s.admin);
    await receive(s, soon.id, [{ variantId: s.a.variantId, receivedQuantity: 40 }]); // 60 still owed
    const o = (await c.get('/api/v1/procurement/overview', s.viewer)).body.data;
    // owed: 60 x 1,250.00 + 50 x 1,200.00 = 135,000.00
    expect(o).toMatchObject({ openPurchaseOrders: 2, unitsInTransit: 110, valueInTransitMinor: 13_500_000, latePurchaseOrders: 1, dueThisWeek: 1, activeSuppliers: 1, totalSuppliers: 1, warehousesWithInbound: 1, configuredLeadTimeDays: 14, averageLeadTimeDays: null });
    expect(o.statusCounts).toMatchObject({ partially_received: 1, submitted: 1, draft: 0 });
    const lateRow = (await c.get(`${PO}?filter[status]=submitted`, s.viewer)).body.data.items[0];
    expect(lateRow).toMatchObject({ id: late.id, isLate: true });
    expect((await c.get('/api/v1/procurement/overview')).status).toBe(401);
  });

  it('other businesses never see these purchase orders or numbers', async () => {
    const s = await shop();
    const { po, sup } = await submitted(s);
    const other = await c.registerVendor();
    expect((await c.get(PO, other)).body.data).toMatchObject({ total: 0, items: [] });
    for (const path of [`${PO}/${po.id}`]) expect((await c.get(path, other)).status).toBe(404);
    for (const action of ['approve', 'acknowledge', 'receive', 'cancel', 'duplicate']) {
      const r = await c.post(`${PO}/${po.id}/${action}`, action === 'cancel' ? { reason: 'stealing' } : action === 'receive' ? { items: [{ variantId: s.a.variantId, receivedQuantity: 1 }] } : {}, other);
      expect(r.status, action).toBe(404);
    }
    expect((await c.post(PO, { supplierId: sup.id, lines: [{ variantId: s.a.variantId, quantity: 1, unitCostMinor: 1 }] }, other)).status).toBe(404);
    expect((await c.get('/api/v1/procurement/overview', other)).body.data).toMatchObject({ openPurchaseOrders: 0 });
    // each business numbers its own purchase orders from 1
    const mine = await c.registerVendor();
    await c.makeWarehouse(mine);
    const v = await c.makeVariant(mine);
    const sup2 = (await c.post(SUP, { name: 'Mine' }, mine)).body.data;
    const first = await c.post(PO, { supplierId: sup2.id, lines: [{ variantId: v.variantId, quantity: 1, unitCostMinor: 5 }] }, mine);
    expect(first.body.data.poNumber).toBe(`PO-${YEAR}-0001`);
  });
});

// ================================================================================================
describe('reorder suggestions', () => {
  it('built from real sales velocity, matched to the preferred supplier, minus what is already on order', async () => {
    const w = await buildWorld(t, c, { stock: [20], sku: 'SUG-1' });
    const admin = w.admin;
    await orderArrives(t, c, w, 18);
    await rollupRecent(t.container, 2); // the sales read model feeds the velocity
    // 18 of 20 sold: 2 left, 0.6 units/day => stockout risk, suggested 30 days of cover
    const sug = (await c.get('/api/v1/procurement/reorder-suggestions', admin)).body.data.items as any[];
    const mine = sug.find((i) => i.sku === 'SUG-1');
    expect(mine, JSON.stringify(sug)).toBeTruthy();
    expect(mine).toMatchObject({ available: 2, suggestedUnits: 16, onOrderUnits: 0, netUnits: 16, supplier: null });
    expect((await c.get('/api/v1/procurement/overview', admin)).body.data.reorderSuggestionsCount).toBeGreaterThanOrEqual(1);

    // nobody supplies it yet: reported, never guessed
    const dry0 = await c.post(`${PO}/from-suggestions`, { dryRun: true }, admin);
    expect(dry0.body.data.unassigned).toMatchObject([{ sku: 'SUG-1', suggestedUnits: 16, reason: 'no_supplier' }]);
    expect(dry0.body.data.orders).toEqual([]);

    const cheap = (await c.post(SUP, { name: 'Cheap Co' }, admin)).body.data;
    const pref = (await c.post(SUP, { name: 'Preferred Co' }, admin)).body.data;
    await c.put(`${SUP}/${cheap.id}/products`, { items: [{ variantId: w.variant.variantId, costMinor: 80000 }] }, admin);
    await c.put(`${SUP}/${pref.id}/products`, { items: [{ variantId: w.variant.variantId, costMinor: 100000, minOrderQuantity: 20, isPreferred: true }] }, admin);
    expect((await c.get('/api/v1/procurement/reorder-suggestions', admin)).body.data.items.find((i: any) => i.sku === 'SUG-1').supplier).toMatchObject({ id: pref.id, costMinor: 100000 });
    // 2 units left at 0.6 a day is about 3 days of cover, shorter than the 7-day lead time of the supplier that would deliver it; both suppliers have a product list but no contact email yet
    const ov = (await c.get('/api/v1/procurement/overview', admin)).body.data;
    expect(ov).toMatchObject({ belowCoverCount: 1, awaitingApproval: 0, setupIncompleteSuppliers: 2 });
    await c.patch(`${SUP}/${cheap.id}`, { email: 'sales@cheap.example', version: cheap.version }, admin);
    expect((await c.get('/api/v1/procurement/overview', admin)).body.data.setupIncompleteSuppliers).toBe(1);

    const dry = await c.post(`${PO}/from-suggestions`, { dryRun: true }, admin);
    expect(dry.body.data.orders).toMatchObject([{ id: null, supplierId: pref.id, units: 20, totalMinor: 2_000_000, skus: ['SUG-1'] }]); // 16 raised to the MOQ of 20
    expect((await c.get(PO, admin)).body.data.total).toBe(0);

    const made = await c.post(`${PO}/from-suggestions`, {}, admin);
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    expect((await c.get('/api/v1/procurement/overview', admin)).body.data).toMatchObject({ awaitingApproval: 1, belowCoverCount: 0 }); // the draft waits for approval and covers the need
    expect(made.body.data.orders).toHaveLength(1);
    const po = (await c.get(`${PO}/${made.body.data.orders[0].id}`, admin)).body.data;
    expect(po).toMatchObject({ status: 'draft', supplierId: pref.id, unitsOrdered: 20, reference: 'reorder-suggestions' });
    // the draft now counts as on order: nothing is suggested twice
    expect((await c.get('/api/v1/procurement/reorder-suggestions', admin)).body.data.items.find((i: any) => i.sku === 'SUG-1')?.onOrderUnits ?? 'covered').not.toBe(0);
    const again = await c.post(`${PO}/from-suggestions`, {}, admin);
    expect(again.body.data.orders.filter((o: any) => o.skus.includes('SUG-1'))).toEqual([]);
  }, 60_000);

  it('viewers can read suggestions but not create drafts from them', async () => {
    const s = await shop();
    expect((await c.get('/api/v1/procurement/reorder-suggestions', s.viewer)).status).toBe(200);
    expect((await c.post(`${PO}/from-suggestions`, {}, s.viewer)).status).toBe(403);
    expect((await c.post(`${PO}/from-suggestions`, { dryRun: true }, s.staff)).status).toBe(200);
  });
});
