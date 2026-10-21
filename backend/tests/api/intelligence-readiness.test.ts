import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { buildWorld, orderArrives, pickAndPack, ship, type World } from '../helpers/stage4';
import { classify, defaultPeriod } from '../../modules/ai/src/brain';
import { parsePeriod, resolveTurn } from '../../modules/ai/src/followup';
import { confidenceOf, decide, marginOf, trendOf, type Facts } from '../../modules/ai/src/intelligence';
import { splitWindows } from '../../modules/analytics/src/profit';
import { parseAmountMinor, parseSpendDate } from '../../modules/analytics/src/spend';
import { delta } from '../../modules/analytics/src/waterfall';

/**
 * INTELLIGENCE readiness: the profitability bridge and advertising spend (analytics), product intelligence and the assistant's
 * conversations / insights (ai). Pure rules first, then the screens' flows through the real API.
 */
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
const NOW = new Date('2026-10-16T10:00:00Z'); // a Friday

describe('pure rules', () => {
  const facts = (over: Partial<Facts> = {}): Facts => ({
    available: 50, onHand: 50, hasStockRecord: true, unitsPerDay: 1, units30: 30, coverDays: 50, flags: [], trend: 'stable', trendChangePercent: 0, marginPercent: 40, priceMinor: 10_000, costMinor: 6_000,
    competitorMinor: null, competitorFresh: false, leadDays: 14, leadDaysSource: 'default', ageDays: 10, variantAgeDays: 60, suggestedReorderUnits: null, ...over,
  });

  it('trend: 14 days against the 14 before, silent with too little data', () => {
    expect(trendOf(10, 5)).toEqual({ trend: 'accelerating', changePercent: 100 });
    expect(trendOf(5, 10)).toEqual({ trend: 'declining', changePercent: -50 });
    expect(trendOf(6, 6)).toEqual({ trend: 'stable', changePercent: 0 });
    expect(trendOf(2, 1)).toEqual({ trend: null, changePercent: null });
    expect(trendOf(5, 0)).toEqual({ trend: 'accelerating', changePercent: null });
  });

  it('margin needs both a price and a cost', () => {
    expect(marginOf(10_000, 6_000)).toBe(40);
    expect(marginOf(10_000, null)).toBeNull();
    expect(marginOf(null, 100)).toBeNull();
    expect(marginOf(0, 100)).toBeNull();
  });

  it('reorder when the stock does not outlast the restock time plus a week', () => {
    const a = decide(facts({ coverDays: 10, suggestedReorderUnits: 20 }));
    expect(a.action).toBe('reorder');
    expect(a.reasons.map((r) => r.key)).toEqual(['runway_below_lead_time', 'suggested_quantity']);
    expect(a.reasons[0]!.values).toMatchObject({ coverDays: 10, leadDays: 14 });
    expect(decide(facts({ coverDays: 21 })).action).toBe('hold'); // 14 + 7 days is the line
    expect(decide(facts({ coverDays: 20.9 })).action).toBe('reorder');
    expect(decide(facts({ available: 0, onHand: 0, coverDays: 0, unitsPerDay: 2 })).reasons[0]!.key).toBe('out_of_stock_selling');
    expect(decide(facts({ available: 0, unitsPerDay: 0, units30: 0, coverDays: null })).reasons[0]!.key).toBe('no_activity');
  });

  it('liquidate excess or aging stock, never when it is about to run out', () => {
    expect(decide(facts({ available: 400, coverDays: 400, flags: ['excess'] })).action).toBe('liquidate');
    expect(decide(facts({ available: 40, unitsPerDay: 0, units30: 0, coverDays: null, ageDays: 150, flags: ['aging', 'excess'] })).reasons.map((r) => r.key)).toEqual(['excess_stock', 'aging_stock']);
  });

  it('raise the price when well below the competitor or when the margin is thin', () => {
    const r = decide(facts({ competitorMinor: 12_500 }));
    expect(r.action).toBe('raise_price');
    expect(r.reasons[0]).toMatchObject({ key: 'below_competitor', values: { gapPercent: 25 } });
    expect(decide(facts({ competitorMinor: 10_400 })).action).toBe('hold');
    expect(decide(facts({ marginPercent: 8 })).reasons[0]!.key).toBe('thin_margin');
    expect(decide(facts({ marginPercent: null, competitorMinor: null })).action).toBe('hold');
  });

  it('promote slow or declining products that have stock and margin to give', () => {
    expect(decide(facts({ unitsPerDay: 0.1, units30: 3, coverDays: 500 })).action).toBe('promote');
    expect(decide(facts({ trend: 'declining', trendChangePercent: -40 })).reasons[0]).toMatchObject({ key: 'demand_declining' });
    expect(decide(facts({ unitsPerDay: 0.1, units30: 3, coverDays: 500, marginPercent: 10 })).action).toBe('hold');
    expect(decide(facts({ unitsPerDay: 0.1, units30: 3, coverDays: 500, variantAgeDays: 5 })).action).toBe('hold'); // too new to judge
  });

  it('confidence only counts the evidence there is', () => {
    const full = confidenceOf(facts({ competitorFresh: true }));
    expect(full.score).toBe(100);
    expect(full.level).toBe('high');
    const base = confidenceOf(facts());
    expect(base.score).toBe(90);
    const bare = confidenceOf(facts({ units30: 3, costMinor: null, hasStockRecord: false, variantAgeDays: 2 }));
    expect(bare).toMatchObject({ score: 4, level: 'low' });
    expect(bare.factors.find((f) => f.key === 'cost_price')).toMatchObject({ met: false, weight: 0 });
  });

  it('periods in words', () => {
    expect(parsePeriod('and last month?', NOW)).toMatchObject({ from: '2026-09-01', to: '2026-09-30', label: 'last month' });
    expect(parsePeriod('this month', NOW)).toMatchObject({ from: '2026-10-01', to: '2026-10-16' });
    expect(parsePeriod('last week', NOW)).toMatchObject({ from: '2026-10-05', to: '2026-10-11' });
    expect(parsePeriod('this week', NOW)).toMatchObject({ from: '2026-10-12', to: '2026-10-16' });
    expect(parsePeriod('over the last 14 days', NOW)).toMatchObject({ from: '2026-10-03', to: '2026-10-16', label: 'last 14 days' });
    expect(parsePeriod('what about yesterday', NOW)).toMatchObject({ from: '2026-10-15', to: '2026-10-15' });
    expect(parsePeriod('which will run out next month', NOW)).toBeNull();
    expect(defaultPeriod().label).toBe('last 30 days');
  });

  it('follow-ups use the previous turn, real questions stand alone', () => {
    const prev = { intent: 'stockout_risk' as const, period: null, horizon: 7 };
    expect(resolveTurn('and next month?', prev, NOW)).toMatchObject({ followUp: 'period', opts: { intent: 'stockout_risk', horizon: 30 } });
    expect(resolveTurn('which of those?', prev, NOW)).toMatchObject({ followUp: 'detail', opts: { intent: 'stockout_risk', horizon: 7 } });
    const sales = { intent: 'sales_summary' as const, period: null, horizon: null };
    expect(resolveTurn('and last month?', sales, NOW)).toMatchObject({ followUp: 'period', opts: { intent: 'sales_summary', period: { label: 'last month' } } });
    expect(resolveTurn('and returns?', sales, NOW)).toMatchObject({ followUp: 'topic', opts: { intent: 'returns' } });
    expect(resolveTurn('What is my return rate over the last 7 days?', sales, NOW)).toMatchObject({ followUp: null, opts: { intent: 'returns', period: { label: 'last 7 days' } } });
    expect(resolveTurn('and last month?', null, NOW)).toMatchObject({ followUp: null, opts: {} });
    expect(classify('and last month?')).toBe('unknown');
  });

  it('amounts and dates of a spend file, without floats', () => {
    expect(parseAmountMinor('1,250.50', 'rupees')).toBe(125_050);
    expect(parseAmountMinor('Rs 99', 'rupees')).toBe(9_900);
    expect(parseAmountMinor(`${String.fromCodePoint(0x20b9)}10.5`, 'rupees')).toBe(1_050);
    expect(parseAmountMinor('INR 0', 'rupees')).toBe(0);
    expect(parseAmountMinor('10.555', 'rupees')).toBeNull();
    expect(parseAmountMinor('-5', 'rupees')).toBeNull();
    expect(parseAmountMinor('abc', 'rupees')).toBeNull();
    expect(parseAmountMinor('1250', 'paise')).toBe(1_250);
    expect(parseAmountMinor('12.5', 'paise')).toBeNull();
    expect(parseSpendDate('2026-10-01')).toBe('2026-10-01');
    expect(parseSpendDate('01/10/2026')).toBe('2026-10-01');
    expect(parseSpendDate('1-2-2026')).toBe('2026-02-01');
    expect(parseSpendDate('31-02-2026')).toBeNull();
    expect(parseSpendDate('2026-13-01')).toBeNull();
  });

  it('long ranges are read in contiguous windows; differences are null when unknown', () => {
    const w = splitWindows({ from: '2026-01-01', to: '2026-12-31' });
    expect(w).toHaveLength(12);
    expect(w[0]).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(w[1]!.from).toBe('2026-02-01');
    expect(w[11]!.to).toBe('2026-12-31');
    expect(splitWindows({ from: '2026-03-05', to: '2026-03-05' })).toEqual([{ from: '2026-03-05', to: '2026-03-05' }]);
    expect(delta(150, 100)).toEqual({ changeMinor: 50, changePercent: 50 });
    expect(delta(50, -100)).toEqual({ changeMinor: 150, changePercent: 150 });
    expect(delta(null, 100)).toEqual({ changeMinor: null, changePercent: null });
    expect(delta(100, 0)).toEqual({ changeMinor: 100, changePercent: null });
  });
});

describe('intelligence API', () => {
  let t: TestApp;
  let c: ReturnType<typeof clientFor>;
  let w: World;
  let admin: Actor;
  let staff: Actor;
  let viewer: Actor;
  let other: Actor;
  let orderA: any;
  let orderB: any;

  /** run SQL as the table owner (bypasses RLS): arrange facts the API cannot produce on purpose */
  const owner = async <T = any>(q: string, params: unknown[] = []): Promise<T[]> => {
    const pg = t.database!.pg;
    await pg.exec('RESET ROLE');
    try { return (await pg.query<T>(q, params)).rows; } finally { await pg.exec('SET ROLE oms_app'); }
  };
  const revenueOf = (o: any): number => o.items.reduce((s: number, i: any) => s + i.unitPriceMinor * i.quantity - (i.discountMinor ?? 0), 0);
  const waterfall = async (as: Actor, qs = '') => c.get(`/api/v1/analytics/profitability/waterfall${qs}`, as);
  const step = (r: any, key: string) => r.body.data.steps.find((s: any) => s.key === key);
  const csv = (body: string) => c.call('POST', '/api/v1/analytics/marketing-spend/import', { as: admin, raw: body, contentType: 'text/csv' });

  beforeAll(async () => {
    t = await buildTestApp({ database: true });
    c = clientFor(t);
    w = await buildWorld(t, c, { warehouses: 1, stock: [100], sku: 'TRV-1042' });
    admin = w.admin;
    staff = await c.addMember(admin, 'vendor_staff');
    viewer = await c.addMember(admin, 'vendor_viewer');
    other = await c.registerVendor({ businessName: 'Other Co' });
  });
  afterAll(() => t.close());

  describe('profitability bridge', () => {
    const deliver = async (qty: number) => {
      const o = await orderArrives(t, c, w, qty);
      const f = (await c.post(`/api/v1/orders/${o.id}/fulfillment`, {}, admin)).body.data.fulfillments[0];
      await pickAndPack(t, c, w, f.id);
      await ship(t, c, w, f.id);
      return o;
    };

    it('without cost, fees or ads nothing is invented', async () => {
      orderA = await deliver(2);
      orderB = await deliver(1);
      const r = await waterfall(admin);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data.steps.map((s: any) => s.key)).toEqual(['gross_revenue', 'returns_refunds', 'product_cost', 'marketplace_fees', 'shipping', 'advertising', 'net_contribution']);
      expect(step(r, 'gross_revenue')).toMatchObject({ amountMinor: revenueOf(orderA) + revenueOf(orderB), basis: 'actual', type: 'positive' });
      expect(step(r, 'product_cost')).toMatchObject({ amountMinor: null, basis: 'missing' });
      expect(step(r, 'net_contribution')).toMatchObject({ amountMinor: null, type: 'subtotal' });
      expect(r.body.data.netContributionMinor).toBeNull();
      expect(r.body.data.missing).toEqual(expect.arrayContaining(['productCost', 'marketplaceFees', 'advertising']));
      expect(r.body.data.completeness).toBe('incomplete');
    });

    it('with cost, fees, shipping and recorded spend the bridge adds up', async () => {
      expect((await c.patch(`/api/v1/variants/${w.variant.variantId}`, { costPriceMinor: 20_000 }, admin)).status).toBe(200);
      expect((await c.put(`/api/v1/orders/${orderA.id}/financials`, { marketplaceFeeMinor: 5_000, penaltyMinor: 0 }, admin)).status).toBe(200);
      expect((await c.put(`/api/v1/orders/${orderB.id}/financials`, { marketplaceFeeMinor: 3_000, penaltyMinor: 0 }, admin)).status).toBe(200);

      let r = await waterfall(admin);
      expect(step(r, 'product_cost')).toMatchObject({ amountMinor: -60_000, basis: 'estimated', coverage: 1 });
      expect(step(r, 'marketplace_fees')).toMatchObject({ amountMinor: -8_000, basis: 'actual' });
      expect(step(r, 'shipping')).toMatchObject({ basis: 'actual', coverage: 1 });
      expect(step(r, 'shipping').amountMinor).toBeLessThan(0);
      expect(step(r, 'advertising')).toMatchObject({ amountMinor: null, basis: 'missing' });
      expect(step(r, 'advertising').tooltip).toContain('marketing spend');
      expect(r.body.data.missing).toEqual(['advertising']);
      const known = r.body.data.knownPartMinor;
      expect(known).toBe(['gross_revenue', 'returns_refunds', 'product_cost', 'marketplace_fees', 'shipping'].reduce((s, k) => s + step(r, k).amountMinor, 0));

      // record the advertising: now there is a net figure
      const spend = await c.post('/api/v1/analytics/marketing-spend', { spendDate: ago(1), accountId: w.account.id, amountMinor: 10_000, campaign: 'Sponsored products' }, admin);
      expect(spend.status, JSON.stringify(spend.body)).toBe(201);
      expect(spend.body.data).toMatchObject({ amountMinor: 10_000, accountName: expect.any(String), marketplace: 'mock', source: 'manual', campaign: 'Sponsored products' });
      r = await waterfall(admin);
      expect(step(r, 'advertising')).toMatchObject({ amountMinor: -10_000, basis: 'actual' });
      const net = step(r, 'net_contribution');
      expect(net.amountMinor).toBe(known - 10_000);
      expect(net.basis).toBe('estimated'); // the cost price is a current-cost estimate
      expect(r.body.data).toMatchObject({ netContributionMinor: known - 10_000, missing: [], completeness: 'estimated', ordersAnalysed: 2, ordersInRange: 2, truncated: false, windows: 1 });
      expect(net.shareOfRevenuePercent).toBe(Math.round((Math.abs(net.amountMinor) / r.body.data.grossRevenueMinor) * 1000) / 10);
      expect(r.body.data.netMarginPercent).toBe(Math.round((net.amountMinor / r.body.data.grossRevenueMinor) * 1000) / 10);
      expect(r.body.data.comparison).toBeNull();

      // the screen's table: one marketplace, same numbers
      expect(r.body.data.channels).toHaveLength(1);
      expect(r.body.data.channels[0]).toMatchObject({
        channel: 'mock', label: 'Sandbox', orders: 2, grossRevenue: { amountMinor: r.body.data.grossRevenueMinor }, cogs: { amountMinor: 60_000 }, marketplaceFees: { amountMinor: 8_000 },
        advertisingSpend: { amountMinor: 10_000, basis: 'actual' }, netProfitMinor: known - 10_000, missing: [],
      });
    });

    it('spend that belongs to no marketplace is in the total but in no channel row', async () => {
      const before = (await waterfall(admin)).body.data;
      expect((await c.post('/api/v1/analytics/marketing-spend', { spendDate: ago(2), amountMinor: 2_500 }, admin)).status).toBe(201);
      const r = await waterfall(admin);
      expect(step(r, 'advertising').amountMinor).toBe(-12_500);
      expect(r.body.data.unallocatedAdvertisingMinor).toBe(2_500);
      expect(r.body.data.channels[0].advertisingSpend.amountMinor).toBe(10_000);
      expect(r.body.data.netContributionMinor).toBe(before.netContributionMinor - 2_500);
    });

    it('compare=previous returns the period before with the differences', async () => {
      await owner(`update orders set placed_at = now() - interval '40 days' where id = $1`, [orderB.id]);
      const r = await waterfall(admin, '?compare=previous');
      const revA = revenueOf(orderA);
      const revB = revenueOf(orderB);
      expect(r.body.data.grossRevenueMinor).toBe(revA);
      expect(r.body.data.comparison).toMatchObject({
        previousGrossRevenueMinor: revB, ordersAnalysed: 1, truncated: false, grossRevenue: { changeMinor: revA - revB, changePercent: Math.round(((revA - revB) / revB) * 1000) / 10 },
        previousNetContributionMinor: null, netContribution: { changeMinor: null, changePercent: null }, // no ads were recorded for that period
      });
      expect(r.body.data.comparison.range.to < r.body.data.range.from).toBe(true);
      expect(step(r, 'product_cost')).toMatchObject({ amountMinor: -40_000, previousAmountMinor: -20_000, change: { changeMinor: -20_000, changePercent: -100 } });

      const p = await c.get('/api/v1/analytics/profitability?groupBy=marketplace&compare=previous', admin);
      expect(p.status).toBe(200);
      expect(p.body.data.total.revenue.amountMinor).toBe(revA);
      expect(p.body.data.comparison.total.revenue.amountMinor).toBe(revB);
      expect(p.body.data.comparison.deltas.revenue).toMatchObject({ changeMinor: revA - revB });
      expect(p.body.data.advertising).toMatchObject({ amountMinor: 12_500, basis: 'actual' });
      expect(p.body.data.groups[0]).toMatchObject({ key: 'mock', advertising: { amountMinor: 10_000 } });
      expect(p.body.data.total.contributionMinor).not.toBeNull(); // before advertising, as documented
      const noCompare = await c.get('/api/v1/analytics/profitability', admin);
      expect(noCompare.body.data.comparison).toBeNull();
      expect(noCompare.body.data.groups[0].advertising).toBeNull(); // per product: spend is not attributable
    });

    it('ranges up to 366 days are read in windows, longer ones are refused', async () => {
      const to = ago(0);
      const year = await c.get(`/api/v1/analytics/profitability/waterfall?from=${ago(365)}&to=${to}`, admin);
      expect(year.status, JSON.stringify(year.body)).toBe(200);
      expect(year.body.data).toMatchObject({ windows: 12, ordersAnalysed: 2, ordersInRange: 2, truncated: false });
      expect(step(year, 'gross_revenue').amountMinor).toBe(revenueOf(orderA) + revenueOf(orderB));
      expect((await c.get(`/api/v1/analytics/profitability?from=${ago(367)}&to=${to}`, admin)).status).toBe(400);
      expect((await c.get(`/api/v1/analytics/profitability/waterfall?from=${to}&to=${ago(5)}`, admin)).status).toBe(400);
      expect((await c.get('/api/v1/analytics/profitability/waterfall?from=2026-02-30&to=2026-03-01', admin)).status).toBe(400);
      expect((await c.get('/api/v1/analytics/profitability/waterfall?compare=next', admin)).status).toBe(400);
    });

    it('is read-only for viewers and staff, tenant isolated', async () => {
      expect((await waterfall(viewer)).status).toBe(200);
      expect((await waterfall(staff)).status).toBe(200);
      expect((await c.get('/api/v1/analytics/profitability/waterfall')).status).toBe(401);
      const o = await waterfall(other);
      expect(o.body.data).toMatchObject({ grossRevenueMinor: 0, ordersAnalysed: 0, channels: [], netContributionMinor: null });
      expect(step(o, 'advertising').basis).toBe('missing');
    });
  });

  describe('marketing spend', () => {
    let row: any;

    it('records, lists and filters spend', async () => {
      const a = await c.post('/api/v1/analytics/marketing-spend', { spendDate: ago(60), accountId: w.account.id, amountMinor: 150_000, campaign: 'Diwali burst', notes: 'week 1' }, admin);
      expect(a.status, JSON.stringify(a.body)).toBe(201);
      row = a.body.data;
      expect(a.headers.location).toContain(row.id);
      await c.post('/api/v1/analytics/marketing-spend', { spendDate: ago(61), amountMinor: 0 }, admin); // "no ads that day" is a valid fact
      const list = await c.get(`/api/v1/analytics/marketing-spend?from=${ago(70)}&to=${ago(50)}`, admin);
      expect(list.body.data).toMatchObject({ total: 2, page: 1, pages: 1 });
      expect(list.body.data.items.map((x: any) => x.spendDate)).toEqual([ago(60), ago(61)]); // newest first
      expect((await c.get(`/api/v1/analytics/marketing-spend?from=${ago(70)}&to=${ago(50)}&unallocated=true`, admin)).body.data.total).toBe(1);
      expect((await c.get(`/api/v1/analytics/marketing-spend?from=${ago(70)}&to=${ago(50)}&accountId=${w.account.id}`, admin)).body.data.total).toBe(1);
      expect((await c.get(`/api/v1/analytics/marketing-spend?q=diwali&from=${ago(70)}&to=${ago(50)}`, admin)).body.data.items[0].id).toBe(row.id);
      const sum = (await c.get(`/api/v1/analytics/marketing-spend/summary?from=${ago(70)}&to=${ago(50)}`, admin)).body.data;
      expect(sum).toMatchObject({ rows: 2, totalMinor: 150_000 });
      expect(sum.byAccount.find((x: any) => x.accountId === w.account.id)).toMatchObject({ marketplace: 'mock', amountMinor: 150_000 });
      expect(sum.byCampaign[0]).toMatchObject({ campaign: 'Diwali burst', amountMinor: 150_000 });
      expect(sum.byDay).toHaveLength(2);
    });

    it('validates what it stores', async () => {
      const post = (b: object) => c.post('/api/v1/analytics/marketing-spend', b, admin);
      expect((await post({ spendDate: ago(-3), amountMinor: 100 })).body.error.details.rule).toBe('future_date');
      expect((await post({ spendDate: ago(3000), amountMinor: 100 })).body.error.details.rule).toBe('date_too_old');
      expect((await post({ spendDate: '2026-02-30', amountMinor: 100 })).status).toBe(400);
      expect((await post({ spendDate: ago(5), amountMinor: -1 })).status).toBe(400);
      expect((await post({ spendDate: ago(5), amountMinor: 1.5 })).status).toBe(400);
      expect((await post({ spendDate: ago(5), amountMinor: 100_000_000_001 })).status).toBe(400);
      expect((await post({ spendDate: ago(5), amountMinor: 100, accountId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
      expect((await post({ spendDate: ago(5), amountMinor: 100, extra: true })).status).toBe(201); // unknown keys are ignored
    });

    it('corrects and deletes, with audit', async () => {
      const p = await c.patch(`/api/v1/analytics/marketing-spend/${row.id}`, { amountMinor: 175_000, accountId: null }, admin);
      expect(p.status, JSON.stringify(p.body)).toBe(200);
      expect(p.body.data).toMatchObject({ amountMinor: 175_000, accountId: null, accountName: null, campaign: 'Diwali burst' });
      expect((await c.patch(`/api/v1/analytics/marketing-spend/${row.id}`, {}, admin)).body.error.details.rule).toBe('empty_patch');
      expect((await c.patch(`/api/v1/analytics/marketing-spend/${row.id}`, { spendDate: ago(-9) }, admin)).status).toBe(400);
      const audits = await owner(`select action from audit_logs where resource_id = $1 order by created_at`, [row.id]);
      expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['analytics.marketing_spend_created', 'analytics.marketing_spend_updated']));
      const d = await c.del(`/api/v1/analytics/marketing-spend/${row.id}`, admin);
      expect(d.body.data).toEqual({ id: row.id, deleted: true });
      expect((await c.del(`/api/v1/analytics/marketing-spend/${row.id}`, admin)).status).toBe(404);
      expect((await c.patch(`/api/v1/analytics/marketing-spend/${row.id}`, { amountMinor: 1 }, admin)).status).toBe(404);
    });

    it('only people who may change pricing write; everyone with analytics reads; tenants are separate', async () => {
      const body = { spendDate: ago(5), amountMinor: 100 };
      expect((await c.post('/api/v1/analytics/marketing-spend', body, staff)).status).toBe(403);
      expect((await c.post('/api/v1/analytics/marketing-spend', body, viewer)).status).toBe(403);
      expect((await c.call('POST', '/api/v1/analytics/marketing-spend/import', { as: viewer, raw: 'date,amount\n2026-01-01,1', contentType: 'text/csv' })).status).toBe(403);
      expect((await c.get('/api/v1/analytics/marketing-spend', viewer)).status).toBe(200);
      expect((await c.get('/api/v1/analytics/marketing-spend/summary', staff)).status).toBe(200);
      expect((await c.get('/api/v1/analytics/marketing-spend')).status).toBe(401);

      const mine = (await c.get(`/api/v1/analytics/marketing-spend?from=${ago(3)}&to=${ago(0)}`, admin)).body.data.items[0];
      expect((await c.get('/api/v1/analytics/marketing-spend', other)).body.data.total).toBe(0);
      expect((await c.patch(`/api/v1/analytics/marketing-spend/${mine.id}`, { amountMinor: 1 }, other)).status).toBe(404);
      expect((await c.del(`/api/v1/analytics/marketing-spend/${mine.id}`, other)).status).toBe(404);
      expect((await c.post('/api/v1/analytics/marketing-spend', { ...body, accountId: w.account.id }, other)).status).toBe(404); // someone else's account
    });

    it('imports a CSV: rupees to minor units, idempotent, corrected amounts update, bad rows are reported', async () => {
      const file = [
        'Date,Account,Amount,Campaign', `${ago(80)},mock,"1,250.50",Brand`, `${ago(79)},,Rs 99,`, `${ago(78)},mock,300,Brand`,
        `${ago(77)},mock,12.345,Bad amount`, 'not-a-date,mock,10,X', `${ago(76)},nowhere,10,Unknown account`, `${ago(78)},mock,5,Brand`,
      ].join('\n');
      const first = await csv(file);
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect(first.body.data).toMatchObject({ rows: 7, created: 3, updated: 0, unchanged: 0, failed: 4, dryRun: false });
      expect(first.body.data.errors.map((e: any) => [e.row, e.field])).toEqual([[5, 'amount'], [6, 'date'], [7, 'account'], [8, null]]);
      const list = (await c.get(`/api/v1/analytics/marketing-spend?from=${ago(81)}&to=${ago(75)}`, admin)).body.data.items;
      expect(list.map((x: any) => [x.spendDate, x.amountMinor, x.source])).toEqual([[ago(78), 30_000, 'import'], [ago(79), 9_900, 'import'], [ago(80), 125_050, 'import']]);
      expect(list.find((x: any) => x.spendDate === ago(79)).accountId).toBeNull();

      const again = await csv(file);
      expect(again.body.data).toMatchObject({ created: 0, updated: 0, unchanged: 3, failed: 4 });
      const fixed = await c.call('POST', '/api/v1/analytics/marketing-spend/import?dryRun=true', { as: admin, raw: `date,account,amount,campaign\n${ago(80)},mock,2000,Brand\n${ago(70)},mock,5,New`, contentType: 'text/csv' });
      expect(fixed.body.data).toMatchObject({ created: 1, updated: 1, dryRun: true });
      expect((await c.get(`/api/v1/analytics/marketing-spend?from=${ago(70)}&to=${ago(70)}`, admin)).body.data.total).toBe(0); // dry run saved nothing
      const real = await c.call('POST', '/api/v1/analytics/marketing-spend/import', { as: admin, raw: `date,account,amount,campaign\n${ago(80)},mock,2000,Brand`, contentType: 'text/csv' });
      expect(real.body.data).toMatchObject({ created: 0, updated: 1 });
      expect((await c.get(`/api/v1/analytics/marketing-spend?from=${ago(80)}&to=${ago(80)}`, admin)).body.data.items[0].amountMinor).toBe(200_000);
      const paise = await c.call('POST', '/api/v1/analytics/marketing-spend/import?unit=paise', { as: admin, raw: `date,amount\n${ago(75)},1250`, contentType: 'text/csv' });
      expect(paise.body.data).toMatchObject({ created: 1, failed: 0 });
      expect((await c.get(`/api/v1/analytics/marketing-spend?from=${ago(75)}&to=${ago(75)}`, admin)).body.data.items[0].amountMinor).toBe(1_250);
    });

    it('refuses unusable files', async () => {
      expect((await csv('date,campaign\n2026-01-01,x')).body.error.details).toMatchObject({ rule: 'missing_column', column: 'amount' });
      expect((await c.call('POST', '/api/v1/analytics/marketing-spend/import', { as: admin, raw: '', contentType: 'text/csv' })).status).toBe(400);
      const many = ['date,amount', ...Array.from({ length: 5_001 }, () => `${ago(1)},1`)].join('\n');
      expect((await csv(many)).status).toBe(413);
    });
  });

  describe('product intelligence', () => {
    const ids: Record<string, { variantId: string; productId: string; sku: string }> = {};
    const sales = async (variantId: string, sku: string, unitsByDaysAgo: Array<[number, number]>) => {
      for (const [d, units] of unitsByDaysAgo) await owner(`insert into analytics_daily_products (vendor_id, day, variant_id, sku, units, revenue_minor) values ($1, $2::date, $3, $4, $5, $6)`, [admin.vendorId, ago(d), variantId, sku, units, units * 10_000]);
    };

    beforeAll(async () => {
      const wh = w.warehouses[0]!.id;
      const make = async (key: string, o: { stock?: number; price?: number; cost?: number }) => {
        const v = await c.makeVariant(admin, { sku: `PI-${key}`, priceMinor: o.price ?? 10_000, title: `Intel ${key}` });
        if (o.cost !== undefined) expect((await c.patch(`/api/v1/variants/${v.variantId}`, { costPriceMinor: o.cost }, admin)).status).toBe(200);
        if (o.stock) await c.stock(admin, v.variantId, wh, o.stock);
        ids[key] = v;
        return v;
      };
      await make('REORDER', { stock: 30, cost: 6_000 });
      await make('LIQUIDATE', { stock: 400, cost: 6_000 });
      await make('RAISE', { stock: 100, cost: 6_000 });
      await make('PROMOTE', { stock: 100, cost: 6_000 });
      await make('HOLD', { cost: 6_000 });
      // 5 units a day for 30 days, 30 in stock: 6 days of cover against a 14 day restock
      await sales(ids.REORDER!.variantId, 'PI-REORDER', Array.from({ length: 30 }, (_, i) => [i, 5] as [number, number]));
      // slow but present sales with a mountain of stock
      await sales(ids.LIQUIDATE!.variantId, 'PI-LIQUIDATE', [[3, 3]]);
      await sales(ids.RAISE!.variantId, 'PI-RAISE', Array.from({ length: 30 }, (_, i) => [i, 3] as [number, number]));
      await owner(`insert into competitor_prices (vendor_id, variant_id, price_minor, seller_name) values ($1, $2, 13_000, 'RivalMart')`, [admin.vendorId, ids.RAISE!.variantId]);
      await owner(`update product_variants set created_at = now() - interval '60 days' where vendor_id = $1`, [admin.vendorId]);
    });

    const list = (qs = '', as: Actor = admin) => c.get(`/api/v1/product-intelligence${qs}`, as);
    const find = (r: any, key: string) => r.body.data.items.find((i: any) => i.sku === `PI-${key}`);

    it('one recommendation per variant, with the facts behind it', async () => {
      const r = await list('?pageSize=100');
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(find(r, 'REORDER')).toMatchObject({
        recommendedAction: 'reorder', salesVelocity: 5, unitsSold30d: 150, marginPercent: 40, productName: 'Intel REORDER', inventory: { available: 30, runwayDays: 6, leadTimeDays: 14 }, competitor: null,
      });
      const reorder = find(r, 'REORDER');
      expect(reorder.reasons[0]).toMatchObject({ key: 'runway_below_lead_time', values: { coverDays: 6, leadDays: 14 } });
      expect(reorder.inventory.suggestedReorderUnits).toBe(120); // 30 days of sales (150) minus what is there
      expect(reorder.reasons[0].text).toContain('6 days');
      expect(find(r, 'LIQUIDATE')).toMatchObject({ recommendedAction: 'liquidate', velocityTrend: null });
      expect(find(r, 'LIQUIDATE').reasons.map((x: any) => x.key)).toEqual(expect.arrayContaining(['excess_stock']));
      const raise = find(r, 'RAISE');
      expect(raise).toMatchObject({ recommendedAction: 'raise_price', competitor: { priceMinor: 13_000, sellerName: 'RivalMart', gapPercent: 30 } });
      expect(raise.reasons[0]).toMatchObject({ key: 'below_competitor', values: { gapPercent: 30 } });
      expect(find(r, 'HOLD')).toMatchObject({ recommendedAction: 'hold', salesVelocity: 0, marginPercent: 40 });
      expect(find(r, 'HOLD').reasons[0].key).toBe('no_activity');
      expect(find(r, 'PROMOTE')).toMatchObject({ recommendedAction: 'promote' });
      expect(find(r, 'PROMOTE').reasons.map((x: any) => x.key)).toEqual(['slow_sales', 'margin_room']);
    });

    it('confidence is data coverage', async () => {
      const r = await list('?pageSize=100');
      const reorder = find(r, 'REORDER').confidence;
      expect(reorder).toMatchObject({ score: 90, level: 'high' }); // 30+ units, cost, stock, old enough; no competitor
      expect(find(r, 'RAISE').confidence.score).toBe(100); // plus a fresh competitor price
      const hold = find(r, 'HOLD').confidence;
      expect(hold.score).toBe(35); // cost 20 + age 15: no sales and no stock record
      expect(hold.level).toBe('low');
      expect(hold.factors.find((f: any) => f.key === 'sales_history')).toMatchObject({ weight: 0, met: false });
    });

    it('filters, sorts, searches and pages; the summary counts every action', async () => {
      const r = await list('?pageSize=100');
      const counted = (a: string) => r.body.data.items.filter((i: any) => i.recommendedAction === a).length;
      expect(r.body.data.summary).toEqual({ reorder: counted('reorder'), liquidate: counted('liquidate'), raise_price: counted('raise_price'), promote: counted('promote'), hold: counted('hold') });
      expect(r.body.data.summary).toMatchObject({ reorder: 1, raise_price: 1 });
      expect(r.body.data.summary.promote).toBeGreaterThanOrEqual(1);
      expect(r.body.data.summary.liquidate).toBeGreaterThanOrEqual(1); // the main test product barely sells: months of cover
      expect(r.body.data.variantsAnalysed).toBe(r.body.data.total);
      expect(r.body.data.items[0].recommendedAction).toBe('reorder'); // most urgent first
      const only = await list('?filter[action]=raise_price');
      expect(only.body.data).toMatchObject({ total: 1, summary: r.body.data.summary });
      expect(only.body.data.items[0].sku).toBe('PI-RAISE');
      expect((await list('?q=intel%20liq')).body.data.items.map((i: any) => i.sku)).toEqual(['PI-LIQUIDATE']);
      const page = await list('?pageSize=2&page=2&sort=velocity');
      expect(page.body.data).toMatchObject({ page: 2, pageSize: 2, pages: Math.ceil(r.body.data.total / 2) });
      const byVelocity = (await list('?sort=velocity&pageSize=100')).body.data.items.map((i: any) => i.salesVelocity);
      expect(byVelocity).toEqual([...byVelocity].sort((a: number, b: number) => b - a));
      const byMargin = (await list('?sort=margin&pageSize=100')).body.data.items.map((i: any) => i.marginPercent);
      expect(byMargin).toEqual([...byMargin].sort((a: number, b: number) => b - a));
      expect((await list('?filter[categoryId]=00000000-0000-4000-8000-000000000000')).body.data.total).toBe(0);
    });

    it('a warehouse filter looks at that warehouse only', async () => {
      const wh = w.warehouses[0]!.id;
      const second = await c.makeWarehouse(admin, { code: 'WH9' });
      expect(find(await list(`?filter[warehouseId]=${wh}&pageSize=100`), 'REORDER').inventory.available).toBe(30);
      const empty = find(await list(`?filter[warehouseId]=${second.id}&pageSize=100`), 'REORDER');
      expect(empty.inventory.available).toBe(0);
      expect(empty.reasons[0].key).toBe('out_of_stock_selling');
    });

    it('rejects bad parameters, reads for viewers, isolates tenants', async () => {
      expect((await list('?filter[action]=explode')).status).toBe(400);
      expect((await list('?sort=nope')).status).toBe(400);
      expect((await list('?filter[warehouseId]=abc')).status).toBe(400);
      expect((await list('', viewer)).status).toBe(200);
      expect((await c.get('/api/v1/product-intelligence')).status).toBe(401);
      expect((await list('', other)).body.data).toMatchObject({ total: 0, items: [], summary: { reorder: 0, liquidate: 0, raise_price: 0, promote: 0, hold: 0 } });
    });

    it('trend appears once there are enough units in both fortnights', async () => {
      await sales(ids.PROMOTE!.variantId, 'PI-PROMOTE', [[2, 4], [20, 30]]); // 4 recent against 30 before: down 86.7%, still 88 days of cover
      const r = await list('?pageSize=100');
      expect(find(r, 'PROMOTE')).toMatchObject({ velocityTrend: 'declining', trendChangePercent: -86.7, recommendedAction: 'promote' });
      expect(find(r, 'PROMOTE').reasons[0].key).toBe('demand_declining');
    });
  });

  describe('assistant conversations', () => {
    let conv: any;
    let member: Actor;
    const post = (id: string, text: string, as: Actor = admin) => c.post(`/api/v1/ai/conversations/${id}/messages`, { text }, as);

    beforeAll(async () => {
      member = await c.addMember(admin, 'vendor_admin');
      await c.post('/api/v1/analytics/rollups/rebuild', { from: ago(0), to: ago(0) }, admin);
    });

    it('starts a conversation named after its first question', async () => {
      const r = await c.post('/api/v1/ai/conversations', {}, admin);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      conv = r.body.data;
      expect(conv).toMatchObject({ title: 'New conversation', status: 'active', messagesCount: 0 });
      const first = await post(conv.id, 'Which products are likely to run out this week?');
      expect(first.status, JSON.stringify(first.body)).toBe(201);
      const { assistantMessage, userMessage, conversation, followUp } = first.body.data;
      expect(followUp).toBeNull();
      expect(userMessage).toMatchObject({ role: 'user', content: 'Which products are likely to run out this week?' });
      expect(assistantMessage).toMatchObject({ role: 'assistant', intent: 'stockout_risk', confidence: 'data', generatedBy: 'rules' });
      expect(assistantMessage.content).toContain('PI-REORDER');
      expect(assistantMessage.sources.length).toBeGreaterThan(0);
      expect(assistantMessage.dataVisual).toMatchObject({ type: 'warning', title: 'Products at risk of running out' });
      expect(assistantMessage.dataVisual.details.some((d: any) => d.label === 'PI-REORDER')).toBe(true);
      expect(assistantMessage.suggestedActions[0]).toMatchObject({ actionType: 'navigate', targetUrl: '/product-intelligence' });
      expect(conversation).toMatchObject({ title: 'Which products are likely to run out this week?', messagesCount: 2 });
      expect(Date.parse(assistantMessage.timestamp)).toBeGreaterThan(Date.parse(userMessage.timestamp));
    });

    it('follow-ups reuse the previous question type', async () => {
      const next = await post(conv.id, 'and next month?');
      expect(next.body.data.followUp).toBe('period');
      expect(next.body.data.assistantMessage.intent).toBe('stockout_risk');
      expect(next.body.data.assistantMessage.content).toContain('30 days');
      const which = await post(conv.id, 'which of those?');
      expect(which.body.data.followUp).toBe('detail');
      expect(which.body.data.assistantMessage.intent).toBe('stockout_risk');

      const sales = await post(conv.id, 'How are sales doing?');
      expect(sales.body.data.followUp).toBeNull();
      expect(sales.body.data.assistantMessage.dataVisual).toMatchObject({ type: 'kpi', title: 'Sales summary' });
      expect(sales.body.data.assistantMessage.dataVisual.details.map((d: any) => d.label)).toEqual(['Orders', 'Revenue', 'Average order', 'Cancellation rate', 'Return rate']);
      expect(sales.body.data.assistantMessage.content).toMatch(/^Last 30 days: \d+ orders/);
      const lastMonth = await post(conv.id, 'and last month?');
      expect(lastMonth.body.data.followUp).toBe('period');
      expect(lastMonth.body.data.assistantMessage.intent).toBe('sales_summary');
      expect(lastMonth.body.data.assistantMessage.content).toMatch(/^Last month: /);
      const topic = await post(conv.id, 'and returns?');
      expect(topic.body.data).toMatchObject({ followUp: 'topic', assistantMessage: { intent: 'returns' } });
      expect(topic.body.data.assistantMessage.content).toContain('Return rate over the last month');
    });

    it('says so when it cannot answer, instead of guessing', async () => {
      const r = await post(conv.id, 'write me a poem about shoes');
      expect(r.body.data.assistantMessage).toMatchObject({ intent: 'unknown', confidence: 'none', dataVisual: null });
      expect(r.body.data.assistantMessage.suggestedActions.length).toBeGreaterThan(0);
    });

    it('keeps the history: list, read, rename, archive, restore', async () => {
      const list = await c.get('/api/v1/ai/conversations', admin);
      expect(list.body.data).toMatchObject({ total: 1, page: 1 });
      expect(list.body.data.items[0]).toMatchObject({ id: conv.id, messagesCount: 14, status: 'active' });
      const one = await c.get(`/api/v1/ai/conversations/${conv.id}`, admin);
      expect(one.body.data.messages).toHaveLength(14);
      expect(one.body.data.messages.map((m: any) => m.role).slice(0, 4)).toEqual(['user', 'assistant', 'user', 'assistant']);
      expect(one.body.data.messages[1].dataVisual.title).toBe('Products at risk of running out');

      const renamed = await c.patch(`/api/v1/ai/conversations/${conv.id}`, { title: 'Stock planning' }, admin);
      expect(renamed.body.data.title).toBe('Stock planning');
      expect((await c.get('/api/v1/ai/conversations?q=planning', admin)).body.data.total).toBe(1);
      expect((await c.patch(`/api/v1/ai/conversations/${conv.id}`, {}, admin)).body.error.details.rule).toBe('empty_patch');
      expect((await c.patch(`/api/v1/ai/conversations/${conv.id}`, { status: 'archived' }, admin)).body.data.status).toBe('archived');
      expect((await c.get('/api/v1/ai/conversations', admin)).body.data.total).toBe(0);
      expect((await c.get('/api/v1/ai/conversations?filter[status]=archived', admin)).body.data.total).toBe(1);
      expect((await c.get('/api/v1/ai/conversations?filter[status]=all', admin)).body.data.total).toBe(1);
      expect((await post(conv.id, 'How are sales doing?')).body.error.details.rule).toBe('conversation_archived');
      await c.patch(`/api/v1/ai/conversations/${conv.id}`, { status: 'active' }, admin);
      expect((await post(conv.id, 'How are sales doing?')).status).toBe(201);
    });

    it('a conversation is private to its user and its business', async () => {
      expect((await c.get(`/api/v1/ai/conversations/${conv.id}`, member)).status).toBe(404); // a colleague, even an admin
      expect((await c.get('/api/v1/ai/conversations', member)).body.data.total).toBe(0);
      expect((await post(conv.id, 'How are sales doing?', member)).status).toBe(404);
      expect((await c.patch(`/api/v1/ai/conversations/${conv.id}`, { title: 'mine now' }, member)).status).toBe(404);
      expect((await c.del(`/api/v1/ai/conversations/${conv.id}`, member)).status).toBe(404);
      expect((await c.get(`/api/v1/ai/conversations/${conv.id}`, other)).status).toBe(404);
      expect((await c.get('/api/v1/ai/conversations', other)).body.data.total).toBe(0);
    });

    it('needs the right to use AI and a valid message', async () => {
      expect((await c.post('/api/v1/ai/conversations', {}, viewer)).status).toBe(403);
      expect((await c.get('/api/v1/ai/conversations', viewer)).status).toBe(403);
      expect((await c.get('/api/v1/ai/insights', viewer)).status).toBe(403);
      expect((await c.post('/api/v1/ai/conversations', {})).status).toBe(401);
      expect((await post(conv.id, 'hi')).status).toBe(400);
      expect((await post(conv.id, 'x'.repeat(501))).status).toBe(400);
      expect((await post('not-a-uuid', 'How are sales doing?')).status).toBe(400);
      expect((await c.post('/api/v1/ai/conversations', { title: '' }, admin)).status).toBe(400);
    });

    it('stops at the message cap', async () => {
      const full = (await c.post('/api/v1/ai/conversations', { title: 'Long one' }, admin)).body.data;
      await owner(`update ai_conversations set message_count = 199 where id = $1`, [full.id]);
      const r = await post(full.id, 'How are sales doing?');
      expect(r.status).toBe(409);
      expect(r.body.error.details).toMatchObject({ rule: 'conversation_full', limit: 200 });
      await owner(`update ai_conversations set message_count = 198 where id = $1`, [full.id]);
      expect((await post(full.id, 'How are sales doing?')).status).toBe(201);
    });

    it('two questions at once are both stored', async () => {
      const fresh = (await c.post('/api/v1/ai/conversations', {}, admin)).body.data;
      const [a, b] = await Promise.all([post(fresh.id, 'How are sales doing?'), post(fresh.id, 'What is my return rate?')]);
      expect([a.status, b.status]).toEqual([201, 201]);
      const one = (await c.get(`/api/v1/ai/conversations/${fresh.id}`, admin)).body.data;
      expect(one.messagesCount).toBe(4);
      expect(one.messages).toHaveLength(4);
    });

    it('honours the AI switch: history stays readable, asking stops', async () => {
      expect((await c.put('/api/v1/ai/settings', { enabled: false }, admin)).status).toBe(200);
      const r = await post(conv.id, 'How are sales doing?');
      expect(r.status).toBe(403);
      expect(r.body.error.details.rule).toBe('ai_disabled');
      expect((await c.post('/api/v1/ai/conversations', {}, admin)).status).toBe(403);
      expect((await c.get('/api/v1/ai/insights', admin)).status).toBe(403);
      expect((await c.get(`/api/v1/ai/conversations/${conv.id}`, admin)).status).toBe(200);
      expect((await c.get('/api/v1/product-intelligence', admin)).status).toBe(200); // nothing generated there
      await c.put('/api/v1/ai/settings', { enabled: true }, admin);
    });

    it('deletes a conversation with its messages', async () => {
      const d = await c.del(`/api/v1/ai/conversations/${conv.id}`, admin);
      expect(d.body.data).toEqual({ id: conv.id, deleted: true });
      expect((await c.get(`/api/v1/ai/conversations/${conv.id}`, admin)).status).toBe(404);
      expect((await owner(`select count(*)::int c from ai_messages where conversation_id = $1`, [conv.id]))[0].c).toBe(0);
    });
  });

  describe('insights', () => {
    it('cards from real data, most urgent first, each with a prompt for the assistant', async () => {
      const r = await c.get('/api/v1/ai/insights?limit=20', admin);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const cards = r.body.data as any[];
      const reorder = cards.find((x) => x.id.startsWith('stock:'));
      expect(reorder).toMatchObject({ category: 'stock', source: 'product_intelligence', headline: expect.stringMatching(/PI-REORDER/) });
      expect(reorder.suggestedPrompt).toMatch(/^Show me recommended replenishment quantities/);
      expect(reorder.metric.key).toBe('weeklySalesMinor');
      expect(reorder.metricImpact).toContain('weekly sales');
      const raiseId = (await c.get('/api/v1/product-intelligence?filter[action]=raise_price', admin)).body.data.items[0].variantId;
      const pricing = cards.find((x) => x.id === `pricing:${raiseId}`);
      expect(pricing).toMatchObject({ category: 'pricing', headline: 'PI-RAISE is priced below the competitor' });
      expect(pricing.metricImpact).toContain('more per month');
      const rank = { critical: 0, warning: 1, info: 2 } as const;
      const order = cards.map((x) => rank[x.severity as keyof typeof rank]);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect((await c.get('/api/v1/ai/insights?limit=1', admin)).body.data).toHaveLength(1);
      expect((await c.get('/api/v1/ai/insights?limit=0', admin)).status).toBe(400);
    });

    it('advertising that returns little revenue becomes a campaign card', async () => {
      expect((await c.post('/api/v1/analytics/marketing-spend', { spendDate: ago(1), amountMinor: 50_000_000 }, admin)).status).toBe(201);
      const cards = (await c.get('/api/v1/ai/insights?limit=20', admin)).body.data as any[];
      const card = cards.find((x) => x.id === 'campaign:low_return');
      expect(card).toMatchObject({ category: 'campaign', source: 'advertising', severity: 'warning' });
      expect(card.metric.key).toBe('revenueToSpend');
      expect(card.metric.value).toBeLessThan(1);
    });

    it('other businesses get no cards from this business data', async () => {
      expect((await c.get('/api/v1/ai/insights', other)).body.data).toEqual([]);
    });
  });

  describe('existing behaviour stays', () => {
    it('/ai/ask answers exactly as before, with the 30 day wording', async () => {
      const a = await c.post('/api/v1/ai/ask', { question: 'How are sales doing?' }, admin);
      expect(a.status).toBe(200);
      expect(a.body.data.answer).toMatch(/^Last 30 days: \d+ orders/);
      
      expect((await c.post('/api/v1/ai/ask', { question: 'hi' }, admin)).status).toBe(400);
      expect((await c.get('/api/v1/analytics/profitability?groupBy=order', admin)).body.data).toMatchObject({ groupBy: 'order', ordersAnalysed: 1 });
    });
  });
});
