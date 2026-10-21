import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withVendor } from '@oms/database';
import { applyProductChange, listingsModule, previewProductChange, productListingContentSummary, requestContentSync, type ProductChange } from '@oms/mod-listings';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';
import { channelOverrides, inheritedContentHash, mapEventFields, masterContentOf, overriddenFields, type MasterContent } from '../../modules/listings/src/content-domain';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let staff: Actor;
let viewer: Actor;
let other: Actor;

beforeAll(async () => {
  // 3 attempts so a persistent failure reaches the dead-letter state quickly
  t = await buildTestApp({ database: true, config: { SYNC_MAX_ATTEMPTS: '3' } });
  c = clientFor(t);
});
beforeEach(async () => {
  mockControl.reset();
  mockControl.configure({ seedOrders: false });
  admin = await c.registerVendor({ businessName: 'Content Co' });
  staff = await c.addMember(admin, 'vendor_staff');
  viewer = await c.addMember(admin, 'vendor_viewer');
  other = await c.registerVendor({ businessName: 'Rival Content Co' });
});
afterAll(() => t.close());

/** direct SQL as the table owner (RLS off): only for what the API cannot do */
const sqlAs = async <T = any>(q: string, p: unknown[] = []): Promise<T[]> => {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { return (await pg.query<T>(q, p)).rows; } finally { await pg.exec('SET ROLE oms_app'); }
};
const listing = async (id: string, as: Actor = admin) => (await c.get(`/api/v1/listings/${id}`, as)).body.data;
const applyChange = (as: Actor, productId: string, change: ProductChange) =>
  withVendor(t.database!.db, as.vendorId!, (tx) => applyProductChange(tx, as.vendorId!, productId, change, { connectors: t.container.connectors }));
const previewChange = (as: Actor, productId: string, change: ProductChange) =>
  withVendor(t.database!.db, as.vendorId!, (tx) => previewProductChange(tx, as.vendorId!, productId, change, { connectors: t.container.connectors }));

/** create + validate + approve + publish + settle: a listing that is LIVE on the (mock) marketplace */
const goLive = async (acct: { id: string }, variantId: string, extra: Record<string, unknown> = { marketplaceCategoryId: 'mock-apparel' }) => {
  const l = (await c.post('/api/v1/listings', { marketplaceAccountId: acct.id, variantId, ...extra }, admin)).body.data;
  expect((await c.post(`/api/v1/listings/${l.id}/validate`, {}, admin)).body.data.validation.ready).toBe(true);
  expect((await c.post(`/api/v1/listings/${l.id}/approve`, {}, admin)).status).toBe(200);
  expect((await c.post(`/api/v1/listings/${l.id}/publish`, {}, admin)).status).toBe(202);
  await t.pump();
  const live = await listing(l.id);
  expect(live.status).toBe('active');
  return live;
};
/** a live (active) listing that exists only in our database: for marketplaces whose catalogue we do not need to touch */
const insertListing = async (accountId: string, variantId: string, sku: string, status = 'active') =>
  (await sqlAs<{ id: string }>(
    `insert into marketplace_listings (vendor_id, marketplace_account_id, variant_id, external_sku, external_listing_id, status) values ($1, $2, $3, $4, $5, $6) returning id`,
    [admin.vendorId, accountId, variantId, sku, `EXT-${sku}`, status],
  ))[0]!.id;
const patchProduct = async (productId: string, body: Record<string, unknown>) => {
  const r = await c.patch(`/api/v1/products/${productId}`, body, admin);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
};
const marketplaceTitle = (acct: { sellerId: string }, sku: string) => mockControl.listing(acct.sellerId, sku).product?.title;
const contentJobs = async (as: Actor = admin) => (await c.get('/api/v1/sync/jobs?filter[type]=listings&limit=50', as)).body.data as any[];
/** switches a connector's `listings.update` capability off for the duration of `fn` */
const withoutUpdate = async (code: string, fn: () => Promise<void>) => {
  const caps = t.container.connectors.get(code).capabilities.listings as { update: boolean };
  const before = caps.update;
  caps.update = false;
  try { await fn(); } finally { caps.update = before; }
};

// ================================================================================================
describe('the pure rules: which fields a channel overrides, what the hash covers, which event fields are content', () => {
  const master = (o: Partial<MasterContent> = {}): MasterContent => ({
    title: 'Premium Travel Bag', description: 'A durable bag', brand: 'Acme', manufacturer: null, categoryId: 'cat-1', productType: 'physical', material: null,
    lengthMm: null, widthMm: null, heightMm: null, weightGrams: null, countryOfOrigin: null, hsnCode: null, gstRateBps: null, customAttributes: [], tags: [], ...o,
  });

  it('maps override keys of product_marketplace_data to master fields (bullets count as description, attributes by name, identifiers ignored)', () => {
    expect(overriddenFields({ title: 'T' })).toEqual(['title']);
    expect(overriddenFields({ bullets: ['a', 'b'] })).toEqual(['description']);
    expect(overriddenFields({ bullet_points: ['a'] })).toEqual(['description']); // the key already used by the marketplace-data endpoint
    expect(overriddenFields({ description: 'D', brand: 'B' })).toEqual(['description', 'brand']);
    expect(overriddenFields({ attributes: { Material: 'Canvas', 'Country of Origin': 'IN', HSN: '4202', GST: 12, Dimensions: '10x10', Weight: 1, flavour: 'mint' } }))
      .toEqual(['material', 'dimensions', 'weight', 'countryOfOrigin', 'hsnCode', 'gstRate', 'customAttributes']);
    // empty values and marketplace identifiers are not content
    expect(overriddenFields({ title: '   ', description: '', bullets: [], attributes: { material: '', flavour: null }, fsn: 'ABCD1234', vertical: 'shirt', categoryId: 'x' })).toEqual([]);
    expect(overriddenFields(null)).toEqual([]);
    expect(channelOverrides({ title: ' Channel title ', bullets: ['one', 'two'], attributes: { flavour: 'mint', n: 3 } })).toEqual({ title: 'Channel title', description: 'one\ntwo', attributes: { flavour: 'mint', n: 3 } });
    expect(channelOverrides({ description: 'D', bullets: ['x'] }).description).toBe('D');
  });

  it('the inherited hash is stable, excludes overridden fields and ignores unconfirmed custom attributes', () => {
    const base = inheritedContentHash(master(), []);
    expect(inheritedContentHash(master(), [])).toBe(base);
    expect(inheritedContentHash(master({ title: 'Urban Carry Premium Travel Bag' }), [])).not.toBe(base);
    expect(inheritedContentHash(master({ title: 'Urban Carry Premium Travel Bag' }), ['title'])).toBe(inheritedContentHash(master(), ['title']));
    expect(inheritedContentHash(master({ categoryId: 'cat-2' }), ['title', 'description'])).not.toBe(inheritedContentHash(master(), ['title', 'description']));
    // custom attributes: only confirmed ones are inherited (E8), order and case of names do not matter
    const unconfirmed = master({ customAttributes: [{ name: 'Pattern', value: 'Plain', confirmed: false }] });
    expect(inheritedContentHash(unconfirmed, [])).toBe(base);
    const confirmed = master({ customAttributes: [{ name: 'Pattern', value: 'Plain', confirmed: true }, { name: 'Lining', value: 'Nylon', confirmed: true }] });
    const swapped = master({ customAttributes: [{ name: 'lining', value: 'Nylon', confirmed: true }, { name: 'pattern', value: 'Plain', confirmed: true }] });
    expect(inheritedContentHash(confirmed, [])).not.toBe(base);
    expect(inheritedContentHash(swapped, [])).toBe(inheritedContentHash(confirmed, []));
    expect(masterContentOf({ title: 'x', description: null, brand: null, manufacturer: null, categoryId: null, attributes: { productType: 'digital' }, material: null, lengthMm: 10, widthMm: null, heightMm: null, weightGrams: null, countryOfOrigin: null, hsnCode: null, gstRateBps: null, customAttributes: null, tags: null }).productType).toBe('digital');
  });

  it('maps product.updated payload fields to content fields (status, product code and unknown names are not content)', () => {
    expect(mapEventFields(['title', 'descriptionHtml', 'description'])).toEqual(['title', 'description']);
    expect(mapEventFields(['categoryId', 'lengthMm', 'weightGrams', 'gstRateBps', 'attributeValues', 'attributes'])).toEqual(['category', 'productType', 'dimensions', 'weight', 'gstRate', 'customAttributes']);
    expect(mapEventFields(['status', 'productCode', 'standardCategory', 'nonsense'])).toEqual([]);
    expect(mapEventFields(undefined)).toEqual([]);
    expect(mapEventFields('title')).toEqual([]);
  });
});

// ================================================================================================
describe('baseline: publishing records what the marketplace shows', () => {
  it('a published listing is synced with a content hash, and the listing DTO carries the content fields', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium cotton tee shirt' });
    const l = await goLive(acct, v.variantId);
    expect(l).toMatchObject({ contentState: 'synced', contentChangedFields: [], contentReview: {}, contentError: null });
    expect(l.contentSyncedAt).toEqual(expect.any(String));
    const [row] = await sqlAs<{ content_hash: string | null }>('select content_hash from marketplace_listings where id = $1', [l.id]);
    expect(row!.content_hash).toMatch(/^[0-9a-f]{64}$/);
    // a change that touches nothing the listing inherits (no fields) does not move a synced listing
    const plan = await applyChange(admin, v.productId, { fields: [] });
    expect(plan.listings).toEqual([expect.objectContaining({ listingId: l.id, state: 'unchanged' })]);
    expect(plan.accountsToSync).toEqual([]);
    expect((await listing(l.id)).contentState).toBe('synced');
  });
});

// ================================================================================================
describe('preview is read-only; apply marks in the callers transaction, once', () => {
  it('classifies every listing of the product: inherited, independent (channel override), not live; and writes nothing', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const fk = await c.connectAccount(admin, 'flipkart');
    const amz = await c.connectAccount(admin, 'amazon_in');
    const v = await c.makeVariant(admin, { title: 'Premium Travel Bag' });
    const live = await goLive(mock, v.variantId);
    const fkListing = await insertListing(fk.id, v.variantId, `FK-${v.sku}`);
    const amzListing = await insertListing(amz.id, v.variantId, `AMZ-${v.sku}`, 'draft');
    expect((await c.put(`/api/v1/products/${v.productId}/marketplace-data/flipkart`, { data: { title: 'Flipkart custom title' } }, admin)).status).toBe(200);

    const auditBefore = (await sqlAs<{ n: number }>('select count(*)::int n from audit_logs'))[0]!.n;
    const outboxBefore = (await sqlAs<{ n: number }>('select count(*)::int n from outbox_events'))[0]!.n;
    const impacts = await previewChange(admin, v.productId, { fields: ['title'] });
    expect(impacts).toHaveLength(3);
    const by = Object.fromEntries(impacts.map((i) => [i.listingId, i]));
    expect(by[live.id]).toMatchObject({ marketplace: 'mock', accountId: mock.id, listingStatus: 'active', live: true, supportsUpdate: true, effect: 'inherited', inheritedFields: ['title'], independentFields: [], sku: v.sku });
    expect(by[fkListing]).toMatchObject({ marketplace: 'flipkart', marketplaceName: 'Flipkart', live: true, supportsUpdate: true, effect: 'independent', inheritedFields: [], independentFields: ['title'] });
    expect(by[amzListing]).toMatchObject({ marketplace: 'amazon_in', marketplaceName: 'Amazon', live: false, effect: 'not_live', listingStatus: 'draft' });
    // another field the flipkart channel does not override IS inherited there
    expect((await previewChange(admin, v.productId, { fields: ['title', 'description'] })).find((i) => i.listingId === fkListing)).toMatchObject({ effect: 'inherited', inheritedFields: ['description'], independentFields: ['title'] });
    expect((await previewChange(admin, v.productId, { fields: [] })).every((i) => i.effect === 'unaffected' || i.effect === 'not_live')).toBe(true);

    // nothing was written: no listing state, no audit, no event
    expect((await sqlAs<{ n: number }>('select count(*)::int n from audit_logs'))[0]!.n).toBe(auditBefore);
    expect((await sqlAs<{ n: number }>('select count(*)::int n from outbox_events'))[0]!.n).toBe(outboxBefore);
    expect((await sqlAs<{ content_state: string }>(`select content_state from marketplace_listings where vendor_id = $1`, [admin.vendorId])).every((r) => r.content_state === 'synced')).toBe(true);
  });

  it('is tenant isolated: another business cannot preview or apply for a product it does not own', async () => {
    const v = await c.makeVariant(admin);
    await expect(previewChange(other, v.productId, { fields: ['title'] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(applyChange(other, v.productId, { fields: ['title'] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await withVendor(t.database!.db, other.vendorId!, (tx) => productListingContentSummary(tx, other.vendorId!, v.productId))).toEqual({ total: 0, needsReview: 0, syncPending: 0, failed: 0, needsRepublish: 0, rejected: 0 });
  });

  it('marks sync_pending / independent / not_live, is idempotent, and the content-sync job pushes the CURRENT master content', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const fk = await c.connectAccount(admin, 'flipkart');
    const amz = await c.connectAccount(admin, 'amazon_in');
    const v = await c.makeVariant(admin, { title: 'Premium Travel Bag' });
    const live = await goLive(mock, v.variantId);
    const fkListing = await insertListing(fk.id, v.variantId, `FK-${v.sku}`);
    const amzListing = await insertListing(amz.id, v.variantId, `AMZ-${v.sku}`, 'draft');
    await c.put(`/api/v1/products/${v.productId}/marketplace-data/flipkart`, { data: { title: 'Flipkart custom title' } }, admin);

    await patchProduct(v.productId, { title: 'Urban Carry Premium Travel Bag' });
    const plan = await applyChange(admin, v.productId, { fields: ['title'] });
    const states = Object.fromEntries(plan.listings.map((l) => [l.listingId, l.state]));
    expect(states).toEqual({ [live.id]: 'sync_pending', [fkListing]: 'independent', [amzListing]: 'not_live' });
    expect(plan.accountsToSync).toEqual([mock.id]);
    expect(plan.listings.find((l) => l.listingId === live.id)).toMatchObject({ accountId: mock.id, marketplace: 'mock', marketplaceName: 'Sandbox marketplace' });
    const pending = await listing(live.id);
    expect(pending).toMatchObject({ contentState: 'sync_pending', contentChangedFields: ['title'], contentError: null, contentReview: {} });
    expect(pending.contentChangedAt).toEqual(expect.any(String));
    // the channel with its own title and the draft listing were not touched
    expect((await sqlAs<{ content_state: string; content_hash: string | null }>('select content_state, content_hash from marketplace_listings where id = any($1)', [[fkListing, amzListing]]))).toEqual([
      { content_state: 'synced', content_hash: null }, { content_state: 'synced', content_hash: null },
    ]);
    // the marketplace still shows the old title until the job ran
    expect(marketplaceTitle(mock, v.sku)).toBe('Premium Travel Bag');

    // idempotent: the same change again does not move anything (not even the timestamp), and still asks for the sync
    const again = await applyChange(admin, v.productId, { fields: ['title'] });
    expect(again.listings.find((l) => l.listingId === live.id)!.state).toBe('sync_pending');
    expect(again.accountsToSync).toEqual([mock.id]);
    expect((await listing(live.id)).contentChangedAt).toBe(pending.contentChangedAt);

    // many requests, one coalesced job per account
    for (let i = 0; i < 3; i++) await requestContentSync(t.container, admin.vendorId!, mock.id, 'event');
    expect(t.pendingJobs((j) => j.name === 'sync.listings')).toHaveLength(1);
    await t.pump();
    expect(marketplaceTitle(mock, v.sku)).toBe('Urban Carry Premium Travel Bag');
    const synced = await listing(live.id);
    expect(synced).toMatchObject({ contentState: 'synced', contentChangedFields: [], contentError: null, status: 'active' });
    expect(synced.contentSyncedAt).toEqual(expect.any(String));
    const jobs = await contentJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ type: 'listings', status: 'succeeded', marketplaceAccountId: mock.id, payload: { kind: 'content' }, stats: { synced: 1, failed: 0 } });

    // after the sync the same change does not move a synced listing back
    const after = await applyChange(admin, v.productId, { fields: ['title'] });
    expect(after.listings.find((l) => l.listingId === live.id)!.state).toBe('unchanged');
    expect(after.accountsToSync).toEqual([]);
    expect((await listing(live.id)).contentState).toBe('synced');

    // a second job with nothing pending is a no-op: no marketplace call
    const calls = mockControl.calls(mock.sellerId);
    await requestContentSync(t.container, admin.vendorId!, mock.id, 'manual');
    await t.pump();
    expect(mockControl.calls(mock.sellerId)).toBe(calls);
    expect((await contentJobs()).map((j) => j.status)).toEqual(['succeeded', 'succeeded']);
  });

  it('marks inside the callers transaction: a rollback leaves the listing as it was', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium Travel Bag' });
    const live = await goLive(mock, v.variantId);
    await patchProduct(v.productId, { title: 'Urban Carry Premium Travel Bag' });
    await expect(withVendor(t.database!.db, admin.vendorId!, async (tx) => {
      const plan = await applyProductChange(tx, admin.vendorId!, v.productId, { fields: ['title'] }, { connectors: t.container.connectors });
      expect(plan.listings[0]!.state).toBe('sync_pending');
      throw new Error('edit failed after the marking');
    })).rejects.toThrow('edit failed');
    expect((await listing(live.id)).contentState).toBe('synced');
  });
});

// ================================================================================================
describe('the product.updated consumer (edits that did not use the explicit apply)', () => {
  it('a plain PATCH marks the listing and queues one sync; an explicit apply first means no second marking', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium Travel Bag' });
    const live = await goLive(mock, v.variantId);
    await t.pump(); // drain the creation events

    await patchProduct(v.productId, { description: 'A durable, premium travel bag for short business trips' });
    await t.relayEvents();
    const marked = await listing(live.id);
    expect(marked).toMatchObject({ contentState: 'sync_pending', contentChangedFields: ['description'] });
    expect(t.pendingJobs((j) => j.name === 'sync.listings')).toHaveLength(1);
    await t.runJobs();
    expect(mockControl.listing(mock.sellerId, v.sku).product?.description).toBe('A durable, premium travel bag for short business trips');
    expect((await listing(live.id)).contentState).toBe('synced');

    // explicit apply, then the event of the same edit: the hash says it is already marked
    await patchProduct(v.productId, { title: 'Urban Carry Premium Travel Bag' });
    await applyChange(admin, v.productId, { fields: ['title'] });
    const afterApply = await listing(live.id);
    expect(afterApply).toMatchObject({ contentState: 'sync_pending', contentChangedFields: ['title'] });
    await t.relayEvents();
    const afterEvent = await listing(live.id);
    expect(afterEvent.contentChangedAt).toBe(afterApply.contentChangedAt);
    expect(afterEvent.contentChangedFields).toEqual(['title']);
    await t.pump();
    expect(marketplaceTitle(mock, v.sku)).toBe('Urban Carry Premium Travel Bag');

    // a status or code change is not content: nothing is marked
    await patchProduct(v.productId, { status: 'archived' });
    await t.pump();
    expect((await listing(live.id)).contentState).toBe('synced');
  });

  it('tolerates events without fields: the content hash decides, an unknown baseline is adopted silently', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium Travel Bag' });
    const live = await goLive(mock, v.variantId);
    const consumer = listingsModule.consumers.find((x) => x.event === 'product.updated')!;
    const fire = (payload: unknown) => consumer.handle({ id: 'e1', type: 'product.updated', vendorId: admin.vendorId!, aggregateType: 'product', aggregateId: v.productId, payload, occurredAt: new Date().toISOString() }, t.container);
    const hash = async () => (await sqlAs<{ content_hash: string | null; content_state: string }>('select content_hash, content_state from marketplace_listings where id = $1', [live.id]))[0]!;
    const baseline = (await hash()).content_hash;

    await fire({}); // nothing changed
    await fire(undefined);
    await fire({ fields: [] });
    expect(await hash()).toEqual({ content_hash: baseline, content_state: 'synced' });
    expect(t.pendingJobs((j) => j.name === 'sync.listings')).toHaveLength(0);

    await sqlAs("update products set title = 'Changed behind the back of the API' where id = $1", [v.productId]);
    await fire({});
    const marked = await hash();
    expect(marked.content_state).toBe('sync_pending');
    expect(marked.content_hash).not.toBe(baseline);
    expect(t.pendingJobs((j) => j.name === 'sync.listings')).toHaveLength(1);
    await fire({}); // the same state again: still one job, hash unchanged
    expect((await hash()).content_hash).toBe(marked.content_hash);
    await t.pump();
    expect(marketplaceTitle(mock, v.sku)).toBe('Changed behind the back of the API');

    // a listing from before this feature has no baseline: it is adopted, not marked
    await sqlAs('update marketplace_listings set content_hash = null where id = $1', [live.id]);
    await fire({});
    expect(await hash()).toEqual({ content_hash: marked.content_hash, content_state: 'synced' });
  });
});

// ================================================================================================
describe('channel overrides win and are never overwritten', () => {
  it('a channel that overrides the title keeps it when the master title changes AND when another field is pushed', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium Travel Bag' });
    expect((await c.put(`/api/v1/products/${v.productId}/marketplace-data/mock`, { data: { title: 'Sandbox channel title', fsn: 'X1' } }, admin)).status).toBe(200);
    const live = await goLive(mock, v.variantId);
    expect(marketplaceTitle(mock, v.sku)).toBe('Sandbox channel title'); // the builder applies the override on publish too

    await patchProduct(v.productId, { title: 'Urban Carry Premium Travel Bag' });
    const plan = await applyChange(admin, v.productId, { fields: ['title'] });
    expect(plan.listings[0]!.state).toBe('independent');
    expect(plan.accountsToSync).toEqual([]);
    await t.pump();
    expect(marketplaceTitle(mock, v.sku)).toBe('Sandbox channel title');
    expect((await listing(live.id)).contentState).toBe('synced');

    // the description is inherited: it is pushed, the channel's own title stays
    await patchProduct(v.productId, { description: 'A rewritten description for the bag' });
    expect((await applyChange(admin, v.productId, { fields: ['description'] })).listings[0]!.state).toBe('sync_pending');
    await t.pump();
    expect(mockControl.listing(mock.sellerId, v.sku).product).toMatchObject({ title: 'Sandbox channel title', description: 'A rewritten description for the bag' });
    expect((await listing(live.id)).contentState).toBe('synced');
  });

  it('bullet points count as the description: a channel with bullets is independent for the description', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium Travel Bag' });
    await c.put(`/api/v1/products/${v.productId}/marketplace-data/mock`, { data: { bullets: ['Water resistant', 'Padded straps'] } }, admin);
    await goLive(mock, v.variantId);
    expect(mockControl.listing(mock.sellerId, v.sku).product?.description).toBe('Water resistant\nPadded straps');
    const [i] = await previewChange(admin, v.productId, { fields: ['description'] });
    expect(i).toMatchObject({ effect: 'independent', independentFields: ['description'], inheritedFields: [] });
  });
});

// ================================================================================================
describe('connectors that cannot update live listings', () => {
  it('a live listing becomes needs_republish (never pushed) and shows up in Needs attention; the retry endpoint refuses', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium Travel Bag' });
    const live = await goLive(mock, v.variantId);
    await patchProduct(v.productId, { title: 'Urban Carry Premium Travel Bag' });
    await withoutUpdate('mock', async () => {
      const [i] = await previewChange(admin, v.productId, { fields: ['title'] });
      expect(i).toMatchObject({ supportsUpdate: false, effect: 'inherited' });
      const plan = await applyChange(admin, v.productId, { fields: ['title'] });
      expect(plan.listings[0]!.state).toBe('needs_republish');
      expect(plan.accountsToSync).toEqual([]);
      const l = await listing(live.id);
      expect(l).toMatchObject({ contentState: 'needs_republish', contentChangedFields: ['title'] });
      expect(l.contentError).toMatch(/republish/i);
      const r = await c.post(`/api/v1/listings/${live.id}/content-sync`, {}, admin);
      expect(r.status).toBe(409);
      expect(r.body.error.details.rule).toBe('update_not_supported');
      // even a job that is run anyway must not push
      const calls = mockControl.calls(mock.sellerId);
      await sqlAs(`update marketplace_listings set content_state = 'sync_pending' where id = $1`, [live.id]);
      await requestContentSync(t.container, admin.vendorId!, mock.id, 'manual');
      await t.pump();
      expect(mockControl.calls(mock.sellerId)).toBe(calls);
      expect(await listing(live.id)).toMatchObject({ contentState: 'needs_republish' });
      expect(marketplaceTitle(mock, v.sku)).toBe('Premium Travel Bag');
    });
    // once the marketplace can update again the seller can send it
    const r = await c.post(`/api/v1/listings/${live.id}/content-sync`, {}, admin);
    expect(r.status).toBe(202);
    expect(r.body.data.listing.contentState).toBe('sync_pending');
    await t.pump();
    expect(marketplaceTitle(mock, v.sku)).toBe('Urban Carry Premium Travel Bag');
    expect((await listing(live.id)).contentState).toBe('synced');
  });
});

// ================================================================================================
describe('category change: needs_review, the old marketplace category stays until the seller decides', () => {
  const setup = async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const catA = (await c.post('/api/v1/categories', { name: 'Travel Accessories' }, admin)).body.data.id as string;
    const catB = (await c.post('/api/v1/categories', { name: 'Luggage & Travel Bags' }, admin)).body.data.id as string;
    expect((await c.put('/api/v1/category-mappings', { marketplace: 'mock', categoryId: catA, marketplaceCategoryId: 'mock-apparel', marketplaceCategoryName: 'Apparel' }, admin)).status).toBe(200);
    expect((await c.put('/api/v1/category-mappings', { marketplace: 'mock', categoryId: catB, marketplaceCategoryId: 'mock-accessories', marketplaceCategoryName: 'Accessories' }, admin)).status).toBe(200);
    expect((await c.put('/api/v1/attribute-mappings', { marketplace: 'mock', marketplaceCategoryId: 'mock-accessories', marketplaceAttribute: 'material', source: { type: 'core_field', coreField: 'material' } }, admin)).status).toBe(200);
    const v = await c.makeVariant(admin, { title: 'Premium Travel Bag', categoryId: catA });
    const live = await goLive(mock, v.variantId, {}); // follows the category mapping (no explicit marketplace category)
    expect(live.marketplaceCategoryId).toBeNull();
    expect(mockControl.listing(mock.sellerId, v.sku).product?.category?.id).toBe('mock-apparel');
    return { mock, catA, catB, v, live };
  };

  it('preview shows may_need_remapping with the suggestion; apply sets needs_review + content_review and pins the current category', async () => {
    const { mock, catA, catB, v, live } = await setup();
    const change: ProductChange = { fields: ['category', 'material'], category: { fromId: catA, toId: catB } };
    const [i] = await previewChange(admin, v.productId, change);
    expect(i).toMatchObject({ effect: 'may_need_remapping', mappingState: 'mapped', suggestedMarketplaceCategoryId: 'mock-accessories', suggestedMarketplaceCategoryName: 'Accessories', inheritedFields: ['category', 'material'] });

    await patchProduct(v.productId, { categoryId: catB, material: 'Canvas' });
    const plan = await applyChange(admin, v.productId, change);
    expect(plan.listings[0]).toMatchObject({ listingId: live.id, state: 'needs_review' });
    expect(plan.accountsToSync).toEqual([]);
    const l = await listing(live.id);
    expect(l).toMatchObject({
      contentState: 'needs_review', contentChangedFields: ['category', 'material'], marketplaceCategoryId: 'mock-apparel',
      contentReview: { reason: 'category_changed', fromCategoryId: catA, toCategoryId: catB, suggestedMarketplaceCategoryId: 'mock-accessories', suggestedMarketplaceCategoryName: 'Accessories' },
    });
    // nothing was pushed, and the event of the PATCH does not re-mark or queue anything
    await t.pump();
    expect(mockControl.listing(mock.sellerId, v.sku).product?.category?.id).toBe('mock-apparel');
    expect((await listing(live.id)).contentChangedAt).toBe(l.contentChangedAt);
    expect(await contentJobs()).toHaveLength(0);
    // a person has to act: audited
    const audits = await sqlAs<{ action: string }>(`select action from audit_logs where resource_id = $1 and action like 'listing.content%'`, [live.id]);
    expect(audits.map((a) => a.action)).toEqual(['listing.content_needs_review']);
    // the listing cannot be force-synced while the review is open
    const r = await c.post(`/api/v1/listings/${live.id}/content-sync`, {}, admin);
    expect(r.status).toBe(409);
    expect(r.body.error.details.rule).toBe('needs_review');
    // the product shows it
    const pc = (await c.get(`/api/v1/products/${v.productId}/listing-content`, admin)).body.data;
    expect(pc.summary).toMatchObject({ total: 1, needsReview: 1, syncPending: 0, failed: 0, needsRepublish: 0, rejected: 0 });
    expect(pc.listings[0]).toMatchObject({ listingId: live.id, contentState: 'needs_review', marketplaceName: 'Sandbox marketplace', live: true });
  });

  it('accept_mapping: takes the suggested marketplace category and pushes the new category and the master facts', async () => {
    const { mock, catA, catB, v, live } = await setup();
    await patchProduct(v.productId, { categoryId: catB, material: 'Canvas' });
    await applyChange(admin, v.productId, { fields: ['category', 'material'], category: { fromId: catA, toId: catB } });
    const r = await c.post(`/api/v1/listings/${live.id}/content-review/resolve`, { action: 'accept_mapping' }, staff);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ syncQueued: true, listing: { contentState: 'sync_pending', marketplaceCategoryId: 'mock-accessories', contentReview: {} } });
    await t.pump();
    const p = mockControl.listing(mock.sellerId, v.sku).product!;
    expect(p.category?.id).toBe('mock-accessories');
    expect(p.attributes).toMatchObject({ material: 'Canvas' });
    expect(await listing(live.id)).toMatchObject({ contentState: 'synced', marketplaceCategoryId: 'mock-accessories', contentChangedFields: [] });
    const audits = await sqlAs<{ action: string }>(`select action from audit_logs where resource_id = $1 and action = 'listing.content_review_resolved'`, [live.id]);
    expect(audits).toHaveLength(1);
    // resolving twice is a conflict, not a second sync
    const again = await c.post(`/api/v1/listings/${live.id}/content-review/resolve`, { action: 'accept_mapping' }, admin);
    expect(again.status).toBe(409);
    expect(again.body.error.details.rule).toBe('not_in_review');
  });

  it('keep_current keeps the marketplace category (other pending changes still sync); set_category validates against the marketplace tree', async () => {
    const { mock, catA, catB, v, live } = await setup();
    await patchProduct(v.productId, { categoryId: catB, title: 'Urban Carry Premium Travel Bag' });
    await applyChange(admin, v.productId, { fields: ['category', 'title'], category: { fromId: catA, toId: catB } });
    expect((await listing(live.id)).contentChangedFields).toEqual(['title', 'category']);

    // set_category with an id the marketplace does not know
    const bad = await c.post(`/api/v1/listings/${live.id}/content-review/resolve`, { action: 'set_category', marketplaceCategoryId: 'nope' }, admin);
    expect(bad.status).toBe(400); // VALIDATION_FAILED
    expect(bad.body.error.details.rule).toBe('unknown_marketplace_category');
    expect((await listing(live.id)).contentState).toBe('needs_review');
    expect((await c.post(`/api/v1/listings/${live.id}/content-review/resolve`, { action: 'set_category' }, admin)).status).toBe(400);

    const keep = await c.post(`/api/v1/listings/${live.id}/content-review/resolve`, { action: 'keep_current' }, admin);
    expect(keep.status).toBe(200);
    expect(keep.body.data).toMatchObject({ syncQueued: true, listing: { contentState: 'sync_pending', contentChangedFields: ['title'], marketplaceCategoryId: 'mock-apparel', contentReview: {} } });
    await t.pump();
    expect(mockControl.listing(mock.sellerId, v.sku).product).toMatchObject({ title: 'Urban Carry Premium Travel Bag', category: { id: 'mock-apparel' } });
    expect((await listing(live.id)).contentState).toBe('synced');

    // a category-only review resolved with keep_current is simply synced (nothing to push)
    await patchProduct(v.productId, { categoryId: catA });
    await applyChange(admin, v.productId, { fields: ['category'], category: { fromId: catB, toId: catA } });
    expect((await listing(live.id)).contentState).toBe('needs_review');
    const keep2 = await c.post(`/api/v1/listings/${live.id}/content-review/resolve`, { action: 'keep_current' }, admin);
    expect(keep2.body.data).toMatchObject({ syncQueued: false, listing: { contentState: 'synced', contentChangedFields: [] } });

    // set_category with a real marketplace category
    await patchProduct(v.productId, { categoryId: catB, material: 'Canvas' });
    await applyChange(admin, v.productId, { fields: ['category', 'material'], category: { fromId: catA, toId: catB } });
    const set = await c.post(`/api/v1/listings/${live.id}/content-review/resolve`, { action: 'set_category', marketplaceCategoryId: 'mock-accessories' }, admin);
    expect(set.body.data).toMatchObject({ syncQueued: true, listing: { contentState: 'sync_pending', marketplaceCategoryId: 'mock-accessories' } });
    await t.pump();
    expect(mockControl.listing(mock.sellerId, v.sku).product?.category?.id).toBe('mock-accessories');
  });

  it('with no mapping for the new category there is no suggestion: accept_mapping answers 400, the seller picks one', async () => {
    const { catA, v, live } = await setup();
    const catC = (await c.post('/api/v1/categories', { name: 'Unmapped category' }, admin)).body.data.id as string;
    await patchProduct(v.productId, { categoryId: catC });
    const [i] = await previewChange(admin, v.productId, { fields: ['category'], category: { fromId: catA, toId: catC } });
    expect(i).toMatchObject({ effect: 'may_need_remapping', mappingState: 'needs_review', suggestedMarketplaceCategoryId: null, suggestedMarketplaceCategoryName: null });
    await applyChange(admin, v.productId, { fields: ['category'], category: { fromId: catA, toId: catC } });
    expect((await listing(live.id)).contentReview).toMatchObject({ reason: 'category_changed', toCategoryId: catC, suggestedMarketplaceCategoryId: null });
    const r = await c.post(`/api/v1/listings/${live.id}/content-review/resolve`, { action: 'accept_mapping' }, admin);
    expect(r.status).toBe(400);
    expect(r.body.error.details.rule).toBe('no_suggestion');
  });

  it('a plain PATCH of the category reaches needs_review through the consumer (the previous category is unknown there)', async () => {
    const { catB, v, live } = await setup();
    await t.pump();
    await patchProduct(v.productId, { categoryId: catB });
    await t.relayEvents();
    expect(await listing(live.id)).toMatchObject({ contentState: 'needs_review', contentReview: { reason: 'category_changed', fromCategoryId: null, toCategoryId: catB, suggestedMarketplaceCategoryId: 'mock-accessories' } });
  });
});

// ================================================================================================
describe('failures: marketplace rejection, permanent and transient errors, rate limits', () => {
  it('a marketplace that rejects the new content marks the listing failed with the marketplace message (and follows its status)', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium Travel Bag' });
    const live = await goLive(mock, v.variantId);
    await patchProduct(v.productId, { title: 'Tee' }); // valid for us (>= 3), too short for the marketplace (>= 10)
    await applyChange(admin, v.productId, { fields: ['title'] });
    await requestContentSync(t.container, admin.vendorId!, mock.id);
    await t.pump();
    const l = await listing(live.id);
    expect(l).toMatchObject({ contentState: 'failed', status: 'correction_required' });
    expect(l.contentError).toBe('Title must be at least 10 characters');
    expect(l.issues).toEqual([expect.objectContaining({ code: 'TITLE_TOO_SHORT', severity: 'error' })]);
    const job = (await contentJobs())[0]!;
    expect(job).toMatchObject({ status: 'partially_failed', stats: { failed: 1 }, failureDetails: [expect.objectContaining({ code: 'TITLE_TOO_SHORT' })] });
    expect((await sqlAs<{ action: string }>(`select action from audit_logs where resource_id = $1 and action = 'listing.content_sync_failed'`, [live.id])).length).toBe(1);
    // it is no longer live: it has to go through the regular correct -> approve -> publish flow
    const r = await c.post(`/api/v1/listings/${live.id}/content-sync`, {}, admin);
    expect(r.status).toBe(409);
    expect(r.body.error.details.rule).toBe('not_live');
  });

  it('a permanent error fails only that listing and the retry endpoint recovers it', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const [v1, v2] = [await c.makeVariant(admin, { title: 'Premium Travel Bag' }), await c.makeVariant(admin, { title: 'Premium Cabin Bag' })];
    const [l1, l2] = [await goLive(mock, v1.variantId), await goLive(mock, v2.variantId)];
    for (const v of [v1, v2]) { await patchProduct(v.productId, { description: `New description for ${v.sku}` }); await applyChange(admin, v.productId, { fields: ['description'] }); }
    mockControl.setBehavior(mock.sellerId, { failNext: 1, failKind: 'permanent' });
    await requestContentSync(t.container, admin.vendorId!, mock.id);
    await t.pump();
    const states = [(await listing(l1.id)).contentState, (await listing(l2.id)).contentState].sort();
    expect(states).toEqual(['failed', 'synced']); // one of them was rejected by the simulated error, the other went through
    const failed = (await listing(l1.id)).contentState === 'failed' ? l1 : l2;
    const failedV = failed.id === l1.id ? v1 : v2;
    expect((await listing(failed.id)).contentError).toMatch(/permanent/i);
    expect((await contentJobs())[0]).toMatchObject({ status: 'partially_failed', stats: { synced: 1, failed: 1 } });

    // retry by hand (a viewer cannot)
    expect((await c.post(`/api/v1/listings/${failed.id}/content-sync`, {}, viewer)).status).toBe(403);
    const retry = await c.post(`/api/v1/listings/${failed.id}/content-sync`, {}, staff);
    expect(retry.status, JSON.stringify(retry.body)).toBe(202);
    expect(retry.body.data).toMatchObject({ listing: { contentState: 'sync_pending', contentError: null }, alreadyQueued: false, job: { type: 'listings' } });
    await t.pump();
    expect(await listing(failed.id)).toMatchObject({ contentState: 'synced', contentError: null });
    expect(mockControl.listing(mock.sellerId, failedV.sku).product?.description).toBe(`New description for ${failedV.sku}`);
    // a synced listing has nothing to send
    const nothing = await c.post(`/api/v1/listings/${failed.id}/content-sync`, {}, admin);
    expect(nothing.status).toBe(409);
    expect(nothing.body.error.details.rule).toBe('nothing_to_sync');
  });

  it('a transient outage retries the job with backoff, then dead-letters it and fails the pending listings; a later retry succeeds', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const [v1, v2] = [await c.makeVariant(admin, { title: 'Premium Travel Bag' }), await c.makeVariant(admin, { title: 'Premium Cabin Bag' })];
    const [l1, l2] = [await goLive(mock, v1.variantId), await goLive(mock, v2.variantId)];
    for (const v of [v1, v2]) { await patchProduct(v.productId, { description: `Outage description ${v.sku}` }); await applyChange(admin, v.productId, { fields: ['description'] }); }
    mockControl.setBehavior(mock.sellerId, { failNext: 1000, failKind: 'transient' });
    await requestContentSync(t.container, admin.vendorId!, mock.id);
    await t.runJobs();
    // first attempt: the job waits for its retry, the listings stay pending (nothing was lost, nothing failed yet)
    expect((await contentJobs())[0]).toMatchObject({ status: 'retrying', attempts: 1 });
    expect([(await listing(l1.id)).contentState, (await listing(l2.id)).contentState]).toEqual(['sync_pending', 'sync_pending']);
    await t.pump();
    expect((await contentJobs())[0]).toMatchObject({ status: 'dead_lettered', attempts: 3 });
    for (const l of [l1, l2]) {
      const cur = await listing(l.id);
      expect(cur.contentState).toBe('failed');
      expect(cur.contentError).toEqual(expect.any(String));
      expect(cur.status).toBe('active'); // still live
    }
    // the issue queue shows both
    mockControl.setBehavior(mock.sellerId, {});
    for (const l of [l1, l2]) expect((await c.post(`/api/v1/listings/${l.id}/content-sync`, {}, admin)).status).toBe(202);
    await t.pump();
    expect([(await listing(l1.id)).contentState, (await listing(l2.id)).contentState]).toEqual(['synced', 'synced']);
    expect(mockControl.listing(mock.sellerId, v1.sku).product?.description).toBe(`Outage description ${v1.sku}`);
  });

  it('honours the connector host rate limit: a throttled call is retried and the listing syncs', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium Travel Bag' });
    const live = await goLive(mock, v.variantId);
    await patchProduct(v.productId, { description: 'Throttled description' });
    await applyChange(admin, v.productId, { fields: ['description'] });
    mockControl.setBehavior(mock.sellerId, { rateLimitNext: 1, retryAfterMs: 5 });
    const calls = mockControl.calls(mock.sellerId);
    await requestContentSync(t.container, admin.vendorId!, mock.id);
    await t.pump();
    expect(mockControl.calls(mock.sellerId)).toBeGreaterThan(calls + 1); // the throttled call and its retry
    expect((await listing(live.id)).contentState).toBe('synced');
    expect(mockControl.listing(mock.sellerId, v.sku).product?.description).toBe('Throttled description');
  });
});

// ================================================================================================
describe('listings that are not live are never touched or pushed', () => {
  it('draft, approved and unpublished listings keep their state; only the live one syncs', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const mock2 = await c.connectAccount(admin, 'mock');
    const mock3 = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium Travel Bag' });
    const live = await goLive(mock, v.variantId);
    const draft = (await c.post('/api/v1/listings', { marketplaceAccountId: mock2.id, variantId: v.variantId, marketplaceCategoryId: 'mock-apparel' }, admin)).body.data;
    const gone = await insertListing(mock3.id, v.variantId, `GONE-${v.sku}`, 'unpublished');
    await patchProduct(v.productId, { title: 'Urban Carry Premium Travel Bag' });
    const plan = await applyChange(admin, v.productId, { fields: ['title'] });
    expect(Object.fromEntries(plan.listings.map((l) => [l.listingId, l.state]))).toEqual({ [live.id]: 'sync_pending', [draft.id]: 'not_live', [gone]: 'not_live' });
    expect(plan.accountsToSync).toEqual([mock.id]);
    await t.pump();
    expect(await listing(draft.id)).toMatchObject({ status: 'draft', contentState: 'synced' });
    expect(mockControl.listing(mock2.sellerId, v.sku).product).toBeUndefined();
    expect((await listing(gone)).contentState).toBe('synced');
    // the job of an account with a stale pending flag on a non-live listing skips it
    await sqlAs(`update marketplace_listings set content_state = 'sync_pending' where id = $1`, [gone]);
    const calls = mockControl.calls(mock3.sellerId);
    await requestContentSync(t.container, admin.vendorId!, mock3.id);
    await t.pump();
    expect(mockControl.calls(mock3.sellerId)).toBe(calls);
    expect((await listing(gone)).contentState).toBe('sync_pending');
    // approving an edited draft is unchanged: the approval hash still follows the content
    expect((await c.post(`/api/v1/listings/${draft.id}/validate`, {}, admin)).body.data.validation.ready).toBe(true);
    expect((await c.post(`/api/v1/listings/${draft.id}/approve`, {}, admin)).status).toBe(200);
    expect((await c.get(`/api/v1/listings/${draft.id}/preview`, admin)).body.data.approval).toMatchObject({ approved: true, current: true });
    await patchProduct(v.productId, { title: 'Another Premium Travel Bag Title' });
    expect((await c.get(`/api/v1/listings/${draft.id}/preview`, admin)).body.data.approval).toMatchObject({ approved: true, current: false });
  });
});

// ================================================================================================
describe('limits: at most 500 listings per product per call', () => {
  it('500 listings are processed; 501 are refused with 413 PAYLOAD_TOO_LARGE (preview and apply), the consumer tolerates it', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium Travel Bag' });
    const insert = async (from: number, to: number) => {
      await sqlAs(
        `insert into product_variants (vendor_id, product_id, sku, selling_price_minor, mrp_minor) select $1, $2, 'BULK-' || g || '-' || $3, 1000, 2000 from generate_series($4::int, $5::int) g`,
        [admin.vendorId, v.productId, v.sku, from, to],
      );
      await sqlAs(
        `insert into marketplace_listings (vendor_id, marketplace_account_id, variant_id, external_sku, status) select $1, $2, pv.id, pv.sku, 'draft' from product_variants pv where pv.vendor_id = $1 and pv.product_id = $3 and pv.sku like 'BULK-%' and not exists (select 1 from marketplace_listings m where m.variant_id = pv.id)`,
        [admin.vendorId, mock.id, v.productId],
      );
    };
    await insert(1, 500); // plus the product's own variant without a listing: 500 listings
    expect((await sqlAs<{ n: number }>('select count(*)::int n from marketplace_listings where vendor_id = $1', [admin.vendorId]))[0]!.n).toBe(500);
    expect(await previewChange(admin, v.productId, { fields: ['title'] })).toHaveLength(500);
    const plan = await applyChange(admin, v.productId, { fields: ['title'] });
    expect(plan.listings).toHaveLength(500);
    expect(plan.listings.every((l) => l.state === 'not_live')).toBe(true);

    await insert(501, 501);
    for (const fn of [previewChange, applyChange]) {
      await expect(fn(admin, v.productId, { fields: ['title'] })).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE', details: { rule: 'too_many_listings', listings: 501, max: 500 } });
    }
    await patchProduct(v.productId, { title: 'Urban Carry Premium Travel Bag' });
    await t.pump(); // the consumer does not blow up on it
    expect((await sqlAs<{ n: number }>(`select count(*)::int n from marketplace_listings where vendor_id = $1 and content_state <> 'synced'`, [admin.vendorId]))[0]!.n).toBe(0);
  });
});

// ================================================================================================
describe('endpoints: filters, DTO fields, permissions, tenant isolation', () => {
  it('GET /listings filters by content state and product; the DTO carries the content fields', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const [v1, v2] = [await c.makeVariant(admin, { title: 'Premium Travel Bag' }), await c.makeVariant(admin, { title: 'Premium Cabin Bag' })];
    const [l1, l2] = [await goLive(mock, v1.variantId), await goLive(mock, v2.variantId)];
    await patchProduct(v1.productId, { description: 'Only the first product changed' });
    await applyChange(admin, v1.productId, { fields: ['description'] });
    const ids = async (qs: string) => ((await c.get(`/api/v1/listings?${qs}`, admin)).body.data as any[]).map((x) => x.id).sort();
    expect(await ids('filter[contentState]=sync_pending')).toEqual([l1.id]);
    expect(await ids('filter[contentState]=synced')).toEqual([l2.id]);
    expect(await ids(`filter[productId]=${v2.productId}`)).toEqual([l2.id]);
    expect(await ids(`filter[productId]=${v1.productId}&filter[contentState]=synced`)).toEqual([]);
    expect((await c.get('/api/v1/listings?filter[contentState]=bogus', admin)).status).toBe(400);
    expect((await c.get('/api/v1/listings?filter[contentState]=sync_pending', other)).body.data).toEqual([]);
    const dto = (await c.get(`/api/v1/listings/${l1.id}`, viewer)).body.data;
    expect(dto).toMatchObject({ contentState: 'sync_pending', contentChangedFields: ['description'], contentReview: {}, contentError: null, contentSyncedAt: expect.any(String), contentChangedAt: expect.any(String) });
  });

  it('permissions and tenant isolation of the new endpoints', async () => {
    const mock = await c.connectAccount(admin, 'mock');
    const v = await c.makeVariant(admin, { title: 'Premium Travel Bag' });
    const live = await goLive(mock, v.variantId);
    await patchProduct(v.productId, { description: 'Changed description for permissions' });
    await applyChange(admin, v.productId, { fields: ['description'] });

    // viewers read, never write
    expect((await c.get(`/api/v1/products/${v.productId}/listing-content`, viewer)).status).toBe(200);
    expect((await c.post(`/api/v1/listings/${live.id}/content-sync`, {}, viewer)).status).toBe(403);
    expect((await c.post(`/api/v1/listings/${live.id}/content-review/resolve`, { action: 'keep_current' }, viewer)).status).toBe(403);
    expect((await c.get(`/api/v1/products/${v.productId}/listing-content`)).status).toBe(401);
    // another business sees nothing: 404, never 403 and never data
    expect((await c.get(`/api/v1/products/${v.productId}/listing-content`, other)).status).toBe(404);
    expect((await c.post(`/api/v1/listings/${live.id}/content-sync`, {}, other)).status).toBe(404);
    expect((await c.post(`/api/v1/listings/${live.id}/content-review/resolve`, { action: 'keep_current' }, other)).status).toBe(404);
    expect((await c.post(`/api/v1/listings/${live.id}/content-review/resolve`, { action: 'set_category', marketplaceCategoryId: 'mock-apparel' }, other)).status).toBe(404);
    expect((await c.get(`/api/v1/products/${v.productId}/listing-content`, admin)).body.data.summary).toMatchObject({ total: 1, syncPending: 1 });
    // an unknown action is a validation error
    expect((await c.post(`/api/v1/listings/${live.id}/content-review/resolve`, { action: 'burn' }, admin)).status).toBe(400);
    // pending listing: staff may force the sync, a second request shares the queued job
    const first = await c.post(`/api/v1/listings/${live.id}/content-sync`, {}, staff);
    expect(first.status).toBe(202);
    const second = await c.post(`/api/v1/listings/${live.id}/content-sync`, {}, staff);
    expect(second.body.data.job.id).toBe(first.body.data.job.id);
    expect(second.body.data.alreadyQueued).toBe(true);
    await t.pump();
    expect((await listing(live.id)).contentState).toBe('synced');
  });
});

// ================================================================================================
describe('issues: listings that need a review or could not be updated', () => {
  const refresh = async () => { const r = await c.post('/api/v1/issues/refresh', {}, admin); expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.data; };
  const issues = async () => (await c.get('/api/v1/issues?pageSize=100', admin)).body.data.items as any[];

  it('groups needs_review (medium) and failed / needs_republish (high) with consistent wording, and resolves them when the condition is gone', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const vs = [];
    for (let i = 0; i < 4; i++) vs.push(await c.makeVariant(admin));
    const ids = [];
    for (const [i, v] of vs.entries()) ids.push(await insertListing(acct.id, v.variantId, `ISS-${i}-${v.sku}`));
    await sqlAs(`update marketplace_listings set content_state = 'needs_review' where id = $1`, [ids[0]]);
    await refresh();
    const one = (await issues()).find((i) => i.key === 'listing_content_review');
    expect(one).toMatchObject({ area: 'listings', priority: 'medium', count: 1, title: '1 listing needs a category mapping review' });
    expect((await issues()).find((i) => i.key === 'listing_content_failed')).toBeUndefined();

    await sqlAs(`update marketplace_listings set content_state = 'needs_review' where id = $1`, [ids[1]]);
    await sqlAs(`update marketplace_listings set content_state = 'failed', content_error = 'x' where id = $1`, [ids[2]]);
    await sqlAs(`update marketplace_listings set content_state = 'needs_republish' where id = $1`, [ids[3]]);
    await refresh();
    const all = await issues();
    expect(all.find((i) => i.key === 'listing_content_review')).toMatchObject({ area: 'listings', priority: 'medium', count: 2, title: '2 listings need a category mapping review' });
    const failed = all.find((i) => i.key === 'listing_content_failed');
    expect(failed).toMatchObject({ area: 'listings', priority: 'high', count: 2, title: '2 listings could not be updated with the latest product content' });
    const d = (await c.get(`/api/v1/issues/${failed.id}`, admin)).body.data;
    expect(d.affected.total).toBe(2);
    expect(d.affected.items.map((x: any) => x.label).sort()).toEqual([`ISS-2-${vs[2]!.sku}`, `ISS-3-${vs[3]!.sku}`].sort());

    await sqlAs(`update marketplace_listings set content_state = 'synced' where vendor_id = $1`, [admin.vendorId]);
    const res = await refresh();
    expect(res.autoResolved).toBeGreaterThanOrEqual(2);
    const left = await issues();
    expect(left.find((i) => i.key === 'listing_content_review' && i.status !== 'resolved')).toBeUndefined();
    expect(left.find((i) => i.key === 'listing_content_failed' && i.status !== 'resolved')).toBeUndefined();
  });
});
