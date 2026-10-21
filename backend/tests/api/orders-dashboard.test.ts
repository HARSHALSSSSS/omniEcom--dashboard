import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { computeDispatchDue, resolvePolicy, slaBand, zonedTimeToUtc } from '@oms/mod-orders';
import { buildWorld, orderArrives, type World } from '../helpers/stage4';

const MIN = 60_000;
const HOUR = 3_600_000;
const IST = 'Asia/Kolkata';
const T = { atRiskMinutes: 90, approachingMinutes: 240 };
const none = { rows: [], defaultHandlingHours: 24 };

describe('SLA model (pure)', () => {
  const placed = new Date('2026-10-05T06:00:00Z'); // 11:30 IST

  it('uses the business default, then marketplace, then marketplace + warehouse', () => {
    const wh = '11111111-1111-4111-8111-111111111111';
    const set = { defaultHandlingHours: 30, rows: [
      { marketplace: 'amazon_in', warehouseId: null, handlingHours: 48, cutoffTime: null },
      { marketplace: 'amazon_in', warehouseId: wh, handlingHours: 12, cutoffTime: null },
    ] };
    expect(resolvePolicy(set, { marketplace: 'flipkart' }).source).toBe('default');
    expect(computeDispatchDue(placed, { marketplace: 'flipkart' }, set, IST).getTime()).toBe(placed.getTime() + 30 * HOUR);
    expect(computeDispatchDue(placed, { marketplace: 'amazon_in' }, set, IST).getTime()).toBe(placed.getTime() + 48 * HOUR);
    expect(computeDispatchDue(placed, { marketplace: 'amazon_in', warehouseId: null }, set, IST).getTime()).toBe(placed.getTime() + 48 * HOUR);
    expect(computeDispatchDue(placed, { marketplace: 'amazon_in', warehouseId: wh }, set, IST).getTime()).toBe(placed.getTime() + 12 * HOUR);
    // another warehouse has no override: falls back to the marketplace policy
    expect(computeDispatchDue(placed, { marketplace: 'amazon_in', warehouseId: '22222222-2222-4222-8222-222222222222' }, set, IST).getTime()).toBe(placed.getTime() + 48 * HOUR);
  });

  it('defaults to 24 h', () => {
    expect(computeDispatchDue(placed, { marketplace: 'x' }, none, IST).getTime()).toBe(placed.getTime() + 24 * HOUR);
  });

  it('counts from the next local day when the order is placed after the cut-off', () => {
    const set = { defaultHandlingHours: 24, rows: [{ marketplace: 'm', warehouseId: null, handlingHours: 24, cutoffTime: '14:00' }] };
    // 11:30 IST: before the cut-off -> placed + 24 h
    expect(computeDispatchDue(placed, { marketplace: 'm' }, set, IST).getTime()).toBe(placed.getTime() + 24 * HOUR);
    // 14:00 IST sharp: still today's batch
    const atCutoff = zonedTimeToUtc(2026, 10, 5, 14, 0, IST);
    expect(computeDispatchDue(atCutoff, { marketplace: 'm' }, set, IST).getTime()).toBe(atCutoff.getTime() + 24 * HOUR);
    // 14:01 IST: the clock starts at 00:00 IST of 6 Oct, so it is due 00:00 IST of 7 Oct
    const after = zonedTimeToUtc(2026, 10, 5, 14, 1, IST);
    expect(computeDispatchDue(after, { marketplace: 'm' }, set, IST).toISOString()).toBe(zonedTimeToUtc(2026, 10, 7, 0, 0, IST).toISOString());
    // 23:59 IST (late evening) behaves the same way
    expect(computeDispatchDue(zonedTimeToUtc(2026, 10, 5, 23, 59, IST), { marketplace: 'm' }, set, IST).toISOString()).toBe(zonedTimeToUtc(2026, 10, 7, 0, 0, IST).toISOString());
    // the cut-off is read in the BUSINESS time zone: 14:01 IST is 08:31 UTC, which would be before a 14:00 cut-off in UTC
    expect(computeDispatchDue(after, { marketplace: 'm' }, set, 'UTC').getTime()).toBe(after.getTime() + 24 * HOUR);
  });

  it('band boundaries: safe > 240 min, approaching 91-240, at risk 0-90, breached past due, none when finished', () => {
    const now = new Date('2026-10-05T10:00:00Z');
    const at = (mins: number, status = 'confirmed') => slaBand({ status, dueAt: new Date(now.getTime() + mins * MIN) }, now, T);
    expect(at(241)).toBe('safe');
    expect(at(240)).toBe('approaching');
    expect(at(91)).toBe('approaching');
    expect(at(90)).toBe('at_risk');
    expect(at(1)).toBe('at_risk');
    expect(at(0)).toBe('at_risk'); // due right now is not breached yet
    expect(at(-1)).toBe('breached');
    for (const s of ['dispatched', 'in_transit', 'delivered', 'cancelled', 'returned']) expect(at(-500, s)).toBe('none');
    expect(slaBand({ status: 'new', dueAt: null }, now, T)).toBe('none');
    // thresholds are configurable
    expect(slaBand({ status: 'new', dueAt: new Date(now.getTime() + 100 * MIN) }, now, { atRiskMinutes: 120, approachingMinutes: 300 })).toBe('at_risk');
  });
});

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
const ids = (o: Array<{ id: string }>) => o.map((x) => x.id);

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

describe('dispatch due date on import + SLA policies', () => {
  let w: World;
  let viewer: Actor;
  let staff: Actor;

  beforeAll(async () => {
    w = await buildWorld(t, c, { warehouses: 2, stock: [50, 50] });
    viewer = await c.addMember(w.admin, 'vendor_viewer');
    staff = await c.addMember(w.admin, 'vendor_staff');
  });

  const dueOf = async (orderId: string, as = w.admin) => (await c.get(`/api/v1/orders/${orderId}/drawer`, as)).body.data.sla.dueAt as string;

  it('sets dispatch_due_at = placed + business default (24 h) when an order is imported', async () => {
    const o = await orderArrives(t, c, w, 1);
    const [row] = await sqlRows(`SELECT placed_at, dispatch_due_at FROM orders WHERE id = '${o.id}'`);
    expect(new Date(row.dispatch_due_at).getTime() - new Date(row.placed_at).getTime()).toBe(24 * HOUR);
    expect(await dueOf(o.id)).toBe(new Date(row.dispatch_due_at).toISOString());
  });

  it('the vendor setting sla.defaultHandlingHours changes the default', async () => {
    const patched = await c.patch('/api/v1/vendor/settings', { sla: { defaultHandlingHours: 36 } }, w.admin);
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    const o = await orderArrives(t, c, w, 1);
    const [row] = await sqlRows(`SELECT placed_at, dispatch_due_at FROM orders WHERE id = '${o.id}'`);
    expect(new Date(row.dispatch_due_at).getTime() - new Date(row.placed_at).getTime()).toBe(36 * HOUR);
    expect((await c.patch('/api/v1/vendor/settings', { sla: { defaultHandlingHours: 24 } }, w.admin)).status).toBe(200);
  });

  it('upserts, lists and deletes policies; a marketplace policy applies to new orders', async () => {
    const put = await c.put('/api/v1/orders/sla-policies', { marketplace: 'mock', handlingHours: 48 }, w.admin);
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    const again = await c.put('/api/v1/orders/sla-policies', { marketplace: 'mock', handlingHours: 36, cutoffTime: null }, w.admin);
    expect(again.body.data.id).toBe(put.body.data.id); // same (marketplace, no warehouse): updated, not duplicated
    expect(again.body.data.handlingHours).toBe(36);

    const o = await orderArrives(t, c, w, 1);
    const [row] = await sqlRows(`SELECT placed_at, dispatch_due_at FROM orders WHERE id = '${o.id}'`);
    expect(new Date(row.dispatch_due_at).getTime() - new Date(row.placed_at).getTime()).toBe(36 * HOUR);

    const list = (await c.get('/api/v1/orders/sla-policies', w.admin)).body.data;
    expect(list.defaultHandlingHours).toBe(24);
    expect(list.atRiskMinutes).toBe(90);
    expect(list.items).toHaveLength(1);
    expect(list.timezone).toBeTruthy();
  });

  it('a cut-off pushes late orders to the next day', async () => {
    // cut-off 00:00 business time: every order placed after midnight (i.e. any order) starts counting the next local day
    expect((await c.put('/api/v1/orders/sla-policies', { marketplace: 'mock', handlingHours: 24, cutoffTime: '00:00' }, w.admin)).status).toBe(200);
    const o = await orderArrives(t, c, w, 1);
    const [row] = await sqlRows(`SELECT placed_at, dispatch_due_at FROM orders WHERE id = '${o.id}'`);
    const delta = new Date(row.dispatch_due_at).getTime() - new Date(row.placed_at).getTime();
    expect(delta).toBeGreaterThan(24 * HOUR);
    expect(delta).toBeLessThanOrEqual(48 * HOUR);
  });

  it('a (marketplace + warehouse) policy re-computes the deadline when the fulfillment picks that warehouse', async () => {
    expect((await c.put('/api/v1/orders/sla-policies', { marketplace: 'mock', handlingHours: 24 }, w.admin)).status).toBe(200); // no cut-off again
    const second = w.warehouses[1]!;
    const put = await c.put('/api/v1/orders/sla-policies', { marketplace: 'mock', warehouseId: second.id, handlingHours: 12 }, w.admin);
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(put.body.data.warehouseId).toBe(second.id);
    expect((await c.get('/api/v1/orders/sla-policies', w.admin)).body.data.items).toHaveLength(2);

    const o = await orderArrives(t, c, w, 1);
    const [before] = await sqlRows(`SELECT placed_at, dispatch_due_at FROM orders WHERE id = '${o.id}'`);
    expect(new Date(before.dispatch_due_at).getTime() - new Date(before.placed_at).getTime()).toBe(24 * HOUR);
    const f = await c.post(`/api/v1/orders/${o.id}/fulfillment`, { warehouseIds: [second.id] }, w.admin);
    expect(f.status, JSON.stringify(f.body)).toBeLessThan(300);
    await t.pump();
    const [after] = await sqlRows(`SELECT placed_at, dispatch_due_at FROM orders WHERE id = '${o.id}'`);
    expect(new Date(after.dispatch_due_at).getTime() - new Date(after.placed_at).getTime()).toBe(12 * HOUR);

    // deleting the policy removes it from the list; unknown id is a 404
    expect((await c.del(`/api/v1/orders/sla-policies/${put.body.data.id}`, w.admin)).status).toBe(200);
    expect((await c.get('/api/v1/orders/sla-policies', w.admin)).body.data.items).toHaveLength(1);
    expect((await c.del(`/api/v1/orders/sla-policies/${put.body.data.id}`, w.admin)).status).toBe(404);
  });

  it('validates input and enforces permissions and tenant isolation', async () => {
    expect((await c.put('/api/v1/orders/sla-policies', { marketplace: 'mock', handlingHours: 0 }, w.admin)).status).toBe(400);
    expect((await c.put('/api/v1/orders/sla-policies', { marketplace: 'mock', handlingHours: 24, cutoffTime: '25:00' }, w.admin)).status).toBe(400);
    expect((await c.put('/api/v1/orders/sla-policies', { marketplace: 'mock', handlingHours: 24, warehouseId: '33333333-3333-4333-8333-333333333333' }, w.admin)).status).toBe(404);
    expect((await c.put('/api/v1/orders/sla-policies', { marketplace: 'mock', handlingHours: 10 }, viewer)).status).toBe(403);
    expect((await c.get('/api/v1/orders/sla-policies', viewer)).status).toBe(200);
    expect((await c.put('/api/v1/orders/sla-policies', { marketplace: 'mock', handlingHours: 24 }, staff)).status).toBe(200);
    expect((await c.get('/api/v1/orders/sla-policies')).status).toBe(401);

    const other = await c.registerVendor({ businessName: 'Other Co' });
    expect((await c.get('/api/v1/orders/sla-policies', other)).body.data.items).toHaveLength(0);
    const mine = (await c.get('/api/v1/orders/sla-policies', w.admin)).body.data.items[0];
    expect((await c.del(`/api/v1/orders/sla-policies/${mine.id}`, other)).status).toBe(404);
    expect((await c.get('/api/v1/orders/sla-policies', w.admin)).body.data.items).toHaveLength(1);
  });
});

describe('workspace, ledger, drawer, activity, export', () => {
  let w: World;
  let viewer: Actor;
  let other: Actor;
  // delivered/dispatched/returned first (they use up little stock), then the interesting open ones
  const o: Record<string, any> = {};

  beforeAll(async () => {
    w = await buildWorld(t, c, { stock: [50] });
    viewer = await c.addMember(w.admin, 'vendor_viewer');
    other = await c.registerVendor({ businessName: 'Rival Co' });
    o.shipped = await orderArrives(t, c, w, 1);
    o.delivered = await orderArrives(t, c, w, 1);
    o.returned = await orderArrives(t, c, w, 1);
    o.a1 = await orderArrives(t, c, w, 1);
    o.a2 = await orderArrives(t, c, w, 1);
    o.a3 = await orderArrives(t, c, w, 1);
    o.a4 = await orderArrives(t, c, w, 1);
    o.a5 = await orderArrives(t, c, w, 60); // more than the stock: partial
    const all = Object.values(o).map((x) => `'${x.id}'`).join(',');
    await sqlExec(`UPDATE orders SET placed_at = now() - interval '1 minute' WHERE id IN (${all})`);
    await sqlExec(`UPDATE orders SET status = 'dispatched', dispatched_at = now() WHERE id = '${o.shipped.id}'`);
    await sqlExec(`UPDATE orders SET status = 'delivered' WHERE id = '${o.delivered.id}'`);
    await sqlExec(`UPDATE orders SET status = 'returned' WHERE id = '${o.returned.id}'`);
    // SLA bands: a1 at risk, a2 approaching, a3 safe, a4 breached, a5 safe (default 24 h)
    await sqlExec(`UPDATE orders SET dispatch_due_at = now() + interval '30 minutes' WHERE id = '${o.a1.id}'`);
    await sqlExec(`UPDATE orders SET dispatch_due_at = now() + interval '120 minutes' WHERE id = '${o.a2.id}'`);
    await sqlExec(`UPDATE orders SET dispatch_due_at = now() + interval '10 hours' WHERE id = '${o.a3.id}'`);
    await sqlExec(`UPDATE orders SET dispatch_due_at = now() - interval '20 minutes' WHERE id = '${o.a4.id}'`);
    // a2: payment failed; a3: a customer asks to cancel; a4: a return is open (and a3 is paid)
    await sqlExec(`UPDATE orders SET payment_status = 'failed' WHERE id = '${o.a2.id}'`);
    await sqlExec(`UPDATE orders SET payment_status = 'paid' WHERE id = '${o.a3.id}'`);
    expect((await c.post(`/api/v1/orders/${o.a3.id}/cancellation-requests`, { initiator: 'customer', reasonCode: 'other' }, w.admin)).status).toBe(201);
    const [vendor] = await sqlRows(`SELECT vendor_id FROM orders WHERE id = '${o.a4.id}'`);
    await sqlExec(`INSERT INTO return_orders (vendor_id, number, order_id, source, status, reason_code) VALUES ('${vendor.vendor_id}', 'RET-T-1', '${o.a4.id}', 'customer', 'requested', 'damaged')`);
    await sqlExec(`UPDATE orders SET buyer = '{"name":"=HYPERLINK(\\"http://evil\\")"}'::jsonb WHERE id = '${o.a1.id}'`);
    await sqlExec(`UPDATE orders SET buyer = '{}'::jsonb, shipping_address = '{}'::jsonb WHERE id = '${o.a2.id}'`);
  });

  const ledger = async (qs = '', as: Actor = w.admin) => (await c.get(`/api/v1/orders/ledger${qs}`, as)).body.data;

  it('workspace: pulse, needs attention, sources, SLA pressure, tabs', async () => {
    const res = await c.get('/api/v1/orders/workspace', w.admin);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = res.body.data;
    expect(d.pulse.today).toBe(8);
    expect(d.pulse.stages.map((s: any) => s.key)).toEqual(['new', 'confirmed', 'picking', 'packed', 'ready_to_dispatch', 'dispatched', 'in_transit']);
    expect(d.pulse.stages.find((s: any) => s.key === 'dispatched').count).toBe(1);
    expect(d.needsAttention).toMatchObject({ slaRisk: 2, inventoryIssue: 1, paymentIssue: 1, cancellationRisk: 1, returns: 1 });
    expect(d.needsAttention.unprocessed).toBeGreaterThanOrEqual(5);
    expect(d.slaPressure.safe.orders).toBe(2);
    expect(d.slaPressure.approaching.orders).toBe(1);
    expect(d.slaPressure.atRisk.orders).toBe(1);
    expect(d.slaPressure.breached.orders).toBe(1);
    expect(d.slaPressure.summary).toBe('1 orders may breach dispatch SLA within the next 90 minutes.');
    expect(d.slaPressure.safe.hint).toBe('more than 4 h');
    expect(d.slaPressure.reviewHref).toContain('at_risk');
    expect(d.sources.total).toBe(8);
    expect(d.sources.items).toEqual([{ channel: { code: 'mock', name: expect.any(String) }, orders: 8, sharePct: 100 }]);
    expect(d.tabs.all).toBe(8);
    expect(d.tabs.shipped).toBe(1);
    expect(d.tabs.delivered).toBe(1);
    expect(d.tabs.returnsDisputes).toBe(2); // the returned order + the order with an open return
    expect(typeof d.generatedAt).toBe('string');
  });

  it('every tab counter equals the matching ledger filter', async () => {
    const d = (await c.get('/api/v1/orders/workspace', w.admin)).body.data;
    const tabs: Array<[string, string]> = [['all', 'all'], ['needsAttention', 'needs_attention'], ['new', 'new'], ['processing', 'processing'], ['shipped', 'shipped'], ['delivered', 'delivered'], ['returnsDisputes', 'returns_disputes']];
    for (const [key, filter] of tabs) expect((await ledger(`?filter[tab]=${filter}`)).total, `tab ${key}`).toBe(d.tabs[key]);
    const chips: Array<[string, string]> = [['slaRisk', 'sla_risk'], ['unprocessed', 'unprocessed'], ['inventoryIssue', 'inventory_issue'], ['paymentIssue', 'payment_issue'], ['cancellationRisk', 'cancellation_risk'], ['returns', 'returns']];
    for (const [key, filter] of chips) expect((await ledger(`?filter[attention]=${filter}`)).total, `chip ${key}`).toBe(d.needsAttention[key]);
    const bands: Array<[string, string]> = [['safe', 'safe'], ['approaching', 'approaching'], ['atRisk', 'at_risk'], ['breached', 'breached']];
    for (const [key, filter] of bands) expect((await ledger(`?filter[slaState]=${filter}`)).total, `band ${key}`).toBe(d.slaPressure[key].orders);
    expect(d.tabs.needsAttention).toBeGreaterThanOrEqual(5);
    expect((await ledger('?filter[attention]=sla_risk&filter[attention]=returns')).total).toBe(2); // a1, a4 (a4 is both): OR semantics, no duplicates
    expect((await ledger('?filter[attention]=delayed')).total).toBe(1);
  });

  it('ledger rows carry SLA, payment, fulfillment, tone and the inline inventory issue', async () => {
    const d = await ledger('?pageSize=100');
    const by = new Map<string, any>(d.items.map((i: any) => [i.id, i]));
    const a1 = by.get(o.a1.id);
    expect(a1).toMatchObject({ number: o.a1.orderNumber, marketplace: { code: 'mock' }, itemCount: 1, currency: 'INR', fulfillmentStatus: null, rowTone: 'red' });
    expect(a1.sla.state).toBe('at_risk');
    expect(a1.sla.label).toMatch(/^Due in \d+ min$/);
    expect(a1.sla.minutesRemaining).toBeGreaterThan(25);
    expect(a1.sla.minutesRemaining).toBeLessThanOrEqual(30);
    expect(by.get(o.a2.id).rowTone).toBe('red'); // payment failed outweighs a calm band
    expect(by.get(o.a2.id).payment.status).toBe('failed');
    expect(by.get(o.a3.id).rowTone).toBe('amber'); // open cancellation request
    expect(by.get(o.a3.id).sla.label).toBe('Healthy');
    const a4 = by.get(o.a4.id);
    expect(a4.sla.state).toBe('breached');
    expect(a4.sla.label).toMatch(/^Overdue \d+ min$/);
    expect(a4.sla.minutesRemaining).toBeLessThan(0);
    expect(by.get(o.delivered.id).sla).toEqual({ state: 'none', dueAt: expect.any(String), minutesRemaining: null, label: null });
    expect(by.get(o.delivered.id).rowTone).toBe('none');
    const a5 = by.get(o.a5.id);
    expect(a5.inventoryIssue).toMatchObject({ sku: w.variant.sku, action: 'restock', available: 0 });
    expect(a5.inventoryIssue.required).toBeGreaterThan(0);
    expect(a5.rowTone).toBe('amber');
    expect(a1.inventoryIssue).toBeNull();
    expect((await ledger('?filter[attention]=inventory_issue')).items.map((i: any) => i.id)).toEqual([o.a5.id]);
  });

  it('filters: search, marketplace, status, payment, fulfillment, dates, saved view ignored, validation', async () => {
    expect((await ledger(`?q=${o.a1.orderNumber}`)).total).toBe(1);
    expect((await ledger(`?q=${encodeURIComponent(w.variant.sku)}`)).total).toBe(8); // by SKU
    expect((await ledger('?q=HYPERLINK')).items.map((i: any) => i.id)).toEqual([o.a1.id]); // by customer name
    expect((await ledger('?q=%25')).total).toBe(0); // % is literal, not a wildcard
    expect((await ledger('?filter[marketplace]=mock')).total).toBe(8);
    expect((await ledger('?filter[marketplace]=nope')).total).toBe(0);
    expect((await ledger('?filter[status]=delivered')).items.map((i: any) => i.id)).toEqual([o.delivered.id]);
    expect((await ledger('?filter[status]=delivered,returned')).total).toBe(2);
    expect((await ledger('?filter[payment]=failed')).items.map((i: any) => i.id)).toEqual([o.a2.id]);
    expect((await ledger('?filter[fulfillmentStatus]=none')).total).toBe(8);
    expect((await ledger('?filter[fulfillmentStatus]=picking')).total).toBe(0);
    expect((await ledger('?filter[date]=today')).total).toBe(8);
    expect((await ledger('?filter[date]=2020-01-01')).total).toBe(0);
    expect((await ledger('?filter[placedFrom]=2999-01-01T00:00:00Z')).total).toBe(0);
    expect((await ledger('?filter[savedViewId]=abc')).total).toBe(8);
    expect((await c.get('/api/v1/orders/ledger?filter[attention]=bogus', w.admin)).status).toBe(400);
    expect((await c.get('/api/v1/orders/ledger?filter[slaState]=bogus', w.admin)).status).toBe(400);
    expect((await c.get('/api/v1/orders/ledger?filter[date]=someday', w.admin)).status).toBe(400);
    expect((await c.get('/api/v1/orders/ledger?sort=bogus', w.admin)).status).toBe(400);
  });

  it('sorts by placed time, value and SLA urgency', async () => {
    const bySla = await ledger('?sort=sla');
    expect(ids(bySla.items).slice(0, 2)).toEqual([o.a4.id, o.a1.id]); // breached first, then at risk
    expect(bySla.items.slice(-3).every((i: any) => i.sla.state === 'none')).toBe(true); // finished orders last
    await sqlExec(`UPDATE orders SET total_minor = 1000 WHERE id = '${o.a1.id}'`);
    await sqlExec(`UPDATE orders SET total_minor = 9000 WHERE id = '${o.a2.id}'`);
    const desc = (await ledger('?sort=-value')).items.map((i: any) => i.valueMinor);
    expect([...desc].sort((a, b) => b - a)).toEqual(desc);
    expect(desc[0]).toBeGreaterThanOrEqual(9000);
    const asc = (await ledger('?sort=value')).items.map((i: any) => i.valueMinor);
    expect([...asc].sort((a, b) => a - b)).toEqual(asc);
    const placedAsc = (await ledger('?sort=placedAt')).items.map((i: any) => i.placedAt);
    expect([...placedAsc].sort()).toEqual(placedAsc);
  });

  it('paginates with numbered pages and caps deep paging', async () => {
    const p1 = await ledger('?pageSize=3&page=1');
    expect(p1).toMatchObject({ page: 1, pageSize: 3, total: 8, pages: 3 });
    const p2 = await ledger('?pageSize=3&page=2');
    const p3 = await ledger('?pageSize=3&page=3');
    expect(p3.items).toHaveLength(2);
    const seen = [...ids(p1.items), ...ids(p2.items), ...ids(p3.items)];
    expect(new Set(seen).size).toBe(8); // no overlaps, nothing lost
    expect((await ledger('?pageSize=3&page=4')).items).toEqual([]);
    expect((await c.get('/api/v1/orders/ledger?pageSize=101', w.admin)).status).toBe(400);
    expect((await c.get('/api/v1/orders/ledger?page=0', w.admin)).status).toBe(400);
    expect((await c.get('/api/v1/orders/ledger?page=5000&pageSize=3', w.admin)).status).toBe(400); // beyond 10,000 rows deep: use filters
    expect((await ledger('?filter[tab]=needs_attention&pageSize=2')).pages).toBe(Math.ceil((await ledger('?filter[tab]=needs_attention')).total / 2));
  });

  it('drawer: SLA progress, customer only from provided data, items, fulfillment, activity, actions', async () => {
    const before = (await c.get(`/api/v1/orders/${o.a1.id}/drawer`, w.admin)).body.data;
    expect(before).toMatchObject({ id: o.a1.id, number: o.a1.orderNumber, channel: { code: 'mock' }, items: { units: 1 } });
    expect(before.items.lines[0]).toMatchObject({ sku: w.variant.sku, qty: 1 });
    expect(before.sla.state).toBe('at_risk');
    expect(before.sla.stageLabel).toBe('At risk');
    expect(before.sla.progressPct).toBeGreaterThanOrEqual(0);
    expect(before.sla.progressPct).toBeLessThanOrEqual(100);
    expect(before.fulfillment).toEqual({ warehouse: null, picking: null, fulfillmentId: null, status: null });
    expect(before.actions.find((a: any) => a.key === 'open_fulfillment')).toMatchObject({ enabled: false, disabledReason: 'no_fulfillment' });
    expect(before.actions.find((a: any) => a.key === 'cancel_order')).toMatchObject({ enabled: true, method: 'POST', href: `/api/v1/orders/${o.a1.id}/cancel` });
    expect(before.activity[0].text).toBe('Order received');

    // nothing is inferred: no buyer data => null fields
    const bare = (await c.get(`/api/v1/orders/${o.a2.id}/drawer`, w.admin)).body.data;
    expect(bare.customer).toEqual({ name: null, city: null, state: null });
    await sqlExec(`UPDATE orders SET buyer = '{"name":"Asha Rao"}'::jsonb, shipping_address = '{"city":"Pune","state":"MH"}'::jsonb WHERE id = '${o.a2.id}'`);
    expect((await c.get(`/api/v1/orders/${o.a2.id}/drawer`, w.admin)).body.data.customer).toEqual({ name: 'Asha Rao', city: 'Pune', state: 'MH' });

    const f = await c.post(`/api/v1/orders/${o.a1.id}/fulfillment`, {}, w.admin);
    expect(f.status, JSON.stringify(f.body)).toBeLessThan(300);
    await t.pump();
    const after = (await c.get(`/api/v1/orders/${o.a1.id}/drawer`, w.admin)).body.data;
    expect(after.fulfillment).toMatchObject({ picking: 'pending', fulfillmentId: f.body.data.fulfillments[0].id });
    expect(after.fulfillment.warehouse).toEqual(expect.any(String));
    expect(after.actions.find((a: any) => a.key === 'open_fulfillment')).toMatchObject({ enabled: true, href: `/api/v1/fulfillments/${f.body.data.fulfillments[0].id}` });
    // the ledger now shows the latest fulfillment status, and its filter finds it
    const row = (await ledger(`?q=${o.a1.orderNumber}`)).items[0];
    expect(row.fulfillmentStatus).toEqual(expect.any(String));
    expect((await ledger(`?filter[fulfillmentStatus]=${row.fulfillmentStatus}`)).items.map((i: any) => i.id)).toContain(o.a1.id);
    expect((await ledger('?filter[fulfillmentStatus]=none')).total).toBe(7);

    const done = (await c.get(`/api/v1/orders/${o.delivered.id}/drawer`, w.admin)).body.data;
    expect(done.sla).toMatchObject({ state: 'none', progressPct: null, minutesRemaining: null, stageLabel: 'Delivered' });
    expect(done.actions.find((a: any) => a.key === 'cancel_order').enabled).toBe(false);
    expect((await c.get('/api/v1/orders/00000000-0000-4000-8000-000000000000/drawer', w.admin)).status).toBe(404);
    expect((await c.get('/api/v1/orders/not-a-uuid/drawer', w.admin)).status).toBe(400);
  });

  it('activity: recent events across orders, newest first, limited', async () => {
    const [vendor] = await sqlRows(`SELECT vendor_id FROM orders WHERE id = '${o.a1.id}'`);
    await sqlExec(`INSERT INTO order_status_events (vendor_id, order_id, from_status, to_status, source) VALUES ('${vendor.vendor_id}', '${o.a2.id}', 'confirmed', 'picking', 'system'), ('${vendor.vendor_id}', '${o.a3.id}', 'packed', 'ready_to_dispatch', 'system')`);
    const res = await c.get('/api/v1/orders/activity?limit=50', w.admin);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const items = res.body.data as any[];
    const has = (event: string, order: any) => items.some((i) => i.event === event && i.orderId === order.id);
    expect(has('picking_started', o.a2)).toBe(true);
    expect(has('ready_to_dispatch', o.a3)).toBe(true);
    expect(has('payment_confirmed', o.a3)).toBe(true);
    expect(has('sla_risk', o.a1)).toBe(true);
    expect(has('sla_risk', o.a4)).toBe(false); // breached orders are not "detected at risk" any more
    expect(has('return_requested', o.a4)).toBe(true);
    expect(items.find((i) => i.event === 'return_requested').text).toBe('Return request received');
    const times = items.map((i) => i.at);
    expect([...times].sort().reverse()).toEqual(times);
    expect((await c.get('/api/v1/orders/activity', w.admin)).body.data.length).toBeLessThanOrEqual(5); // default limit
    expect((await c.get('/api/v1/orders/activity?limit=2', w.admin)).body.data).toHaveLength(2);
    expect((await c.get('/api/v1/orders/activity?limit=0', w.admin)).status).toBe(400);
    expect((await c.get('/api/v1/orders/activity?limit=51', w.admin)).status).toBe(400);
  });

  it('export: CSV with the ledger filters, formula-safe cells, audited', async () => {
    const res = await c.get('/api/v1/orders/export?filter[tab]=needs_attention&sort=sla', w.admin);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    const body = res.raw.body;
    const lines = body.trim().split('\r\n');
    const need = (await c.get('/api/v1/orders/workspace', w.admin)).body.data.tabs.needsAttention;
    expect(lines.length).toBe(need + 1); // header + one row per order, same set as the ledger tab
    expect(lines[0]).toContain('Order number');
    expect(body).toContain(`"'=HYPERLINK(""http://evil"")"`); // neutralised with a leading apostrophe
    expect(body).not.toMatch(/(^|,)=HYPERLINK/m);
    const filtered = (await c.get(`/api/v1/orders/export?q=${o.a4.orderNumber}`, viewer)).raw.body.trim().split('\r\n');
    expect(filtered).toHaveLength(2);
    expect(filtered[1]).toContain(o.a4.orderNumber);
    expect((await c.get('/api/v1/orders/export?filter[attention]=bogus', w.admin)).status).toBe(400);
    const audits = await sqlRows(`SELECT count(*)::int n FROM audit_logs WHERE action = 'order.export'`);
    expect(audits[0].n).toBeGreaterThanOrEqual(2);
  });

  it('tenant isolation and permissions', async () => {
    for (const url of ['/api/v1/orders/workspace', '/api/v1/orders/ledger', '/api/v1/orders/activity']) expect((await c.get(url, viewer)).status, url).toBe(200);
    expect((await c.get('/api/v1/orders/workspace')).status).toBe(401);
    expect((await c.get('/api/v1/orders/ledger')).status).toBe(401);
    const ws = (await c.get('/api/v1/orders/workspace', other)).body.data;
    expect(ws.tabs).toEqual({ all: 0, needsAttention: 0, new: 0, processing: 0, shipped: 0, delivered: 0, returnsDisputes: 0 });
    expect(ws.sources).toEqual({ total: 0, windowHours: 24, items: [] });
    expect((await ledger('', other)).total).toBe(0);
    expect((await ledger(`?q=${o.a1.orderNumber}`, other)).total).toBe(0);
    expect((await c.get(`/api/v1/orders/${o.a1.id}/drawer`, other)).status).toBe(404);
    expect((await c.get('/api/v1/orders/activity?limit=50', other)).body.data).toEqual([]);
    expect((await c.get('/api/v1/orders/export', other)).raw.body.trim().split('\r\n')).toHaveLength(1);
  });

  it('band thresholds come from the vendor settings', async () => {
    expect((await c.patch('/api/v1/vendor/settings', { sla: { atRiskMinutes: 20, approachingMinutes: 60 } }, w.admin)).status).toBe(200);
    try {
      const d = (await c.get('/api/v1/orders/workspace', w.admin)).body.data;
      expect(d.slaPressure.thresholds).toEqual({ atRiskMinutes: 20, approachingMinutes: 60 });
      // a1 (30 min away) is now only "approaching", a2 (2 h) is safe, a4 stays breached
      expect(d.slaPressure).toMatchObject({ atRisk: { orders: 0 }, approaching: { orders: 1 }, safe: { orders: 3 }, breached: { orders: 1 } });
      expect(d.slaPressure.summary).toBe('0 orders may breach dispatch SLA within the next 20 minutes.');
    } finally {
      expect((await c.patch('/api/v1/vendor/settings', { sla: { atRiskMinutes: 90, approachingMinutes: 240 } }, w.admin)).status).toBe(200);
    }
  });

  it('keeps the existing endpoints unchanged: GET /orders, /orders/{id}, /orders/summary', async () => {
    const list = await c.get('/api/v1/orders?limit=100', w.admin);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(8);
    expect(list.body.meta).toMatchObject({ limit: 100, hasMore: false });
    const one = list.body.data.find((x: any) => x.id === o.a1.id);
    expect(Object.keys(one)).toEqual(expect.arrayContaining(['id', 'orderNumber', 'marketplace', 'status', 'payment', 'inventoryStatus', 'items', 'version', 'customer', 'shippingAddress']));
    expect(one.dispatchDueAt).toBeUndefined(); // the legacy shape is not extended
    expect((await c.get(`/api/v1/orders/${o.a1.id}`, w.admin)).body.data.orderNumber).toBe(o.a1.orderNumber);
    const summary = (await c.get('/api/v1/orders/summary', w.admin)).body.data;
    expect(summary.total).toBe(8);
    expect(summary.byMarketplace.mock.orders).toBe(8);
    expect(summary.byStatus.delivered).toBe(1);
    expect((await c.get('/api/v1/orders?filter[status]=delivered', w.admin)).body.data).toHaveLength(1);
    // the static workspace paths do not collide with /orders/:id
    expect((await c.get('/api/v1/orders/ledger', w.admin)).status).toBe(200);
  });
});
