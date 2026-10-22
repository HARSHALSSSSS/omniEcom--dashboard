import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';

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
  admin = await c.registerVendor({ businessName: 'Matrix Co' });
  viewer = await c.addMember(admin, 'vendor_viewer');
  other = await c.registerVendor({ businessName: 'Rival Matrix Co' });
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

describe('GET /listings/matrix and /listings/insights', () => {
  it('shows each master product on every connected marketplace, the worst status first', async () => {
    const acct = await c.connectAccount(admin, 'mock', { displayName: 'Mock Storefront' });
    const live = await c.makeVariant(admin, { title: 'Alpha live tee' });
    const draft = await c.makeVariant(admin, { title: 'Beta draft tee' });
    const blocked = await c.makeVariant(admin, { title: 'Gamma blocked tee' });
    const unlisted = await c.makeVariant(admin, { title: 'Delta unlisted tee' });
    await c.stock(admin, live.variantId, wh.id, 10);
    await goLive(acct.id, live.variantId);
    await newListing(acct.id, draft.variantId);
    const b = await newListing(acct.id, blocked.variantId, {});
    await c.post(`/api/v1/listings/${b.id}/validate`, {}, admin);

    const m = await get('/api/v1/listings/matrix');
    expect(m.total).toBe(4);
    expect(m.channels).toEqual([{ code: 'mock', name: expect.any(String), accounts: 1, connected: true }]);
    // products with listings that need attention first (by title among equals), then the live one, then the product without listings
    expect(m.items.map((i: any) => i.title)).toEqual(['Beta draft tee', 'Gamma blocked tee', 'Alpha live tee', 'Delta unlisted tee']);
    expect(m.items.map((i: any) => i.signal)).toEqual(['needs_review', 'blocked', 'live', 'not_listed']);
    expect(m.items[1]).toMatchObject({ productId: blocked.productId, sku: `P-${blocked.sku}`, variantsCount: 1 });
    expect(m.items[1].channels.mock).toEqual({ status: 'blocked', listings: 1, listedVariants: 1, byStatus: { blocked: 1 } });
    expect(m.items[3].productId).toBe(unlisted.productId);
    expect(m.items[3].channels.mock).toEqual({ status: 'not_listed', listings: 0, listedVariants: 0, byStatus: {} });

    expect((await get('/api/v1/listings/matrix?limit=2')).items).toHaveLength(2);
    expect((await c.get('/api/v1/listings/matrix?limit=99', admin)).status).toBe(400);
  });

  it('counts the catalogue reach and why listings are not ready', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const live = await c.makeVariant(admin, { title: 'Alpha live tee' });
    const draft = await c.makeVariant(admin, { title: 'Draft tee' });
    const noCategory = await c.makeVariant(admin, { title: 'No category tee' });
    await c.makeVariant(admin, { title: 'Not listed tee' });
    await c.stock(admin, live.variantId, wh.id, 10);
    await goLive(acct.id, live.variantId);
    await newListing(acct.id, draft.variantId);
    const b = await newListing(acct.id, noCategory.variantId, {});
    await c.post(`/api/v1/listings/${b.id}/validate`, {}, admin);

    const i = await get('/api/v1/listings/insights');
    expect(i).toMatchObject({ masterProducts: 4, connectedChannels: 1, activeListings: 1, readyToPublish: 0, needReview: 1 });
    // two listings need attention (a draft that was never validated, one blocked); neither has images
    expect(i.issues).toMatchObject({ notReady: 2, missingImages: 2, missingAttributes: 0, variantIssues: 0 });
    expect(i.issues.categoryMismatch).toBeGreaterThanOrEqual(0);
  });

  it('reports variants that are not listed next to listed siblings', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Two size tee' });
    const add = await c.post(`/api/v1/products/${v.productId}/variants`, { sku: `${v.sku}-L`, sellingPriceMinor: 49900, mrpMinor: 59900, optionValues: { color: 'Blue', size: 'L' } }, admin);
    expect(add.status, JSON.stringify(add.body)).toBe(201);
    await newListing(acct.id, v.variantId);
    const m = await get('/api/v1/listings/matrix');
    expect(m.items[0]).toMatchObject({ variantsCount: 2 });
    expect(m.items[0].channels.mock.listedVariants).toBe(1);
    expect((await get('/api/v1/listings/insights')).issues.variantIssues).toBe(1);
  });

  it('is empty for a workspace without products and isolated between tenants', async () => {
    const empty = await get('/api/v1/listings/matrix', other);
    expect(empty).toEqual({ total: 0, channels: [], items: [] });
    expect(await get('/api/v1/listings/insights', other)).toEqual({
      masterProducts: 0, connectedChannels: 0, activeListings: 0, readyToPublish: 0, needReview: 0,
      issues: { notReady: 0, missingAttributes: 0, missingImages: 0, categoryMismatch: 0, variantIssues: 0 },
    });
    await c.makeVariant(admin, { title: 'Mine' });
    expect((await get('/api/v1/listings/matrix', other)).total).toBe(0);
    expect((await get('/api/v1/listings/matrix', viewer)).total).toBe(1);
  });
});
