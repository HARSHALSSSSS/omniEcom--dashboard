import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type TestApp } from '@oms/testing';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
const SUP = '/api/v1/suppliers';
const PICK = '/api/v1/procurement/variants';

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

async function shop() {
  const admin = await c.registerVendor({ businessName: `Picker ${Math.random().toString(36).slice(2, 7)}` });
  const viewer = await c.addMember(admin, 'vendor_viewer');
  await c.makeWarehouse(admin, { code: 'MAIN' });
  const a = await c.makeVariant(admin, { title: 'Travel Bag' });
  const b = await c.makeVariant(admin, { title: 'Backpack' });
  return { admin, viewer, a, b };
}

describe('GET /procurement/variants (purchase order line picker)', () => {
  it('searches active variants by title or SKU and carries the stock position and GST rate', async () => {
    const s = await shop();
    const all = await c.get(PICK, s.viewer);
    expect(all.status, JSON.stringify(all.body)).toBe(200);
    expect(all.body.data.total).toBe(2);
    expect(all.body.data.items[0]).toMatchObject({ offer: null, available: expect.any(Number), incoming: expect.any(Number), taxRateBps: expect.any(Number) });

    const byTitle = await c.get(`${PICK}?q=backpack`, s.viewer);
    expect(byTitle.body.data.items.map((i: { variantId: string }) => i.variantId)).toEqual([s.b.variantId]);
    const bySku = await c.get(`${PICK}?q=${encodeURIComponent(s.a.sku)}`, s.viewer);
    expect(bySku.body.data.items.map((i: { variantId: string }) => i.variantId)).toEqual([s.a.variantId]);
    expect((await c.get(`${PICK}?q=zzzz-nothing`, s.viewer)).body.data.total).toBe(0);
  });

  it('with a supplier it adds that supplier price, MOQ and lead time and can list only its products', async () => {
    const s = await shop();
    const sup = (await c.post(SUP, { name: 'Apex Tex Fab Industries', leadTimeDays: 14 }, s.admin)).body.data as { id: string };
    expect((await c.put(`${SUP}/${sup.id}/products`, { items: [{ variantId: s.b.variantId, costMinor: 90000, minOrderQuantity: 5, leadTimeDays: 9, supplierSku: 'APX-BP' }] }, s.admin)).status).toBe(200);

    const listed = await c.get(`${PICK}?filter[supplierId]=${sup.id}`, s.viewer);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    expect(listed.body.data.items[0]).toMatchObject({ variantId: s.b.variantId, offer: { costMinor: 90000, minOrderQuantity: 5, leadTimeDays: 9, supplierSku: 'APX-BP', isPreferred: false } }); // supplied first
    expect(listed.body.data.items[1]).toMatchObject({ variantId: s.a.variantId, offer: null });

    const only = await c.get(`${PICK}?filter[supplierId]=${sup.id}&filter[supplied]=true`, s.viewer);
    expect(only.body.data.total).toBe(1);
    expect(only.body.data.items[0].variantId).toBe(s.b.variantId);

    expect((await c.get(`${PICK}?filter[supplied]=true`, s.viewer)).status).toBe(400);
    expect((await c.get(`${PICK}?filter[supplierId]=018f0000-0000-7000-8000-000000000000`, s.viewer)).status).toBe(404);
  });

  it('pages the result and never shows another business products', async () => {
    const s = await shop();
    const other = await shop();
    const p1 = await c.get(`${PICK}?pageSize=1&page=1`, s.viewer);
    expect(p1.body.data).toMatchObject({ total: 2, pages: 2, pageSize: 1 });
    expect(p1.body.data.items).toHaveLength(1);
    const ids = (await c.get(PICK, other.viewer)).body.data.items.map((i: { variantId: string }) => i.variantId);
    expect(ids).not.toContain(s.a.variantId);
  });
});
