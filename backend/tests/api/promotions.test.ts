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

const DAY = 86_400_000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs);
const P = '/api/v1/promotions';

/** direct database access as the table owner (what a migration or an operator would do); the app role is restored afterwards */
async function sqlRun<T = any>(text: string): Promise<T[]> {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { return ((await pg.query(text)).rows as T[]); } finally { await pg.exec('SET ROLE oms_app'); }
}

/** another stocked, listed (active) variant on the world's account */
async function listed(w: World, o: { sku?: string; priceMinor?: number; mrpMinor?: number; categoryId?: string } = {}) {
  const v = await c.makeVariant(w.admin, { sku: o.sku, priceMinor: o.priceMinor ?? 49_900, mrpMinor: o.mrpMinor ?? (o.priceMinor ?? 49_900) * 2, categoryId: o.categoryId });
  const l = (await c.post('/api/v1/listings', { marketplaceAccountId: w.account.id, variantId: v.variantId, marketplaceCategoryId: 'mock-apparel' }, w.admin)).body.data;
  await c.post(`/api/v1/listings/${l.id}/validate`, {}, w.admin);
  await c.post(`/api/v1/listings/${l.id}/approve`, {}, w.admin);
  await c.post(`/api/v1/listings/${l.id}/publish`, {}, w.admin);
  await t.pump();
  expect((await c.get(`/api/v1/listings/${l.id}`, w.admin)).body.data.status).toBe('active');
  return { ...v, listingId: l.id as string };
}

const create = async (w: World, body: Record<string, unknown>) => {
  const r = await c.post(`${P}/campaigns`, body, w.admin);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.data.campaign as any;
};
const act = async (w: World, id: string, action: string, body: Record<string, unknown> = {}) => c.post(`${P}/campaigns/${id}/${action}`, body, w.admin);
const get = async (w: World, id: string) => (await c.get(`${P}/campaigns/${id}`, w.admin)).body.data;
const products = async (w: World, id: string) => (await c.get(`${P}/campaigns/${id}/products?pageSize=100`, w.admin)).body.data;
/** the marketplace price row of the variant; none (the listing follows the variant price) once a campaign's sale is gone and nothing else was set */
const priceOf = async (w: World, variantId: string) => (await c.get(`/api/v1/pricing/variants/${variantId}`, w.admin)).body.data.marketplacePrices[0] ?? { effectivePriceMinor: null, sale: { priceMinor: null, active: false } };
const pct20 = { type: 'percentage_discount', valueBps: 2000 };

/** an order that arrived at `placedAt`, written the way the importer does (used to give campaigns real sales history) */
async function order(w: World, o: { variantId: string; sku: string; qty: number; unitMinor: number; placedAt: Date; status?: string }) {
  const n = Math.random().toString(36).slice(2, 10).toUpperCase();
  await sqlRun(`with o as (insert into orders (vendor_id, marketplace_account_id, marketplace, external_order_id, order_number, status, placed_at)
      values ('${w.admin.vendorId}', '${w.account.id}', 'mock', 'EXT-${n}', 'PO-${n}', '${o.status ?? 'delivered'}', '${o.placedAt.toISOString()}') returning id)
    insert into order_items (vendor_id, order_id, external_item_id, variant_id, sku, title, quantity, unit_price_minor)
    select '${w.admin.vendorId}', o.id, 'IT-${n}', '${o.variantId}', '${o.sku}', 'Test item', ${o.qty}, ${o.unitMinor} from o`);
}

describe('create a campaign (the Create Campaign modal and the ledger)', () => {
  it('creates drafts with the screen numbers, a unique case-insensitive code, products and per-status counts', async () => {
    const w = await buildWorld(t, c, { stock: [50], sku: 'TRV-1042-BLK' });
    const shirt = await listed(w, { sku: 'OS-2048-SND', priceMinor: 159_900, mrpMinor: 199_900 });
    const camp = await create(w, { name: 'Festive Season Flash Drop', code: 'diwali25', ...pct20, budgetMinor: 15_000_000, minOrderMinor: 99_900, startsAt: at(2 * DAY), endsAt: at(9 * DAY), selection: { variantIds: [w.variant.variantId, shirt.variantId] } });
    expect(camp).toMatchObject({
      name: 'Festive Season Flash Drop', code: 'DIWALI25', type: 'percentage_discount', valueBps: 2000, valueMinor: null, status: 'draft', budgetMinor: 15_000_000, minOrderMinor: 99_900,
      spendMinor: 0, revenueMinor: 0, unitsMoved: 0, budgetUsedBps: 0, version: 1, endReason: null, accountIds: [],
      channels: [{ accountId: w.account.id, marketplace: 'mock' }], itemCounts: { total: 2, eligible: 2, live: 0, ineligible: 0 },
    });
    const list = (await products(w, camp.id));
    const byName = Object.fromEntries(list.items.map((i: any) => [i.sku, i]));
    expect(byName['TRV-1042-BLK']).toMatchObject({ originalPriceMinor: 49_900, promoPriceMinor: 39_920, discountBps: 2000, status: 'eligible', reason: null, campaignName: 'Festive Season Flash Drop' });
    expect(byName['OS-2048-SND']).toMatchObject({ originalPriceMinor: 159_900, promoPriceMinor: 127_920, status: 'eligible' });
    expect(list.counts).toMatchObject({ all: 2, eligible: 2 });

    // the code is unique ignoring case; a missing code is generated
    const dup = await c.post(`${P}/campaigns`, { name: 'Other', code: 'Diwali25', ...pct20 }, w.admin);
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toMatchObject({ rule: 'duplicate_code' });
    const minimal = await create(w, { name: 'Weekend', type: 'flat_discount', valueMinor: 50_000 });
    expect(minimal.code).toMatch(/^PROMO[A-Z0-9]{6}$/);
    expect(minimal).toMatchObject({ status: 'draft', startsAt: null, endsAt: null, budgetMinor: 0, itemCounts: { total: 0 } });

    // the ledger: paging, filters, search and counts for the tabs
    const l = (await c.get(`${P}/campaigns`, w.admin)).body.data;
    expect(l).toMatchObject({ total: 2, page: 1, pages: 1, counts: { all: 2, draft: 2, scheduled: 0, active: 0, ended: 0 } });
    expect(l.items.map((x: any) => x.code)).toEqual([minimal.code, 'DIWALI25']); // newest first
    expect((await c.get(`${P}/campaigns?q=festive`, w.admin)).body.data.items.map((x: any) => x.code)).toEqual(['DIWALI25']);
    expect((await c.get(`${P}/campaigns?q=diwali`, w.admin)).body.data.total).toBe(1);
    expect((await c.get(`${P}/campaigns?filter[type]=flat_discount`, w.admin)).body.data).toMatchObject({ total: 1, counts: { all: 1, draft: 1 } });
    expect((await c.get(`${P}/campaigns?filter[status]=active`, w.admin)).body.data).toMatchObject({ total: 0, items: [] });
    expect((await c.get(`${P}/campaigns?pageSize=1&page=2`, w.admin)).body.data).toMatchObject({ total: 2, pages: 2, items: [expect.objectContaining({ code: 'DIWALI25' })] });
    expect((await c.get(`${P}/overview`, w.admin)).body.data).toMatchObject({ draftCampaigns: 2, activeCampaigns: 0, scheduledCampaigns: 0, revenueMinor: 0, spendMinor: 0, unitsMoved: 0, velocityLiftBps: null });

    // events and audit
    expect((await t.outbox('promotion.created')).filter((e) => e.vendorId === w.admin.vendorId).map((e) => e.payload.code).sort()).toEqual(['DIWALI25', minimal.code].sort());
    expect((await sqlRun(`select action from audit_logs where vendor_id = '${w.admin.vendorId}' and action = 'promotion.created'`)).length).toBe(2);
  });

  it('rejects terms that do not fit the type, bad windows, unknown accounts and unauthorised callers', async () => {
    const w = await buildWorld(t, c);
    const bad = async (body: Record<string, unknown>, status: number, rule?: string) => {
      const r = await c.post(`${P}/campaigns`, { name: 'X', ...body }, w.admin);
      expect(r.status, JSON.stringify(r.body)).toBe(status);
      if (rule) expect(r.body.error.details.rule).toBe(rule);
    };
    await bad({ type: 'percentage_discount' }, 400, 'invalid_terms');
    await bad({ type: 'percentage_discount', valueBps: 9600 }, 400, 'invalid_terms');
    await bad({ type: 'percentage_discount', valueBps: 1000, valueMinor: 100 }, 400, 'invalid_terms');
    await bad({ type: 'flat_discount', valueMinor: 0 }, 400, 'invalid_terms');
    await bad({ type: 'bogo', buyQuantity: 2 }, 400, 'invalid_terms');
    await bad({ type: 'bundle', valueBps: 1000, buyQuantity: 1 }, 400, 'invalid_terms');
    await bad({ ...pct20, startsAt: at(DAY), endsAt: at(DAY) }, 400, 'invalid_window');
    await bad({ ...pct20, accountIds: ['018f0000-0000-7000-8000-000000000000'] }, 404);
    await bad({ ...pct20, code: 'a b' }, 400);
    await bad({ ...pct20, name: '' }, 400);
    await bad({ ...pct20, budgetMinor: -1 }, 400);
    await bad({ type: 'wow', valueBps: 1 }, 400);

    const viewer = await c.addMember(w.admin, 'vendor_viewer');
    const staff = await c.addMember(w.admin, 'vendor_staff');
    expect((await c.get(`${P}/campaigns`, viewer)).status).toBe(200);
    expect((await c.get(`${P}/overview`, viewer)).status).toBe(200);
    expect((await c.get(`${P}/products`, viewer)).status).toBe(200);
    expect((await c.post(`${P}/campaigns`, { name: 'V', ...pct20 }, viewer)).status).toBe(403);
    expect((await c.post(`${P}/process`, {}, viewer)).status).toBe(403);
    expect((await c.post(`${P}/campaigns`, { name: 'S', ...pct20 }, staff)).status).toBe(201);
    expect((await c.get(`${P}/campaigns`)).status).toBe(401);
    const made = await create(w, { name: 'Guarded', ...pct20 });
    expect((await act({ ...w, admin: viewer } as World, made.id, 'activate')).status).toBe(403);
    expect((await c.patch(`${P}/campaigns/${made.id}`, { version: 1, name: 'x' }, viewer)).status).toBe(403);
    expect((await c.del(`${P}/campaigns/${made.id}`, viewer)).status).toBe(403);
  });

  it('is idempotent with an Idempotency-Key and refuses another business\'s variants and campaigns', async () => {
    const w = await buildWorld(t, c);
    const key = { 'Idempotency-Key': 'create-promo-1' };
    const a = await c.post(`${P}/campaigns`, { name: 'Once', ...pct20 }, w.admin, key);
    const b = await c.post(`${P}/campaigns`, { name: 'Once', ...pct20 }, w.admin, key);
    expect(a.status).toBe(201);
    expect(b.body.data.campaign.id).toBe(a.body.data.campaign.id);
    expect((await c.get(`${P}/campaigns`, w.admin)).body.data.total).toBe(1);

    const other = await buildWorld(t, c);
    expect((await c.get(`${P}/campaigns/${a.body.data.campaign.id}`, other.admin)).status).toBe(404);
    expect((await act(other, a.body.data.campaign.id, 'activate')).status).toBe(404);
    expect((await c.get(`${P}/campaigns`, other.admin)).body.data.total).toBe(0);
    expect((await c.get(`${P}/products`, other.admin)).body.data.total).toBe(0);
    const mine = await create(other, { name: 'Mine', code: a.body.data.campaign.code, ...pct20 }); // codes are per business
    const put = await c.put(`${P}/campaigns/${mine.id}/products`, { variantIds: [w.variant.variantId] }, other.admin);
    expect(put.body.data).toMatchObject({ total: 0, skipped: [{ variantId: w.variant.variantId, reason: 'variant_not_found' }] });
  });
});

describe('eligibility', () => {
  it('says why a product cannot run: price, cost, margin floor, listing, inactive, conflicts and existing sales', async () => {
    const w = await buildWorld(t, c, { stock: [20], sku: 'OK-1' });
    const cheap = await listed(w, { sku: 'CHEAP', priceMinor: 30_000 });
    const costly = await listed(w, { sku: 'COSTLY', priceMinor: 49_900 });
    const floor = await listed(w, { sku: 'FLOOR', priceMinor: 49_900 });
    const inactive = await listed(w, { sku: 'INACTIVE', priceMinor: 49_900 });
    const unlisted = await c.makeVariant(w.admin, { sku: 'UNLISTED', priceMinor: 49_900 });
    const vid = w.admin.vendorId;
    await sqlRun(`update product_variants set cost_price_minor = 20000 where id = '${costly.variantId}'`);
    await sqlRun(`update product_variants set cost_price_minor = 5000 where id = '${floor.variantId}'`);
    await sqlRun(`update product_variants set status = 'inactive' where id = '${inactive.variantId}'`);
    await sqlRun(`insert into pricing_policies (vendor_id, name, strategy, target_margin_min_bps) values ('${vid}', 'Keep 50 percent', 'margin_floor', 5000)`);

    const camp = await create(w, { name: 'Lab', type: 'flat_discount', valueMinor: 40_000, selection: { variantIds: [w.variant.variantId, cheap.variantId, costly.variantId, floor.variantId, inactive.variantId, unlisted.variantId, '018f0000-0000-7000-8000-000000000001'] } });
    const list = await products(w, camp.id);
    const by = Object.fromEntries(list.items.map((i: any) => [i.sku, i]));
    expect(by['OK-1']).toMatchObject({ status: 'eligible', promoPriceMinor: 9_900, reason: null });
    expect(by.CHEAP).toMatchObject({ status: 'ineligible', promoPriceMinor: 30_000 }); // stays at its price: nothing is discounted
    expect(by.CHEAP.reason).toMatch(/zero or negative/);
    expect(by.COSTLY).toMatchObject({ status: 'ineligible', promoPriceMinor: 9_900 });
    expect(by.COSTLY.reason).toMatch(/below the cost price/);
    expect(by.FLOOR.reason).toMatch(/below the pricing margin floor/); // 50 % margin on a 5,000 cost needs 10,000
    expect(by.INACTIVE.reason).toMatch(/not active/);
    expect(by.UNLISTED.reason).toMatch(/no active listing/);
    expect(list.counts).toMatchObject({ all: 6, eligible: 1, ineligible: 5 });
    const put = await c.put(`${P}/campaigns/${camp.id}/products`, { variantIds: [w.variant.variantId, '018f0000-0000-7000-8000-000000000001'] }, w.admin);
    expect(put.body.data).toMatchObject({ total: 1, removed: 5, skipped: [{ reason: 'variant_not_found' }] });
    expect((await get(w, camp.id)).itemCounts).toMatchObject({ total: 1, eligible: 1 });

    // an ineligible product is filtered with its reason and never blocks the rest from running
    const mixed = await create(w, { name: 'Mixed', ...pct20, selection: { variantIds: [costly.variantId, unlisted.variantId] }, startsAt: at(DAY), endsAt: at(3 * DAY) });
    const refused = await act(w, mixed.id, 'schedule');
    expect(refused.status).toBe(409);
    expect(refused.body.error.details.rule).toBe('no_eligible_items');
  });

  it('refuses a second campaign on the same product and window, and a product with someone else\'s sale', async () => {
    const w = await buildWorld(t, c, { stock: [20], sku: 'A-1' });
    const other = await listed(w, { sku: 'B-1' });
    const first = await create(w, { name: 'First', ...pct20, startsAt: at(DAY), endsAt: at(5 * DAY), selection: { variantIds: [w.variant.variantId] } });
    expect((await act(w, first.id, 'schedule')).status).toBe(200);
    const clash = await create(w, { name: 'Second', ...pct20, startsAt: at(2 * DAY), endsAt: at(6 * DAY), selection: { variantIds: [w.variant.variantId, other.variantId] } });
    let items = (await products(w, clash.id)).items;
    expect(items.find((i: any) => i.sku === 'A-1')).toMatchObject({ status: 'ineligible' });
    expect(items.find((i: any) => i.sku === 'A-1').reason).toMatch(/another scheduled or active campaign.*First/);
    expect(items.find((i: any) => i.sku === 'B-1').status).toBe('eligible');
    // a window that does not overlap is no conflict between campaigns
    await c.patch(`${P}/campaigns/${clash.id}`, { version: 1, startsAt: at(6 * DAY).toISOString(), endsAt: at(8 * DAY).toISOString() }, w.admin);
    // (a price row holds one sale at a time, so the first campaign's scheduled sale still blocks the product until it ends)
    items = (await products(w, clash.id)).items;
    expect(items.find((i: any) => i.sku === 'A-1').reason).toMatch(/sale is already scheduled or running/);
    expect(items.find((i: any) => i.sku === 'B-1').status).toBe('eligible');

    // a manual sale on the account blocks the campaign instead of being overwritten
    await c.put('/api/v1/pricing/marketplace-prices', { variantId: other.variantId, accountId: w.account.id, salePriceMinor: 30_000, saleStartsAt: at(DAY).toISOString(), saleEndsAt: at(4 * DAY).toISOString() }, w.admin);
    const third = await create(w, { name: 'Third', ...pct20, startsAt: at(2 * DAY), endsAt: at(3 * DAY), selection: { variantIds: [other.variantId] } });
    expect((await products(w, third.id)).items[0]).toMatchObject({ status: 'ineligible' });
    expect((await products(w, third.id)).items[0].reason).toMatch(/sale is already/);
    expect((await priceOf(w, other.variantId)).sale.priceMinor).toBe(30_000);
  });
});

describe('lifecycle: schedule, activate, end, cancel', () => {
  it('schedules sale prices through pricing, activates, ends and clears them, with events, idempotency and locks', async () => {
    const w = await buildWorld(t, c, { stock: [30], sku: 'TRV-1042-BLK' });
    const bag = await listed(w, { sku: 'BP-1021-GRY', priceMinor: 189_900 });
    const camp = await create(w, { name: 'Weekend Luggage Sale', code: 'WEEKENDTRV', type: 'flat_discount', valueMinor: 40_000, budgetMinor: 8_000_000, startsAt: at(DAY), endsAt: at(8 * DAY), selection: { variantIds: [w.variant.variantId, bag.variantId] } });

    // schedule needs dates and a future end
    const undated = await create(w, { name: 'Undated', ...pct20, selection: { variantIds: [bag.variantId] } });
    expect((await act(w, undated.id, 'schedule')).body.error.details.rule).toBe('dates_required');
    const past = await create(w, { name: 'Past', ...pct20, startsAt: at(-3 * DAY), endsAt: at(-DAY), selection: { variantIds: [bag.variantId] } });
    expect((await act(w, past.id, 'schedule')).body.error.details.rule).toBe('window_closed');

    // schedule: a scheduled sale price per product on the marketplace price, nothing changes for shoppers yet
    const sched = await act(w, camp.id, 'schedule');
    expect(sched.status, JSON.stringify(sched.body)).toBe(200);
    expect(sched.body.data).toMatchObject({ changed: true, campaign: { status: 'scheduled', version: 2 } });
    const bagPrice = await priceOf(w, bag.variantId);
    expect(bagPrice.sale).toMatchObject({ priceMinor: 149_900, active: false });
    expect(new Date(bagPrice.sale.startsAt).getTime()).toBe(new Date(camp.startsAt).getTime());
    expect(new Date(bagPrice.sale.endsAt).getTime()).toBe(new Date(camp.endsAt).getTime());
    expect(bagPrice.effectivePriceMinor).toBeNull(); // no price of its own: the listing still follows the variant price
    expect((await products(w, camp.id)).items.map((i: any) => i.status)).toEqual(['pending_sync', 'pending_sync']);
    const hist = (await c.get(`/api/v1/pricing/history?filter[variantId]=${bag.variantId}&filter[field]=sale`, w.admin)).body.data.items[0];
    expect(hist).toMatchObject({ newPriceMinor: 149_900, reason: 'promotion:WEEKENDTRV', source: 'schedule' });
    expect((await t.outbox('promotion.activated')).filter((e) => e.vendorId === w.admin.vendorId)).toHaveLength(0);

    // repeating is a no-op; a scheduled campaign is frozen
    const again = await act(w, camp.id, 'schedule');
    expect(again.body.data).toMatchObject({ changed: false, campaign: { status: 'scheduled', version: 2 } });
    for (const r of [await c.patch(`${P}/campaigns/${camp.id}`, { version: 2, name: 'x' }, w.admin), await c.del(`${P}/campaigns/${camp.id}`, w.admin), await c.put(`${P}/campaigns/${camp.id}/products`, { variantIds: [] }, w.admin), await c.del(`${P}/campaigns/${camp.id}/products?variantIds=${bag.variantId}`, w.admin)]) {
      expect(r.status).toBe(409);
      expect(r.body.error.details.rule).toBe('campaign_not_editable');
    }
    expect((await act(w, camp.id, 'end')).body.error.details).toMatchObject({ rule: 'invalid_transition', from: 'scheduled' });

    // activate now: the window starts now, the sale price is in force and the listing follows it
    const [one, two] = await Promise.all([act(w, camp.id, 'activate'), act(w, camp.id, 'activate')]);
    expect([one.status, two.status]).toEqual([200, 200]);
    expect([one.body.data.changed, two.body.data.changed].sort()).toEqual([false, true]);
    await t.pump();
    const live = await get(w, camp.id);
    expect(live).toMatchObject({ status: 'active', itemCounts: { live: 2, total: 2 } });
    expect(Math.abs(new Date(live.startsAt).getTime() - Date.now())).toBeLessThan(60_000);
    expect(await priceOf(w, bag.variantId)).toMatchObject({ effectivePriceMinor: 149_900, sale: { active: true } });
    expect((await priceOf(w, w.variant.variantId)).effectivePriceMinor).toBe(9_900);
    expect((await products(w, camp.id)).items.every((i: any) => i.status === 'live' && i.lastSyncedAt)).toBe(true);
    expect((await t.outbox('promotion.activated')).filter((e) => e.aggregateId === camp.id)).toHaveLength(1); // exactly once
    expect((await act(w, camp.id, 'schedule')).body.data.changed).toBe(false);

    // the Promoted SKUs tab
    const tab = (await c.get(`${P}/products?filter[status]=live`, w.admin)).body.data;
    expect(tab.items.map((i: any) => [i.sku, i.originalPriceMinor, i.promoPriceMinor, i.status, i.campaignName])).toEqual(expect.arrayContaining([['BP-1021-GRY', 189_900, 149_900, 'live', 'Weekend Luggage Sale']]));
    expect(tab.counts).toMatchObject({ live: 2 });
    expect((await c.get(`${P}/overview`, w.admin)).body.data).toMatchObject({ activeCampaigns: 1, scheduledCampaigns: 0, draftCampaigns: 2 });

    // end: the sale prices go, the results freeze, the products finish
    const ended = await act(w, camp.id, 'end');
    expect(ended.body.data).toMatchObject({ changed: true, campaign: { status: 'ended', endReason: 'ended_manually', itemCounts: { ended: 2 } } });
    expect(await priceOf(w, bag.variantId)).toMatchObject({ effectivePriceMinor: null, sale: { priceMinor: null, active: false } });
    expect((await c.get(`/api/v1/pricing/variants/${bag.variantId}`, w.admin)).body.data).toMatchObject({ baseMinor: 189_900, marketplacePrices: [] });
    expect(new Date(ended.body.data.campaign.endsAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    const endEvent = (await t.outbox('promotion.ended')).find((e) => e.aggregateId === camp.id)!;
    expect(endEvent.payload).toMatchObject({ code: 'WEEKENDTRV', reason: 'ended_manually' });
    expect((await act(w, camp.id, 'end')).body.data.changed).toBe(false);
    expect((await act(w, camp.id, 'cancel')).body.error.details.rule).toBe('invalid_transition');
    expect((await act(w, camp.id, 'activate')).body.error.details.rule).toBe('invalid_transition');
    expect((await c.get(`${P}/products`, w.admin)).body.data.items.filter((i: any) => i.campaignId === camp.id)).toHaveLength(0); // finished items are hidden...
    expect((await c.get(`${P}/products?filter[status]=ended&filter[campaignId]=${camp.id}`, w.admin)).body.data.total).toBe(2); // ...unless asked for

    const actions = (await sqlRun(`select action from audit_logs where resource_id = '${camp.id}' and resource_type = 'promotion_campaign' order by id`)).map((r) => r.action);
    expect(actions).toEqual(['promotion.created', 'promotion.scheduled', 'promotion.activated', 'promotion.ended']);
  });

  it('cancels a scheduled campaign and removes its sale prices; a stale version is refused', async () => {
    const w = await buildWorld(t, c, { stock: [30] });
    await c.put('/api/v1/pricing/marketplace-prices', { variantId: w.variant.variantId, accountId: w.account.id, priceMinor: 45_000 }, w.admin); // the account's own price
    const camp = await create(w, { name: 'Cancel me', ...pct20, startsAt: at(DAY), endsAt: at(3 * DAY), selection: { variantIds: [w.variant.variantId] } });
    await act(w, camp.id, 'schedule');
    // the discount is taken from the price the account really sells at (45,000), not from the variant price
    expect((await priceOf(w, w.variant.variantId)).sale.priceMinor).toBe(36_000);
    expect((await act(w, camp.id, 'cancel', { version: 1 })).status).toBe(409); // read at version 1, now 2
    const cancelled = await act(w, camp.id, 'cancel', { version: 2 });
    expect(cancelled.body.data.campaign).toMatchObject({ status: 'cancelled', endReason: 'cancelled', itemCounts: { ended: 1 } });
    expect(await priceOf(w, w.variant.variantId)).toMatchObject({ effectivePriceMinor: 45_000, sale: { priceMinor: null } }); // the account's own price survives
    expect((await act(w, camp.id, 'cancel')).body.data.changed).toBe(false);
    expect((await t.outbox('promotion.ended')).filter((e) => e.aggregateId === camp.id)).toHaveLength(0); // never ran

    // a draft is simply cancelled
    const draft = await create(w, { name: 'Draft', ...pct20 });
    expect((await act(w, draft.id, 'cancel')).body.data.campaign.status).toBe('cancelled');
  });

  it('a start in the past activates immediately; a draft can also be activated without an end', async () => {
    const w = await buildWorld(t, c, { stock: [30] });
    const camp = await create(w, { name: 'Already running', ...pct20, startsAt: at(-DAY), endsAt: at(2 * DAY), selection: { variantIds: [w.variant.variantId] } });
    const r = await act(w, camp.id, 'schedule');
    expect(r.body.data.campaign.status).toBe('active');
    expect(await priceOf(w, w.variant.variantId)).toMatchObject({ effectivePriceMinor: 39_920 });
    const open = await create(w, { name: 'Open ended', type: 'flat_discount', valueMinor: 100, selection: { variantIds: [w.variant.variantId] } });
    expect((await act(w, open.id, 'activate')).body.error.details.rule).toBe('no_eligible_items'); // the first campaign owns the product
  });
});

describe('the scheduler tick', () => {
  it('starts a scheduled campaign when its time comes and ends it when its window closes', async () => {
    const w = await buildWorld(t, c, { stock: [30] });
    const camp = await create(w, { name: 'Timed', ...pct20, startsAt: at(DAY), endsAt: at(2 * DAY), selection: { variantIds: [w.variant.variantId] } });
    await act(w, camp.id, 'schedule');
    expect((await c.post(`${P}/process`, {}, w.admin)).body.data).toMatchObject({ activated: 0, ended: 0 });
    expect((await get(w, camp.id)).status).toBe('scheduled');

    // time passes: the start arrives (the sale window of the marketplace price moves with it)
    const start = at(-60_000).toISOString();
    await sqlRun(`update promotion_campaigns set starts_at = '${start}' where id = '${camp.id}'`);
    await sqlRun(`update marketplace_prices set sale_starts_at = '${start}' where variant_id = '${w.variant.variantId}'`);
    const first = await c.post(`${P}/process`, {}, w.admin);
    expect(first.body.data.activated).toBeGreaterThanOrEqual(1);
    expect(await get(w, camp.id)).toMatchObject({ status: 'active', itemCounts: { live: 1 } });
    expect((await priceOf(w, w.variant.variantId)).effectivePriceMinor).toBe(39_920);
    await t.pump();
    expect((await t.outbox('promotion.activated')).filter((e) => e.aggregateId === camp.id)).toHaveLength(1);
    expect((await c.post(`${P}/process`, {}, w.admin)).body.data.activated).toBe(0); // exactly once

    // the end passes
    const end = at(-30_000).toISOString();
    await sqlRun(`update promotion_campaigns set ends_at = '${end}' where id = '${camp.id}'`);
    await sqlRun(`update marketplace_prices set sale_ends_at = '${end}' where variant_id = '${w.variant.variantId}'`);
    expect((await c.post(`${P}/process`, {}, w.admin)).body.data.ended).toBeGreaterThanOrEqual(1);
    expect(await get(w, camp.id)).toMatchObject({ status: 'ended', endReason: 'window_closed', itemCounts: { ended: 1 } });
    expect(await priceOf(w, w.variant.variantId)).toMatchObject({ effectivePriceMinor: null, sale: { priceMinor: null } });
    await t.pump();
    expect((await t.outbox('promotion.ended')).filter((e) => e.aggregateId === camp.id)).toHaveLength(1);
    expect((await c.post(`${P}/process`, {}, w.admin)).body.data.ended).toBe(0);
  });

  it('is registered as a maintenance job that runs the same tick', async () => {
    const { promotionsModule } = await import('../../modules/promotions/src/index');
    expect(promotionsModule.jobs.map((j) => `${j.queue}/${j.name}`)).toEqual(['maintenance/promotions.tick']);
    await promotionsModule.jobs[0]!.handle({ vendorId: null, correlationId: 'test', data: {} } as never, t.container, { attemptsMade: 0 });
  });
});

describe('results from real orders', () => {
  it('counts revenue, units, orders and the discount given, and computes the velocity lift against the 14 days before', async () => {
    const w = await buildWorld(t, c, { stock: [100], sku: 'TRV-1042-BLK' });
    const v = w.variant;
    const camp = await create(w, { name: 'Clearance', ...pct20, startsAt: at(-3 * DAY), endsAt: at(4 * DAY), selection: { variantIds: [v.variantId] } });
    expect((await act(w, camp.id, 'schedule')).body.data.campaign.status).toBe('active');
    // baseline: 6 units 10 days before the start (and a cancelled order that must not count)
    await order(w, { ...v, qty: 6, unitMinor: 49_900, placedAt: at(-13 * DAY) });
    await order(w, { ...v, qty: 5, unitMinor: 49_900, placedAt: at(-12 * DAY), status: 'cancelled' });
    // during the campaign: 8 + 4 units at the promotional price, a cancelled one, and one before the start
    await order(w, { ...v, qty: 8, unitMinor: 39_920, placedAt: at(-2 * DAY) });
    await order(w, { ...v, qty: 4, unitMinor: 39_920, placedAt: at(-DAY) });
    await order(w, { ...v, qty: 3, unitMinor: 39_920, placedAt: at(-DAY + 3600_000), status: 'cancelled' });
    expect((await c.post(`${P}/process`, {}, w.admin)).body.data.refreshed).toBeGreaterThanOrEqual(1);

    const d = await get(w, camp.id);
    expect(d).toMatchObject({ unitsMoved: 12, ordersCount: 2, revenueMinor: 12 * 39_920, spendMinor: 12 * (49_900 - 39_920), budgetUsedBps: null });
    expect(d.statsUpdatedAt).toBeTruthy();
    expect(d.velocity).toMatchObject({ promoUnits: 12, baselineUnits: 6, baselineDays: 14 });
    expect(Math.abs(d.velocity.liftBps - 83_333)).toBeLessThan(100); // 4 units/day against 0.43 units/day
    const o = (await c.get(`${P}/overview`, w.admin)).body.data;
    expect(o).toMatchObject({ activeCampaigns: 1, revenueMinor: 479_040, spendMinor: 119_760, unitsMoved: 12, velocityCampaigns: 1, budgetMinor: 0, budgetUsedBps: null });
    expect(Math.abs(o.velocityLiftBps - 83_333)).toBeLessThan(100);
    expect((await c.get(`${P}/campaigns`, w.admin)).body.data.items[0]).toMatchObject({ unitsMoved: 12, revenueMinor: 479_040 });
  });

  it('claims no lift without enough baseline sales or time', async () => {
    const w = await buildWorld(t, c, { stock: [100] });
    const v = w.variant;
    const camp = await create(w, { name: 'Thin data', ...pct20, startsAt: at(-3 * DAY), endsAt: at(4 * DAY), selection: { variantIds: [v.variantId] } });
    await act(w, camp.id, 'schedule');
    await order(w, { ...v, qty: 4, unitMinor: 49_900, placedAt: at(-10 * DAY) }); // 4 < 5 baseline units
    await order(w, { ...v, qty: 9, unitMinor: 39_920, placedAt: at(-DAY) });
    await c.post(`${P}/process`, {}, w.admin);
    expect((await get(w, camp.id)).velocity).toMatchObject({ liftBps: null, promoUnits: 9, baselineUnits: 4 });
    expect((await c.get(`${P}/overview`, w.admin)).body.data).toMatchObject({ velocityLiftBps: null, velocityCampaigns: 0, unitsMoved: 9 });

    // a campaign that has run for less than a day has no rate yet either
    const w2 = await buildWorld(t, c, { stock: [100] });
    const fresh = await create(w2, { name: 'Fresh', ...pct20, selection: { variantIds: [w2.variant.variantId] } });
    await act(w2, fresh.id, 'activate');
    await order(w2, { ...w2.variant, qty: 10, unitMinor: 49_900, placedAt: at(-5 * DAY) });
    expect((await get(w2, fresh.id)).velocity.liftBps).toBeNull();
  });

  it('ends a campaign whose discount spend has used up the budget, with the reason', async () => {
    const w = await buildWorld(t, c, { stock: [100] });
    const v = w.variant;
    const camp = await create(w, { name: 'Capped', ...pct20, budgetMinor: 100_000, startsAt: at(-2 * DAY), endsAt: at(5 * DAY), selection: { variantIds: [v.variantId] } });
    await act(w, camp.id, 'schedule');
    await order(w, { ...v, qty: 5, unitMinor: 39_920, placedAt: at(-DAY) }); // 5 x 9,980 = 49,900 spent: under budget
    await c.post(`${P}/process`, {}, w.admin);
    expect(await get(w, camp.id)).toMatchObject({ status: 'active', spendMinor: 49_900, budgetUsedBps: 4990 });
    await order(w, { ...v, qty: 6, unitMinor: 39_920, placedAt: at(-3600_000) }); // 11 x 9,980 = 109,780 >= 100,000
    await c.post(`${P}/process`, {}, w.admin);
    const done = await get(w, camp.id);
    expect(done).toMatchObject({ status: 'ended', endReason: 'budget_exhausted', spendMinor: 109_780, unitsMoved: 11 });
    expect(done.budgetUsedBps).toBeGreaterThanOrEqual(10_000);
    expect(await priceOf(w, v.variantId)).toMatchObject({ effectivePriceMinor: null, sale: { priceMinor: null } });
    await t.pump();
    expect((await t.outbox('promotion.ended')).find((e) => e.aggregateId === camp.id)!.payload).toMatchObject({ reason: 'budget_exhausted', spendMinor: 109_780 });
  });
});

describe('connectors that cannot take prices', () => {
  it('records the sale but reports the product as pending_sync with the reason instead of live', async () => {
    const w = await buildWorld(t, c, { stock: [30] });
    const caps = t.container.connectors.get('mock').capabilities as any;
    const before = caps.pricing.push;
    caps.pricing.push = false;
    try {
      const camp = await create(w, { name: 'No push', ...pct20, selection: { variantIds: [w.variant.variantId] } });
      const r = await act(w, camp.id, 'activate');
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data.pushed).toEqual([{ accountId: w.account.id, skipped: 'connector_cannot_push_prices' }]);
      const item = (await products(w, camp.id)).items[0];
      expect(item.status).toBe('pending_sync');
      expect(item.reason).toMatch(/^connector_cannot_push_prices: /);
      expect(await priceOf(w, w.variant.variantId)).toMatchObject({ effectivePriceMinor: 39_920 }); // our own price is in force
    } finally { caps.pricing.push = before; }
    await c.post(`${P}/process`, {}, w.admin);
    expect((await products(w, (await c.get(`${P}/campaigns`, w.admin)).body.data.items[0].id)).items[0]).toMatchObject({ status: 'live', reason: null });
  });
});

describe('products of a campaign', () => {
  it('selects by variants, categories (with sub-categories) and all active products; add, replace and remove', async () => {
    const w = await buildWorld(t, c, { stock: [30], sku: 'BASE-1' });
    const root = (await c.post('/api/v1/categories', { name: 'Apparel' }, w.admin)).body.data;
    const child = (await c.post('/api/v1/categories', { name: 'Shirts', parentId: root.id }, w.admin)).body.data;
    const shirt = await listed(w, { sku: 'SHIRT-1', categoryId: child.id });
    const tee = await listed(w, { sku: 'TEE-1', categoryId: root.id });
    const unlisted = await c.makeVariant(w.admin, { sku: 'NOLIST-1', categoryId: root.id });
    const camp = await create(w, { name: 'Selections', ...pct20 });

    const byCat = await c.put(`${P}/campaigns/${camp.id}/products`, { categoryIds: [root.id] }, w.admin);
    expect(byCat.body.data).toMatchObject({ total: 2, added: 2, removed: 0, droppedNoListing: 1, skipped: [] });
    expect((await products(w, camp.id)).items.map((i: any) => i.sku).sort()).toEqual(['SHIRT-1', 'TEE-1']);
    const sub = await c.put(`${P}/campaigns/${camp.id}/products`, { categoryIds: [child.id] }, w.admin);
    expect(sub.body.data).toMatchObject({ total: 1, added: 0, removed: 1 });
    const add = await c.put(`${P}/campaigns/${camp.id}/products`, { variantIds: [tee.variantId], mode: 'add' }, w.admin);
    expect(add.body.data).toMatchObject({ total: 2, added: 1, removed: 0 });
    expect((await c.put(`${P}/campaigns/${camp.id}/products`, { variantIds: [unlisted.variantId], mode: 'add' }, w.admin)).body.data.total).toBe(3); // named explicitly: kept, flagged
    expect((await products(w, camp.id)).items.find((i: any) => i.sku === 'NOLIST-1')).toMatchObject({ status: 'ineligible' });
    const all = await c.put(`${P}/campaigns/${camp.id}/products`, { allActive: true }, w.admin);
    expect(all.body.data).toMatchObject({ total: 3, droppedNoListing: 1 }); // BASE-1, SHIRT-1, TEE-1
    const del = await c.del(`${P}/campaigns/${camp.id}/products?variantIds=${shirt.variantId},${tee.variantId}`, w.admin);
    expect(del.body.data).toEqual({ removed: 2, total: 1 });
    expect((await c.del(`${P}/campaigns/${camp.id}/products?variantIds=not-an-id`, w.admin)).status).toBe(400);
    expect((await c.put(`${P}/campaigns/${camp.id}/products`, { categoryIds: ['018f0000-0000-7000-8000-000000000002'] }, w.admin)).status).toBe(404);
    expect((await c.get(`${P}/campaigns/018f0000-0000-7000-8000-000000000003/products`, w.admin)).status).toBe(404);
  });

  it('lists promoted SKUs across campaigns with filters, search, paging and per-status counts', async () => {
    const w = await buildWorld(t, c, { stock: [30], sku: 'TRV-1042-BLK' });
    const bp = await listed(w, { sku: 'BP-1021-GRY', priceMinor: 189_900 });
    const unlisted = await c.makeVariant(w.admin, { sku: 'GHOST-1' });
    const a = await create(w, { name: 'Alpha', ...pct20, selection: { variantIds: [w.variant.variantId, unlisted.variantId] } });
    const b = await create(w, { name: 'Beta', type: 'bogo', buyQuantity: 2, getQuantity: 1, selection: { variantIds: [bp.variantId] } });
    expect((await products(w, b.id)).items[0]).toMatchObject({ originalPriceMinor: 189_900, promoPriceMinor: 126_600, status: 'eligible' }); // pay for 2 of 3
    await act(w, a.id, 'activate');

    const all = (await c.get(`${P}/products`, w.admin)).body.data;
    expect(all).toMatchObject({ total: 3, counts: { all: 3, live: 1, eligible: 1, ineligible: 1 } });
    expect((await c.get(`${P}/products?filter[status]=ineligible`, w.admin)).body.data.items.map((i: any) => i.sku)).toEqual(['GHOST-1']);
    expect((await c.get(`${P}/products?filter[campaignId]=${b.id}`, w.admin)).body.data.items.map((i: any) => i.campaignName)).toEqual(['Beta']);
    expect((await c.get(`${P}/products?q=bp-10`, w.admin)).body.data.total).toBe(1);
    expect((await c.get(`${P}/products?q=alpha`, w.admin)).body.data.total).toBe(0); // search is by product and SKU
    expect((await c.get(`${P}/products?filter[accountId]=${w.account.id}`, w.admin)).body.data.total).toBe(3);
    expect((await c.get(`${P}/products?filter[accountId]=018f0000-0000-7000-8000-000000000009`, w.admin)).body.data.total).toBe(0);
    expect((await c.get(`${P}/products?pageSize=2&page=2`, w.admin)).body.data).toMatchObject({ total: 3, pages: 2, items: [expect.anything()] });
    const row = all.items.find((i: any) => i.sku === 'TRV-1042-BLK');
    expect(row).toMatchObject({ campaignCode: a.code, campaignStatus: 'active', channels: [expect.objectContaining({ marketplace: 'mock' })], promoPriceMinor: 39_920 });
  });
});

describe('edit, delete and duplicate drafts', () => {
  it('edits with a version lock, resets the fields on a type change and re-prices the products', async () => {
    const w = await buildWorld(t, c, { stock: [30] });
    const camp = await create(w, { name: 'Editable', ...pct20, selection: { variantIds: [w.variant.variantId] } });
    expect((await products(w, camp.id)).items[0].promoPriceMinor).toBe(39_920);
    const p1 = await c.patch(`${P}/campaigns/${camp.id}`, { version: 1, valueBps: 1000, name: '  Renamed  ', budgetMinor: 500_000, description: 'Autumn' }, w.admin);
    expect(p1.status, JSON.stringify(p1.body)).toBe(200);
    expect(p1.body.data).toMatchObject({ name: 'Renamed', valueBps: 1000, budgetMinor: 500_000, description: 'Autumn', version: 2 });
    expect((await products(w, camp.id)).items[0].promoPriceMinor).toBe(44_910);
    const stale = await c.patch(`${P}/campaigns/${camp.id}`, { version: 1, name: 'Late' }, w.admin);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(stale.body.error.details.currentVersion).toBe(2);
    expect((await c.patch(`${P}/campaigns/${camp.id}`, { name: 'no version' }, w.admin)).status).toBe(400);
    // type change: the percentage is dropped, the flat amount is required
    const noValue = await c.patch(`${P}/campaigns/${camp.id}`, { version: 2, type: 'flat_discount' }, w.admin);
    expect(noValue.status).toBe(400);
    const flat = await c.patch(`${P}/campaigns/${camp.id}`, { version: 2, type: 'flat_discount', valueMinor: 9_900 }, w.admin);
    expect(flat.body.data).toMatchObject({ type: 'flat_discount', valueBps: null, valueMinor: 9_900, version: 3 });
    expect((await products(w, camp.id)).items[0].promoPriceMinor).toBe(40_000);
    // dates and code rules
    expect((await c.patch(`${P}/campaigns/${camp.id}`, { version: 3, startsAt: at(2 * DAY).toISOString(), endsAt: at(DAY).toISOString() }, w.admin)).body.error.details.rule).toBe('invalid_window');
    const other = await create(w, { name: 'Other', code: 'TAKEN', ...pct20 });
    expect((await c.patch(`${P}/campaigns/${camp.id}`, { version: 3, code: 'taken' }, w.admin)).body.error.details.rule).toBe('duplicate_code');
    expect((await c.patch(`${P}/campaigns/${camp.id}`, { version: 3, code: 'Fresh-1', startsAt: null, accountIds: [w.account.id] }, w.admin)).body.data).toMatchObject({ code: 'FRESH-1', accountIds: [w.account.id], version: 4 });
    expect(other.code).toBe('TAKEN');
  });

  it('deletes a draft (freeing its code) and refuses to delete anything else', async () => {
    const w = await buildWorld(t, c, { stock: [30] });
    const camp = await create(w, { name: 'Gone', code: 'GONE1', ...pct20, selection: { variantIds: [w.variant.variantId] } });
    expect((await c.del(`${P}/campaigns/${camp.id}?version=7`, w.admin)).status).toBe(409);
    expect((await c.del(`${P}/campaigns/${camp.id}?version=1`, w.admin)).body.data).toEqual({ id: camp.id });
    expect((await c.get(`${P}/campaigns/${camp.id}`, w.admin)).status).toBe(404);
    expect((await c.get(`${P}/campaigns`, w.admin)).body.data.total).toBe(0);
    expect((await c.get(`${P}/products`, w.admin)).body.data.total).toBe(0);
    expect((await create(w, { name: 'Reuse', code: 'gone1', ...pct20 })).code).toBe('GONE1');
    const live = await create(w, { name: 'Live', ...pct20, selection: { variantIds: [w.variant.variantId] } });
    await act(w, live.id, 'activate');
    expect((await c.del(`${P}/campaigns/${live.id}`, w.admin)).body.error.details.rule).toBe('campaign_not_editable');
    expect((await sqlRun(`select action from audit_logs where resource_id = '${camp.id}' order by id`)).map((r) => r.action)).toEqual(['promotion.created', 'promotion.deleted']);
  });

  it('duplicates a campaign as a fresh draft with re-checked products and the next free copy code', async () => {
    const w = await buildWorld(t, c, { stock: [30] });
    const src = await create(w, { name: 'Original', code: 'ORIG', ...pct20, budgetMinor: 10_000, startsAt: at(DAY), endsAt: at(3 * DAY), selection: { variantIds: [w.variant.variantId] } });
    await act(w, src.id, 'schedule');
    const copy = await c.post(`${P}/campaigns/${src.id}/duplicate`, {}, w.admin);
    expect(copy.status).toBe(201);
    expect(copy.body.data).toMatchObject({ name: 'Original (copy)', code: 'ORIG-COPY', status: 'draft', startsAt: null, endsAt: null, budgetMinor: 10_000, valueBps: 2000, unitsMoved: 0, itemCounts: { total: 1 } });
    // the copy is blocked by nothing (no window yet) except the scheduled original: open-ended windows overlap
    expect((await products(w, copy.body.data.id)).items[0].reason).toMatch(/another scheduled or active campaign.*Original/);
    const second = await c.post(`${P}/campaigns/${src.id}/duplicate`, {}, w.admin);
    expect(second.body.data.code).toBe('ORIG-COPY2');
    expect((await t.outbox('promotion.created')).filter((e) => e.payload.code === 'ORIG-COPY')).toHaveLength(1);
  });
});
