import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { buildWorld, orderArrives, pickAndPack, ship, stockOf, type World } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

// direct SQL as the system scope (the runtime role would otherwise see no tenant rows: RLS fails closed)
const withSystemScope = async <R>(fn: () => Promise<R>): Promise<R> => {
  const pg = t.database!.pg;
  await pg.query(`select set_config('app.scope', 'system', false)`);
  try { return await fn(); } finally { await pg.query(`select set_config('app.scope', '', false), set_config('app.vendor_id', '', false)`); }
};
const sqlExec = (q: string) => withSystemScope(() => t.database!.pg.exec(q));
const sqlRows = async <R = any>(q: string): Promise<R[]> => withSystemScope(async () => (await t.database!.pg.query(q)).rows as R[]);

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

const R = '/api/v1/returns';
const checklist = (o: Partial<Record<string, boolean>> = {}) => ({ packagingIntact: true, productUsable: true, accessoriesPresent: true, visibleDamage: false, productMismatch: false, missingQuantity: false, ...o });

/** a world with one SHIPPED order of `qty` units (returns can only be requested for goods that left the warehouse) */
async function shippedWorld(qty: number, stock = 100) {
  const w = await buildWorld(t, c, { warehouses: 1, stock: [stock] });
  const order = await orderArrives(t, c, w, qty);
  const f = (await c.post(`/api/v1/orders/${order.id}/fulfillment`, {}, w.admin)).body.data.fulfillments[0];
  await pickAndPack(t, c, w, f.id);
  await ship(t, c, w, f.id);
  return { w, order, wh: w.warehouses[0]!.id };
}
async function mkReturn(w: World, order: any, wh: string, o: { qty?: number; reason?: string; approve?: boolean; receive?: number } = {}) {
  const qty = o.qty ?? 1;
  const created = await c.post(R, { orderId: order.id, reasonCode: o.reason ?? 'size_fit', items: [{ orderItemId: order.items[0].id, quantity: qty }] }, w.admin);
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const id = created.body.data.id as string;
  if (o.approve !== false) expect((await c.post(`${R}/${id}/approve`, { warehouseId: wh }, w.admin)).status).toBe(200);
  if (o.receive) expect((await c.post(`${R}/${id}/receive`, { warehouseId: wh, items: [{ returnItemId: created.body.data.items[0].id, quantity: o.receive }] }, w.admin)).status).toBe(200);
  return { id, itemId: created.body.data.items[0].id as string, number: created.body.data.number as string };
}
const inspect = (w: World | { admin: Actor }, id: string, result: 'pass' | 'fail' | 'needs_review', as: Actor = w.admin, cl = checklist()) => c.post(`${R}/${id}/inspection`, { checklist: cl, result, note: `inspected: ${result}` }, as);
const detail = async (w: { admin: Actor }, id: string) => (await c.get(`${R}/${id}`, w.admin)).body.data;

describe('overview, ledger and tab counts agree', () => {
  it('overview numbers equal the ledger tabs and signal filters; tabs, search and filters work; the CSV export matches', async () => {
    const { w, order, wh } = await shippedWorld(10);
    const a = await mkReturn(w, order, wh, { approve: false });                       // requested
    const b = await mkReturn(w, order, wh);                                           // approved
    const cc = await mkReturn(w, order, wh, { receive: 1, reason: 'defective' });      // received, awaiting inspection
    const d = await mkReturn(w, order, wh, { qty: 2, receive: 1 });                   // received 1 of 2: quantity mismatch
    const e = await mkReturn(w, order, wh, { receive: 1 });                           // received + inspected (passed): refund pending
    expect((await inspect(w, e.id, 'pass')).status).toBe(200);

    const ov = (await c.get(`${R}/overview`, w.admin)).body.data;
    expect(ov.statusLine).toEqual({ open: 5, awaitingInspection: 2, refundsPending: 1 });
    expect(ov.createReturn).toMatchObject({ available: true, reason: null });
    expect(ov.createReturn.allowedChannels).toEqual(expect.arrayContaining(['shopify', 'mock']));
    expect(ov.stages.requested).toEqual({ count: 1, hint: 'to_review' });
    expect(ov.stages.approved.count).toBe(1);
    expect(ov.stages.inTransit.count).toBe(0);
    expect(ov.stages.received.count).toBe(2);   // c and d (e moved on to `inspecting`)
    expect(ov.stages.resolution).toEqual({ count: 1, refundPending: 1 });
    expect(ov.stages.closed).toEqual({ count: 0, window: '30d' });
    expect(ov.attention).toEqual([{ key: 'awaiting_inspection', count: 2 }, { key: 'refunds_pending', count: 1 }, { key: 'inventory_discrepancy', count: 1 }]);

    // the ledger tabs and `counts` say exactly the same
    const counts = (await c.get(`${R}/counts`, w.admin)).body.data;
    expect(counts).toEqual({ all: 5, needs_attention: 3, awaiting_receipt: 1, awaiting_inspection: 2, refund_pending: 1, completed: 0 });
    const tab = async (name: string, extra = '') => (await c.get(`${R}/ledger?tab=${name}${extra}`, w.admin)).body.data;
    expect((await tab('all')).total).toBe(5);
    expect((await tab('awaiting_receipt')).items.map((x: any) => x.id)).toEqual([b.id]);
    expect((await tab('awaiting_inspection')).total).toBe(ov.statusLine.awaitingInspection);
    expect((await tab('refund_pending')).items.map((x: any) => x.id)).toEqual([e.id]);
    expect((await tab('needs_attention')).total).toBe(3);
    expect((await tab('all', '&filter[signal]=inventory_discrepancy')).items.map((x: any) => x.id)).toEqual([d.id]);
    expect((await tab('all', '&filter[signal]=refunds_pending&filter[signal]=inventory_discrepancy')).total).toBe(2);
    expect((await tab('all', '&filter[inspectionStatus]=passed')).items.map((x: any) => x.id)).toEqual([e.id]);
    expect((await tab('all', '&filter[disposition]=pending')).total).toBe(5);
    expect((await tab('all', '&filter[disposition]=sellable')).total).toBe(0);
    // filters narrow the tab counts too, and paging has a real total
    expect((await c.get(`${R}/counts?filter[inspectionStatus]=passed`, w.admin)).body.data).toMatchObject({ all: 1, refund_pending: 1, awaiting_inspection: 0 });
    const p1 = (await c.get(`${R}/ledger?pageSize=2&page=1`, w.admin)).body.data;
    expect(p1).toMatchObject({ page: 1, pageSize: 2, total: 5, pages: 3 });
    expect(p1.items).toHaveLength(2);

    // ledger row shape
    const row = (await tab('all', `&q=${cc.number}`)).items[0];
    expect(row).toMatchObject({
      id: cc.id, number: cc.number, orderNumber: order.orderNumber, quantity: 1, receivedQuantity: 1, status: 'received', displayStatus: 'received',
      product: { title: expect.any(String), sku: w.variant.sku, itemCount: 1 }, channel: { code: 'mock' }, reason: { code: 'defective', label: 'Defective / not working' },
      inspection: { status: 'not_started', inspector: null }, refund: { status: 'pending', source: null }, disposition: 'pending', action: { key: 'inspect' }, signals: ['awaiting_inspection'],
    });
    expect((await tab('all', `&q=${w.variant.sku}`)).total).toBe(5);        // search by SKU
    expect((await tab('all', `&q=${order.orderNumber}`)).total).toBe(5);    // ... order number
    expect((await tab('all', '&q=nothing-like-this')).total).toBe(0);
    expect((await tab('all', '&filter[marketplace]=amazon_in')).total).toBe(0);
    expect((await tab('all', '&filter[marketplace]=mock')).total).toBe(5);
    expect((await tab('all')).items.find((x: any) => x.id === a.id).action.key).toBe('view');
    expect((await tab('all')).items.find((x: any) => x.id === b.id).action.key).toBe('track');
    expect((await tab('all')).items.find((x: any) => x.id === e.id)).toMatchObject({ displayStatus: 'refund_pending', action: { key: 'refund' } });

    // export = the same filtered rows, as a spreadsheet-safe CSV
    const csv = await c.get(`${R}/export?tab=awaiting_inspection`, w.admin);
    expect(csv.status).toBe(200);
    expect(String(csv.headers?.['content-type'] ?? '')).toContain('text/csv');
    const lines = String(csv.body ?? csv.raw.body).trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Return');
    expect(lines.join('\n')).toContain(cc.number);
    expect(lines.join('\n')).toContain(d.number);
    expect((await c.get(`${R}/ledger?tab=bogus`, w.admin)).status).toBe(400);
  });
});

describe('inspection', () => {
  it('assign (member only), checklist, status + system condition, history; inspection never approves a refund or disposition', async () => {
    const { w, order, wh } = await shippedWorld(9);
    const staff = await c.addMember(w.admin, 'vendor_staff');
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    const rival = await c.registerVendor({ businessName: 'Rival Inspect' });
    const r1 = await mkReturn(w, order, wh, { qty: 2, receive: 2 });
    const notYet = await mkReturn(w, order, wh);   // approved, not received

    // assign: only a member of this business; not before the goods arrive
    expect((await c.post(`${R}/${r1.id}/inspection/assign`, { userId: rival.userId }, w.admin)).status).toBe(400);
    expect((await c.post(`${R}/${notYet.id}/inspection/assign`, { userId: staff.userId }, w.admin)).status).toBe(409);
    expect((await c.post(`${R}/${r1.id}/inspection/assign`, { userId: staff.userId }, viewer)).status).toBe(403);
    const asg = await c.post(`${R}/${r1.id}/inspection/assign`, { userId: staff.userId }, w.admin);
    expect(asg.status, JSON.stringify(asg.body)).toBe(200);
    expect(asg.body.data).toMatchObject({ status: 'in_progress', inspector: { id: staff.userId }, latest: null });
    // bulk assign: reports what it skipped instead of failing everything
    const bulk = await c.post(`${R}/inspection/assign`, { ids: [r1.id, notYet.id, '00000000-0000-4000-8000-000000000001'], userId: w.admin.userId }, w.admin);
    expect(bulk.body.data.assigned).toEqual([r1.id]);
    expect(bulk.body.data.skipped).toEqual(expect.arrayContaining([{ id: notYet.id, reason: 'not_received' }, { id: '00000000-0000-4000-8000-000000000001', reason: 'not_found' }]));
    expect((await c.post(`${R}/inspection/assign`, { ids: [], userId: staff.userId }, w.admin)).status).toBe(400);
    expect((await c.post(`${R}/inspection/assign`, { ids: Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`), userId: staff.userId }, w.admin)).status).toBe(400);
    expect((await c.get(`${R}/ledger`, w.admin)).body.data.items.find((x: any) => x.id === r1.id).inspection).toMatchObject({ status: 'in_progress', inspector: { id: w.admin.userId, name: expect.any(String) } });

    // not received -> cannot inspect; unknown return -> 404; invalid body -> 400
    expect((await inspect(w, notYet.id, 'pass')).status).toBe(409);
    expect((await inspect(w, '00000000-0000-4000-8000-000000000002', 'pass')).status).toBe(404);
    expect((await c.post(`${R}/${r1.id}/inspection`, { checklist: { packagingIntact: true }, result: 'pass' }, w.admin)).status).toBe(400);
    expect((await c.post(`${R}/${r1.id}/inspection`, { checklist: checklist(), result: 'maybe' }, w.admin)).status).toBe(400);
    expect((await inspect(w, r1.id, 'pass', viewer)).status).toBe(403);

    // staff may inspect: quantity matches -> receipt matched; needs_review keeps the decision open
    const first = await inspect(w, r1.id, 'needs_review', staff, checklist({ productUsable: false, missingQuantity: false }));
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data).toMatchObject({ status: 'requires_review', systemCondition: 'receipt_matched', inspector: { id: staff.userId }, quantity: { expected: 2, received: 2 }, latest: { result: 'needs_review', systemCondition: 'receipt_matched' } });
    const second = await c.post(`${R}/${r1.id}/inspection`, { checklist: { ...checklist(), custom: [{ label: 'Tags attached', ok: true }] }, result: 'pass', note: 'looks fine' }, staff);
    expect(second.body.data).toMatchObject({ status: 'passed' });
    expect(second.body.data.history).toHaveLength(2);
    expect(second.body.data.history[0].checklist.custom).toEqual([{ label: 'Tags attached', ok: true }]);
    expect((await c.get(`${R}/${r1.id}/inspection`, viewer)).body.data.latest.note).toBe('looks fine');

    // it never approved a refund or a disposition
    const after = await detail(w, r1.id);
    expect(after).toMatchObject({ status: 'inspecting', refund: { status: 'pending', source: null }, inspection: { status: 'passed', inspectorId: staff.userId } });
    expect(after.items[0]).toMatchObject({ disposition: null, dispositionedQuantity: 0 });
    expect((await stockOf(c, w)).totals).toMatchObject({ returned: 2 });

    // a short receipt is a quantity mismatch
    const short = await mkReturn(w, order, wh, { qty: 3, receive: 2 });
    const sh = await inspect(w, short.id, 'fail');
    expect(sh.body.data).toMatchObject({ status: 'failed', systemCondition: 'quantity_mismatch', quantity: { expected: 3, received: 2 } });
    // the old one-step inspect still works and settles the inspection track
    const legacy = await mkReturn(w, order, wh, { receive: 1 });
    expect((await c.post(`${R}/${legacy.id}/inspect`, { items: [{ returnItemId: legacy.itemId, quantity: 1, condition: 'sellable', disposition: 'restock' }] }, w.admin)).status).toBe(200);
    expect((await detail(w, legacy.id)).inspection.status).toBe('passed');
    // another business sees nothing and changes nothing
    expect((await c.get(`${R}/${r1.id}/inspection`, rival)).status).toBe(404);
    expect((await inspect({ admin: rival }, r1.id, 'pass', rival)).status).toBe(404);
    expect((await c.post(`${R}/inspection/assign`, { ids: [r1.id], userId: rival.userId }, rival)).body.data).toEqual({ assigned: [], skipped: [{ id: r1.id, reason: 'not_found' }] });
  });
});

describe('dispositions move stock only through the inventory ledger', () => {
  it('guard, recommendation, and the stock effect of each kind', async () => {
    const { w, order, wh } = await shippedWorld(16);
    const staff = await c.addMember(w.admin, 'vendor_staff');
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    const base = (await stockOf(c, w)).totals;
    const done = async (opts: { result?: 'pass' | 'fail' | 'needs_review'; qty?: number; receive?: number } = {}) => {
      const x = await mkReturn(w, order, wh, { qty: opts.qty ?? 1, receive: opts.receive ?? opts.qty ?? 1 });
      if (opts.result) expect((await inspect(w, x.id, opts.result)).status).toBe(200);
      return x;
    };

    // 409 until the inspection is finished; nothing moved
    const g = await done();
    const blocked = await c.post(`${R}/${g.id}/disposition`, { kind: 'sellable' }, w.admin);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details.rule).toBe('inspection_not_finished');
    expect((await c.get(`${R}/${g.id}/disposition-options`, w.admin)).body.data).toMatchObject({ canConfirm: false, blockedReason: 'inspection_not_finished', recommendation: { kind: null, suggestedOnly: true } });
    await c.post(`${R}/${g.id}/inspection/assign`, { userId: staff.userId }, w.admin);
    expect((await c.post(`${R}/${g.id}/disposition`, { kind: 'sellable' }, w.admin)).status).toBe(409); // in progress is not finished either
    expect((await stockOf(c, w)).totals.returned).toBe(base.returned + 1);

    // recommendation: suggestion only, per inspection outcome
    expect((await inspect(w, g.id, 'pass')).status).toBe(200);
    const opt = (await c.get(`${R}/${g.id}/disposition-options`, w.admin)).body.data;
    expect(opt).toMatchObject({ canConfirm: true, undecidedUnits: 1, recommendation: { kind: 'sellable', suggestedOnly: true } });
    expect(opt.options.map((o: any) => o.kind)).toEqual(['sellable', 'damaged', 'rejected', 'quarantine', 'repair', 'write_off']);
    expect(opt.options.map((o: any) => o.stored)).toEqual(['restock', 'damaged', 'rejected', 'quarantine', 'repair', 'dispose']);
    expect((await stockOf(c, w)).totals).toMatchObject({ onHand: base.onHand, returned: base.returned + 1 }); // looking is not deciding
    const failed = await done({ result: 'fail' });
    expect((await c.get(`${R}/${failed.id}/disposition-options`, w.admin)).body.data.recommendation).toMatchObject({ kind: 'damaged' });
    const mism = await done({ qty: 2, receive: 1, result: 'pass' });
    expect((await c.get(`${R}/${mism.id}/disposition-options`, w.admin)).body.data.recommendation).toEqual({ kind: 'quarantine', reason: 'Expected 2, received 1', suggestedOnly: true });

    // permissions + validation
    expect((await c.post(`${R}/${g.id}/disposition`, { kind: 'sellable' }, viewer)).status).toBe(403);
    expect((await c.post(`${R}/${g.id}/disposition`, { kind: 'melt' }, w.admin)).status).toBe(400);
    expect((await c.post(`${R}/${g.id}/disposition`, { kind: 'sellable', items: [{ returnItemId: '00000000-0000-4000-8000-000000000003', quantity: 1 }] }, w.admin)).status).toBe(404);
    expect((await c.post(`${R}/${g.id}/disposition`, { kind: 'sellable', items: [{ returnItemId: g.itemId, quantity: 5 }] }, w.admin)).status).toBe(400); // more than received

    // sellable (staff may confirm): returned -> on hand
    const s0 = (await stockOf(c, w)).totals;
    const sell = await c.post(`${R}/${g.id}/disposition`, { kind: 'sellable' }, staff);
    expect(sell.status, JSON.stringify(sell.body)).toBe(200);
    expect(sell.body.data.items[0]).toMatchObject({ disposition: 'restock', dispositionedQuantity: 1, restockedQuantity: 1 });
    expect((await stockOf(c, w)).totals).toMatchObject({ onHand: s0.onHand + 1, returned: s0.returned - 1 });
    expect((await c.post(`${R}/${g.id}/disposition`, { kind: 'sellable' }, w.admin)).status).toBe(409); // nothing left to decide

    // damaged
    let before = (await stockOf(c, w)).totals;
    expect((await c.post(`${R}/${failed.id}/disposition`, { kind: 'damaged' }, w.admin)).status).toBe(200);
    expect((await stockOf(c, w)).totals).toMatchObject({ damaged: before.damaged + 1, returned: before.returned - 1, onHand: before.onHand });

    // quarantine (the 1 received unit of the mismatching return): returned -> quarantined, not sellable
    before = (await stockOf(c, w)).totals;
    const q = await c.post(`${R}/${mism.id}/disposition`, { kind: 'quarantine' }, w.admin);
    expect(q.status, JSON.stringify(q.body)).toBe(200);
    expect((await stockOf(c, w)).totals).toMatchObject({ quarantined: before.quarantined + 1, returned: before.returned - 1, onHand: before.onHand });
    expect((await detail(w, mism.id)).items[0].disposition).toBe('quarantine');

    // repair = quarantined with reason `repair`
    const rep = await done({ result: 'pass' });
    before = (await stockOf(c, w)).totals;
    expect((await c.post(`${R}/${rep.id}/disposition`, { kind: 'repair' }, w.admin)).status).toBe(200);
    expect((await stockOf(c, w)).totals).toMatchObject({ quarantined: before.quarantined + 1, returned: before.returned - 1 });
    const repairMoves = await sqlRows(`select m.reason, m.delta_quarantined, m.delta_returned from inventory_movements m where m.vendor_id = '${w.admin.vendorId}' and m.type = 'quarantine' and m.reason = 'repair'`);
    expect(repairMoves).toHaveLength(1);
    expect(Number(repairMoves[0].delta_quarantined)).toBe(1);
    expect(Number(repairMoves[0].delta_returned)).toBe(-1);

    // write-off and rejected: the unit leaves the returned bucket and is never sellable
    const wo = await done({ result: 'fail' });
    const rj = await done({ result: 'fail' });
    before = (await stockOf(c, w)).totals;
    expect((await c.post(`${R}/${wo.id}/disposition`, { kind: 'write_off' }, w.admin)).status).toBe(200);
    expect((await c.post(`${R}/${rj.id}/disposition`, { kind: 'rejected' }, w.admin)).status).toBe(200);
    expect((await stockOf(c, w)).totals).toMatchObject({ returned: before.returned - 2, onHand: before.onHand, damaged: before.damaged, quarantined: before.quarantined });
    expect((await detail(w, wo.id)).items[0]).toMatchObject({ disposition: 'dispose', dispositionedQuantity: 1 });
    expect((await detail(w, rj.id)).items[0]).toMatchObject({ disposition: 'rejected', dispositionedQuantity: 1 });
    const rejectedMoves = await sqlRows(`select m.reason from inventory_movements m where m.vendor_id = '${w.admin.vendorId}' and m.reference_id = '${rj.id}' and m.delta_returned < 0`);
    expect(rejectedMoves.map((m: any) => m.reason).join(' ')).toContain('rejected');

    // partial decision by items, then the rest
    const part = await done({ qty: 3, receive: 3, result: 'pass' });
    expect((await c.post(`${R}/${part.id}/disposition`, { kind: 'sellable', items: [{ returnItemId: part.itemId, quantity: 1 }] }, w.admin)).status).toBe(200);
    expect((await c.get(`${R}/${part.id}/disposition-options`, w.admin)).body.data).toMatchObject({ undecidedUnits: 2, decided: ['sellable'] });
    expect((await c.post(`${R}/${part.id}/disposition`, { kind: 'damaged' }, w.admin)).status).toBe(200);
    expect((await c.get(`${R}/${part.id}/detail`, w.admin)).body.data.currentState.disposition).toBe('damaged'); // the item keeps its latest decision
    expect((await c.get(`${R}/ledger?filter[disposition]=write_off`, w.admin)).body.data.items.map((x: any) => x.id)).toEqual([wo.id]);

    // the ledger is still balanced; legacy dispositions behave as before (restock), and the new legacy values are handled
    expect((await c.get('/api/v1/inventory/ledger-check', w.admin)).body.data.healthy).toBe(true);
    const lg = await done({ qty: 3, receive: 3 });
    before = (await stockOf(c, w)).totals;
    const li = await c.post(`${R}/${lg.id}/inspect`, { items: [
      { returnItemId: lg.itemId, quantity: 1, condition: 'sellable', disposition: 'rejected' }, { returnItemId: lg.itemId, quantity: 1, condition: 'defective', disposition: 'repair' }, { returnItemId: lg.itemId, quantity: 1, condition: 'sellable', disposition: 'quarantine' },
    ] }, w.admin);
    expect(li.status, JSON.stringify(li.body)).toBe(200);
    // rejected leaves, repair is quarantined, legacy quarantine stays in `returned` for a later decision
    expect((await stockOf(c, w)).totals).toMatchObject({ returned: before.returned - 2, quarantined: before.quarantined + 1, onHand: before.onHand });
    expect((await c.get('/api/v1/inventory/ledger-check', w.admin)).body.data.healthy).toBe(true);
  });
});

describe('refund tracking', () => {
  it('queue with footer counts, manual states, retry, connector refusal, detail timeline and permissions', async () => {
    const { w, order, wh } = await shippedWorld(8);
    const staff = await c.addMember(w.admin, 'vendor_staff');
    const pre = await mkReturn(w, order, wh, { receive: 1 });                  // not inspected yet
    const x = await mkReturn(w, order, wh, { receive: 1 });
    const y = await mkReturn(w, order, wh, { receive: 1 });
    const z = await mkReturn(w, order, wh, { receive: 1 });
    for (const id of [x.id, y.id, z.id]) await inspect(w, id, 'pass');

    // pre-inspection returns are not in the actionable queue
    let q = (await c.get(`${R}/refunds`, w.admin)).body.data;
    expect(q.total).toBe(3);
    expect(q.items.map((i: any) => i.returnId)).not.toContain(pre.id);
    expect(q.counts).toEqual({ pending: 3, ready: 0, processing: 0, failed: 0 });
    expect(q.items[0]).toMatchObject({ number: expect.any(String), orderNumber: order.orderNumber, channel: { code: 'mock' }, refund: { status: 'pending', amountMinor: expect.any(Number), currency: expect.any(String) }, returnStatus: 'inspecting', inspectionStatus: 'passed', action: { key: 'review_refund' } });
    // before inspection a refund cannot be moved forward and the connector cannot be asked
    expect((await c.post(`${R}/${pre.id}/refund`, { status: 'ready' }, w.admin)).body.error.details.rule).toBe('inspection_required');
    const pc = await c.post(`${R}/${pre.id}/refund`, { mode: 'connector' }, w.admin);
    expect(pc.status).toBe(409);
    expect(pc.body.error.details.rule).toBe('inspection_required');

    // permissions: staff may inspect but not refund
    expect((await c.post(`${R}/${x.id}/refund`, { status: 'ready' }, staff)).status).toBe(403);
    expect((await c.post(`${R}/${x.id}/refund/retry`, {}, staff)).status).toBe(403);
    expect((await c.get(`${R}/refunds`, staff)).status).toBe(200);

    // manual states: ready -> processing -> failed (with the error) -> retry -> ready -> processed
    expect((await c.post(`${R}/${x.id}/refund`, { status: 'ready' }, w.admin)).body.data.refund).toMatchObject({ status: 'ready', source: 'manual' });
    expect((await c.post(`${R}/${y.id}/refund`, { status: 'processing', reference: 'PAY-9' }, w.admin)).body.data.refund.status).toBe('processing');
    const fail = await c.post(`${R}/${z.id}/refund`, { status: 'failed', error: 'gateway timeout' }, w.admin);
    expect(fail.body.data.refund).toMatchObject({ status: 'failed', error: 'gateway timeout', source: 'manual' });
    q = (await c.get(`${R}/refunds`, w.admin)).body.data;
    expect(q.counts).toEqual({ pending: 0, ready: 1, processing: 1, failed: 1 });
    expect((await c.get(`${R}/refunds?filter[status]=failed`, w.admin)).body.data.items.map((i: any) => i.returnId)).toEqual([z.id]);
    expect(q.items.find((i: any) => i.returnId === z.id)).toMatchObject({ action: { key: 'review_failure' }, refund: { error: 'gateway timeout' } });
    const ledgerRow = (await c.get(`${R}/ledger?q=${z.number}`, w.admin)).body.data.items[0];
    expect(ledgerRow.refund).toMatchObject({ status: 'failed' });
    expect((await c.post(`${R}/${x.id}/refund/retry`, {}, w.admin)).status).toBe(409);        // only a failed refund can be retried
    const retry = await c.post(`${R}/${z.id}/refund/retry`, {}, w.admin);
    expect(retry.body.data.refund).toMatchObject({ status: 'ready', error: null });

    // connector mode: this marketplace connector has no refund operation
    const cn = await c.post(`${R}/${x.id}/refund`, { mode: 'connector' }, w.admin);
    expect(cn.status).toBe(409);
    expect(cn.body.error.details).toMatchObject({ rule: 'not_supported_by_connector', marketplace: 'mock' });
    expect((await detail(w, x.id)).refund.status).toBe('ready');                              // untouched

    // detail + timeline
    const rd = (await c.get(`${R}/${y.id}/refund`, w.admin)).body.data;
    expect(rd.note).toContain('Return approval is not refund approval');
    expect(rd.timeline.map((s: any) => [s.step, s.status])).toEqual([['requested', 'complete'], ['approved', 'complete'], ['processing', 'complete'], ['completed', 'pending']]);
    expect(rd.refund).toMatchObject({ status: 'processing', reference: 'PAY-9', currency: expect.any(String) });
    const done = await c.post(`${R}/${y.id}/refund`, { mode: 'manual', amountMinor: 100, currency: 'inr', reference: 'PAY-9' }, w.admin);
    expect(done.body.data.refund).toMatchObject({ status: 'processed', amountMinor: 100, currency: 'INR', reference: 'PAY-9', source: 'manual', error: null });
    expect((await c.get(`${R}/${y.id}/refund`, w.admin)).body.data.timeline.map((s: any) => s.status)).toEqual(['complete', 'complete', 'complete', 'complete']);
    expect((await c.post(`${R}/${y.id}/refund`, { status: 'processed' }, w.admin)).status).toBe(409); // already processed
    expect((await c.post(`${R}/${y.id}/refund`, {}, w.admin)).status).toBe(400);                      // neither status nor mode
    expect((await c.post(`${R}/${x.id}/refund`, { status: 'processed', amountMinor: 999_999_999 }, w.admin)).status).toBe(400);
    // the old body still works
    const old = await c.post(`${R}/${x.id}/refund`, { status: 'processed', reference: 'RFND-1' }, w.admin);
    expect(old.body.data.refund).toMatchObject({ status: 'processed', reference: 'RFND-1' });
    // refund_error + the old timeline endpoint is unchanged by the new bookkeeping
    expect((await c.get(`${R}/${x.id}/timeline`, w.admin)).body.data.map((e: any) => e.toStatus)).toEqual(['requested', 'approved', 'received', 'inspecting']);
    // another business cannot see it
    const rival = await c.registerVendor({ businessName: 'Rival Refund' });
    expect((await c.get(`${R}/${x.id}/refund`, rival)).status).toBe(404);
    expect((await c.get(`${R}/refunds`, rival)).body.data).toMatchObject({ total: 0, counts: { pending: 0, ready: 0, processing: 0, failed: 0 } });
  });
});

describe('create a return from an order', () => {
  it('eligibility by order number, unfulfilled / unknown / limits, item value, and the old validation', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [30] });
    const order = await orderArrives(t, c, w, 3);
    // not fulfilled yet
    const early = await c.get(`${R}/eligibility?order=${encodeURIComponent(order.orderNumber)}`, w.admin);
    expect(early.status).toBe(409);
    expect(early.body.error.details.rule).toBe('order_not_fulfilled');
    expect((await c.get(`${R}/eligibility?order=NO-SUCH-ORDER`, w.admin)).status).toBe(404);
    expect((await c.get(`${R}/eligibility?order=`, w.admin)).status).toBe(400);

    const f = (await c.post(`/api/v1/orders/${order.id}/fulfillment`, {}, w.admin)).body.data.fulfillments[0];
    await pickAndPack(t, c, w, f.id);
    await ship(t, c, w, f.id);
    const wh = w.warehouses[0]!.id;
    const el = await c.get(`${R}/eligibility?order=${encodeURIComponent('#' + String(order.orderNumber).replace(/^#/, ''))}`, w.admin);
    expect(el.status, JSON.stringify(el.body)).toBe(200);
    expect(el.body.data.order).toMatchObject({ id: order.id, number: order.orderNumber, fulfilled: true, channel: { code: 'mock' }, itemCount: 3 });
    const line = el.body.data.items[0];
    expect(line).toMatchObject({ orderItemId: order.items[0].id, sku: w.variant.sku, fulfilledQty: 3, alreadyReturnedQty: 0, availableQty: 3, unitPriceMinor: expect.any(Number) });
    expect((await c.get(`${R}/eligibility?order=${order.externalOrderId}`, w.admin)).body.data.order.id).toBe(order.id);   // by marketplace id too

    // create: more than available is refused, value is reported, no refund is issued
    expect((await c.post(R, { orderId: order.id, reasonCode: 'size_fit', items: [{ orderItemId: line.orderItemId, quantity: 4 }] }, w.admin)).status).toBe(400);
    expect((await c.post(R, { orderId: order.id, reasonCode: 'size_fit', items: [{ orderItemId: line.orderItemId, quantity: 1 }, { orderItemId: line.orderItemId, quantity: 1 }] }, w.admin)).status).toBe(400);
    const created = await c.post(R, { orderId: order.id, reasonCode: 'size_fit', notes: 'too small', items: [{ orderItemId: line.orderItemId, quantity: 2 }] }, w.admin);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data).toMatchObject({ itemValueMinor: 2 * line.unitPriceMinor, status: 'requested', refund: { status: 'pending' }, note: 'Creating a return does not issue a refund.' });
    expect((await c.get(`${R}/eligibility?order=${order.orderNumber}`, w.admin)).body.data.items[0]).toMatchObject({ alreadyReturnedQty: 2, availableQty: 1 });
    expect((await c.post(R, { orderId: order.id, reasonCode: 'size_fit', items: [{ orderItemId: line.orderItemId, quantity: 2 }] }, w.admin)).status).toBe(400); // only 1 left
    // cancelling frees the units again
    await c.post(`${R}/${created.body.data.id}/cancel`, {}, w.admin);
    expect((await c.get(`${R}/eligibility?order=${order.orderNumber}`, w.admin)).body.data.items[0].availableQty).toBe(3);
    void wh;
    // another business cannot find the order; a viewer cannot create
    const rival = await c.registerVendor({ businessName: 'Rival Create' });
    expect((await c.get(`${R}/eligibility?order=${order.orderNumber}`, rival)).status).toBe(404);
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    expect((await c.post(R, { orderId: order.id, reasonCode: 'other', items: [{ orderItemId: line.orderItemId, quantity: 1 }] }, viewer)).status).toBe(403);
    // creating is possible only while a connection allows it: a business without one is told why
    const bare = await c.registerVendor({ businessName: 'No Connection' });
    expect((await c.get(`${R}/overview`, bare)).body.data.createReturn).toMatchObject({ available: false, reason: 'shopify_only' });
  });
});

describe('analytics and attention', () => {
  it('reason shares, concentration, intelligence (reason spike + SKU baseline), attention rows and the sync report', async () => {
    const { w, order, wh } = await shippedWorld(12);
    // 7 returns: size_fit x4, defective x2, other x1
    const reasons = ['size_fit', 'size_fit', 'size_fit', 'size_fit', 'defective', 'defective', 'other'];
    const made: Array<{ id: string }> = [];
    for (const reason of reasons) made.push(await mkReturn(w, order, wh, { reason, approve: false }));

    const an = (await c.get(`${R}/analytics?days=30&sample=100`, w.admin)).body.data;
    expect(an.window).toMatchObject({ returns: 7, days: 30 });
    expect(an.reasons).toEqual([
      { code: 'size_fit', label: 'Size / fit issue', count: 4, sharePct: 57.1 }, { code: 'defective', label: 'Defective / not working', count: 2, sharePct: 28.6 }, { code: 'other', label: 'Other', count: 1, sharePct: 14.3 },
    ]);
    expect(an.concentration).toEqual({ products: 1, text: 'Return activity is concentrated around 1 product.' });
    expect(an.recommendationOnly).toBe(true);
    const spike = an.intelligence.filter((i: any) => i.kind === 'reason_spike');
    expect(spike.map((i: any) => i.text)).toEqual(['57% of recent returns mention a sizing issue.', '29% of recent returns mention defective products.']);
    expect(spike[0].evidence).toContain('4 of the last 7 returns');
    expect(spike[0].action).toMatchObject({ key: 'review_size_chart', label: 'Review size chart' });
    const base = an.intelligence.find((i: any) => i.kind === 'sku_baseline');
    expect(base.evidence).toContain(`${w.variant.sku} . 7 returns in 7 days vs. 0 in the preceding 7 days`);
    // the sample window limits what is looked at; below the threshold no intelligence
    expect((await c.get(`${R}/analytics?sample=3`, w.admin)).body.data.window.returns).toBe(3);
    expect((await c.get(`${R}/analytics?days=0`, w.admin)).status).toBe(400);
    // history older than 7 days is the baseline: age 6 returns by 10 days -> 1 in the last 7 days is not a spike
    await sqlExec(`update return_orders set created_at = now() - interval '10 days' where vendor_id = '${w.admin.vendorId}' and id in (${made.slice(0, 6).map((m) => `'${m.id}'`).join(',')})`);
    const an2 = (await c.get(`${R}/analytics?days=30&sample=100`, w.admin)).body.data;
    expect(an2.intelligence.filter((i: any) => i.kind === 'sku_baseline')).toEqual([]);
    expect((await c.get(`${R}/analytics?days=5`, w.admin)).body.data.window.returns).toBe(1);

    // another business sees nothing
    const rival = await c.registerVendor({ businessName: 'Rival Analytics' });
    expect((await c.get(`${R}/analytics`, rival)).body.data).toMatchObject({ window: { returns: 0 }, reasons: [], intelligence: [] });

    // sync reports that there is no returns sync job
    expect((await c.post(`${R}/sync`, {}, w.admin)).body.data).toMatchObject({ enqueued: false, reason: 'returns_sync_not_available' });
  });

  it('attention rows are computed live with impact and recommended action; settings drive the overdue window', async () => {
    const { w, order, wh } = await shippedWorld(10);
    const staff = await c.addMember(w.admin, 'vendor_staff');
    const overdue = await mkReturn(w, order, wh, { receive: 1 });
    const mismatch = await mkReturn(w, order, wh, { qty: 2, receive: 1 });
    const refundFailed = await mkReturn(w, order, wh, { receive: 1 });
    const noDisposition = await mkReturn(w, order, wh, { receive: 1 });
    const fresh = await mkReturn(w, order, wh, { receive: 1 });
    await inspect(w, refundFailed.id, 'pass');
    await c.post(`${R}/${refundFailed.id}/refund`, { status: 'failed', error: 'connector rejected the refund' }, w.admin);
    await inspect(w, noDisposition.id, 'pass');
    await c.post(`${R}/${noDisposition.id}/refund`, { status: 'processing' }, w.admin);
    await c.post(`${R}/${noDisposition.id}/inspect`, { items: [] }, w.admin);       // invalid body: still 400 (old validation)
    // two of them were received long ago
    await sqlExec(`update return_orders set received_at = now() - interval '3 days' where vendor_id = '${w.admin.vendorId}' and id in ('${overdue.id}','${mismatch.id}')`);

    const at = (await c.get(`${R}/attention`, staff)).body.data;
    const byId = new Map<string, any>(at.items.map((x: any) => [x.returnId, x]));
    expect(byId.get(overdue.id)).toMatchObject({ issue: 'inspection_overdue', recommendedAction: { text: 'Start inspection' }, impact: expect.stringContaining('inspection not started') });
    expect(byId.get(mismatch.id)).toMatchObject({ issue: 'quantity_mismatch', impact: 'Expected 2, received 1', recommendedAction: { text: 'Review inspection' }, signals: ['quantity_mismatch', 'inspection_overdue'] });
    expect(byId.get(refundFailed.id)).toMatchObject({ issue: 'disposition_missing' });  // passed, units not decided yet, and the refund failed
    expect(byId.get(refundFailed.id).signals).toEqual(['disposition_missing', 'refund_pending']);
    expect(byId.get(noDisposition.id)).toMatchObject({ issue: 'disposition_missing', impact: 'Refund processing, stock destination not confirmed', recommendedAction: { text: 'Review disposition' } });
    expect(byId.has(fresh.id)).toBe(false);          // received recently, within the 24 h default window
    expect(at.total).toBe(4);

    // deciding the disposition clears the issue, a failed refund remains
    expect((await c.post(`${R}/${refundFailed.id}/disposition`, { kind: 'sellable' }, w.admin)).status).toBe(200);
    const at2 = new Map<string, any>((await c.get(`${R}/attention`, w.admin)).body.data.items.map((x: any) => [x.returnId, x]));
    expect(at2.get(refundFailed.id)).toMatchObject({ issue: 'refund_pending', recommendedAction: { text: 'Review connector failure' }, impact: expect.stringContaining('connector rejected the refund') });

    // the overdue window is a business setting: 100 hours makes the 3-day-old returns not overdue any more
    expect((await c.patch('/api/v1/vendor/settings', { returns: { inspectionOverdueHours: 100 } }, w.admin)).status).toBe(200);
    const at3 = new Map<string, any>((await c.get(`${R}/attention`, w.admin)).body.data.items.map((x: any) => [x.returnId, x]));
    expect(at3.has(overdue.id)).toBe(false);
    expect(at3.get(mismatch.id).signals).toEqual(['quantity_mismatch']);
    // high-value review: a threshold of 1 minor unit flags every open return with a refund due
    expect((await c.patch('/api/v1/vendor/settings', { returns: { highValueMinor: 1 } }, w.admin)).status).toBe(200);
    expect((await c.get(`${R}/overview`, w.admin)).body.data.attention.find((a: any) => a.key === 'high_value_review').count).toBeGreaterThanOrEqual(4);
    expect((await c.get(`${R}/ledger?filter[signal]=high_value_review`, w.admin)).body.data.total).toBe((await c.get(`${R}/overview`, w.admin)).body.data.attention.find((a: any) => a.key === 'high_value_review').count);

    // CSV export of the attention list
    const csv = await c.get(`${R}/attention/export`, w.admin);
    expect(csv.status).toBe(200);
    const lines = String(csv.body ?? csv.raw.body).trim().split('\r\n');
    expect(lines[0]).toBe('Return,Order,Issue,Impact,Recommended action');
    expect(lines.length).toBe(1 + (await c.get(`${R}/attention`, w.admin)).body.data.total);

    // tenant isolation + viewer reads
    const rival = await c.registerVendor({ businessName: 'Rival Attention' });
    expect((await c.get(`${R}/attention`, rival)).body.data).toEqual({ total: 0, items: [] });
    expect((await c.get(`${R}/overview`, rival)).body.data.statusLine).toEqual({ open: 0, awaitingInspection: 0, refundsPending: 0 });
    expect((await c.get(`${R}/ledger`, rival)).body.data).toMatchObject({ total: 0, items: [] });
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    for (const url of ['overview', 'ledger', 'counts', 'refunds', 'attention', 'analytics', `${overdue.id}/detail`, `${overdue.id}/inspection`, `${overdue.id}/disposition-options`, `${overdue.id}/refund`]) expect((await c.get(`${R}/${url}`, viewer)).status, url).toBe(200);
    expect((await c.post(`${R}/sync`, {}, viewer)).status).toBe(403);
    expect((await c.get(`${R}/${overdue.id}/detail`, rival)).status).toBe(404);
  });
});

describe('return detail drawer', () => {
  it('header, product, expected vs received, current state and a timeline with future steps pending', async () => {
    const { w, order, wh } = await shippedWorld(5);
    const staff = await c.addMember(w.admin, 'vendor_staff');
    const x = await mkReturn(w, order, wh, { qty: 2, receive: 1, reason: 'size_fit' });
    const d0 = (await c.get(`${R}/${x.id}/detail`, w.admin)).body.data;
    expect(d0.header).toMatchObject({ id: x.id, number: x.number, status: 'received', orderNumber: order.orderNumber, channel: { code: 'mock' } });
    expect(d0.product).toMatchObject({ sku: w.variant.sku, quantity: 2, reason: 'Size / fit issue' });
    expect(d0.details.quantity).toEqual({ expected: 2, received: 1 });
    expect(d0.receipt).toMatchObject({ match: 'quantity_mismatch', mismatch: { expected: 2, received: 1 } });
    expect(d0.currentState).toMatchObject({ inspection: { status: 'not_started', inspector: null }, refund: { status: 'pending' }, disposition: 'pending' });
    expect(d0.timeline.map((s: any) => [s.step, s.status])).toEqual([['requested', 'complete'], ['approved', 'complete'], ['received', 'complete'], ['inspection', 'pending'], ['refund', 'pending'], ['disposition', 'pending'], ['closed', 'pending']]);
    expect(d0.timeline[3].note).toBe('Unassigned');
    expect(d0.timeline[4].note).toBe('Awaiting inspection decision');
    expect(d0.timeline[2].note).toBe('1 of 2 expected units received');
    expect(d0.actions.find((a: any) => a.key === 'confirm_disposition')).toMatchObject({ enabled: false, disabledReason: 'inspection_not_finished' });
    // the customer is shown only when the channel sent it, and the mock marketplace's buyer data is shown in full here
    const row = (await c.get(`${R}/ledger?q=${x.number}`, w.admin)).body.data.items[0];
    if (row.customer?.email) { expect(row.customer.email).toMatch(/^.\*\*\*@/); expect(d0.details.customer.email).not.toContain('***'); } else expect(d0.details.customer).toBeNull();

    await c.post(`${R}/${x.id}/inspection/assign`, { userId: staff.userId }, w.admin);
    await inspect(w, x.id, 'needs_review', staff);
    const dq = await c.post(`${R}/${x.id}/disposition`, { kind: 'quarantine' }, w.admin);
    expect(dq.status, JSON.stringify(dq.body)).toBe(200);
    const d1 = (await c.get(`${R}/${x.id}/detail`, w.admin)).body.data;
    expect(d1.timeline.find((s: any) => s.step === 'inspection')).toMatchObject({ status: 'complete', actor: { id: staff.userId, kind: 'user' }, note: 'inspected: needs_review' });
    expect(d1.timeline.find((s: any) => s.step === 'disposition')).toMatchObject({ status: 'complete', actor: { id: w.admin.userId } });
    expect(d1.currentState).toMatchObject({ inspection: { status: 'requires_review' }, disposition: 'quarantine' });
    // close it: the last step completes
    await c.post(`${R}/${x.id}/complete`, { acceptShort: true }, w.admin);
    const d2 = (await c.get(`${R}/${x.id}/detail`, w.admin)).body.data;
    expect(d2.timeline.at(-1)).toMatchObject({ step: 'closed', status: 'complete' });
    expect((await c.get(`${R}/overview`, w.admin)).body.data.stages.closed.count).toBe(1);
    expect((await c.get(`${R}/ledger?tab=completed`, w.admin)).body.data.items[0]).toMatchObject({ id: x.id, displayStatus: 'resolved', action: { key: 'refund' } });
    expect((await c.get(`${R}/${'00000000-0000-4000-8000-0000000000aa'}/detail`, w.admin)).status).toBe(404);
  });
});
