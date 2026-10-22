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
  admin = await c.registerVendor({ businessName: 'Flows Co' });
  viewer = await c.addMember(admin, 'vendor_viewer');
  other = await c.registerVendor({ businessName: 'Rival Flows Co' });
  wh = await c.makeWarehouse(admin);
});
afterAll(() => t.close());

const get = async (url: string, as: Actor = admin) => { const r = await c.get(url, as); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.data; };
const newListing = async (accountId: string, variantId: string, extra: Record<string, unknown> = { marketplaceCategoryId: 'mock-apparel' }) => {
  const r = await c.post('/api/v1/listings', { marketplaceAccountId: accountId, variantId, ...extra }, admin);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.data;
};

describe('listing flow screens: channels, unlisted context, selection', () => {
  it('lists the other channels of a product: status and readiness where listed, not_listed where it could be', async () => {
    const mock = await c.connectAccount(admin, 'mock', { displayName: 'Mock One' });
    const fk = await c.connectAccount(admin, 'flipkart', { displayName: 'Flipkart Store' });
    const v = await c.makeVariant(admin, { title: 'Cotton overshirt' });
    await c.stock(admin, v.variantId, wh.id, 9);
    const l = await newListing(mock.id, v.variantId, {}); // no category: blocked once validated
    await c.post(`/api/v1/listings/${l.id}/validate`, {}, admin);

    const ch = await get(`/api/v1/listings/${l.id}/channels`);
    expect(ch).toMatchObject({ listingId: l.id, productTitle: 'Cotton overshirt', variantId: v.variantId, variantsCount: 1 });
    const byAccount = Object.fromEntries(ch.channels.map((x: any) => [x.accountName, x]));
    expect(byAccount['Mock One']).toMatchObject({ listingId: l.id, screenStatus: 'blocked', current: true, readinessPercent: expect.any(Number) });
    expect(byAccount['Flipkart Store']).toMatchObject({ listingId: null, screenStatus: 'not_listed', readinessPercent: null, current: false });
    expect(fk.id).toBe(byAccount['Flipkart Store'].accountId);
  });

  it('unlisted context: variant, stock, account capability, and where else it is listed', async () => {
    const mock = await c.connectAccount(admin, 'mock', { displayName: 'Mock One' });
    const fk = await c.connectAccount(admin, 'flipkart', { displayName: 'Flipkart Store' });
    const v = await c.makeVariant(admin, { title: 'Cotton overshirt', barcode: '8901234567890' });
    await c.stock(admin, v.variantId, wh.id, 14);
    await newListing(mock.id, v.variantId);

    const ctx = await get(`/api/v1/listings/unlisted-context?variantId=${v.variantId}&accountId=${fk.id}`);
    expect(ctx).toMatchObject({ variantId: v.variantId, productTitle: 'Cotton overshirt', sku: v.sku, barcode: '8901234567890', variantsCount: 1, inventoryAvailable: 14, existingListingId: null });
    expect(ctx.account).toMatchObject({ id: fk.id, displayName: 'Flipkart Store', marketplace: 'flipkart' });
    expect(ctx.channels.find((x: any) => x.accountId === mock.id)).toMatchObject({ screenStatus: expect.stringMatching(/ready|needs_review|blocked|live/), current: false });
    expect(ctx.channels.find((x: any) => x.accountId === fk.id)).toMatchObject({ screenStatus: 'not_listed', current: true });

    // once the listing exists the context says so (the screen then goes to the Studio)
    const created = await c.post('/api/v1/listings', { marketplaceAccountId: fk.id, variantId: v.variantId }, admin);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const again = await get(`/api/v1/listings/unlisted-context?variantId=${v.variantId}&accountId=${fk.id}`);
    expect(again.existingListingId).toBe(created.body.data.id);
    expect((await c.get(`/api/v1/listings/unlisted-context?variantId=${v.variantId}&accountId=00000000-0000-4000-8000-000000000000`, admin)).status).toBe(404);
  });

  it('selection: rows with readiness in the order asked, missing ids reported', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v1 = await c.makeVariant(admin, { title: 'Alpha shirt' });
    const v2 = await c.makeVariant(admin, { title: 'Beta shirt' });
    const l1 = await newListing(acct.id, v1.variantId);
    const l2 = await newListing(acct.id, v2.variantId, {});
    const ghost = '00000000-0000-4000-8000-000000000000';
    const sel = await get(`/api/v1/listings/selection?ids=${l2.id},${l1.id},${ghost}`);
    expect(sel.items.map((i: any) => i.id)).toEqual([l2.id, l1.id]);
    expect(sel.missingIds).toEqual([ghost]);
    expect(sel.items[0].table).toMatchObject({ marketplaceName: expect.any(String), readiness: { percent: expect.any(Number) } });
    expect((await c.get('/api/v1/listings/selection?ids=', admin)).status).toBe(400);
    expect((await c.get('/api/v1/listings/selection?ids=not-a-uuid', admin)).status).toBe(400);
  });

  it('is tenant-isolated and read-only for viewers (but readable)', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Alpha shirt' });
    const l = await newListing(acct.id, v.variantId);
    expect((await c.get(`/api/v1/listings/${l.id}/channels`, other)).status).toBe(404);
    expect((await get(`/api/v1/listings/selection?ids=${l.id}`, other)).items).toEqual([]);
    expect((await c.get(`/api/v1/listings/unlisted-context?variantId=${v.variantId}&accountId=${acct.id}`, other)).status).toBe(404);
    expect((await get(`/api/v1/listings/${l.id}/channels`, viewer)).listingId).toBe(l.id);
  });

  it('resolves a blocker for real: set the missing attribute through PATCH and the readiness follows', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Cotton overshirt' });
    const l = await newListing(acct.id, v.variantId, {}); // no category: a blocker with a fix
    const before = await get(`/api/v1/listings/${l.id}/studio`);
    expect(before.readiness.topBlocker).toBeTruthy();
    expect(before.readiness.groups.flatMap((g: any) => g.items).some((i: any) => i.status === 'fail' && i.fix)).toBe(true);
    const patched = await c.patch(`/api/v1/listings/${l.id}`, { version: before.listing.version, marketplaceCategoryId: 'mock-apparel' }, admin);
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    const after = await get(`/api/v1/listings/${l.id}/studio`);
    expect(after.readiness.percent).toBeGreaterThan(before.readiness.percent);
  });
});
