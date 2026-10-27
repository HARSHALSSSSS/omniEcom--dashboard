import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type TestApp } from '@oms/testing';
import { buildWorld, orderArrives, pickAndPack, ship, simulate, type World } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

/** run SQL as the table owner (tests only: moves deadlines that no endpoint should move) */
async function sqlAdmin(stmt: string): Promise<void> {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { await pg.exec(stmt); } finally { await pg.exec('SET ROLE oms_app'); }
}

const FQ = '/api/v1/fulfillment';
const act = (w: World, orderId: string, body: Record<string, unknown>, as = w.admin) => c.post(`${FQ}/${orderId}/actions`, body, as);
const startOrder = async (w: World, qty = 1) => {
  const order = await orderArrives(t, c, w, qty);
  const started = await c.post(`/api/v1/orders/${order.id}/fulfillment`, {}, w.admin);
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  return { order, f: started.body.data.fulfillments[0] };
};
const packedOrder = async (w: World, qty = 1) => { const x = await startOrder(w, qty); await pickAndPack(t, c, w, x.f.id); return x; };

describe('fulfillment queue', () => {
  it('shows orders per stage with SLA, items, warehouse and carrier; counts agree with the filters', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [50] });
    const a = await startOrder(w, 2);                              // awaiting pick
    const b = await startOrder(w, 1);                              // picking
    expect((await c.post('/api/v1/pick-lists', { fulfillmentIds: [b.f.id] }, w.admin)).status).toBe(201);
    const p = await packedOrder(w, 1);                             // ready to ship (packed, no label yet)
    const l = await packedOrder(w, 1);                             // label created
    expect((await c.post('/api/v1/shipments', { fulfillmentId: l.f.id, providerCode: 'sandbox' }, w.admin)).status).toBe(201);
    const d = await packedOrder(w, 1);                             // shipped: leaves the queue
    await ship(t, c, w, d.f.id);
    await sqlAdmin(`UPDATE orders SET dispatch_due_at = now() + interval '135 minutes' WHERE id = '${a.order.id}'`);
    await sqlAdmin(`UPDATE orders SET dispatch_due_at = now() - interval '40 minutes' WHERE id = '${b.order.id}'`);
    await sqlAdmin(`UPDATE fulfillments SET priority = 'urgent' WHERE id = '${p.f.id}'`);

    const qr = await c.get(`${FQ}/queue`, w.admin);
    const q = qr.body.data;
    expect(q.counts).toEqual({ awaiting_pick: 1, picking: 1, packing: 0, ready_to_ship: 2, all: 4, onHold: 0, exceptions: 0, packed: 1, dispatchedToday: 1 });
    expect(q.total).toBe(4);
    // urgent first, then by SLA deadline
    expect(q.items[0]).toMatchObject({ orderId: p.order.id, priority: 'urgent', stage: 'ready_to_ship' });
    const rowA = q.items.find((r: any) => r.orderId === a.order.id);
    expect(rowA).toMatchObject({ stage: 'awaiting_pick', stageLabel: 'Awaiting pick', status: 'confirmed', nextAction: 'start', warehouse: { code: 'MAIN' }, itemCount: 1, unitCount: 2, carrier: null, orderNumber: a.order.orderNumber });
    expect(rowA.sla).toMatchObject({ band: 'approaching' });
    expect(rowA.sla.label).toMatch(/^Due in 2h/);
    expect(rowA.items[0]).toMatchObject({ sku: w.variant.sku, quantity: 2, pickedQuantity: 0, pickState: 'pending' });
    const rowB = q.items.find((r: any) => r.orderId === b.order.id);
    expect(rowB).toMatchObject({ stage: 'picking', nextAction: 'pick_all', pickList: { number: expect.stringMatching(/^PL-/) } });
    expect(rowB.sla).toMatchObject({ band: 'breached', label: expect.stringMatching(/^Overdue by 4\dm$/) });
    const rowL = q.items.find((r: any) => r.orderId === l.order.id);
    expect(rowL).toMatchObject({ stage: 'ready_to_ship', carrier: 'Sandbox Express', shipmentStatus: 'label_ready', nextAction: 'handover' });
    expect(rowL.awb).toMatch(/^SBX/);
    expect(q.items.find((r: any) => r.orderId === p.order.id).nextAction).toBe('ready');
    expect(q.items.find((r: any) => r.orderId === d.order.id)).toBeUndefined();

    // filters; counts ignore the stage but honour the other filters
    const stage = (await c.get(`${FQ}/queue?filter[stage]=ready_to_ship`, w.admin)).body.data;
    expect(stage.items).toHaveLength(2);
    expect(stage.counts.all).toBe(4);
    expect((await c.get(`${FQ}/queue?filter[carrier]=sandbox`, w.admin)).body.data.items.map((r: any) => r.orderId)).toEqual([l.order.id]);
    expect((await c.get(`${FQ}/queue?filter[carrier]=Sandbox Express`, w.admin)).body.data.total).toBe(1);
    expect((await c.get(`${FQ}/queue?filter[priority]=urgent`, w.admin)).body.data.counts).toMatchObject({ ready_to_ship: 1, all: 1 });
    expect((await c.get(`${FQ}/queue?filter[warehouse]=${w.warehouses[0]!.id}`, w.admin)).body.data.total).toBe(4);
    expect((await c.get(`${FQ}/queue?filter[warehouse]=00000000-0000-4000-8000-000000000000`, w.admin)).body.data.total).toBe(0);
    expect((await c.get(`${FQ}/queue?q=${encodeURIComponent(a.order.orderNumber)}`, w.admin)).body.data.items.map((r: any) => r.orderId)).toEqual([a.order.id]);
    expect((await c.get(`${FQ}/queue?q=${w.variant.sku}`, w.admin)).body.data.total).toBe(4);
    const paged = (await c.get(`${FQ}/queue?pageSize=2&page=2`, w.admin)).body.data;
    expect(paged).toMatchObject({ page: 2, pageSize: 2, total: 4, pages: 2 });
    expect(paged.items).toHaveLength(2);
    expect((await c.get(`${FQ}/queue?filter[stage]=nope`, w.admin)).status).toBe(400);

    // a held fulfillment stays in its stage, flagged, and counts as on hold
    expect((await c.post(`/api/v1/fulfillments/${a.f.id}/hold`, { reason: 'check address' }, w.admin)).status).toBe(200);
    const held = (await c.get(`${FQ}/queue`, w.admin)).body.data;
    expect(held.counts).toMatchObject({ awaiting_pick: 1, onHold: 1 });
    expect(held.items.find((r: any) => r.orderId === a.order.id)).toMatchObject({ stage: 'awaiting_pick', onHold: true, status: 'on_hold' });
  });

  it('is tenant isolated, readable by viewers and refuses bad parameters', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [10] });
    await startOrder(w);
    const other = await c.registerVendor({ businessName: 'Other fulfilment' });
    expect((await c.get(`${FQ}/queue`, other)).body.data).toMatchObject({ total: 0, items: [], counts: { all: 0 } });
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    expect((await c.get(`${FQ}/queue`, viewer)).body.data.total).toBe(1);
    expect((await c.get(`${FQ}/queue?pageSize=500`, w.admin)).status).toBe(400);
    expect((await c.get(`${FQ}/queue`)).status).toBe(401);
  });
});

describe('order workspace and one-click actions', () => {
  it('walks start -> pick all -> pack -> ready -> handover with the same validation as the individual endpoints', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [30] });
    const order = await orderArrives(t, c, w, 3);

    // before anything: only "start"
    let ws = (await c.get(`${FQ}/workspace/${order.id}`, w.admin)).body.data;
    expect(ws.order).toMatchObject({ id: order.id, orderNumber: order.orderNumber, status: 'new' });
    expect(ws.fulfillments).toEqual([]);
    expect(ws.fulfillment).toBeNull();
    expect(ws.actions.filter((a: any) => a.enabled).map((a: any) => a.action)).toEqual(['start']);

    const started = await act(w, order.id, { action: 'start' });
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    expect(started.body.data).toMatchObject({ action: 'start', applied: true, alreadyDone: false });
    const fid = started.body.data.fulfillmentId as string;
    expect(started.body.data.result.fulfillments).toHaveLength(1);
    expect(started.body.data.workspace.fulfillment).toMatchObject({ status: 'confirmed', stage: 'awaiting_pick' });

    // second "start" = start picking (pick list)
    const picking = await act(w, order.id, { action: 'start' });
    expect(picking.body.data.result.pickList).toMatchObject({ number: expect.stringMatching(/^PL-/), tasks: 1 });
    expect(picking.body.data.workspace.fulfillment).toMatchObject({ status: 'picking', openTasks: 1 });
    // a replay of a finished action is a successful no-op
    const replay = await act(w, order.id, { action: 'start' });
    expect(replay.status).toBe(200);
    expect(replay.body.data).toMatchObject({ applied: false, alreadyDone: true });

    // picking needs scans, or an explicit (audited) override
    const noScan = await act(w, order.id, { action: 'pick_all' });
    expect(noScan.status).toBe(409);
    expect(noScan.body.error.details.rule).toBe('scan_required');
    ws = (await c.get(`${FQ}/workspace/${order.id}`, w.admin)).body.data;
    expect(ws.actions.find((a: any) => a.action === 'pick_all')).toMatchObject({ enabled: true, requiresOverride: true });
    expect(ws.fulfillment.items[0]).toMatchObject({ pickState: 'pending', scanned: false, quantity: 3 });
    const pickedAll = await act(w, order.id, { action: 'pick_all', override: true });
    expect(pickedAll.status, JSON.stringify(pickedAll.body)).toBe(200);
    expect(pickedAll.body.data.result).toMatchObject({ tasks: 1, units: 3, override: true });
    expect(pickedAll.body.data.workspace.fulfillment).toMatchObject({ status: 'picked', stage: 'packing' });
    expect(pickedAll.body.data.workspace.fulfillment.items[0]).toMatchObject({ pickState: 'picked', pickedQuantity: 3 });
    expect(pickedAll.body.data.workspace.fulfillment.history.map((h: any) => h.to)).toEqual(expect.arrayContaining(['confirmed', 'picking', 'picked']));

    // packing: weight required, scans or override required
    const noWeight = await act(w, order.id, { action: 'pack', override: true });
    expect(noWeight.status).toBe(400);
    expect(noWeight.body.error.details.rule).toBe('weight_required');
    const packNoScan = await act(w, order.id, { action: 'pack', weightGrams: 700 });
    expect(packNoScan.status).toBe(409);
    expect(packNoScan.body.error.details.rule).toBe('scan_required');
    // the failed attempt left nothing behind (no half-created package)
    expect((await c.get(`/api/v1/packages?filter[fulfillmentId]=${fid}`, w.admin)).body.data).toEqual([]);
    const packed = await act(w, order.id, { action: 'pack', weightGrams: 700, boxType: 'small', override: true });
    expect(packed.status, JSON.stringify(packed.body)).toBe(200);
    expect(packed.body.data.result.package).toMatchObject({ weightGrams: 700, units: 3 });
    expect(packed.body.data.workspace.fulfillment).toMatchObject({ status: 'packed', stage: 'ready_to_ship' });
    expect(packed.body.data.workspace.fulfillment.packages).toHaveLength(1);

    // handover is refused before the label exists, with the reason of the screen
    const early = await act(w, order.id, { action: 'handover' });
    expect(early.status).toBe(409);
    expect(early.body.error.details).toMatchObject({ rule: 'action_not_available', action: 'handover', reason: 'Create the label first' });

    const ready = await act(w, order.id, { action: 'ready', providerCode: 'sandbox' });
    expect(ready.status, JSON.stringify(ready.body)).toBe(200);
    expect(ready.body.data.result.shipment.awb).toMatch(/^SBX/);
    expect(ready.body.data.workspace.fulfillment).toMatchObject({ status: 'ready_to_ship', shipment: { status: 'label_ready', hasLabel: true } });
    expect((await act(w, order.id, { action: 'ready' })).body.data).toMatchObject({ applied: false, alreadyDone: true });

    const handed = await act(w, order.id, { action: 'handover' });
    expect(handed.status, JSON.stringify(handed.body)).toBe(200);
    expect(handed.body.data.result.shipment.status).toBe('dispatched');
    expect(handed.body.data.workspace.fulfillment.status).toBe('shipped');
    expect((await c.get(`/api/v1/orders/${order.id}`, w.admin)).body.data.status).toBe('dispatched');
    expect((await act(w, order.id, { action: 'handover' })).body.data).toMatchObject({ applied: false, alreadyDone: true });
    // after shipping, an exception can no longer be raised
    expect((await act(w, order.id, { action: 'exception', kind: 'damaged' })).status).toBe(409);
  });

  it('drawer picking: each item carries its pick task, a scan is checked by the server, partial picks add up and the activity feed has real times', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [30] });
    const order = await orderArrives(t, c, w, 3);
    await act(w, order.id, { action: 'start' });
    await act(w, order.id, { action: 'start' });
    const ws = (await c.get(`${FQ}/workspace/${order.id}`, w.admin)).body.data;
    const taskId = ws.fulfillment.items[0].pickTaskId as string;
    expect(taskId).toEqual(expect.any(String));

    const wrong = await c.post(`/api/v1/pick-tasks/${taskId}/scan`, { itemBarcode: 'NOT-THE-ITEM' }, w.admin);
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details.rule).toBe('wrong_item');
    expect((await c.post(`/api/v1/pick-tasks/${taskId}/pick`, { quantity: 1 }, w.admin)).body.error.details.rule).toBe('scan_required');

    expect((await c.post(`/api/v1/pick-tasks/${taskId}/scan`, { itemBarcode: w.variant.sku }, w.admin)).status).toBe(200);
    const one = await c.post(`/api/v1/pick-tasks/${taskId}/pick`, { quantity: 1 }, w.admin);
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect((await c.post(`/api/v1/pick-tasks/${taskId}/pick`, { quantity: 5 }, w.admin)).status).toBeGreaterThanOrEqual(400); // over-pick refused
    const mid = (await c.get(`${FQ}/workspace/${order.id}`, w.admin)).body.data;
    expect(mid.fulfillment.items[0]).toMatchObject({ pickedQuantity: 1, pickState: 'partial', scanned: true });
    expect((await c.post(`/api/v1/pick-tasks/${taskId}/pick`, { quantity: 2 }, w.admin)).status).toBe(200);
    expect((await c.get(`${FQ}/workspace/${order.id}`, w.admin)).body.data.fulfillment).toMatchObject({ status: 'picked' });

    const feed = await c.get(`${FQ}/activity?limit=5`, w.admin);
    expect(feed.status).toBe(200);
    expect(feed.body.data[0]).toMatchObject({ orderId: order.id, orderNumber: order.orderNumber, to: 'picked', at: expect.any(String) });
    expect(feed.body.data.length).toBeLessThanOrEqual(5);
    expect((await c.get(`${FQ}/activity?limit=500`, w.admin)).status).toBe(400);
    const other = await c.registerVendor({ businessName: 'Activity other' });
    expect((await c.get(`${FQ}/activity`, other)).body.data).toEqual([]);
    expect((await c.get(`${FQ}/activity`)).status).toBe(401);
  });

  it('raises an exception that shows up in the exceptions list, the queue counts and the drawer', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [20] });
    const x = await startOrder(w, 1);
    expect((await act(w, x.order.id, { action: 'exception' })).status).toBe(400);   // kind required
    const raised = await act(w, x.order.id, { action: 'exception', kind: 'damaged', note: 'box crushed' });
    expect(raised.status, JSON.stringify(raised.body)).toBe(200);
    expect(raised.body.data.workspace.fulfillment.exceptions[0]).toMatchObject({ kind: 'damaged', status: 'open', details: { note: 'box crushed' } });

    const list = (await c.get(`${FQ}/exceptions`, w.admin)).body.data;
    expect(list.counts).toEqual({ open: 1, resolved: 0, dismissed: 0 });
    expect(list.items[0]).toMatchObject({ kind: 'damaged', kindLabel: 'Damaged item', status: 'open', orderNumber: x.order.orderNumber, warehouse: { code: 'MAIN' }, fulfillment: { number: x.f.number } });
    expect(list.items[0].ageMinutes).toBeGreaterThanOrEqual(0);
    expect((await c.get(`${FQ}/queue`, w.admin)).body.data.counts.exceptions).toBe(1);
    expect((await c.get(`${FQ}/queue?filter[hasException]=true`, w.admin)).body.data.total).toBe(1);
    expect((await c.get(`${FQ}/exceptions?filter[kind]=wrong_item`, w.admin)).body.data.total).toBe(0);
    expect((await c.get(`${FQ}/exceptions?q=${encodeURIComponent(x.order.orderNumber)}`, w.admin)).body.data.total).toBe(1);

    const id = list.items[0].id;
    expect((await c.post(`/api/v1/fulfillment-exceptions/${id}/resolve`, { status: 'resolved', note: 'repacked' }, w.admin)).status).toBe(200);
    expect((await c.get(`${FQ}/exceptions`, w.admin)).body.data.total).toBe(0);
    expect((await c.get(`${FQ}/exceptions?filter[status]=resolved`, w.admin)).body.data.items[0]).toMatchObject({ status: 'resolved', resolution: { note: 'repacked' } });
  });

  it('enforces permissions, tenant isolation and validation', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [20] });
    const x = await startOrder(w, 1);
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    const staff = await c.addMember(w.admin, 'vendor_staff');
    expect((await c.get(`${FQ}/workspace/${x.order.id}`, viewer)).status).toBe(200);
    expect((await act(w, x.order.id, { action: 'start' }, viewer)).status).toBe(403);
    expect((await act(w, x.order.id, { action: 'start' }, staff)).status).toBe(200);       // staff operate
    expect((await act(w, x.order.id, { action: 'fly' })).status).toBe(400);
    expect((await act(w, '00000000-0000-4000-8000-000000000000', { action: 'start' })).status).toBe(404);
    const other = await c.registerVendor({ businessName: 'Other workspace' });
    expect((await c.get(`${FQ}/workspace/${x.order.id}`, other)).status).toBe(404);
    expect((await act(w, x.order.id, { action: 'start' }, other)).status).toBe(404);
    expect((await c.get(`${FQ}/workspace/${x.order.id}?fulfillmentId=00000000-0000-4000-8000-000000000000`, w.admin)).status).toBe(404);
  });

  it('batch hand-over: one manifest per warehouse and provider, partial success per order', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [40] });
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const x = await packedOrder(w, 1);
      expect((await act(w, x.order.id, { action: 'ready', providerCode: 'sandbox' })).status).toBe(200);
      ids.push(x.order.id);
    }
    const unlabelled = await packedOrder(w, 1);          // packed but no shipment
    const unknown = '00000000-0000-4000-8000-000000000000';
    const res = await c.post(`${FQ}/batch-handover`, { carrier: 'sandbox', orderIds: [...ids, unlabelled.order.id, unknown] }, w.admin);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.summary).toEqual({ requested: 4, handedOver: 2, failed: 2 });
    expect(res.body.data.manifests).toHaveLength(1);
    expect(res.body.data.manifests[0]).toMatchObject({ status: 'dispatched', shipmentCount: 2, providerCode: 'sandbox' });
    const byOrder = new Map(res.body.data.results.map((r: any) => [r.orderId, r]));
    expect(byOrder.get(ids[0]!)).toMatchObject({ ok: true, manifestId: res.body.data.manifests[0].id });
    expect(byOrder.get(unlabelled.order.id)).toMatchObject({ ok: false, error: { code: 'no_shipment' } });
    expect(byOrder.get(unknown)).toMatchObject({ ok: false, error: { code: 'order_not_found' } });
    for (const id of ids) expect((await c.get(`/api/v1/orders/${id}`, w.admin)).body.data.status).toBe('dispatched');
    // repeating it hands nothing over twice
    const again = await c.post(`${FQ}/batch-handover`, { carrier: 'Sandbox Express', orderIds: ids }, w.admin);
    expect(again.body.data.summary).toEqual({ requested: 2, handedOver: 0, failed: 2 });
    expect(again.body.data.results[0].error.code).toBe('not_label_ready');
    expect((await c.post(`${FQ}/batch-handover`, { carrier: 'delhivery', orderIds: [unlabelled.order.id] }, w.admin)).body.data.results[0].error.code).toBe('no_shipment');
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    expect((await c.post(`${FQ}/batch-handover`, { carrier: 'sandbox', orderIds: ids }, viewer)).status).toBe(403);
    expect((await c.post(`${FQ}/batch-handover`, { carrier: 'sandbox', orderIds: [] }, w.admin)).status).toBe(400);
  });
});

describe('shipping screen', () => {
  it('ribbon, shipments table, carriers and bulk labels', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [60] });
    const shipped: Array<{ order: any; s: { id: string; awb: string } }> = [];
    for (let i = 0; i < 3; i++) { const x = await packedOrder(w, 1); shipped.push({ order: x.order, s: await ship(t, c, w, x.f.id) }); }
    const labelled = await packedOrder(w, 1);
    const pre = (await c.post('/api/v1/shipments', { fulfillmentId: labelled.f.id, providerCode: 'sandbox' }, w.admin)).body.data;
    await simulate(t, c, w, shipped[0]!.s.id, 'in_transit');
    await simulate(t, c, w, shipped[1]!.s.id, 'delivered');
    await simulate(t, c, w, shipped[2]!.s.id, 'delivery_failed', { reason: 'customer_unavailable' });

    const s = (await c.get('/api/v1/shipping/summary', w.admin)).body.data;
    expect(s.carriers).toHaveLength(1);
    expect(s.carriers[0]).toMatchObject({ code: 'sandbox', name: 'Sandbox Express', awbCount: 4, preDispatch: 1, inTransit: 1, delivered: 1, ndr: 1, rto: 0, onTimePercent: 100, onTimeSample: 1, avgDeliveryDays: 0 });
    expect(s.totals).toMatchObject({ awbCount: 4, delivered: 1, ndr: 1 });
    expect(s.exceptions).toEqual({ shipments: 1, ndr: 1, rto: 0 });
    expect(s.window.days).toBe(30);
    expect((await c.get('/api/v1/shipping/summary?days=0', w.admin)).status).toBe(400);
    await sqlAdmin(`UPDATE shipments SET created_at = now() - interval '60 days' WHERE id = '${pre.id}'`);
    expect((await c.get('/api/v1/shipping/summary?days=30', w.admin)).body.data.carriers[0].awbCount).toBe(3);
    await sqlAdmin(`UPDATE shipments SET created_at = now() WHERE id = '${pre.id}'`);

    const list = (await c.get('/api/v1/shipping/shipments', w.admin)).body.data;
    expect(list.total).toBe(4);
    expect(list.counts).toEqual({ all: 4, pre_dispatch: 1, in_transit: 1, delivered: 1, ndr: 1, rto: 0, cancelled: 0 });
    const row = list.items.find((r: any) => r.id === shipped[1]!.s.id);
    expect(row).toMatchObject({ awb: shipped[1]!.s.awb, carrier: 'Sandbox Express', orderNumber: shipped[1]!.order.orderNumber, status: 'delivered', statusLabel: 'Delivered', labelAvailable: true, lastEvent: { status: 'delivered' } });
    expect(row.destination).toHaveProperty('pincode');
    expect(row.estimatedDeliveryAt).toBeTruthy();
    expect((await c.get('/api/v1/shipping/shipments?filter[group]=ndr', w.admin)).body.data.items.map((r: any) => r.id)).toEqual([shipped[2]!.s.id]);
    expect((await c.get('/api/v1/shipping/shipments?filter[group]=ndr', w.admin)).body.data.counts.all).toBe(4);
    expect((await c.get(`/api/v1/shipping/shipments?q=${shipped[0]!.s.awb}`, w.admin)).body.data.total).toBe(1);
    expect((await c.get('/api/v1/shipping/shipments?filter[carrier]=sandbox&filter[status]=label_ready', w.admin)).body.data.items[0].id).toBe(pre.id);
    expect((await c.get('/api/v1/shipping/shipments?filter[payment]=cod', w.admin)).body.data.total + (await c.get('/api/v1/shipping/shipments?filter[payment]=prepaid', w.admin)).body.data.total).toBe(4);
    expect((await c.get('/api/v1/shipping/shipments?filter[labelAvailable]=true&pageSize=2&page=2', w.admin)).body.data).toMatchObject({ total: 4, pages: 2 });
    expect((await c.get('/api/v1/shipping/shipments?filter[group]=bogus', w.admin)).status).toBe(400);

    const car = (await c.get('/api/v1/shipping/carriers', w.admin)).body.data;
    const sandbox = car.items.find((i: any) => i.providerCode === 'sandbox');
    // the sandbox courier asks for no setting and has shipped 4 parcels: it is active, not "needs configuration"
    expect(sandbox).toMatchObject({ kind: 'third_party', status: 'active', shipmentsLast30d: 4, inTransit: 1, isDefault: true });
    expect(car.availableProviders.map((p: any) => p.code)).toContain('manual');
    expect(car.availableProviders.map((p: any) => p.code)).not.toContain('sandbox');

    // bulk labels: ok, cancelled, unknown, duplicate ids; one combined PDF for the text labels
    const cancelled = await packedOrder(w, 1);
    const cs = (await c.post('/api/v1/shipments', { fulfillmentId: cancelled.f.id, providerCode: 'sandbox' }, w.admin)).body.data;
    expect((await c.post(`/api/v1/shipments/${cs.id}/cancel`, {}, w.admin)).status).toBe(200);
    const unknown = '00000000-0000-4000-8000-000000000000';
    const bulk = await c.post('/api/v1/shipping/labels/bulk', { shipmentIds: [shipped[0]!.s.id, pre.id, cs.id, unknown, shipped[0]!.s.id] }, w.admin);
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(200);
    expect(bulk.body.data.summary).toEqual({ requested: 4, ok: 2, failed: 2 });
    const res = new Map(bulk.body.data.results.map((r: any) => [r.shipmentId, r]));
    expect(res.get(shipped[0]!.s.id)).toMatchObject({ ok: true, format: 'text', includedInCombined: true, url: `/api/v1/shipments/${shipped[0]!.s.id}/label` });
    expect(res.get(cs.id)).toMatchObject({ ok: false, error: { code: 'shipment_cancelled' } });
    expect(res.get(unknown)).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(bulk.body.data.combined).toMatchObject({ available: true, format: 'pdf_base64', pages: 2, shipmentIds: [shipped[0]!.s.id, pre.id] });
    const pdf = Buffer.from(bulk.body.data.combined.content, 'base64').toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/Count 2');
    expect(pdf).toContain(shipped[0]!.s.awb);
    const none = await c.post('/api/v1/shipping/labels/bulk', { shipmentIds: [unknown], combine: false }, w.admin);
    expect(none.body.data.combined.available).toBe(false);
    expect((await c.post('/api/v1/shipping/labels/bulk', { shipmentIds: [shipped[0]!.s.id], combine: false }, w.admin)).body.data.combined.available).toBe(false);
    expect((await c.post('/api/v1/shipping/labels/bulk', { shipmentIds: [] }, w.admin)).status).toBe(400);
    expect((await c.post('/api/v1/shipping/labels/bulk', { shipmentIds: Array.from({ length: 101 }, () => unknown) }, w.admin)).status).toBe(400);

    // permissions and tenant isolation
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    for (const url of ['/api/v1/shipping/summary', '/api/v1/shipping/shipments', '/api/v1/shipping/carriers']) expect((await c.get(url, viewer)).status, url).toBe(200);
    expect((await c.post('/api/v1/shipping/labels/bulk', { shipmentIds: [pre.id] }, viewer)).status).toBe(403);
    const other = await c.registerVendor({ businessName: 'Other shipping' });
    expect((await c.get('/api/v1/shipping/shipments', other)).body.data).toMatchObject({ total: 0, counts: { all: 0 } });
    expect((await c.get('/api/v1/shipping/summary', other)).body.data).toMatchObject({ carriers: [], exceptions: { shipments: 0 } });
    expect((await c.post('/api/v1/shipping/labels/bulk', { shipmentIds: [pre.id] }, other)).body.data.summary).toEqual({ requested: 1, ok: 0, failed: 1 });
  });

  it('reports unknown numbers as null, never as zero percent', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [10] });
    const s = (await c.get('/api/v1/shipping/summary', w.admin)).body.data;
    expect(s).toMatchObject({ carriers: [], totals: { awbCount: 0, onTimePercent: null, avgDeliveryDays: null } });
  });
});

describe('returns screen', () => {
  const R = '/api/v1/returns';
  const checklist = { packagingIntact: true, productUsable: true, accessoriesPresent: true, visibleDamage: false, productMismatch: false, missingQuantity: false };

  async function shippedWorld(qty: number) {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [100] });
    const x = await startOrder(w, qty);
    await pickAndPack(t, c, w, x.f.id);
    await ship(t, c, w, x.f.id);
    return { w, order: x.order, wh: w.warehouses[0]!.id };
  }
  const mkReturn = async (w: World, order: any, qty: number, reason: string) => {
    const r = await c.post(R, { orderId: order.id, reasonCode: reason, items: [{ orderItemId: order.items[0].id, quantity: qty }] }, w.admin);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.data;
  };

  it('summary tiles, insights and stage labels from real returns', async () => {
    const { w, order, wh } = await shippedWorld(10);
    const a = await mkReturn(w, order, 2, 'size_fit');
    const b = await mkReturn(w, order, 1, 'size_fit');
    const d = await mkReturn(w, order, 1, 'defective');
    expect((await c.post(`${R}/${b.id}/approve`, { warehouseId: wh }, w.admin)).status).toBe(200);
    expect((await c.post(`${R}/${d.id}/approve`, { warehouseId: wh }, w.admin)).status).toBe(200);
    expect((await c.post(`${R}/${d.id}/receive`, { warehouseId: wh, items: [{ returnItemId: d.items[0].id, quantity: 1 }] }, w.admin)).status).toBe(200);
    expect((await c.post(`${R}/${a.id}/reject`, { note: 'outside window' }, w.admin)).status).toBe(200);

    const s = (await c.get(`${R}/summary`, w.admin)).body.data;
    expect(s.requests).toEqual({ total: 3, today: 3, open: 2 });
    expect(s.pendingInspections).toMatchObject({ count: 1, overdue: 0 });
    // one order, one returned order: 100%, nothing before it to compare with
    expect(s.returnRate).toMatchObject({ percent: 100, returnedOrders: 1, orders: 1, previousPercent: null, deltaPoints: null });
    expect(s.refundExposure.count).toBe(2);
    expect(s.refundExposure.currency).toBe('INR');
    expect(s.refundExposure.amountMinor).toBe(b.refund.amountMinor + d.refund.amountMinor);
    expect(s.refundExposure.amountMinor).toBeGreaterThan(0);
    expect(s.refundExposure.actionableCount).toBe(0);
    const stages = Object.fromEntries(s.stages.map((x: any) => [x.stage, x.count]));
    expect(stages).toMatchObject({ requested: 0, approved: 1, received: 1, rejected: 1, closed: 0 });

    // the list rows carry the screen stage next to the unchanged status
    const list = (await c.get(R, w.admin)).body.data as any[];
    expect(list.find((x) => x.id === d.id)).toMatchObject({ status: 'received', stage: 'received', stageLabel: 'Received' });
    expect(list.find((x) => x.id === b.id)).toMatchObject({ status: 'approved', stage: 'approved' });
    expect((await c.get(`${R}/ledger`, w.admin)).body.data.items.find((x: any) => x.id === a.id)).toMatchObject({ status: 'rejected', stage: 'rejected' });

    const ins = (await c.get(`${R}/insights?days=7`, w.admin)).body.data;
    expect(ins.window.returns).toBe(2);   // the rejected request does not count
    expect(ins.reasons).toEqual([
      { code: 'defective', label: 'Defective / not working', count: 1, sharePercent: 50 },
      { code: 'size_fit', label: 'Size / fit issue', count: 1, sharePercent: 50 },
    ].sort((x, y) => (x.code < y.code ? -1 : 1)).sort((x, y) => y.count - x.count || (x.code < y.code ? -1 : 1)));
    expect(ins.topSkus[0]).toMatchObject({ sku: w.variant.sku, returns: 2, unitsReturned: 2, unitsSold: 10, returnRatePercent: 20 });
    expect(ins.channels).toEqual([{ code: 'mock', returns: 2, sharePercent: 100 }]);
    expect(ins.trend.granularity).toBe('day');
    expect(ins.trend.points).toHaveLength(8);
    expect(ins.trend.points.reduce((n: number, p: any) => n + p.returns, 0)).toBe(2);
    expect(ins.trend.points.reduce((n: number, p: any) => n + p.units, 0)).toBe(2);
    expect((await c.get(`${R}/insights?days=90`, w.admin)).body.data.trend.granularity).toBe('week');
    expect((await c.get(`${R}/summary?days=0`, w.admin)).status).toBe(400);
  });

  it('next-actions walk the whole flow: approve, receive, inspection, disposition, refund, complete', async () => {
    const { w, order, wh } = await shippedWorld(2);
    const ret = await mkReturn(w, order, 2, 'damaged_in_transit');
    const next = async () => (await c.get(`${R}/${ret.id}/next-actions`, w.admin)).body.data;
    const enabled = (n: any) => n.actions.filter((a: any) => a.enabled).map((a: any) => a.key);

    let n = await next();
    expect(n).toMatchObject({ number: ret.number, status: 'requested', stage: 'requested', next: 'approve' });
    expect(enabled(n)).toEqual(['approve']);
    expect(n.actions.find((a: any) => a.key === 'receive').disabledReason).toBe('Approve the return first');
    expect((await c.post(`${R}/${ret.id}/approve`, { warehouseId: wh }, w.admin)).status).toBe(200);

    n = await next();
    expect(n.next).toBe('receive');
    expect(n.actions.find((a: any) => a.key === 'approve')).toMatchObject({ done: true, enabled: false });
    const recv = n.actions.find((a: any) => a.key === 'receive');
    expect(recv.inputs.find((i: any) => i.name === 'warehouseId').default).toBe(wh);
    expect(recv.inputs.find((i: any) => i.name === 'items').default).toEqual([{ returnItemId: ret.items[0].id, sku: w.variant.sku, quantity: 2 }]);
    expect((await c.post(`${R}/${ret.id}/receive`, { warehouseId: wh, items: [{ returnItemId: ret.items[0].id, quantity: 2 }] }, w.admin)).status).toBe(200);

    n = await next();
    expect(n).toMatchObject({ next: 'inspection', stage: 'received' });
    expect(n.actions.find((a: any) => a.key === 'receive').done).toBe(true);
    expect(n.actions.find((a: any) => a.key === 'disposition').disabledReason).toBe('Finish the inspection first');
    expect((await c.post(`${R}/${ret.id}/inspection`, { checklist: { ...checklist, visibleDamage: true }, result: 'fail' }, w.admin)).status).toBe(200);

    n = await next();
    expect(n).toMatchObject({ next: 'disposition', stage: 'resolution' });
    const disp = n.actions.find((a: any) => a.key === 'disposition');
    expect(disp.inputs.find((i: any) => i.name === 'kind')).toMatchObject({ default: 'damaged', note: 'Inspection failed' });
    expect(disp.inputs.find((i: any) => i.name === 'kind').options).toHaveLength(6);
    expect(n.actions.find((a: any) => a.key === 'refund')).toMatchObject({ enabled: true, permission: 'returns:refund' });
    expect(n.actions.find((a: any) => a.key === 'complete').disabledReason).toBe('Some received units have no decision yet');
    expect((await c.post(`${R}/${ret.id}/disposition`, { kind: 'damaged' }, w.admin)).status).toBe(200);

    n = await next();
    expect(n.actions.find((a: any) => a.key === 'disposition').done).toBe(true);
    expect(n.actions.find((a: any) => a.key === 'complete').enabled).toBe(true);
    const refundIn = n.actions.find((a: any) => a.key === 'refund').inputs;
    expect(refundIn.find((i: any) => i.name === 'mode').options.map((o: any) => o.value)).toEqual(['manual']);
    expect(refundIn.find((i: any) => i.name === 'amountMinor').default).toBe(ret.refund.amountMinor);
    expect((await c.post(`${R}/${ret.id}/refund`, { status: 'processed', amountMinor: ret.refund.amountMinor }, w.admin)).status).toBe(200);

    n = await next();
    expect(n).toMatchObject({ stage: 'refunded', next: 'complete' });
    expect(n.actions.find((a: any) => a.key === 'refund')).toMatchObject({ done: true, enabled: false });
    expect((await c.post(`${R}/${ret.id}/complete`, {}, w.admin)).status).toBe(200);
    n = await next();
    expect(n).toMatchObject({ status: 'completed', stage: 'closed', next: null });
    expect(n.actions.every((a: any) => !a.enabled)).toBe(true);

    const s = (await c.get(`${R}/summary`, w.admin)).body.data;
    expect(s.refundExposure).toMatchObject({ count: 0, amountMinor: 0 });
  });

  it('a rejected return closes every step; viewers read; other tenants get 404', async () => {
    const { w, order } = await shippedWorld(1);
    const ret = await mkReturn(w, order, 1, 'changed_mind');
    expect((await c.post(`${R}/${ret.id}/reject`, { note: 'not eligible' }, w.admin)).status).toBe(200);
    const n = (await c.get(`${R}/${ret.id}/next-actions`, w.admin)).body.data;
    expect(n.actions.every((a: any) => !a.enabled)).toBe(true);
    expect(n.actions[0].disabledReason).toBe('The return was rejected');
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    for (const url of [`${R}/${ret.id}/next-actions`, `${R}/summary`, `${R}/insights`]) expect((await c.get(url, viewer)).status, url).toBe(200);
    const other = await c.registerVendor({ businessName: 'Other returns' });
    expect((await c.get(`${R}/${ret.id}/next-actions`, other)).status).toBe(404);
    expect((await c.get(`${R}/summary`, other)).body.data).toMatchObject({ requests: { total: 0, today: 0, open: 0 }, returnRate: { percent: null }, refundExposure: { count: 0, amountMinor: 0 } });
    expect((await c.get(`${R}/00000000-0000-4000-8000-000000000000/next-actions`, w.admin)).status).toBe(404);
  });
});
