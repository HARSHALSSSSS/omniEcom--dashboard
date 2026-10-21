import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { computeChange, summaryOf } from '../../modules/product-edit/src/domain/diff';
import { addImage, liveListing, makeCategory, makeProduct, sql, uniq } from '../helpers/edit-flow';

/**
 * Product edit flow (docs/figma/51-edit-build-brief.md): master-code lock, editor read, change impact, atomic save, insights, permissions,
 * tenant isolation, concurrency. The seven Figma screens are replayed in product-edit-walkthrough.test.ts.
 */
let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let staff: Actor;
let viewer: Actor;
let rival: Actor;
let vendorId: string;
let cat: string;
let cat2: string;
const J = (r: { body: unknown }) => JSON.stringify(r.body);
const w = () => ({ t, c });
const EDIT = (id: string) => `/api/v1/products/${id}/edit`;
const IMPACT = (id: string) => `/api/v1/products/${id}/change-impact`;
const SAVE = (id: string) => `/api/v1/products/${id}/edit/save`;
const INSIGHTS = (id: string) => `/api/v1/products/${id}/insights`;
const editor = async (id: string, as = admin) => (await c.get(EDIT(id), as)).body.data;
const impact = async (id: string, changes: Record<string, unknown>, as = admin) => c.post(IMPACT(id), { changes }, as);
const save = async (id: string, version: number, changes: Record<string, unknown>, extra: Record<string, unknown> = {}, as = admin) => c.post(SAVE(id), { version, changes, ...extra }, as);
const product = async (id: string, as = admin) => (await c.get(`/api/v1/products/${id}`, as)).body.data;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  admin = await c.registerVendor({ businessName: 'Edit Co' });
  vendorId = admin.vendorId!;
  staff = await c.addMember(admin, 'vendor_staff');
  viewer = await c.addMember(admin, 'vendor_viewer');
  rival = await c.registerVendor({ businessName: 'Rival Edit Co' });
  cat = await makeCategory(w(), admin, 'Travel Accessories');
  cat2 = await makeCategory(w(), admin, 'Luggage & Travel Bags');
}, 180_000);
afterAll(() => t.close());

// ==================================================================================================
// E1: the master code lock
// ==================================================================================================
describe('master code lock (E1)', () => {
  it('a draft can change its code, an active product cannot (409 code_locked) and says so in the DTO', async () => {
    const d = await makeProduct(w(), admin, { status: 'draft', code: uniq('LK-D') });
    expect(d.id).toBeTruthy();
    const dto = await product(d.id);
    expect(dto).toMatchObject({ status: 'draft', productCodeLocked: false });
    const ok = await c.patch(`/api/v1/products/${d.id}`, { productCode: uniq('LK-D2') }, admin);
    expect(ok.status, J(ok)).toBe(200);

    const a = await makeProduct(w(), admin, { code: uniq('LK-A') });
    expect(await product(a.id)).toMatchObject({ status: 'active', productCodeLocked: true });
    const r = await c.patch(`/api/v1/products/${a.id}`, { productCode: uniq('LK-NEW') }, admin);
    expect(r.status).toBe(409);
    expect(r.body.error.details).toMatchObject({ rule: 'code_locked', field: 'productCode', code: a.code });
    expect((await product(a.id)).productCode).toBe(a.code);
    // not even a different spelling of the same code
    expect((await c.patch(`/api/v1/products/${a.id}`, { productCode: a.code.toLowerCase() }, admin)).status).toBe(409);
    // sending the same code is not a change; the other fields still save
    const same = await c.patch(`/api/v1/products/${a.id}`, { productCode: a.code, title: 'Locked but editable title' }, admin);
    expect(same.status, J(same)).toBe(200);
    expect(same.body.data).toMatchObject({ productCode: a.code, title: 'Locked but editable title', productCodeLocked: true });
    // the flag is on the list items too
    const list = await c.get(`/api/v1/products?q=${a.code}`, admin);
    expect(list.body.data[0]).toMatchObject({ id: a.id, productCodeLocked: true });
  });

  it('a draft may change its code and activate in the same call; an archived product is locked too', async () => {
    const d = await makeProduct(w(), admin, { status: 'draft', code: uniq('LK-X') });
    const next = uniq('LK-Y');
    const r = await c.patch(`/api/v1/products/${d.id}`, { productCode: next, status: 'active' }, admin);
    expect(r.status, J(r)).toBe(200);
    expect(r.body.data).toMatchObject({ productCode: next, status: 'active', productCodeLocked: true });
    expect((await c.patch(`/api/v1/products/${d.id}`, { status: 'archived' }, admin)).status).toBe(200);
    const locked = await c.patch(`/api/v1/products/${d.id}`, { productCode: uniq('LK-Z') }, admin);
    expect(locked.status).toBe(409);
    expect(locked.body.error.details.rule).toBe('code_locked');
  });

  it('the draft endpoints stay exempt (drafts only), and bulk status changes are unaffected', async () => {
    const d = await makeProduct(w(), admin, { status: 'draft', code: uniq('LK-DR') });
    const created = (await c.get(`/api/v1/products/${d.id}/creation`, admin)).body.data;
    const r = await c.patch(`/api/v1/products/${d.id}/draft`, { version: created.creation.version, productCode: uniq('LK-DR2') }, admin);
    expect(r.status, J(r)).toBe(200);
    const bulk = await c.post('/api/v1/products/bulk', { action: 'update_status', ids: [d.id], status: 'archived' }, admin);
    expect(bulk.body.data.summary).toMatchObject({ succeeded: 1, failed: 0 });
    // an archived product is no longer a draft: the draft save refuses it before the lock is even reached
    expect((await c.patch(`/api/v1/products/${d.id}/draft`, { version: 99, productCode: uniq('LK-DR3') }, admin)).status).toBe(409);
  });

  it('a CSV import row for an active product updates it and never touches its code (the code is the row key)', async () => {
    const a = await makeProduct(w(), admin, { code: uniq('LK-CSV'), title: 'Before CSV title' });
    const csv = `product_code,sku,title\n${a.code},${a.sku},After CSV title\n`;
    const job = await c.post('/api/v1/products/imports', undefined, admin);
    expect(job.status, J(job)).toBe(201);
    const id = job.body.data.job.id;
    const put = await c.call('POST', job.body.data.upload.url, { as: admin, raw: csv, contentType: 'text/csv' });
    expect(put.status, J(put)).toBe(200);
    expect((await c.post(`/api/v1/data-jobs/${id}/start`, {}, admin)).status).toBe(202);
    await t.runJobs();
    const after = await product(a.id);
    expect(after).toMatchObject({ productCode: a.code, title: 'After CSV title' });
    const done = (await c.get(`/api/v1/data-jobs/${id}`, admin)).body.data;
    expect(done).toMatchObject({ status: 'succeeded', errors: [] });
  });
});

// ==================================================================================================
// the shared diff (pure)
// ==================================================================================================
describe('the diff (pure, shared by change-impact and save)', () => {
  const base = {
    title: 'Premium Travel Bag', productCode: 'TRV-1', description: 'A durable travel bag.', descriptionHtml: '<p>A durable travel bag.</p>', brand: 'Urban Carry', categoryId: '11111111-1111-4111-8111-111111111111',
    material: 'Canvas', countryOfOrigin: 'IN', hsnCode: '4202', gstRateBps: 1800, lengthMm: 500, widthMm: 300, heightMm: 250, weightGrams: 1200, tags: ['bag'], manufacturer: null, standardCategory: null,
    customAttributes: [{ name: 'Collection', value: 'Travel 2026', confirmed: true }], attributes: { productType: 'physical' }, status: 'active',
  } as unknown as Parameters<typeof computeChange>[0];

  it('ignores every value equal to the stored one, in canonical form', () => {
    const r = computeChange(base, {
      title: '  Premium   Travel Bag ', brand: 'URBAN  carry', description: 'A durable travel bag.', material: ' Canvas ', countryOfOrigin: 'in',
      dimensions: { length: 50, width: 30, height: 25, unit: 'cm' }, weight: { value: 1.2, unit: 'kg' }, hsnCode: '4202', gstRateBps: 1800, productType: 'physical',
      customAttributes: [{ name: 'collection', value: 'Travel 2026' }], tags: ['bag'], categoryId: '11111111-1111-4111-8111-111111111111',
    });
    expect(r.issues).toEqual([]);
    expect(r.items).toEqual([]);
    expect(r.fields).toEqual({});
    expect(summaryOf(r.items)).toBe('No changes yet');
  });

  it('detects real changes per field and maps them to what listings inherit', () => {
    const r = computeChange(base, { title: 'Urban Carry Premium Travel Bag', weight: { value: 2, unit: 'lb' }, dimensions: { length: 20, width: 12, height: 10, unit: 'in' }, gstRateBps: 1200, material: 'Leather' });
    expect(r.items.map((i) => i.field)).toEqual(['title', 'material', 'dimensions', 'weight', 'gstRateBps']);
    expect(r.contentFields).toEqual(['title', 'material', 'dimensions', 'weight', 'gstRate']);
    expect(r.fields).toMatchObject({ title: 'Urban Carry Premium Travel Bag', material: 'Leather', weightGrams: 907, lengthMm: 508, widthMm: 305, heightMm: 254, gstRateBps: 1200 });
    expect(summaryOf(r.items)).toBe('5 fields changed');
    expect(summaryOf(computeChange(base, { title: 'New name for bag' }).items)).toBe('Product name changed');
  });

  it('a formatting-only description change is saved but is not a listing content change', () => {
    const r = computeChange(base, { descriptionHtml: '<p>A <strong>durable</strong> travel bag.</p>' });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ field: 'description', formattingOnly: true });
    expect(r.contentFields).toEqual([]);
    expect(r.fields).toEqual({ descriptionHtml: '<p>A <strong>durable</strong> travel bag.</p>' });
    // the same plain text sent without html is no change at all
    expect(computeChange(base, { description: 'A durable travel bag.' }).items).toEqual([]);
    // html of a product that only has plain text compares against the plain text it would produce
    const plain = { ...base, descriptionHtml: null } as typeof base;
    expect(computeChange(plain, { descriptionHtml: '<p>A durable travel bag.</p>' }).items).toEqual([]);
  });

  it('reports the category and type changes and clearing rules of a product that is no longer a draft', () => {
    const r = computeChange(base, { categoryId: '22222222-2222-4222-8222-222222222222', productType: 'digital' });
    expect(r.category).toEqual({ fromId: '11111111-1111-4111-8111-111111111111', toId: '22222222-2222-4222-8222-222222222222' });
    expect(r.categoryChanged && r.typeChanged).toBe(true);
    expect(r.contentFields).toEqual(['category', 'productType']);
    const bad = computeChange(base, { categoryId: null, title: 'ab' });
    expect(bad.issues.map((i) => i.field + ':' + i.code).sort()).toEqual(['categoryId:category_required', 'title:title_too_short']);
    const draft = { ...base, status: 'draft' } as typeof base;
    expect(computeChange(draft, { categoryId: null, title: 'ab' }).issues).toEqual([]); // a draft may keep a short name and no category
    const locked = computeChange(base, { productCode: 'TRV-2' });
    expect(locked).toMatchObject({ codeLocked: true, codeChange: null, items: [], fields: {} }); // left out of the change, reported as a problem
    expect(locked.issues).toEqual([expect.objectContaining({ field: 'productCode', code: 'code_locked' })]);
    expect(computeChange(draft, { productCode: 'TRV-2' })).toMatchObject({ codeLocked: false, codeChange: { from: 'TRV-1', to: 'TRV-2' } });
  });

  it('attributes: the same facts are equal whatever the order; a changed value or confirmation is a change', () => {
    const two = { ...base, customAttributes: [{ name: 'A', value: '1', confirmed: false }, { name: 'B', value: '2', confirmed: true }] } as typeof base;
    expect(computeChange(two, { customAttributes: [{ name: 'b', value: '2' }, { name: 'a', value: '1' }] }).items).toEqual([]);
    expect(computeChange(two, { customAttributes: [{ name: 'A', value: '1', confirmed: true }, { name: 'B', value: '2' }] }).items.map((i) => i.field)).toEqual(['customAttributes']);
    expect(computeChange(two, { customAttributes: null }).items.map((i) => i.field)).toEqual(['customAttributes']);
  });
});

// ==================================================================================================
// GET /products/{id}/edit
// ==================================================================================================
describe('GET /products/{id}/edit', () => {
  it('returns the whole editing page in one call with real numbers', async () => {
    const p = await makeProduct(w(), admin, { code: uniq('ED-R'), title: 'Premium Travel Bag', categoryId: cat, extra: { material: 'Canvas', weight: { value: 1.2, unit: 'kg' }, customAttributes: [{ name: 'Collection', value: 'Travel 2026', confirmed: true }, { name: 'Season', value: 'Winter' }] } });
    await addImage(w(), admin, p.id);
    const r = await c.get(EDIT(p.id), admin);
    expect(r.status, J(r)).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({ version: p.version, status: 'active', locks: { productCode: { locked: true, reason: 'Used as the primary internal product identifier.' } } });
    expect(d.product).toMatchObject({ id: p.id, title: 'Premium Travel Bag', productCodeLocked: true, category: { id: cat, name: 'Travel Accessories' }, productType: 'physical', variantCount: 1 });
    expect(d.product.primaryImage).toMatchObject({ state: 'ready' });
    expect(d.meta).toMatchObject({ productId: p.code, updatedBy: { name: 'Asha Admin' } });
    expect(d.meta.createdAt).toBe(d.product.createdAt);
    expect(d.nav.map((n: any) => n.key)).toEqual(['overview', 'media', 'details', 'variants', 'inventory', 'listings', 'content', 'activity']);
    expect(d.nav.find((n: any) => n.key === 'media').count).toBe(1);
    expect(d.nav.find((n: any) => n.key === 'variants').count).toBe(1);
    expect(d.nav.find((n: any) => n.key === 'listings').count).toBe(0);
    // E9: material, weight, country (via hsn etc.): supplied slots + confirmed custom attributes
    expect(d.attributes.slots.map((s: any) => [s.key, s.supplied])).toEqual([['material', true], ['dimensions', false], ['weight', true], ['countryOfOrigin', true], ['hsnCode', true], ['taxInformation', true]]);
    expect(d.attributes).toMatchObject({ configured: 6, customConfirmed: 1 }); // 5 supplied slots + 1 confirmed custom attribute (the unconfirmed one is not counted)
    expect(d.attributes.note).toBe('Attribute values were not supplied in the existing product record. Confirm factual and tax details before distributing them.');
    expect(d.media.total).toBe(1);
    expect(d.media.thumbnails).toHaveLength(1);
    expect(d.media.primaryImageUrl).toMatch(/^\/api\/v1\/documents\/.+\/content$/);
    expect(d.inheritance).toMatchObject({ channels: [], text: expect.stringContaining('Marketplace-specific content remains independently manageable.') });
    expect(d.readiness.items.map((i: any) => i.key)).toEqual(['core_information', 'product_media', 'required_attributes', 'marketplace_content']);
    expect(d.readiness.items.every((i: any) => ['done', 'pending'].includes(i.state))).toBe(true);
  });

  it('the attribute note disappears once all six core facts are supplied', async () => {
    const p = await makeProduct(w(), admin, { code: uniq('ED-N'), categoryId: cat, extra: { material: 'Canvas', weight: { value: 1, unit: 'kg' }, dimensions: { length: 10, width: 10, height: 10, unit: 'cm' } } });
    const d = await editor(p.id);
    expect(d.attributes).toMatchObject({ configured: 6, note: null });
    const bare = await makeProduct(w(), admin, { code: uniq('ED-B'), categoryId: cat, extra: { countryOfOrigin: null, hsnCode: null, gstRateBps: null } });
    const b = await editor(bare.id);
    expect(b.attributes.configured).toBe(0);
    expect(b.attributes.slots.every((s: any) => !s.supplied)).toBe(true);
    expect(b.attributes.note).toContain('Attribute values were not supplied');
  });

  it('a draft is editable (not locked); readiness percent equals the content readiness percent of the same product', async () => {
    const d = await makeProduct(w(), admin, { status: 'draft', code: uniq('ED-DR') });
    const dd = await editor(d.id);
    expect(dd.locks.productCode).toEqual({ locked: false, reason: null });
    expect(dd.status).toBe('draft');
    for (const p of [d, await makeProduct(w(), admin, { categoryId: cat }), await makeProduct(w(), admin, { categoryId: cat, brand: null, description: null })]) {
      const e = await editor(p.id);
      const content = (await c.get(`/api/v1/products/${p.id}/content`, admin)).body.data;
      expect(e.readiness.percent).toBe(content.readiness.pct);
    }
    // the percent moves with the data: a brand and a description add two of the 11 checks
    const poor = await makeProduct(w(), admin, { categoryId: cat, brand: null, description: null });
    const before = (await editor(poor.id)).readiness.percent;
    expect((await c.patch(`/api/v1/products/${poor.id}`, { brand: 'Acme', description: 'A description that is longer than twenty characters.' }, admin)).status).toBe(200);
    const after = await editor(poor.id);
    expect(after.readiness.percent).toBeGreaterThan(before);
    expect(after.readiness.percent).toBe((await c.get(`/api/v1/products/${poor.id}/content`, admin)).body.data.readiness.pct);
  });

  it('is readable by a viewer, hidden from another business, 404 for an unknown id', async () => {
    const p = await makeProduct(w(), admin, { categoryId: cat });
    expect((await c.get(EDIT(p.id), viewer)).status).toBe(200);
    expect((await c.get(EDIT(p.id), rival)).status).toBe(404);
    expect((await c.get(EDIT('00000000-0000-4000-8000-000000000000'), admin)).status).toBe(404);
    expect((await c.get(EDIT(p.id))).status).toBe(401);
  });
});

// ==================================================================================================
// POST /products/{id}/change-impact
// ==================================================================================================
describe('POST /products/{id}/change-impact', () => {
  it('no change, an equal value and an empty payload all answer "No changes yet" and write nothing', async () => {
    const p = await makeProduct(w(), admin, { title: 'Premium Travel Bag', categoryId: cat });
    const before = await product(p.id);
    for (const changes of [{}, { title: 'Premium Travel Bag' }, { title: '  Premium  Travel   Bag  ', brand: 'urban carry' }]) {
      const r = await impact(p.id, changes);
      expect(r.status, J(r)).toBe(200);
      expect(r.body.data).toMatchObject({ hasChanges: false, summary: 'No changes yet', items: [], channels: [], requiresConfirmation: false, listings: { potential: 0, live: 0 } });
    }
    const after = await product(p.id);
    expect(after.version).toBe(before.version);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  it('a name change lists the item, the summary and the not-sent note', async () => {
    const p = await makeProduct(w(), admin, { title: 'Premium Travel Bag', categoryId: cat });
    const r = (await impact(p.id, { title: 'Urban Carry Premium Travel Bag' })).body.data;
    expect(r).toMatchObject({ hasChanges: true, summary: 'Product name changed', notSentNote: 'Updates are not sent to listings until you save.', requiresConfirmation: false, independentNote: null });
    expect(r.items).toEqual([{ field: 'title', label: 'Product name', message: 'Product name changed' }]);
    const many = (await impact(p.id, { title: 'Another bag name', material: 'Leather', weight: { value: 2, unit: 'kg' } })).body.data;
    expect(many.summary).toBe('3 fields changed');
    expect(many.items.map((i: any) => i.field)).toEqual(['title', 'material', 'weight']);
  });

  it('invalid values are reported in `errors` (and left out), a locked code is reported', async () => {
    const p = await makeProduct(w(), admin, { categoryId: cat });
    const r = (await impact(p.id, { title: 'ab', hsnCode: '12', productCode: uniq('NEWCODE'), material: 'Leather' })).body.data;
    expect(r.errors.map((e: any) => `${e.field}:${e.code}`).sort()).toEqual(['hsnCode:invalid_hsn', 'productCode:code_locked', 'title:title_too_short']);
    expect(r.items.map((i: any) => i.field)).toEqual(['material']);
    const ghost = (await impact(p.id, { categoryId: '00000000-0000-4000-8000-000000000001' })).body.data;
    expect(ghost.errors).toEqual([expect.objectContaining({ field: 'categoryId', code: 'category_not_found' })]);
  });

  it('a category or type change on a product without live listings needs no confirmation', async () => {
    const p = await makeProduct(w(), admin, { categoryId: cat });
    const r = (await impact(p.id, { categoryId: cat2, productType: 'digital' })).body.data;
    expect(r).toMatchObject({ hasChanges: true, summary: '2 fields changed', requiresConfirmation: false });
    expect(r.confirmation).toBeUndefined();
  });

  it('viewers can preview, other businesses cannot, and a preview never changes anything', async () => {
    const p = await makeProduct(w(), admin, { categoryId: cat });
    expect((await impact(p.id, { title: 'Viewer preview name' }, viewer)).status).toBe(200);
    expect((await impact(p.id, { title: 'Viewer preview name' }, rival)).status).toBe(404);
    expect((await product(p.id)).title).not.toBe('Viewer preview name');
    expect((await c.post(IMPACT(p.id), { changes: { title: 5 } }, admin)).status).toBe(400);
    expect((await c.post(IMPACT(p.id), {}, admin)).status).toBe(400);
  });
});

// ==================================================================================================
// POST /products/{id}/edit/save (no listings involved)
// ==================================================================================================
const auditRows = (productId: string, action = 'product.edited') => sql<{ before: any; after: any; metadata: any; actor_id: string }>(t, `select before, after, metadata, actor_id from audit_logs where resource_id = $1 and action = $2 order by id`, [productId, action]);
const issuesOf = (r: { body: any }) => (r.body.error.details.issues as Array<{ path: string; code: string; message: string }>).map((i) => `${i.path}:${i.code}`).sort();

describe('POST /products/{id}/edit/save', () => {
  it('saves in one transaction: new values, new version, audit with per-field before/after, outbox events', async () => {
    const p = await makeProduct(w(), admin, { title: 'Premium Travel Bag', categoryId: cat });
    const events = (await t.outbox('product.edited')).length;
    const updated = (await t.outbox('product.updated')).length;
    const r = await save(p.id, p.version, { title: 'Urban Carry Premium Travel Bag', material: 'Canvas', weight: { value: 1.2, unit: 'kg' } });
    expect(r.status, J(r)).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({ saved: true, noChanges: false, version: p.version + 1 });
    expect(new Date(d.savedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(d.product).toMatchObject({ title: 'Urban Carry Premium Travel Bag', material: 'Canvas', weightGrams: 1200, version: p.version + 1 });
    expect(d.impact).toMatchObject({ listingsQueued: 0, channels: [], text: 'No listings need to sync.', notSyncedYet: null });
    expect(d.readiness.percent).toBe((await c.get(`/api/v1/products/${p.id}/content`, admin)).body.data.readiness.pct);
    expect(Array.isArray(d.insights)).toBe(true);
    expect(await product(p.id)).toMatchObject({ title: 'Urban Carry Premium Travel Bag', material: 'Canvas', weightGrams: 1200, version: p.version + 1 });

    const [audit] = await auditRows(p.id);
    expect(audit!.before).toEqual({ title: 'Premium Travel Bag', material: null, weight: null });
    expect(audit!.after).toEqual({ title: 'Urban Carry Premium Travel Bag', material: 'Canvas', weight: 1200 });
    expect(audit!.metadata).toMatchObject({ fields: ['title', 'material', 'weight'], contentFields: ['title', 'material', 'weight'], version: { from: p.version, to: p.version + 1 }, confirmed: false, listings: [] });
    expect(await auditRows(p.id, 'product.update')).toHaveLength(0); // one audit record per save, not two

    const edited = await t.outbox('product.edited');
    expect(edited).toHaveLength(events + 1);
    expect(edited.at(-1)).toMatchObject({ aggregateId: p.id, payload: { fields: ['title', 'material', 'weight'], version: p.version + 1, listingsQueued: 0 } });
    const upd = await t.outbox('product.updated');
    expect(upd).toHaveLength(updated + 1);
    expect(upd.at(-1)!.payload.fields).toEqual(expect.arrayContaining(['title', 'material', 'weightGrams']));
  });

  it('a save without an effective change answers 200 noChanges and writes nothing', async () => {
    const p = await makeProduct(w(), admin, { title: 'Premium Travel Bag', categoryId: cat });
    const before = await product(p.id);
    const events = (await t.outbox()).length;
    for (const changes of [{}, { title: 'Premium Travel Bag' }, { title: ' Premium  Travel Bag ', brand: 'URBAN CARRY', countryOfOrigin: 'in', hsnCode: '4202' }]) {
      const r = await save(p.id, p.version, changes);
      expect(r.status, J(r)).toBe(200);
      expect(r.body.data).toEqual({ saved: false, noChanges: true, version: p.version });
    }
    const after = await product(p.id);
    expect(after.version).toBe(before.version);
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(await auditRows(p.id)).toHaveLength(0);
    expect((await t.outbox()).length).toBe(events);
  });

  it('a stale version is a 409 VERSION_CONFLICT with the current editor view, nothing is written', async () => {
    const p = await makeProduct(w(), admin, { title: 'Conflict Bag', categoryId: cat });
    expect((await save(p.id, p.version, { title: 'First editor wins' })).status).toBe(200);
    const r = await save(p.id, p.version, { title: 'Second editor loses' }, {}, staff);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('VERSION_CONFLICT');
    const det = r.body.error.details;
    expect(det.currentVersion).toBe(p.version + 1);
    expect(det.current).toMatchObject({ version: p.version + 1, product: { title: 'First editor wins' } });
    expect(det.updatedBy).toMatchObject({ name: 'Asha Admin' });
    expect(new Date(det.updatedAt).getTime()).toBeGreaterThan(0);
    expect((await product(p.id)).title).toBe('First editor wins');
    // the merge path: resend with the current version
    expect((await save(p.id, det.currentVersion, { title: 'Second editor merged' }, {}, staff)).status).toBe(200);
  });

  it('two saves with the same version: exactly one succeeds', async () => {
    const p = await makeProduct(w(), admin, { title: 'Race Bag', categoryId: cat });
    const [a, b] = await Promise.all([save(p.id, p.version, { title: 'Race winner A' }), save(p.id, p.version, { title: 'Race winner B' }, {}, staff)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error.code).toBe('VERSION_CONFLICT');
    const final = await product(p.id);
    expect(final.version).toBe(p.version + 1);
    expect(final.title).toBe(a.status === 200 ? 'Race winner A' : 'Race winner B');
    expect(await auditRows(p.id)).toHaveLength(1);
  });

  it('honours the Idempotency-Key: a retry returns the first answer and saves once', async () => {
    const p = await makeProduct(w(), admin, { title: 'Idem Bag', categoryId: cat });
    const key = { 'Idempotency-Key': `edit-${p.id}` };
    const first = await c.post(SAVE(p.id), { version: p.version, changes: { title: 'Saved once only' } }, admin, key);
    const again = await c.post(SAVE(p.id), { version: p.version, changes: { title: 'Saved once only' } }, admin, key);
    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual(first.body.data);
    expect((await product(p.id)).version).toBe(p.version + 1);
    expect(await auditRows(p.id)).toHaveLength(1);
  });

  it('field-level errors have the shape of the creation endpoints (400, details.issues[{ path, code, message }]), and nothing is saved', async () => {
    const p = await makeProduct(w(), admin, { title: 'Valid Bag', categoryId: cat });
    const r = await save(p.id, p.version, {
      title: 'ab', hsnCode: '12', gstRateBps: 3000, countryOfOrigin: 'XX', brand: 'b'.repeat(81), categoryId: null,
      dimensions: { length: 0, width: 5, height: 5, unit: 'cm' }, weight: { value: 10_000_001, unit: 'g' },
      customAttributes: [{ name: 'Color', value: 'Red' }, { name: 'color', value: 'Blue' }],
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
    expect(issuesOf(r)).toEqual([
      'brand:too_long', 'categoryId:category_required', 'countryOfOrigin:unknown_country', 'customAttributes[1].name:duplicate_name', 'dimensions.length:not_positive',
      'gstRateBps:invalid_gst', 'hsnCode:invalid_hsn', 'title:title_too_short', 'weight.value:too_large',
    ]);
    expect(r.body.error.details.issues[0]).toEqual({ path: expect.any(String), code: expect.any(String), message: expect.any(String) });
    expect((await product(p.id)).version).toBe(p.version);

    // description: the plain-text limit is 2,000 characters; the rule is reported in details.rule
    const ok = await save(p.id, p.version, { description: 'd'.repeat(2000) });
    expect(ok.status, J(ok)).toBe(200);
    const over = await save(p.id, p.version + 1, { description: 'd'.repeat(2001) });
    expect(over.status).toBe(400);
    expect(over.body.error.details).toMatchObject({ rule: 'description_too_long', length: 2001, max: 2000 });
    // a name of 200 characters passes, 201 does not
    expect((await save(p.id, p.version + 1, { title: 't'.repeat(200) })).status).toBe(200);
    const long = await save(p.id, p.version + 2, { title: 't'.repeat(201) });
    expect(issuesOf(long)).toEqual(['title:too_long']);
    expect(issuesOf(await save(p.id, p.version + 2, { categoryId: '00000000-0000-4000-8000-000000000001' }))).toEqual(['categoryId:category_not_found']);
  });

  it('the master code: 409 code_locked for a listed product (even with other valid changes), editable and unique for a draft', async () => {
    const p = await makeProduct(w(), admin, { title: 'Locked Bag', categoryId: cat });
    const r = await save(p.id, p.version, { productCode: uniq('CHANGED'), title: 'Locked bag renamed' });
    expect(r.status).toBe(409);
    expect(r.body.error.details).toMatchObject({ rule: 'code_locked', field: 'productCode', code: p.code });
    expect(await product(p.id)).toMatchObject({ productCode: p.code, title: 'Locked Bag', version: p.version }); // all or nothing
    // sending the unchanged code is fine
    expect((await save(p.id, p.version, { productCode: p.code, title: 'Locked bag renamed' })).status).toBe(200);

    const other = await makeProduct(w(), admin, { status: 'draft', code: uniq('DR-A') });
    const draft = await makeProduct(w(), admin, { status: 'draft', code: uniq('DR-B') });
    const dup = await save(draft.id, draft.version, { productCode: other.code.toLowerCase() });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toMatchObject({ rule: 'duplicate_product_code', field: 'productCode', conflict: { id: other.id } });
    const next = uniq('DR-C');
    const okd = await save(draft.id, draft.version, { productCode: next, title: 'x' }); // a draft keeps the draft rules: a short name is fine
    expect(okd.status, J(okd)).toBe(200);
    expect(okd.body.data.product).toMatchObject({ productCode: next, productCodeLocked: false, title: 'x' });
  });

  it('an active product keeps at least one active variant (409 needs_variant)', async () => {
    const p = await makeProduct(w(), admin, { categoryId: cat });
    expect((await c.patch(`/api/v1/variants/${p.variantId}`, { status: 'inactive' }, admin)).status).toBe(200);
    const r = await save(p.id, p.version, { title: 'No variant bag' });
    expect(r.status).toBe(409);
    expect(r.body.error.details.rule).toBe('needs_variant');
  });

  it('permissions: viewer cannot save, staff can, another business sees 404, anonymous 401; body is validated', async () => {
    const p = await makeProduct(w(), admin, { title: 'Perm Bag', categoryId: cat });
    expect((await save(p.id, p.version, { title: 'Viewer rename' }, {}, viewer)).status).toBe(403);
    expect((await save(p.id, p.version, { title: 'Rival rename' }, {}, rival)).status).toBe(404);
    expect((await c.post(SAVE(p.id), { version: p.version, changes: { title: 'Anon rename' } })).status).toBe(401);
    expect((await product(p.id)).title).toBe('Perm Bag');
    expect((await save(p.id, p.version, { title: 'Staff rename' }, {}, staff)).status).toBe(200);
    for (const bad of [{ changes: { title: 'x' } }, { version: '1', changes: {} }, { version: 1 }, { version: 1, changes: { title: 5 } }, { version: 1, changes: {}, confirm: 'yes' }]) {
      expect((await c.post(SAVE(p.id), bad, admin)).status, J({ body: bad })).toBe(400);
    }
    expect((await c.post(SAVE('00000000-0000-4000-8000-000000000000'), { version: 1, changes: {} }, admin)).status).toBe(404);
  });
});

// ==================================================================================================
// with connected listings
// ==================================================================================================
describe('connected listings: impact, confirmation and marking', () => {
  const accounts: Record<string, { id: string }> = {};
  const mappedCategory = uniq('AMZ-LUGGAGE');
  beforeAll(async () => {
    for (const m of ['mock', 'amazon_in', 'flipkart', 'myntra']) accounts[m] = await c.connectAccount(admin, m);
    await sql(t, `insert into category_mappings (vendor_id, marketplace, category_id, marketplace_category_id, marketplace_category_name) values ($1, 'amazon_in', $2, $3, 'Luggage')`, [vendorId, cat2, mappedCategory]);
  });

  /** a product listed on mock + amazon_in + myntra (live; myntra manages its title itself) and flipkart (a draft listing) */
  async function listed(extra: Record<string, unknown> = {}) {
    const p = await makeProduct(w(), admin, { title: 'Premium Travel Bag', categoryId: cat, ...extra });
    const ids = {
      mock: await liveListing(w(), vendorId, accounts.mock!.id, p),
      amazon_in: await liveListing(w(), vendorId, accounts.amazon_in!.id, p),
      myntra: await liveListing(w(), vendorId, accounts.myntra!.id, p),
      flipkart: await liveListing(w(), vendorId, accounts.flipkart!.id, p, { status: 'draft' }),
    };
    expect((await c.put(`/api/v1/products/${p.id}/marketplace-data/myntra`, { data: { title: 'Myntra specific title' } }, admin)).status).toBe(200);
    return { p, ids };
  }
  const states = async (ids: Record<string, string>) => Object.fromEntries((await sql<{ id: string; content_state: string }>(t, `select id, content_state from marketplace_listings where id = any($1::uuid[])`, [Object.values(ids)])).map((r) => [Object.keys(ids).find((k) => ids[k] === r.id)!, r.content_state]));
  const byCode = (rows: any[]) => Object.fromEntries(rows.map((r) => [r.code, r]));

  it('change-impact: inherited vs independent vs not live, with the design wording', async () => {
    const { p } = await listed();
    const d = (await impact(p.id, { title: 'Urban Carry Premium Travel Bag' })).body.data;
    const ch = byCode(d.channels);
    expect(Object.keys(ch).sort()).toEqual(['amazon_in', 'flipkart', 'mock', 'myntra']);
    expect(ch.amazon_in).toMatchObject({ name: 'Amazon', effect: 'name_inherited', independentFields: [], supportsUpdate: true });
    expect(ch.mock.effect).toBe('name_inherited');
    expect(ch.myntra).toMatchObject({ effect: 'independent', independentFields: ['title'] });
    expect(ch.flipkart.effect).toBe('not_live');
    expect(d.listings).toEqual({ potential: 3, live: 2 }); // 2 inherit now + 1 draft listing that would
    expect(d).toMatchObject({ summary: 'Product name changed', independentNote: 'Myntra content is independently managed.', notSentNote: 'Updates are not sent to listings until you save.', requiresConfirmation: false });
    expect(ch.amazon_in.listingId).toBeTruthy();

    expect(byCode((await impact(p.id, { description: 'A new description of the bag.' })).body.data.channels).myntra.effect).toBe('description_inherited');
    expect(byCode((await impact(p.id, { brand: 'Another Brand' })).body.data.channels).amazon_in.effect).toBe('brand_inherited');
    expect(byCode((await impact(p.id, { material: 'Leather' })).body.data.channels).amazon_in.effect).toBe('attribute_inherited');
    // a standard category is not content any listing reads: no listing is affected
    const std = (await impact(p.id, { standardCategory: 'Bags' })).body.data;
    expect(std).toMatchObject({ hasChanges: true, channels: [], listings: { potential: 0, live: 0 } });
  });

  it('a preview writes nothing: every listing stays synced', async () => {
    const { p, ids } = await listed();
    await impact(p.id, { title: 'Preview only name' });
    await impact(p.id, { categoryId: cat2 });
    expect(Object.values(await states(ids)).every((s) => s === 'synced')).toBe(true);
    expect(await product(p.id)).toMatchObject({ title: 'Premium Travel Bag', categoryId: cat, version: p.version });
  });

  it('save marks only the inherited live listings sync_pending and asks for one sync per account after the commit', async () => {
    const { p, ids } = await listed();
    const jobsBefore = t.pendingJobs().length;
    const r = await save(p.id, p.version, { title: 'Urban Carry Premium Travel Bag' });
    expect(r.status, J(r)).toBe(200);
    const d = r.body.data;
    expect(d.impact.listingsQueued).toBe(2);
    expect(d.impact.text).toBe('2 listings will sync shortly.');
    expect(d.impact.notSyncedYet).toBe('Saved to the master product. Listings have not synced yet.');
    expect(d.impact.independentNote).toBe('Myntra content is independently managed.');
    expect(Object.fromEntries(d.impact.channels.map((x: any) => [x.code, x.state]))).toEqual({ amazon_in: 'sync_pending', mock: 'sync_pending', myntra: 'independent', flipkart: 'not_live' });
    expect(await states(ids)).toEqual({ mock: 'sync_pending', amazon_in: 'sync_pending', myntra: 'synced', flipkart: 'synced' });
    const row = (await sql<{ content_changed_fields: string[] }>(t, `select content_changed_fields from marketplace_listings where id = $1`, [ids.amazon_in]))[0]!;
    expect(row.content_changed_fields).toEqual(['title']);
    expect(t.pendingJobs().length).toBeGreaterThanOrEqual(jobsBefore + 2); // one coalesced content-sync job per account (mock, amazon_in)
    // the readiness panel does not count a pending sync as an open item
    expect(d.readiness.items.find((i: any) => i.key === 'marketplace_content').state).toBe('done');
    // the editor shows the channels and what each manages itself
    const e = await editor(p.id);
    expect(e.nav.find((n: any) => n.key === 'listings').count).toBe(4);
    expect(byCode(e.inheritance.channels).myntra).toMatchObject({ name: 'Myntra', independentFields: ['title'], listings: 1 });
    expect(byCode(e.inheritance.channels).flipkart.listingStatus).toBe('draft');
  });

  it('a category change on live listings needs confirmation, with the modal payload; confirmed -> needs_review with a mapping suggestion', async () => {
    const { p, ids } = await listed();
    const d = (await impact(p.id, { categoryId: cat2 })).body.data;
    expect(d).toMatchObject({ summary: 'Category changed', requiresConfirmation: true, listings: { potential: 4, live: 3 } });
    expect(d.confirmation).toEqual({
      title: 'This change may affect connected listings.',
      message: '3 marketplace listings may need to be remapped.',
      mapping: { from: 'Travel Accessories', to: 'Luggage & Travel Bags' },
      channels: expect.arrayContaining([{ code: 'amazon_in', action: 'category_mapping_review' }, { code: 'mock', action: 'category_mapping_review' }, { code: 'myntra', action: 'category_mapping_review' }]),
    });
    expect(d.confirmation.channels).toHaveLength(3);
    const ch = byCode(d.channels);
    expect(ch.amazon_in).toMatchObject({ effect: 'may_need_remapping', mappingState: 'mapped', suggested: { marketplaceCategoryId: mappedCategory, marketplaceCategoryName: 'Luggage' } });
    expect(ch.mock).toMatchObject({ effect: 'may_need_remapping', mappingState: 'needs_review' });

    const no = await save(p.id, p.version, { categoryId: cat2 });
    expect(no.status).toBe(409);
    expect(no.body.error.details.rule).toBe('confirmation_required');
    expect(no.body.error.details.impact).toMatchObject({ requiresConfirmation: true, summary: 'Category changed' });
    expect(no.body.error.details.impact.confirmation.mapping).toEqual({ from: 'Travel Accessories', to: 'Luggage & Travel Bags' });
    expect(await product(p.id)).toMatchObject({ categoryId: cat, version: p.version }); // nothing happened
    expect(Object.values(await states(ids)).every((s) => s === 'synced')).toBe(true);
    const falsy = await save(p.id, p.version, { categoryId: cat2 }, { confirm: false });
    expect(falsy.status).toBe(409);

    const yes = await save(p.id, p.version, { categoryId: cat2 }, { confirm: true });
    expect(yes.status, J(yes)).toBe(200);
    expect(Object.fromEntries(yes.body.data.impact.channels.map((x: any) => [x.code, x.state]))).toEqual({ amazon_in: 'needs_review', mock: 'needs_review', myntra: 'needs_review', flipkart: 'not_live' });
    expect(yes.body.data.impact).toMatchObject({ listingsQueued: 0, text: 'No listings need to sync.' });
    expect(await states(ids)).toEqual({ mock: 'needs_review', amazon_in: 'needs_review', myntra: 'needs_review', flipkart: 'synced' });
    const review = (await sql<{ content_review: any }>(t, `select content_review from marketplace_listings where id = $1`, [ids.amazon_in]))[0]!.content_review;
    expect(review).toMatchObject({ reason: 'category_changed', fromCategoryId: cat, toCategoryId: cat2, suggestedMarketplaceCategoryId: mappedCategory, suggestedMarketplaceCategoryName: 'Luggage' });
    expect((await auditRows(p.id))[0]!.metadata).toMatchObject({ confirmed: true });
    // the readiness panel opens "Marketplace content": 3 listings need content review
    const mc = yes.body.data.readiness.items.find((i: any) => i.key === 'marketplace_content');
    expect(mc).toMatchObject({ state: 'pending', detail: '3 marketplace listings need content review.', action: { label: 'Review', href: `/products/${p.id}?tab=listings` } });
    expect((await editor(p.id)).readiness.items.find((i: any) => i.key === 'marketplace_content').detail).toBe('3 marketplace listings need content review.');
  });

  it('a product type change needs confirmation too (only when listings are live); confirm: true on a change that needs none is harmless', async () => {
    const { p } = await listed();
    const d = (await impact(p.id, { productType: 'digital' })).body.data;
    expect(d).toMatchObject({ requiresConfirmation: true, confirmation: { message: '3 marketplace listings may be affected.', channels: [] } });
    expect(d.confirmation.mapping).toBeUndefined();
    expect((await save(p.id, p.version, { productType: 'digital' })).status).toBe(409);
    const ok = await save(p.id, p.version, { productType: 'digital' }, { confirm: true });
    expect(ok.status, J(ok)).toBe(200);
    expect(ok.body.data.product.productType).toBe('digital');
    const harmless = await save(p.id, p.version + 1, { title: 'Digital bag renamed' }, { confirm: true });
    expect(harmless.status).toBe(200);
  });

  it('the product.updated consumer finds nothing left to mark after an explicit save (the content hash makes the marking idempotent)', async () => {
    const { p, ids } = await listed();
    expect((await save(p.id, p.version, { title: 'First new name' })).status).toBe(200);
    await sql(t, `update marketplace_listings set content_changed_at = null where id = any($1::uuid[])`, [Object.values(ids)]);
    await t.relayEvents();
    const rows = await sql<{ content_changed_at: string | null; content_state: string }>(t, `select content_changed_at, content_state from marketplace_listings where id = $1`, [ids.mock]);
    expect(rows[0]).toMatchObject({ content_state: 'sync_pending', content_changed_at: null });
  });

  it('more than 500 listings: impact and save answer 413, the editor still loads without the channel panel', async () => {
    const big = await makeProduct(w(), admin, { title: 'Big Bag', categoryId: cat });
    await sql(t, `insert into product_variants (vendor_id, product_id, sku) select $1, $2, 'BIG-' || g from generate_series(1, 501) g`, [vendorId, big.id]);
    await sql(t, `insert into marketplace_listings (vendor_id, marketplace_account_id, variant_id, external_sku, status)
      select $1, $3, v.id, v.sku, 'active' from product_variants v where v.product_id = $2 and v.sku like 'BIG-%'`, [vendorId, big.id, accounts.mock!.id]);
    const r = await impact(big.id, { title: 'Big bag renamed' });
    expect(r.status).toBe(413);
    expect(r.body.error.details).toMatchObject({ rule: 'too_many_listings', listings: 501, max: 500 });
    const s = await save(big.id, big.version, { title: 'Big bag renamed' });
    expect(s.status).toBe(413);
    expect((await product(big.id)).title).toBe('Big Bag'); // the transaction rolled back
    const e = await c.get(EDIT(big.id), admin);
    expect(e.status, J(e)).toBe(200);
    expect(e.body.data.inheritance).toMatchObject({ channels: [], limited: true });
    expect(e.body.data.nav.find((n: any) => n.key === 'listings').count).toBe(501);
    // a change no listing reads is still saveable
    expect((await save(big.id, big.version, { standardCategory: 'Bags' })).status).toBe(200);
  }, 120_000);

  it('another business cannot see or change these listings (tenant isolation)', async () => {
    const { p } = await listed();
    expect((await impact(p.id, { title: 'Spy rename name' }, rival)).status).toBe(404);
    expect((await save(p.id, p.version, { title: 'Spy rename name' }, {}, rival)).status).toBe(404);
    const mine = await makeProduct(w(), rival, { title: 'Rival bag' });
    expect((await impact(mine.id, { title: 'Rival bag renamed' }, rival)).body.data.channels).toEqual([]);
  });
});

// ==================================================================================================
// insights
// ==================================================================================================
describe('suggested improvements', () => {
  const find = (items: any[], key: string) => items.find((i) => i.key === key);
  const list = async (id: string, as = admin) => (await c.get(INSIGHTS(id), as)).body.data;
  const text = (n: number) => 'a'.repeat(n);

  it('description_short: below the 150-character floor with fewer than 5 peers, exactly 150 is fine', async () => {
    const lone = await makeCategory(w(), admin, uniq('Lone'));
    const short = await makeProduct(w(), admin, { categoryId: lone, description: text(149) });
    const d = find((await list(short.id)).items, 'description_short');
    expect(d).toMatchObject({ key: 'description_short', severity: 'suggestion', message: 'Your product description is shorter than the average for this category.', detail: 'Adding key product benefits may improve listing completeness.' });
    expect(d.data).toEqual({ length: 149, benchmark: 150, samples: 0, source: 'floor' });
    expect(d.actions).toEqual([
      { key: 'review_suggestion', label: 'Review suggestion', method: 'POST', href: `/api/v1/products/${short.id}/ai/description`, body: { mode: 'benefits' } },
      { key: 'dismiss', label: 'Dismiss', method: 'POST', href: `/api/v1/products/${short.id}/insights/description_short/dismiss` },
    ]);
    const exact = await makeProduct(w(), admin, { categoryId: lone, description: text(150) });
    expect(find((await list(exact.id)).items, 'description_short')).toBeUndefined();
    // a product without any description is the shortest of all
    const none = await makeProduct(w(), admin, { categoryId: lone, description: null });
    expect(find((await list(none.id)).items, 'description_short').data.length).toBe(0);
    // without a category there is no peer group: the floor applies
    const free = await makeProduct(w(), admin, { description: text(100) });
    expect(find((await list(free.id)).items, 'description_short').data).toMatchObject({ benchmark: 150, source: 'floor' });
  });

  it('description_short: the median of 5 or more other ACTIVE products of the category with a description', async () => {
    const peers = await makeCategory(w(), admin, uniq('Peers'));
    for (const n of [100, 200, 300, 400, 500]) await makeProduct(w(), admin, { categoryId: peers, description: text(n) });
    // noise that must not count: a draft, an archived product, a product without description, another category
    await makeProduct(w(), admin, { categoryId: peers, status: 'draft', description: text(1000) });
    const archived = await makeProduct(w(), admin, { categoryId: peers, description: text(10) });
    expect((await c.patch(`/api/v1/products/${archived.id}`, { status: 'archived' }, admin)).status).toBe(200);
    await makeProduct(w(), admin, { categoryId: peers, description: null });
    await makeProduct(w(), admin, { categoryId: cat, description: text(900) });

    const below = await makeProduct(w(), admin, { categoryId: peers, description: text(250) }); // the 6th active product with a description
    expect(find((await list(below.id)).items, 'description_short').data).toEqual({ length: 250, benchmark: 300, samples: 5, source: 'category_median' });
    const equal = await makeProduct(w(), admin, { categoryId: peers, description: text(275) });
    // the 6 others are [100, 200, 250, 300, 400, 500]: their median is 275, so 275 is not shorter
    expect(find((await list(equal.id)).items, 'description_short')).toBeUndefined();
    const shorter = await makeProduct(w(), admin, { categoryId: peers, description: text(274) });
    expect(find((await list(shorter.id)).items, 'description_short').data).toMatchObject({ length: 274, benchmark: 275, samples: 7 });
  });

  it('description_short: only 4 comparable peers use the floor; lengths are plain text, not markup', async () => {
    const four = await makeCategory(w(), admin, uniq('Four'));
    for (const n of [20, 20, 20, 20]) await makeProduct(w(), admin, { categoryId: four, description: text(n) });
    const p = await makeProduct(w(), admin, { categoryId: four, description: text(100) });
    expect(find((await list(p.id)).items, 'description_short').data).toMatchObject({ benchmark: 150, samples: 4, source: 'floor' });
    // markup around 13 characters of text: the plain text (with its list bullet) counts, not the markup
    const html = `<p><strong>${text(10)}</strong></p><ul><li>${text(3)}</li></ul>`;
    const rich = await makeProduct(w(), admin, { categoryId: four, description: null, extra: { descriptionHtml: html } });
    const plain = (await product(rich.id)).description as string;
    expect(plain.length).toBeLessThan(html.length / 2);
    expect(find((await list(rich.id)).items, 'description_short').data.length).toBe([...plain.trim()].length);
  });

  it('few_images: fewer than 3 real images; a placeholder does not count', async () => {
    const p = await makeProduct(w(), admin, { categoryId: cat, description: text(200) });
    const d0 = find((await list(p.id)).items, 'few_images');
    expect(d0).toMatchObject({ message: 'Add more product images', detail: 'Listings with several images convert better.' });
    expect(d0.data).toEqual({ images: 0, minimum: 3 });
    expect(d0.actions[0]).toEqual({ key: 'manage_media', label: 'Manage media', method: 'GET', href: `/products/${p.id}?tab=media` });
    const ph = await c.post(`/api/v1/products/${p.id}/documents/placeholder`, {}, admin);
    expect(ph.status, J(ph)).toBeLessThan(300);
    expect(find((await list(p.id)).items, 'few_images').data.images).toBe(0); // the placeholder is not an image
    await addImage(w(), admin, p.id, 'one.png'); // the first real image replaces the placeholder
    await addImage(w(), admin, p.id, 'two.png');
    expect(find((await list(p.id)).items, 'few_images').data.images).toBe(2);
    await addImage(w(), admin, p.id, 'three.png');
    expect(find((await list(p.id)).items, 'few_images')).toBeUndefined();
    const e = await editor(p.id);
    expect(e.media.total).toBe(3);
    expect(e.media.thumbnails).toHaveLength(3);
    expect(e.insights.map((i: any) => i.key)).toEqual([]); // 200 characters of description and 3 images: nothing to suggest
  });

  it('dismiss and restore: per product and key, with and without `until`', async () => {
    const lone = await makeCategory(w(), admin, uniq('Dismiss'));
    const p = await makeProduct(w(), admin, { categoryId: lone, description: text(20) });
    const q = await makeProduct(w(), admin, { categoryId: lone, description: text(20) });
    expect((await list(p.id)).items.map((i: any) => i.key)).toEqual(['description_short', 'few_images']);

    const d = await c.post(`${INSIGHTS(p.id)}/description_short/dismiss`, {}, admin);
    expect(d.status, J(d)).toBe(200);
    expect(d.body.data).toMatchObject({ key: 'description_short', dismissed: true, until: null });
    expect(d.body.data.insights.map((i: any) => i.key)).toEqual(['few_images']);
    const after = await list(p.id);
    expect(after.items.map((i: any) => i.key)).toEqual(['few_images']);
    expect(after.dismissed).toEqual([expect.objectContaining({ key: 'description_short', until: null })]);
    expect((await editor(p.id)).insights.map((i: any) => i.key)).toEqual(['few_images']);
    expect((await list(q.id)).items.map((i: any) => i.key)).toEqual(['description_short', 'few_images']); // another product is unaffected
    // dismissing twice keeps one row
    expect((await c.post(`${INSIGHTS(p.id)}/description_short/dismiss`, {}, admin)).status).toBe(200);
    expect((await sql(t, `select 1 from product_insight_dismissals where product_id = $1`, [p.id]))).toHaveLength(1);

    const back = await c.post(`${INSIGHTS(p.id)}/description_short/restore`, {}, admin);
    expect(back.status).toBe(200);
    expect(back.body.data).toMatchObject({ dismissed: false });
    expect((await list(p.id)).items.map((i: any) => i.key)).toEqual(['description_short', 'few_images']);
    expect((await c.post(`${INSIGHTS(p.id)}/description_short/restore`, {}, admin)).status).toBe(200); // idempotent

    // until: hidden now, back after the moment has passed
    const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const timed = await c.post(`${INSIGHTS(p.id)}/few_images/dismiss`, { until }, admin);
    expect(timed.body.data).toMatchObject({ dismissed: true, until });
    expect((await list(p.id)).items.map((i: any) => i.key)).toEqual(['description_short']);
    await sql(t, `update product_insight_dismissals set until = now() - interval '1 minute' where product_id = $1`, [p.id]);
    const reappeared = await list(p.id);
    expect(reappeared.items.map((i: any) => i.key)).toEqual(['description_short', 'few_images']);
    expect(reappeared.dismissed).toEqual([]);
    expect((await c.post(`${INSIGHTS(p.id)}/few_images/dismiss`, { until: new Date(Date.now() - 1000).toISOString() }, admin)).status).toBe(400);
    expect((await c.post(`${INSIGHTS(p.id)}/few_images/dismiss`, { until: 'tomorrow' }, admin)).status).toBe(400);
  });

  it('an insight whose condition stopped holding disappears on its own (also from the dismissed list)', async () => {
    const lone = await makeCategory(w(), admin, uniq('Gone'));
    const p = await makeProduct(w(), admin, { categoryId: lone, description: text(20) });
    expect((await c.post(`${INSIGHTS(p.id)}/description_short/dismiss`, {}, admin)).status).toBe(200);
    expect((await save(p.id, p.version, { description: text(400) })).status).toBe(200);
    const now = await list(p.id);
    expect(now.items.map((i: any) => i.key)).toEqual(['few_images']);
    expect(now.dismissed).toEqual([]);
  });

  it('unknown keys are 404, viewers can read but not dismiss or restore, staff can, other businesses see 404', async () => {
    const p = await makeProduct(w(), admin, { categoryId: cat });
    expect((await c.post(`${INSIGHTS(p.id)}/nope/dismiss`, {}, admin)).status).toBe(404);
    expect((await c.post(`${INSIGHTS(p.id)}/nope/restore`, {}, admin)).status).toBe(404);
    expect((await c.get(INSIGHTS(p.id), viewer)).status).toBe(200);
    expect((await c.post(`${INSIGHTS(p.id)}/few_images/dismiss`, {}, viewer)).status).toBe(403);
    expect((await c.post(`${INSIGHTS(p.id)}/few_images/restore`, {}, viewer)).status).toBe(403);
    expect((await c.post(`${INSIGHTS(p.id)}/few_images/dismiss`, {}, staff)).status).toBe(200);
    expect((await c.get(INSIGHTS(p.id), rival)).status).toBe(404);
    expect((await c.post(`${INSIGHTS(p.id)}/few_images/dismiss`, {}, rival)).status).toBe(404);
    expect((await c.get(INSIGHTS('00000000-0000-4000-8000-000000000000'), admin)).status).toBe(404);
    expect((await auditRows(p.id, 'product.insight_dismissed'))).toHaveLength(1);
  });
});
