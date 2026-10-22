import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type TestApp } from '@oms/testing';
import { buildWorld, orderArrives, pickAndPack, type World } from '../helpers/stage4';

/** Pickup slots (Book slot) and dispatched orders on Orders to Ship (Track dispatch). */
let t: TestApp;
let c: ReturnType<typeof clientFor>;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

async function sqlAdmin(stmt: string): Promise<void> {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { await pg.exec(stmt); } finally { await pg.exec('SET ROLE oms_app'); }
}
async function packedOrder(w: World) {
  const order = await orderArrives(t, c, w, 1);
  const started = await c.post(`/api/v1/orders/${order.id}/fulfillment`, {}, w.admin);
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  const f = started.body.data.fulfillments[0];
  await pickAndPack(t, c, w, f.id);
  return { order, f };
}
const addMethod = async (w: World, body: Record<string, unknown>) => { const r = await c.post('/api/v1/shipping/methods', body, w.admin); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body.data; };
const selectIt = (w: World, fid: string, body: Record<string, unknown>) => c.post(`/api/v1/shipping/orders/${fid}/selection`, body, w.admin);
const orders = async (w: World, qs = '') => (await c.get(`/api/v1/shipping/orders${qs}`, w.admin)).body.data;
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const NIL = '00000000-0000-4000-8000-000000000000';

describe('pickup slots: book, list, cancel', () => {
  it('a carrier-collected method awaits a slot; a provider schedules it, others are recorded as manual; cancel puts it back', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [10] });
    const wh = w.warehouses[0]!.id;
    const sandbox = ((await c.get('/api/v1/shipping/methods', w.admin)).body.data.items as any[])[0];
    const o = await packedOrder(w);
    await selectIt(w, o.f.id, { kind: 'third_party', source: 'manual_override' });
    let row = (await orders(w)).items[0];
    expect(row).toMatchObject({ status: 'selected', pickup: { state: 'awaiting', methodId: sandbox.id, warehouseId: wh, slot: null }, action: { key: 'book_slot', label: 'Book slot' } });
    expect(row.secondaryActions.map((a: any) => a.key)).toEqual(['review', 'generate_label']);

    const body = (over: Record<string, unknown> = {}) => ({ warehouseId: wh, methodId: sandbox.id, date: tomorrow(), windowStart: '10:00', windowEnd: '12:00', parcelCount: 3, ...over });
    for (const bad of [{ date: '2020-01-01' }, { windowEnd: '09:00' }, { windowStart: '25:00' }, { parcelCount: 0 }, { date: '2026-13-45' }]) expect((await c.post('/api/v1/shipping/pickup-slots', body(bad), w.admin)).status, JSON.stringify(bad)).toBe(400);
    expect((await c.post('/api/v1/shipping/pickup-slots', body({ methodId: NIL }), w.admin)).status).toBe(404);
    const slot = await c.post('/api/v1/shipping/pickup-slots', body(), w.admin);
    expect(slot.status, JSON.stringify(slot.body)).toBe(201);
    expect(slot.body.data).toMatchObject({ date: tomorrow(), windowStart: '10:00', windowEnd: '12:00', parcelCount: 3, status: 'confirmed', mode: 'provider', cancellable: true, warehouse: { id: wh }, method: { id: sandbox.id } });
    expect(slot.body.data.reference).toMatch(/^SBXPK/);
    const overlap = await c.post('/api/v1/shipping/pickup-slots', body({ windowStart: '11:00', windowEnd: '13:00' }), w.admin);
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.details.rule).toBe('slot_overlap');
    expect((await c.post('/api/v1/shipping/pickup-slots', body({ windowStart: '12:00', windowEnd: '14:00' }), w.admin)).status).toBe(201); // back to back is fine
    row = (await orders(w)).items[0];
    expect(row).toMatchObject({ pickup: { state: 'booked', slot: { id: slot.body.data.id, status: 'confirmed' } }, action: { key: 'review' } });
    const list = (await c.get('/api/v1/shipping/pickup-slots', w.admin)).body.data;
    expect(list.items.map((x: any) => x.windowStart)).toEqual(['10:00', '12:00']);
    const cancelled = await c.post(`/api/v1/shipping/pickup-slots/${slot.body.data.id}/cancel`, {}, w.admin);
    expect(cancelled.body.data).toMatchObject({ status: 'cancelled', cancellable: false });
    expect((await c.post(`/api/v1/shipping/pickup-slots/${slot.body.data.id}/cancel`, {}, w.admin)).status).toBe(409);
    expect(((await c.get('/api/v1/shipping/pickup-slots', w.admin)).body.data.items as any[]).map((x) => x.status)).toEqual(['confirmed']);
    expect(((await c.get('/api/v1/shipping/pickup-slots?scope=all', w.admin)).body.data.items as any[]).map((x) => x.status).sort()).toEqual(['cancelled', 'confirmed']);

    // a provider that refuses: the failure is recorded with the reason
    await c.patch(`/api/v1/shipping/providers/${sandbox.id}`, { config: { fail: 'pickup' } }, w.admin);
    const failed = await c.post('/api/v1/shipping/pickup-slots', body({ windowStart: '15:00', windowEnd: '16:00' }), w.admin);
    expect(failed.body.data).toMatchObject({ status: 'failed', mode: 'provider', cancellable: false });
    expect(failed.body.data.note).toContain('simulated failure');
  });

  it('marketplace shipping and a configured logistics provider are manual bookings; own shipping needs none', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [10] });
    const wh = w.warehouses[0]!.id;
    const mk = await addMethod(w, { kind: 'marketplace', channelCode: 'mock' });
    await addMethod(w, { kind: 'seller' });
    const o1 = await packedOrder(w);
    const o2 = await packedOrder(w);
    await selectIt(w, o1.f.id, { kind: 'marketplace', source: 'manual_override' });
    await selectIt(w, o2.f.id, { kind: 'seller', source: 'manual_override' });
    const rows = (await orders(w)).items as any[];
    expect(rows.find((r) => r.fulfillmentId === o1.f.id).pickup.state).toBe('awaiting');
    expect(rows.find((r) => r.fulfillmentId === o2.f.id)).toMatchObject({ pickup: { state: 'not_applicable' }, action: { key: 'review' } });
    const slot = { warehouseId: wh, date: tomorrow(), windowStart: '09:00', windowEnd: '11:00', parcelCount: 1 };
    const m = await c.post('/api/v1/shipping/pickup-slots', { ...slot, methodId: mk.id, note: 'ask for the blue gate' }, w.admin);
    expect(m.body.data).toMatchObject({ status: 'manual', mode: 'manual', reference: null, note: 'ask for the blue gate', method: { kind: 'marketplace' } });
    const fleet = await addMethod(w, { kind: 'custom', label: 'Shree Fleet', config: { trackingUrlTemplate: 'https://t.example/{awb}' } });
    expect((await c.post('/api/v1/shipping/pickup-slots', { ...slot, methodId: fleet.id, parcelCount: 2 }, w.admin)).body.data).toMatchObject({ status: 'manual', mode: 'manual' });
    await c.patch(`/api/v1/shipping/methods/${fleet.id}`, { active: false }, w.admin);
    expect((await c.post('/api/v1/shipping/pickup-slots', { ...slot, methodId: fleet.id, windowStart: '13:00', windowEnd: '14:00' }, w.admin)).body.error.details.rule).toBe('method_disabled');
  });

  it('is permissioned and private to the business', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [1] });
    const wh = w.warehouses[0]!.id;
    const sandbox = ((await c.get('/api/v1/shipping/methods', w.admin)).body.data.items as any[])[0];
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    const staff = await c.addMember(w.admin, 'vendor_staff');
    const slotBody = { warehouseId: wh, methodId: sandbox.id, date: tomorrow(), windowStart: '10:00', windowEnd: '11:00', parcelCount: 1 };
    expect((await c.post('/api/v1/shipping/pickup-slots', slotBody, viewer)).status).toBe(403);
    const slot = await c.post('/api/v1/shipping/pickup-slots', slotBody, staff);
    expect(slot.status).toBe(201);
    expect((await c.get('/api/v1/shipping/pickup-slots', viewer)).body.data.items).toHaveLength(1);
    expect((await c.post(`/api/v1/shipping/pickup-slots/${slot.body.data.id}/cancel`, {}, viewer)).status).toBe(403);
    const rival = await c.registerVendor({ businessName: 'Rival Pickup Ltd' });
    expect((await c.get('/api/v1/shipping/pickup-slots', rival)).body.data.items).toEqual([]);
    expect((await c.post(`/api/v1/shipping/pickup-slots/${slot.body.data.id}/cancel`, {}, rival)).status).toBe(404);
    expect((await c.post('/api/v1/shipping/pickup-slots', slotBody, rival)).status).toBe(404);
    expect((await c.get('/api/v1/shipping/pickup-slots')).status).toBe(401);
  });
});

describe('dispatched orders on Orders to Ship (Track dispatch)', () => {
  it('shows a recently dispatched order as AWB assigned with a tracking action, without counting it as ready to ship', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [10] });
    await addMethod(w, { kind: 'seller' });
    const a = await packedOrder(w);
    const b = await packedOrder(w);
    await selectIt(w, b.f.id, { kind: 'seller', source: 'manual_override' });
    const lab = (await c.post('/api/v1/shipping/orders/bulk', { action: 'generate_labels', fulfillmentIds: [b.f.id] }, w.admin)).body.data;
    const shipmentId = lab.results[0].shipmentId as string;
    expect((await c.post(`/api/v1/shipments/${shipmentId}/dispatch`, {}, w.admin)).status).toBe(200);
    const list = await orders(w);
    expect(list.counts).toMatchObject({ readyToShip: 1, needs_decision: 1, dispatched: 1 });
    const d = list.items.find((i: any) => i.fulfillmentId === b.f.id);
    expect(d).toMatchObject({ status: 'dispatched', shipmentId, action: { key: 'track_dispatch', label: 'Track dispatch', method: 'GET', href: `/api/v1/shipments/${shipmentId}/tracking`, enabled: true }, pickup: { state: 'not_applicable' } });
    expect(list.items.find((i: any) => i.fulfillmentId === a.f.id).status).toBe('needs_decision');
    expect((await orders(w, '?filter[status]=dispatched')).items.map((i: any) => i.number)).toEqual([b.order.orderNumber]);
    const ov = (await c.get('/api/v1/shipping/overview', w.admin)).body.data;
    expect(ov.pulse.readyToShip.count).toBe(1);
    expect(ov.attention.parts.slaRisk).toBe(0);
    // an old dispatch drops off the list (Tracking has it)
    await sqlAdmin(`UPDATE shipments SET dispatched_at = now() - interval '2 days' WHERE id = '${shipmentId}'`);
    expect((await orders(w)).items.map((i: any) => i.fulfillmentId)).toEqual([a.f.id]);
  });
});
