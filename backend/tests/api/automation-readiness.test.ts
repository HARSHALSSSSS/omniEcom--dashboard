import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withVendor, writeOutboxEvent } from '@oms/database';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { localSlot, scanAutomation } from '../../modules/automation/src/index';
import { buildWorld, type World } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

const A = '/api/v1/automation';
const owner = async <T = any>(q: string, params: unknown[] = []): Promise<T[]> => {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { return (await pg.query<T>(q, params)).rows; } finally { await pg.exec('SET ROLE oms_app'); }
};
const emit = async (vendorId: string, type: string, aggregateId: string, payload: Record<string, unknown>) => {
  await withVendor(t.container.database.db, vendorId, (tx) => writeOutboxEvent(tx, { type, vendorId, aggregateType: type.split('.')[0]!, aggregateId, payload }));
  await t.relayEvents();
};
/** one scan of one business (the database is shared with the other tests), then the async pipeline */
const scan = async (vendorId: string, now = new Date()) => { const r = await scanAutomation(t.container, now, { vendorId }); await t.pump(); return r; };

/** a shop with stock 20 @ 499.00 (cost 300.00), a preferred supplier, an admin and a viewer */
async function shop() {
  const w = await buildWorld(t, c, { warehouses: 1, stock: [20] });
  expect((await c.patch(`/api/v1/variants/${w.variant.variantId}`, { costPriceMinor: 30_000 }, w.admin)).status).toBe(200);
  const sup = await c.post('/api/v1/suppliers', { name: 'Apex Tex Fab Industries', paymentTerms: 'Net 30', leadTimeDays: 14 }, w.admin);
  expect(sup.status, JSON.stringify(sup.body)).toBe(201);
  expect((await c.put(`/api/v1/suppliers/${sup.body.data.id}/products`, { items: [{ variantId: w.variant.variantId, costMinor: 30_000, minOrderQuantity: 1, isPreferred: true }] }, w.admin)).status).toBe(200);
  const viewer = await c.addMember(w.admin, 'vendor_viewer');
  return { w, viewer, supplierId: sup.body.data.id as string };
}
type Shop = Awaited<ReturnType<typeof shop>>;

const rule = async (as: Actor, body: Record<string, unknown>) => {
  const r = await c.post(`${A}/rules`, { status: 'active', ...body }, as);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.data;
};
const lowStock = (s: Shop, available = 3) => emit(s.w.admin.vendorId!, 'inventory.low_stock', s.w.warehouses[0]!.id, { variantId: s.w.variant.variantId, warehouseId: s.w.warehouses[0]!.id, available, reorderLevel: 10 });
const competitor = (w: World, priceMinor: number) => c.post('/api/v1/pricing/competitor-prices', { variantId: w.variant.variantId, priceMinor, sellerName: 'RivalMart' }, w.admin);
const approvals = async (as: Actor, q = '') => (await c.get(`${A}/approvals${q}`, as)).body.data;
const runs = async (as: Actor, q = '') => (await c.get(`${A}/runs${q}`, as)).body.data;
const overview = async (as: Actor) => (await c.get(`${A}/overview`, as)).body.data;

describe('catalog and rule validation for the new vocabulary', () => {
  it('lists the new triggers and actions and refuses misfit or invalid rules', async () => {
    const { w } = await shop();
    const cat = (await c.get(`${A}/catalog`, w.admin)).body.data;
    expect(cat.triggers.map((x: any) => x.event)).toEqual(expect.arrayContaining(['order.sla_at_risk', 'price.competitor_lower', 'schedule.cadence', 'inventory.low_stock', 'sync.failed']));
    const acts = Object.fromEntries(cat.actions.map((x: any) => [x.type, x]));
    expect(Object.keys(acts)).toEqual(expect.arrayContaining(['draft_purchase_order', 'adjust_channel_price', 'snooze_listing']));
    expect(acts.reassign_warehouse).toBeUndefined(); // orders exports no safe function for it
    expect(acts.adjust_channel_price).toMatchObject({ triggers: ['price.competitor_lower'], reversible: true });
    expect(acts.draft_purchase_order.reversible).toBe(false);

    const bad = (body: Record<string, unknown>) => c.post(`${A}/rules`, { name: 'A rule', ...body }, w.admin);
    expect((await bad({ triggerEvent: 'order.created', action: { type: 'draft_purchase_order', params: { quantity: 5 } } })).status).toBe(400); // fits low stock only
    expect((await bad({ triggerEvent: 'inventory.low_stock', action: { type: 'draft_purchase_order', params: {} } })).status).toBe(400); // quantity or targetLevel
    expect((await bad({ triggerEvent: 'price.competitor_lower', action: { type: 'adjust_channel_price', params: { undercutBps: 9000 } } })).status).toBe(400);
    expect((await bad({ triggerEvent: 'price.competitor_lower', action: { type: 'snooze_listing', params: { days: 0 } } })).status).toBe(400);
    expect((await bad({ triggerEvent: 'inventory.low_stock', action: { type: 'adjust_channel_price', params: {} } })).status).toBe(400);
    // schedule.cadence needs the hour; a weekday makes it weekly
    const notify = { type: 'notify', params: { title: 'Daily digest' } };
    expect((await bad({ triggerEvent: 'schedule.cadence', action: notify })).status).toBe(400);
    expect((await bad({ triggerEvent: 'schedule.cadence', conditions: { combinator: 'all', conditions: [{ field: 'hour', op: 'eq', value: 25 }] }, action: notify })).status).toBe(400);
    expect((await bad({ triggerEvent: 'schedule.cadence', conditions: { combinator: 'all', conditions: [{ field: 'hour', op: 'eq', value: 9 }, { field: 'weekday', op: 'eq', value: 8 }] }, action: notify })).status).toBe(400);
    const weekly = await bad({ triggerEvent: 'schedule.cadence', conditions: { combinator: 'all', conditions: [{ field: 'hour', op: 'eq', value: 9 }, { field: 'weekday', op: 'eq', value: 1 }] }, action: notify });
    expect(weekly.status).toBe(201);
    expect(weekly.body.data).toMatchObject({ triggerType: 'scheduled_cadence', schedule: { cadence: 'weekly', hour: 9, weekday: 1 } });
  });
});

describe('Automation screen walkthrough: rules, overview, approvals, runs', () => {
  let s: Shop;
  const ids: Record<string, string> = {};
  const execs = async (ruleId: string) => (await c.get(`${A}/executions?filter[ruleId]=${ruleId}`, s.w.admin)).body.data as any[];

  it('Rules tab: the rule DTO speaks the screen vocabulary', async () => {
    s = await shop();
    const admin = s.w.admin;
    const po = await rule(admin, { name: 'Auto-Draft PO When Stock Runway < 10 Days', triggerEvent: 'inventory.low_stock', action: { type: 'draft_purchase_order', params: { targetLevel: 50 } } });
    ids.po = po.id;
    expect(po).toMatchObject({ triggerType: 'stock_below_threshold', actionType: 'draft_purchase_order', requiresExplicitApproval: true, mode: 'approval', runsCount: 0, lastRunAt: null, channelFilter: null, schedule: null });
    const price = await rule(admin, { name: 'Amazon Buy Box Margin Floor Defense', triggerEvent: 'price.competitor_lower', conditions: { combinator: 'all', conditions: [{ field: 'marketplace', op: 'eq', value: 'mock' }, { field: 'gapBps', op: 'gte', value: 100 }] }, action: { type: 'adjust_channel_price', params: { undercutBps: 100, minPriceMinor: 40_000 } } });
    ids.price = price.id;
    expect(price).toMatchObject({ triggerType: 'buybox_price_drop', actionType: 'adjust_channel_price', requiresExplicitApproval: true, channelFilter: 'mock' });
    const sla = await rule(admin, { name: 'SLA At-Risk Dispatch Notification', triggerEvent: 'order.sla_at_risk', mode: 'auto', action: { type: 'notify', params: { title: 'Order {{orderNumber}} is {{state}}: {{minutesToDue}} min to dispatch', severity: 'warning' } } });
    ids.sla = sla.id;
    expect(sla).toMatchObject({ triggerType: 'order_sla_risk', actionType: 'notify_channel_slack', requiresExplicitApproval: false });
    const list = (await c.get(`${A}/rules`, admin)).body.data;
    expect(list).toHaveLength(3);
    expect(list.every((r: any) => r.runsCount === 0)).toBe(true);
    expect(await overview(admin)).toMatchObject({ activeRules: 3, totalRules: 3, pendingApprovals: 0, runs24h: 0, successRate: null, lastRunAt: null });
  });

  it('Approvals tab: a low-stock event waits with a human description and the money at stake', async () => {
    await lowStock(s, 3);
    const q = await approvals(s.w.admin);
    expect(q).toMatchObject({ total: 1, page: 1, pageSize: 20, pages: 1 });
    expect(q.items[0]).toMatchObject({
      ruleId: ids.po, ruleName: 'Auto-Draft PO When Stock Runway < 10 Days', triggerType: 'stock_below_threshold', actionType: 'draft_purchase_order', status: 'pending',
      entityName: expect.stringContaining('Stage 4 tee'), skuOrOrder: s.w.variant.sku, financialImpact: 47 * 30_000, currency: 'INR',
      recommendedAction: `Draft a purchase order for 47 unit(s) of ${s.w.variant.sku} (available 3, reorder level 10)`,
    });
    expect(await overview(s.w.admin)).toMatchObject({ pendingApprovals: 1, runs24h: 1, successRate: null });
    const r = await runs(s.w.admin);
    expect(r.items[0]).toMatchObject({ ruleName: 'Auto-Draft PO When Stock Runway < 10 Days', executionStatus: 'awaiting_approval', durationMs: 0 });
    expect(r.items[0].summary).toContain('Waiting for approval');
  });

  it('approve drafts the PO (nothing sent), the run log and overview follow, a second approve is refused', async () => {
    const [item] = (await approvals(s.w.admin)).items;
    const ok = await c.post(`${A}/executions/${item.id}/approve`, {}, s.w.admin);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data).toMatchObject({ status: 'executed', canRollback: false, result: { quantity: 47, poNumber: expect.stringMatching(/^PO-/) } });
    const po = (await c.get(`/api/v1/purchase-orders/${ok.body.data.result.purchaseOrderId}`, s.w.admin)).body.data;
    expect(po).toMatchObject({ status: 'draft', unitsOrdered: 47, reference: `automation:${ids.po}`, supplierId: s.supplierId });
    expect((await c.post(`${A}/executions/${item.id}/approve`, {}, s.w.admin)).status).toBe(409); // idempotent: not twice
    expect(await execs(ids.po!)).toHaveLength(1);
    expect((await owner(`select count(*)::int as n from purchase_orders where vendor_id = $1`, [s.w.admin.vendorId]))[0].n).toBe(1);
    expect((await approvals(s.w.admin)).total).toBe(0);
    const r = (await runs(s.w.admin)).items[0];
    expect(r).toMatchObject({ executionStatus: 'success', status: 'executed', ruleName: 'Auto-Draft PO When Stock Runway < 10 Days' });
    expect(r.summary).toBe(`Drafted ${ok.body.data.result.poNumber} for 47 unit(s) of ${s.w.variant.sku}`);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
    expect(await overview(s.w.admin)).toMatchObject({ pendingApprovals: 0, runs24h: 1, successRate: 100, lastRunRule: 'Auto-Draft PO When Stock Runway < 10 Days' });
    const rules = (await c.get(`${A}/rules`, s.w.admin)).body.data;
    expect(rules.find((x: any) => x.id === ids.po)).toMatchObject({ runsCount: 1 });
    expect(rules.find((x: any) => x.id === ids.po).lastRunAt).not.toBeNull();
  });

  it('a draft that cannot be made fails visibly (no supplier for the variant)', async () => {
    const lone = await c.makeVariant(s.w.admin, { title: 'No supplier tee' });
    await emit(s.w.admin.vendorId!, 'inventory.low_stock', 'x', { variantId: lone.variantId, warehouseId: s.w.warehouses[0]!.id, available: 1, reorderLevel: 5 });
    const [item] = (await approvals(s.w.admin)).items;
    expect(item.financialImpact).toBeNull(); // the variant has no cost price: unknown, not zero
    const res = await c.post(`${A}/executions/${item.id}/approve`, {}, s.w.admin);
    expect(res.body.data).toMatchObject({ status: 'failed' });
    const r = (await runs(s.w.admin, '?filter[status]=failed')).items;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ executionStatus: 'failed', status: 'failed' });
    expect(r[0].summary).toMatch(/^Failed: /);
    expect((await overview(s.w.admin)).successRate).toBe(50); // 1 of 2 attempted runs
  });

  it('competitor scan: a lower price creates a price-proposal approval; the live price never moves; rollback withdraws it', async () => {
    const { w } = s;
    const live = async () => (await c.get(`/api/v1/listings/${w.variant.listingId}`, w.admin)).body.data.effectivePriceMinor;
    expect((await competitor(w, 46_000)).status).toBe(201);
    expect(await scan(s.w.admin.vendorId!)).toMatchObject({ competitorLower: 1 });
    const q = await approvals(w.admin);
    expect(q.total).toBe(1);
    expect(q.items[0]).toMatchObject({
      ruleId: ids.price, triggerType: 'buybox_price_drop', actionType: 'adjust_channel_price', skuOrOrder: w.variant.sku,
      financialImpact: 45_540 - 49_900, recommendedAction: `Propose INR 455.40 for ${w.variant.sku} (now INR 499.00), competitor at INR 460.00`,
      facts: { ourPriceMinor: 49_900, competitorPriceMinor: 46_000, gapMinor: 3_900, gapBps: 782, sellerName: 'RivalMart', marketplace: 'mock' },
    });
    expect(await scan(s.w.admin.vendorId!)).toMatchObject({ competitorLower: 0 }); // the same observation is announced once
    expect((await approvals(w.admin)).total).toBe(1);

    const ok = await c.post(`${A}/executions/${q.items[0].id}/approve`, {}, w.admin);
    expect(ok.body.data).toMatchObject({ status: 'executed', canRollback: true, result: { proposedPriceMinor: 45_540, status: 'pending_review' } });
    expect(await live()).toBe(49_900); // only a person approving the proposal changes the price
    const prop = (await c.get(`/api/v1/pricing/proposals/${ok.body.data.result.proposalId}`, w.admin)).body.data;
    expect(prop).toMatchObject({ status: 'pending_review', proposedPriceMinor: 45_540, competitorPriceMinor: 46_000 });
    const rb = await c.post(`${A}/executions/${q.items[0].id}/rollback`, {}, w.admin);
    expect(rb.body.data.status).toBe('rolled_back');
    expect((await c.get(`/api/v1/pricing/proposals/${prop.id}`, w.admin)).body.data.status).toBe('rejected');
    expect((await runs(w.admin)).items[0]).toMatchObject({ executionStatus: 'success', status: 'rolled_back' });
    expect((await runs(w.admin)).items[0].summary).toContain('(rolled back)');
    // a cheaper competitor is a new observation: announced again
    expect((await competitor(w, 45_000)).status).toBe(201);
    expect(await scan(s.w.admin.vendorId!)).toMatchObject({ competitorLower: 1 });
  });

  it('SLA scan: orders due within the window raise an event once; the auto rule notifies', async () => {
    const { w } = s;
    const order = await (async () => {
      const { orderArrives } = await import('../helpers/stage4');
      return orderArrives(t, c, w, 1);
    })();
    await owner(`update orders set dispatch_due_at = now() + interval '20 minutes' where id = $1`, [order.id]);
    expect(await scan(s.w.admin.vendorId!)).toMatchObject({ slaAtRisk: 1 });
    const mine = (await execs(ids.sla!));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ status: 'executed', facts: { orderNumber: order.orderNumber, state: 'at_risk' } });
    const notes = (await c.get('/api/v1/notifications?filter[type]=automation.notice', w.admin)).body.data.items as any[];
    expect(notes.map((n) => n.title)).toContain(`Order ${order.orderNumber} is at_risk: 20 min to dispatch`);
    expect(await scan(s.w.admin.vendorId!)).toMatchObject({ slaAtRisk: 0 }); // same order, same deadline
    expect(await execs(ids.sla!)).toHaveLength(1);
    await owner(`update orders set dispatch_due_at = now() - interval '10 minutes' where id = $1`, [order.id]);
    expect(await scan(s.w.admin.vendorId!)).toMatchObject({ slaAtRisk: 1 }); // a new deadline is a new event (now breached)
    expect((await execs(ids.sla!)).map((e) => e.facts.state).sort()).toEqual(['at_risk', 'breached']);
    await owner(`update orders set status = 'dispatched' where id = $1`, [order.id]);
    expect(await scan(s.w.admin.vendorId!)).toMatchObject({ slaAtRisk: 0 });
  });

  it('cadence tick: one event per local hour, the rule picks its hour and weekday', async () => {
    const { w } = s;
    const now = new Date('2026-03-02T09:30:00+05:30'); // a Monday, 09:30 in Asia/Kolkata
    expect(localSlot(now, 'Asia/Kolkata')).toEqual({ date: '2026-03-02', hour: 9, weekday: 1 });
    const daily = await rule(w.admin, { name: 'Morning digest', triggerEvent: 'schedule.cadence', mode: 'auto', conditions: { combinator: 'all', conditions: [{ field: 'hour', op: 'eq', value: 9 }] }, action: { type: 'notify', params: { title: 'Digest for {{date}} (hour {{hour}})' } } });
    const tuesday = await rule(w.admin, { name: 'Tuesday review', triggerEvent: 'schedule.cadence', mode: 'auto', conditions: { combinator: 'all', conditions: [{ field: 'hour', op: 'eq', value: 9 }, { field: 'weekday', op: 'eq', value: 2 }] }, action: { type: 'notify', params: { title: 'Weekly review' } } });
    expect(await scan(w.admin.vendorId!, now)).toMatchObject({ cadence: 1 });
    expect(await scan(s.w.admin.vendorId!, new Date(now.getTime() + 10 * 60_000))).toMatchObject({ cadence: 0 }); // same slot
    expect(await execs(daily.id)).toHaveLength(1);
    expect((await execs(daily.id))[0]).toMatchObject({ status: 'executed', result: { title: 'Digest for 2026-03-02 (hour 9)' } });
    expect(await execs(tuesday.id)).toHaveLength(0); // it is Monday
    expect(await scan(s.w.admin.vendorId!, new Date(now.getTime() + 24 * 3_600_000))).toMatchObject({ cadence: 1 });
    expect(await execs(daily.id)).toHaveLength(2);
    expect(await execs(tuesday.id)).toHaveLength(1);
  });

  it('snooze_listing raises a recommendation (listings has no per-listing pause to call)', async () => {
    const { w } = s;
    const snooze = await rule(w.admin, { name: 'Snooze undercut listings', triggerEvent: 'price.competitor_lower', action: { type: 'snooze_listing', params: { days: 3, reason: '{{sellerName}} is {{gapBps}} bps cheaper' } } });
    await competitor(w, 44_000);
    await scan(s.w.admin.vendorId!);
    const item = (await approvals(w.admin)).items.find((x: any) => x.ruleId === snooze.id);
    expect(item).toMatchObject({ actionType: 'snooze_listing', financialImpact: null, recommendedAction: `Snooze the listing of ${w.variant.sku} for 3 day(s)` });
    const ok = await c.post(`${A}/executions/${item.id}/approve`, {}, w.admin);
    expect(ok.body.data).toMatchObject({ status: 'executed', result: { listingId: w.variant.listingId, days: 3, mode: 'recommendation', created: true } });
    const recs = (await c.get('/api/v1/ai/recommendations?filter[kind]=snooze_listing', w.admin)).body.data;
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ kind: 'snooze_listing', title: `Snooze listing ${w.variant.sku} for 3 day(s)` });
  });

  it('Approvals tab: dismiss records the note, runs show it as not run, a decided run cannot be dismissed again', async () => {
    await lowStock(s, 2);
    const [item] = (await approvals(s.w.admin)).items.filter((x: any) => x.ruleId === ids.po);
    const d = await c.post(`${A}/approvals/${item.id}/dismiss`, { note: 'Supplier is on holiday' }, s.w.admin);
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    expect(d.body.data).toMatchObject({ status: 'rejected', error: 'Supplier is on holiday' });
    expect((await c.post(`${A}/approvals/${item.id}/dismiss`, {}, s.w.admin)).status).toBe(409);
    expect((await c.post(`${A}/executions/${item.id}/approve`, {}, s.w.admin)).status).toBe(409);
    expect((await approvals(s.w.admin)).items.find((x: any) => x.id === item.id)).toBeUndefined();
    const r = (await runs(s.w.admin, `?filter[ruleId]=${ids.po}`)).items.find((x: any) => x.id === item.id);
    expect(r).toMatchObject({ executionStatus: 'failed', status: 'rejected' });
    expect(r.summary).toMatch(/^Dismissed: Supplier is on holiday/);
  });

  it('Runs tab pages and filters', async () => {
    const all = await runs(s.w.admin);
    expect(all.total).toBeGreaterThanOrEqual(8);
    const p1 = await runs(s.w.admin, '?page=1&pageSize=3');
    const p2 = await runs(s.w.admin, '?page=2&pageSize=3');
    expect(p1.items).toHaveLength(3);
    expect(p1.pages).toBe(Math.ceil(all.total / 3));
    expect(p1.items.map((x: any) => x.id)).not.toEqual(expect.arrayContaining(p2.items.map((x: any) => x.id)));
    expect((await runs(s.w.admin, '?filter[status]=success')).items.every((x: any) => x.executionStatus === 'success')).toBe(true);
    expect((await runs(s.w.admin, '?filter[status]=awaiting_approval')).items.every((x: any) => x.executionStatus === 'awaiting_approval')).toBe(true);
    expect((await c.get(`${A}/runs?filter[status]=bogus`, s.w.admin)).status).toBe(400);
    expect((await c.get(`${A}/runs?pageSize=500`, s.w.admin)).status).toBe(400);
  });
});

describe('actions in approval mode', () => {
  it('the price floor stops a proposal that would not lower the price', async () => {
    const s = await shop();
    const { w } = s;
    await rule(w.admin, { name: 'Floor above price', triggerEvent: 'price.competitor_lower', action: { type: 'adjust_channel_price', params: { minPriceMinor: 60_000 } } });
    await competitor(w, 46_000);
    expect(await scan(w.admin.vendorId!)).toMatchObject({ competitorLower: 1 });
    const [item] = (await approvals(w.admin)).items;
    const res = await c.post(`${A}/executions/${item.id}/approve`, {}, w.admin);
    expect(res.body.data).toMatchObject({ status: 'failed', canRollback: false });
    expect(res.body.data.error).toContain('price floor');
    expect((await c.get(`/api/v1/pricing/proposals`, w.admin)).body.data.total).toBe(0);
  });

  it('a rolled-back price proposal that a person already approved cannot be withdrawn', async () => {
    const s = await shop();
    const { w } = s;
    await rule(w.admin, { name: 'Match rival', triggerEvent: 'price.competitor_lower', action: { type: 'adjust_channel_price', params: {} } });
    await competitor(w, 46_000);
    await scan(w.admin.vendorId!);
    const [item] = (await approvals(w.admin)).items;
    const ok = await c.post(`${A}/executions/${item.id}/approve`, {}, w.admin);
    expect(ok.body.data.result.proposedPriceMinor).toBe(46_000);
    const decide = await c.post(`/api/v1/pricing/proposals/${ok.body.data.result.proposalId}/approve`, {}, w.admin);
    expect(decide.status, JSON.stringify(decide.body)).toBe(200);
    const rb = await c.post(`${A}/executions/${item.id}/rollback`, {}, w.admin);
    expect(rb.status).toBe(409);
  });
});

describe('rules of the automation screen endpoints', () => {
  it('viewers read the screen but cannot dismiss, approve or change rules; tenants are isolated', async () => {
    const s = await shop();
    await rule(s.w.admin, { name: 'Draft PO', triggerEvent: 'inventory.low_stock', action: { type: 'draft_purchase_order', params: { quantity: 5 } } });
    await lowStock(s);
    const [item] = (await approvals(s.w.admin)).items;
    for (const path of ['overview', 'approvals', 'runs', 'rules']) expect((await c.get(`${A}/${path}`, s.viewer)).status, path).toBe(200);
    expect((await approvals(s.viewer)).total).toBe(1);
    expect((await c.post(`${A}/approvals/${item.id}/dismiss`, {}, s.viewer)).status).toBe(403);
    expect((await c.post(`${A}/executions/${item.id}/approve`, {}, s.viewer)).status).toBe(403);
    expect((await c.post(`${A}/rules`, { name: 'Nope', triggerEvent: 'order.created', action: { type: 'notify', params: { title: 'hello there' } } }, s.viewer)).status).toBe(403);
    expect((await c.get(`${A}/overview`, { ...s.w.admin, token: undefined } as any)).status).toBe(401);

    const rival = await c.registerVendor();
    expect(await overview(rival)).toMatchObject({ activeRules: 0, totalRules: 0, pendingApprovals: 0, runs24h: 0, lastRunAt: null });
    expect((await approvals(rival)).total).toBe(0);
    expect((await runs(rival)).total).toBe(0);
    expect((await c.post(`${A}/approvals/${item.id}/dismiss`, {}, rival)).status).toBe(404);
    expect((await c.get(`${A}/runs?filter[ruleId]=${item.ruleId}`, rival)).body.data.total).toBe(0);
    expect(await scan(rival.vendorId!)).toMatchObject({ vendors: 0 });
    expect((await approvals(s.w.admin)).total).toBe(1); // the rival's scan and requests touched nothing
  });

  it('concurrent approvals of one run execute it once', async () => {
    const s = await shop();
    await rule(s.w.admin, { name: 'Draft PO', triggerEvent: 'inventory.low_stock', action: { type: 'draft_purchase_order', params: { quantity: 5 } } });
    await lowStock(s);
    const [item] = (await approvals(s.w.admin)).items;
    const results = await Promise.all([1, 2, 3].map(() => c.post(`${A}/executions/${item.id}/approve`, {}, s.w.admin)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    const pos = await owner(`select count(*)::int as n from purchase_orders where vendor_id = $1`, [s.w.admin.vendorId]);
    expect(pos[0].n).toBe(1);
  });

  it('the automation.enabled flag switches rules, approvals and the scan off, but the screen still reads', async () => {
    const s = await shop();
    const r = await rule(s.w.admin, { name: 'Draft PO', triggerEvent: 'inventory.low_stock', action: { type: 'draft_purchase_order', params: { quantity: 5 } } });
    await rule(s.w.admin, { name: 'Morning', triggerEvent: 'schedule.cadence', mode: 'auto', conditions: { combinator: 'all', conditions: [{ field: 'hour', op: 'eq', value: 7 }] }, action: { type: 'notify', params: { title: 'Morning' } } });
    await lowStock(s);
    const [item] = (await approvals(s.w.admin)).items;
    const platform = await c.platformAdmin('platform_admin');
    expect((await c.put(`/api/v1/admin/feature-flags/automation.enabled/vendors/${s.w.admin.vendorId}`, { enabled: false }, platform)).status).toBe(200);
    const blocked = await c.post(`${A}/executions/${item.id}/approve`, {}, s.w.admin);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.details).toMatchObject({ rule: 'feature_disabled', flag: 'automation.enabled' });
    expect((await c.post(`${A}/rules`, { name: 'New rule', triggerEvent: 'order.created', action: { type: 'notify', params: { title: 'hello there' } } }, s.w.admin)).status).toBe(403);
    expect((await c.post(`${A}/rules/${r.id}/activate`, {}, s.w.admin)).status).toBe(403);
    expect(await scan(s.w.admin.vendorId!, new Date('2026-03-02T07:05:00+05:30'))).toMatchObject({ cadence: 0, slaAtRisk: 0, competitorLower: 0 });
    expect((await owner(`select count(*)::int as n from outbox_events where vendor_id = $1 and type = 'schedule.cadence'`, [s.w.admin.vendorId]))[0].n).toBe(0);
    await lowStock(s, 1);
    expect((await approvals(s.w.admin)).total).toBe(1); // no new run was created while it is off
    expect((await c.get(`${A}/overview`, s.w.admin)).status).toBe(200);
    expect((await c.put(`/api/v1/admin/feature-flags/automation.enabled/vendors/${s.w.admin.vendorId}`, { enabled: true }, platform)).status).toBe(200);
    expect((await c.post(`${A}/executions/${item.id}/approve`, {}, s.w.admin)).status).toBe(200);
  });
});
