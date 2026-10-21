import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { png } from '../helpers/image-fixtures';

/**
 * The six Figma screens of "Product creation flow" replayed against the real API, in design order, with the exact numbers and
 * wording of the designs. If this file fails, the backend and the design have drifted apart.
 */
let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
const J = (r: { body: unknown }) => JSON.stringify(r.body);
const item = (r: any, key: string) => [...r.required, ...r.recommended].find((i: any) => i.key === key);

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  admin = await c.registerVendor({ businessName: 'Nova Living' });
}, 120_000);
afterAll(() => t.close());

describe('Product creation flow (Figma screens 1-6)', () => {
  let categoryId: string;
  let productId: string;
  let version: number;

  it('Screen 1: the draft starts at 38% with one blocker, SKU to verify and brand to confirm', async () => {
    categoryId = (await c.post('/api/v1/categories', { name: 'Travel Accessories' }, admin)).body.data.id;
    const r = await c.post('/api/v1/products/drafts', { title: 'Premium Travel Bag', productType: 'physical', categoryId, brand: 'Urban Carry', productCode: 'TRV-1042' }, admin);
    expect(r.status, J(r)).toBe(201);
    productId = r.body.data.product.id;
    version = r.body.data.creation.version;
    expect(r.body.data.creation).toMatchObject({ currentStep: 'basic', codeIsPlaceholder: false });

    const rd = (await c.get(`/api/v1/products/${productId}/creation-readiness`, admin)).body.data;
    expect(rd.percent).toBe(38); // 3 of 8 items done (name, category, product type)
    expect(item(rd, 'product_name').state).toBe('done');
    expect(item(rd, 'category').state).toBe('done');
    expect(item(rd, 'product_type').state).toBe('done');
    expect(item(rd, 'primary_image').state).toBe('pending');
    expect(item(rd, 'master_sku').state).toBe('verify'); // tag "Verify"
    expect(item(rd, 'brand').state).toBe('confirm'); // tag "Confirm"
    expect(item(rd, 'description').state).toBe('pending');
    expect(item(rd, 'attributes').state).toBe('pending');
    expect(rd.required.map((i: any) => i.key)).toEqual(['product_name', 'category', 'product_type', 'primary_image', 'master_sku']);
    expect(rd.recommended.map((i: any) => i.key)).toEqual(['description', 'brand', 'attributes']);
    expect(rd.blockers).toHaveLength(1); // "1 issue blocking publication"
    expect(rd.blockers[0]).toMatchObject({ key: 'primary_image', fixTarget: 'primary_image' });
    expect(rd.blockers[0].message).toBe('Add a primary image before publishing this product to marketplaces.');
    expect(rd.chain).toEqual(['Product', 'Variants', 'Inventory', 'Listings', 'Channels']);
    expect(Array.isArray(rd.channels)).toBe(true);
  });

  it('Screen 2: more product information (dimensions in cm, weight in kg, GST, HSN, custom attribute)', async () => {
    const r = await c.patch(`/api/v1/products/${productId}/draft`, {
      version, material: 'Canvas', countryOfOrigin: 'IN', gstRateBps: 1800, hsnCode: '4202', standardCategory: 'Bags',
      dimensions: { length: 50, width: 30, height: 25, unit: 'cm' }, weight: { value: 1.2, unit: 'kg' },
      customAttributes: [{ name: 'Collection', value: 'Travel 2026' }],
    }, admin);
    expect(r.status, J(r)).toBe(200);
    const p = r.body.data.product;
    expect(p).toMatchObject({ dimensionsMm: { length: 500, width: 300, height: 250 }, weightGrams: 1200, material: 'Canvas', countryOfOrigin: 'IN', gstRateBps: 1800, hsnCode: '4202' });
    expect(p.dimensions).toMatchObject({ length: 50, width: 30, height: 25, unit: 'cm' });
    expect(p.weight).toMatchObject({ value: 1.2, unit: 'kg' });
    expect(p.customAttributes).toEqual([{ name: 'Collection', value: 'Travel 2026', confirmed: false }]);
    version = r.body.data.creation.version;
    const opts = (await c.get('/api/v1/products/form-options', admin)).body.data;
    expect(opts.countries[0].code).toBe('IN');
    expect(opts.gstSlabs.map((s: any) => s.bps)).toEqual([0, 500, 1200, 1800, 2800]);
  });

  it('Screen 3: AI suggestion preview is the designed sentence, not applied until the seller applies it', async () => {
    const s = await c.post(`/api/v1/products/${productId}/ai/description`, { mode: 'concise' }, admin);
    expect(s.status, J(s)).toBe(201);
    expect(s.body.data).toMatchObject({ mode: 'concise', status: 'suggested', applied: false });
    expect(s.body.data.text).toBe('Explore the Premium Travel Bag in our Travel Accessories collection. Review the product details to find out whether it suits your travel needs.');
    expect((await c.get(`/api/v1/products/${productId}`, admin)).body.data.description).toBeNull(); // "Preview . Not applied"

    const benefits = await c.post(`/api/v1/products/${productId}/ai/description`, { mode: 'benefits' }, admin);
    expect(benefits.body.data.text).toContain('Material: Canvas'); // only facts that exist on the product
    expect(benefits.body.data.text).not.toMatch(/waterproof|durable|premium leather/i);

    const dismiss = await c.post(`/api/v1/products/${productId}/ai/description/${benefits.body.data.id}/dismiss`, {}, admin);
    expect(dismiss.body.data.status).toBe('dismissed');
    const cur = (await c.get(`/api/v1/products/${productId}`, admin)).body.data;
    const applied = await c.post(`/api/v1/products/${productId}/ai/description/${s.body.data.id}/apply`, { version: cur.version }, admin);
    expect(applied.status, J(applied)).toBe(200);
    expect((await c.get(`/api/v1/products/${productId}`, admin)).body.data.description).toBe(s.body.data.text);
    version = (await c.get(`/api/v1/products/${productId}/creation`, admin)).body.data.creation.version;
  });

  it('Screen 4: primary image uploading, then ready; readiness follows', async () => {
    const reg = await c.post(`/api/v1/products/${productId}/documents`, { fileName: 'premium-travel-bag.png', mimeType: 'image/png', sizeBytes: 5000, purpose: 'product_image' }, admin);
    expect(reg.status, J(reg)).toBe(201);
    const during = (await c.get(`/api/v1/products/${productId}/creation-readiness`, admin)).body.data;
    expect(item(during, 'primary_image').state).toBe('uploading'); // tag "Uploading"
    expect(during.blockers.find((b: any) => b.key === 'primary_image').message).toBe('Primary image is uploading. Publication stays blocked until the upload completes.');
    expect((await c.get(`/api/v1/products/${productId}/primary-image`, admin)).body.data.state).toBe('uploading');

    const up = await c.call('POST', reg.body.data.upload.url, { as: admin, raw: png(600, 600), contentType: 'image/png' });
    expect(up.status, J(up)).toBeLessThan(300);
    const after = (await c.get(`/api/v1/products/${productId}/creation-readiness`, admin)).body.data;
    expect(item(after, 'primary_image').state).toBe('done');
    expect(after.blockers.find((b: any) => b.key === 'primary_image')).toBeUndefined();
    expect((await c.get(`/api/v1/products/${productId}/primary-image`, admin)).body.data.state).toBe('ready');
  });

  it('Screen 5: a duplicate Master SKU is reported before and after saving, and drafts can still be saved', async () => {
    const check = (await c.get('/api/v1/products/sku-check?code=trv-1042', admin)).body.data;
    expect(check).toMatchObject({ available: false, valid: true });
    expect(check.conflict).toMatchObject({ type: 'product', id: productId, title: 'Premium Travel Bag' });
    expect(check.suggestion).toBeTruthy();

    const second = (await c.post('/api/v1/products/drafts', { title: 'Premium Travel Bag copy' }, admin)).body.data;
    expect(second.creation.codeIsPlaceholder).toBe(true); // a draft needs only a title
    expect(second.product.productCode).toMatch(/^DRAFT-[A-Z0-9]{8}$/);

    const dup = await c.patch(`/api/v1/products/${second.product.id}/draft`, { version: second.creation.version, productCode: 'TRV-1042' }, admin);
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toMatchObject({ rule: 'duplicate_product_code', field: 'productCode' });

    const preview = (await c.post('/api/v1/products/creation-readiness', { productId: second.product.id, values: { title: 'Premium Travel Bag', categoryId, productType: 'physical', productCode: 'TRV-1042' } }, admin)).body.data;
    expect(item(preview, 'master_sku').state).toBe('duplicate'); // tag "Duplicate"
    expect(preview.blockers.map((b: any) => b.key).sort()).toEqual(['master_sku', 'primary_image']); // "2 issues blocking publication"

    // Continue is blocked by the duplicate, but the rest of the draft is saved ("Draft saving is available even when this step needs a correction")
    const cont = await c.post(`/api/v1/products/${second.product.id}/creation/continue`, { step: 'basic', version: second.creation.version, values: { title: 'Premium Travel Bag copy 2', categoryId, productCode: 'TRV-1042' } }, admin);
    expect(cont.status, J(cont)).toBe(422);
    expect(JSON.stringify(cont.body.error.details.errors)).toContain('productCode');
    const saved = (await c.get(`/api/v1/products/${second.product.id}/creation`, admin)).body.data;
    expect(saved.product.title).toBe('Premium Travel Bag copy 2');
    expect(saved.creation.currentStep).toBe('basic');

    // Screen 6 ("Save changes before leaving?"): Discard changes -> the draft can be thrown away
    const discard = await c.del(`/api/v1/products/${second.product.id}/draft`, admin);
    expect(discard.status, J(discard)).toBe(200);
    expect((await c.get(`/api/v1/products/${second.product.id}/creation`, admin)).status).toBe(404);
  });

  it('Continue validates only the Basic information step and moves the wizard to Variants', async () => {
    const v = await c.post(`/api/v1/products/${productId}/validate-step`, { step: 'basic' }, admin);
    expect(v.status, J(v)).toBe(200);
    expect(v.body.data.valid).toBe(true);
    const cont = await c.post(`/api/v1/products/${productId}/creation/continue`, { step: 'basic', version }, admin);
    expect(cont.status, J(cont)).toBe(200);
    expect(cont.body.data.creation).toMatchObject({ currentStep: 'variants', completedSteps: ['basic'] });
    const rd = cont.body.data.readiness;
    expect(item(rd, 'master_sku').state).toBe('done'); // verified by the step validation
    expect(item(rd, 'brand').state).toBe('confirm'); // still unconfirmed
    const brand = (await c.get('/api/v1/brands?q=urban', admin)).body.data[0];
    const conf = await c.post(`/api/v1/brands/${brand.id}/confirm`, {}, admin);
    expect(conf.status, J(conf)).toBe(200);
    expect(item((await c.get(`/api/v1/products/${productId}/creation-readiness`, admin)).body.data, 'brand').state).toBe('done');
    // 4 required + description + brand + attributes: everything is done now
    expect((await c.get(`/api/v1/products/${productId}/creation-readiness`, admin)).body.data.percent).toBe(100);
  });

  it('Drafts list shows unfinished drafts for resuming', async () => {
    const d = await c.post('/api/v1/products/drafts', { title: 'Half done bag' }, admin);
    const list = await c.get('/api/v1/products/drafts', admin);
    expect(list.status, J(list)).toBe(200);
    expect(list.body.data.items.map((x: any) => x.id)).toContain(d.body.data.product.id);
    expect(list.body.data.items[0]).toHaveProperty('readinessPercent');
  });
});
