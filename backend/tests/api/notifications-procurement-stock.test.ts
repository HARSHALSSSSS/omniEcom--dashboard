import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';

/**
 * The seller's own purchasing and stock work leaves a trace in the notifications: a purchase order sent / received /
 * cancelled, a stock adjustment and a completed warehouse transfer.
 */
let t: TestApp;
let c: ReturnType<typeof clientFor>;
const SUP = '/api/v1/suppliers';
const PO = '/api/v1/purchase-orders';
const INV = '/api/v1/inventory';

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

async function shop() {
  const admin = await c.registerVendor({ businessName: `Notify ${Math.random().toString(36).slice(2, 7)}` });
  const staff = await c.addMember(admin, 'vendor_staff');
  const wh = await c.makeWarehouse(admin, { code: 'MAIN' });
  const other = await c.makeWarehouse(admin, { code: 'ALT', name: 'Alt Hub' });
  const a = await c.makeVariant(admin, { title: 'Travel Bag' });
  return { admin, staff, wh, other, a };
}
type Shop = Awaited<ReturnType<typeof shop>>;

const notes = async (as: Actor) => {
  await t.pump();
  const r = await c.get('/api/v1/notifications?limit=100', as);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.items as Array<{ type: string; title: string; body: string | null; category: string; actionUrl: string | null }>;
};

async function approvedPo(s: Shop, qty = 50) {
  const sup = await c.post(SUP, { name: 'Apex Tex Fab Industries', email: 'sales@apex.test', city: 'Surat', state: 'Gujarat', leadTimeDays: 5 }, s.admin);
  expect(sup.status, JSON.stringify(sup.body)).toBe(201);
  const list = await c.put(`${SUP}/${sup.body.data.id}/products`, { items: [{ variantId: s.a.variantId, costMinor: 125000, minOrderQuantity: 1 }] }, s.admin);
  expect(list.status, JSON.stringify(list.body)).toBe(200);
  const draft = await c.post(PO, { supplierId: sup.body.data.id, warehouseId: s.wh.id, lines: [{ variantId: s.a.variantId, quantity: qty }] }, s.staff);
  expect(draft.status, JSON.stringify(draft.body)).toBe(201);
  const ok = await c.post(`${PO}/${draft.body.data.id}/approve`, {}, s.admin);
  expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  return ok.body.data as { id: string; poNumber: string };
}

describe('purchase orders notify the team', () => {
  it('sending, receiving (partly, then fully) and cancelling a purchase order each leave a notification', async () => {
    const s = await shop();
    const po = await approvedPo(s, 50);

    let list = await notes(s.admin);
    const sent = list.find((n) => n.type === 'procurement.po_submitted');
    expect(sent, JSON.stringify(list.map((n) => n.type))).toBeTruthy();
    expect(sent!.title).toContain(po.poNumber);
    expect(sent!.body).toContain('50 unit(s)');
    expect(sent!.actionUrl).toBe(`/procurement?po=${po.id}`);
    expect((await notes(s.staff)).some((n) => n.type === 'procurement.po_submitted')).toBe(true); // the whole team sees it

    const first = await c.post(`${PO}/${po.id}/receive`, { items: [{ variantId: s.a.variantId, receivedQuantity: 30, damagedQuantity: 2 }] }, s.staff);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    list = await notes(s.admin);
    const partly = list.find((n) => n.type === 'procurement.po_received');
    expect(partly!.title).toMatch(/partly received/);
    expect(partly!.body).toContain('2 damaged');

    const rest = await c.post(`${PO}/${po.id}/receive`, { items: [{ variantId: s.a.variantId, receivedQuantity: 20 }] }, s.staff);
    expect(rest.status, JSON.stringify(rest.body)).toBe(200);
    expect((await notes(s.admin)).some((n) => n.type === 'procurement.po_received' && /fully received/.test(n.title))).toBe(true);

    const second = await approvedPo(s, 10);
    expect((await c.post(`${PO}/${second.id}/cancel`, { reason: 'changed plans' }, s.staff)).status).toBe(200);
    const cancelled = (await notes(s.admin)).find((n) => n.type === 'procurement.po_cancelled');
    expect(cancelled!.title).toContain(second.poNumber);
    expect(cancelled!.body).toBe('changed plans');
  });
});

describe('stock work notifies the team', () => {
  it('an adjustment and a completed transfer each leave a notification', async () => {
    const s = await shop();
    await approvedPo(s, 40).then((po) => c.post(`${PO}/${po.id}/receive`, { items: [{ variantId: s.a.variantId, receivedQuantity: 40 }] }, s.staff));

    const adj = await c.post(`${INV}/adjustments`, { variantId: s.a.variantId, warehouseId: s.wh.id, type: 'shrinkage', quantity: 3, direction: 'decrease', reason: 'Lost in the godown' }, s.admin);
    expect(adj.status, JSON.stringify(adj.body)).toBe(200);
    const adjusted = (await notes(s.admin)).find((n) => n.type === 'inventory.stock_adjusted');
    expect(adjusted, 'a stock adjustment notification').toBeTruthy();
    expect(adjusted!.title).toContain(s.a.sku);
    expect(adjusted!.title).toContain('shrinkage');
    expect(adjusted!.body).toContain('40 to 37');
    expect(adjusted!.actionUrl).toContain('/inventory');

    const moved = await c.post(`${INV}/transfer-now`, { sku: s.a.sku, from: s.wh.id, to: s.other.id, quantity: 10 }, s.admin);
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const transfer = (await notes(s.admin)).find((n) => n.type === 'inventory.transferred');
    expect(transfer, 'a transfer notification').toBeTruthy();
    expect(transfer!.body).toContain('10 unit(s) moved from');
    expect(transfer!.body).toContain('Alt Hub');
  });

  it('a stock count that changes nothing, or a preview, creates no notification', async () => {
    const s = await shop();
    await approvedPo(s, 20).then((po) => c.post(`${PO}/${po.id}/receive`, { items: [{ variantId: s.a.variantId, receivedQuantity: 20 }] }, s.staff));
    const before = (await notes(s.admin)).filter((n) => n.type === 'inventory.stock_adjusted').length;
    const preview = await c.post(`${INV}/adjustments/preview`, { variantId: s.a.variantId, warehouseId: s.wh.id, type: 'manual', quantity: 2, direction: 'decrease', reason: 'what if' }, s.admin);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect((await notes(s.admin)).filter((n) => n.type === 'inventory.stock_adjusted').length).toBe(before);
  });
});
