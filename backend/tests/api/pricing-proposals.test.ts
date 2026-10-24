import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withSystem, withVendor, schema, eq } from '@oms/database';
import { createPriceProposal, expireProposals, latestCompetitorPrices, pricingModule } from '../../modules/pricing/src/index';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { buildWorld, orderArrives, type World } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());

const API = '/api/v1/pricing';
/** price 499.00, MRP 599.00, cost 300.00, marketplace fee 10%: unit margin 14910 = 29.88% */
async function world(o: { fee?: boolean } = {}) {
  const w = await buildWorld(t, c, { warehouses: 1, stock: [50] });
  expect((await c.patch(`/api/v1/variants/${w.variant.variantId}`, { costPriceMinor: 30_000 }, w.admin)).status).toBe(200);
  if (o.fee !== false) expect((await c.put(`/api/v1/analytics/fee-profiles/${w.account.id}`, { feePercentBps: 1000, fixedFeeMinor: 0 }, w.admin)).status).toBe(200);
  const staff = await c.addMember(w.admin, 'vendor_staff');
  const viewer = await c.addMember(w.admin, 'vendor_viewer');
  return { w, staff, viewer };
}
const competitor = (w: World, priceMinor: number, extra: Record<string, unknown> = {}) => c.post(`${API}/competitor-prices`, { variantId: w.variant.variantId, priceMinor, sellerName: 'RivalMart', ...extra }, w.admin);
const policy = (w: World, body: Record<string, unknown> = {}, as: Actor = w.admin) => c.post(`${API}/policies`, { name: 'Match the market', accountId: w.account.id, strategy: 'automated_match', targetMarginMinBps: 2000, maxDiscountBps: 2000, ...body }, as);
const generate = (w: World, body: Record<string, unknown> = {}, as: Actor = w.admin) => c.post(`${API}/proposals/generate`, body, as);
const proposals = async (w: World, q = '') => (await c.get(`${API}/proposals${q}`, w.admin)).body.data;
const listingPrice = async (w: World) => (await c.get(`/api/v1/listings/${w.variant.listingId}`, w.admin)).body.data.priceMinor;

describe('competitor prices', () => {
  it('records, lists, imports CSV and deletes; the export returns the newest per variant', async () => {
    const { w, staff, viewer } = await world();
    const a = await competitor(w, 47_500, { observedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.data).toMatchObject({ variantId: w.variant.variantId, sku: w.variant.sku, priceMinor: 47_500, sellerName: 'RivalMart', source: 'manual' });
    const b = await competitor(w, 46_000);
    const list = (await c.get(`${API}/competitor-prices?latest=true`, w.admin)).body.data;
    expect(list).toMatchObject({ total: 1, items: [{ id: b.body.data.id, priceMinor: 46_000 }] });
    expect((await c.get(`${API}/competitor-prices`, w.admin)).body.data.total).toBe(2);
    expect((await c.get(`${API}/competitor-prices?q=${w.variant.sku}`, w.admin)).body.data.total).toBe(2);
    expect((await c.get(`${API}/competitor-prices?q=nothing-like-this`, w.admin)).body.data.total).toBe(0);
    // the exported contract: newest observation per variant
    const latest = await withVendor(t.database!.db, w.admin.vendorId!, (tx) => latestCompetitorPrices(tx, w.admin.vendorId!, [w.variant.variantId, '00000000-0000-4000-8000-000000000000']));
    expect([...latest.keys()]).toEqual([w.variant.variantId]);
    expect(latest.get(w.variant.variantId)).toMatchObject({ priceMinor: 46_000, sellerName: 'RivalMart', accountId: null });

    // CSV: rupees, quoted cells, bad rows reported and skipped
    const csv = ['sku,price,seller', `${w.variant.sku},449.50,"Rival, Inc"`, 'NOPE-SKU,100,X', `${w.variant.sku},abc,Y`, `${w.variant.sku},0,Z`].join('\n');
    expect((await c.call('POST', `${API}/competitor-prices/import`, { as: staff, raw: csv, contentType: 'text/csv' })).status).toBe(403); // staff read pricing, they do not change it
    const imp = await c.call('POST', `${API}/competitor-prices/import`, { as: w.admin, raw: csv, contentType: 'text/csv' });
    expect(imp.status, JSON.stringify(imp.body)).toBe(200);
    expect(imp.body.data).toMatchObject({ total: 4, imported: 1, skipped: 3 });
    expect(imp.body.data.rows.map((r: any) => [r.line, r.status])).toEqual([[2, 'imported'], [3, 'skipped'], [4, 'skipped'], [5, 'skipped']]);
    expect(imp.body.data.rows[1].reason).toBe('unknown sku');
    expect((await c.get(`${API}/competitor-prices?latest=true`, w.admin)).body.data.items[0]).toMatchObject({ priceMinor: 44_950, sellerName: 'Rival, Inc', source: 'import' });
    expect((await c.post(`${API}/competitor-prices/import`, { csv: `sku,price\n${w.variant.sku},400` }, w.admin)).body.data.imported).toBe(1);
    expect((await c.post(`${API}/competitor-prices/import`, { csv: 'sku,cost\nA,1' }, w.admin)).status).toBe(400);
    expect((await c.post(`${API}/competitor-prices/import`, { csv: 'sku,price' }, w.admin)).status).toBe(400);

    // rules
    expect((await competitor(w, 0)).status).toBe(400);
    expect((await c.post(`${API}/competitor-prices`, { variantId: '00000000-0000-4000-8000-000000000000', priceMinor: 100 }, w.admin)).status).toBe(404);
    expect((await competitor(w, 100, { accountId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await competitor(w, 100, { observedAt: new Date(Date.now() + 86_400_000).toISOString() })).status).toBe(400);
    expect((await c.get(`${API}/competitor-prices`, viewer)).status).toBe(200);
    expect((await competitor(w, 100, {})).status).toBe(201);
    expect((await c.post(`${API}/competitor-prices`, { variantId: w.variant.variantId, priceMinor: 100 }, viewer)).status).toBe(403);
    expect((await c.del(`${API}/competitor-prices/${a.body.data.id}`, viewer)).status).toBe(403);
    expect((await c.del(`${API}/competitor-prices/${a.body.data.id}`, w.admin)).status).toBe(200);
    expect((await c.del(`${API}/competitor-prices/${a.body.data.id}`, w.admin)).status).toBe(404);

    // tenant isolation
    const other = await c.registerVendor({ businessName: 'Other Biz' });
    expect((await c.get(`${API}/competitor-prices`, other)).body.data.total).toBe(0);
    expect((await c.del(`${API}/competitor-prices/${b.body.data.id}`, other)).status).toBe(404);
  });
});

describe('policies', () => {
  it('CRUD with affectedVariants, validation, version lock and permissions', async () => {
    const { w, staff, viewer } = await world();
    const p = await policy(w);
    expect(p.status, JSON.stringify(p.body)).toBe(201);
    expect(p.body.data).toMatchObject({ name: 'Match the market', strategy: 'automated_match', accountId: w.account.id, status: 'active', affectedVariants: 1, targetMarginMinBps: 2000, maxDiscountBps: 2000, autoApproveUnderBps: 0, version: 1 });
    expect((await policy(w, {}, staff)).status).toBe(403);
    const all = await policy(w, { name: 'Everywhere', accountId: null, strategy: 'velocity_boost', params: { stepBps: 300 } });
    expect(all.status, JSON.stringify(all.body)).toBe(201);
    expect(all.body.data).toMatchObject({ accountId: null, channel: 'All connected channels', affectedVariants: 1 });
    expect((await c.post(`${API}/policies/preview`, { accountId: w.account.id }, w.admin)).body.data.affectedVariants).toBe(1);
    expect((await c.get(`${API}/policies`, viewer)).body.data.map((x: any) => x.name)).toEqual(['Match the market', 'Everywhere']);
    expect((await c.get(`${API}/policies?filter[status]=paused`, w.admin)).body.data).toEqual([]);
    expect((await c.get(`${API}/policies/${p.body.data.id}`, viewer)).body.data.name).toBe('Match the market');

    // validation
    expect((await policy(w, { strategy: 'margin_floor', targetMarginMinBps: 0 })).body.error.details.rule).toBe('margin_floor_needs_target');
    expect((await policy(w, { strategy: 'custom' })).body.error.details.rule).toBe('custom_needs_target_margin');
    expect((await policy(w, { params: { typo: 1 } })).status).toBe(400);
    expect((await policy(w, { maxDiscountBps: 10_001 })).status).toBe(400);
    expect((await policy(w, { name: '  ' })).status).toBe(400);
    expect((await policy(w, { accountId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await policy(w, {}, viewer)).status).toBe(403);

    // update + version lock
    const paused = await c.patch(`${API}/policies/${p.body.data.id}`, { status: 'paused', version: 1 }, w.admin);
    expect(paused.body.data).toMatchObject({ status: 'paused', version: 2 });
    const stale = await c.patch(`${API}/policies/${p.body.data.id}`, { name: 'Renamed', version: 1 }, w.admin);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect((await c.patch(`${API}/policies/${p.body.data.id}`, { strategy: 'margin_floor', targetMarginMinBps: 0 }, w.admin)).status).toBe(400);
    expect((await c.patch(`${API}/policies/${p.body.data.id}`, { name: 'Renamed' }, viewer)).status).toBe(403);
    expect((await c.get(`${API}/policies?filter[status]=paused`, w.admin)).body.data).toHaveLength(1);

    // tenant isolation, delete
    const other = await c.registerVendor({ businessName: 'Other Biz' });
    expect((await c.get(`${API}/policies`, other)).body.data).toEqual([]);
    expect((await c.get(`${API}/policies/${p.body.data.id}`, other)).status).toBe(404);
    expect((await c.del(`${API}/policies/${p.body.data.id}`, other)).status).toBe(404);
    expect((await c.del(`${API}/policies/${p.body.data.id}`, w.admin)).status).toBe(200);
    expect((await c.get(`${API}/policies/${p.body.data.id}`, w.admin)).status).toBe(404);
  });
});

describe('proposal generation', () => {
  it('honest evaluation: no competitor price, no proposal; then guardrails, supersede, dry run, history-based estimates', async () => {
    const { w } = await world();
    expect((await generate(w)).body.data.result).toMatchObject({ evaluated: 1, proposed: 0, items: [{ status: 'skipped', reason: 'no active policy applies' }] });
    await policy(w);
    const none = (await generate(w)).body.data;
    expect(none).toMatchObject({ queued: false, truncated: false, result: { evaluated: 1, proposed: 0, skipped: 1 } });
    expect(none.result.items[0].reason).toBe('Match the market: no competitor price on record');
    expect((await proposals(w)).total).toBe(0);

    await competitor(w, 44_900);
    const dry = (await generate(w, { dryRun: true })).body.data.result;
    expect(dry).toMatchObject({ dryRun: true, proposed: 1 });
    expect((await proposals(w)).total).toBe(0); // a dry run writes nothing

    const real = (await generate(w)).body.data.result;
    expect(real).toMatchObject({ proposed: 1, autoApplied: 0 });
    const list = await proposals(w);
    expect(list.counts).toMatchObject({ pending_review: 1, approved: 0, all: 1 });
    expect(list.items[0]).toMatchObject({
      status: 'pending_review', strategy: 'automated_match', sku: w.variant.sku, productTitle: 'Stage 4 tee', channelName: expect.stringContaining('mock'), marketplace: 'mock',
      currentPriceMinor: 49_900, proposedPriceMinor: 44_900, competitorPriceMinor: 44_900, estMarginDeltaBps: 2_318 - 2_988, projectedSalesDeltaBps: null, policyName: 'Match the market', pushSkipped: false, version: 1,
    });
    expect(list.items[0].reasoning).toContain('Competitor price is Rs 449.00');
    expect(new Date(list.items[0].expiresAt).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    const first = list.items[0].id;

    // the same result again keeps the same open proposal
    expect((await generate(w)).body.data.result).toMatchObject({ unchanged: 1, proposed: 0 });
    expect((await proposals(w)).items[0].id).toBe(first);

    // the competitor drops far below the guardrail: the new proposal is clamped to the margin floor and supersedes the first
    await competitor(w, 38_000);
    expect((await generate(w)).body.data.result.items[0]).toMatchObject({ status: 'proposed', proposedPriceMinor: 42_858 });
    const after = await proposals(w);
    expect(after.counts).toMatchObject({ pending_review: 1, superseded: 1, all: 2 });
    expect(after.items.find((p: any) => p.status === 'pending_review').reasoning).toContain('Limited to Rs 428.58');
    expect((await c.get(`${API}/proposals/${first}`, w.admin)).body.data).toMatchObject({ status: 'superseded', decisionNote: 'Superseded by a newer proposal' });
    expect((await proposals(w, '?filter[status]=superseded')).total).toBe(1);

    // real sales make the sales projection available (5 units in 30 days; elasticity 1.5)
    await orderArrives(t, c, w, 5);
    await competitor(w, 42_900);
    expect((await generate(w)).body.data.result.items[0]).toMatchObject({ status: 'proposed', proposedPriceMinor: 42_900 });
    const withSales = (await proposals(w, '?filter[status]=pending_review')).items[0];
    expect(withSales.projectedSalesDeltaBps).toBe(2_105); // price -1403 bps x 1.5
    expect(withSales.priceChangeBps).toBe(-1_403);
  });

  it('filters, search, paging and ordering of the queue', async () => {
    const { w, viewer } = await world();
    await policy(w);
    await competitor(w, 46_000);
    await generate(w);
    expect((await proposals(w, `?q=${w.variant.sku}`)).total).toBe(1);
    expect((await proposals(w, '?q=zzz-nothing')).total).toBe(0);
    expect((await proposals(w, `?filter[accountId]=${w.account.id}&filter[strategy]=automated_match`)).total).toBe(1);
    expect((await proposals(w, '?filter[strategy]=velocity_boost')).total).toBe(0);
    expect((await proposals(w, '?filter[status]=approved')).counts.pending_review).toBe(1); // counts ignore the status filter
    expect((await proposals(w, '?pageSize=1&page=2')).items).toEqual([]);
    expect((await proposals(w, '?sort=newest')).items).toHaveLength(1);
    expect((await c.get(`${API}/proposals?filter[status]=bogus`, w.admin)).status).toBe(400);
    expect((await c.get(`${API}/proposals`, viewer)).status).toBe(200);
    expect((await c.get(`${API}/proposals/00000000-0000-4000-8000-000000000000`, w.admin)).status).toBe(404);
  });

  it('velocity boost cuts a slow mover, margin floor raises a thin margin, a custom policy prices for a margin', async () => {
    const { w } = await world();
    await policy(w, { name: 'Slow movers', strategy: 'velocity_boost', params: { stepBps: 500 }, targetMarginMinBps: 1000, maxDiscountBps: 1500 });
    expect((await generate(w)).body.data.result.items[0]).toMatchObject({ status: 'proposed', proposedPriceMinor: 47_405 });
    expect((await proposals(w)).items[0].reasoning).toContain('Only 0 units sold');
    const q = await proposals(w);
    expect(q.items[0].strategy).toBe('velocity_boost');
    for (const p of q.items) expect((await c.post(`${API}/proposals/${p.id}/reject`, {}, w.admin)).status).toBe(200);
    // a margin floor: price 499 earns 29.88%; ask for 40% (cost 300, fee 10%: needs 600, above the MRP 599)
    const pol = (await c.get(`${API}/policies`, w.admin)).body.data[0];
    await c.del(`${API}/policies/${pol.id}`, w.admin);
    await policy(w, { name: 'Floor 35', strategy: 'margin_floor', targetMarginMinBps: 3500 });
    const g = (await generate(w)).body.data.result.items[0];
    expect(g).toMatchObject({ status: 'proposed', proposedPriceMinor: Math.ceil(30_000 / 0.55) });
    await policy(w, { name: 'Floor 40', strategy: 'margin_floor', targetMarginMinBps: 4000, accountId: w.account.id });
    // policies for the same account are tried in creation order; the first one proposing wins
    expect((await generate(w)).body.data.result.items[0].policyId).toBeTruthy();
  });
});

describe('approve and reject', () => {
  it('a waiting proposal and an applied price each leave a notification (waiting ones collapse while unread)', async () => {
    const { w } = await world();
    await policy(w);
    await competitor(w, 44_900);
    await generate(w);
    const p = (await proposals(w)).items[0];
    await t.pump();
    const notes = async () => (await c.get('/api/v1/notifications?limit=100', w.admin)).body.data.items as Array<{ type: string; title: string; body: string | null; actionUrl: string | null }>;
    const waiting = (await notes()).filter((n) => n.type === 'pricing.proposal_created');
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ title: 'Price proposals are waiting for your review', actionUrl: '/pricing?view=proposals' });
    expect(waiting[0]!.body).toContain('₹499.00 to ₹449.00');
    expect((await c.post(`${API}/proposals/${p.id}/approve`, {}, w.admin)).status).toBe(200);
    await t.pump();
    const applied = (await notes()).find((n) => n.type === 'pricing.price_applied');
    expect(applied, 'an approval is notified').toMatchObject({ title: 'A price change was approved', actionUrl: '/pricing?view=history' });
    expect(applied!.body).toContain('₹499.00 to ₹449.00');
  });

  it('approval puts the price live through pricing, is idempotent, and only admins decide', async () => {
    const { w, staff, viewer } = await world();
    await policy(w);
    await competitor(w, 44_900);
    await generate(w);
    const p = (await proposals(w)).items[0];
    expect((await c.post(`${API}/proposals/${p.id}/approve`, {}, staff)).status).toBe(403); // staff cannot approve
    expect((await c.post(`${API}/proposals/${p.id}/approve`, {}, viewer)).status).toBe(403);
    expect((await c.post(`${API}/proposals/${p.id}/reject`, {}, staff)).status).toBe(403);
    expect((await c.post(`${API}/proposals/${p.id}/approve`, { version: 99 }, w.admin)).body.error.code).toBe('VERSION_CONFLICT');
    expect((await c.get(`${API}/proposals/${p.id}`, w.admin)).body.data.status).toBe('pending_review');

    const ok = await c.post(`${API}/proposals/${p.id}/approve`, { version: 1, note: 'matching the rival' }, w.admin);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data).toMatchObject({ outcome: 'applied', pushed: [{ accountId: w.account.id }], proposal: { status: 'approved', decisionNote: 'matching the rival', decidedByName: 'Asha Admin', pushSkipped: false, failureMessage: null, version: 2 } });
    expect(ok.body.data.proposal.appliedAt).toBeTruthy();
    await t.pump();
    expect(await listingPrice(w)).toBe(44_900);
    const priced = (await c.get(`${API}/variants/${w.variant.variantId}`, w.admin)).body.data;
    expect(priced.marketplacePrices[0]).toMatchObject({ priceMinor: 44_900, effectivePriceMinor: 44_900, source: 'manual' });
    const hist = (await c.get(`${API}/history?filter[variantId]=${w.variant.variantId}&filter[field]=marketplace`, w.admin)).body.data.items;
    // the first explicit marketplace price replaces what the listing showed (the variant's price), so the previous price is real, not "nothing"
    expect(hist[0]).toMatchObject({ oldPriceMinor: 49_900, newPriceMinor: 44_900, reason: `proposal:${p.id}` });

    // repeating does nothing; the opposite decision is refused
    const again = await c.post(`${API}/proposals/${p.id}/approve`, {}, w.admin);
    expect(again.body.data).toMatchObject({ outcome: 'unchanged', proposal: { status: 'approved', version: 2 } });
    expect((await c.get(`${API}/history?filter[variantId]=${w.variant.variantId}&filter[field]=marketplace`, w.admin)).body.data.items).toHaveLength(1);
    const rej = await c.post(`${API}/proposals/${p.id}/reject`, {}, w.admin);
    expect(rej.status).toBe(409);
    expect(rej.body.error.details.rule).toBe('proposal_already_decided');
    const mine = async (type: string) => (await t.outbox(type)).filter((e) => e.vendorId === w.admin.vendorId);
    expect(await mine('pricing.proposal_approved')).toHaveLength(1);
    expect(await mine('pricing.proposal_created')).toHaveLength(1);
  });

  it('rejection keeps the price, is idempotent, is not proposed again for a week, and records the note', async () => {
    const { w } = await world();
    await policy(w);
    await competitor(w, 44_900);
    await generate(w);
    const p = (await proposals(w)).items[0];
    const rej = await c.post(`${API}/proposals/${p.id}/reject`, { note: 'brand floor' }, w.admin);
    expect(rej.body.data).toMatchObject({ outcome: 'rejected', proposal: { status: 'rejected', decisionNote: 'brand floor', decidedByName: 'Asha Admin' } });
    expect((await c.post(`${API}/proposals/${p.id}/reject`, {}, w.admin)).body.data.outcome).toBe('unchanged');
    const appr = await c.post(`${API}/proposals/${p.id}/approve`, {}, w.admin);
    expect(appr.status).toBe(409);
    expect(await listingPrice(w)).not.toBe(44_900);
    expect((await c.get(`${API}/variants/${w.variant.variantId}`, w.admin)).body.data.marketplacePrices).toEqual([]);
    expect((await generate(w)).body.data.result.items[0]).toMatchObject({ status: 'skipped', reason: 'this price was rejected recently' });
    expect((await t.outbox('pricing.proposal_rejected')).filter((e) => e.vendorId === w.admin.vendorId)).toHaveLength(1);
  });

  it('a price the pricing rules refuse fails the proposal visibly, and approving again retries', async () => {
    const { w } = await world();
    // a running sale at 450.00: the regular price may not drop below it
    expect((await c.put(`${API}/marketplace-prices`, { variantId: w.variant.variantId, accountId: w.account.id, priceMinor: 49_900, salePriceMinor: 45_000, saleStartsAt: new Date(Date.now() - 60_000).toISOString(), saleEndsAt: new Date(Date.now() + 86_400_000).toISOString() }, w.admin)).status).toBe(200);
    await policy(w, { maxDiscountBps: 4000, targetMarginMinBps: 0 });
    await competitor(w, 40_000);
    await generate(w);
    const p = (await proposals(w)).items[0];
    expect(p.proposedPriceMinor).toBe(40_000);
    const bad = await c.post(`${API}/proposals/${p.id}/approve`, {}, w.admin);
    expect(bad.status).toBe(409);
    expect(bad.body.error.details).toMatchObject({ rule: 'proposal_apply_failed', proposalId: p.id });
    const failed = (await c.get(`${API}/proposals/${p.id}`, w.admin)).body.data;
    expect(failed).toMatchObject({ status: 'failed', failureMessage: 'The sale price cannot be higher than the regular price' });
    expect((await c.get(`${API}/variants/${w.variant.variantId}`, w.admin)).body.data.marketplacePrices[0].priceMinor).toBe(49_900); // nothing half-applied
    expect((await proposals(w)).counts.failed).toBe(1);
    // the seller ends the sale; approving the failed proposal again works
    expect((await c.put(`${API}/marketplace-prices`, { variantId: w.variant.variantId, accountId: w.account.id, salePriceMinor: null }, w.admin)).status).toBe(200);
    const retry = await c.post(`${API}/proposals/${p.id}/approve`, {}, w.admin);
    expect(retry.body.data).toMatchObject({ outcome: 'applied', proposal: { status: 'approved', failureMessage: null } });
    expect((await c.get(`${API}/variants/${w.variant.variantId}`, w.admin)).body.data.marketplacePrices[0].priceMinor).toBe(40_000);
  });

  it('a connector that cannot take prices: the price is saved and the proposal says so', async () => {
    const { w } = await world();
    await policy(w);
    await competitor(w, 44_900);
    await generate(w);
    const p = (await proposals(w)).items[0];
    const caps = t.container.connectors.get('mock').capabilities as { pricing: { push: boolean } };
    caps.pricing.push = false;
    try {
      const ok = await c.post(`${API}/proposals/${p.id}/approve`, {}, w.admin);
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body.data.pushed).toEqual([{ accountId: w.account.id, skipped: 'connector_cannot_push_prices' }]);
      expect(ok.body.data.proposal).toMatchObject({ status: 'approved', pushSkipped: true, failureMessage: expect.stringContaining('cannot take price updates') });
      expect((await c.get(`${API}/variants/${w.variant.variantId}`, w.admin)).body.data.marketplacePrices[0].priceMinor).toBe(44_900);
    } finally { caps.pricing.push = true; }
  });

  it('proposals expire: an expired one cannot be approved, and the sweep retires open ones past their time', async () => {
    const { w } = await world();
    await policy(w);
    await competitor(w, 44_900);
    await generate(w);
    const p = (await proposals(w)).items[0];
    const past = new Date(Date.now() - 60_000);
    await withSystem(t.database!.db, (tx) => tx.update(schema.pricingProposals).set({ expiresAt: past }).where(eq(schema.pricingProposals.id, p.id)));
    const late = await c.post(`${API}/proposals/${p.id}/approve`, {}, w.admin);
    expect(late.status).toBe(409);
    expect(late.body.error.details.rule).toBe('proposal_expired');
    expect((await c.get(`${API}/proposals/${p.id}`, w.admin)).body.data.status).toBe('expired');
    expect((await c.post(`${API}/proposals/${p.id}/reject`, {}, w.admin)).body.error.details.rule).toBe('proposal_closed');
    // the sweep (also run by the minute tick)
    await competitor(w, 43_000);
    await generate(w);
    const q = (await proposals(w, '?filter[status]=pending_review')).items[0];
    await withSystem(t.database!.db, (tx) => tx.update(schema.pricingProposals).set({ expiresAt: past }).where(eq(schema.pricingProposals.id, q.id)));
    expect(await expireProposals(t.container)).toBe(1);
    expect(await expireProposals(t.container)).toBe(0);
    expect((await c.get(`${API}/proposals/${q.id}`, w.admin)).body.data.status).toBe('expired');
  });
});

describe('auto-apply', () => {
  it('a move under the policy threshold is applied immediately; bigger ones wait for review', async () => {
    const { w } = await world();
    await policy(w, { autoApproveUnderBps: 1000 }); // moves under 10% apply by themselves
    await competitor(w, 48_000); // -381 bps
    const g = (await generate(w)).body.data;
    expect(g.result).toMatchObject({ proposed: 0, autoApplied: 1, items: [{ status: 'auto_applied', proposedPriceMinor: 48_000 }] });
    expect(g.pushed).toEqual([{ accountId: w.account.id }]);
    await t.pump();
    expect(await listingPrice(w)).toBe(48_000);
    const row = (await proposals(w, '?filter[status]=auto_applied')).items[0];
    expect(row).toMatchObject({ status: 'auto_applied', decidedBy: w.admin.userId, appliedAt: expect.any(String) });
    expect((await c.get(`${API}/history?filter[variantId]=${w.variant.variantId}&filter[field]=marketplace`, w.admin)).body.data.items[0].reason).toBe(`proposal:${row.id}`);
    // the next competitor move is bigger than 10%: waits for a human
    await competitor(w, 40_000); // the margin floor limits it to 428.58: a 10.7% move
    expect((await generate(w)).body.data.result).toMatchObject({ proposed: 1, autoApplied: 0 });
    expect((await proposals(w)).counts).toMatchObject({ pending_review: 1, auto_applied: 1 });
    expect(await listingPrice(w)).toBe(48_000);
  });
});

describe('bulk decisions', () => {
  it('approve many: partial success inside HTTP 200, limits and permissions', async () => {
    const { w, staff } = await world();
    await policy(w);
    await competitor(w, 44_900);
    await generate(w);
    const p = (await proposals(w)).items[0];
    const vendorId = w.admin.vendorId!;
    // a second proposal for the same variant+account supersedes the first
    const newer = await withVendor(t.database!.db, vendorId, (tx) => createPriceProposal(tx, vendorId, { variantId: w.variant.variantId, accountId: w.account.id, strategy: 'custom', proposedPriceMinor: 47_000, reasoning: 'manual idea' }));
    const unknown = '00000000-0000-4000-8000-000000000000';
    const res = await c.post(`${API}/proposals/bulk`, { ids: [p.id, unknown, newer.id], action: 'approve' }, w.admin);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // the superseded one cannot be approved, the unknown id is reported, the valid one is applied
    expect(res.body.data).toMatchObject({ action: 'approve', total: 3, succeeded: 1, failed: 2 });
    const byId = new Map(res.body.data.items.map((i: any) => [i.id, i]));
    expect(byId.get(p.id)).toMatchObject({ outcome: 'error', code: 'INVALID_STATE' });
    expect(byId.get(newer.id)).toMatchObject({ outcome: 'applied' });
    expect(byId.get(unknown)).toMatchObject({ outcome: 'error', code: 'NOT_FOUND' });
    expect(res.body.data.pushed).toEqual([{ accountId: w.account.id }]);
    // reject in bulk and the limits
    expect((await c.post(`${API}/proposals/bulk`, { ids: [newer.id], action: 'reject' }, w.admin)).body.data.items[0]).toMatchObject({ outcome: 'error', code: 'INVALID_STATE' });
    expect((await c.post(`${API}/proposals/bulk`, { ids: [], action: 'approve' }, w.admin)).status).toBe(400);
    expect((await c.post(`${API}/proposals/bulk`, { ids: Array.from({ length: 101 }, () => unknown), action: 'approve' }, w.admin)).status).toBe(400);
    expect((await c.post(`${API}/proposals/bulk`, { ids: [unknown], action: 'approve' }, staff)).status).toBe(403);
  });
});

describe('exported contract createPriceProposal', () => {
  it('creates a pending proposal with real estimates, supersedes the open one and validates', async () => {
    const { w } = await world();
    const vendorId = w.admin.vendorId!;
    const input = { variantId: w.variant.variantId, accountId: w.account.id, strategy: 'custom' as const, proposedPriceMinor: 47_000, reasoning: 'Clearance idea' };
    const create = (i: typeof input & Record<string, unknown>) => withVendor(t.database!.db, vendorId, (tx) => createPriceProposal(tx, vendorId, i));
    const a = await create({ ...input, competitorPriceMinor: 46_500, actor: { type: 'system', id: 'automation' } });
    expect(a.status).toBe('pending_review');
    const row = (await c.get(`${API}/proposals/${a.id}`, w.admin)).body.data;
    expect(row).toMatchObject({ currentPriceMinor: 49_900, proposedPriceMinor: 47_000, competitorPriceMinor: 46_500, strategy: 'custom', estMarginDeltaBps: 2_617 - 2_988, projectedSalesDeltaBps: null, reasoning: 'Clearance idea' });
    const b = await create({ ...input, proposedPriceMinor: 46_000 });
    expect((await c.get(`${API}/proposals/${a.id}`, w.admin)).body.data.status).toBe('superseded');
    expect((await c.get(`${API}/proposals/${b.id}`, w.admin)).body.data.status).toBe('pending_review');
    const fails = async (i: Record<string, unknown>, rule: string) => {
      const e = await create({ ...input, ...i }).catch((x) => x);
      expect(e.details?.rule ?? e.code, JSON.stringify(i)).toBe(rule);
    };
    await fails({ proposedPriceMinor: 49_900 }, 'no_change');
    await fails({ proposedPriceMinor: 60_000 }, 'price_above_mrp');
    await fails({ proposedPriceMinor: 0 }, 'invalid_price');
    await fails({ reasoning: '   ' }, 'reasoning_required');
    await fails({ strategy: 'nonsense' }, 'unknown_strategy');
    await fails({ variantId: '00000000-0000-4000-8000-000000000000' }, 'NOT_FOUND');
    await fails({ accountId: '00000000-0000-4000-8000-000000000000' }, 'NOT_FOUND');
    // another tenant's variant is invisible
    const other = await c.registerVendor({ businessName: 'Other Biz' });
    const e = await withVendor(t.database!.db, other.vendorId!, (tx) => createPriceProposal(tx, other.vendorId!, input)).catch((x) => x);
    expect(e.code).toBe('NOT_FOUND');
  });
});

describe('overview, history names and the scheduler jobs', () => {
  it('overview numbers follow the data; history can include names; the hourly tick generates for active policies', async () => {
    const { w, viewer } = await world();
    const empty = (await c.get(`${API}/overview`, viewer)).body.data;
    expect(empty).toMatchObject({ pendingProposals: 0, potentialMarginGainMinor: 0, autoAppliedLast30Days: 0, activePolicies: 0, channelsCovered: 0, proposalsWithoutEstimate: 0 });
    await policy(w);
    await orderArrives(t, c, w, 10); // 10 units in the window
    await competitor(w, 52_000);
    // the hourly tick (scheduler entry) runs every active policy of every vendor
    const tick = pricingModule.jobs.find((j) => j.name === 'pricing.proposals-tick')!;
    await tick.handle({ vendorId: null, correlationId: 'x', data: {} }, t.container, { attemptsMade: 0 });
    const o = (await c.get(`${API}/overview`, viewer)).body.data;
    // raise 499 -> 520: unit contribution 14910 -> 52000 - 30000 - 5200 = 16800; sales 10 x (1 - 1.5 x 4.2%) = 9.37 units
    const delta = Math.round((52_000 - 49_900) * 10_000 / 49_900);
    const units = 10 * (1 + Math.round(-1.5 * delta) / 10_000);
    expect(o).toMatchObject({ pendingProposals: 1, activePolicies: 1, pausedPolicies: 0, channelsCovered: 1, channels: [{ accountId: w.account.id, marketplace: 'mock' }], basis: 'estimated', proposalCounts: { pending_review: 1 } });
    expect(o.potentialMarginGainMinor).toBe(Math.round(16_800 * units - 14_910 * 10));
    // no cost price on the variant: counted, not guessed
    await c.patch(`/api/v1/variants/${w.variant.variantId}`, { costPriceMinor: null }, w.admin);
    expect((await c.get(`${API}/overview`, w.admin)).body.data).toMatchObject({ potentialMarginGainMinor: 0, proposalsWithoutEstimate: 1 });

    const p = (await proposals(w)).items[0];
    expect((await c.post(`${API}/proposals/${p.id}/approve`, {}, w.admin)).status).toBe(200);
    const plain = (await c.get(`${API}/history?filter[variantId]=${w.variant.variantId}`, w.admin)).body.data.items[0];
    expect(plain.sku).toBeUndefined();
    const named = (await c.get(`${API}/history?filter[variantId]=${w.variant.variantId}&include=names`, w.admin)).body.data.items[0];
    expect(named).toMatchObject({ sku: w.variant.sku, productTitle: 'Stage 4 tee', accountName: expect.stringContaining('mock'), actorName: 'Asha Admin', reason: `proposal:${p.id}` });
    expect((await c.get(`${API}/history?include=bogus`, w.admin)).status).toBe(400);
    expect((await c.get(`${API}/overview`, w.admin)).body.data).toMatchObject({ pendingProposals: 0, approvedLast30Days: 1 });
  });

  it('tenant isolation of proposals', async () => {
    const { w } = await world();
    await policy(w);
    await competitor(w, 44_900);
    await generate(w);
    const p = (await proposals(w)).items[0];
    const other = await c.registerVendor({ businessName: 'Other Biz' });
    expect((await c.get(`${API}/proposals`, other)).body.data).toMatchObject({ total: 0, items: [] });
    expect((await c.get(`${API}/proposals/${p.id}`, other)).status).toBe(404);
    expect((await c.post(`${API}/proposals/${p.id}/approve`, {}, other)).status).toBe(404);
    expect((await c.post(`${API}/proposals/${p.id}/reject`, {}, other)).status).toBe(404);
    expect((await c.get(`${API}/overview`, other)).body.data.pendingProposals).toBe(0);
    expect((await c.post(`${API}/proposals/generate`, {}, other)).body.data.result.evaluated).toBe(0);
    expect((await c.get(`${API}/proposals/${p.id}`, w.admin)).body.data.status).toBe('pending_review');
  });
});
