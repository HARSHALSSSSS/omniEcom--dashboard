import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, mockControl, type TestApp } from '@oms/testing';
import { marketplaceDecision, mapReason } from '../../modules/returns/src/sync';
import { buildWorld, orderArrives } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

const R = '/api/v1/returns';
const job = async (w: { admin: any }, id: string) => (await c.get(`/api/v1/sync/jobs/${id}`, w.admin)).body.data;
/** POST /returns/sync, run the queued job(s) and hand back the finished job(s) */
async function syncReturns(w: { admin: any }, body: Record<string, unknown> = {}) {
  const res = await c.post(`${R}/sync`, body, w.admin);
  await t.pump();
  const jobs = await Promise.all((res.body.data.jobs as Array<{ jobId: string }>).map((j) => job(w, j.jobId)));
  return { res, jobs };
}
const marketplaceReturns = async (w: { admin: any }) => (await c.get(`${R}?filter[source]=marketplace&limit=100`, w.admin)).body.data as any[];

describe('vocabulary', () => {
  it('maps what a marketplace says to the reason catalogue', () => {
    expect(mapReason('size_issue')).toBe('size_fit');
    expect(mapReason('Item is too small, wrong size')).toBe('size_fit');
    expect(mapReason('Received a different product')).toBe('wrong_item_sent');
    expect(mapReason('colour not as shown')).toBe('color_mismatch');
    expect(mapReason('Product arrived broken')).toBe('damaged_in_transit');
    expect(mapReason('does not work')).toBe('defective');
    expect(mapReason("I don't want it anymore")).toBe('changed_mind');
    expect(mapReason('defective')).toBe('defective');
    expect(mapReason('something nobody predicted')).toBe('other');
    expect(mapReason(undefined)).toBe('other');
    expect(marketplaceDecision('CANCELLED')).toBe('withdrawn');
    expect(marketplaceDecision('closed by customer')).toBe('withdrawn');
    expect(marketplaceDecision('Rejected')).toBe('rejected');
    expect(marketplaceDecision('requested')).toBeNull();
    expect(marketplaceDecision('RECEIVED')).toBeNull();
  });
});

describe('POST /returns/sync pulls marketplace returns into the ledger', () => {
  it('queues a job per capable account, imports the return linked to its order, and is idempotent', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [50] });
    const order = await orderArrives(t, c, w, 3);
    const ret = mockControl.requestReturn(w.account.sellerId, order.externalOrderId, { reason: 'size_issue', items: [{ sku: w.variant.sku, quantity: 2 }] });

    const res = await c.post(`${R}/sync`, {}, w.admin);
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(res.body.data).toMatchObject({ enqueued: true, reason: null, eligibleAccounts: 1, skipped: [], jobs: [{ accountId: w.account.id, marketplace: 'mock', status: 'queued', alreadyQueued: false }] });
    const jobId = res.body.data.jobs[0].jobId as string;
    expect(t.pendingJobs((p) => p.name === 'sync.returns')).toHaveLength(1);
    expect(await job(w, jobId)).toMatchObject({ type: 'returns', status: 'queued', trigger: 'manual', marketplaceAccountId: w.account.id });

    await t.pump();
    const done = await job(w, jobId);
    expect(done).toMatchObject({ status: 'succeeded', attempts: 1, error: null, progress: { done: 1, failed: 0 }, stats: { fetched: 1, created: 1, duplicates: 0, cancelled: 0, unmatched: 0, failed: 0 } });
    expect((await c.get(`/api/v1/sync/jobs?filter[type]=returns`, w.admin)).body.data).toHaveLength(1);

    const list = await marketplaceReturns(w);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ source: 'marketplace', status: 'requested', orderId: order.id, marketplaceReturnId: ret.externalReturnId, reasonCode: 'size_fit', reasonText: 'size_issue', warehouseId: null });
    expect(list[0].items).toHaveLength(1);
    expect(list[0].items[0]).toMatchObject({ quantity: 2, sku: w.variant.sku });
    // it shows up in the ledger and the order's return list like any other return
    const ledger = (await c.get(`${R}/ledger?q=${list[0].number}`, w.admin)).body.data;
    expect(ledger.items.map((x: any) => x.id)).toEqual([list[0].id]);
    expect(ledger.items[0]).toMatchObject({ channel: { code: 'mock' }, reason: { code: 'size_fit' }, quantity: 2 });
    expect(((await c.get(`/api/v1/orders/${order.id}/returns`, w.admin)).body.data as any[]).map((x) => x.id)).toEqual([list[0].id]);
    expect((await t.outbox('return.created')).filter((e) => e.vendorId === w.admin.vendorId)).toHaveLength(1);
    // the account records the sync and keeps a watermark
    expect((await c.get(`/api/v1/marketplace-accounts/${w.account.id}`, w.admin)).body.data.lastSyncedAt).toBeTruthy();

    // idempotent: the same marketplace return id never makes a second return
    const again = await syncReturns(w);
    expect(again.jobs[0]).toMatchObject({ status: 'succeeded', stats: { fetched: 1, created: 0, duplicates: 1 } });
    expect(await marketplaceReturns(w)).toHaveLength(1);
    // `since` re-imports everything the marketplace changed after it
    const forced = await syncReturns(w, { since: new Date(0).toISOString() });
    expect(forced.jobs[0].stats).toMatchObject({ fetched: 1, created: 0, duplicates: 1 });
  });

  it('a return of the whole order (no items named) takes every line; several pages are followed', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [50] });
    const order = await orderArrives(t, c, w, 2);
    // the sandbox pages 3 returns at a time: 4 returns = 2 pages (4 distinct orders)
    const orders = [order];
    for (let i = 0; i < 3; i++) orders.push(await orderArrives(t, c, w, 1));
    for (const o of orders) mockControl.requestReturn(w.account.sellerId, o.externalOrderId, { reason: 'defective' });
    const { jobs } = await syncReturns(w);
    expect(jobs[0]).toMatchObject({ status: 'succeeded', progress: { done: 4, failed: 0 }, stats: { fetched: 4, created: 4 } });
    const list = await marketplaceReturns(w);
    expect(list).toHaveLength(4);
    const whole = list.find((x) => x.orderId === order.id);
    expect(whole.items.map((i: any) => i.quantity)).toEqual([2]);
    expect(whole.reasonCode).toBe('defective');
    expect(whole.reasonText).toBeNull();
  });

  it('a withdrawn request closes the return while nobody handled it, and never touches one that was received', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [50] });
    const order = await orderArrives(t, c, w, 3);
    const a = mockControl.requestReturn(w.account.sellerId, order.externalOrderId, { items: [{ sku: w.variant.sku, quantity: 1 }] });
    const b = mockControl.requestReturn(w.account.sellerId, order.externalOrderId, { items: [{ sku: w.variant.sku, quantity: 1 }] });
    await syncReturns(w);
    const [ra, rb] = [a, b].map((x) => x.externalReturnId);
    const byId = async (mid: string) => (await marketplaceReturns(w)).find((x) => x.marketplaceReturnId === mid);
    // b is approved and received at the warehouse before the customer withdraws
    const bRow = await byId(rb!);
    expect((await c.post(`${R}/${bRow.id}/approve`, { warehouseId: w.warehouses[0]!.id }, w.admin)).status).toBe(200);
    expect((await c.post(`${R}/${bRow.id}/receive`, { warehouseId: w.warehouses[0]!.id, items: [{ returnItemId: bRow.items[0].id, quantity: 1 }] }, w.admin)).status).toBe(200);

    mockControl.setReturnStatus(w.account.sellerId, ra!, 'cancelled');
    mockControl.setReturnStatus(w.account.sellerId, rb!, 'cancelled');
    const { jobs } = await syncReturns(w);
    expect(jobs[0]).toMatchObject({ status: 'succeeded', stats: { fetched: 2, created: 0, cancelled: 1, duplicates: 1 } });
    expect((await byId(ra!)).status).toBe('cancelled');
    expect((await byId(rb!)).status).toBe('received');
    // the withdrawn return gave its unit back (3 sold, 1 still being returned): a request for 2 fits, one for 3 does not
    const fits = mockControl.requestReturn(w.account.sellerId, order.externalOrderId, { items: [{ sku: w.variant.sku, quantity: 2 }] });
    const next = await syncReturns(w);
    expect(next.jobs[0]).toMatchObject({ status: 'succeeded', stats: { created: 1 } });
    expect((await byId(fits.externalReturnId))?.items[0].quantity).toBe(2);
    mockControl.requestReturn(w.account.sellerId, order.externalOrderId, { items: [{ sku: w.variant.sku, quantity: 3 }] });
    const over = await syncReturns(w);
    expect(over.jobs[0]).toMatchObject({ status: 'partially_failed', stats: { created: 0, failed: 1 } });
  });

  it('reports what could not be imported on the job and keeps the rest: unknown order, too many units, an item not on the order', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [50] });
    const order = await orderArrives(t, c, w, 3);
    const good = mockControl.requestReturn(w.account.sellerId, order.externalOrderId, { items: [{ sku: w.variant.sku, quantity: 2 }] });
    const tooMany = mockControl.requestReturn(w.account.sellerId, order.externalOrderId, { items: [{ sku: w.variant.sku, quantity: 2 }] });
    const stranger = mockControl.requestReturn(w.account.sellerId, order.externalOrderId, { items: [{ sku: 'NOT-ON-THE-ORDER', quantity: 1 }] });
    // an order the marketplace has but we never imported
    const notImported = mockControl.placeOrder(w.account.sellerId, [{ sku: w.variant.sku, quantity: 1 }]);
    const orphan = mockControl.requestReturn(w.account.sellerId, notImported.externalOrderId);

    const first = await syncReturns(w);
    const j = first.jobs[0];
    expect(j.status).toBe('partially_failed');
    expect(j.stats).toMatchObject({ fetched: 4, created: 1, unmatched: 1, failed: 3 });
    expect(j.progress).toMatchObject({ done: 4, failed: 3 });
    const byRef = Object.fromEntries((j.failureDetails as any[]).map((f) => [f.ref, f]));
    expect(byRef[tooMany.externalReturnId]).toMatchObject({ code: 'BAD_REQUEST' });
    expect(byRef[stranger.externalReturnId]).toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('not on the order') });
    expect(byRef[orphan.externalReturnId]).toMatchObject({ code: 'ORDER_NOT_IMPORTED' });
    expect((await marketplaceReturns(w)).map((x) => x.marketplaceReturnId)).toEqual([good.externalReturnId]);

    // import the order, withdraw the impossible ones: the next sync (the failed ones are inside the overlap window) finishes the work
    await c.post(`/api/v1/marketplace-accounts/${w.account.id}/sync-orders`, {}, w.admin);
    await t.pump();
    mockControl.setReturnStatus(w.account.sellerId, tooMany.externalReturnId, 'withdrawn');
    mockControl.setReturnStatus(w.account.sellerId, stranger.externalReturnId, 'withdrawn');
    const second = await syncReturns(w);
    expect(second.jobs[0]).toMatchObject({ status: 'succeeded', stats: { created: 1, duplicates: 3, failed: 0 } });
    expect((await marketplaceReturns(w)).map((x) => x.marketplaceReturnId).sort()).toEqual([good.externalReturnId, orphan.externalReturnId].sort());
  });

  it('rides out a transient marketplace failure', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [50] });
    const order = await orderArrives(t, c, w, 1);
    mockControl.requestReturn(w.account.sellerId, order.externalOrderId);
    mockControl.setBehavior(w.account.sellerId, { failNext: 1, failKind: 'transient' });
    const res = await c.post(`${R}/sync`, {}, w.admin);
    await t.pump();
    const jobId = res.body.data.jobs[0].jobId as string;
    expect(await job(w, jobId)).toMatchObject({ status: 'succeeded', stats: { created: 1 } });
    expect(mockControl.calls(w.account.sellerId)).toBeGreaterThan(1);
    expect(await marketplaceReturns(w)).toHaveLength(1);
  });

  it('the sandbox marketplace brings a seeded return that works end to end after the orders are imported', async () => {
    mockControl.reset(); // seeded sellers: 5 orders and one return
    const admin = await c.registerVendor({ businessName: 'Seeded Returns Co' });
    const acct = await c.connectAccount(admin, 'mock');
    const early = await syncReturns({ admin }); // the order is not here yet
    expect(early.jobs[0]).toMatchObject({ status: 'partially_failed', stats: { fetched: 1, created: 0, unmatched: 1 } });
    expect(early.jobs[0].failureDetails[0]).toMatchObject({ code: 'ORDER_NOT_IMPORTED' });

    // the sandbox orders are a few days old: backfill them
    await c.post(`/api/v1/marketplace-accounts/${acct.id}/sync-orders`, { since: new Date(Date.now() - 10 * 86_400_000).toISOString() }, admin);
    await t.pump();
    const done = await syncReturns({ admin });
    expect(done.jobs[0], JSON.stringify(done.jobs[0].failureDetails)).toMatchObject({ status: 'succeeded', stats: { fetched: 1, created: 1, failed: 0 } });
    const list = await marketplaceReturns({ admin });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ marketplaceReturnId: `MR-${acct.sellerId}-1`, reasonCode: 'size_fit', status: 'requested' });
    expect(list[0].items[0].quantity).toBe(1);
    // it is in the overview, the ledger tab and the summary like any other request
    expect((await c.get(`${R}/overview`, admin)).body.data.statusLine).toMatchObject({ open: 1 });
    expect((await c.get(`${R}/summary`, admin)).body.data.requests).toMatchObject({ total: 1, open: 1 });
    expect((await c.get(`${R}/ledger`, admin)).body.data.total).toBe(1);
  });

  it('reports the accounts that cannot fetch returns, syncs one account on request, and says so when nothing is eligible', async () => {
    mockControl.reset();
    mockControl.configure({ seedOrders: false });
    const lone = await c.registerVendor({ businessName: 'No Channel Co' });
    const none = await c.post(`${R}/sync`, {}, lone);
    expect(none.status).toBe(200);
    expect(none.body.data).toEqual({ enqueued: false, reason: 'no_eligible_accounts', eligibleAccounts: 0, jobs: [], skipped: [] });

    const admin = await c.registerVendor({ businessName: 'Two Channels Co' });
    const mock = await c.connectAccount(admin, 'mock');
    const flip = await c.connectAccount(admin, 'flipkart');
    const both = await c.post(`${R}/sync`, {}, admin);
    expect(both.status).toBe(202);
    expect(both.body.data.jobs.map((j: any) => j.marketplace)).toEqual(['mock']);
    expect(both.body.data.skipped).toEqual([{ accountId: flip.id, accountName: expect.any(String), marketplace: 'flipkart', reason: expect.stringMatching(/^(returns_fetch_not_supported|connector_not_ready)$/) }]);
    await t.pump();

    // only the incapable one: nothing queued, and why
    const only = await c.post(`${R}/sync`, { accountId: flip.id }, admin);
    expect(only.status).toBe(200);
    expect(only.body.data).toMatchObject({ enqueued: false, reason: 'no_eligible_accounts', jobs: [], skipped: [{ marketplace: 'flipkart' }] });
    // one account, a second request while the first is waiting joins the waiting job
    const a = await c.post(`${R}/sync`, { accountId: mock.id }, admin);
    const b = await c.post(`${R}/sync`, { accountId: mock.id }, admin);
    expect(a.body.data.jobs[0].jobId).toBe(b.body.data.jobs[0].jobId);
    expect(b.body.data.jobs[0].alreadyQueued).toBe(true);
    // unknown / invalid account
    expect((await c.post(`${R}/sync`, { accountId: '00000000-0000-4000-8000-0000000000aa' }, admin)).status).toBe(404);
    expect((await c.post(`${R}/sync`, { accountId: 'nope' }, admin)).status).toBe(400);
  });

  it('is business-scoped and needs returns:write', async () => {
    const w = await buildWorld(t, c, { warehouses: 1, stock: [20] });
    const order = await orderArrives(t, c, w, 1);
    mockControl.requestReturn(w.account.sellerId, order.externalOrderId);
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    expect((await c.post(`${R}/sync`, {}, viewer)).status).toBe(403);
    const staff = await c.addMember(w.admin, 'vendor_staff');
    const res = await c.post(`${R}/sync`, {}, staff);
    expect(res.status).toBe(202);
    await t.pump();
    // a viewer can follow the job, another business sees neither the job nor the return
    expect((await c.get(`/api/v1/sync/jobs/${res.body.data.jobs[0].jobId}`, viewer)).body.data.status).toBe('succeeded');
    const rival = await c.registerVendor({ businessName: 'Rival Sync' });
    expect((await c.get(`/api/v1/sync/jobs/${res.body.data.jobs[0].jobId}`, rival)).status).toBe(404);
    expect(await marketplaceReturns({ admin: rival })).toEqual([]);
    expect(await marketplaceReturns(w)).toHaveLength(1);
  });
});
