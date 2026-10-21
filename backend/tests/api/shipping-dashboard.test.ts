import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type TestApp } from '@oms/testing';
import { allModules } from '@oms/modules-registry';
import { buildWorld, orderArrives, pickAndPack, simulate, type World } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

/** run SQL as the table owner (tests only: moves deadlines / dispatch times / snapshot times that no endpoint should move) */
async function sqlAdmin(stmt: string): Promise<void> {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { await pg.exec(stmt); } finally { await pg.exec('SET ROLE oms_app'); }
}

/** an order arrives, is routed, picked and packed: returns the order and its packed fulfillment */
async function packedOrder(w: World, o: { dueInMinutes?: number | null; weightGrams?: number } = {}) {
  const order = await orderArrives(t, c, w, 1);
  const started = await c.post(`/api/v1/orders/${order.id}/fulfillment`, {}, w.admin);
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  const f = started.body.data.fulfillments[0];
  await pickAndPack(t, c, w, f.id, { weightGrams: o.weightGrams });
  if (o.dueInMinutes !== undefined) await sqlAdmin(`UPDATE orders SET dispatch_due_at = ${o.dueInMinutes === null ? 'NULL' : `now() + interval '${o.dueInMinutes} minutes'`} WHERE id = '${order.id}'`);
  return { order, f };
}
const orders = async (w: World, qs = '') => (await c.get(`/api/v1/shipping/orders${qs}`, w.admin)).body.data;
const addMethod = async (w: World, body: Record<string, unknown>) => { const r = await c.post('/api/v1/shipping/methods', body, w.admin); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body.data; };
const selectIt = (w: World, fid: string, body: Record<string, unknown>) => c.post(`/api/v1/shipping/orders/${fid}/selection`, body, w.admin);
const prefs = (w: World, body: Record<string, unknown>) => c.put('/api/v1/onboarding/fulfillment', { defaultPreference: 'recommended', overrides: {}, ...body }, w.admin);

describe('shipping methods: list, add, capabilities, verify', () => {
  it('lists third-party / seller / marketplace methods, derives capabilities and stays unverified until verified', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [20] });
    // the legacy provider (enabled by buildWorld) shows up as a third-party method
    let list = (await c.get('/api/v1/shipping/methods', w.admin)).body.data;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ kind: 'third_party', providerCode: 'sandbox', state: 'requires_configuration', active: true, verification: { state: 'unverified' } });
    expect(list.summary).toBe('1 active method');
    // the matrix is complete: every kind has a row, unconfigured kinds "require configuration"
    expect(list.capabilityMatrix.map((m: any) => m.method).sort()).toEqual(['marketplace', 'seller', 'third_party']);
    expect(list.capabilityMatrix.find((m: any) => m.method === 'seller')).toMatchObject({ methodId: null, label: 'requires_configuration', tracking: 'requires_configuration' });

    const seller = await addMethod(w, { kind: 'seller' });
    expect(seller).toMatchObject({ kind: 'seller', name: 'Seller Shipping', providerCode: 'seller', state: 'requires_configuration', supportedOrderTypes: ['prepaid', 'cod'] });
    const mk = await addMethod(w, { kind: 'marketplace', channelCode: 'mock' });
    expect(mk).toMatchObject({ kind: 'marketplace', providerCode: 'marketplace:mock', channel: { code: 'mock', availability: 'live' } });
    expect(mk.channel.accountId).toBe(w.account.id);
    // validation + conflicts
    expect((await c.post('/api/v1/shipping/methods', { kind: 'seller' }, w.admin)).status).toBe(409); // already added
    expect((await c.post('/api/v1/shipping/methods', { kind: 'marketplace' }, w.admin)).status).toBe(400); // channelCode required
    const noAccount = await c.post('/api/v1/shipping/methods', { kind: 'marketplace', channelCode: 'flipkart' }, w.admin);
    expect(noAccount.status).toBe(409);
    expect(noAccount.body.error.details.rule).toBe('marketplace_not_connected');
    expect((await c.post('/api/v1/shipping/methods', { kind: 'third_party', providerCode: 'nope' }, w.admin)).status).toBe(400);
    expect((await c.post('/api/v1/shipping/methods', { kind: 'seller', config: { password: 'x' } }, w.admin)).status).toBe(400); // only declared settings
    const manual = await addMethod(w, { kind: 'third_party', providerCode: 'manual', label: 'My courier', config: { defaultCarrier: 'BlueDart' } });
    expect(manual).toMatchObject({ name: 'My courier', provider: { code: 'manual', label: 'My courier' }, config: { defaultCarrier: 'BlueDart' } });

    // capabilities: declared by the source, "requires_configuration" until verified. Marketplace: derived from the connector.
    const caps = (await c.get(`/api/v1/shipping/methods/${mk.id}/capabilities`, w.admin)).body.data;
    const conn = (await c.get('/api/v1/marketplaces/mock', w.admin)).body.data.capabilities;
    const byKey = Object.fromEntries(caps.capabilities.map((x: any) => [x.key, x]));
    expect(byKey.label.declared).toBe(Boolean(conn.shipping.generateLabel));
    expect(byKey.dispatchUpdate.declared).toBe(Boolean(conn.orders.updateStatus));
    expect(byKey.statusSync.declared).toBe(Boolean(conn.orders.fetch || conn.orders.webhook));
    expect(caps.verified).toBe(false);
    for (const x of caps.capabilities) expect(x.value).toBe(x.declared ? 'requires_configuration' : 'not_supported');

    // verify the seller method: a safe check, stored with the capabilities
    const v = await c.post(`/api/v1/shipping/methods/${seller.id}/verify`, {}, w.admin);
    expect(v.status, JSON.stringify(v.body)).toBe(200);
    expect(v.body.data).toMatchObject({ ok: true, verification: { state: 'verified' }, method: { state: 'configured', capabilities: { label: 'supported', tracking: 'supported', dispatchUpdate: 'supported', statusSync: 'supported' } } });
    expect(v.body.data.verification.verifiedAt).toBeTruthy();
    // third-party: sandbox does not poll, so status sync is not supported by the provider (never hard-coded)
    const tp = list.items[0];
    const vt = (await c.post(`/api/v1/shipping/methods/${tp.id}/verify`, {}, w.admin)).body.data;
    expect(vt.method.capabilities).toMatchObject({ label: 'supported', tracking: 'supported', dispatchUpdate: 'supported', statusSync: 'not_supported' });

    // PATCH: default, disable, config (a changed config must be verified again)
    const patched = (await c.patch(`/api/v1/shipping/methods/${manual.id}`, { isDefault: true, config: { defaultCarrier: 'Delhivery' } }, w.admin)).body.data;
    expect(patched).toMatchObject({ isDefault: true, config: { defaultCarrier: 'Delhivery' }, verification: { state: 'unverified' } });
    list = (await c.get('/api/v1/shipping/methods', w.admin)).body.data;
    expect(list.items.filter((i: any) => i.isDefault)).toHaveLength(1); // only one default
    expect((await c.patch(`/api/v1/shipping/methods/${manual.id}`, { active: false }, w.admin)).body.data).toMatchObject({ active: false, isDefault: false, state: 'disabled' });
    expect((await c.patch(`/api/v1/shipping/methods/${manual.id}`, { active: false, isDefault: true }, w.admin)).status).toBe(409);
    expect((await c.patch(`/api/v1/shipping/methods/${manual.id}`, { config: { trackingUrlTemplate: 'http://x/{awb}' } }, w.admin)).status).toBe(400);
    expect((await c.get('/api/v1/shipping/methods', w.admin)).body.data.summary).toBe('3 active methods');

    // a marketplace method whose account connection is not usable cannot be verified; the unknown method is a 404
    expect((await c.post(`/api/v1/shipping/methods/${'0'.repeat(8)}-0000-4000-8000-000000000000/verify`, {}, w.admin)).status).toBe(404);
  });

  it('the legacy /shipping/providers endpoints only deal with third-party providers and keep their shapes', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [5] });
    const seller = await addMethod(w, { kind: 'seller' });
    await addMethod(w, { kind: 'marketplace', channelCode: 'mock', isDefault: true });
    const providers = (await c.get('/api/v1/shipping/providers', w.admin)).body.data;
    expect(providers).toHaveLength(1);
    expect(Object.keys(providers[0]).sort()).toEqual(['config', 'createdAt', 'id', 'isDefault', 'label', 'providerCode', 'status', 'version']);
    expect((await c.patch(`/api/v1/shipping/providers/${seller.id}`, { label: 'x' }, w.admin)).status).toBe(404); // not a third-party provider
    expect((await c.get('/api/v1/shipping/providers/catalog', w.admin)).status).toBe(200);
    // a marketplace method that is the default must not break label creation (the courier default is still the sandbox provider)
    const order = await packedOrder(w);
    const s = await c.post('/api/v1/shipments', { fulfillmentId: order.f.id }, w.admin);
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    expect(s.body.data.providerCode).toBe('sandbox');
  });
});

describe('shipping decision: options, precedence, selection', () => {
  let w: World;
  beforeAll(async () => { w = await buildWorld(t, c, { warehouses: 1, stock: [50] }); });

  it('no method configured -> unavailable with reasons; the third-party provider is the only option', async () => {
    const { f } = await packedOrder(w);
    const o = (await c.get(`/api/v1/shipping/orders/${f.id}/options`, w.admin)).body.data;
    const by = Object.fromEntries(o.options.map((x: any) => [x.kind, x]));
    expect(by.marketplace).toMatchObject({ available: false, reason: 'method_not_configured', managedBy: 'marketplace' });
    expect(by.seller).toMatchObject({ available: false, reason: 'method_not_configured', managedBy: 'merchant' });
    expect(by.third_party).toMatchObject({ available: true, managedBy: 'provider', recommended: true });
    expect(o.recommendation).toMatchObject({ kind: 'third_party', source: 'fallback' });
    expect(o.order).toMatchObject({ weightGrams: 600, itemCount: 1 });
    expect(o.order.marketplace.code).toBe('mock');
    expect(o.status).toBe('needs_decision');
    // an unavailable method is refused (409 method_unavailable)
    const bad = await selectIt(w, f.id, { kind: 'seller', source: 'manual_override' });
    expect(bad.status).toBe(409);
    expect(bad.body.error.details.rule).toBe('method_unavailable');
    expect((await c.get(`/api/v1/shipping/orders/${'0'.repeat(8)}-0000-4000-8000-000000000000/options`, w.admin)).status).toBe(404);
  });

  it('precedence: matching shipping rule > per-marketplace override > default method, and the why text says so', async () => {
    await addMethod(w, { kind: 'seller' });
    await addMethod(w, { kind: 'marketplace', channelCode: 'mock' });
    const { f } = await packedOrder(w, { weightGrams: 800 });
    const rec = async () => (await c.get(`/api/v1/shipping/orders/${f.id}/options`, w.admin)).body.data.recommendation;

    // 1. default method only
    expect((await prefs(w, { defaultMethod: 'seller' })).status).toBe(200);
    expect(await rec()).toMatchObject({ kind: 'seller', source: 'default_preference', why: 'Matches your default shipping preference.', ruleId: null });
    // 2. the override for the marketplace beats the default
    expect((await prefs(w, { defaultMethod: 'seller', overrides: { mock: 'marketplace' } })).status).toBe(200);
    const ov = await rec();
    expect(ov).toMatchObject({ kind: 'marketplace', source: 'channel_override' });
    expect(ov.why).toMatch(/^Matches your default preference for .+ orders\.$/);
    // 3. a matching rule beats the override
    const rule = await c.post('/api/v1/shipping/rules', { name: 'Heavy parcels by courier', conditions: [{ field: 'marketplace', op: 'eq', value: 'mock' }, { field: 'weightGrams', op: 'gt', value: 700 }], then: { prefer: { kind: 'third_party' } } }, w.admin);
    expect(rule.status, JSON.stringify(rule.body)).toBe(201);
    expect(await rec()).toMatchObject({ kind: 'third_party', source: 'rule', ruleId: rule.body.data.id, why: 'Matches your shipping rule "Heavy parcels by courier".' });
    // a rule that does not match (weight below the threshold) is ignored
    await c.patch(`/api/v1/shipping/rules/${rule.body.data.id}`, { conditions: [{ field: 'weightGrams', op: 'gt', value: 900 }] }, w.admin);
    expect(await rec()).toMatchObject({ kind: 'marketplace', source: 'channel_override' });
    // disabling the rule, then enabling it again with a matching threshold
    await c.patch(`/api/v1/shipping/rules/${rule.body.data.id}`, { conditions: [{ field: 'weightGrams', op: 'gt', value: 100 }] }, w.admin);
    expect((await c.post(`/api/v1/shipping/rules/${rule.body.data.id}/disable`, {}, w.admin)).body.data.status).toBe('disabled');
    expect(await rec()).toMatchObject({ source: 'channel_override' });
    expect((await c.post(`/api/v1/shipping/rules/${rule.body.data.id}/enable`, {}, w.admin)).body.data.status).toBe('enabled');
    expect(await rec()).toMatchObject({ source: 'rule' });
    // a rule preferring a method that is not available for the order is skipped (here: disable the seller method and prefer it)
    await c.patch(`/api/v1/shipping/rules/${rule.body.data.id}`, { then: { prefer: { kind: 'seller' } } }, w.admin);
    const sellerId = ((await c.get('/api/v1/shipping/methods', w.admin)).body.data.items as any[]).find((m) => m.kind === 'seller').id;
    await c.patch(`/api/v1/shipping/methods/${sellerId}`, { active: false }, w.admin);
    expect(await rec()).toMatchObject({ kind: 'marketplace', source: 'channel_override' });
    await c.patch(`/api/v1/shipping/methods/${sellerId}`, { active: true }, w.admin);
    expect(await rec()).toMatchObject({ kind: 'seller', source: 'rule' });
    await c.del(`/api/v1/shipping/rules/${rule.body.data.id}`, w.admin);
  });

  it('selection: recorded (rule / preference / manual), idempotent, conflicts, audit + event', async () => {
    await prefs(w, { defaultMethod: 'seller', overrides: {} });
    const { f } = await packedOrder(w);
    const first = await selectIt(w, f.id, { kind: 'seller', source: 'recommended' });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data).toMatchObject({ unchanged: false, status: 'selected', selection: { kind: 'seller', confirmed: true, selectedBy: 'preference' } });
    const again = await selectIt(w, f.id, { kind: 'seller', source: 'recommended' });
    expect(again.body.data.unchanged).toBe(true);
    const row = (await c.get(`/api/v1/fulfillments/${f.id}`, w.admin)).body.data;
    expect(row.status).toBe('packed'); // selection is a decision, not a fulfillment step
    // a manual override to another available method is allowed and recorded as manual
    const manual = await selectIt(w, f.id, { kind: 'third_party', source: 'manual_override' });
    expect(manual.body.data.selection).toMatchObject({ kind: 'third_party', selectedBy: 'manual' });
    // a stale provider id is refused
    expect((await selectIt(w, f.id, { kind: 'third_party', providerId: '0'.repeat(8) + '-0000-4000-8000-000000000000', source: 'manual_override' })).status).toBe(409);
    expect((await selectIt(w, f.id, { kind: 'nope', source: 'manual_override' })).status).toBe(400);
    const ev = (await t.outbox('shipping.method_selected')).filter((e) => e.aggregateId === f.id);
    expect(ev.length).toBe(2); // the idempotent repeat wrote nothing
    expect(ev[1]!.payload).toMatchObject({ kind: 'third_party', selectedBy: 'manual' });
    // after a label exists the method can no longer change
    const lab = await c.post('/api/v1/shipping/orders/bulk', { fulfillmentIds: [f.id], action: 'generate_labels' }, w.admin);
    expect(lab.body.data.results[0]).toMatchObject({ ok: true });
    const locked = await selectIt(w, f.id, { kind: 'seller', source: 'manual_override' });
    expect(locked.status).toBe(409);
    expect(locked.body.error.details.rule).toBe('label_already_created');
    // not a packed fulfillment -> 409
    const fresh = await orderArrives(t, c, w, 1);
    const f2 = (await c.post(`/api/v1/orders/${fresh.id}/fulfillment`, {}, w.admin)).body.data.fulfillments[0];
    expect((await selectIt(w, f2.id, { kind: 'seller', source: 'manual_override' })).status).toBe(409);
  });
});

describe('orders to ship: list, filters, SLA, bulk, export', () => {
  it('lists decisions with derived status, SLA bands (from vendor settings), filters, counts and an export', async () => {
    const w = await buildWorld(t, c, { warehouses: 2, stock: [30, 30] });
    await addMethod(w, { kind: 'seller' });
    await prefs(w, { defaultMethod: 'seller' });
    const risk = await packedOrder(w, { dueInMinutes: 60 });       // <= 90: at risk
    const approaching = await packedOrder(w, { dueInMinutes: 200 }); // <= 240: approaching
    const safe = await packedOrder(w, { dueInMinutes: 900 });
    const breached = await packedOrder(w, { dueInMinutes: -15 });
    const noDue = await packedOrder(w, { dueInMinutes: null });

    const all = await orders(w);
    expect(all.total).toBe(5);
    expect(all.counts).toMatchObject({ readyToShip: 5, needs_decision: 5, selected: 0, label_pending: 0, ready_to_dispatch: 0, exception: 0 });
    // ordered by deadline: breached, at risk, approaching, safe, none
    expect(all.items.map((i: any) => i.sla.band)).toEqual(['breached', 'at_risk', 'approaching', 'safe', 'none']);
    const first = all.items[1];
    expect(first).toMatchObject({ fulfillmentId: risk.f.id, orderId: risk.order.id, status: 'needs_decision', selectionConfirmed: false, selectedMethod: null, itemCount: 1, weightGrams: 600, action: { key: 'choose' } });
    expect(first.channel.code).toBe('mock');
    expect(first.warehouse.code).toBe('MAIN');
    expect(first.destination).toEqual({ city: expect.any(String), state: expect.any(String) });
    expect(first.recommendedMethod).toMatchObject({ kind: 'seller', source: 'default_preference' });
    expect(first.availableMethods.find((m: any) => m.kind === 'seller')).toMatchObject({ available: true });
    expect(first.availableMethods.find((m: any) => m.kind === 'marketplace')).toMatchObject({ available: false, reason: 'method_not_configured' });
    expect(first.sla.minutesRemaining).toBeGreaterThan(55);
    expect(first.sla.minutesRemaining).toBeLessThanOrEqual(60);

    // the SLA thresholds come from the business settings: widen "at risk" to 5 h and everything but the far/unset deadlines is at risk
    expect((await c.patch('/api/v1/vendor/settings', { sla: { atRiskMinutes: 300, approachingMinutes: 600 } }, w.admin)).status).toBe(200);
    expect((await orders(w)).items.map((i: any) => i.sla.band)).toEqual(['breached', 'at_risk', 'at_risk', 'safe', 'none']);
    expect((await c.patch('/api/v1/vendor/settings', { sla: { atRiskMinutes: 90, approachingMinutes: 240 } }, w.admin)).status).toBe(200);

    // filters
    expect((await orders(w, '?filter[sla]=at_risk')).items.map((i: any) => i.orderId)).toEqual([risk.order.id]);
    expect((await orders(w, '?filter[sla]=breached')).items.map((i: any) => i.orderId)).toEqual([breached.order.id]);
    expect((await orders(w, '?filter[sla]=none')).items.map((i: any) => i.orderId)).toEqual([noDue.order.id]);
    expect((await orders(w, '?filter[sla]=safe')).total).toBe(1);
    expect((await orders(w, '?filter[sla]=approaching')).items[0].fulfillmentId).toBe(approaching.f.id);
    expect((await orders(w, `?q=${encodeURIComponent(safe.order.orderNumber)}`)).items.map((i: any) => i.orderId)).toEqual([safe.order.id]);
    expect((await orders(w, `?q=${encodeURIComponent(w.variant.sku)}`)).total).toBe(5); // search by SKU
    expect((await orders(w, '?filter[marketplace]=flipkart')).total).toBe(0);
    expect((await orders(w, `?filter[warehouse]=${w.warehouses[1]!.id}`)).total).toBe(0);
    expect((await orders(w, `?filter[warehouse]=${w.warehouses[0]!.id}`)).total).toBe(5);
    expect((await orders(w, '?filter[method]=unassigned')).total).toBe(5);
    expect((await c.get('/api/v1/shipping/orders?filter[sla]=bogus', w.admin)).status).toBe(400);

    // paging with a separate count
    const p2 = await orders(w, '?pageSize=2&page=2');
    expect(p2).toMatchObject({ page: 2, pageSize: 2, total: 5, pages: 3 });
    expect(p2.items).toHaveLength(2);

    // confirm one: the status, filters and counts follow
    expect((await selectIt(w, risk.f.id, { kind: 'seller', source: 'recommended' })).status).toBe(200);
    const sel = await orders(w);
    expect(sel.counts).toMatchObject({ readyToShip: 5, needs_decision: 4, selected: 1 });
    expect((await orders(w, '?filter[status]=selected')).items).toMatchObject([{ fulfillmentId: risk.f.id, status: 'selected', selectionConfirmed: true, selectedBy: 'preference', selectedMethod: { kind: 'seller', name: 'Seller Shipping' }, action: { key: 'review' } }]);
    expect((await orders(w, '?filter[method]=seller')).total).toBe(1);
    expect((await orders(w, '?filter[status]=needs_decision')).total).toBe(4);
    // a label turns it into ready_to_dispatch
    const lab = await c.post('/api/v1/shipping/orders/bulk', { fulfillmentIds: [risk.f.id], action: 'generate_labels' }, w.admin);
    expect(lab.body.data).toMatchObject({ requested: 1, succeeded: 1, failed: 0 });
    const dispatchable = (await orders(w, '?filter[status]=ready_to_dispatch')).items[0];
    expect(dispatchable).toMatchObject({ fulfillmentId: risk.f.id, action: { key: 'dispatch', method: 'POST' } });
    expect(dispatchable.action.href).toBe(`/api/v1/shipments/${dispatchable.shipmentId}/dispatch`);
    // dispatched orders leave the list
    expect((await c.post(`/api/v1/shipments/${dispatchable.shipmentId}/dispatch`, {}, w.admin)).status).toBe(200);
    expect((await orders(w)).total).toBe(4);

    // export: CSV with the same filters, formula-safe
    const exp = await c.get('/api/v1/shipping/orders/export?filter[sla]=breached', w.admin);
    expect(exp.status).toBe(200);
    expect(String(exp.headers['content-type'])).toContain('text/csv');
    expect(String(exp.headers['content-disposition'])).toContain('attachment');
    const lines = String(exp.raw.body).trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(breached.order.orderNumber);
    expect(lines[1]).toContain('breached');
    expect(await t.outbox()).toBeTruthy();
    void safe;
  });

  it('bulk: assign a method, labels only where supported, recalculate; per-order results', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [30] });
    await addMethod(w, { kind: 'seller' });
    await addMethod(w, { kind: 'marketplace', channelCode: 'mock' });
    const a = await packedOrder(w);
    const b = await packedOrder(w);
    const ghost = '0'.repeat(8) + '-0000-4000-8000-000000000000';
    // validation
    expect((await c.post('/api/v1/shipping/orders/bulk', { action: 'assign_method', fulfillmentIds: [a.f.id] }, w.admin)).status).toBe(400); // params.kind required
    expect((await c.post('/api/v1/shipping/orders/bulk', { action: 'recalculate' }, w.admin)).status).toBe(400); // no selection
    expect((await c.post('/api/v1/shipping/orders/bulk', { action: 'recalculate', fulfillmentIds: Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) }, w.admin)).status).toBe(400); // max 200

    const assign = (await c.post('/api/v1/shipping/orders/bulk', { action: 'assign_method', selection: { fulfillmentIds: [a.f.id, ghost] }, params: { kind: 'seller' } }, w.admin)).body.data;
    expect(assign).toMatchObject({ requested: 2, succeeded: 1, failed: 1 });
    expect(assign.results[0]).toMatchObject({ fulfillmentId: a.f.id, ok: true, number: a.order.orderNumber });
    expect(assign.results[1]).toMatchObject({ fulfillmentId: ghost, ok: false, code: 'not_found' });
    // assigning a method that is not available is reported per order
    const none = (await c.post('/api/v1/shipping/orders/bulk', { action: 'assign_method', fulfillmentIds: [b.f.id], params: { kind: 'third_party' } }, w.admin)).body.data;
    expect(none.results[0]).toMatchObject({ ok: true }); // the sandbox provider from buildWorld is a third-party method
    await c.patch(`/api/v1/shipping/methods/${((await c.get('/api/v1/shipping/methods', w.admin)).body.data.items as any[]).find((m) => m.kind === 'third_party').id}`, { active: false }, w.admin);
    const unavailable = (await c.post('/api/v1/shipping/orders/bulk', { action: 'assign_method', fulfillmentIds: [a.f.id], params: { kind: 'third_party' } }, w.admin)).body.data;
    expect(unavailable.results[0]).toMatchObject({ ok: false, code: 'method_unavailable' });

    // labels: seller -> yes; marketplace (the marketplace issues its own labels) -> marketplace_label_pending; nothing selected -> no_method_selected
    expect((await selectIt(w, b.f.id, { kind: 'marketplace', source: 'manual_override' })).status).toBe(200);
    const c3 = await packedOrder(w);
    const labels = (await c.post('/api/v1/shipping/orders/bulk', { action: 'generate_labels', fulfillmentIds: [a.f.id, b.f.id, c3.f.id] }, w.admin)).body.data;
    expect(labels).toMatchObject({ requested: 3, succeeded: 1, failed: 2 });
    expect(labels.results[0]).toMatchObject({ ok: true, shipmentId: expect.any(String), awb: expect.any(String) });
    expect(labels.results[1]).toMatchObject({ ok: false, code: 'marketplace_label_pending' });
    expect(labels.results[2]).toMatchObject({ ok: false, code: 'no_method_selected' });
    const ship = (await c.get(`/api/v1/shipments/${labels.results[0].shipmentId}`, w.admin)).body.data;
    expect(ship).toMatchObject({ providerCode: 'manual', status: 'label_ready', fulfillmentId: a.f.id }); // seller shipping is carried out with the manual provider
    // repeating is harmless
    expect((await c.post('/api/v1/shipping/orders/bulk', { action: 'generate_labels', fulfillmentIds: [a.f.id] }, w.admin)).body.data.results[0]).toMatchObject({ ok: true, shipmentId: ship.id });

    // recalculate: stores a fresh recommendation without touching the confirmed selection
    await prefs(w, { defaultMethod: 'marketplace' });
    const rec = (await c.post('/api/v1/shipping/orders/bulk', { action: 'recalculate', fulfillmentIds: [c3.f.id, b.f.id] }, w.admin)).body.data;
    expect(rec).toMatchObject({ succeeded: 2 });
    expect(rec.results[0].recommendation).toMatchObject({ kind: 'marketplace' });
    expect((await c.get(`/api/v1/shipping/orders/${b.f.id}/options`, w.admin)).body.data.selection).toMatchObject({ kind: 'marketplace', confirmed: true });
  });
});

describe('overview, snapshots and "since last sync"', () => {
  it('builds the status line, pulse, decision field, availability comparison and attention parts; deltas come from snapshots', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [40] });
    const seller = await addMethod(w, { kind: 'seller' });
    await addMethod(w, { kind: 'marketplace', channelCode: 'mock' });
    await prefs(w, { defaultMethod: 'seller', overrides: {} });
    const empty = (await c.get('/api/v1/shipping/overview', w.admin)).body.data;
    expect(empty.statusLine).toEqual({ connectedChannels: 1, activeMethods: 3, ordersNeedAttention: 0 });
    expect(empty.pulse.readyToShip).toMatchObject({ count: 0, sinceLastSync: null, needDecision: 0 }); // no snapshot yet: null deltas
    expect(empty.decisionField).toEqual([]);
    expect(empty.baseline).toBeNull();

    const o1 = await packedOrder(w, { dueInMinutes: 30 });  // undecided + SLA risk
    const o2 = await packedOrder(w, { dueInMinutes: 800 }); // selected seller
    const o3 = await packedOrder(w, { dueInMinutes: 800 }); // selected marketplace
    const o4 = await packedOrder(w, { dueInMinutes: 800 }); // labelled seller
    await selectIt(w, o2.f.id, { kind: 'seller', source: 'recommended' });
    await selectIt(w, o3.f.id, { kind: 'marketplace', source: 'manual_override' });
    await selectIt(w, o4.f.id, { kind: 'seller', source: 'recommended' });
    expect((await c.post('/api/v1/shipping/orders/bulk', { action: 'generate_labels', fulfillmentIds: [o4.f.id] }, w.admin)).body.data.succeeded).toBe(1);

    const ov = (await c.get('/api/v1/shipping/overview', w.admin)).body.data;
    expect(ov.pulse.readyToShip).toMatchObject({ count: 4, needDecision: 1, sinceLastSync: null });
    expect(ov.pulse.shippingSelected).toMatchObject({ count: 3, note: 'preference_confirmed' });
    expect(ov.pulse.labelReady).toMatchObject({ count: 1, labelUnavailable: 0 });
    expect(ov.pulse.dispatched.count).toBe(0);
    expect(ov.decisionField).toHaveLength(4);
    expect(ov.decisionField[0]).toMatchObject({ order: { id: o1.order.id, number: o1.order.orderNumber }, selected: null, merchantPreference: { kind: 'seller', why: 'default' }, itemCount: 1, weightGrams: 600 });
    expect(ov.decisionField[0].availableMethods).toHaveLength(3);
    // attention: only o1 (undecided + at risk)
    expect(ov.attention.parts).toMatchObject({ undecided: 1, label: 0, tracking: 0, sync: 0, slaRisk: 1 });
    expect(ov.attention.total).toBe(ov.statusLine.ordersNeedAttention);
    expect(ov.attention.total).toBe(1);
    // comparison rows: one channel x (marketplace, seller, third party)
    const cmp = ov.availabilityComparison;
    expect(cmp.filter((x: any) => x.channel.code === 'mock').map((x: any) => x.method).sort()).toEqual(['marketplace', 'seller', 'third_party']);
    expect(cmp.find((x: any) => x.method === 'seller')).toMatchObject({ availability: 'requires_configuration', default: 'preferred', override: 'verify_capability' });
    await c.post(`/api/v1/shipping/methods/${seller.id}/verify`, {}, w.admin);
    expect((await c.get('/api/v1/shipping/overview', w.admin)).body.data.availabilityComparison.find((x: any) => x.method === 'seller')).toMatchObject({ availability: 'ready', override: 'where_supported' });
    expect((await c.get('/api/v1/shipping/overview?asOf=nonsense', w.admin)).status).toBe(400);
    expect((await c.get('/api/v1/shipping/overview?asOf=2026-10-05', w.admin)).status).toBe(200);

    // the snapshot job: one per active vendor, skipped when a recent one exists
    const job = allModules.flatMap((m) => m.jobs ?? []).find((j) => j.queue === 'maintenance' && j.name === 'shipping.snapshot')!;
    expect(job).toBeTruthy();
    const snaps = async () => {
      const pg = t.database!.pg;
      await pg.exec('RESET ROLE');
      try { return (await pg.query<{ counts: Record<string, number> }>(`SELECT counts FROM shipping_snapshots WHERE vendor_id = '${w.admin.vendorId}' ORDER BY taken_at`)).rows; } finally { await pg.exec('SET ROLE oms_app'); }
    };
    await job.handle({} as never, t.container, { attemptsMade: 0 });
    await job.handle({} as never, t.container, { attemptsMade: 0 });
    const rows = await snaps();
    expect(rows).toHaveLength(1); // the second run saw a snapshot younger than 50 minutes
    expect(rows[0]!.counts).toMatchObject({ readyToShip: 4, needDecision: 1, shippingSelected: 3, labelReady: 1, labelUnavailable: 0 });
    // a snapshot younger than 30 minutes is not a baseline
    expect((await c.get('/api/v1/shipping/overview', w.admin)).body.data.pulse.readyToShip.sinceLastSync).toBeNull();
    await sqlAdmin(`UPDATE shipping_snapshots SET taken_at = now() - interval '40 minutes' WHERE vendor_id = '${w.admin.vendorId}'`);
    expect((await c.get('/api/v1/shipping/overview', w.admin)).body.data.pulse.readyToShip.sinceLastSync).toBe(0);
    // more orders are ready: the delta shows it
    const o5 = await packedOrder(w);
    await selectIt(w, o5.f.id, { kind: 'seller', source: 'recommended' });
    const after = (await c.get('/api/v1/shipping/overview', w.admin)).body.data;
    expect(after.baseline).toBeTruthy();
    expect(after.pulse.readyToShip).toMatchObject({ count: 5, sinceLastSync: 1, needDecision: 1 });
    expect(after.pulse.shippingSelected).toMatchObject({ count: 4, sinceLastSync: 1 });
    expect(after.pulse.labelReady.sinceLastSync).toBe(0);
    // dispatching moves orders from "label ready" to "dispatched"
    const sh = (await c.get(`/api/v1/orders/${o4.order.id}/shipments`, w.admin)).body.data[0];
    await c.post(`/api/v1/shipments/${sh.id}/dispatch`, {}, w.admin);
    const d = (await c.get('/api/v1/shipping/overview', w.admin)).body.data.pulse;
    expect(d.dispatched).toMatchObject({ count: 1, sinceLastSync: 1 });
    expect(d.readyToShip.count).toBe(4);
    expect(d.labelReady.sinceLastSync).toBe(-1);
    // a job that finds a vendor in trouble does not stop the others: the job is bounded and never throws
    await expect(job.handle({} as never, t.container, { attemptsMade: 0 })).resolves.toBeUndefined();
  });
});

describe('tracking: derived statuses, failures, bulk sync', () => {
  it('derives awaiting first scan / in transit / delayed / sync failed / delivered and retries', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [20] });
    const tp = ((await c.get('/api/v1/shipping/methods', w.admin)).body.data.items as any[])[0];
    const o = await packedOrder(w);
    expect((await selectIt(w, o.f.id, { kind: 'third_party', source: 'manual_override' })).status).toBe(200);
    const lab = (await c.post('/api/v1/shipping/orders/bulk', { action: 'generate_labels', fulfillmentIds: [o.f.id] }, w.admin)).body.data;
    expect(lab.succeeded, JSON.stringify(lab)).toBe(1);
    const shipmentId = lab.results[0].shipmentId as string;
    expect((await c.get('/api/v1/shipping/tracking', w.admin)).body.data.total).toBe(0); // not dispatched yet
    expect((await c.post(`/api/v1/shipments/${shipmentId}/dispatch`, {}, w.admin)).status).toBe(200);

    const rowOf = async (qs = '') => { const r = (await c.get(`/api/v1/shipping/tracking${qs}`, w.admin)).body.data; return { r, row: r.items[0] }; };
    let { r, row } = await rowOf();
    expect(r).toMatchObject({ total: 1, counters: { stages: { dispatched: 1, inTransit: 0, delivered: 0 } } });
    expect(row).toMatchObject({ shipmentId, orderId: o.order.id, number: o.order.orderNumber, status: 'tracking_active', attention: 'none', method: { kind: 'third_party', providerCode: 'sandbox' }, shipmentStatus: 'dispatched' });
    expect(row.awb).toMatch(/^SBX/);
    expect(row.dispatchedAt).toBeTruthy();

    // dispatched 13 h ago and no scan since -> awaiting first scan (default threshold 12 h)
    await sqlAdmin(`UPDATE shipments SET dispatched_at = now() - interval '13 hours' WHERE id = '${shipmentId}'`);
    ({ row } = await rowOf());
    expect(row).toMatchObject({ status: 'awaiting_first_scan', attention: 'check_first_scan' });
    // the threshold is a business setting
    expect((await c.patch('/api/v1/vendor/settings', { shipping: { awaitingFirstScanHours: 24 } }, w.admin)).status).toBe(200);
    expect((await rowOf()).row.status).toBe('tracking_active');
    expect((await c.patch('/api/v1/vendor/settings', { shipping: { awaitingFirstScanHours: 12 } }, w.admin)).status).toBe(200);
    let exc = (await c.get('/api/v1/shipping/exceptions', w.admin)).body.data;
    expect(exc.categories.find((x: any) => x.key === 'tracking_not_received').count).toBe(1);

    await simulate(t, c, w, shipmentId, 'in_transit');
    ({ r, row } = await rowOf());
    expect(row).toMatchObject({ status: 'in_transit', attention: 'none' });
    expect(r.counters.stages).toMatchObject({ dispatched: 0, inTransit: 1 });

    // past the estimated delivery -> delayed
    await sqlAdmin(`UPDATE shipments SET estimated_delivery_at = now() - interval '2 hours' WHERE id = '${shipmentId}'`);
    ({ row } = await rowOf());
    expect(row).toMatchObject({ status: 'delivery_delayed', attention: 'review_update' });
    expect((await rowOf('?filter[status]=delivery_delayed')).r.total).toBe(1);
    expect((await rowOf('?filter[status]=in_transit')).r.total).toBe(0);
    expect((await rowOf(`?q=${row.awb}`)).r.total).toBe(1);
    expect((await rowOf('?filter[method]=manual')).r.total).toBe(0);
    expect((await rowOf('?filter[marketplace]=mock')).r.total).toBe(1);

    // the provider fails: the failure is recorded, shown, and retried
    await c.patch(`/api/v1/shipping/providers/${tp.id}`, { config: { fail: 'track' } }, w.admin);
    expect((await c.post(`/api/v1/shipments/${shipmentId}/refresh-tracking`, {}, w.admin)).status).toBe(502);
    ({ row } = await rowOf());
    expect(row).toMatchObject({ status: 'tracking_sync_failed', attention: 'retry_required' });
    const fails = (await c.get('/api/v1/shipping/tracking/failures', w.admin)).body.data;
    expect(fails).toHaveLength(1);
    expect(fails[0]).toMatchObject({ shipmentId, orderNumber: o.order.orderNumber, action: { key: 'retry', method: 'POST', href: `/api/v1/shipments/${shipmentId}/refresh-tracking` } });
    expect(fails[0].failedAt).toBeTruthy();
    exc = (await c.get('/api/v1/shipping/exceptions', w.admin)).body.data;
    expect(exc.categories.find((x: any) => x.key === 'shipping_sync_failed')).toMatchObject({ count: 1, orders: [{ number: o.order.orderNumber }] });
    // bulk sync: still failing -> reported, not thrown
    const stillFailing = await c.post('/api/v1/shipping/tracking/sync', {}, w.admin);
    expect(stillFailing.status).toBe(202);
    expect(stillFailing.body.data).toMatchObject({ processed: 1, updated: 0, failed: 1 });
    // fixed -> the next sync clears the failure
    await c.patch(`/api/v1/shipping/providers/${tp.id}`, { config: {} }, w.admin);
    const synced = await c.post('/api/v1/shipping/tracking/sync', { shipmentIds: [shipmentId] }, w.admin);
    expect(synced.body.data).toMatchObject({ processed: 1, failed: 0 });
    expect((await rowOf()).row.status).toBe('delivery_delayed');
    expect((await c.get('/api/v1/shipping/tracking/failures', w.admin)).body.data).toEqual([]);

    // delivered
    await simulate(t, c, w, shipmentId, 'delivered');
    ({ r, row } = await rowOf());
    expect(row).toMatchObject({ status: 'delivered', attention: 'completed' });
    expect(r.counters).toMatchObject({ stages: { dispatched: 0, inTransit: 0, delivered: 1 }, byStatus: { delivered: 1 } });
    expect((await c.get('/api/v1/shipping/tracking?filter[status]=bogus', w.admin)).status).toBe(400);
  });

  it('Sync Shipping verifies the methods and refreshes tracking, returning counts (202)', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [10] });
    await addMethod(w, { kind: 'seller' });
    const o = await packedOrder(w);
    await selectIt(w, o.f.id, { kind: 'third_party', source: 'manual_override' });
    const shipmentId = (await c.post('/api/v1/shipping/orders/bulk', { action: 'generate_labels', fulfillmentIds: [o.f.id] }, w.admin)).body.data.results[0].shipmentId;
    await c.post(`/api/v1/shipments/${shipmentId}/dispatch`, {}, w.admin);
    const sync = await c.post('/api/v1/shipping/sync', {}, w.admin);
    expect(sync.status, JSON.stringify(sync.body)).toBe(202);
    expect(sync.body.data).toMatchObject({ methods: { checked: 2, verified: 2, notVerified: 0 }, tracking: { processed: 1, failed: 0 }, requireAttention: 0 });
    expect(sync.body.data.processed).toBeGreaterThanOrEqual(1);
    const methods = (await c.get('/api/v1/shipping/methods', w.admin)).body.data.items as any[];
    expect(methods.every((m) => m.state === 'configured')).toBe(true);
    expect(sync.body.data.completedAt).toBeTruthy();
  });
});

describe('exceptions: six categories with what / why / what to do', () => {
  it('counts affected orders per category and exports them', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [30] });
    const seller = await addMethod(w, { kind: 'seller' });
    await addMethod(w, { kind: 'marketplace', channelCode: 'mock' });
    const undecided = await packedOrder(w, { dueInMinutes: 60 });
    const noLabel = await packedOrder(w, { dueInMinutes: 800 });
    const courier = await packedOrder(w, { dueInMinutes: null });
    const late = await packedOrder(w, { dueInMinutes: -5 });
    await selectIt(w, noLabel.f.id, { kind: 'seller', source: 'manual_override' });
    await selectIt(w, courier.f.id, { kind: 'third_party', source: 'manual_override' });
    await selectIt(w, late.f.id, { kind: 'marketplace', source: 'manual_override' });
    await c.patch(`/api/v1/shipping/methods/${seller.id}`, { active: false }, w.admin); // the method chosen for noLabel is gone: nothing can produce its label

    const res = await c.get('/api/v1/shipping/exceptions', w.admin);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = res.body.data;
    const cat = (k: string) => d.categories.find((x: any) => x.key === k);
    expect(d.categories.map((x: any) => x.key)).toEqual(['no_method_selected', 'label_unavailable', 'tracking_not_received', 'shipping_sync_failed', 'sla_risk', 'connector_capability_limit']);
    expect(cat('no_method_selected')).toMatchObject({ count: 1, orders: [{ orderId: undecided.order.id, number: undecided.order.orderNumber, fulfillmentId: undecided.f.id }], action: { key: 'choose_shipping' } });
    expect(cat('no_method_selected').whatHappened).toBeTruthy();
    expect(cat('no_method_selected').why).toBeTruthy();
    expect(cat('no_method_selected').whatCanIDoNow).toBeTruthy();
    expect(cat('no_method_selected').action.href).toBe(`/api/v1/shipping/orders/${undecided.f.id}/options`);
    expect(cat('label_unavailable')).toMatchObject({ count: 1, orders: [{ orderId: noLabel.order.id }] });
    expect(cat('tracking_not_received').count).toBe(0);
    expect(cat('shipping_sync_failed').count).toBe(0);
    expect(cat('sla_risk').count).toBe(2);
    expect(cat('sla_risk').orders.map((x: any) => x.orderId).sort()).toEqual([late.order.id, undecided.order.id].sort());
    const limit = cat('connector_capability_limit');
    expect(limit.count).toBeGreaterThanOrEqual(1); // the sandbox courier cannot be polled for status
    expect(limit.orders.map((x: any) => x.orderId)).toContain(courier.order.id);
    expect(d.totalOrders).toBeGreaterThanOrEqual(4);
    expect(d.categoryCount).toBe(4);

    // one category, paged
    const one = (await c.get('/api/v1/shipping/exceptions?category=sla_risk&pageSize=1&page=2', w.admin)).body.data;
    expect(one.categories).toHaveLength(1);
    expect(one).toMatchObject({ total: 2, page: 2, pageSize: 1, pages: 2 });
    expect(one.categories[0].orders).toHaveLength(1);
    expect((await c.get('/api/v1/shipping/exceptions?category=nonsense', w.admin)).status).toBe(400);

    // the overview agrees
    const ov = (await c.get('/api/v1/shipping/overview', w.admin)).body.data;
    expect(ov.attention.parts).toMatchObject({ undecided: 1, label: 1, slaRisk: 2, capability: limit.count });
    expect(ov.attention.total).toBe(d.totalOrders);

    // an order that gets decided drops out of "no method selected"
    await selectIt(w, undecided.f.id, { kind: 'marketplace', source: 'manual_override' });
    expect((await c.get('/api/v1/shipping/exceptions', w.admin)).body.data.categories.find((x: any) => x.key === 'no_method_selected').count).toBe(0);

    const csv = await c.get('/api/v1/shipping/exceptions/export', w.admin);
    expect(csv.status).toBe(200);
    expect(String(csv.headers['content-type'])).toContain('text/csv');
    const lines = String(csv.raw.body).trim().split('\r\n');
    expect(lines[0]).toBe('Category,Order,Marketplace,Detail,What happened,What can I do now');
    expect(lines.some((l) => l.startsWith('SLA risk,') && l.includes(late.order.orderNumber))).toBe(true);
    expect(lines.some((l) => l.startsWith('Label unavailable,'))).toBe(true);
  });

  it('a selected method that was removed shows as a decision exception and label_unavailable', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [10] });
    const seller = await addMethod(w, { kind: 'seller' });
    const o = await packedOrder(w);
    await selectIt(w, o.f.id, { kind: 'seller', source: 'manual_override' });
    await c.patch(`/api/v1/shipping/methods/${seller.id}`, { active: false }, w.admin);
    const item = (await orders(w)).items[0];
    expect(item).toMatchObject({ status: 'exception', action: { key: 'resolve' }, selectionConfirmed: true });
    const exc = (await c.get('/api/v1/shipping/exceptions', w.admin)).body.data.categories;
    expect(exc.find((x: any) => x.key === 'label_unavailable').count).toBe(1);
    expect((await orders(w, '?filter[status]=exception')).total).toBe(1);
  });
});

describe('shipping rules: CRUD, validation, ordering, ordersAffected', () => {
  it('creates, validates, duplicates, re-orders, enables/disables and counts affected orders', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [20] });
    await addMethod(w, { kind: 'seller' });
    await packedOrder(w, { weightGrams: 500 });
    await packedOrder(w, { weightGrams: 1500 });

    const body = (over: Record<string, unknown> = {}) => ({ name: 'Mumbai preference', conditions: [{ field: 'marketplace', op: 'eq', value: 'mock' }, { field: 'warehouseCode', op: 'eq', value: 'x' }], then: { prefer: { kind: 'seller' } }, ...over });
    // validation: unknown field, bad operator for the type, threshold must be a real number, needs a condition, bad kind/provider, whitelisted operators only
    expect((await c.post('/api/v1/shipping/rules', body(), w.admin)).status).toBe(400);
    expect((await c.post('/api/v1/shipping/rules', body({ conditions: [{ field: 'weightGrams', op: 'contains', value: 5 }] }), w.admin)).status).toBe(400);
    expect((await c.post('/api/v1/shipping/rules', body({ conditions: [{ field: 'weightGrams', op: 'gt', value: 'Configured threshold' }] }), w.admin)).status).toBe(400);
    expect((await c.post('/api/v1/shipping/rules', body({ conditions: [{ field: 'weightGrams', op: 'between', value: [1, 2] }] }), w.admin)).status).toBe(400);
    expect((await c.post('/api/v1/shipping/rules', body({ conditions: [] }), w.admin)).status).toBe(400);
    expect((await c.post('/api/v1/shipping/rules', body({ conditions: [{ field: 'weightGrams', op: 'gt', value: 1 }], then: { prefer: { kind: 'courier' } } }), w.admin)).status).toBe(400);
    expect((await c.post('/api/v1/shipping/rules', body({ conditions: [{ field: 'weightGrams', op: 'gt', value: 1 }], then: { prefer: { kind: 'seller', providerId: '0'.repeat(8) + '-0000-4000-8000-000000000000' } } }), w.admin)).status).toBe(400);

    const heavy = (await c.post('/api/v1/shipping/rules', { name: 'Heavy', conditions: [{ field: 'marketplace', op: 'eq', value: 'mock' }, { field: 'weightGrams', op: 'gt', value: 1000 }], then: { prefer: { kind: 'seller' } } }, w.admin)).body.data;
    expect(heavy).toMatchObject({ name: 'Heavy', status: 'enabled', priority: 1, ordersAffected: 1, then: { prefer: { kind: 'seller', providerId: null, label: 'Seller Shipping' } } });
    expect(heavy.conditions).toEqual([{ combinator: 'if', field: 'marketplace', op: 'eq', value: 'mock' }, { combinator: 'and', field: 'weightGrams', op: 'gt', value: 1000 }]);
    const light = (await c.post('/api/v1/shipping/rules', { name: 'Light', enabled: false, conditions: [{ field: 'weightGrams', op: 'lt', value: 1000 }], then: { prefer: { kind: 'third_party' } } }, w.admin)).body.data;
    expect(light).toMatchObject({ priority: 2, status: 'disabled', ordersAffected: 1 });
    const none = (await c.post('/api/v1/shipping/rules', { name: 'Elsewhere', conditions: [{ field: 'destinationState', op: 'eq', value: 'ZZ' }], then: { prefer: { kind: 'seller' } } }, w.admin)).body.data;
    expect(none).toMatchObject({ priority: 3, ordersAffected: 0 });
    const amount = (await c.post('/api/v1/shipping/rules', { name: 'Big baskets', conditions: [{ field: 'orderValueMinor', op: 'gte', value: 1 }, { field: 'sku', op: 'in', value: [w.variant.sku] }], then: { prefer: { kind: 'seller' } } }, w.admin));
    expect(amount.status, JSON.stringify(amount.body)).toBe(201);
    expect(amount.body.data.ordersAffected).toBe(2);

    // list: ordered by priority, with the editor metadata
    let list = (await c.get('/api/v1/shipping/rules', w.admin)).body.data;
    expect(list.items.map((x: any) => [x.name, x.priority, x.status])).toEqual([['Heavy', 1, 'enabled'], ['Light', 2, 'disabled'], ['Elsewhere', 3, 'enabled'], ['Big baskets', 4, 'enabled']]);
    expect(list).toMatchObject({ total: 4, max: 100 });
    expect(list.operators).toEqual(['eq', 'ne', 'contains', 'gt', 'gte', 'lt', 'lte', 'in']);
    expect(list.fields).toContain('orderValueMinor');
    expect(list.items[0].lastUpdatedAt).toBeTruthy();

    // duplicate: disabled copy at the end; update; enable / disable
    const copy = (await c.post(`/api/v1/shipping/rules/${heavy.id}/duplicate`, {}, w.admin)).body.data;
    expect(copy).toMatchObject({ name: 'Heavy (copy)', status: 'disabled', priority: 5 });
    const upd = (await c.patch(`/api/v1/shipping/rules/${copy.id}`, { name: 'Very heavy', conditions: [{ field: 'weightGrams', op: 'gt', value: 5000 }] }, w.admin)).body.data;
    expect(upd).toMatchObject({ name: 'Very heavy', ordersAffected: 0 }); // the cache is refreshed when a rule changes
    expect((await c.patch(`/api/v1/shipping/rules/${copy.id}`, { conditions: [{ field: 'weightGrams', op: 'gt', value: 'x' }] }, w.admin)).status).toBe(400);
    expect((await c.post(`/api/v1/shipping/rules/${copy.id}/enable`, {}, w.admin)).body.data.status).toBe('enabled');
    expect((await c.post(`/api/v1/shipping/rules/${copy.id}/disable`, {}, w.admin)).body.data.status).toBe('disabled');

    // re-order: every rule exactly once
    const ids = list.items.map((x: any) => x.id);
    const reversed = [copy.id, ...[...ids].reverse()];
    const re = (await c.put('/api/v1/shipping/rules/order', { ids: reversed }, w.admin)).body.data;
    expect(re.items.map((x: any) => x.id)).toEqual(reversed);
    expect(re.items.map((x: any) => x.priority)).toEqual([1, 2, 3, 4, 5]);
    expect((await c.put('/api/v1/shipping/rules/order', { ids: ids }, w.admin)).status).toBe(400); // copy is missing
    expect((await c.put('/api/v1/shipping/rules/order', { ids: [...reversed.slice(1), reversed[1]] }, w.admin)).status).toBe(400); // duplicate / missing
    // the order drives which rule wins: Heavy (seller) vs a conflicting first rule
    const conflict = (await c.post('/api/v1/shipping/rules', { name: 'Everything by courier', conditions: [{ field: 'marketplace', op: 'eq', value: 'mock' }], then: { prefer: { kind: 'third_party' } } }, w.admin)).body.data;
    const heavyOrder = (await orders(w)).items.find((i: any) => i.weightGrams === 1500);
    const recOf = async () => (await c.get(`/api/v1/shipping/orders/${heavyOrder.fulfillmentId}/options`, w.admin)).body.data.recommendation;
    await c.put('/api/v1/shipping/rules/order', { ids: [heavy.id, conflict.id, ...reversed.filter((i: string) => i !== heavy.id)] }, w.admin);
    expect(await recOf()).toMatchObject({ kind: 'seller', ruleId: heavy.id });
    await c.put('/api/v1/shipping/rules/order', { ids: [conflict.id, heavy.id, ...reversed.filter((i: string) => i !== heavy.id)] }, w.admin);
    expect(await recOf()).toMatchObject({ kind: 'third_party', ruleId: conflict.id });

    // delete closes the gap
    expect((await c.del(`/api/v1/shipping/rules/${conflict.id}`, w.admin)).status).toBe(200);
    list = (await c.get('/api/v1/shipping/rules', w.admin)).body.data;
    expect(list.items.map((x: any) => x.priority)).toEqual([1, 2, 3, 4, 5]);
    expect((await c.del(`/api/v1/shipping/rules/${conflict.id}`, w.admin)).status).toBe(404);

    // the generic rules API still knows the type, and non-shipping rules are not reachable through the shipping endpoints
    const types = (await c.get('/api/v1/rules/types', w.admin)).body.data;
    expect(types.find((x: any) => x.type === 'shipping').actions.map((a: any) => a.type)).toEqual(['prefer_shipping_method']);
    const pricing = await c.post('/api/v1/rules', { type: 'pricing', name: 'Markup', conditions: { combinator: 'all', conditions: [] }, action: { type: 'markup_percent', params: { percent: 5 } } }, w.admin);
    expect(pricing.status).toBe(201);
    expect((await c.patch(`/api/v1/shipping/rules/${pricing.body.data.id}`, { name: 'Hijack' }, w.admin)).status).toBe(404);
    expect((await c.get('/api/v1/shipping/rules', w.admin)).body.data.total).toBe(5);
    // a shipping rule through the generic endpoint is validated against the shipping spec too
    expect((await c.post('/api/v1/rules', { type: 'shipping', name: 'Bad', conditions: { combinator: 'all', conditions: [{ field: 'nope', op: 'eq', value: 1 }] }, action: { type: 'prefer_shipping_method', params: { kind: 'seller' } } }, w.admin)).status).toBe(400);
  });

  it('allows at most 100 rules', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [1] });
    const mk = (i: number) => ({ name: `Rule ${i}`, conditions: [{ field: 'weightGrams', op: 'gt', value: i }], then: { prefer: { kind: 'seller' } } });
    for (let i = 0; i < 100; i++) {
      // direct inserts through the API would be slow: the first one proves the API, the rest use the generic endpoint with a batch-friendly shape
      const r = await c.post('/api/v1/shipping/rules', mk(i), w.admin);
      expect(r.status, `rule ${i}`).toBe(201);
    }
    const over = await c.post('/api/v1/shipping/rules', mk(100), w.admin);
    expect(over.status).toBe(409);
    expect(over.body.error.details.rule).toBe('max_rules');
    expect((await c.post(`/api/v1/shipping/rules/${(await c.get('/api/v1/shipping/rules', w.admin)).body.data.items[0].id}/duplicate`, {}, w.admin)).status).toBe(409);
  }, 120_000);
});

describe('tenant isolation and permissions', () => {
  it('a second business sees nothing, and cannot touch the first one', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [10] });
    const seller = await addMethod(w, { kind: 'seller' });
    const o = await packedOrder(w, { dueInMinutes: 30 });
    const rule = (await c.post('/api/v1/shipping/rules', { name: 'Mine', conditions: [{ field: 'weightGrams', op: 'gt', value: 1 }], then: { prefer: { kind: 'seller' } } }, w.admin)).body.data;
    const rival = await c.registerVendor({ businessName: 'Rival Ltd' });
    expect((await c.get('/api/v1/shipping/orders', rival)).body.data).toMatchObject({ total: 0, items: [], counts: { readyToShip: 0 } });
    expect((await c.get('/api/v1/shipping/methods', rival)).body.data.items).toEqual([]);
    expect((await c.get('/api/v1/shipping/rules', rival)).body.data.items).toEqual([]);
    const ov = (await c.get('/api/v1/shipping/overview', rival)).body.data;
    expect(ov.statusLine).toEqual({ connectedChannels: 0, activeMethods: 0, ordersNeedAttention: 0 });
    expect((await c.get('/api/v1/shipping/exceptions', rival)).body.data.totalOrders).toBe(0);
    expect((await c.get('/api/v1/shipping/tracking', rival)).body.data.total).toBe(0);
    expect((await c.get(`/api/v1/shipping/orders/${o.f.id}/options`, rival)).status).toBe(404);
    expect((await c.post(`/api/v1/shipping/orders/${o.f.id}/selection`, { kind: 'seller', source: 'manual_override' }, rival)).status).toBe(404);
    expect((await c.get(`/api/v1/shipping/methods/${seller.id}/capabilities`, rival)).status).toBe(404);
    expect((await c.patch(`/api/v1/shipping/methods/${seller.id}`, { active: false }, rival)).status).toBe(404);
    expect((await c.post(`/api/v1/shipping/methods/${seller.id}/verify`, {}, rival)).status).toBe(404);
    expect((await c.patch(`/api/v1/shipping/rules/${rule.id}`, { name: 'Renamed' }, rival)).status).toBe(404);
    expect((await c.del(`/api/v1/shipping/rules/${rule.id}`, rival)).status).toBe(404);
    expect((await c.post(`/api/v1/shipping/rules/${rule.id}/duplicate`, {}, rival)).status).toBe(404);
    const bulk = (await c.post('/api/v1/shipping/orders/bulk', { action: 'assign_method', fulfillmentIds: [o.f.id], params: { kind: 'seller' } }, rival)).body.data;
    expect(bulk.results[0]).toMatchObject({ ok: false, code: 'not_found' });
    expect((await c.put('/api/v1/shipping/rules/order', { ids: [rule.id] }, rival)).status).toBe(400);
    // nothing changed for the owner
    expect((await orders(w)).items[0]).toMatchObject({ status: 'needs_decision', selectionConfirmed: false });
  });

  it('staff can confirm a selection but not configure methods or rules; viewers only read; the old endpoints are unchanged', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [10] });
    const seller = await addMethod(w, { kind: 'seller' });
    const o = await packedOrder(w);
    const rule = (await c.post('/api/v1/shipping/rules', { name: 'Rule R', conditions: [{ field: 'weightGrams', op: 'gt', value: 1 }], then: { prefer: { kind: 'seller' } } }, w.admin)).body.data;
    const staff = await c.addMember(w.admin, 'vendor_staff');
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    for (const url of ['/api/v1/shipping/methods', '/api/v1/shipping/orders', '/api/v1/shipping/overview', '/api/v1/shipping/tracking', '/api/v1/shipping/tracking/failures', '/api/v1/shipping/exceptions', '/api/v1/shipping/rules', `/api/v1/shipping/orders/${o.f.id}/options`, `/api/v1/shipping/methods/${seller.id}/capabilities`, '/api/v1/shipping/orders/export', '/api/v1/shipping/exceptions/export']) {
      expect((await c.get(url, viewer)).status, `viewer ${url}`).toBe(200);
      expect((await c.get(url, staff)).status, `staff ${url}`).toBe(200);
    }
    // viewers cannot operate
    expect((await c.post(`/api/v1/shipping/orders/${o.f.id}/selection`, { kind: 'seller', source: 'manual_override' }, viewer)).status).toBe(403);
    expect((await c.post('/api/v1/shipping/orders/bulk', { action: 'recalculate', fulfillmentIds: [o.f.id] }, viewer)).status).toBe(403);
    expect((await c.post('/api/v1/shipping/sync', {}, viewer)).status).toBe(403);
    expect((await c.post('/api/v1/shipping/tracking/sync', {}, viewer)).status).toBe(403);
    // staff operate: confirm the selection, sync
    expect((await c.post(`/api/v1/shipping/orders/${o.f.id}/selection`, { kind: 'seller', source: 'manual_override' }, staff)).status).toBe(200);
    expect((await c.post('/api/v1/shipping/orders/bulk', { action: 'recalculate', fulfillmentIds: [o.f.id] }, staff)).status).toBe(200);
    expect((await c.post('/api/v1/shipping/tracking/sync', {}, staff)).status).toBe(202);
    // ... but not configure
    for (const actor of [staff, viewer]) {
      expect((await c.post('/api/v1/shipping/methods', { kind: 'seller' }, actor)).status).toBe(403);
      expect((await c.patch(`/api/v1/shipping/methods/${seller.id}`, { active: false }, actor)).status).toBe(403);
      expect((await c.post(`/api/v1/shipping/methods/${seller.id}/verify`, {}, actor)).status).toBe(403);
      expect((await c.post('/api/v1/shipping/rules', { name: 'Name x', conditions: [{ field: 'weightGrams', op: 'gt', value: 1 }], then: { prefer: { kind: 'seller' } } }, actor)).status).toBe(403);
      expect((await c.patch(`/api/v1/shipping/rules/${rule.id}`, { name: 'Renamed' }, actor)).status).toBe(403);
      expect((await c.del(`/api/v1/shipping/rules/${rule.id}`, actor)).status).toBe(403);
      expect((await c.put('/api/v1/shipping/rules/order', { ids: [rule.id] }, actor)).status).toBe(403);
      expect((await c.post(`/api/v1/shipping/rules/${rule.id}/disable`, {}, actor)).status).toBe(403);
    }
    expect((await c.post('/api/v1/shipping/methods', { kind: 'seller' }, w.admin)).status).toBe(409); // admins pass the permission check (the method exists)
    // old endpoints keep working for their roles
    expect((await c.get('/api/v1/shipping/providers', viewer)).status).toBe(200);
    expect((await c.get('/api/v1/shipments', staff)).status).toBe(200);
    expect((await c.post('/api/v1/shipping/providers', { providerCode: 'manual' }, staff)).status).toBe(403);
    expect((await c.post('/api/v1/shipping/providers', { providerCode: 'manual' }, w.admin)).status).toBe(201);
    // an unauthenticated call is refused
    expect((await c.get('/api/v1/shipping/orders')).status).toBe(401);
  });
});
