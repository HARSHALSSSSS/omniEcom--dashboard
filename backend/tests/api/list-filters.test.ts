import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';
import { bandOf, extraInputOf, marketplaceSql, CHANNEL_GROUPS } from '../../modules/listings/src/list-filters';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let viewer: Actor;
let other: Actor;
let wh: { id: string };

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
beforeEach(async () => {
  mockControl.reset();
  mockControl.configure({ seedOrders: false });
  admin = await c.registerVendor({ businessName: 'Filters Co' });
  viewer = await c.addMember(admin, 'vendor_viewer');
  other = await c.registerVendor({ businessName: 'Rival Filters Co' });
  wh = await c.makeWarehouse(admin);
});
afterAll(() => t.close());

const get = async (url: string, as: Actor = admin) => {
  const r = await c.get(url, as);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data;
};
const newListing = async (accountId: string, variantId: string, extra: Record<string, unknown> = { marketplaceCategoryId: 'mock-apparel' }) => {
  const r = await c.post('/api/v1/listings', { marketplaceAccountId: accountId, variantId, ...extra }, admin);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.data;
};
const goLive = async (accountId: string, variantId: string) => {
  const l = await newListing(accountId, variantId);
  const r = await c.post(`/api/v1/listings/${l.id}/publish-flow`, {}, admin);
  expect(r.status, JSON.stringify(r.body)).toBe(202);
  await t.pump();
  const live = await get(`/api/v1/listings/${l.id}`);
  expect(live.status).toBe('active');
  return live;
};
const table = (qs = '') => get(`/api/v1/listings/table${qs ? `?${qs}` : ''}`);
const titles = (page: any): string[] => page.items.map((i: any) => i.productTitle).sort();

describe('pure rules', () => {
  it('bands a readiness percent and reads the extra filters of a query', () => {
    expect([100, 99, 80, 79, 50, 49, 0].map(bandOf)).toEqual(['100', 'high', 'high', 'medium', 'medium', 'low', 'low']);
    expect(extraInputOf({ 'filter[issue]': 'missing_images', 'filter[potential]': 'high_velocity' })).toMatchObject({ issue: 'missing_images', potential: 'high_velocity', readiness: undefined });
    expect(CHANNEL_GROUPS.social).toEqual({ name: 'Social Commerce', marketplaces: ['meesho', 'shopify'] });
    expect(marketplaceSql('mock')).toBeTruthy();
  });
});

describe('GET /listings/table extra filters', () => {
  it('filters by issue with the very numbers of the issue chips', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const live = await c.makeVariant(admin, { title: 'Alpha live tee' });
    const draft = await c.makeVariant(admin, { title: 'Beta draft tee' });
    const blocked = await c.makeVariant(admin, { title: 'Gamma blocked tee' });
    await c.stock(admin, live.variantId, wh.id, 10);
    await goLive(acct.id, live.variantId);
    await newListing(acct.id, draft.variantId);
    const b = await newListing(acct.id, blocked.variantId, {});
    await c.post(`/api/v1/listings/${b.id}/validate`, {}, admin);

    const issues = (await get('/api/v1/listings/insights')).issues;
    const byName: Record<string, string> = { missing_attributes: 'missingAttributes', missing_images: 'missingImages', category_mismatch: 'categoryMismatch', variant_issues: 'variantIssues' };
    for (const [issue, key] of Object.entries(byName)) {
      const page = await table(`filter[issue]=${issue}`);
      expect(page.total, issue).toBe(issues[key]);
      expect(page.items, issue).toHaveLength(issues[key]);
    }
    // neither attention listing has an image; the live listing is not "not ready", so it never counts
    expect(titles(await table('filter[issue]=missing_images'))).toEqual(['Beta draft tee', 'Gamma blocked tee']);
    // tab counts follow the filter
    expect((await table('filter[issue]=missing_images')).counts.all).toBe(2);
    expect((await c.get('/api/v1/listings/table?filter[issue]=nope', admin)).status).toBe(400);
  });

  it('lists the siblings of a half listed product under variant_issues', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Two size tee' });
    const add = await c.post(`/api/v1/products/${v.productId}/variants`, { sku: `${v.sku}-L`, sellingPriceMinor: 49900, mrpMinor: 59900, optionValues: { color: 'Blue', size: 'L' } }, admin);
    expect(add.status, JSON.stringify(add.body)).toBe(201);
    await c.makeVariant(admin, { title: 'Lonely tee' });
    await newListing(acct.id, v.variantId);
    expect(titles(await table('filter[issue]=variant_issues'))).toEqual(['Two size tee']);
    expect((await get('/api/v1/listings/insights')).issues.variantIssues).toBe(1);
  });

  it('shows draft listings, filters by product status and by master category', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const cat = (await c.post('/api/v1/categories', { name: 'Tees' }, admin)).body.data;
    const sub = (await c.post('/api/v1/categories', { name: 'Polo tees', parentId: cat.id }, admin)).body.data;
    const other2 = (await c.post('/api/v1/categories', { name: 'Shoes' }, admin)).body.data;
    const a = await c.makeVariant(admin, { title: 'Plain cotton tee', categoryId: cat.id });
    const b = await c.makeVariant(admin, { title: 'Polo tee', categoryId: sub.id });
    const s = await c.makeVariant(admin, { title: 'Runner shoe', categoryId: other2.id, status: 'draft' });
    await c.stock(admin, a.variantId, wh.id, 5);
    await goLive(acct.id, a.variantId);
    await newListing(acct.id, b.variantId);
    await newListing(acct.id, s.variantId);

    expect(titles(await table('filter[status]=draft'))).toEqual(['Polo tee', 'Runner shoe']);
    expect(titles(await table('filter[productStatus]=draft'))).toEqual(['Runner shoe']);
    expect(titles(await table('filter[productStatus]=active'))).toEqual(['Plain cotton tee', 'Polo tee']);
    // a category covers its sub-categories
    expect(titles(await table(`filter[categoryId]=${cat.id}`))).toEqual(['Plain cotton tee', 'Polo tee']);
    expect(titles(await table(`filter[categoryId]=${sub.id}`))).toEqual(['Polo tee']);

    const options = await get('/api/v1/listings/filter-options');
    expect(options.categories.map((x: any) => [x.name, x.listings])).toEqual([['Polo tees', 1], ['Runner shoe'.replace('Runner shoe', 'Shoes'), 1], ['Tees', 1]]);
    expect(await get('/api/v1/listings/filter-options', other)).toEqual({ categories: [] });
  });

  it('filters by readiness band and by channel stock (evaluated per listing)', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const stocked = await c.makeVariant(admin, { title: 'Stocked tee' });
    const empty = await c.makeVariant(admin, { title: 'Empty tee' });
    const bare = await c.makeVariant(admin, { title: 'Bare tee', brand: undefined, description: '' });
    await c.stock(admin, stocked.variantId, wh.id, 10);
    await goLive(acct.id, stocked.variantId);
    await newListing(acct.id, empty.variantId);
    await newListing(acct.id, bare.variantId, {});

    const all = await table('pageSize=100');
    expect(all.total).toBe(3);
    const bands = ['100', 'high', 'medium', 'low'];
    let seen = 0;
    for (const band of bands) {
      const page = await table(`filter[readiness]=${band}`);
      for (const item of page.items) {
        expect(bandOf(item.table.readiness.percent)).toBe(band);
        seen += 1;
      }
      expect(page.total).toBe(page.items.length);
      expect(page.counts.all).toBe(page.total);
    }
    expect(seen).toBe(3);

    expect(titles(await table('filter[inventory]=in_stock'))).toEqual(['Stocked tee']);
    expect(titles(await table('filter[inventory]=out_of_stock'))).toEqual(['Bare tee', 'Empty tee']);
    // computed filters page and combine with the SQL ones
    const paged = await table('filter[inventory]=out_of_stock&pageSize=1&page=2');
    expect(paged).toMatchObject({ total: 2, page: 2, pages: 2 });
    expect(paged.items).toHaveLength(1);
    expect(titles(await table('filter[inventory]=out_of_stock&filter[screenStatus]=blocked'))).toEqual([]);
    expect((await table('filter[inventory]=out_of_stock&filter[screenStatus]=needs_review')).total).toBeGreaterThanOrEqual(1);
    expect((await get('/api/v1/listings/table?filter[inventory]=in_stock', other)).total).toBe(0);
  });

  it('finds potential: variants that could still be listed elsewhere, and fast sellers', async () => {
    const first = await c.connectAccount(admin, 'mock', { displayName: 'Mock one' });
    const second = await c.connectAccount(admin, 'mock', { displayName: 'Mock two' });
    const both = await c.makeVariant(admin, { title: 'Everywhere tee' });
    const one = await c.makeVariant(admin, { title: 'Only one tee' });
    await newListing(first.id, both.variantId);
    await newListing(second.id, both.variantId);
    await newListing(first.id, one.variantId);

    expect(titles(await table('filter[potential]=missing_channel'))).toEqual(['Only one tee']);
    // no orders yet
    expect((await table('filter[potential]=high_velocity')).total).toBe(0);
    expect((await c.get('/api/v1/listings/table?filter[potential]=huge', admin)).status).toBe(400);
  });

  it('narrows the not-listed candidates by category too', async () => {
    await c.connectAccount(admin, 'mock');
    const cat = (await c.post('/api/v1/categories', { name: 'Hats' }, admin)).body.data;
    const none = (await c.post('/api/v1/categories', { name: 'Gloves' }, admin)).body.data;
    await c.makeVariant(admin, { title: 'Wool hat for winter', categoryId: cat.id });
    await c.makeVariant(admin, { title: 'Uncategorised tee' });
    expect((await get('/api/v1/listings/not-listed')).total).toBe(2);
    const hats = await get(`/api/v1/listings/not-listed?filter[categoryId]=${cat.id}`);
    expect(hats.items.map((i: any) => i.productTitle)).toEqual(['Wool hat for winter']);
    expect((await get(`/api/v1/listings/not-listed?filter[categoryId]=${none.id}`)).total).toBe(0);
  });

  it('knows the channel group of Social Commerce', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Any tee' });
    await newListing(acct.id, v.variantId);
    expect((await table('filter[marketplace]=mock')).total).toBe(1);
    expect((await table('filter[marketplace]=social')).total).toBe(0);
    expect((await get('/api/v1/listings/not-listed?filter[marketplace]=social')).total).toBe(0);
  });
});

describe('GET /listings/channel-summary', () => {
  it('lists every marketplace of the registry with its accounts, listings and not-listed products', async () => {
    const acct = await c.connectAccount(admin, 'mock', { displayName: 'Mock Storefront' });
    const live = await c.makeVariant(admin, { title: 'Alpha live cotton tee' });
    const draft = await c.makeVariant(admin, { title: 'Draft tee' });
    await c.makeVariant(admin, { title: 'Unlisted tee' });
    await c.stock(admin, live.variantId, wh.id, 10);
    await goLive(acct.id, live.variantId);
    await newListing(acct.id, draft.variantId);

    const s = await get('/api/v1/listings/channel-summary');
    const codes = s.channels.map((x: any) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['amazon_in', 'flipkart', 'meesho', 'shopify', 'snapdeal', 'mock']));
    const mock = s.channels.find((x: any) => x.code === 'mock');
    expect(mock).toMatchObject({ accounts: 1, activeAccounts: 1, connected: true, listings: 2, live: 1, drafts: 1, needsAttention: 1, notListed: 1, group: null });
    const snap = s.channels.find((x: any) => x.code === 'snapdeal');
    expect(snap).toMatchObject({ accounts: 0, connected: false, listings: 0, notListed: 0 });
    expect(s.channels.find((x: any) => x.code === 'meesho').group).toBe('social');
    expect(s.groups).toEqual([expect.objectContaining({ code: 'social', name: 'Social Commerce', marketplaces: ['meesho', 'shopify'], connected: false, listings: 0 })]);

    const empty = await get('/api/v1/listings/channel-summary', other);
    expect(empty.channels.every((x: any) => x.accounts === 0 && x.listings === 0 && x.notListed === 0)).toBe(true);
    expect((await get('/api/v1/listings/channel-summary', viewer)).channels).toHaveLength(s.channels.length);
  });
});

describe('POST /listings/bulk-create', () => {
  const post = (body: unknown, as: Actor = admin) => c.post('/api/v1/listings/bulk-create', body, as);

  it('creates a draft listing for every product x account pair, once', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const a = await c.makeVariant(admin, { title: 'Alpha tee' });
    const b = await c.makeVariant(admin, { title: 'Beta tee' });
    const extra = await c.post(`/api/v1/products/${b.productId}/variants`, { sku: `${b.sku}-L`, sellingPriceMinor: 49900, mrpMinor: 59900, optionValues: { color: 'Blue', size: 'L' } }, admin);
    expect(extra.status, JSON.stringify(extra.body)).toBe(201);

    const first = await post({ productIds: [a.productId, b.productId], accountIds: [acct.id] });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data.summary).toEqual({ total: 3, created: 3, existing: 0, failed: 0 });
    expect(first.body.data.results.map((r: any) => [r.productTitle, r.status])).toEqual([['Alpha tee', 'created'], ['Beta tee', 'created'], ['Beta tee', 'created']]);
    expect(first.body.data.results[0]).toMatchObject({ ok: true, variantId: a.variantId, accountId: acct.id, sku: a.sku, marketplace: 'mock', error: null });
    expect(first.body.data.marketplaces).toEqual([{ code: 'mock', name: expect.any(String) }]);

    const listings = await get('/api/v1/listings/table');
    expect(listings.total).toBe(3);
    expect(listings.items.every((i: any) => i.status === 'draft')).toBe(true);
    const created = first.body.data.results[0].listingId;
    expect(listings.items.map((i: any) => i.id)).toContain(created);

    // the same call again: nothing new, the ids of the listings that exist
    const again = await post({ productIds: [a.productId, b.productId], accountIds: [acct.id] });
    expect(again.body.data.summary).toEqual({ total: 3, created: 0, existing: 3, failed: 0 });
    expect(again.body.data.results[0]).toMatchObject({ status: 'exists', ok: true, listingId: created });
    expect((await get('/api/v1/listings/table')).total).toBe(3);
  });

  it('accepts single variants and several accounts, and reports what failed', async () => {
    const one = await c.connectAccount(admin, 'mock', { displayName: 'Mock one' });
    const two = await c.connectAccount(admin, 'mock', { displayName: 'Mock two' });
    const v = await c.makeVariant(admin, { title: 'Single tee' });
    const foreign = await c.makeVariant(other, { title: 'Not yours' });
    const ghost = '00000000-0000-4000-8000-000000000000';

    const r = await post({ variantIds: [v.variantId, foreign.variantId, ghost], accountIds: [one.id, two.id] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.summary).toEqual({ total: 6, created: 2, existing: 0, failed: 4 });
    const failed = r.body.data.results.filter((x: any) => x.status === 'failed');
    expect(failed.every((x: any) => x.ok === false && x.error.code === 'NOT_FOUND' && x.listingId === null)).toBe(true);
    expect((await get('/api/v1/listings/table')).total).toBe(2);
    expect((await get('/api/v1/listings/table', other)).total).toBe(0);

    // an account of someone else is not an account of yours
    const theirs = await c.connectAccount(other, 'mock');
    const x = await post({ variantIds: [v.variantId], accountIds: [theirs.id] });
    expect(x.body.data.summary).toMatchObject({ created: 0, failed: 1 });
  });

  it('validates the body and needs the write permission', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin);
    expect((await post({ accountIds: [acct.id] })).status).toBe(400);
    expect((await post({ productIds: [v.productId], accountIds: [] })).status).toBe(400);
    expect((await post({ productIds: ['nope'], accountIds: [acct.id] })).status).toBe(400);
    expect((await post({ productIds: [v.productId], accountIds: [acct.id] }, viewer)).status).toBe(403);
    expect((await c.post('/api/v1/listings/bulk-create', { productIds: [v.productId], accountIds: [acct.id] }, { ...admin, token: 'bad' } as Actor)).status).toBe(401);
  });
});
