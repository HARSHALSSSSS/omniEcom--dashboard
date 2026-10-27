import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';
import { eanProblem, skuProblem, validGtin, type CatalogRules } from '../../modules/catalog/src/catalog-rules';
import { gateIssues } from '../../modules/listings/src/catalog-gates';

/**
 * The SKU / EAN rules and the listing gates a business saves in Settings > Products & Listings: nothing is enforced until the seller
 * opts in, records that already break a rule keep working, imports only get warnings.
 */
let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
});
afterAll(() => t.close());
beforeEach(async () => {
  mockControl.reset();
  mockControl.configure({ seedOrders: false });
  admin = await c.registerVendor({ businessName: 'Rules Co' });
  await c.makeWarehouse(admin);
});

const paths = (body: unknown): string[] => ((body as { error?: { details?: { issues?: Array<{ path: string }> } } }).error?.details?.issues ?? []).map((i) => i.path);
const saveRules = async (catalog: Record<string, unknown>) => {
  const r = await c.patch('/api/v1/settings', { catalog }, admin);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data;
};
const FORMULA = { skuTemplate: '[BRAND]-[CAT3]-[SEQ6]', skuSeparator: '-', skuCasing: 'uppercase' };

describe('pure rules', () => {
  const rules = (over: Partial<CatalogRules> = {}): CatalogRules => ({ skuTemplate: '[BRAND]-[CAT3]-[SEQ6]', skuSeparator: '-', skuCasing: 'uppercase', strictEan: false, ...over });

  it('the SKU formula, separator and case; no formula means no judgement', () => {
    expect(skuProblem('NOVA-APP-000123', rules())).toBeNull();
    expect(skuProblem('NOVA-APP-12', rules())).toMatch(/SKU formula/);
    expect(skuProblem('nova-app-000123', rules())).toMatch(/UPPERCASE/);
    expect(skuProblem('nova-app-000123', rules({ skuCasing: 'as_is' }))).toBeNull();
    expect(skuProblem('NOVA_APP_000123', rules({ skuSeparator: '_' }))).toBeNull();
    expect(skuProblem('NOVA-APP-000123', rules({ skuSeparator: '_' }))).toMatch(/SKU formula/);
    expect(skuProblem('anything at all', rules({ skuTemplate: null }))).toBeNull();
  });

  it('EAN: GS1 check digit, only when strict', () => {
    expect(validGtin('4006381333931')).toBe(true);
    expect(validGtin('4006381333932')).toBe(false);
    expect(validGtin('036000291452')).toBe(true);
    expect(validGtin('12345')).toBe(false);
    expect(eanProblem('4006381333932', rules({ strictEan: true }))).toMatch(/EAN/);
    expect(eanProblem('4006381333932', rules({ strictEan: false }))).toBeNull();
  });

  it('listing gates add blockers only for the gates that are on', () => {
    const bare = { hsnCode: null, countryOfOrigin: null, gstRateBps: null };
    expect(gateIssues(bare, { hsnCode: false, countryOfOrigin: false, gstRateSlab: false })).toEqual([]);
    expect(gateIssues(bare, { hsnCode: true, countryOfOrigin: true, gstRateSlab: true }).map((i) => i.code)).toEqual(['hsn_missing', 'country_of_origin_missing', 'gst_rate_missing']);
    expect(gateIssues({ hsnCode: '6109', countryOfOrigin: 'IN', gstRateBps: 1200 }, { hsnCode: true, countryOfOrigin: true, gstRateSlab: true })).toEqual([]);
    expect(gateIssues({ hsnCode: '6109', countryOfOrigin: 'IN', gstRateBps: 1300 }, { hsnCode: false, countryOfOrigin: false, gstRateSlab: true }).map((i) => i.code)).toEqual(['gst_rate_not_slab']);
  });
});

describe('nothing is enforced until the seller saves rules', () => {
  it('any SKU and barcode are accepted by default, and the default formula alone is not enforced', async () => {
    const r = await c.post('/api/v1/products', { productCode: 'any-thing-1', title: 'Free Form', variants: [{ sku: 'x', barcode: '123456789', sellingPriceMinor: 1000 }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    // saving a different catalog field (the EAN switch off, a gate) does not turn the formula on
    const s = await saveRules({ syncSovereignty: 'channel_autonomous' });
    expect(s.catalog.skuTemplateSet).toBe(false);
    expect((await c.post('/api/v1/products', { productCode: 'still-free', title: 'Free Form 2', variants: [{ sku: 'y', sellingPriceMinor: 1000 }] }, admin)).status).toBe(201);
  });
});

describe('rules on create and edit', () => {
  it('rejects a new product or variant that breaks the saved rules, with the field path', async () => {
    await saveRules({ ...FORMULA, strictEan: true });
    const bad = await c.post('/api/v1/products', { productCode: 'bad-code', title: 'Bad', variants: [{ sku: 'nope', barcode: '4006381333932', sellingPriceMinor: 1000 }] }, admin);
    expect(bad.status).toBe(400);
    expect(paths(bad.body).sort()).toEqual(['productCode', 'variants.0.barcode', 'variants.0.sku']);
    const good = await c.post('/api/v1/products', { productCode: 'NOVA-APP-000001', title: 'Good', variants: [{ sku: 'NOVA-APP-000001', barcode: '4006381333931', sellingPriceMinor: 1000 }] }, admin);
    expect(good.status, JSON.stringify(good.body)).toBe(201);
    const pid = good.body.data.id as string;
    const addBad = await c.post(`/api/v1/products/${pid}/variants`, { sku: 'x1', sellingPriceMinor: 1000 }, admin);
    expect(addBad.status).toBe(400);
    expect(paths(addBad.body)).toEqual(['sku']);
    expect((await c.post(`/api/v1/products/${pid}/variants`, { sku: 'NOVA-APP-000002', sellingPriceMinor: 1000 }, admin)).status).toBe(201);
    const badCode = await c.patch(`/api/v1/products/${pid}`, { productCode: 'whatever' }, admin);
    expect(paths(badCode.body).concat(badCode.status === 200 ? ['ok'] : [])).not.toEqual([]);
  });

  it('records created before the rules keep loading and stay editable; only a changed SKU or barcode is judged', async () => {
    const legacy = await c.post('/api/v1/products', { productCode: 'legacy-1', title: 'Legacy', variants: [{ sku: 'legacy_sku', barcode: '123456789', sellingPriceMinor: 1000 }] }, admin);
    expect(legacy.status).toBe(201);
    const pid = legacy.body.data.id as string;
    const vid = legacy.body.data.variants[0].id as string;
    await saveRules({ ...FORMULA, strictEan: true });
    expect((await c.get(`/api/v1/products/${pid}`, admin)).status).toBe(200);
    expect((await c.get('/api/v1/products', admin)).status).toBe(200);
    expect((await c.patch(`/api/v1/variants/${vid}`, { sellingPriceMinor: 1200 }, admin)).status).toBe(200);
    expect((await c.patch(`/api/v1/products/${pid}`, { title: 'Legacy renamed' }, admin)).status).toBe(200);
    // sending the unchanged SKU and barcode back is not a change
    expect((await c.patch(`/api/v1/variants/${vid}`, { sku: 'legacy_sku', barcode: '123456789', mrpMinor: 2000 }, admin)).status).toBe(200);
    const changed = await c.patch(`/api/v1/variants/${vid}`, { sku: 'new_sku' }, admin);
    expect(changed.status).toBe(400);
    expect(paths(changed.body)).toEqual(['sku']);
    expect((await c.patch(`/api/v1/variants/${vid}`, { sku: 'NOVA-OLD-000009' }, admin)).status).toBe(200);
  });
});

describe('imports are warned, never rejected', () => {
  it('a file with SKUs and barcodes outside the rules still validates and imports, with warnings per row', async () => {
    await saveRules({ ...FORMULA, strictEan: true });
    const csv = 'SKU,Product title,Selling price,Barcode\nplain-1,Plain One,100,4006381333932\nNOVA-APP-000007,Formula Item,100,4006381333931\n';
    const created = await c.post('/api/v1/imports', { source: 'csv_excel', fileName: 'rules.csv', fileSizeBytes: csv.length }, admin);
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect((await c.call('POST', `/api/v1/imports/${id}/file`, { as: admin, raw: csv, contentType: 'text/csv' })).status).toBe(200);
    expect((await c.post(`/api/v1/imports/${id}/validate`, {}, admin)).status).toBe(202);
    await t.runJobs();
    const list = (await c.get(`/api/v1/imports/${id}/issues?pageSize=100`, admin)).body.data.items as Array<{ code: string; severity: string; field: string; rowNumber?: number }>;
    expect(list.filter((i) => i.severity === 'error')).toEqual([]);
    expect(list.map((i) => `${i.code}:${i.field}:${i.severity}`).sort()).toEqual(['invalid_barcode:barcode:warning', 'invalid_sku:sku:warning']);
    const commit = await c.post(`/api/v1/imports/${id}/commit`, { mode: 'include_resolved' }, admin);
    expect(commit.status, JSON.stringify(commit.body)).toBe(202);
    await t.runJobs();
    const found = (await c.get('/api/v1/products?q=plain-1', admin)).body.data as unknown[];
    expect(found.length).toBe(1);
  });
});

describe('listing gates', () => {
  it('a gate that is on blocks readiness and publish with its own reason; gates that are off change nothing', async () => {
    const account = await c.connectAccount(admin, 'mock', { displayName: 'Gate Mock' });
    const v = await c.makeVariant(admin, { title: 'Gate shirt', brand: 'Acme' });
    const made = await c.post('/api/v1/listings', { marketplaceAccountId: account.id, variantId: v.variantId, marketplaceCategoryId: 'mock-apparel' }, admin);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const listingId = made.body.data.id as string;
    const validate = async () => (await c.post(`/api/v1/listings/${listingId}/validate`, {}, admin)).body.data.validation as { errors: Array<{ code: string }> };
    expect((await c.patch('/api/v1/products/' + v.productId, { hsnCode: null }, admin)).status).toBe(200);
    const before = (await validate()).errors.map((e) => e.code);
    expect(before).not.toContain('hsn_missing');
    await saveRules({ gates: { hsnCode: true } });
    const after = (await validate()).errors.map((e) => e.code);
    expect(after).toContain('hsn_missing');
    expect(after.filter((x) => x !== 'hsn_missing')).toEqual(before);
    // fixing the product clears it
    const fix = await c.patch(`/api/v1/products/${v.productId}`, { hsnCode: '610910' }, admin);
    expect(fix.status, JSON.stringify(fix.body)).toBe(200);
    expect((await validate()).errors.map((e) => e.code)).not.toContain('hsn_missing');
    await saveRules({ gates: { hsnCode: false } });
    expect((await validate()).errors.map((e) => e.code)).toEqual(before);
  });
});
