import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildTestApp, clientFor, type TestApp } from '@oms/testing';
import { buildWorld, orderArrives, pickAndPack, type World } from '../helpers/stage4';
import { customProvider, isPrivateAddress } from '../../modules/shipping/src/providers/custom';

/**
 * Shipping restore: a logistics provider the seller configures (kind "custom"), Sync Shipping as a job with progress, pulse deltas from the
 * history, a shipment opened by id, per-row actions and the destination-zone rule field.
 */
let t: TestApp;
let c: ReturnType<typeof clientFor>;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

/** run SQL as the table owner (tests only: moves history that no endpoint should move) */
async function sqlAdmin(stmt: string): Promise<void> {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { await pg.exec(stmt); } finally { await pg.exec('SET ROLE oms_app'); }
}

async function packedOrder(w: World, o: { weightGrams?: number } = {}) {
  const order = await orderArrives(t, c, w, 1);
  const started = await c.post(`/api/v1/orders/${order.id}/fulfillment`, {}, w.admin);
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  const f = started.body.data.fulfillments[0];
  await pickAndPack(t, c, w, f.id, { weightGrams: o.weightGrams });
  return { order, f };
}
const addMethod = async (w: World, body: Record<string, unknown>) => { const r = await c.post('/api/v1/shipping/methods', body, w.admin); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body.data; };
const selectIt = (w: World, fid: string, body: Record<string, unknown>) => c.post(`/api/v1/shipping/orders/${fid}/selection`, body, w.admin);
const orders = async (w: World, qs = '') => (await c.get(`/api/v1/shipping/orders${qs}`, w.admin)).body.data;

const CUSTOM = { kind: 'custom', label: 'Shree Fleet', config: { trackingUrlTemplate: 'https://track.shreefleet.example/t/{awb}', awbPrefix: 'SF', defaultService: 'Surface' } };

describe('a configured logistics provider (kind custom)', () => {
  it('is added with its own name, tracking page and settings; validated; verified; its credential is never returned', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [10] });
    // validation
    expect((await c.post('/api/v1/shipping/methods', { kind: 'custom' }, w.admin)).status).toBe(400); // a name
    expect((await c.post('/api/v1/shipping/methods', { kind: 'custom', label: 'X' }, w.admin)).status).toBe(400); // a name of 2+ characters
    expect((await c.post('/api/v1/shipping/methods', { kind: 'custom', label: 'No Link Co' }, w.admin)).status).toBe(400); // the tracking page is required
    expect((await c.post('/api/v1/shipping/methods', { kind: 'custom', label: 'Plain Http', config: { trackingUrlTemplate: 'http://x.example/{awb}' } }, w.admin)).status).toBe(400);
    expect((await c.post('/api/v1/shipping/methods', { kind: 'custom', label: 'No Awb Slot', config: { trackingUrlTemplate: 'https://x.example/track' } }, w.admin)).status).toBe(400); // must carry {awb}
    expect((await c.post('/api/v1/shipping/methods', { ...CUSTOM, config: { ...CUSTOM.config, awbLength: 'abc' } }, w.admin)).status).toBe(400);
    expect((await c.post('/api/v1/shipping/methods', { ...CUSTOM, config: { ...CUSTOM.config, trackingApiUrl: 'http://api.example/{awb}' } }, w.admin)).status).toBe(400);
    expect((await c.post('/api/v1/shipping/methods', { ...CUSTOM, config: { ...CUSTOM.config, password: 'x' } }, w.admin)).status).toBe(400); // only declared settings
    // the catalogue entry and the third-party route refuse it: a custom provider is added as kind custom
    expect((await c.post('/api/v1/shipping/methods', { kind: 'third_party', providerCode: 'custom' }, w.admin)).body.error.details.rule).toBe('use_custom_kind');
    expect((await c.post('/api/v1/shipping/providers', { providerCode: 'custom' }, w.admin)).body.error.details.rule).toBe('use_custom_kind');
    const cat = (await c.get('/api/v1/shipping/providers/catalog', w.admin)).body.data as any[];
    const entry = cat.find((p) => p.code === 'custom');
    expect(entry.configFields.map((f: any) => f.key)).toEqual(['carrierName', 'trackingUrlTemplate', 'awbPrefix', 'awbLength', 'defaultService', 'trackingApiUrl', 'apiKey']);
    expect(entry.configFields.find((f: any) => f.key === 'apiKey').secret).toBe(true);

    const m = await addMethod(w, { ...CUSTOM, config: { ...CUSTOM.config, apiKey: 'super-secret-key', trackingApiUrl: 'https://203.0.113.9/t/{awb}' } });
    expect(m).toMatchObject({ kind: 'custom', name: 'Shree Fleet', label: 'Shree Fleet', providerCode: 'custom:shree-fleet', provider: { code: 'custom:shree-fleet', label: 'Shree Fleet' }, state: 'requires_configuration', active: true });
    expect(m.config).toMatchObject({ carrierName: 'Shree Fleet', trackingUrlTemplate: CUSTOM.config.trackingUrlTemplate, awbPrefix: 'SF', apiKey: '********' });
    expect(JSON.stringify(m)).not.toContain('super-secret-key');
    // the same name again gets its own code
    const again = await addMethod(w, { ...CUSTOM, config: { trackingUrlTemplate: CUSTOM.config.trackingUrlTemplate } });
    expect(again.providerCode).toBe('custom:shree-fleet-2');
    // it is listed with the other methods; the matrix groups it with the third-party couriers
    const list = (await c.get('/api/v1/shipping/methods', w.admin)).body.data;
    expect(list.items.map((i: any) => i.kind).sort()).toEqual(['custom', 'custom', 'third_party']);
    expect(JSON.stringify(list)).not.toContain('super-secret-key');
    expect(list.capabilityMatrix.filter((r: any) => r.method === 'third_party').map((r: any) => r.name)).toEqual(expect.arrayContaining(['Shree Fleet']));
    // capabilities: labels / tracking / hand-over are declared; status sync only with a tracking API
    const caps = (id: string) => c.get(`/api/v1/shipping/methods/${id}/capabilities`, w.admin).then((r) => Object.fromEntries((r.body.data.capabilities as any[]).map((x) => [x.key, x.declared])));
    expect(await caps(m.id)).toEqual({ label: true, tracking: true, dispatchUpdate: true, statusSync: true });
    expect(await caps(again.id)).toEqual({ label: true, tracking: true, dispatchUpdate: true, statusSync: false });
    // verify: the required settings are present
    const v = await c.post(`/api/v1/shipping/methods/${m.id}/verify`, {}, w.admin);
    expect(v.body.data).toMatchObject({ ok: true, method: { state: 'configured' } });
    // a changed setting keeps the credential that was not sent again, and has to be verified again
    const patched = (await c.patch(`/api/v1/shipping/methods/${m.id}`, { config: { ...CUSTOM.config, trackingApiUrl: 'https://203.0.113.9/t/{awb}', apiKey: '********' } }, w.admin)).body.data;
    expect(patched).toMatchObject({ state: 'requires_configuration', config: { apiKey: '********' } });
    // the old provider endpoints see it, also without the credential
    const legacy = (await c.get('/api/v1/shipping/providers', w.admin)).body.data as any[];
    expect(legacy.find((p) => p.providerCode === 'custom:shree-fleet')).toBeTruthy();
    expect(JSON.stringify(legacy)).not.toContain('super-secret-key');
  });

  it('is chosen as a third-party method, needs the AWB it issued, labels, dispatches and tracks (by hand, or through its API)', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [10] });
    const m = await addMethod(w, { ...CUSTOM, config: { ...CUSTOM.config, awbLength: '8' } });
    const o = await packedOrder(w);
    // the order shows it among the third-party providers
    const opts = (await c.get(`/api/v1/shipping/orders/${o.f.id}/options`, w.admin)).body.data;
    const third = opts.options.find((x: any) => x.kind === 'third_party');
    expect(third.providers.map((p: any) => p.id)).toContain(m.id);
    expect((await selectIt(w, o.f.id, { kind: 'third_party', providerId: m.id, source: 'manual_override' })).status).toBe(200);
    let row = (await orders(w)).items[0];
    expect(row).toMatchObject({ status: 'selected', selectedMethod: { kind: 'third_party', name: 'Shree Fleet', providerId: m.id }, action: { key: 'book_slot', label: 'Book slot' } }); // collected by the provider: it waits for a pickup slot
    expect(row.secondaryActions.map((a: any) => a.key)).toEqual(['review', 'enter_awb']);
    expect(row.secondaryActions[1]).toEqual({ key: 'enter_awb', label: 'Enter AWB', method: 'POST', href: '/api/v1/shipments', enabled: true });

    // the bulk label cannot invent an AWB: it says so per order
    const bulk = (await c.post('/api/v1/shipping/orders/bulk', { action: 'generate_labels', fulfillmentIds: [o.f.id] }, w.admin)).body.data;
    expect(bulk.results[0]).toMatchObject({ ok: false, code: 'awb_required' });
    // the AWB is checked against the provider's own format
    const create = (awb?: string) => c.post('/api/v1/shipments', { fulfillmentId: o.f.id, providerCode: m.providerCode, ...(awb ? { manual: { awb } } : {}) }, w.admin);
    expect((await create()).body.error.details.rule).toBe('awb_required');
    expect((await create('XX123456')).body.error.details.rule).toBe('awb_format'); // prefix
    expect((await create('SF1234')).body.error.details.rule).toBe('awb_format'); // length
    const made = await create('SF123456');
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const ship = made.body.data;
    expect(ship).toMatchObject({ providerCode: 'custom:shree-fleet', carrier: 'Shree Fleet', awb: 'SF123456', service: 'Surface', status: 'label_ready', trackingUrl: 'https://track.shreefleet.example/t/SF123456', hasLabel: true });
    const label = (await c.get(`/api/v1/shipments/${ship.id}/label`, w.admin)).body.data;
    expect(label.content).toContain('SHREE FLEET  AWB SF123456');
    row = (await orders(w)).items[0];
    expect(row).toMatchObject({ status: 'ready_to_dispatch', action: { key: 'dispatch', label: 'Dispatch', method: 'POST', href: `/api/v1/shipments/${ship.id}/dispatch` } });
    expect(row.secondaryActions).toEqual([{ key: 'print_label', label: 'Print label', method: 'GET', href: `/api/v1/shipments/${ship.id}/label`, enabled: true }]);
    expect((await c.post(`/api/v1/shipments/${ship.id}/dispatch`, {}, w.admin)).status).toBe(200);

    // tracking, fallback: a provider without a tracking API reports nothing (and so never "fails"); the tracking page and manual events are the source
    expect(await customProvider.track('SF123456', { trackingUrlTemplate: 'https://hand.example/{awb}' })).toEqual([]);
    const bare = await c.post('/api/v1/shipping/methods', { kind: 'custom', label: 'Hand Tracked', config: { trackingUrlTemplate: 'https://hand.example/{awb}' } }, w.admin);
    expect(bare.body.data.config.trackingApiUrl).toBeUndefined();
    // by hand: staff record the events (the same endpoint every provider without push uses)
    const ev = await c.post(`/api/v1/shipments/${ship.id}/tracking-events`, { events: [{ eventId: 'm1', status: 'in_transit', location: 'Pune hub', occurredAt: new Date(Date.now() - 3_600_000).toISOString() }] }, w.admin);
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    expect(ev.body.data.shipment.status).toBe('in_transit');

    // through its API: events come from the provider's tracking endpoint (bearer credential, https, public address)
    const calls: Array<{ url: string; auth: string | null }> = [];
    const stub = vi.fn(async (url: URL | string, init?: RequestInit) => {
      calls.push({ url: String(url), auth: new Headers(init?.headers).get('authorization') });
      return new Response(JSON.stringify({ events: [
        { id: 'api-1', status: 'Out for Delivery', location: 'Mumbai', occurredAt: new Date(Date.now() - 1_800_000).toISOString() },
        { id: 'api-2', status: 'something unknown', occurredAt: new Date(Date.now() - 1_700_000).toISOString() },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', stub);
    try {
      await c.patch(`/api/v1/shipping/methods/${m.id}`, { config: { ...CUSTOM.config, awbLength: '8', trackingApiUrl: 'https://203.0.113.9/t/{awb}', apiKey: 'key-123' } }, w.admin);
      const r = await c.post(`/api/v1/shipments/${ship.id}/refresh-tracking`, {}, w.admin);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data).toMatchObject({ recorded: 1, applied: 1, shipment: { status: 'out_for_delivery' } }); // the unknown status is skipped
      expect(calls).toEqual([{ url: 'https://203.0.113.9/t/SF123456', auth: 'Bearer key-123' }]);
      // the credential was kept by the second patch that did not send it again
      await c.patch(`/api/v1/shipping/methods/${m.id}`, { config: { ...CUSTOM.config, awbLength: '8', trackingApiUrl: 'https://203.0.113.9/t/{awb}', apiKey: '********' } }, w.admin);
      await c.post(`/api/v1/shipments/${ship.id}/refresh-tracking`, {}, w.admin);
      expect(calls[1]!.auth).toBe('Bearer key-123');
      // a failing API is recorded as a tracking sync failure and retried
      stub.mockImplementationOnce(async () => new Response('nope', { status: 503 }));
      expect((await c.post(`/api/v1/shipments/${ship.id}/refresh-tracking`, {}, w.admin)).status).toBe(502);
      expect(((await c.get('/api/v1/shipping/tracking/failures', w.admin)).body.data as any[]).map((f) => f.shipmentId)).toEqual([ship.id]);
      expect((await c.post(`/api/v1/shipments/${ship.id}/refresh-tracking`, {}, w.admin)).status).toBe(200);
      expect((await c.get('/api/v1/shipping/tracking/failures', w.admin)).body.data).toEqual([]);
      // an address inside the network is never called
      await c.patch(`/api/v1/shipping/methods/${m.id}`, { config: { ...CUSTOM.config, awbLength: '8', trackingApiUrl: 'https://10.0.0.5/t/{awb}' } }, w.admin);
      const callsBefore = calls.length;
      expect((await c.post(`/api/v1/shipments/${ship.id}/refresh-tracking`, {}, w.admin)).status).toBe(400);
      expect(calls.length).toBe(callsBefore);
    } finally { vi.unstubAllGlobals(); }
  });

  it('can be preferred by a shipping rule and counts as available third-party shipping', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [5] });
    const m = await addMethod(w, CUSTOM);
    const rule = await c.post('/api/v1/shipping/rules', { name: 'Fleet for everything', conditions: [{ field: 'marketplace', op: 'eq', value: 'mock' }], then: { prefer: { kind: 'third_party', providerId: m.id } } }, w.admin);
    expect(rule.status, JSON.stringify(rule.body)).toBe(201);
    expect(rule.body.data.then.prefer).toMatchObject({ kind: 'third_party', providerId: m.id, label: 'Shree Fleet' });
    const o = await packedOrder(w);
    expect((await c.get(`/api/v1/shipping/orders/${o.f.id}/options`, w.admin)).body.data.recommendation).toMatchObject({ kind: 'third_party', providerId: m.id, source: 'rule' });
    // the comparison lists it as a third-party row with its name
    const cmp = (await c.get('/api/v1/shipping/overview', w.admin)).body.data.availabilityComparison;
    expect(cmp.find((x: any) => x.method === 'third_party' && x.methodId === m.id)).toMatchObject({ provider: 'Shree Fleet' });
    // disabled: no longer available
    await c.patch(`/api/v1/shipping/methods/${m.id}`, { active: false }, w.admin);
    const third = (await c.get(`/api/v1/shipping/orders/${o.f.id}/options`, w.admin)).body.data.options.find((x: any) => x.kind === 'third_party');
    expect(third.providers.map((p: any) => p.id)).not.toContain(m.id);
  });

  it('never calls an address inside the network', () => {
    for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['203.0.113.9', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('only admins configure it', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [1] });
    const staff = await c.addMember(w.admin, 'vendor_staff');
    expect((await c.post('/api/v1/shipping/methods', CUSTOM, staff)).status).toBe(403);
    expect((await c.post('/api/v1/shipping/methods', CUSTOM, w.admin)).status).toBe(201);
  });
});

describe('pulse deltas from the history (no snapshot needed)', () => {
  it('rebuilds the counts of 24 h / 7 days ago from the status history', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [20] });
    await addMethod(w, { kind: 'seller' });
    const a = await packedOrder(w); // stays packed
    const b = await packedOrder(w); // labelled and dispatched
    const d = await packedOrder(w); // packed just now
    expect((await selectIt(w, a.f.id, { kind: 'seller', source: 'manual_override' })).status).toBe(200);
    expect((await selectIt(w, b.f.id, { kind: 'seller', source: 'manual_override' })).status).toBe(200);
    const bulk = (await c.post('/api/v1/shipping/orders/bulk', { action: 'generate_labels', fulfillmentIds: [b.f.id] }, w.admin)).body.data;
    expect(bulk.succeeded).toBe(1);
    const shipmentId = bulk.results[0].shipmentId as string;
    expect((await c.post(`/api/v1/shipments/${shipmentId}/dispatch`, {}, w.admin)).status).toBe(200);
    // the other two were packed 30 h ago and a is confirmed since then; b was labelled 30 h ago and handed over 10 h ago
    const ids = `'${a.f.id}', '${b.f.id}'`;
    await sqlAdmin('ALTER TABLE fulfillment_events DISABLE TRIGGER USER; ALTER TABLE shipment_tracking_events DISABLE TRIGGER USER'); // history is append-only: lifted for this test only
    await sqlAdmin(`UPDATE fulfillments SET created_at = now() - interval '31 hours', ship_confirmed_at = now() - interval '30 hours' WHERE id IN (${ids})`);
    await sqlAdmin(`UPDATE fulfillment_events SET created_at = now() - interval '30 hours' WHERE fulfillment_id IN (${ids}) AND to_status <> 'shipped'`);
    await sqlAdmin(`UPDATE fulfillment_events SET created_at = now() - interval '10 hours' WHERE fulfillment_id = '${b.f.id}' AND to_status = 'shipped'`);
    await sqlAdmin(`UPDATE shipments SET created_at = now() - interval '30 hours' WHERE id = '${shipmentId}'`);
    await sqlAdmin(`UPDATE shipment_tracking_events SET occurred_at = now() - interval '30 hours' WHERE shipment_id = '${shipmentId}' AND status = 'label_ready'`);
    await sqlAdmin(`UPDATE shipment_tracking_events SET occurred_at = now() - interval '10 hours' WHERE shipment_id = '${shipmentId}' AND status = 'dispatched'`);
    await sqlAdmin('ALTER TABLE fulfillment_events ENABLE TRIGGER USER; ALTER TABLE shipment_tracking_events ENABLE TRIGGER USER');

    const ov = (await c.get('/api/v1/shipping/overview?compare=24h', w.admin)).body.data;
    expect(ov.comparison).toMatchObject({ source: 'history', windowHours: 24 });
    // now: a, d wait (b has left); 24 h ago: a and b waited, d did not exist  -> 0
    expect(ov.pulse.readyToShip).toMatchObject({ count: 2, sinceLastSync: 0 });
    // now only a is confirmed (b left); 24 h ago a and b were -> -1
    expect(ov.pulse.shippingSelected).toMatchObject({ count: 1, sinceLastSync: -1 });
    // b had a label 24 h ago and has been handed over since
    expect(ov.pulse.labelReady).toMatchObject({ count: 0, sinceLastSync: -1 });
    expect(ov.pulse.dispatched).toMatchObject({ count: 1, sinceLastSync: 1 });
    expect(ov.pulse.inTransit).toMatchObject({ count: 0, sinceLastSync: 0 });
    // a week ago nothing existed: the deltas are the counts themselves
    const week = (await c.get('/api/v1/shipping/overview?compare=7d', w.admin)).body.data;
    expect(week.comparison).toMatchObject({ source: 'history', windowHours: 168 });
    expect(week.pulse.readyToShip.sinceLastSync).toBe(2);
    expect(week.pulse.dispatched.sinceLastSync).toBe(1);
    // an hour ago (default window): the history 24 h back is used, the same as above
    expect((await c.get('/api/v1/shipping/overview', w.admin)).body.data.pulse.readyToShip.sinceLastSync).toBe(0);
    expect((await c.get('/api/v1/shipping/overview?compare=month', w.admin)).status).toBe(400);
    void d;
  });
});

describe('a shipment opened by id', () => {
  it('returns the same row as the list, 404 for another business', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [5] });
    await addMethod(w, { kind: 'seller' });
    const o = await packedOrder(w);
    await selectIt(w, o.f.id, { kind: 'seller', source: 'manual_override' });
    const lab = (await c.post('/api/v1/shipping/orders/bulk', { action: 'generate_labels', fulfillmentIds: [o.f.id] }, w.admin)).body.data;
    const id = lab.results[0].shipmentId as string;
    const row = await c.get(`/api/v1/shipping/shipments/${id}`, w.admin);
    expect(row.status, JSON.stringify(row.body)).toBe(200);
    const fromList = ((await c.get('/api/v1/shipping/shipments', w.admin)).body.data.items as any[]).find((x) => x.id === id);
    expect(row.body.data).toEqual(fromList);
    expect(row.body.data).toMatchObject({ id, orderId: o.order.id, orderNumber: o.order.orderNumber, status: 'label_ready', labelAvailable: true, lastEvent: { status: 'label_ready' } });
    expect((await c.get(`/api/v1/shipping/shipments/${'0'.repeat(8)}-0000-4000-8000-000000000000`, w.admin)).status).toBe(404);
    expect((await c.get('/api/v1/shipping/shipments/not-a-uuid', w.admin)).status).toBe(400);
    const rival = await c.registerVendor({ businessName: 'Rival Row Ltd' });
    expect((await c.get(`/api/v1/shipping/shipments/${id}`, rival)).status).toBe(404);
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    expect((await c.get(`/api/v1/shipping/shipments/${id}`, viewer)).status).toBe(200);
    expect((await c.get(`/api/v1/shipping/shipments/${id}`)).status).toBe(401);
  });
});

describe('destination zone in a shipping rule', () => {
  it('is a rule field with fixed values', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [1] });
    await addMethod(w, { kind: 'seller' });
    const rule = (zone: unknown, op = 'eq') => c.post('/api/v1/shipping/rules', { name: 'By zone', conditions: [{ field: 'destinationZone', op, value: zone }], then: { prefer: { kind: 'seller' } } }, w.admin);
    expect((await rule('national')).status).toBe(201);
    expect((await rule(['local', 'regional'], 'in')).status).toBe(201);
    expect((await rule('far')).status).toBe(400);
    expect((await rule('local', 'contains')).status).toBe(400);
    expect((await c.get('/api/v1/shipping/rules', w.admin)).body.data.fields).toContain('destinationZone');
  });
});
