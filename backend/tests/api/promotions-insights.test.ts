import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type TestApp } from '@oms/testing';
import { THRESHOLDS, capabilityOf, classify, endsInHours, horizonOf, maxDiscountBps } from '../../modules/promotions/src/domain/candidates';
import { buildWorld, type World } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

const DAY = 86_400_000;
const HOUR = 3_600_000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs);
const P = '/api/v1/promotions';
const pct20 = { type: 'percentage_discount', valueBps: 2000 };

async function sqlRun<T = any>(text: string): Promise<T[]> {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { return ((await pg.query(text)).rows as T[]); } finally { await pg.exec('SET ROLE oms_app'); }
}

/** price 499.00, cost 300.00 (optional), 10% commission (optional); stock 100 */
async function world(o: { cost?: boolean; fee?: boolean; stock?: number } = {}) {
  const w = await buildWorld(t, c, { warehouses: 1, stock: [o.stock ?? 100] });
  if (o.cost !== false) expect((await c.patch(`/api/v1/variants/${w.variant.variantId}`, { costPriceMinor: 30_000 }, w.admin)).status).toBe(200);
  if (o.fee !== false) expect((await c.put(`/api/v1/analytics/fee-profiles/${w.account.id}`, { feePercentBps: 1000, fixedFeeMinor: 0 }, w.admin)).status).toBe(200);
  return w;
}
const policy = (w: World, targetMarginMinBps: number) => c.post('/api/v1/pricing/policies', { name: `Floor ${targetMarginMinBps}`, accountId: w.account.id, strategy: 'margin_floor', targetMarginMinBps, maxDiscountBps: 2000 }, w.admin);
const create = async (w: World, body: Record<string, unknown>) => {
  const r = await c.post(`${P}/campaigns`, body, w.admin);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.data.campaign as any;
};
const act = (w: World, id: string, action: string) => c.post(`${P}/campaigns/${id}/${action}`, {}, w.admin);
const products = async (w: World, id: string) => (await c.get(`${P}/campaigns/${id}/products?pageSize=100`, w.admin)).body.data;
const overview = async (w: World) => (await c.get(`${P}/overview`, w.admin)).body.data;
const candidates = async (w: World, q = '') => { const r = await c.get(`${P}/candidates${q}`, w.admin); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.data; };

async function listedVariant(w: World, o: { sku: string; priceMinor?: number; cost?: number; stock?: number }) {
  const v = await c.makeVariant(w.admin, { sku: o.sku, priceMinor: o.priceMinor ?? 49_900, mrpMinor: (o.priceMinor ?? 49_900) * 2 });
  const l = (await c.post('/api/v1/listings', { marketplaceAccountId: w.account.id, variantId: v.variantId, marketplaceCategoryId: 'mock-apparel' }, w.admin)).body.data;
  await c.post(`/api/v1/listings/${l.id}/validate`, {}, w.admin);
  await c.post(`/api/v1/listings/${l.id}/approve`, {}, w.admin);
  await c.post(`/api/v1/listings/${l.id}/publish`, {}, w.admin);
  await t.pump();
  if (o.cost !== undefined) await c.patch(`/api/v1/variants/${v.variantId}`, { costPriceMinor: o.cost }, w.admin);
  if (o.stock) await c.stock(w.admin, v.variantId, w.warehouses[0]!.id, o.stock);
  return v;
}

async function order(w: World, o: { variantId: string; sku: string; qty: number; unitMinor: number; placedAt: Date }) {
  const n = Math.random().toString(36).slice(2, 10).toUpperCase();
  await sqlRun(`with o as (insert into orders (vendor_id, marketplace_account_id, marketplace, external_order_id, order_number, status, placed_at)
      values ('${w.admin.vendorId}', '${w.account.id}', 'mock', 'EXT-${n}', 'PO-${n}', 'delivered', '${o.placedAt.toISOString()}') returning id)
    insert into order_items (vendor_id, order_id, external_item_id, variant_id, sku, title, quantity, unit_price_minor)
    select '${w.admin.vendorId}', o.id, 'IT-${n}', '${o.variantId}', '${o.sku}', 'Test item', ${o.qty}, ${o.unitMinor} from o`);
}

describe('candidate rules (pure)', () => {
  const base = { canPushPrices: true, conflict: null, lowStock: false, marginBps: 3000, targetMarginBps: null, recommendedByIntelligence: false };
  it('puts the reasons in priority order and derives the status from them', () => {
    expect(classify(base)).toMatchObject({ eligibility: 'eligible', status: 'not_selected', reason: null });
    expect(classify({ ...base, recommendedByIntelligence: true })).toMatchObject({ eligibility: 'eligible', status: 'recommended' });
    expect(classify({ ...base, canPushPrices: false, lowStock: true, conflict: 'x' })).toMatchObject({ eligibility: 'not_provided', status: 'connector_unavailable' });
    expect(classify({ ...base, conflict: 'Another campaign covers it', lowStock: true })).toMatchObject({ eligibility: 'conflict', status: 'review', reason: 'Another campaign covers it' });
    expect(classify({ ...base, lowStock: true, recommendedByIntelligence: true })).toMatchObject({ eligibility: 'low_inventory', status: 'review' });
    expect(classify({ ...base, marginBps: 1499 })).toMatchObject({ eligibility: 'margin_risk', status: 'review' });
    expect(classify({ ...base, marginBps: 1500 }).eligibility).toBe('eligible');
    // a pricing-policy target replaces the default level
    expect(classify({ ...base, marginBps: 2500, targetMarginBps: 3000 }).eligibility).toBe('margin_risk');
    expect(classify({ ...base, marginBps: 1600, targetMarginBps: 1500 }).eligibility).toBe('eligible');
    expect(classify({ ...base, marginBps: null })).toMatchObject({ eligibility: 'verification_required', status: 'review' });
  });
  it('maps campaigns to horizons, hours left and capability', () => {
    expect(['draft', 'scheduled', 'active', 'ended', 'cancelled'].map(horizonOf)).toEqual(['next', 'next', 'now', 'past', 'past']);
    const now = new Date('2026-10-26T00:00:00Z');
    expect(endsInHours('active', new Date(now.getTime() + 90 * 60_000), now)).toBe(2);
    expect(endsInHours('scheduled', new Date(now.getTime() + HOUR), now)).toBeNull();
    expect(endsInHours('active', null, now)).toBeNull();
    expect(endsInHours('active', new Date(now.getTime() - HOUR), now)).toBe(0);
    expect(capabilityOf([])).toBe('none');
    expect(capabilityOf([{ canPushPrices: true }, { canPushPrices: false }])).toBe('partial');
    expect(capabilityOf([{ canPushPrices: false }])).toBe('not_supported');
    expect(maxDiscountBps(49_900, 42_858)).toBe(1411);
    expect(maxDiscountBps(49_900, 50_000)).toBe(0);
    expect(maxDiscountBps(49_900, null)).toBeNull();
    expect(THRESHOLDS.endingSoonHours).toBe(72);
  });
});

describe('overview insights', () => {
  it('counts products on promotion, earned contribution (after cost and fees), margin risk, channels and activity from real data', async () => {
    const w = await world();
    expect((await policy(w, 2000)).status).toBe(201);
    const camp = await create(w, { name: 'Festive', ...pct20, startsAt: at(-2 * DAY), endsAt: at(2 * DAY), selection: { variantIds: [w.variant.variantId] } });
    expect((await act(w, camp.id, 'schedule')).body.data.campaign.status).toBe('active');
    await order(w, { ...w.variant, qty: 8, unitMinor: 39_920, placedAt: at(-DAY) });
    await c.post(`${P}/process`, {}, w.admin);

    const o = await overview(w);
    expect(o).toMatchObject({ activeCampaigns: 1, productsOnPromotion: 1, liveProducts: 1, eligibleProducts: 1, conflictItems: 0, endingSoonCampaigns: 1, resultsCampaigns: 1, connectorLimitations: 0, listedProducts: 1, unlistedVariants: 0 });
    // 8 x 399.20 = 3,193.60 revenue; cost 8 x 300.00; commission 10% of the revenue = 319.36 -> 474.24 left, 14.85% of the revenue
    expect(o).toMatchObject({ revenueMinor: 319_360, contributionMinor: 47_424, contributionBps: 1485, contributionBasis: 'after_cost_and_fees' });
    // 14.85% at the promotional price is under the 20% policy target of the channel (fees included), although the gross floor passes
    expect(o.belowMarginTargetItems).toBe(1);
    expect(new Date(o.nextEndsAt).getTime()).toBe(new Date(camp.endsAt).getTime());
    expect(o.channels).toEqual([expect.objectContaining({ accountId: w.account.id, marketplace: 'mock', status: 'active', canPushPrices: true, capability: 'supported', activeCampaigns: 1, scheduledCampaigns: 0, liveProducts: 1, listedProducts: 1 })]);
    expect(o.recentActivity[0]).toMatchObject({ action: 'promotion.activated', campaignId: camp.id, campaignName: 'Festive' });
    expect(o.recentActivity.map((a: any) => a.action)).toEqual(expect.arrayContaining(['promotion.created']));
    expect(o.thresholds).toEqual({ ...THRESHOLDS });
    expect(o.pressure).toEqual({ strongCandidate: null, reviewFirst: null }); // the product is in a campaign: nothing to suggest
  });

  it('never guesses: no cost price means no contribution, no target means nothing below it', async () => {
    const w = await world({ cost: false, fee: false });
    await create(w, { name: 'No cost', ...pct20, startsAt: at(-DAY), endsAt: at(7 * DAY), selection: { variantIds: [w.variant.variantId] } }).then((cmp) => act(w, cmp.id, 'schedule'));
    await order(w, { ...w.variant, qty: 3, unitMinor: 39_920, placedAt: at(-HOUR) });
    await c.post(`${P}/process`, {}, w.admin);
    const o = await overview(w);
    expect(o).toMatchObject({ unitsMoved: 3, revenueMinor: 3 * 39_920, contributionMinor: null, contributionBps: null, contributionBasis: null, belowMarginTargetItems: 0, endingSoonCampaigns: 0 });
    // a workspace with no campaigns has zeros and nulls, not invented figures
    const empty = await world();
    expect(await overview(empty)).toMatchObject({ productsOnPromotion: 0, liveProducts: 0, eligibleProducts: 0, contributionMinor: null, belowMarginTargetItems: null, nextEndsAt: null, resultsCampaigns: 0, recentActivity: [] });
  });

  it('shows connectors that cannot take prices and counts campaigns per channel', async () => {
    const w = await world();
    const caps = t.container.connectors.get('mock').capabilities as any;
    const before = caps.pricing.push;
    caps.pricing.push = false;
    try {
      await create(w, { name: 'Later', ...pct20, startsAt: at(2 * DAY), endsAt: at(5 * DAY), selection: { variantIds: [w.variant.variantId] } });
      const o = await overview(w);
      expect(o.connectorLimitations).toBe(1);
      expect(o.channels[0]).toMatchObject({ canPushPrices: false, capability: 'not_supported', activeCampaigns: 0, scheduledCampaigns: 0 });
    } finally { caps.pricing.push = before; }
  });
});

describe('campaign list: filters and columns', () => {
  it('filters by horizon, channel and ending soon, sorts, and carries the new columns', async () => {
    const w = await world();
    const other = await listedVariant(w, { sku: 'OTHER-1', cost: 20_000, stock: 20 });
    const third = await listedVariant(w, { sku: 'THIRD-1', stock: 20 });
    const draft = await create(w, { name: 'B draft', ...pct20, selection: { variantIds: [w.variant.variantId] } });
    const soon = await create(w, { name: 'A ending soon', ...pct20, startsAt: at(-DAY), endsAt: at(30 * HOUR), selection: { variantIds: [other.variantId] } });
    const late = await create(w, { name: 'C ends in a week', type: 'flat_discount', valueMinor: 10_000, startsAt: at(-DAY), endsAt: at(7 * DAY), selection: { variantIds: [third.variantId] } });
    const done = await create(w, { name: 'D finished', ...pct20, startsAt: at(-5 * DAY), endsAt: at(-DAY), selection: { variantIds: [w.variant.variantId] } });
    await act(w, soon.id, 'schedule'); await act(w, late.id, 'schedule');
    await act(w, done.id, 'cancel');
    const list = async (q = '') => (await c.get(`${P}/campaigns${q}`, w.admin)).body.data;

    const all = await list();
    expect(all.horizonCounts).toEqual({ past: 1, now: 3, next: 1 });
    expect(all.counts).toMatchObject({ all: 4, draft: 1, active: 2, cancelled: 1 });
    const byName = Object.fromEntries(all.items.map((i: any) => [i.name, i]));
    expect(byName['A ending soon']).toMatchObject({ horizon: 'now', endingSoon: true, endsInHours: 30, capability: 'supported', channels: [{ canPushPrices: true, marketplace: 'mock' }], avgDiscountBps: 2000 });
    expect(byName['C ends in a week']).toMatchObject({ horizon: 'now', endingSoon: false, endsInHours: 168, avgDiscountBps: 2004 }); // 100.00 off 499.00
    expect(byName['B draft']).toMatchObject({ horizon: 'next', endingSoon: false, endsInHours: null, contributionMinor: null });
    expect(byName['D finished']).toMatchObject({ horizon: 'past' });

    expect((await list('?filter[horizon]=past')).items.map((i: any) => i.name)).toEqual(['D finished']);
    expect((await list('?filter[horizon]=next')).items.map((i: any) => i.name)).toEqual(['B draft']);
    expect((await list('?filter[horizon]=now')).total).toBe(3);
    const ending = await list('?filter[endingSoon]=true');
    expect(ending.items.map((i: any) => i.name)).toEqual(['A ending soon']);
    expect(ending.horizonCounts).toEqual({ past: 1, now: 3, next: 1 }); // the toggles keep their numbers
    expect((await list(`?filter[accountId]=${w.account.id}`)).total).toBe(4);
    expect((await list('?filter[marketplace]=mock')).total).toBe(4);
    expect((await list('?filter[marketplace]=amazon_in')).total).toBe(0);
    expect((await list('?filter[accountId]=018f0000-0000-7000-8000-000000000001')).total).toBe(0);
    expect((await list('?sort=name')).items.map((i: any) => i.name)).toEqual(['A ending soon', 'B draft', 'C ends in a week', 'D finished']);
    expect((await list('?sort=ends_soon&filter[horizon]=now')).items.map((i: any) => i.name)).toEqual(['A ending soon', 'C ends in a week', 'B draft']);
    expect((await c.get(`${P}/campaigns?sort=bogus`, w.admin)).status).toBe(400);
    expect(draft.id).toBeTruthy();
  });

  it('puts the contribution of a campaign\'s own sales on its row and its margin risk on the detail', async () => {
    const w = await world();
    expect((await policy(w, 2000)).status).toBe(201);
    const camp = await create(w, { name: 'Risky', ...pct20, startsAt: at(-DAY), endsAt: at(3 * DAY), selection: { variantIds: [w.variant.variantId] } });
    await act(w, camp.id, 'schedule');
    await order(w, { ...w.variant, qty: 2, unitMinor: 39_920, placedAt: at(-HOUR) });
    await c.post(`${P}/process`, {}, w.admin);
    const row = (await c.get(`${P}/campaigns`, w.admin)).body.data.items[0];
    expect(row).toMatchObject({ contributionMinor: 2 * 39_920 - 2 * 30_000 - Math.round(2 * 39_920 * 0.1), contributionBps: 1485, contributionBasis: 'after_cost_and_fees' });
    const d = (await c.get(`${P}/campaigns/${camp.id}`, w.admin)).body.data;
    expect(d.marginRisk).toEqual({ checkedProducts: 1, belowTarget: 1, unknownCost: 0, conflicts: 0 });
    expect(d).toMatchObject({ avgDiscountBps: 2000, contributionBps: 1485 });
    await act(w, camp.id, 'end');
    expect((await c.get(`${P}/campaigns/${camp.id}`, w.admin)).body.data.marginRisk).toBeNull();
  });
});

describe('promoted products: margin, stock and conflicts', () => {
  it('shows cost, margin at the regular and promotional price against the target, the lowest price that keeps it, and stock', async () => {
    const w = await world();
    expect((await policy(w, 2000)).status).toBe(201);
    const camp = await create(w, { name: 'Margins', ...pct20, selection: { variantIds: [w.variant.variantId] } });
    const item = (await products(w, camp.id)).items[0];
    // 499.00: 29.88% margin; 399.20 less cost 300.00 less 39.92 commission = 59.28 = 14.85%; 20% needs 428.58
    expect(item).toMatchObject({ originalPriceMinor: 49_900, promoPriceMinor: 39_920, unitCostMinor: 30_000, marginRegularBps: 2988, marginPromoBps: 1485, targetMarginBps: 2000, belowTarget: true, minPromoPriceMinor: 42_858, availableStock: 100, lowStock: false, conflict: null });
    expect(item.channelDetails).toEqual([expect.objectContaining({ accountId: w.account.id, listed: true, canPushPrices: true, regularPriceMinor: 49_900, promoPriceMinor: 39_920, discountBps: 2000, ok: true, reason: null, feesConfigured: true, maxDiscountBps: 1411 })]);
    expect((await c.get(`${P}/products`, w.admin)).body.data.items[0]).toMatchObject({ marginPromoBps: 1485, belowTarget: true });
    // a smaller discount stays above the target
    await c.patch(`${P}/campaigns/${camp.id}`, { version: 1, valueBps: 1000 }, w.admin);
    expect((await products(w, camp.id)).items[0]).toMatchObject({ promoPriceMinor: 44_910, marginPromoBps: 2320, belowTarget: false });
    // finished campaigns keep their prices as history and carry no analysis
    await act(w, camp.id, 'activate');
    await act(w, camp.id, 'end');
    const ended = (await c.get(`${P}/products?filter[status]=ended`, w.admin)).body.data.items[0];
    expect(ended).toMatchObject({ status: 'ended', marginPromoBps: null, belowTarget: null, channelDetails: [], conflict: null, availableStock: 100 });
  });

  it('leaves the margin unknown without a cost, flags low stock, and names the clash with another campaign', async () => {
    const w = await world({ cost: false, stock: 3 });
    const camp = await create(w, { name: 'First', ...pct20, startsAt: at(DAY), endsAt: at(5 * DAY), selection: { variantIds: [w.variant.variantId] } });
    expect((await products(w, camp.id)).items[0]).toMatchObject({ unitCostMinor: null, marginRegularBps: null, marginPromoBps: null, belowTarget: null, minPromoPriceMinor: null, availableStock: 3, lowStock: true });
    await act(w, camp.id, 'schedule');
    const clash = await create(w, { name: 'Second', ...pct20, startsAt: at(2 * DAY), endsAt: at(4 * DAY), selection: { variantIds: [w.variant.variantId] } });
    const item = (await products(w, clash.id)).items[0];
    expect(item).toMatchObject({ status: 'ineligible' });
    expect(item.conflict).toMatchObject({ kind: 'other_campaign' });
    expect(item.conflict.message).toMatch(/First/);
    expect(item.channelDetails[0]).toMatchObject({ ok: false, conflict: { kind: 'other_campaign' } });
  });
});

describe('candidates (the Products tab)', () => {
  it('lists every listed product per channel with real margin, stock, status and eligibility; unlisted variants are only counted', async () => {
    const w = await world({ stock: 100 });
    await sqlRun(`update product_variants set created_at = now() - interval '40 days' where id = '${w.variant.variantId}'`); // old and not selling: intelligence says promote
    const thin = await listedVariant(w, { sku: 'THIN-1', cost: 45_000, stock: 50 });
    const rich = await listedVariant(w, { sku: 'RICH-1', cost: 20_000, stock: 50 });
    const nocost = await listedVariant(w, { sku: 'NOCOST-1', stock: 50 });
    const low = await listedVariant(w, { sku: 'LOW-1', cost: 20_000, stock: 2 });
    await c.makeVariant(w.admin, { sku: 'NOTLISTED-1', priceMinor: 49_900 });

    const res = await candidates(w, '?filter[segment]=all&pageSize=100');
    expect(res.summary).toMatchObject({ listedProducts: 5, unlistedVariants: 1, placements: 5 });
    expect(res.thresholds).toEqual({ ...THRESHOLDS });
    const by = Object.fromEntries(res.items.map((r: any) => [r.sku, r]));
    expect(by[w.variant.sku]).toMatchObject({
      accountId: w.account.id, marketplace: 'mock', canPushPrices: true, regularPriceMinor: 49_900, unitCostMinor: 30_000, feesMinor: 4_990, marginBps: 2988, availableStock: 100, lowStock: false,
      recommendedAction: 'promote', eligibility: 'eligible', promotionStatus: 'recommended', existingCampaign: null, conflicts: [], pendingProposal: null,
    });
    expect(by[w.variant.sku].recommendationReasons.length).toBeGreaterThan(0);
    expect(by['THIN-1']).toMatchObject({ marginBps: -18, eligibility: 'margin_risk', promotionStatus: 'review' }); // 499.00 - 450.00 - 49.90 = -0.90 left
    expect(by['RICH-1']).toMatchObject({ marginBps: 4992, eligibility: 'eligible', promotionStatus: 'not_selected' });
    expect(by['NOCOST-1']).toMatchObject({ unitCostMinor: null, marginBps: null, eligibility: 'verification_required', promotionStatus: 'review', minPromoPriceMinor: null, maxDiscountBps: null });
    expect(by['LOW-1']).toMatchObject({ availableStock: 2, lowStock: true, eligibility: 'low_inventory', promotionStatus: 'review' });
    expect(by['NOTLISTED-1']).toBeUndefined();
    expect(res.counts).toEqual({ all: 5, recommended: 1, review: 3, not_selected: 1, connector_unavailable: 0 });
    expect(thin.variantId && rich.variantId && nocost.variantId && low.variantId).toBeTruthy();

    // the recommended segment is what intelligence recommends plus what needs a look; priority puts recommended first
    const rec = await candidates(w, '?pageSize=100');
    expect(rec.total).toBe(4);
    expect(rec.items[0].sku).toBe(w.variant.sku);
    expect(rec.counts.all).toBe(5); // counts ignore the segment
    expect((await candidates(w, '?filter[status]=not_selected')).items.map((r: any) => r.sku)).toEqual(['RICH-1']);

    // quick filters, search, sorting, paging
    const q = async (s: string) => (await candidates(w, `?filter[segment]=all&${s}`)).items.map((r: any) => r.sku);
    expect((await q('filter[quick]=high_margin')).sort()).toEqual(['LOW-1', 'RICH-1']); // THIN-1 and the 29.88% product stay under 30%
    expect((await q('filter[quick]=eligible')).sort()).toEqual([w.variant.sku, 'RICH-1'].sort());
    expect((await q('filter[quick]=high_inventory&sort=stock'))[0]).toBe(w.variant.sku);
    expect((await q('filter[quick]=high_inventory')).sort()).toEqual([w.variant.sku, 'NOCOST-1', 'RICH-1', 'THIN-1'].sort());
    expect(await q('filter[quick]=strong_sellers')).toEqual([]);
    expect((await q('filter[quick]=not_in_campaign')).length).toBe(5);
    expect(await q('q=low-1')).toEqual(['LOW-1']);
    expect((await q('sort=margin')).slice(0, 2)).toEqual(['LOW-1', 'RICH-1']); // equal margins keep the sku order
    expect((await q('sort=margin')).slice(-1)).toEqual(['NOCOST-1']); // unknown margins last
    const page2 = await candidates(w, '?filter[segment]=all&pageSize=2&page=2&sort=name');
    expect(page2).toMatchObject({ page: 2, pageSize: 2, total: 5, pages: 3 });
    expect(page2.items).toHaveLength(2);
    expect((await c.get(`${P}/candidates?filter[quick]=bogus`, w.admin)).status).toBe(400);
    expect((await candidates(w, `?filter[accountId]=${w.account.id}&filter[segment]=all`)).total).toBe(5);
    expect((await candidates(w, '?filter[marketplace]=nope&filter[segment]=all')).total).toBe(0);
  });

  it('knows what a product is already in, what would clash, and what the connector cannot do', async () => {
    const w = await world({ stock: 100 });
    await sqlRun(`update product_variants set created_at = now() - interval '40 days' where id = '${w.variant.variantId}'`);
    const camp = await create(w, { name: 'Running', ...pct20, startsAt: at(-DAY), endsAt: at(3 * DAY), selection: { variantIds: [w.variant.variantId] } });
    await act(w, camp.id, 'schedule');
    let row = (await candidates(w, '?filter[segment]=all')).items[0];
    expect(row).toMatchObject({ eligibility: 'conflict', promotionStatus: 'review', existingCampaign: { id: camp.id, name: 'Running', status: 'active' } });
    expect(row.conflicts[0]).toMatchObject({ kind: 'other_campaign' });
    expect(row.eligibilityReason).toMatch(/Running/);
    expect((await candidates(w, '?filter[segment]=all&filter[quick]=not_in_campaign')).total).toBe(0);
    await act(w, camp.id, 'end');
    row = (await candidates(w, '?filter[segment]=all')).items[0];
    expect(row).toMatchObject({ eligibility: 'eligible', existingCampaign: null });

    // a draft is "in a campaign" but blocks nothing
    await create(w, { name: 'Just a draft', ...pct20, selection: { variantIds: [w.variant.variantId] } });
    row = (await candidates(w, '?filter[segment]=all')).items[0];
    expect(row).toMatchObject({ eligibility: 'eligible', existingCampaign: { name: 'Just a draft', status: 'draft' } });

    // a pending price proposal is a warning, not a block
    expect((await c.post('/api/v1/pricing/competitor-prices', { variantId: w.variant.variantId, priceMinor: 40_000, sellerName: 'Rival' }, w.admin)).status).toBe(201);
    expect((await c.post('/api/v1/pricing/policies', { name: 'Match', accountId: w.account.id, strategy: 'automated_match', targetMarginMinBps: 2000, maxDiscountBps: 2000 }, w.admin)).status).toBe(201);
    await c.post('/api/v1/pricing/proposals/generate', {}, w.admin);
    row = (await candidates(w, '?filter[segment]=all')).items[0];
    expect(row.pendingProposal).toMatchObject({ id: expect.any(String), proposedPriceMinor: expect.any(Number) });
    expect(row.conflicts.map((x: any) => x.kind)).toContain('pending_price_proposal');
    expect(row.eligibility).toBe('eligible');

    // a connector that cannot take prices
    const caps = t.container.connectors.get('mock').capabilities as any;
    const before = caps.pricing.push;
    caps.pricing.push = false;
    try {
      row = (await candidates(w, '?filter[segment]=all')).items[0];
      expect(row).toMatchObject({ canPushPrices: false, eligibility: 'not_provided', promotionStatus: 'connector_unavailable' });
      expect((await candidates(w, '?filter[segment]=all')).counts).toMatchObject({ connector_unavailable: 1, recommended: 0 });
      expect((await overview(w)).channels[0].opportunities).toBe(0);
    } finally { caps.pricing.push = before; }
  });

  it('feeds the overview: opportunities, the pressure picks and the channel row', async () => {
    const w = await world({ stock: 100 });
    await sqlRun(`update product_variants set created_at = now() - interval '40 days' where id = '${w.variant.variantId}'`);
    const hot = await listedVariant(w, { sku: 'HOT-1', cost: 20_000, stock: 80 });
    const scarce = await listedVariant(w, { sku: 'SCARCE-1', cost: 20_000, stock: 2 });
    const sold = (variantId: string, sku: string, units: number) => sqlRun(`insert into analytics_daily_products (vendor_id, day, variant_id, sku, units, revenue_minor) values ('${w.admin.vendorId}', (now() - interval '3 days')::date, '${variantId}', '${sku}', ${units}, ${units * 49_900})`);
    await sold(hot.variantId, 'HOT-1', 60);
    await sold(scarce.variantId, 'SCARCE-1', 10);
    const o = await overview(w);
    expect(o.opportunities).toBe(1); // the old product that is not selling
    expect(o.channels[0]).toMatchObject({ listedProducts: 3, opportunities: 1 });
    expect(o.pressure.strongCandidate).toMatchObject({ sku: 'HOT-1', eligibility: 'eligible', availableStock: 80, marginBps: 4992, unitsSold30d: 60 });
    expect(o.pressure.reviewFirst).toMatchObject({ sku: 'SCARCE-1', eligibility: 'low_inventory', availableStock: 2, unitsSold30d: 10 });
    expect(await (async () => (await candidates(w, '?filter[segment]=all&filter[quick]=strong_sellers')).items.map((r: any) => r.sku))()).toEqual(['HOT-1']);
  });
});

describe('preview (the Create Campaign dialog)', () => {
  it('prices products per channel with margin, floor and conflicts, and writes nothing', async () => {
    const w = await world();
    expect((await policy(w, 2000)).status).toBe(201);
    const nocost = await listedVariant(w, { sku: 'NOCOST-1', stock: 10 });
    const unlisted = await c.makeVariant(w.admin, { sku: 'NOTLISTED-1', priceMinor: 49_900 });
    const before = (await c.get(`${P}/campaigns`, w.admin)).body.data.total;
    const res = await c.post(`${P}/preview`, { ...pct20, variantIds: [w.variant.variantId, nocost.variantId, unlisted.variantId, '018f0000-0000-7000-8000-000000000001'] }, w.admin);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = res.body.data;
    expect(d.summary).toMatchObject({ products: 3, placements: 3, notListed: 1, belowMarginTarget: 1, unknownCost: 1, conflicts: 0, connectorCannotPush: 0, unknownVariants: 1, avgDiscountBps: 2000 });
    const by = Object.fromEntries(d.items.map((i: any) => [i.sku, i]));
    expect(by[w.variant.sku]).toMatchObject({ regularPriceMinor: 49_900, promoPriceMinor: 39_920, discountBps: 2000, marginRegularBps: 2988, marginPromoBps: 1485, targetMarginBps: 2000, belowTarget: true, minPromoPriceMinor: 42_858, maxDiscountBps: 1411, ok: true, availableStock: 100, productName: expect.any(String) });
    expect(by['NOCOST-1']).toMatchObject({ marginPromoBps: null, belowTarget: null, ok: true });
    expect(by['NOTLISTED-1']).toMatchObject({ listed: false, ok: false });
    expect(by['NOTLISTED-1'].reason).toMatch(/no active listing/);
    expect(d.summary.notRunnable).toBe(1);
    expect((await c.get(`${P}/campaigns`, w.admin)).body.data.total).toBe(before); // nothing saved

    // a flat discount larger than the price, and the other campaign's window
    const flat = await c.post(`${P}/preview`, { type: 'flat_discount', valueMinor: 60_000, variantIds: [w.variant.variantId] }, w.admin);
    expect(flat.body.data.items[0]).toMatchObject({ ok: false, promoPriceMinor: 0 });
    const camp = await create(w, { name: 'Taken', ...pct20, startsAt: at(DAY), endsAt: at(4 * DAY), selection: { variantIds: [w.variant.variantId] } });
    await act(w, camp.id, 'schedule');
    const clash = await c.post(`${P}/preview`, { ...pct20, startsAt: at(2 * DAY).toISOString(), endsAt: at(3 * DAY).toISOString(), variantIds: [w.variant.variantId] }, w.admin);
    expect(clash.body.data.summary).toMatchObject({ conflicts: 1, runnable: 0 });
    expect(clash.body.data.items[0].conflict).toMatchObject({ kind: 'other_campaign' });
  });

  it('validates the terms like the create call, needs promotions:read and stays inside the business', async () => {
    const w = await world();
    expect((await c.post(`${P}/preview`, { type: 'percentage_discount', variantIds: [w.variant.variantId] }, w.admin)).status).toBe(400);
    expect((await c.post(`${P}/preview`, { type: 'percentage_discount', valueBps: 100, flat: 1, variantIds: [] }, w.admin)).status).toBe(400);
    expect((await c.post(`${P}/preview`, { ...pct20, accountIds: ['018f0000-0000-7000-8000-000000000001'], variantIds: [w.variant.variantId] }, w.admin)).status).toBe(404);
    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    expect((await c.post(`${P}/preview`, { ...pct20, variantIds: [w.variant.variantId] }, viewer)).status).toBe(200);
    expect((await c.get(`${P}/candidates`, viewer)).status).toBe(200);
    const other = await world();
    const foreign = await c.post(`${P}/preview`, { ...pct20, variantIds: [w.variant.variantId] }, other.admin);
    expect(foreign.body.data.summary).toMatchObject({ products: 0, unknownVariants: 1 });
    expect((await candidates(other, '?filter[segment]=all')).items.every((r: any) => r.variantId !== w.variant.variantId)).toBe(true);
  });
});
