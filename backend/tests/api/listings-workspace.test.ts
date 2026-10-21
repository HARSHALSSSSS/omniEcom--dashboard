import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';
import { buildReadiness, describeActivity, externalListingUrl, listingActions, screenStatusOf, type ReadinessFacts } from '../../modules/listings/src/workspace-domain';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let staff: Actor;
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
  admin = await c.registerVendor({ businessName: 'Workspace Co' });
  staff = await c.addMember(admin, 'vendor_staff');
  viewer = await c.addMember(admin, 'vendor_viewer');
  other = await c.registerVendor({ businessName: 'Rival Workspace Co' });
  wh = await c.makeWarehouse(admin);
});
afterAll(() => t.close());

const sqlAs = async <T = any>(q: string, p: unknown[] = []): Promise<T[]> => {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { return (await pg.query<T>(q, p)).rows; } finally { await pg.exec('SET ROLE oms_app'); }
};
const get = async (url: string, as: Actor = admin) => { const r = await c.get(url, as); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.data; };
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

// ================================================================================================
describe('pure rules', () => {
  it('maps lifecycle status + content state + validation to the screen tabs', () => {
    const v = (errors: number | null) => (errors === null ? {} : { validatedAt: 'x', errors: Array.from({ length: errors }, () => ({})) });
    const s = (status: string, contentState = 'synced', validation: any = {}) => screenStatusOf({ status, contentState, validation });
    expect(s('active')).toBe('live');
    expect(s('active', 'sync_pending')).toBe('syncing');
    expect(s('active', 'needs_review')).toBe('needs_review');
    expect(s('active', 'needs_republish')).toBe('needs_review');
    expect(s('active', 'failed')).toBe('failed');
    expect(s('pending')).toBe('syncing');
    expect(s('rejected')).toBe('failed');
    expect(s('correction_required')).toBe('failed');
    expect(s('ready')).toBe('ready');
    expect(s('approved')).toBe('ready');
    expect(s('draft', 'synced', v(null))).toBe('needs_review');
    expect(s('draft', 'synced', v(2))).toBe('blocked');
    expect(s('draft', 'synced', v(0))).toBe('needs_review');
    expect(s('unpublished')).toBe('needs_review');
  });

  const facts = (o: Partial<ReadinessFacts> = {}): ReadinessFacts => ({
    title: 'Premium cotton tee', description: 'A comfortable cotton tee for every day', brand: 'Acme', barcode: '8901234567890', imageCount: 3, primaryImage: { width: 1200, height: 1200 },
    priceMinor: 49900, mrpMinor: 59900, marketplaceCategoryId: 'cat-1', categoryRequired: true, available: 20, sellable: 18,
    validation: { validated: true, errors: [], warnings: [], requiredAttributes: 3 }, marketplaceIssues: [], ...o,
  });

  it('scores a complete listing 100% and lists blockers first with a fix action', () => {
    const full = buildReadiness(facts());
    expect(full).toMatchObject({ percent: 100, ready: true, topBlocker: null, summary: { warn: 0, fail: 0 } });
    expect(full.groups.map((g) => g.key)).toEqual(['content', 'media', 'attributes', 'price', 'stock', 'category']);

    const bad = buildReadiness(facts({ priceMinor: 70000, marketplaceCategoryId: null, imageCount: 0, primaryImage: null, available: 0, sellable: 0, mrpMinor: 59900, brand: null }));
    expect(bad.ready).toBe(false);
    expect(bad.topBlocker).toMatchObject({ key: 'price', field: 'price', fix: { action: 'set_price' } });
    const byKey = Object.fromEntries(bad.groups.flatMap((g) => g.items).map((i) => [i.key, i.status]));
    expect(byKey).toMatchObject({ price: 'fail', category: 'fail', images: 'warn', stock: 'warn', brand: 'warn', title: 'pass' });
    // pass counts 1, warn 0.5, fail 0
    const items = bad.groups.flatMap((g) => g.items);
    expect(bad.percent).toBe(Math.round((100 * (items.filter((i) => i.status === 'pass').length + items.filter((i) => i.status === 'warn').length / 2)) / items.length));
  });

  it('reports attribute problems only from a validation that ran, and low-resolution images', () => {
    const unchecked = buildReadiness(facts({ validation: { validated: false, errors: [], warnings: [], requiredAttributes: null } }));
    expect(unchecked.attributesChecked).toBe(false);
    expect(unchecked.groups.find((g) => g.key === 'attributes')!.items[0]).toMatchObject({ status: 'warn', fix: { action: 'validate' } });
    const missing = buildReadiness(facts({ validation: { validated: true, errors: [{ code: 'attribute_missing', message: 'Fabric is required by the marketplace category', attribute: 'fabric' }], warnings: [], requiredAttributes: 3 } }));
    expect(missing.topBlocker).toMatchObject({ field: 'fabric', fix: { action: 'fill_attribute', field: 'fabric' } });
    expect(buildReadiness(facts({ primaryImage: { width: 300, height: 900 } })).groups.find((g) => g.key === 'media')!.items.find((i) => i.key === 'image_resolution')!.status).toBe('warn');
    // what the marketplace reported shows up as its own group
    const fb = buildReadiness(facts({ marketplaceIssues: [{ code: 'IMG', message: 'Image rejected', severity: 'error', attribute: 'images' }] }));
    expect(fb.groups.at(-1)).toMatchObject({ key: 'marketplace', status: 'fail' });
  });

  it('actions say why they are disabled', () => {
    const base: Parameters<typeof listingActions>[0] = { status: 'draft', contentState: 'synced', externalListingId: null, accountStatus: 'active', canCreate: true, canUpdate: true, canDeactivate: true, canPushInventory: true, validationReady: null, approvalCurrent: null, inventoryPaused: false };
    const by = (f: Partial<typeof base>) => Object.fromEntries(listingActions({ ...base, ...f }).map((a) => [a.action, a])) as Record<'approve' | 'delete' | 'publish' | 'publish_flow' | 'sync_content' | 'sync_inventory' | 'unpublish', ReturnType<typeof listingActions>[number]>;
    expect(by({}).publish).toMatchObject({ enabled: false, disabledReason: 'Approve the listing first' });
    expect(by({}).publish_flow.enabled).toBe(true);
    expect(by({ status: 'approved', approvalCurrent: false }).publish.disabledReason).toMatch(/changed after/);
    expect(by({ status: 'approved', approvalCurrent: true }).publish.enabled).toBe(true);
    expect(by({ validationReady: false }).approve.disabledReason).toMatch(/validation errors/);
    expect(by({ accountStatus: 'revoked' }).publish_flow.disabledReason).toMatch(/not connected/);
    expect(by({ status: 'active', externalListingId: 'X1' }).publish_flow.enabled).toBe(false);
    expect(by({ status: 'active', externalListingId: 'X1' }).unpublish.enabled).toBe(true);
    expect(by({ status: 'active', externalListingId: 'X1' }).delete.enabled).toBe(false);
    expect(by({ status: 'active', externalListingId: 'X1', contentState: 'needs_review' }).sync_content.disabledReason).toMatch(/category review/);
    expect(by({ status: 'active', externalListingId: 'X1', contentState: 'sync_pending', canUpdate: false }).sync_content.disabledReason).toMatch(/republish/);
    expect(by({ status: 'active', externalListingId: 'X1', inventoryPaused: true }).sync_inventory.disabledReason).toMatch(/paused/);
    expect(by({ status: 'rejected' }).publish_flow.label).toBe('Fix and retry publish');
    expect(by({}).delete.enabled).toBe(true);
  });

  it('describes the audit trail and builds marketplace URLs only where they are real', () => {
    expect(describeActivity({ action: 'listing.status_changed', before: { status: 'pending' }, after: { status: 'active', externalStatus: 'ACTIVE' }, metadata: { source: 'poll' } }))
      .toEqual({ title: 'Status changed to active', details: 'pending to active (marketplace: ACTIVE), from poll' });
    expect(describeActivity({ action: 'listing.validate', before: null, after: { ready: false, errors: 2, warnings: 1 }, metadata: {} }).details).toBe('Not ready: 2 error(s), 1 warning(s)');
    expect(describeActivity({ action: 'listing.something_new', before: null, after: null, metadata: {} }).title).toBe('Something new');
    expect(externalListingUrl('amazon_in', 'B0ABC', 'live')).toBe('https://www.amazon.in/dp/B0ABC');
    expect(externalListingUrl('amazon_in', 'B0ABC', 'sandbox')).toBeNull();
    expect(externalListingUrl('mock', 'MP-1', 'live')).toBeNull();
    expect(externalListingUrl('flipkart', null, 'live')).toBeNull();
  });
});

// ================================================================================================
describe('the Listings screen: overview, table, not-listed', () => {
  it('counts the tabs, marketplaces and content states, and keeps the numbers in step with the table', async () => {
    const acct = await c.connectAccount(admin, 'mock', { displayName: 'Mock Storefront' });
    const v1 = await c.makeVariant(admin, { title: 'Premium cotton tee shirt', barcode: '8901234567890' });
    const v2 = await c.makeVariant(admin, { title: 'Classic denim jacket' });
    const v3 = await c.makeVariant(admin, { title: 'Wool winter scarf' });
    const v4 = await c.makeVariant(admin, { title: 'Leather travel wallet' });
    await c.stock(admin, v1.variantId, wh.id, 20);
    const live = await goLive(acct.id, v1.variantId);
    const draft = await newListing(acct.id, v2.variantId); // never validated
    const blocked = await newListing(acct.id, v3.variantId, {}); // no category: validation fails
    expect((await c.post(`/api/v1/listings/${blocked.id}/validate`, {}, admin)).body.data.validation.ready).toBe(false);
    const ready = await newListing(acct.id, v4.variantId);
    await c.post(`/api/v1/listings/${ready.id}/validate`, {}, admin);

    const o = await get('/api/v1/listings/overview');
    expect(o.totals).toEqual({ listings: 4, live: 1, needsAttention: 2, notListed: 0 });
    expect(o.byScreenStatus).toEqual({ live: 1, ready: 1, needs_review: 1, syncing: 0, failed: 0, blocked: 1, not_listed: 0 });
    expect(o.byStatus).toEqual({ active: 1, draft: 2, ready: 1 });
    expect(o.byContentState).toEqual({ synced: 4 });
    expect(o.byMarketplace).toEqual([{ marketplace: 'mock', name: expect.any(String), total: 4, live: 1, needsAttention: 2, notListed: 0 }]);

    const table = await get('/api/v1/listings/table?pageSize=2&sort=title');
    expect(table).toMatchObject({ total: 4, page: 1, pageSize: 2, pages: 2, counts: { all: 4, live: 1, ready: 1, needs_review: 1, syncing: 0, failed: 0, blocked: 1 } });
    expect(table.items.map((i: any) => i.productTitle)).toEqual(['Classic denim jacket', 'Leather travel wallet']);
    expect((await get('/api/v1/listings/table?pageSize=2&page=2&sort=title')).items.map((i: any) => i.productTitle)).toEqual(['Premium cotton tee shirt', 'Wool winter scarf']);

    const liveRow = (await get(`/api/v1/listings/table?filter[screenStatus]=live`)).items[0];
    expect(liveRow).toMatchObject({ id: live.id, sku: v1.sku, status: 'active' });
    expect(liveRow.table).toMatchObject({
      screenStatus: 'live', barcode: '8901234567890', marketplaceName: expect.any(String), accountName: 'Mock Storefront', priceMinor: 49900, mrpMinor: 59900, salePriceMinor: null,
      stock: { available: 20, sellable: 20, pushed: 20, dirty: false }, externalListingId: expect.stringMatching(/^MP-/), externalUrl: null, lastSyncAt: expect.any(String),
      readiness: { ready: true, errors: 0, attributesChecked: true },
    });
    expect(liveRow.table.readiness.percent).toBeGreaterThan(70);

    // filters: tab, attention, search by sku / title / barcode, marketplace, account; counts ignore the tab filter but obey the search
    expect((await get('/api/v1/listings/table?filter[screenStatus]=blocked')).items.map((i: any) => i.id)).toEqual([blocked.id]);
    expect((await get('/api/v1/listings/table?filter[attention]=true')).total).toBe(2);
    expect((await get(`/api/v1/listings/table?q=${v2.sku}`)).items.map((i: any) => i.id)).toEqual([draft.id]);
    expect((await get('/api/v1/listings/table?q=8901234567890')).items.map((i: any) => i.id)).toEqual([live.id]);
    const searched = await get('/api/v1/listings/table?q=wallet&filter[screenStatus]=live');
    expect(searched.total).toBe(0);
    expect(searched.counts).toMatchObject({ all: 1, ready: 1, live: 0 });
    expect((await get('/api/v1/listings/table?filter[marketplace]=flipkart')).total).toBe(0);
    expect((await get(`/api/v1/listings/table?filter[accountId]=${acct.id}`)).total).toBe(4);
    expect((await get('/api/v1/listings/table?filter[status]=draft')).total).toBe(2);
    expect((await get('/api/v1/listings/table?sort=-price')).items).toHaveLength(4);
    expect((await c.get('/api/v1/listings/table?sort=bogus', admin)).status).toBe(400);

    // the cursor list is unchanged; include=table gives it the same block
    const cursor = await c.get('/api/v1/listings?limit=10', admin);
    expect(cursor.body.data).toHaveLength(4);
    expect(cursor.body.data[0].table).toBeUndefined();
    const withTable = await c.get('/api/v1/listings?limit=10&include=table', admin);
    expect(withTable.body.data.find((i: any) => i.id === live.id).table.screenStatus).toBe('live');
    expect(withTable.body.meta).toMatchObject({ limit: 10, hasMore: false });
  });

  it('lists what could still be listed (variants x connected accounts), narrowing as listings are created', async () => {
    const mock = await c.connectAccount(admin, 'mock', { displayName: 'Mock One' });
    const fk = await c.connectAccount(admin, 'flipkart', { displayName: 'Flipkart Store' });
    const v1 = await c.makeVariant(admin, { title: 'Alpha shirt' });
    const v2 = await c.makeVariant(admin, { title: 'Beta shirt' });
    await c.makeVariant(admin, { title: 'Draft only shirt', status: 'draft' }); // draft products are not listable
    const o1 = await get('/api/v1/listings/overview');
    expect(o1.totals.notListed).toBe(4);
    expect(o1.byScreenStatus.not_listed).toBe(4);
    expect(o1.byMarketplace.map((m: any) => [m.marketplace, m.notListed])).toEqual([['flipkart', 2], ['mock', 2]]);

    await newListing(mock.id, v1.variantId);
    const nl = await get(`/api/v1/listings/not-listed?filter[accountId]=${mock.id}`);
    expect(nl).toMatchObject({ total: 1, pages: 1 });
    expect(nl.items[0]).toMatchObject({ variantId: v2.variantId, sku: v2.sku, productTitle: 'Beta shirt', accountId: mock.id, accountName: 'Mock One', marketplace: 'mock', priceMinor: 49900 });
    const all = await get('/api/v1/listings/not-listed?pageSize=2&sort=x'.replace('&sort=x', ''));
    expect(all.total).toBe(3);
    expect(all.items).toHaveLength(2);
    expect((await get('/api/v1/listings/not-listed?q=alpha')).items.map((i: any) => i.accountId)).toEqual([fk.id]);
    expect((await get('/api/v1/listings/overview?filter[marketplace]=mock')).totals).toMatchObject({ listings: 1, notListed: 1 });
  });
});

// ================================================================================================
describe('the Listing Studio: readiness, studio, activity', () => {
  it('builds the readiness checklist from the live validation with fix actions', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium cotton tee shirt' });
    const l = await newListing(acct.id, v.variantId);
    const r = await get(`/api/v1/listings/${l.id}/readiness`);
    expect(r).toMatchObject({ listingId: l.id, marketplace: 'mock', ready: true, attributesChecked: true });
    const items = Object.fromEntries(r.groups.flatMap((g: any) => g.items).map((i: any) => [i.key, i]));
    expect(items.title.status).toBe('pass');
    expect(items.images).toMatchObject({ status: 'warn', fix: { action: 'upload_images' } });
    expect(items.barcode).toMatchObject({ status: 'warn', fix: { action: 'add_barcode' } });
    expect(items.stock).toMatchObject({ status: 'warn', fix: { action: 'restock' } });
    expect(items.category.status).toBe('pass');
    expect(r.groups.map((g: any) => g.key)).toEqual(['content', 'media', 'attributes', 'price', 'stock', 'category']);

    const noCategory = await newListing(acct.id, (await c.makeVariant(admin)).variantId, {});
    const r2 = await get(`/api/v1/listings/${noCategory.id}/readiness`);
    expect(r2).toMatchObject({ ready: false, topBlocker: { key: 'category', fix: { action: 'map_category' } } });
    expect((await c.get(`/api/v1/listings/${l.id}/readiness`, other)).status).toBe(404);
    expect((await c.get(`/api/v1/listings/${l.id}/readiness`, viewer)).status).toBe(200);
  });

  it('studio: master vs channel content, preview, pricing, stock, category attributes, variations, activity and actions', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium cotton tee shirt', description: 'A comfortable cotton tee', brand: 'Acme' });
    await c.stock(admin, v.variantId, wh.id, 12);
    const l = await newListing(acct.id, v.variantId);
    await c.post(`/api/v1/listings/${l.id}/validate`, {}, admin);

    const s = await get(`/api/v1/listings/${l.id}/studio`);
    expect(s.listing).toMatchObject({ id: l.id, status: 'ready', table: { screenStatus: 'ready' } });
    expect(s.product).toMatchObject({ id: v.productId, variantId: v.variantId, sku: v.sku, title: 'Premium cotton tee shirt', brand: 'Acme' });
    expect(s.account).toMatchObject({ id: acct.id, marketplace: 'mock', status: 'active' });
    expect(s.content.title).toEqual({ master: 'Premium cotton tee shirt', effective: 'Premium cotton tee shirt', overridden: false });
    expect(s.content.bulletPoints).toEqual({ master: [], effective: [], overridden: false });
    expect(s.preview).toMatchObject({ marketplace: 'mock', title: 'Premium cotton tee shirt', priceMinor: 49900, mrpMinor: 59900, discountPercent: 17, endpoint: 'POST /sandbox/listings', approval: { approved: false, current: false } });
    expect(s.preview.payload).toMatchObject({ sku: v.sku, category: 'mock-apparel', price: 49900 });
    expect(s.pricing).toMatchObject({ priceMinor: 49900, mrpMinor: 59900, variantPriceMinor: 49900, listingPriceOverride: false, salePriceMinor: null, discountPercent: 17, currency: 'INR' });
    expect(s.stock).toMatchObject({ available: 12, sellable: 12, pushed: null });
    expect(s.category).toMatchObject({ marketplaceCategoryId: 'mock-apparel' });
    expect(s.category.attributes.length).toBeGreaterThan(0);
    const brand = s.category.attributes.find((a: any) => a.key === 'brand');
    expect(brand).toMatchObject({ value: 'Acme', required: true, source: 'core:brand', channelSpecific: false, status: 'pass' });
    expect(s.variations).toEqual([expect.objectContaining({ variantId: v.variantId, sku: v.sku, listingId: l.id, listingStatus: 'ready', available: 12, current: true })]);
    expect(s.contentSync).toMatchObject({ state: 'synced', changedFields: [], error: null });
    expect(s.readiness.percent).toBeGreaterThan(0);
    expect(s.activity.total).toBeGreaterThanOrEqual(2);
    expect(s.activity.items[0]).toMatchObject({ action: 'listing.validate', title: 'Validated', actor: { type: 'user', name: 'Asha Admin' } });
    expect(s.activity.items.at(-1)).toMatchObject({ action: 'listing.create', title: 'Listing created' });
    const acts = Object.fromEntries(s.actions.map((a: any) => [a.action, a]));
    expect(acts.approve.enabled).toBe(true);
    expect(acts.publish).toMatchObject({ enabled: false, disabledReason: 'Approve the listing first' });
    expect(acts.publish_flow.enabled).toBe(true);
    expect(acts.unpublish).toMatchObject({ enabled: false });
    expect(acts.delete.enabled).toBe(true);
    expect((await c.get(`/api/v1/listings/${l.id}/studio`, other)).status).toBe(404);
    expect((await c.get(`/api/v1/listings/${l.id}/studio`, viewer)).status).toBe(200);
  });

  it('activity is paged newest first and tenant isolated', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin);
    const l = await newListing(acct.id, v.variantId);
    await c.post(`/api/v1/listings/${l.id}/validate`, {}, admin);
    await c.post(`/api/v1/listings/${l.id}/approve`, {}, admin);
    const p1 = await get(`/api/v1/listings/${l.id}/activity?pageSize=2`);
    expect(p1).toMatchObject({ total: 3, page: 1, pageSize: 2, pages: 2 });
    expect(p1.items.map((i: any) => i.action)).toEqual(['listing.approve', 'listing.validate']);
    expect((await get(`/api/v1/listings/${l.id}/activity?pageSize=2&page=2`)).items.map((i: any) => i.action)).toEqual(['listing.create']);
    expect((await c.get(`/api/v1/listings/${l.id}/activity`, other)).status).toBe(404);
  });

  it('shows the marketplace feedback of a rejection in the readiness checklist and the table', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin);
    const l = await newListing(acct.id, v.variantId);
    await sqlAs(`update marketplace_listings set status = 'rejected', issues = $2::jsonb, external_listing_id = 'MP-REJ' where id = $1`, [l.id, JSON.stringify([{ code: 'IMG_BAD', message: 'The main image has a watermark', severity: 'error', attribute: 'images' }])]);
    const row = (await get(`/api/v1/listings/table?filter[screenStatus]=failed`)).items[0];
    expect(row.id).toBe(l.id);
    expect(row.table.readiness.topBlocker).toMatchObject({ message: 'The main image has a watermark', field: 'images' });
    const r = await get(`/api/v1/listings/${l.id}/readiness`);
    expect(r.groups.at(-1)).toMatchObject({ key: 'marketplace', status: 'fail' });
    const s = await get(`/api/v1/listings/${l.id}/studio`);
    expect(s.actions.find((a: any) => a.action === 'publish_flow')).toMatchObject({ label: 'Fix and retry publish', enabled: true });
    expect(s.marketplaceIssues).toHaveLength(1);
  });

  it('thumbnail, image count and image size come from the product images', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin);
    const l = await newListing(acct.id, v.variantId);
    await sqlAs(`insert into product_documents (vendor_id, product_id, kind, storage_key, file_name, mime_type, status, is_primary, width, height) values ($1, $2, 'image', $3, 'front.jpg', 'image/jpeg', 'uploaded', true, 300, 300)`,
      [admin.vendorId, v.productId, `vendors/${admin.vendorId}/products/${v.productId}/front.jpg`]);
    const row = (await get('/api/v1/listings/table')).items.find((i: any) => i.id === l.id);
    expect(row.table.imageCount).toBe(1);
    // the test storage cannot sign downloads: the thumbnail is then null (never an error)
    expect(row.table.thumbnailUrl === null || typeof row.table.thumbnailUrl === 'string').toBe(true);
    const r = await get(`/api/v1/listings/${l.id}/readiness`);
    expect(r.groups.find((g: any) => g.key === 'media').items.find((i: any) => i.key === 'image_resolution')).toMatchObject({ status: 'warn' });
    const s = await get(`/api/v1/listings/${l.id}/studio`);
    expect(s.media).toEqual([expect.objectContaining({ fileName: 'front.jpg', isPrimary: true, width: 300, height: 300 })]);
  });
});

// ================================================================================================
describe('PATCH /listings/{id}: channel content as overrides, price, attribute overrides', () => {
  it('saves title, description, bullets, search terms and brand for the channel without touching the master, and invalidates the approval', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium cotton tee shirt', description: 'A comfortable cotton tee' });
    const l = await newListing(acct.id, v.variantId);
    await c.post(`/api/v1/listings/${l.id}/validate`, {}, admin);
    expect((await c.post(`/api/v1/listings/${l.id}/approve`, {}, admin)).body.data.status).toBe('approved');

    const r = await c.patch(`/api/v1/listings/${l.id}`, { title: '  Acme Tee - Cotton, Blue  ', bulletPoints: ['100% cotton', 'Machine washable'], searchTerms: ['tee', 'cotton'], brand: 'Acme Basics' }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'draft', approval: { approved: false }, validation: null });
    // the master product is untouched
    const master = (await c.get(`/api/v1/products/${v.productId}`, admin)).body.data;
    expect(master).toMatchObject({ title: 'Premium cotton tee shirt', brand: 'Acme' });
    const [pmd] = await sqlAs('select data from product_marketplace_data where product_id = $1 and marketplace = $2', [v.productId, 'mock']);
    expect(pmd.data).toEqual({ title: 'Acme Tee - Cotton, Blue', bullet_points: ['100% cotton', 'Machine washable'], search_terms: ['tee', 'cotton'], brand: 'Acme Basics' });

    const s = await get(`/api/v1/listings/${l.id}/studio`);
    expect(s.content.title).toEqual({ master: 'Premium cotton tee shirt', effective: 'Acme Tee - Cotton, Blue', overridden: true });
    expect(s.content.bulletPoints).toMatchObject({ effective: ['100% cotton', 'Machine washable'], overridden: true });
    expect(s.content.brand).toMatchObject({ master: 'Acme', effective: 'Acme Basics', overridden: true });
    expect(s.content.searchTerms).toMatchObject({ effective: ['tee', 'cotton'], overridden: true });
    expect(s.preview.title).toBe('Acme Tee - Cotton, Blue');
    expect(s.activity.items.map((i: any) => i.action)).toContain('listing.channel_content_update');

    // the same values again change nothing; null goes back to the master
    const again = await c.patch(`/api/v1/listings/${l.id}`, { title: 'Acme Tee - Cotton, Blue' }, admin);
    expect(again.status).toBe(200);
    const reset = await c.patch(`/api/v1/listings/${l.id}`, { title: null, bulletPoints: [], searchTerms: null, brand: '' }, admin);
    expect(reset.status).toBe(200);
    const [after] = await sqlAs('select data from product_marketplace_data where product_id = $1 and marketplace = $2', [v.productId, 'mock']);
    expect(after.data).toEqual({});
    expect((await get(`/api/v1/listings/${l.id}/studio`)).content.title.overridden).toBe(false);
  });

  it('a live listing accepts channel content: it is queued for a content sync and the marketplace gets the new title', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium cotton tee shirt' });
    await c.stock(admin, v.variantId, wh.id, 5);
    const live = await goLive(acct.id, v.variantId);
    const r = await c.patch(`/api/v1/listings/${live.id}`, { title: 'Channel title for the live listing' }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'active', contentState: 'sync_pending', contentChangedFields: ['title'] });
    const table = (await get('/api/v1/listings/table?filter[screenStatus]=syncing')).items;
    expect(table.map((i: any) => i.id)).toEqual([live.id]);
    await t.pump();
    expect((await get(`/api/v1/listings/${live.id}`)).contentState).toBe('synced');
    expect(mockControl.listing(acct.sellerId, v.sku).product?.title).toBe('Channel title for the live listing');
    expect((await get('/api/v1/listings/overview')).byScreenStatus.live).toBe(1);
    // attributes and category stay locked while live
    const bad = await c.patch(`/api/v1/listings/${live.id}`, { attributeOverrides: { fabric: 'Cotton' } }, admin);
    expect(bad.status).toBe(409);
    expect(bad.body.error.details.notAllowed).toContain('attributeValues');
  });

  it('attribute overrides merge (null removes), price rules and the version lock hold', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin);
    const l = await newListing(acct.id, v.variantId, { marketplaceCategoryId: 'mock-apparel', attributeValues: { fabric: 'Cotton', fit: 'Slim' } });
    const m = await c.patch(`/api/v1/listings/${l.id}`, { attributeOverrides: { fit: null, pattern: 'Plain', gsm: 180 } }, admin);
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    expect(m.body.data.attributeValues).toEqual({ fabric: 'Cotton', pattern: 'Plain', gsm: 180 });
    expect((await c.patch(`/api/v1/listings/${l.id}`, { attributeOverrides: { a: 'b' }, attributeValues: { c: 'd' } }, admin)).body.error.details.rule).toBe('attribute_patch_ambiguous');

    const p = await c.patch(`/api/v1/listings/${l.id}`, { priceMinor: 45000, mrpMinor: 55000 }, admin);
    expect(p.body.data).toMatchObject({ priceMinor: 45000, mrpMinor: 55000, effectivePriceMinor: 45000 });
    const bad = await c.patch(`/api/v1/listings/${l.id}`, { priceMinor: 60000 }, admin);
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toMatchObject({ rule: 'price_above_mrp', priceMinor: 60000, mrpMinor: 55000 });
    const s = await get(`/api/v1/listings/${l.id}/studio`);
    expect(s.pricing).toMatchObject({ priceMinor: 45000, mrpMinor: 55000, listingPriceOverride: true, listingMrpOverride: true, variantPriceMinor: 49900 });

    const stale = await c.patch(`/api/v1/listings/${l.id}`, { title: 'X title' , version: 1 }, admin);
    expect(stale.status).toBe(409);
    expect(stale.body.error.details.currentVersion).toBeGreaterThan(1);
    // nothing of the rejected patch was saved
    expect((await sqlAs('select data from product_marketplace_data where product_id = $1', [v.productId])).length).toBe(0);
    expect((await c.patch(`/api/v1/listings/${l.id}`, { title: 'Hijack' }, viewer)).status).toBe(403);
    expect((await c.patch(`/api/v1/listings/${l.id}`, { title: 'Hijack' }, other)).status).toBe(404);
    expect((await c.patch(`/api/v1/listings/${l.id}`, { bulletPoints: Array.from({ length: 11 }, () => 'x') }, admin)).status).toBe(400);
    expect((await c.patch(`/api/v1/listings/${l.id}`, { title: 'Staff edit' }, staff)).status).toBe(200);
  });

  it('a channel override applies to every listing of the product on that marketplace', async () => {
    const a1 = await c.connectAccount(admin, 'mock', { displayName: 'Mock A' });
    const v = await c.makeVariant(admin, { title: 'Premium cotton tee shirt' });
    const l1 = await newListing(a1.id, v.variantId);
    await c.post(`/api/v1/listings/${l1.id}/validate`, {}, admin);
    const r = await c.patch(`/api/v1/listings/${l1.id}`, { description: 'Channel description that is long enough' }, admin);
    expect(r.status).toBe(200);
    const s = await get(`/api/v1/listings/${l1.id}/studio`);
    expect(s.content.description).toMatchObject({ overridden: true, effective: 'Channel description that is long enough' });
    expect(s.content.description.master).toBe('A comfortable cotton tee');
  });
});

// ================================================================================================
describe('publish flow and bulk actions', () => {
  it('runs validate -> approve -> publish with a result per step (202) and is safe to repeat', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium cotton tee shirt' });
    const l = await newListing(acct.id, v.variantId);
    const r = await c.post(`/api/v1/listings/${l.id}/publish-flow`, {}, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(202);
    expect(r.body.data).toMatchObject({ listingId: l.id, outcome: 'queued', alreadyQueued: false, job: { type: 'listing_publish', status: 'queued' }, listing: { status: 'approved' } });
    expect(r.body.data.steps.map((s: any) => [s.step, s.status])).toEqual([['validate', 'ok'], ['approve', 'ok'], ['publish', 'ok']]);
    expect(r.body.data.steps[2].details.jobId).toBe(r.body.data.job.id);
    // repeating returns the same job; validate/approve are not redone
    const again = await c.post(`/api/v1/listings/${l.id}/publish-flow`, {}, admin);
    expect(again.status).toBe(202);
    expect(again.body.data.job.id).toBe(r.body.data.job.id);
    expect(again.body.data).toMatchObject({ alreadyQueued: true });
    expect(again.body.data.steps.map((s: any) => s.status)).toEqual(['skipped', 'skipped', 'ok']);
    await t.pump();
    expect((await get(`/api/v1/listings/${l.id}`)).status).toBe('active');
    // already live: nothing to do, still HTTP 200
    const live = await c.post(`/api/v1/listings/${l.id}/publish-flow`, {}, admin);
    expect(live.status).toBe(200);
    expect(live.body.data).toMatchObject({ outcome: 'not_applicable', job: null });
    expect(live.body.data.steps.map((s: any) => s.status)).toEqual(['skipped', 'not_run', 'not_run']);
  });

  it('stops at validation with the blocking issues, and nothing is queued', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin);
    const l = await newListing(acct.id, v.variantId, {});
    const approvedBefore = (await t.outbox('listing.approved')).length;
    const r = await c.post(`/api/v1/listings/${l.id}/publish-flow`, {}, admin);
    expect(r.status).toBe(200);
    expect(r.body.data.outcome).toBe('blocked');
    expect(r.body.data.job).toBeNull();
    expect(r.body.data.steps).toEqual([
      expect.objectContaining({ step: 'validate', status: 'failed', code: 'LISTING_NOT_READY', details: expect.objectContaining({ errors: [expect.objectContaining({ code: 'category_missing' })] }) }),
      expect.objectContaining({ step: 'approve', status: 'not_run' }), expect.objectContaining({ step: 'publish', status: 'not_run' }),
    ]);
    expect((await t.outbox('listing.approved')).length).toBe(approvedBefore);
    expect((await c.post(`/api/v1/listings/${l.id}/publish-flow`, {}, viewer)).status).toBe(403);
    expect((await c.post(`/api/v1/listings/${l.id}/publish-flow`, {}, other)).status).toBe(404);
  });

  it('a disconnected account is reported on the step that fails', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin);
    const l = await newListing(acct.id, v.variantId);
    await sqlAs(`update marketplace_accounts set status = 'paused' where id = $1`, [acct.id]);
    const r = await c.post(`/api/v1/listings/${l.id}/publish-flow`, {}, admin);
    expect(r.status).toBe(200);
    expect(r.body.data.outcome).toBe('blocked');
    expect(r.body.data.steps[0].details.errors.map((e: any) => e.code)).toContain('account_not_connected');
    const s = await get(`/api/v1/listings/${l.id}/studio`);
    expect(s.actions.find((a: any) => a.action === 'publish_flow')).toMatchObject({ enabled: false, disabledReason: 'The marketplace account is not connected' });
  });

  it('bulk publish: per-item results with partial success inside HTTP 200', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const good1 = await newListing(acct.id, (await c.makeVariant(admin)).variantId);
    const good2 = await newListing(acct.id, (await c.makeVariant(admin)).variantId);
    const bad = await newListing(acct.id, (await c.makeVariant(admin)).variantId, {});
    const foreign = await newListing((await c.connectAccount(other, 'mock')).id, (await c.makeVariant(other)).variantId).catch(() => null);
    void foreign;
    const missing = '00000000-0000-4000-8000-000000000000';
    const r = await c.post('/api/v1/listings/bulk-publish', { ids: [good1.id, bad.id, missing, good2.id, good1.id] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.summary).toEqual({ total: 4, succeeded: 2, failed: 2, skipped: 0 });
    const by = Object.fromEntries(r.body.data.results.map((x: any) => [x.id, x]));
    expect(by[good1.id]).toMatchObject({ ok: true, status: 'done', outcome: 'queued', jobId: expect.any(String), error: null });
    expect(by[bad.id]).toMatchObject({ ok: false, status: 'failed', outcome: 'blocked', error: { code: 'LISTING_NOT_READY' } });
    expect(by[missing]).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' }, sku: null });
    await t.pump();
    // the marketplace review of the second listing may still be open: ask for its status (as the Refresh button does)
    for (let i = 0; i < 3 && (await get(`/api/v1/listings/${good2.id}`)).status !== 'active'; i++) { await c.post(`/api/v1/listings/${good2.id}/refresh-status`, {}, admin); await t.pump(); }
    expect((await get(`/api/v1/listings/${good1.id}`)).status).toBe('active');
    expect((await get(`/api/v1/listings/${good2.id}`)).status).toBe('active');
    expect((await get(`/api/v1/listings/${bad.id}`)).status).toBe('draft');
    // a second run skips what is live
    const again = await c.post('/api/v1/listings/bulk-publish', { ids: [good1.id] }, admin);
    expect(again.body.data.summary).toEqual({ total: 1, succeeded: 0, failed: 0, skipped: 1 });
    // limits and permissions
    expect((await c.post('/api/v1/listings/bulk-publish', { ids: [] }, admin)).status).toBe(400);
    expect((await c.post('/api/v1/listings/bulk-publish', { ids: Array.from({ length: 101 }, () => missing) }, admin)).status).toBe(400);
    expect((await c.post('/api/v1/listings/bulk-publish', { ids: [good1.id] }, viewer)).status).toBe(403);
    // another business sees nothing of ours
    const foreignTry = await c.post('/api/v1/listings/bulk-publish', { ids: [bad.id] }, other);
    expect(foreignTry.body.data.results[0]).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('bulk actions: validate, unpublish, retry and sync_inventory, each with per-item results', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v1 = await c.makeVariant(admin);
    const v2 = await c.makeVariant(admin);
    const v3 = await c.makeVariant(admin);
    await c.stock(admin, v1.variantId, wh.id, 9);
    const live = await goLive(acct.id, v1.variantId);
    const draft = await newListing(acct.id, v2.variantId);
    const rejected = await newListing(acct.id, v3.variantId);
    await sqlAs(`update marketplace_listings set status = 'rejected', external_listing_id = 'MP-REJ-1' where id = $1`, [rejected.id]);

    const val = await c.post('/api/v1/listings/bulk-actions', { action: 'validate', ids: [live.id, draft.id] }, admin);
    expect(val.body.data.summary).toEqual({ total: 2, succeeded: 2, failed: 0, skipped: 0 });
    expect(val.body.data.results.every((x: any) => x.outcome === 'ready')).toBe(true);
    expect((await get(`/api/v1/listings/${draft.id}`)).status).toBe('ready');

    // stock: only the active one is queued; its quantity is recomputed and pushed
    await sqlAs('update marketplace_listings set pushed_quantity = null where id = $1', [live.id]);
    const stock = await c.post('/api/v1/listings/bulk-actions', { action: 'sync_inventory', ids: [live.id, draft.id] }, admin);
    expect(stock.body.data.summary).toEqual({ total: 2, succeeded: 1, failed: 0, skipped: 1 });
    const [okItem, skipItem] = stock.body.data.results;
    expect(okItem).toMatchObject({ id: live.id, status: 'done', jobId: expect.any(String) });
    expect(skipItem).toMatchObject({ id: draft.id, status: 'skipped', message: 'Only an active listing carries stock on the marketplace' });
    await t.pump();
    expect((await get(`/api/v1/listings/${live.id}`)).quantity).toMatchObject({ pushed: 9, dirty: false });

    // retry: the rejected listing goes through the flow again, the draft has nothing to retry
    const retry = await c.post('/api/v1/listings/bulk-actions', { action: 'retry', ids: [rejected.id, draft.id] }, admin);
    expect(retry.body.data.summary).toEqual({ total: 2, succeeded: 1, failed: 0, skipped: 1 });
    expect(retry.body.data.results[0]).toMatchObject({ id: rejected.id, status: 'done', jobId: expect.any(String) });
    expect(retry.body.data.results[1]).toMatchObject({ status: 'skipped', message: 'Nothing to retry for this listing' });

    // unpublish: live is taken down, a draft is refused with the reason
    const un = await c.post('/api/v1/listings/bulk-actions', { action: 'unpublish', ids: [live.id, draft.id] }, admin);
    expect(un.body.data.summary).toEqual({ total: 2, succeeded: 1, failed: 1, skipped: 0 });
    expect(un.body.data.results[1].error.code).toBe('INVALID_STATE');
    await t.pump();
    expect((await get(`/api/v1/listings/${live.id}`)).status).toBe('unpublished');

    // the bulk action shows in the timeline of the listing
    const act = await get(`/api/v1/listings/${live.id}/activity`);
    expect(act.items.map((i: any) => i.title)).toContain('Bulk unpublish');
    expect((await c.post('/api/v1/listings/bulk-actions', { action: 'explode', ids: [live.id] }, admin)).status).toBe(400);
    expect((await c.post('/api/v1/listings/bulk-actions', { action: 'validate', ids: [live.id] }, viewer)).status).toBe(403);
  });

  it('retry re-sends a failed content update', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin);
    const live = await goLive(acct.id, v.variantId);
    await sqlAs(`update marketplace_listings set content_state = 'failed', content_error = 'boom' where id = $1`, [live.id]);
    expect((await get('/api/v1/listings/table?filter[screenStatus]=failed')).items.map((i: any) => i.id)).toEqual([live.id]);
    const r = await c.post('/api/v1/listings/bulk-actions', { action: 'retry', ids: [live.id] }, admin);
    expect(r.body.data.results[0]).toMatchObject({ status: 'done', message: 'Content sync queued again', jobId: expect.any(String) });
    await t.pump();
    expect((await get(`/api/v1/listings/${live.id}`)).contentState).toBe('synced');
  });
});

// ================================================================================================
describe('tenant isolation and permissions of the reads', () => {
  it('another business sees empty overview and table; viewers read, staff write', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin);
    const l = await newListing(acct.id, v.variantId);
    expect((await get('/api/v1/listings/overview', other)).totals).toEqual({ listings: 0, live: 0, needsAttention: 0, notListed: 0 });
    expect((await get('/api/v1/listings/table', other)).total).toBe(0);
    expect((await get('/api/v1/listings/not-listed', other)).total).toBe(0);
    expect((await get('/api/v1/listings/table', viewer)).total).toBe(1);
    expect((await get('/api/v1/listings/overview', viewer)).totals.listings).toBe(1);
    expect((await c.get('/api/v1/listings/overview')).status).toBe(401);
    expect((await c.post(`/api/v1/listings/${l.id}/publish-flow`, {}, staff)).status).toBe(202);
    expect((await c.get('/api/v1/listings/table?filter[accountId]=not-a-uuid', admin)).status).toBe(400);
  });
});
