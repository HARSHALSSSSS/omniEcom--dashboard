import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { normalizeAttributeValue } from '../../modules/catalog/src/category-attributes';
import { computeChange } from '../../modules/product-edit/src/domain/diff';
import { makeCategory, makeProduct, sql, uniq } from '../helpers/edit-flow';

/**
 * Edit product: the "Bundle / Kit" product type end to end (create, edit, save, list filter, database guard) and the category-specific
 * attributes of "Additional attributes" (the editor read lists them with the product's values, change-impact and save take new values).
 */
let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let viewer: Actor;
let bags: string;
let apparel: string;
let capacity: { id: string };
let fabric: { id: string };
let careInstructions: { id: string };
let organic: { id: string };
let madeOn: { id: string };
const w = () => ({ t, c });
const J = (r: { body: unknown }) => JSON.stringify(r.body);
const editor = async (id: string, as = admin) => (await c.get(`/api/v1/products/${id}/edit`, as)).body.data;
const impact = (id: string, changes: Record<string, unknown>, as = admin) => c.post(`/api/v1/products/${id}/change-impact`, { changes }, as);
const save = (id: string, version: number, changes: Record<string, unknown>, extra: Record<string, unknown> = {}, as = admin) => c.post(`/api/v1/products/${id}/edit/save`, { version, changes, ...extra }, as);

async function attribute(body: Record<string, unknown>): Promise<{ id: string }> {
  const r = await c.post('/api/v1/attributes', body, admin);
  if (r.status !== 201) throw new Error(`attribute failed: ${J(r)}`);
  return r.body.data;
}

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  admin = await c.registerVendor({ businessName: 'Bundle Attr Co' });
  viewer = await c.addMember(admin, 'vendor_viewer');
  bags = await makeCategory(w(), admin, 'Bags & Luggage');
  apparel = await makeCategory(w(), admin, 'Apparel & Fashion');
  capacity = await attribute({ code: 'capacity_l', name: 'Capacity (Volume)', dataType: 'number', unit: 'L' });
  fabric = await attribute({ code: 'fabric_composition', name: 'Fabric composition', dataType: 'text' });
  careInstructions = await attribute({ code: 'care', name: 'Care instructions', dataType: 'enum', values: [{ value: 'machine_wash', label: 'Machine wash' }, { value: 'dry_clean', label: 'Dry clean only' }] });
  organic = await attribute({ code: 'organic', name: 'Organic', dataType: 'boolean' });
  madeOn = await attribute({ code: 'made_on', name: 'Made on', dataType: 'date' });
  const bagSet = await c.put(`/api/v1/categories/${bags}/attributes`, { items: [{ attributeId: capacity.id }, { attributeId: organic.id }] }, admin);
  expect(bagSet.status, J(bagSet)).toBe(200);
  const apparelSet = await c.put(`/api/v1/categories/${apparel}/attributes`, { items: [{ attributeId: fabric.id, isRequired: true }, { attributeId: careInstructions.id }, { attributeId: madeOn.id }] }, admin);
  expect(apparelSet.status, J(apparelSet)).toBe(200);
}, 180_000);
afterAll(() => t.close());

describe('Bundle / Kit product type', () => {
  it('is accepted on create, shown by the editor and the detail, and filterable in the list', async () => {
    const made = await makeProduct(w(), admin, { categoryId: bags, extra: { productType: 'bundle' } });
    const detail = (await c.get(`/api/v1/products/${made.id}`, admin)).body.data;
    expect(detail.productType).toBe('bundle');
    expect((await editor(made.id)).product.productType).toBe('bundle');
    const list = await c.get('/api/v1/products/catalog?filter[productType]=bundle', admin);
    expect(list.status, J(list)).toBe(200);
    expect(list.body.data.items.map((p: { id: string }) => p.id)).toContain(made.id);
    expect(list.body.data.items.every((p: { productType: string }) => p.productType === 'bundle')).toBe(true);
  });

  it('the creation flow takes it too, and the form options offer all four types', async () => {
    const draft = await c.post('/api/v1/products/drafts', { title: 'Starter kit', productType: 'bundle' }, admin);
    expect(draft.status, J(draft)).toBe(201);
    expect(draft.body.data.product.productType).toBe('bundle');
    const options = await c.get('/api/v1/products/form-options', admin);
    expect(options.body.data.productTypes).toEqual(['physical', 'digital', 'service', 'bundle']);
  });

  it('an edit can switch a product to bundle and back; Service / Warranty is the service type', async () => {
    const made = await makeProduct(w(), admin, { categoryId: bags });
    const d = await impact(made.id, { productType: 'bundle' });
    expect(d.status, J(d)).toBe(200);
    expect(d.body.data).toMatchObject({ hasChanges: true, summary: 'Product type changed', items: [{ field: 'productType', label: 'Product type' }], errors: [] });
    const toBundle = await save(made.id, made.version, { productType: 'bundle' });
    expect(toBundle.status, J(toBundle)).toBe(200);
    expect(toBundle.body.data.product.productType).toBe('bundle');
    const toService = await save(made.id, toBundle.body.data.version, { productType: 'service' });
    expect(toService.body.data.product.productType).toBe('service');
    expect((await save(made.id, toService.body.data.version, { productType: 'service' })).body.data).toMatchObject({ saved: false, noChanges: true });
    const bad = await save(made.id, toService.body.data.version, { productType: 'kit' });
    expect(bad.status).toBe(400);
  });

  it('computeChange sees physical -> bundle as a product type change (listings inherit it)', () => {
    const row = { id: 'p', status: 'active', productCode: 'X', title: 'Kit title here', attributes: { productType: 'physical' }, customAttributes: [], tags: [], version: 1 } as never;
    const r = computeChange(row, { productType: 'bundle' });
    expect(r.items.map((i) => i.field)).toEqual(['productType']);
    expect(r.contentFields).toEqual(['productType']);
    expect(computeChange(row, { productType: 'physical' }).items).toEqual([]);
  });

  it('the database refuses a value outside the four types (products_type_chk)', async () => {
    const made = await makeProduct(w(), admin, {});
    await expect(sql(t, `update products set attributes = '{"productType":"kit"}'::jsonb where id = $1`, [made.id])).rejects.toThrow(/products_type_chk/);
    await sql(t, `update products set attributes = '{"productType":"bundle"}'::jsonb where id = $1`, [made.id]);
    expect((await editor(made.id)).product.productType).toBe('bundle');
  });
});

describe('category attributes in the editor', () => {
  it('the editor read lists the attributes of the product category with its values, and counts them as configured', async () => {
    const made = await makeProduct(w(), admin, { categoryId: apparel });
    const before = await editor(made.id);
    expect(before.product.categoryAttributes.map((a: { name: string }) => a.name)).toEqual(['Fabric composition', 'Care instructions', 'Made on']);
    expect(before.product.categoryAttributes[0]).toMatchObject({ attributeId: fabric.id, dataType: 'text', isRequired: true, value: null });
    expect(before.product.categoryAttributes[1].options).toEqual([{ value: 'machine_wash', label: 'Machine wash' }, { value: 'dry_clean', label: 'Dry clean only' }]);
    expect(before.attributes.categorySlots).toEqual([
      { attributeId: fabric.id, label: 'Fabric composition', supplied: false, isRequired: true },
      { attributeId: careInstructions.id, label: 'Care instructions', supplied: false, isRequired: false },
      { attributeId: madeOn.id, label: 'Made on', supplied: false, isRequired: false },
    ]);

    const saved = await save(made.id, made.version, { categoryAttributes: [{ attributeId: fabric.id, value: '100% Cotton' }, { attributeId: careInstructions.id, value: 'machine_wash' }] });
    expect(saved.status, J(saved)).toBe(200);
    expect(saved.body.data.product.categoryAttributes.map((a: { value: unknown }) => a.value)).toEqual(['100% Cotton', 'machine_wash', null]);
    const after = await editor(made.id);
    expect(after.attributes.categorySlots.map((s: { supplied: boolean }) => s.supplied)).toEqual([true, true, false]);
    expect(after.attributes.configured).toBe(before.attributes.configured + 2);
    expect(after.version).toBe(made.version + 1);
  });

  it('a product without category attributes (or without a category) has an empty list', async () => {
    const none = await makeProduct(w(), admin, { status: 'draft', categoryId: null });
    expect((await editor(none.id)).product.categoryAttributes).toEqual([]);
    const plain = await makeProduct(w(), admin, { categoryId: await makeCategory(w(), admin, uniq('Plain')) });
    const e = await editor(plain.id);
    expect(e.product.categoryAttributes).toEqual([]);
    expect(e.attributes.categorySlots).toEqual([]);
  });

  it('change-impact previews the attribute change like any other field, and values equal to the stored ones are no change', async () => {
    const made = await makeProduct(w(), admin, { categoryId: bags });
    const d = await impact(made.id, { categoryAttributes: [{ attributeId: capacity.id, value: '35' }] });
    expect(d.status, J(d)).toBe(200);
    expect(d.body.data).toMatchObject({ hasChanges: true, summary: 'Category attributes changed', items: [{ field: 'categoryAttributes', label: 'Category attributes' }], errors: [] });
    const first = await save(made.id, made.version, { categoryAttributes: [{ attributeId: capacity.id, value: 35 }, { attributeId: organic.id, value: true }] });
    expect(first.status, J(first)).toBe(200);
    expect(first.body.data.product.categoryAttributes.map((a: { value: unknown }) => a.value)).toEqual([35, true]);
    // the same values again: nothing to save
    const again = await impact(made.id, { categoryAttributes: [{ attributeId: capacity.id, value: '35' }, { attributeId: organic.id, value: 'true' }] });
    expect(again.body.data).toMatchObject({ hasChanges: false, items: [] });
    expect((await save(made.id, first.body.data.version, { categoryAttributes: [{ attributeId: capacity.id, value: 35 }] })).body.data).toMatchObject({ saved: false, noChanges: true });
  });

  it('an empty value clears the attribute', async () => {
    const made = await makeProduct(w(), admin, { categoryId: bags });
    const set = await save(made.id, made.version, { categoryAttributes: [{ attributeId: capacity.id, value: 22 }] });
    expect(set.body.data.product.categoryAttributes[0].value).toBe(22);
    const cleared = await save(made.id, set.body.data.version, { categoryAttributes: [{ attributeId: capacity.id, value: '' }] });
    expect(cleared.status, J(cleared)).toBe(200);
    expect(cleared.body.data.product.categoryAttributes[0].value).toBeNull();
  });

  it('rejects values of the wrong type, enum values that are not allowed and attributes of another category (400 VALIDATION_FAILED, nothing saved)', async () => {
    const made = await makeProduct(w(), admin, { categoryId: apparel });
    const cases: Array<[unknown, string]> = [
      [{ attributeId: careInstructions.id, value: 'tumble' }, 'invalid_attribute_value'],
      [{ attributeId: madeOn.id, value: '31/12/2026' }, 'invalid_attribute_value'],
      [{ attributeId: capacity.id, value: 10 }, 'attribute_not_in_category'],
    ];
    for (const [entry, code] of cases) {
      const r = await save(made.id, made.version, { categoryAttributes: [entry] });
      expect(r.status, J(r)).toBe(400);
      expect(r.body.error.details.issues.map((i: { code: string }) => i.code)).toContain(code);
      const preview = await impact(made.id, { categoryAttributes: [entry] });
      expect(preview.body.data.errors.map((e: { code: string }) => e.code)).toContain(code);
    }
    const dup = await save(made.id, made.version, { categoryAttributes: [{ attributeId: fabric.id, value: 'a' }, { attributeId: fabric.id, value: 'b' }] });
    expect(dup.status).toBe(400);
    expect((await editor(made.id)).version).toBe(made.version);
  });

  it('a category change swaps the list: values are validated against the NEW category, in the same save', async () => {
    const made = await makeProduct(w(), admin, { categoryId: apparel });
    const wrong = await save(made.id, made.version, { categoryId: bags, categoryAttributes: [{ attributeId: fabric.id, value: 'wool' }] });
    expect(wrong.status).toBe(400);
    const ok = await save(made.id, made.version, { categoryId: bags, categoryAttributes: [{ attributeId: capacity.id, value: 28 }] });
    expect(ok.status, J(ok)).toBe(200);
    expect(ok.body.data.product.categoryAttributes.map((a: { name: string; value: unknown }) => [a.name, a.value])).toEqual([['Capacity (Volume)', 28], ['Organic', null]]);
  });

  it('a viewer sees the attributes but cannot save them', async () => {
    const made = await makeProduct(w(), admin, { categoryId: bags });
    expect((await editor(made.id, viewer)).product.categoryAttributes).toHaveLength(2);
    const r = await save(made.id, made.version, { categoryAttributes: [{ attributeId: capacity.id, value: 5 }] }, {}, viewer);
    expect(r.status).toBe(403);
  });

  it('records the change in the audit trail with attribute names', async () => {
    const made = await makeProduct(w(), admin, { categoryId: bags });
    expect((await save(made.id, made.version, { categoryAttributes: [{ attributeId: capacity.id, value: 40 }] })).status).toBe(200);
    const rows = await sql<{ metadata: { fields: string[] }; after: { categoryAttributes: Record<string, unknown> } }>(t, `select metadata, after from audit_logs where resource_type = 'product' and resource_id = $1 and action = 'product.edited'`, [made.id]);
    expect(rows[0]!.metadata.fields).toEqual(['categoryAttributes']);
    expect(rows[0]!.after.categoryAttributes).toEqual({ 'Capacity (Volume)': 40 });
  });
});

describe('normalizeAttributeValue', () => {
  const field = (dataType: 'text' | 'number' | 'boolean' | 'date' | 'enum', options: Array<{ value: string; label: string }> = []) => ({ name: 'A', dataType, options });
  it('types the value like the attribute or says why not', () => {
    expect(normalizeAttributeValue(field('number'), ' 12.5 ')).toEqual({ value: 12.5 });
    expect(normalizeAttributeValue(field('number'), 'abc').problem).toBeTruthy();
    expect(normalizeAttributeValue(field('boolean'), 'false')).toEqual({ value: false });
    expect(normalizeAttributeValue(field('boolean'), 'maybe').problem).toBeTruthy();
    expect(normalizeAttributeValue(field('date'), '31/12/2026').problem).toBeTruthy();
    expect(normalizeAttributeValue(field('date'), '2026-02-20')).toEqual({ value: '2026-02-20' });
    expect(normalizeAttributeValue(field('text'), '  a   b ')).toEqual({ value: 'a b' });
    expect(normalizeAttributeValue(field('enum', [{ value: 'x', label: 'X' }]), 'x')).toEqual({ value: 'x' });
    expect(normalizeAttributeValue(field('enum', [{ value: 'x', label: 'X' }]), 'y').problem).toContain('one of: x');
    expect(normalizeAttributeValue(field('text'), '   ')).toEqual({ value: null });
    expect(normalizeAttributeValue(field('number'), null)).toEqual({ value: null });
  });
});
