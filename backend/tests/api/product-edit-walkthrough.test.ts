import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { addImage, liveListing, makeCategory, makeProduct, sql, type MadeProduct } from '../helpers/edit-flow';

/**
 * The seven Figma screens of "Edit product flow" replayed against the real API, in design order, with the wording of the designs and real
 * sandbox marketplaces (mock, amazon_in, flipkart, myntra) holding live listings. The design's channels (Amazon, Flipkart, Meesho, Shopify) are
 * replaced by the sandbox marketplaces we have: three inherit the master content, Myntra manages its title itself. Numbers are the ones our
 * rules produce for this data (the design's "92%" and "6 attributes configured" are mock values). If this file fails, backend and design drifted.
 */
let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let vendorId: string;
let travel: string;
let luggage: string;
let bag: MadeProduct;
const listingIds: Record<string, string> = {};
const J = (r: { body: unknown }) => JSON.stringify(r.body);
const w = () => ({ t, c });
const EDIT = (id: string) => `/api/v1/products/${id}/edit`;
const editor = async (id: string) => (await c.get(EDIT(id), admin)).body.data;
const impact = async (id: string, changes: Record<string, unknown>) => (await c.post(`/api/v1/products/${id}/change-impact`, { changes }, admin)).body.data;
const states = async () => Object.fromEntries((await sql<{ id: string; content_state: string }>(t, `select id, content_state from marketplace_listings where id = any($1::uuid[])`, [Object.values(listingIds)])).map((r) => [Object.keys(listingIds).find((k) => listingIds[k] === r.id)!, r.content_state]));
const effects = (d: any) => Object.fromEntries(d.channels.map((x: any) => [x.code, x.effect]));
const DESCRIPTION = 'A durable premium travel bag designed for short business trips and weekend travel.';

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  admin = await c.registerVendor({ businessName: 'Nova Living' });
  vendorId = admin.vendorId!;
  travel = await makeCategory(w(), admin, 'Travel Accessories');
  luggage = await makeCategory(w(), admin, 'Luggage & Travel Bags');
  // a bare product: none of the six core facts is supplied (the "Not supplied" state of screen 4)
  bag = await makeProduct(w(), admin, { code: 'TRV-1042', title: 'Premium Travel Bag', categoryId: travel, description: DESCRIPTION, extra: { countryOfOrigin: null, hsnCode: null, gstRateBps: null } });
  await addImage(w(), admin, bag.id, 'bag.png');
  const accounts: Record<string, string> = {};
  for (const m of ['mock', 'amazon_in', 'flipkart', 'myntra']) accounts[m] = (await c.connectAccount(admin, m)).id;
  for (const m of ['mock', 'amazon_in', 'flipkart', 'myntra']) listingIds[m] = await liveListing(w(), vendorId, accounts[m]!, bag);
  expect((await c.put(`/api/v1/products/${bag.id}/marketplace-data/myntra`, { data: { title: 'Urban Carry bag for Myntra' } }, admin)).status).toBe(200);
}, 180_000);
afterAll(() => t.close());

describe('Edit product flow (Figma screens 1-7)', () => {
  it('Screen 1: name modified -> the page, the live change impact, readiness and the suggested improvement', async () => {
    const e = await editor(bag.id);
    // header and left column: Product ID = the master code, locked Master SKU, Active badge, nav, created / last updated
    expect(e).toMatchObject({ status: 'active', version: 1, locks: { productCode: { locked: true, reason: 'Used as the primary internal product identifier.' } } });
    expect(e.meta.productId).toBe('TRV-1042');
    expect(e.product).toMatchObject({ title: 'Premium Travel Bag', productCode: 'TRV-1042', productCodeLocked: true, category: { name: 'Travel Accessories' }, brand: 'Urban Carry', productType: 'physical' });
    expect(e.nav.map((n: any) => n.label)).toEqual(['Overview', 'Media', 'Details', 'Variants', 'Inventory', 'Listings', 'Content', 'Activity']);
    expect(e.media).toMatchObject({ total: 1 });
    expect(e.inheritance.channels.map((x: any) => x.code).sort()).toEqual(['amazon_in', 'flipkart', 'mock', 'myntra']);
    expect(e.inheritance.channels.find((x: any) => x.code === 'myntra').independentFields).toEqual(['title']);

    // "Product name changed - Potential impact . 3 connected listings"
    const d = await impact(bag.id, { title: 'Urban Carry Premium Travel Bag' });
    expect(d).toMatchObject({ hasChanges: true, summary: 'Product name changed', listings: { potential: 3, live: 3 }, requiresConfirmation: false });
    expect(d.items).toEqual([{ field: 'title', label: 'Product name', message: 'Product name changed' }]);
    expect(effects(d)).toEqual({ amazon_in: 'name_inherited', flipkart: 'name_inherited', mock: 'name_inherited', myntra: 'independent' }); // "Amazon - Name inherited" ...
    expect(d.channels.find((x: any) => x.code === 'amazon_in').name).toBe('Amazon');
    expect(d.independentNote).toBe('Myntra content is independently managed.'); // "Shopify content is independently managed."
    expect(d.notSentNote).toBe('Updates are not sent to listings until you save.');

    // "Product readiness": the same percent as the content tab; Core information, Product media, Required attributes done / open, Marketplace content
    const content = (await c.get(`/api/v1/products/${bag.id}/content`, admin)).body.data;
    expect(e.readiness.percent).toBe(content.readiness.pct);
    expect(e.readiness.items.map((i: any) => [i.key, i.state])).toEqual([['core_information', 'done'], ['product_media', 'done'], ['required_attributes', 'pending'], ['marketplace_content', 'done']]);
    expect(e.readiness.items[2]).toMatchObject({ detail: expect.stringContaining('HSN code'), action: { label: 'Add' } });
    // one listing waits for a content review: "1 marketplace listing needs content review. Review ->"
    await sql(t, `update marketplace_listings set content_state = 'needs_review' where id = $1`, [listingIds.mock]);
    const review = (await editor(bag.id)).readiness.items.find((i: any) => i.key === 'marketplace_content');
    expect(review).toEqual({ key: 'marketplace_content', label: 'Marketplace content', state: 'pending', detail: '1 marketplace listing needs content review.', action: { label: 'Review', href: `/products/${bag.id}?tab=listings` } });
    await sql(t, `update marketplace_listings set content_state = 'synced' where id = $1`, [listingIds.mock]);

    // "Suggested improvement": the description is shorter than the average (the 150-character floor, this business has no peers yet)
    const hint = e.insights.find((i: any) => i.key === 'description_short');
    expect(hint).toMatchObject({ message: 'Your product description is shorter than the average for this category.', detail: 'Adding key product benefits may improve listing completeness.' });
    expect(hint.actions.map((a: any) => a.label)).toEqual(['Review suggestion', 'Dismiss']);
    expect(hint.data).toMatchObject({ length: DESCRIPTION.length, benchmark: 150, source: 'floor' });
    expect(e.attributes.note).toBe('Attribute values were not supplied in the existing product record. Confirm factual and tax details before distributing them.');
    // Master SKU is locked: the API refuses a new code
    const lock = await c.post(`/api/v1/products/${bag.id}/edit/save`, { version: 1, changes: { productCode: 'TRV-9999' } }, admin);
    expect(lock.status).toBe(409);
    expect(lock.body.error.details.rule).toBe('code_locked');
  });

  it('Screen 2: unchanged -> "No changes yet", Save does nothing, the version stays', async () => {
    const d = await impact(bag.id, { title: 'Premium Travel Bag' }); // the field shows the original value: no Modified / Revert
    expect(d).toMatchObject({ hasChanges: false, summary: 'No changes yet', detail: 'Edit a field to see what may be affected.', items: [], channels: [] });
    const r = await c.post(`/api/v1/products/${bag.id}/edit/save`, { version: 1, changes: { title: 'Premium Travel Bag' } }, admin);
    expect(r.body.data).toEqual({ saved: false, noChanges: true, version: 1 }); // header "Saved", buttons disabled
    expect((await editor(bag.id)).version).toBe(1);
  });

  it('Screen 3: the AI rewrite preview is not applied; the editor holds the original until the seller applies and saves', async () => {
    const outbox = (await t.outbox('product.updated')).length;
    const s = await c.post(`/api/v1/products/${bag.id}/ai/description`, { mode: 'rewrite', text: DESCRIPTION }, admin);
    expect(s.status, J(s)).toBe(201);
    expect(s.body.data).toMatchObject({ mode: 'rewrite', status: 'suggested', applied: false });
    const p = (await c.get(`/api/v1/products/${bag.id}`, admin)).body.data;
    expect(p).toMatchObject({ description: DESCRIPTION, version: 1 }); // "Preview . Not applied": nothing was written
    expect((await t.outbox('product.updated')).length).toBe(outbox);
    expect(await states()).toEqual({ mock: 'synced', amazon_in: 'synced', flipkart: 'synced', myntra: 'synced' });
    // what saving the suggestion WOULD do: every channel inherits the description (the channel only overrides its title)
    const rewritten = 'A durable, premium travel bag for short business trips and weekend travel.'; // the design's sample result
    const d = await impact(bag.id, { description: rewritten });
    expect(d).toMatchObject({ summary: 'Description changed', listings: { potential: 4, live: 4 } });
    expect(Object.values(effects(d))).toEqual(['description_inherited', 'description_inherited', 'description_inherited', 'description_inherited']);
    await c.post(`/api/v1/products/${bag.id}/ai/description/${s.body.data.id}/dismiss`, {}, admin);
  });

  it('Screen 4: additional attributes -> six facts, "Not supplied", the note, and the honest counter', async () => {
    const e = await editor(bag.id);
    expect(e.attributes.slots).toEqual([
      { key: 'material', label: 'Material', supplied: false }, { key: 'dimensions', label: 'Dimensions', supplied: false }, { key: 'weight', label: 'Weight', supplied: false },
      { key: 'countryOfOrigin', label: 'Country of origin', supplied: false }, { key: 'hsnCode', label: 'HSN code', supplied: false }, { key: 'taxInformation', label: 'Tax information', supplied: false },
    ]);
    expect(e.attributes.configured).toBe(0); // the design's "6 attributes configured" next to six "Not supplied" fields is mock data
    expect(e.attributes.note).toContain('Attribute values were not supplied in the existing product record.');
    // typing facts shows that listings would inherit them (nothing is saved)
    const d = await impact(bag.id, { material: 'Canvas', weight: { value: 1.2, unit: 'kg' }, hsnCode: '4202' });
    expect(d.summary).toBe('3 fields changed');
    expect(effects(d)).toEqual({ amazon_in: 'attribute_inherited', flipkart: 'attribute_inherited', mock: 'attribute_inherited', myntra: 'attribute_inherited' });
    expect((await editor(bag.id)).attributes.configured).toBe(0);
  });

  it('Screen 5: Save changes -> "3 listings will sync shortly", per-channel Sync pending, Myntra untouched, not synced yet', async () => {
    const r = await c.post(`/api/v1/products/${bag.id}/edit/save`, { version: 1, changes: { title: 'Urban Carry Premium Travel Bag' } }, admin);
    expect(r.status, J(r)).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({ saved: true, version: 2 });
    expect(d.product.title).toBe('Urban Carry Premium Travel Bag');
    expect(d.impact.text).toBe('3 listings will sync shortly.');
    expect(d.impact.listingsQueued).toBe(3);
    expect(Object.fromEntries(d.impact.channels.map((x: any) => [x.code, x.state]))).toEqual({ amazon_in: 'sync_pending', flipkart: 'sync_pending', mock: 'sync_pending', myntra: 'independent' });
    expect(d.impact.notSyncedYet).toBe('Saved to the master product. Listings have not synced yet.');
    expect(d.impact.independentNote).toBe('Myntra content is independently managed.');
    expect(await states()).toEqual({ mock: 'sync_pending', amazon_in: 'sync_pending', flipkart: 'sync_pending', myntra: 'synced' });
    // "No pending changes": the page loads the saved product again
    expect(await impact(bag.id, { title: 'Urban Carry Premium Travel Bag' })).toMatchObject({ hasChanges: false, summary: 'No changes yet' });
    expect((await editor(bag.id)).product.title).toBe('Urban Carry Premium Travel Bag');
    // the listings view of the product shows the pending content (the LISTINGS package endpoint)
    const lc = await c.get(`/api/v1/products/${bag.id}/listing-content`, admin);
    if (lc.status === 200) expect(JSON.stringify(lc.body)).toContain('sync_pending');
  });

  it('Screen 6: category change -> "May need remapping", the confirmation modal, Save and continue', async () => {
    const d = await impact(bag.id, { categoryId: luggage });
    expect(d).toMatchObject({ summary: 'Category changed', requiresConfirmation: true, listings: { potential: 4, live: 4 } });
    expect(Object.values(effects(d))).toEqual(['may_need_remapping', 'may_need_remapping', 'may_need_remapping', 'may_need_remapping']);
    expect(d.confirmation).toMatchObject({
      title: 'This change may affect connected listings.',
      message: '4 marketplace listings may need to be remapped.',
      mapping: { from: 'Travel Accessories', to: 'Luggage & Travel Bags' },
    });
    expect(d.confirmation.channels.every((x: any) => x.action === 'category_mapping_review')).toBe(true);
    expect(d.confirmation.channels.map((x: any) => x.code).sort()).toEqual(['amazon_in', 'flipkart', 'mock', 'myntra']);

    // pressing "Save changes" shows the modal (409 with the impact); "Cancel" = nothing sent
    const first = await c.post(`/api/v1/products/${bag.id}/edit/save`, { version: 2, changes: { categoryId: luggage } }, admin);
    expect(first.status).toBe(409);
    expect(first.body.error.details).toMatchObject({ rule: 'confirmation_required', impact: { requiresConfirmation: true } });
    expect((await editor(bag.id)).product.category.name).toBe('Travel Accessories');
    // "Save and continue"
    const go = await c.post(`/api/v1/products/${bag.id}/edit/save`, { version: 2, changes: { categoryId: luggage }, confirm: true }, admin);
    expect(go.status, J(go)).toBe(200);
    expect(go.body.data.product.category.name).toBe('Luggage & Travel Bags');
    expect(Object.values(Object.fromEntries(go.body.data.impact.channels.map((x: any) => [x.code, x.state])))).toEqual(['needs_review', 'needs_review', 'needs_review', 'needs_review']);
    expect(await states()).toEqual({ mock: 'needs_review', amazon_in: 'needs_review', flipkart: 'needs_review', myntra: 'needs_review' });
    const mc = go.body.data.readiness.items.find((i: any) => i.key === 'marketplace_content');
    expect(mc).toMatchObject({ state: 'pending', detail: '4 marketplace listings need content review.' });
    const review = (await sql<{ content_review: any }>(t, `select content_review from marketplace_listings where id = $1`, [listingIds.mock]))[0]!.content_review;
    expect(review).toMatchObject({ reason: 'category_changed', fromCategoryId: travel, toCategoryId: luggage });
  });

  it('Screen 7: unsaved navigation protection is client-only: previews and AI suggestions leave no server state', async () => {
    const other = await makeProduct(w(), admin, { code: 'TRV-2000', title: 'Weekend Duffel', categoryId: travel, description: DESCRIPTION });
    const before = await editor(other.id);
    await impact(other.id, { title: 'Weekend Duffel Pro', categoryId: luggage, material: 'Nylon' });
    await impact(other.id, { description: 'x'.repeat(40) });
    await c.post(`/api/v1/products/${other.id}/ai/description`, { mode: 'concise', text: DESCRIPTION }, admin);
    const after = await editor(other.id);
    expect(after).toEqual(before); // "Your latest edits will be lost if you leave now": the second GET shows the unchanged product
    expect(after.version).toBe(1);
    expect((await sql(t, `select 1 from audit_logs where resource_id = $1 and action = 'product.edited'`, [other.id]))).toHaveLength(0);
  });

  it('afterwards: supplying the six facts makes the counter and the note follow (6 configured, no note)', async () => {
    const cur = await editor(bag.id);
    const r = await c.post(`/api/v1/products/${bag.id}/edit/save`, {
      version: cur.version,
      changes: {
        material: 'Canvas', dimensions: { length: 50, width: 30, height: 25, unit: 'cm' }, weight: { value: 1.2, unit: 'kg' }, countryOfOrigin: 'IN', hsnCode: '4202', gstRateBps: 1800,
        customAttributes: [{ name: 'Collection', value: 'Travel 2026', confirmed: true }],
      },
    }, admin);
    expect(r.status, J(r)).toBe(200);
    const e = await editor(bag.id);
    expect(e.attributes).toMatchObject({ configured: 7, customConfirmed: 1, note: null }); // 6 core facts + 1 confirmed custom attribute
    expect(e.attributes.slots.every((s: any) => s.supplied)).toBe(true);
    expect(e.readiness.items.find((i: any) => i.key === 'required_attributes').state).toBe('done');
    expect(e.readiness.percent).toBe((await c.get(`/api/v1/products/${bag.id}/content`, admin)).body.data.readiness.pct);
  });
});
