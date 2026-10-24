import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { buildWorld, orderArrives, pickAndPack, ship, type World } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

/** direct SQL as the table owner (RLS off): only for what the API cannot do, like moving a deadline into the past */
const sqlAs = async <T = any>(q: string, p: unknown[] = []): Promise<T[]> => {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { return (await pg.query<T>(q, p)).rows; } finally { await pg.exec('SET ROLE oms_app'); }
};

const refresh = async (a: Actor) => {
  const r = await c.post('/api/v1/issues/refresh', {}, a);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data as { created: number; updated: number; reopened: number; autoResolved: number; unsnoozed: number; failedDetectors: string[]; open: number };
};
const list = async (a: Actor, qs = '') => {
  const r = await c.get(`/api/v1/issues?${qs.includes('pageSize') ? '' : 'pageSize=100'}${qs}`, a);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data as { items: any[]; total: number; page: number; pages: number };
};
const find = async (a: Actor, key: string, qs = '') => (await list(a, qs)).items.find((i) => i.key === key);
const detail = async (a: Actor, id: string) => (await c.get(`/api/v1/issues/${id}`, a)).body.data;
const counts = async (a: Actor) => (await c.get('/api/v1/issues/counts', a)).body.data;
const events = async (id: string) => (await sqlAs<{ type: string }>('select type from issue_events where issue_id = $1 order by id', [id])).map((e) => e.type);

/** a return order straight in the database (what the returns module would hold) */
const makeReturn = async (w: World, orderId: string, o: { status?: string; refund?: string; receivedHoursAgo?: number; items?: Array<{ qty: number; received: number }> } = {}) => {
  const n = `RET-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const [r] = await sqlAs<{ id: string }>(
    `insert into return_orders (vendor_id, number, order_id, source, status, reason_code, refund_status, received_at) values ($1, $2, $3, 'customer', $4, 'changed_mind', $5, ${o.receivedHoursAgo ? `now() - interval '${o.receivedHoursAgo} hours'` : 'null'}) returning id`,
    [w.admin.vendorId, n, orderId, o.status ?? 'requested', o.refund ?? 'not_applicable'],
  );
  for (const it of o.items ?? []) {
    const [item] = await sqlAs<{ id: string; variant_id: string }>('select id, variant_id from order_items where order_id = $1 limit 1', [orderId]);
    await sqlAs('insert into return_items (vendor_id, return_order_id, order_item_id, variant_id, quantity, received_quantity) values ($1, $2, $3, $4, $5, $6)', [w.admin.vendorId, r!.id, item!.id, item!.variant_id, it.qty, it.received]);
  }
  return r!.id;
};

describe('detectors group the right records with the right priority', () => {
  it('dispatch risk: SLA bands decide critical vs high, the earliest deadline is the due time', async () => {
    const w = await buildWorld(t, c);
    const [o1, o2, o3] = [await orderArrives(t, c, w, 1), await orderArrives(t, c, w, 1), await orderArrives(t, c, w, 1)];
    const due = async (id: string, interval: string) => sqlAs(`update orders set dispatch_due_at = now() + interval '${interval}' where id = $1`, [id]);
    await due(o1.id, '-10 minutes'); // breached
    await due(o2.id, '60 minutes'); // at risk (<= 90)
    await due(o3.id, '200 minutes'); // approaching (<= 240)
    const first = await refresh(w.admin);
    expect(first.failedDetectors).toEqual([]);
    let issue = await find(w.admin, 'orders_dispatch_risk');
    expect(issue).toMatchObject({ area: 'orders', priority: 'critical', status: 'open', count: 3, title: '3 orders are at risk of missing dispatch', impact: 'Customer delivery risk' });
    expect(Date.parse(issue.dueAt)).toBeLessThan(Date.now()); // the earliest (breached) deadline
    expect(issue.dueLabel).toBe('Overdue');
    const d = await detail(w.admin, issue.id);
    expect(d.affected.total).toBe(3);
    const nums = (await sqlAs<{ order_number: string }>('select order_number from orders where id = any($1)', [[o1.id, o2.id, o3.id]])).map((r) => r.order_number).sort();
    expect(d.affected.items.map((x: any) => x.label).sort()).toEqual(nums);
    expect(d.affected.items[0]).toMatchObject({ type: 'order', href: expect.stringMatching(/^\/orders\//) });
    expect(d.whyItMatters).toMatch(/dispatch deadline/);
    expect(d.recommendedAction).toMatchObject({ label: 'Review orders' });
    expect(d.timeline.map((e: any) => e.type)).toEqual(['detected']);

    // refresh is idempotent: no duplicate, no new events
    const again = await refresh(w.admin);
    expect(again).toMatchObject({ created: 0, updated: 0, reopened: 0, autoResolved: 0 });
    expect((await list(w.admin)).items.filter((i) => i.key === 'orders_dispatch_risk')).toHaveLength(1);
    expect(await events(issue.id)).toEqual(['detected']);

    // only the approaching one is left inside the window -> high, count 1, same issue
    await due(o1.id, '10 hours');
    await due(o2.id, '10 hours');
    expect((await refresh(w.admin)).updated).toBe(1);
    issue = await find(w.admin, 'orders_dispatch_risk');
    expect(issue).toMatchObject({ priority: 'high', count: 1, title: '1 order is approaching its dispatch deadline' });
    expect(await events(issue.id)).toEqual(['detected', 'updated']);

    // nothing within the window any more -> auto resolved
    await due(o3.id, '10 hours');
    expect((await refresh(w.admin)).autoResolved).toBe(1);
    expect(await find(w.admin, 'orders_dispatch_risk')).toBeUndefined();
    expect(await events(issue.id)).toEqual(['detected', 'updated', 'auto_resolved']);
    // the dispatched / cancelled ones never count
    await due(o3.id, '-5 minutes');
    await sqlAs("update orders set status = 'cancelled' where id = $1", [o3.id]);
    await refresh(w.admin);
    expect(await events(issue.id)).toEqual(['detected', 'updated', 'auto_resolved']);
  });

  it('stock below threshold counts the Inventory low-stock products; sold-out products are their own critical issue; plus the recommendation banner', async () => {
    const w = await buildWorld(t, c, { stock: [4] });
    const v2 = await c.makeVariant(w.admin, { title: 'Quiet seller' });
    await c.stock(w.admin, v2.variantId, w.warehouses[0]!.id, 2);
    await refresh(w.admin);
    let issue = await find(w.admin, 'stock_below_threshold');
    expect(issue).toMatchObject({ area: 'inventory', priority: 'high', count: 2, title: '2 products are below their stock threshold', impact: 'Potential stockout' });
    expect(await find(w.admin, 'stock_out')).toBeUndefined();
    expect(await (await c.get('/api/v1/issues/recommendation', w.admin)).body.data).toBeNull(); // nothing sold yet

    await orderArrives(t, c, w, 3); // sells 3 of the 4 units: still low stock, now selling
    await refresh(w.admin);
    const rec = (await c.get('/api/v1/issues/recommendation', w.admin)).body.data;
    expect(rec.text).toBe('1 of the 2 low-stock products has sold at least 3 units in the last 7 days. Consider reviewing replenishment for it first.');
    expect(rec.evidence).toMatchObject({ lowStockProducts: 2, soldAtLeast3: 1 });
    expect(rec.action).toMatchObject({ label: 'Review recommendation' });

    await orderArrives(t, c, w, 1); // sells the last unit of the main product: it is out of stock now, not "low"
    await refresh(w.admin);
    issue = await find(w.admin, 'stock_below_threshold');
    expect(issue).toMatchObject({ priority: 'high', count: 1, title: '1 product is below its stock threshold' });
    const d = await detail(w.admin, issue.id);
    expect(d.affected.items.map((x: any) => x.label)).toEqual([v2.sku]);
    // the sold-out product that was selling is critical, and is what the Inventory "Out of stock" tab lists
    const out = await find(w.admin, 'stock_out');
    expect(out).toMatchObject({ area: 'inventory', priority: 'critical', count: 1, title: '1 product is out of stock' });
    expect((await detail(w.admin, out.id)).affected.items.map((x: any) => x.label)).toEqual([w.variant.sku]);
    // the inventory screen counts the same products
    const kpis = (await c.get('/api/v1/inventory/kpis', w.admin)).body.data;
    expect(kpis.health).toMatchObject({ lowStock: issue.count, outOfStock: out.count });
    const lowRows = (await c.get('/api/v1/inventory/ledger?filter[stockStatus]=low_stock', w.admin)).body.data.items.map((x: any) => x.sku);
    expect(lowRows).toEqual([v2.sku]);
    // the dashboard card says the same number
    const home = (await c.get('/api/v1/dashboard', w.admin)).body.data;
    expect(home.inventoryHealth).toMatchObject({ low: issue.count, out: out.count });
    expect(home.needsAttention.items.find((x: any) => x.issueKey === 'low_stock')).toMatchObject({ count: issue.count });
    expect((await c.get('/api/v1/issues/recommendation', w.admin)).body.data).toBeNull(); // the one low-stock product has not sold; the sold-out one is not low stock

    // a business threshold of 0 and plenty of stock -> back to normal
    expect((await c.patch('/api/v1/vendor/settings', { lowStockThreshold: 0 }, w.admin)).status).toBe(200);
    await c.stock(w.admin, w.variant.variantId, w.warehouses[0]!.id, 10);
    await c.stock(w.admin, v2.variantId, w.warehouses[0]!.id, 10);
    await sqlAs('update inventory set reorder_level = null where vendor_id = $1', [w.admin.vendorId]);
    await refresh(w.admin);
    expect(await find(w.admin, 'stock_below_threshold')).toBeUndefined();
  });

  it('incomplete listings, failing channel syncs (per account) and the priority bump for a stale sync', async () => {
    const w = await buildWorld(t, c);
    for (let i = 0; i < 2; i++) {
      const v = await c.makeVariant(w.admin);
      expect((await c.post('/api/v1/listings', { marketplaceAccountId: w.account.id, variantId: v.variantId, marketplaceCategoryId: 'mock-apparel' }, w.admin)).status).toBe(201);
    }
    await refresh(w.admin);
    expect(await find(w.admin, 'listings_incomplete')).toMatchObject({ area: 'listings', priority: 'high', count: 2, title: '2 marketplace listings are incomplete', impact: 'Reduced product visibility' });

    // sync: two failed jobs after the last success, the connection itself is fine
    await sqlAs("update marketplace_accounts set last_success_at = now() - interval '10 minutes', connection_status = 'connected' where id = $1", [w.account.id]);
    for (const n of [1, 2]) await sqlAs("insert into sync_jobs (vendor_id, marketplace_account_id, type, status, idempotency_key) values ($1, $2, 'orders', 'failed', $3)", [w.admin.vendorId, w.account.id, `fail-${n}-${w.account.id}`]);
    await refresh(w.admin);
    let sync = await find(w.admin, 'channel_sync_failing');
    expect(sync).toMatchObject({ area: 'channels', priority: 'medium', count: 2, impact: 'Catalog sync' });
    expect(sync.title).toMatch(/ connection has 2 synchronization issues$/);
    // no success for more than 60 minutes -> high
    await sqlAs("update marketplace_accounts set last_success_at = now() - interval '3 hours' where id = $1", [w.account.id]);
    await refresh(w.admin);
    sync = await find(w.admin, 'channel_sync_failing');
    expect(sync.priority).toBe('high');
    const d = await detail(w.admin, sync.id);
    expect(d.affected.items.map((x: any) => x.type)).toEqual(['account', 'sync_job', 'sync_job']);
    expect(d.affected.items[0].href).toBe(`/channels/${w.account.id}`);
    // a sync that succeeds afterwards clears it
    await sqlAs("update marketplace_accounts set last_success_at = now() + interval '1 minute' where id = $1", [w.account.id]);
    await refresh(w.admin);
    expect(await find(w.admin, 'channel_sync_failing')).toBeUndefined();
  });

  it('returns detectors: approval, overdue inspection, failed refund, quantity mismatch, missing disposition', async () => {
    const w = await buildWorld(t, c);
    const o = await orderArrives(t, c, w, 2);
    for (let i = 0; i < 3; i++) await makeReturn(w, o.id);
    await makeReturn(w, o.id, { status: 'cancelled', refund: 'failed' });
    await makeReturn(w, o.id, { status: 'received', refund: 'processed', receivedHoursAgo: 30, items: [{ qty: 2, received: 1 }] });
    await refresh(w.admin);
    expect(await find(w.admin, 'returns_awaiting_approval')).toMatchObject({ area: 'returns', priority: 'medium', count: 3, title: '3 returns are waiting for approval', impact: 'Customer resolution delay' });
    const approval = await find(w.admin, 'returns_awaiting_approval');
    expect(approval.dueLabel).toBe('Tomorrow'); // return SLA: due tomorrow
    expect(await find(w.admin, 'refund_failed')).toMatchObject({ priority: 'high', count: 1, title: '1 refund has failed' });
    expect(await find(w.admin, 'returns_inspection_overdue')).toMatchObject({ priority: 'medium', count: 1 });
    expect(await find(w.admin, 'quantity_mismatch')).toMatchObject({ count: 1 });
    expect(await find(w.admin, 'disposition_missing')).toMatchObject({ count: 1 });
    // the overdue threshold is a business setting: 48 h makes the 30 h old return fine
    await c.patch('/api/v1/vendor/settings', { returns: { inspectionOverdueHours: 48 } }, w.admin);
    await refresh(w.admin);
    expect(await find(w.admin, 'returns_inspection_overdue')).toBeUndefined();
  });

  it('shipping detectors, and an issue auto-resolves when the shipment leaves', async () => {
    const w = await buildWorld(t, c);
    const o = await orderArrives(t, c, w, 1);
    const f = (await c.post(`/api/v1/orders/${o.id}/fulfillment`, {}, w.admin)).body.data.fulfillments[0];
    await pickAndPack(t, c, w, f.id);
    await sqlAs('update fulfillments set ship_confirmed_at = null, ship_method_kind = null where id = $1', [f.id]);
    await refresh(w.admin);
    const noMethod = await find(w.admin, 'shipping_no_method');
    expect(noMethod).toMatchObject({ area: 'shipping', priority: 'high', count: 1 });
    expect(noMethod.title).toContain('waiting for a shipping method');

    const s = await ship(t, c, w, f.id);
    await sqlAs("update shipments set dispatched_at = now() - interval '20 hours', estimated_delivery_at = now() - interval '1 hour' where id = $1", [s.id]);
    const r = await refresh(w.admin);
    expect(r.autoResolved).toBeGreaterThanOrEqual(1);
    expect(await find(w.admin, 'shipping_no_method')).toBeUndefined();
    expect(await find(w.admin, 'tracking_not_received')).toMatchObject({ area: 'shipping', priority: 'medium', count: 1 });
    expect(await find(w.admin, 'shipping_sla_risk')).toMatchObject({ count: 1, title: '1 shipment is past the estimated delivery date' });
    // tracking is polled but went quiet
    await sqlAs("update shipments set status = 'in_transit', last_tracked_at = now() - interval '8 hours' where id = $1", [s.id]);
    await refresh(w.admin);
    expect(await find(w.admin, 'shipping_sync_failed')).toMatchObject({ count: 1 });
    expect(await find(w.admin, 'tracking_not_received')).toBeUndefined();
    // the awaiting-first-scan window is a setting
    await sqlAs("update shipments set status = 'dispatched', last_tracked_at = null where id = $1", [s.id]);
    await c.patch('/api/v1/vendor/settings', { shipping: { awaitingFirstScanHours: 48 } }, w.admin);
    await refresh(w.admin);
    expect(await find(w.admin, 'tracking_not_received')).toBeUndefined();
    // an issue that went away stays in history as resolved by the system
    const hist = (await c.get('/api/v1/issues/history?status=resolved', w.admin)).body.data;
    expect(hist.items.some((i: any) => i.title.includes('shipping method') && i.resolvedBy === null && i.resolution === 'auto')).toBe(true);
  });

  it('inventory: ledger mismatch is low priority, warehouse imbalance needs more than one active warehouse', async () => {
    const one = await buildWorld(t, c, { stock: [20] });
    await refresh(one.admin);
    expect(await find(one.admin, 'warehouse_imbalance')).toBeUndefined(); // a single warehouse cannot be unbalanced
    await sqlAs('update inventory set quantity_on_hand = quantity_on_hand + 1 where vendor_id = $1', [one.admin.vendorId]);
    await refresh(one.admin);
    expect(await find(one.admin, 'inventory_mismatch')).toMatchObject({ area: 'inventory', priority: 'low', count: 1, dueAt: null });

    const two = await buildWorld(t, c, { warehouses: 2, stock: [20, 0] });
    await refresh(two.admin);
    expect(await find(two.admin, 'warehouse_imbalance')).toMatchObject({ priority: 'low', count: 1 });
    await c.stock(two.admin, two.variant.variantId, two.warehouses[1]!.id, 15);
    await refresh(two.admin);
    expect(await find(two.admin, 'warehouse_imbalance')).toBeUndefined();
  });
});

describe('lifecycle: start, snooze, unsnooze, resolve, assign', () => {
  let w: World;
  let staff: Actor;
  beforeAll(async () => {
    w = await buildWorld(t, c);
    staff = await c.addMember(w.admin, 'vendor_staff');
    const o = await orderArrives(t, c, w, 1);
    await sqlAs("update orders set dispatch_due_at = now() + interval '30 minutes' where id = $1", [o.id]); // critical
    await makeReturn(w, o.id); // medium
    const v = await c.makeVariant(w.admin);
    await c.post('/api/v1/listings', { marketplaceAccountId: w.account.id, variantId: v.variantId, marketplaceCategoryId: 'mock-apparel' }, w.admin); // high
    await refresh(w.admin);
  });

  it('start puts an issue in progress; list defaults to open + in progress and shows the status line', async () => {
    const issue = await find(w.admin, 'listings_incomplete');
    const r = await c.post(`/api/v1/issues/${issue.id}/start`, { note: 'Fixing the descriptions' }, staff);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'in_progress', statusNote: 'Fixing the descriptions' });
    const q = await list(w.admin, '&filter[status]=in_progress');
    expect(q.items.map((i) => i.key)).toEqual(['listings_incomplete']);
    expect((await list(w.admin)).items.map((i) => i.key)).toContain('listings_incomplete'); // still in the active queue
    expect((await c.post(`/api/v1/issues/${issue.id}/start`, {}, staff)).body.data.status).toBe('in_progress'); // idempotent
    // the sweep keeps it in progress
    await refresh(w.admin);
    expect((await detail(w.admin, issue.id)).status).toBe('in_progress');
  });

  it('snooze rules: critical issues only until the next business day, others up to 7 days, snoozed ones leave the queue', async () => {
    const crit = await find(w.admin, 'orders_dispatch_risk');
    const plus = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    expect((await c.post(`/api/v1/issues/${crit.id}/snooze`, { until: plus(6) }, w.admin)).body.error.details.rule).toBe('snooze_too_long');
    expect((await c.post(`/api/v1/issues/${crit.id}/snooze`, { until: plus(6) }, w.admin)).status).toBe(400);
    expect((await c.post(`/api/v1/issues/${crit.id}/snooze`, { until: '2020-01-01' }, w.admin)).status).toBe(400); // in the past
    expect((await c.post(`/api/v1/issues/${crit.id}/snooze`, { until: 'someday' }, w.admin)).status).toBe(400);
    expect((await c.post(`/api/v1/issues/${crit.id}/snooze`, { until: '2026-02-31' }, w.admin)).status).toBe(400); // not a date
    const before = await counts(w.admin);
    const ok = await c.post(`/api/v1/issues/${crit.id}/snooze`, { until: 'tomorrow' }, staff);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data).toMatchObject({ status: 'snoozed' });
    expect(Date.parse(ok.body.data.snoozedUntil)).toBeGreaterThan(Date.now());
    const after = await counts(w.admin);
    expect(after.open).toBe(before.open - 1);
    expect(after.tabs.critical).toBe(before.tabs.critical - 1);
    expect((await list(w.admin)).items.some((i) => i.id === crit.id)).toBe(false);
    expect((await list(w.admin, '&filter[status]=snoozed')).items.map((i) => i.id)).toEqual([crit.id]);

    // other priorities: 5 days is fine, 9 days is too long
    const ret = await find(w.admin, 'returns_awaiting_approval');
    expect((await c.post(`/api/v1/issues/${ret.id}/snooze`, { until: plus(9) }, w.admin)).status).toBe(400);
    expect((await c.post(`/api/v1/issues/${ret.id}/snooze`, { until: plus(5) }, w.admin)).status).toBe(200);
    expect((await c.post(`/api/v1/issues/${ret.id}/unsnooze`, {}, w.admin)).body.data.status).toBe('open');
    expect((await c.post(`/api/v1/issues/${ret.id}/unsnooze`, {}, w.admin)).status).toBe(409); // not snoozed any more
  });

  it('a snoozed issue stays snoozed while the condition lasts and returns by itself when the snooze ends', async () => {
    const [snoozed] = (await list(w.admin, '&filter[status]=snoozed')).items;
    const r1 = await refresh(w.admin);
    expect(r1.unsnoozed).toBe(0);
    expect((await detail(w.admin, snoozed.id)).status).toBe('snoozed');
    await sqlAs("update issues set snoozed_until = now() - interval '1 minute' where id = $1", [snoozed.id]);
    const r2 = await refresh(w.admin);
    expect(r2.unsnoozed).toBe(1);
    const d = await detail(w.admin, snoozed.id);
    expect(d.status).toBe('open');
    expect(d.snoozedUntil).toBeNull();
    expect(d.timeline.map((e: any) => e.type)).toEqual(expect.arrayContaining(['snoozed', 'unsnoozed']));
  });

  it('assign needs a member of the business; the unknown / foreign user is refused', async () => {
    const issue = await find(w.admin, 'orders_dispatch_risk');
    const r = await c.post(`/api/v1/issues/${issue.id}/assign`, { userId: staff.userId }, w.admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.assignedTo).toBe(staff.userId);
    const other = await c.registerVendor({ businessName: 'Someone else' });
    const bad = await c.post(`/api/v1/issues/${issue.id}/assign`, { userId: other.userId }, w.admin);
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.rule).toBe('assignee_not_member');
  });

  it('manual resolve is audited, emits issue.resolved, lands in history with the person, and cannot be repeated', async () => {
    const issue = await find(w.admin, 'returns_awaiting_approval');
    const r = await c.post(`/api/v1/issues/${issue.id}/resolve`, { note: 'Approved by phone' }, staff);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.status).toBe('resolved');
    expect((await c.post(`/api/v1/issues/${issue.id}/resolve`, {}, staff)).status).toBe(409);
    await t.pump();
    const resolved = await t.outbox('issue.resolved');
    expect(resolved.some((e) => e.aggregateId === issue.id && e.payload.mode === 'manual')).toBe(true);
    expect((await t.outbox('issue.opened')).some((e) => e.aggregateId === issue.id)).toBe(true);
    const audits = await sqlAs<{ action: string }>("select action from audit_logs where resource_type = 'issue' and resource_id = $1 order by id", [issue.id]);
    expect(audits.map((a) => a.action)).toContain('issue.resolve');
    const hist = (await c.get('/api/v1/issues/history', w.admin)).body.data;
    const row = hist.items.find((i: any) => i.id === issue.id);
    expect(row).toMatchObject({ status: 'resolved', area: 'returns', resolvedBy: 'Team Member', returnsAt: null, resolution: 'Approved by phone' });
    // the condition is still there: the sweep leaves a manual resolve alone...
    await refresh(w.admin);
    expect((await detail(w.admin, issue.id)).status).toBe('resolved');
    expect(await events(issue.id)).not.toContain('reopened');
  });

  it('counts equal the list tabs, filters narrow, history chips add up', async () => {
    const cnt = await counts(w.admin);
    expect(cnt.tabs.all).toBe(cnt.open);
    for (const tab of ['all', 'critical', 'today', 'upcoming'] as const) expect((await list(w.admin, `&tab=${tab}`)).total, tab).toBe(cnt.tabs[tab]);
    expect(Object.values(cnt.byArea as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(cnt.open);
    expect((await list(w.admin, '&filter[area]=orders')).total).toBe(cnt.byArea.orders ?? 0);
    expect((await list(w.admin, '&filter[priority]=critical')).total).toBe(cnt.tabs.critical);
    expect((await list(w.admin, '&filter[due]=today')).total).toBe(cnt.tabs.today);
    expect((await list(w.admin, '&pageSize=1')).pages).toBe(cnt.open);
    const all = (await list(w.admin)).items;
    const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    expect(all.map((i) => rank[i.priority]!)).toEqual([...all.map((i) => rank[i.priority]!)].sort((a, b) => a - b)); // priority first
    expect(new Date(cnt.updatedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    const hist = (await c.get('/api/v1/issues/history', w.admin)).body.data;
    expect(hist.counts.all).toBe(hist.counts.resolved + hist.counts.snoozed);
    expect(hist.counts).toMatchObject({ resolved: 1 });
    expect((await c.get('/api/v1/issues/history?status=snoozed', w.admin)).body.data.items.every((i: any) => i.status === 'snoozed')).toBe(true);
  });

  it('bulk: per-id results, partial success, limits and validation', async () => {
    const plus6 = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
    const crit = await find(w.admin, 'orders_dispatch_risk');
    const high = await find(w.admin, 'listings_incomplete');
    const resolved = (await c.get('/api/v1/issues/history?status=resolved', w.admin)).body.data.items[0];
    const ghost = '00000000-0000-4000-8000-000000000000';
    const sn = await c.post('/api/v1/issues/bulk', { ids: [crit.id, high.id], action: 'snooze', until: plus6 }, staff);
    expect(sn.status, JSON.stringify(sn.body)).toBe(200);
    expect(sn.body.data).toMatchObject({ succeeded: 1, failed: 1 });
    expect(sn.body.data.results.find((x: any) => x.id === crit.id)).toMatchObject({ ok: false, rule: 'snooze_too_long' });
    expect((await detail(w.admin, high.id)).status).toBe('snoozed');
    const r = await c.post('/api/v1/issues/bulk', { ids: [high.id, resolved.id, ghost], action: 'resolve' }, w.admin);
    expect(r.body.data).toMatchObject({ succeeded: 1, failed: 2 });
    expect(r.body.data.results.find((x: any) => x.id === high.id)).toEqual({ id: high.id, ok: true });
    expect(r.body.data.results.find((x: any) => x.id === resolved.id)).toMatchObject({ ok: false, rule: 'already_resolved' });
    expect(r.body.data.results.find((x: any) => x.id === ghost)).toMatchObject({ ok: false });
    expect((await detail(w.admin, high.id)).status).toBe('resolved');
    const as = await c.post('/api/v1/issues/bulk', { ids: [crit.id], action: 'assign', assigneeId: staff.userId }, w.admin);
    expect(as.body.data.results[0]).toEqual({ id: crit.id, ok: true });
    const other = await c.registerVendor({ businessName: 'Bulk outsider' });
    expect((await c.post('/api/v1/issues/bulk', { ids: [crit.id], action: 'assign', assigneeId: other.userId }, w.admin)).body.data.results[0]).toMatchObject({ ok: false, rule: 'assignee_not_member' });
    expect((await c.post('/api/v1/issues/bulk', { ids: Array.from({ length: 101 }, () => ghost), action: 'resolve' }, w.admin)).status).toBe(400);
    expect((await c.post('/api/v1/issues/bulk', { ids: [], action: 'resolve' }, w.admin)).status).toBe(400);
    expect((await c.post('/api/v1/issues/bulk', { ids: [ghost], action: 'snooze' }, w.admin)).status).toBe(400);
    expect((await c.post('/api/v1/issues/bulk', { ids: [ghost], action: 'assign' }, w.admin)).status).toBe(400);
  });
});

describe('auto-resolve, reopen and manual resolve vs a persisting condition', () => {
  it('auto-resolves when the condition is gone and reopens when it returns', async () => {
    const w = await buildWorld(t, c);
    const o = await orderArrives(t, c, w, 1);
    const ret = await makeReturn(w, o.id);
    await refresh(w.admin);
    const issue = await find(w.admin, 'returns_awaiting_approval');
    await sqlAs("update return_orders set status = 'approved' where id = $1", [ret]);
    expect((await refresh(w.admin)).autoResolved).toBe(1);
    expect((await detail(w.admin, issue.id)).status).toBe('resolved');
    expect((await counts(w.admin)).open).toBe(0);
    await sqlAs("update return_orders set status = 'requested' where id = $1", [ret]);
    expect((await refresh(w.admin)).reopened).toBe(1);
    const d = await detail(w.admin, issue.id);
    expect(d.status).toBe('open');
    expect(d.timeline.map((e: any) => e.type)).toEqual(['reopened', 'auto_resolved', 'detected']); // newest first
    expect(await events(issue.id)).toEqual(['detected', 'auto_resolved', 'reopened']);
    expect((await list(w.admin)).items.filter((i) => i.key === 'returns_awaiting_approval')).toHaveLength(1); // same row, not a copy
    await t.pump();
    expect((await t.outbox('issue.opened')).filter((e) => e.aggregateId === issue.id)).toHaveLength(2); // opened, then reopened
  });

  it('a manual resolve holds while nothing changes, and the issue reopens when it gets worse or comes back', async () => {
    const w = await buildWorld(t, c);
    const o = await orderArrives(t, c, w, 1);
    const r1 = await makeReturn(w, o.id);
    await refresh(w.admin);
    const issue = await find(w.admin, 'returns_awaiting_approval');
    expect((await c.post(`/api/v1/issues/${issue.id}/resolve`, {}, w.admin)).status).toBe(200);
    await refresh(w.admin);
    expect((await detail(w.admin, issue.id)).status).toBe('resolved'); // same condition: stays resolved
    await makeReturn(w, o.id); // one more waiting: worse than when it was resolved
    expect((await refresh(w.admin)).reopened).toBe(1);
    const again = await detail(w.admin, issue.id);
    expect(again).toMatchObject({ status: 'open', count: 2 });
    // resolve, the condition vanishes, then returns
    await c.post(`/api/v1/issues/${issue.id}/resolve`, {}, w.admin);
    await sqlAs("update return_orders set status = 'cancelled' where vendor_id = $1", [w.admin.vendorId]);
    await refresh(w.admin);
    expect((await detail(w.admin, issue.id)).status).toBe('resolved');
    await sqlAs("update return_orders set status = 'requested' where id = $1", [r1]);
    expect((await refresh(w.admin)).reopened).toBe(1);
    expect((await detail(w.admin, issue.id)).status).toBe('open');
  });
});

describe('resolve by action', () => {
  it('attempt on a failing channel runs the syncs and resolves; a broken connection fails with the banner and stays open', async () => {
    const w = await buildWorld(t, c);
    await sqlAs("update marketplace_accounts set last_success_at = now() - interval '10 minutes' where id = $1", [w.account.id]);
    for (const n of [1, 2]) await sqlAs("insert into sync_jobs (vendor_id, marketplace_account_id, type, status, idempotency_key) values ($1, $2, 'orders', 'failed', $3)", [w.admin.vendorId, w.account.id, `f-${n}-${w.account.id}`]);
    await refresh(w.admin);
    const issue = await find(w.admin, 'channel_sync_failing');
    const queued = t.pendingJobs().length;
    const ok = await c.post(`/api/v1/issues/${issue.id}/resolve`, { mode: 'attempt' }, w.admin);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data.status).toBe('resolved');
    expect(t.pendingJobs().length).toBeGreaterThan(queued); // the retry syncs were really queued
    const tl = (await detail(w.admin, issue.id)).timeline;
    expect(tl[0]).toMatchObject({ type: 'resolved' });

    // the connection breaks: the issue is back (worse), and the attempt cannot fix a broken connection
    await sqlAs("update marketplace_accounts set connection_status = 'error', last_failure_message = 'token rejected' where id = $1", [w.account.id]);
    await refresh(w.admin);
    expect((await detail(w.admin, issue.id)).status).toBe('open');
    const fail = await c.post(`/api/v1/issues/${issue.id}/resolve`, { mode: 'attempt' }, w.admin);
    expect(fail.status).toBe(409);
    expect(fail.body.error.details).toMatchObject({ rule: 'resolution_failed', reason: expect.stringContaining('token rejected') });
    expect(fail.body.error.details.banner).toContain("couldn't be resolved");
    expect(fail.body.error.details.banner).toContain('retry sync');
    const after = await detail(w.admin, issue.id);
    expect(after.status).toBe('open');
    expect(after.statusNote).toBe('Resolution failed');
    expect(after.timeline[0].type).toBe('resolution_failed');
    expect((await find(w.admin, 'channel_sync_failing')).statusNote).toBe('Resolution failed');
  });

  it('issues without a safe action are not attemptable', async () => {
    const w = await buildWorld(t, c, { stock: [2] });
    await refresh(w.admin);
    const issue = await find(w.admin, 'stock_below_threshold');
    const r = await c.post(`/api/v1/issues/${issue.id}/resolve`, { mode: 'attempt' }, w.admin);
    expect(r.status).toBe(409);
    expect(r.body.error.details.rule).toBe('not_attemptable');
    expect((await detail(w.admin, issue.id)).status).toBe('open');
  });
});

describe('access control and tenant isolation', () => {
  it('viewers read but cannot change; staff can operate; another business sees nothing and gets 404', async () => {
    const w = await buildWorld(t, c, { stock: [1] });
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    const staff = await c.addMember(w.admin, 'vendor_staff');
    await refresh(w.admin);
    const issue = await find(w.admin, 'stock_below_threshold');
    expect(issue).toBeTruthy();

    expect((await c.get('/api/v1/issues', viewer)).status).toBe(200);
    expect((await c.get('/api/v1/issues/counts', viewer)).status).toBe(200);
    expect((await c.get(`/api/v1/issues/${issue.id}`, viewer)).status).toBe(200);
    for (const [url, body] of [
      [`/api/v1/issues/${issue.id}/start`, {}], [`/api/v1/issues/${issue.id}/snooze`, { until: 'tomorrow' }], [`/api/v1/issues/${issue.id}/resolve`, {}],
      [`/api/v1/issues/${issue.id}/assign`, { userId: staff.userId }], ['/api/v1/issues/bulk', { ids: [issue.id], action: 'resolve' }], ['/api/v1/issues/refresh', {}],
    ] as const) expect((await c.post(url, body, viewer)).status, url).toBe(403);
    expect((await detail(w.admin, issue.id)).status).toBe('open');
    expect((await c.get('/api/v1/issues')).status).toBe(401);

    expect((await c.post(`/api/v1/issues/${issue.id}/snooze`, { until: 'tomorrow' }, staff)).status).toBe(200); // staff operate

    const other = await c.registerVendor({ businessName: 'Isolated Co' });
    expect((await counts(other))).toMatchObject({ open: 0, tabs: { all: 0, critical: 0, today: 0, upcoming: 0 }, byArea: {} });
    expect((await list(other)).total).toBe(0);
    expect((await c.get('/api/v1/issues/history', other)).body.data.counts).toEqual({ all: 0, resolved: 0, snoozed: 0 });
    expect((await c.get(`/api/v1/issues/${issue.id}`, other)).status).toBe(404);
    expect((await c.post(`/api/v1/issues/${issue.id}/resolve`, {}, other)).status).toBe(404);
    const bulk = await c.post('/api/v1/issues/bulk', { ids: [issue.id], action: 'resolve' }, other);
    expect(bulk.body.data.results[0]).toMatchObject({ ok: false });
    expect((await detail(w.admin, issue.id)).status).toBe('snoozed'); // untouched by the other business
    expect((await c.get('/api/v1/issues/recommendation', other)).body.data).toBeNull();
    expect((await c.get('/api/v1/issues/not-a-uuid', w.admin)).status).toBe(400);
  });
});

describe('the issues.sweep job', () => {
  it('sweeps every active vendor; one vendor failing does not stop the others', async () => {
    const worlds: World[] = [];
    for (let i = 0; i < 3; i++) { // the mock marketplace is reset per world: order right away
      const w = await buildWorld(t, c);
      await makeReturn(w, (await orderArrives(t, c, w, 1)).id);
      worlds.push(w);
    }
    const [good, broken, inactive] = worlds as [World, World, World];
    await sqlAs("update vendors set timezone = 'Not/AZone' where id = $1", [broken.admin.vendorId]); // its sweep throws
    await sqlAs("update vendors set status = 'suspended' where id = $1", [inactive.admin.vendorId]);
    await t.queues.enqueue('maintenance', 'issues.sweep', { vendorId: null, correlationId: 'sweep-test', data: {} });
    expect(await t.runJobs((j) => j.name === 'issues.sweep')).toBe(1);
    const n = async (v: World) => Number((await sqlAs<{ n: string }>('select count(*) n from issues where vendor_id = $1', [v.admin.vendorId]))[0]!.n);
    expect(await n(good)).toBeGreaterThan(0);
    expect(await n(broken)).toBe(0);
    expect(await n(inactive)).toBe(0); // suspended businesses are skipped
    expect((await sqlAs<{ key: string }>('select key from issues where vendor_id = $1', [good.admin.vendorId])).map((r) => r.key)).toContain('returns_awaiting_approval');
    // a second run changes nothing (idempotent) and wakes expired snoozes
    const issue = (await sqlAs<{ id: string }>("select id from issues where vendor_id = $1 and key = 'returns_awaiting_approval'", [good.admin.vendorId]))[0]!;
    await sqlAs("update issues set status = 'snoozed', snoozed_until = now() - interval '1 minute' where id = $1", [issue.id]);
    await t.queues.enqueue('maintenance', 'issues.sweep', { vendorId: null, correlationId: 'sweep-test-2', data: {} });
    await t.runJobs((j) => j.envelope.correlationId === 'sweep-test-2');
    const after = (await sqlAs<{ status: string }>('select status from issues where id = $1', [issue.id]))[0]!;
    expect(after.status).toBe('open');
    expect(await n(good)).toBeGreaterThan(0);
  });
});
