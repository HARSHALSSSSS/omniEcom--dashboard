import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type TestApp } from '@oms/testing';
import { buildWorld, orderArrives, pickAndPack, ship } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
beforeAll(async () => { t = await buildTestApp({ database: true }); c = clientFor(t); });
afterAll(() => t.close());

const R = '/api/v1/returns';
const checklist = { packagingIntact: true, productUsable: true, accessoriesPresent: true, visibleDamage: false, productMismatch: false, missingQuantity: false };

describe('returns ledger: stage filter and sort', () => {
  it('filters by stage with the same stage the rows report, sorts by refund amount, rejects bad sort', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [100] });
    const order = await orderArrives(t, c, w, 10);
    const f = (await c.post(`/api/v1/orders/${order.id}/fulfillment`, {}, w.admin)).body.data.fulfillments[0];
    await pickAndPack(t, c, w, f.id);
    await ship(t, c, w, f.id);
    const wh = w.warehouses[0]!.id;
    const mk = async (qty: number) => (await c.post(R, { orderId: order.id, reasonCode: 'size_fit', items: [{ orderItemId: order.items[0].id, quantity: qty }] }, w.admin)).body.data;

    const requested = await mk(1);
    const approved = await mk(2);
    await c.post(`${R}/${approved.id}/approve`, { warehouseId: wh }, w.admin);
    const received = await mk(3);
    await c.post(`${R}/${received.id}/approve`, { warehouseId: wh }, w.admin);
    await c.post(`${R}/${received.id}/receive`, { warehouseId: wh, items: [{ returnItemId: received.items[0].id, quantity: 3 }] }, w.admin);
    const resolution = await mk(1);
    await c.post(`${R}/${resolution.id}/approve`, { warehouseId: wh }, w.admin);
    await c.post(`${R}/${resolution.id}/receive`, { warehouseId: wh, items: [{ returnItemId: resolution.items[0].id, quantity: 1 }] }, w.admin);
    expect((await c.post(`${R}/${resolution.id}/inspection`, { checklist, result: 'pass' }, w.admin)).status).toBe(200);

    const ids = async (q: string) => ((await c.get(`${R}/ledger?${q}`, w.admin)).body.data.items as Array<{ id: string; stage: string }>);
    const stageOf = async (q: string) => { const rows = await ids(q); expect(rows.every((r) => r.stage === q.split('=')[1])).toBe(true); return rows.map((r) => r.id); };
    expect(await stageOf('filter[stage]=requested')).toEqual([requested.id]);
    expect(await stageOf('filter[stage]=approved')).toEqual([approved.id]);
    expect(await stageOf('filter[stage]=received')).toEqual([received.id]);
    expect(await stageOf('filter[stage]=resolution')).toEqual([resolution.id]);
    expect(await stageOf('filter[stage]=closed')).toEqual([]);
    expect((await ids('filter[stage]=requested&filter[stage]=approved')).length).toBe(2);

    const byAmount = (await ids('sort=-refundAmount')).map((r) => r.id);
    expect(byAmount[0]).toBe(received.id);
    const oldest = (await ids('sort=requestedAt')).map((r) => r.id);
    expect(oldest[0]).toBe(requested.id);
    expect((await c.get(`${R}/ledger?sort=bogus`, w.admin)).status).toBe(400);
  });
});
