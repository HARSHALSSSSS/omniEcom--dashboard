import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type TestApp } from '@oms/testing';
import { buildWorld, type World } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

const API = '/api/v1/pricing';
/** price 499.00, cost 300.00 (optional), 10% commission (optional): unit margin 14910 = 2988 bps */
async function world(o: { cost?: boolean; fee?: boolean } = {}) {
  const w = await buildWorld(t, c, { warehouses: 1, stock: [50] });
  if (o.cost !== false) expect((await c.patch(`/api/v1/variants/${w.variant.variantId}`, { costPriceMinor: 30_000 }, w.admin)).status).toBe(200);
  if (o.fee !== false) expect((await c.put(`/api/v1/analytics/fee-profiles/${w.account.id}`, { feePercentBps: 1000, fixedFeeMinor: 0 }, w.admin)).status).toBe(200);
  return w;
}
const overview = async (w: World, q = '') => (await c.get(`${API}/margin-overview${q}`, w.admin)).body.data;
const table = async (w: World, q = '') => (await c.get(`${API}/price-table${q}`, w.admin)).body.data;
const floorPolicy = (w: World, targetMarginMinBps: number) => c.post(`${API}/policies`, { name: 'Floor', accountId: w.account.id, strategy: 'margin_floor', targetMarginMinBps, maxDiscountBps: 2000 }, w.admin);

describe('margin overview and price table', () => {
  it('known cost and fees give exact margins; a viewer can read', async () => {
    const w = await world();
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    const res = await c.get(`${API}/margin-overview`, viewer);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.channels).toHaveLength(1);
    expect(res.body.data.channels[0]).toMatchObject({
      accountId: w.account.id, priceCount: 1, pricedWithCostCount: 1, avgMarginBps: 2988, belowTargetCount: 0, unknownCostCount: 0, feeTermsSummary: '10% commission', nextAction: 'proposals', targetMarginBps: null,
    });
    expect(res.body.data.totals).toEqual({ productsInView: 1, productChannelPrices: 1, avgMarginBps: 2988, belowTargetCount: 0, unknownCostCount: 0, withProposalCount: 0, targetMarginBps: null });
    const row = (await c.get(`${API}/price-table`, viewer)).body.data.items[0];
    expect(row).toMatchObject({ variantId: w.variant.variantId, listingId: w.variant.listingId, sku: w.variant.sku, accountId: w.account.id, currentPriceMinor: 49_900, unitCostMinor: 30_000, feesMinor: 4_990, marginBps: 2988, belowTarget: null, proposalState: 'none', proposalId: null, proposedPriceMinor: null });
  });

  it('counts listings below the policy target; the strictest target wins', async () => {
    const w = await world();
    expect((await floorPolicy(w, 2000)).status).toBe(201);
    expect((await overview(w)).totals).toMatchObject({ belowTargetCount: 0, targetMarginBps: 2000 });
    expect((await table(w)).items[0].belowTarget).toBe(false);
    expect((await floorPolicy(w, 3500)).status).toBe(201);
    const o = await overview(w);
    expect(o.totals).toMatchObject({ belowTargetCount: 1, targetMarginBps: 3500 });
    expect(o.channels[0]).toMatchObject({ belowTargetCount: 1, targetMarginBps: 3500 });
    expect((await table(w)).items[0]).toMatchObject({ belowTarget: true, targetMarginBps: 3500 });
  });

  it('a missing cost is null and counted as unknown, never guessed; missing fees say so', async () => {
    const w = await world({ cost: false, fee: false });
    await floorPolicy(w, 3500);
    const o = await overview(w);
    expect(o.channels[0]).toMatchObject({ priceCount: 1, pricedWithCostCount: 0, avgMarginBps: null, belowTargetCount: 0, unknownCostCount: 1, feeTermsSummary: 'fees not configured', nextAction: 'costs' });
    expect(o.totals).toMatchObject({ avgMarginBps: null, belowTargetCount: 0, unknownCostCount: 1, productChannelPrices: 1 });
    expect((await table(w)).items[0]).toMatchObject({ currentPriceMinor: 49_900, unitCostMinor: null, feesMinor: null, marginBps: null, belowTarget: null });
    // fees known, cost unknown: the fee amount is real, the margin still unknown
    expect((await c.put(`/api/v1/analytics/fee-profiles/${w.account.id}`, { feePercentBps: 1200, fixedFeeMinor: 2500 }, w.admin)).status).toBe(200);
    expect((await overview(w)).channels[0].feeTermsSummary).toBe('12% commission + Rs 25.00 fixed');
    expect((await table(w)).items[0]).toMatchObject({ unitCostMinor: null, feesMinor: 8_488, marginBps: null });
  });

  it('proposals carry real cost, fees, margins and a structured reason; the overview counts applied ones', async () => {
    const w = await world();
    await floorPolicy(w, 3500);
    const gen = await c.post(`${API}/proposals/generate`, {}, w.admin);
    expect(gen.status, JSON.stringify(gen.body)).toBe(200);
    const list = (await c.get(`${API}/proposals`, w.admin)).body.data;
    expect(list.total).toBe(1);
    const p = list.items[0];
    expect(p).toMatchObject({ unitCostMinor: 30_000, feesMinor: 4_990, currentMarginBps: 2988, targetMarginBps: 3500, reasonCode: 'below_margin_target' });
    expect(p.proposedMarginBps).toBeGreaterThanOrEqual(3500);
    expect(p.reasonText).toContain('35%');
    expect((await c.get(`${API}/proposals/${p.id}`, w.admin)).body.data).toMatchObject({ currentMarginBps: 2988, reasonCode: 'below_margin_target' });
    expect(list.counts.pending_review).toBe(1);
    const row = (await table(w)).items[0];
    expect(row).toMatchObject({ proposalState: 'proposed', proposalId: p.id, proposedPriceMinor: p.proposedPriceMinor });
    expect((await table(w, '?filter[state]=proposed')).total).toBe(1);
    expect((await table(w, '?filter[state]=below_target')).total).toBe(1);
    expect((await overview(w)).totals).toMatchObject({ withProposalCount: 1, belowTargetCount: 1 });
    const o1 = (await c.get(`${API}/overview`, w.admin)).body.data;
    expect(o1).toMatchObject({ pendingProposals: 1, appliedLast30Days: 0 });
    expect(typeof o1.opportunitiesCount).toBe('number');
    expect(o1.proposalCounts.pending_review).toBe(list.counts.pending_review);
    expect((await c.post(`${API}/proposals/${p.id}/approve`, {}, w.admin)).status).toBe(200);
    expect((await c.get(`${API}/overview`, w.admin)).body.data).toMatchObject({ pendingProposals: 0, appliedLast30Days: 1 });
    // the table now shows the applied price and its better margin
    const after = (await table(w)).items[0];
    expect(after.proposalState).toBe('none');
    expect(after.marginBps).toBeGreaterThanOrEqual(3500);
  });

  it('pages, searches, sorts and filters by account', async () => {
    const w = await world();
    const v2 = await c.makeVariant(w.admin, { title: 'Second tee' });
    await c.patch(`/api/v1/variants/${v2.variantId}`, { costPriceMinor: 10_000 }, w.admin);
    const l = (await c.post('/api/v1/listings', { marketplaceAccountId: w.account.id, variantId: v2.variantId, marketplaceCategoryId: 'mock-apparel' }, w.admin)).body.data;
    await c.post(`/api/v1/listings/${l.id}/validate`, {}, w.admin);
    await c.post(`/api/v1/listings/${l.id}/approve`, {}, w.admin);
    await c.post(`/api/v1/listings/${l.id}/publish`, {}, w.admin);
    await t.pump();
    const all = await table(w);
    expect(all).toMatchObject({ page: 1, total: 2, pages: 1 });
    expect((await overview(w)).totals).toMatchObject({ productChannelPrices: 2, productsInView: 2, unknownCostCount: 0 });
    const p1 = await table(w, '?pageSize=1&page=1&sort=margin_desc');
    const p2 = await table(w, '?pageSize=1&page=2&sort=margin_desc');
    expect(p1).toMatchObject({ total: 2, pages: 2 });
    expect(p1.items).toHaveLength(1);
    expect(p2.items).toHaveLength(1);
    expect(p1.items[0].marginBps).toBeGreaterThanOrEqual(p2.items[0].marginBps);
    expect((await table(w, '?sort=margin_asc')).items[0].marginBps).toBeLessThanOrEqual(p1.items[0].marginBps);
    expect((await table(w, '?filter[state]=proposed')).total).toBe(0);
    expect((await table(w, '?filter[state]=below_target')).total).toBe(0);
    expect((await table(w, `?q=${w.variant.sku}`)).total).toBe(1);
    expect((await table(w, '?q=second')).items[0].productTitle).toBe('Second tee');
    expect((await table(w, '?q=nothing-like-this')).total).toBe(0);
    expect((await table(w, `?filter[accountId]=${w.account.id}`)).total).toBe(2);
    expect((await c.get(`${API}/price-table?pageSize=0`, w.admin)).status).toBe(400);
  });

  it('is tenant isolated', async () => {
    const a = await world();
    const b = await world();
    expect((await table(a)).items.map((r: any) => r.variantId)).toEqual([a.variant.variantId]);
    expect((await overview(b)).channels.map((r: any) => r.accountId)).toEqual([b.account.id]);
    expect(await overview(a, `?filter[accountId]=${b.account.id}`)).toMatchObject({ channels: [], totals: { productChannelPrices: 0, avgMarginBps: null } });
    expect((await table(a, `?filter[accountId]=${b.account.id}`)).total).toBe(0);
  });
});
