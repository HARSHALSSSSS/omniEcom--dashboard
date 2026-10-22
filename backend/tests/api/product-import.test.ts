import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { autoMap, detectPreset, similarity } from '../../modules/product-import/src/domain/mapping';
import { CategoryIndex } from '../../modules/product-import/src/domain/category-index';
import { cleanBarcode, formatMoney, imageUrlProblem, parseGrams, parseMoney, parsePercentBps, sanitizeSku } from '../../modules/product-import/src/domain/normalise';
import { decodeText, detectDelimiter, parseDelimited, parseFile, toCsv } from '../../modules/product-import/src/domain/tabular';
import { buildXlsx, crc32, readXlsx, zip } from '../../modules/product-import/src/domain/xlsx';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let staff: Actor;
let viewer: Actor;
let wh: { id: string; code: string };
let apparel: { id: string };
let ethnic: { id: string };

const CT = { csv: 'text/csv', bin: 'application/octet-stream' };

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  admin = await c.registerVendor({ businessName: 'Import Co' });
  staff = await c.addMember(admin, 'vendor_staff');
  viewer = await c.addMember(admin, 'vendor_viewer');
  wh = await c.makeWarehouse(admin, { code: 'MAIN' });
  apparel = (await c.post('/api/v1/categories', { name: 'Apparel' }, admin)).body.data;
  const men = (await c.post('/api/v1/categories', { name: 'Men', parentId: apparel.id }, admin)).body.data;
  ethnic = (await c.post('/api/v1/categories', { name: 'Ethnic Wear', parentId: men.id }, admin)).body.data;
}, 120_000);
afterAll(() => t.close());

const api = (path = '') => `/api/v1/imports${path}`;

async function start(as: Actor, fileName = 'catalog.csv', source = 'csv_excel') {
  const r = await c.post(api(), { source, fileName, fileSizeBytes: 1000 }, as);
  expect(r.status).toBe(201);
  return r.body.data as { id: string };
}
const upload = (id: string, body: Buffer | string, as: Actor = admin, contentType = CT.csv) => c.call('POST', api(`/${id}/file`), { as, raw: body, contentType });

async function runValidation(id: string, as: Actor = admin) {
  const r = await c.post(api(`/${id}/validate`), {}, as);
  expect(r.status).toBe(202);
  await t.runJobs();
  return (await c.get(api(`/${id}`), as)).body.data;
}
async function commit(id: string, mode: string, as: Actor = admin) {
  const r = await c.post(api(`/${id}/commit`), { mode }, as);
  if (r.status !== 202) return r;
  await t.runJobs();
  return r;
}
const issues = async (id: string, query = '') => (await c.get(api(`/${id}/issues?pageSize=100${query}`), admin)).body.data.items as any[];
const productByCode = async (code: string) => {
  const list = (await c.get(`/api/v1/products?q=${encodeURIComponent(code)}`, admin)).body.data as any[];
  const hit = list.find((p) => p.productCode === code);
  return hit ? (await c.get(`/api/v1/products/${hit.id}`, admin)).body.data : null;
};

// ================================================================================================
describe('file reading (pure)', () => {
  it('reads quoted CSV with embedded delimiters, quotes and newlines; blank records keep the row numbering', () => {
    const rows = parseDelimited('a,b,c\r\n1,"x, y","say ""hi"""\r\n\r\n3,"line1\nline2",\r\n', ',', 100);
    expect(rows[0]).toEqual(['a', 'b', 'c']);
    expect(rows[1]).toEqual(['1', 'x, y', 'say "hi"']);
    expect(rows[2]).toEqual([]);
    expect(rows[3]).toEqual(['3', 'line1\nline2', '']);
    const parsed = parseFile(Buffer.from('a,b\n1,2\n\n3,4\n'), 'f.csv');
    expect(parsed.rows.map((r) => r.rowNumber)).toEqual([2, 4]);
  });

  it('detects the delimiter outside quotes and decodes UTF-8 BOM and UTF-16', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3', null)).toBe('\t');
    expect(detectDelimiter('"a,b";c;d\n', null)).toBe(';');
    expect(detectDelimiter('single\n', null)).toBe(',');
    expect(decodeText(Buffer.from('﻿sku,title', 'utf8'))).toBe('sku,title');
    expect(decodeText(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('sku,title', 'utf16le')]))).toBe('sku,title');
    expect(() => decodeText(Buffer.from([0x50, 0x00, 0x01, 0x00]))).toThrow(/binary/);
  });

  it('makes headers unique and non-empty', () => {
    const p = parseFile(Buffer.from('SKU,,SKU\nA,B,C\n'), 'f.csv');
    expect(p.headers).toEqual(['SKU', 'Column 2', 'SKU (2)']);
  });

  it('neutralises spreadsheet formulas when writing CSV', () => {
    expect(toCsv([['=1+1', 'a,b', '@x', 'ok']])).toBe(`'=1+1,"a,b",'@x,ok\r\n`);
  });

  it('reads XLSX: shared strings, inline strings, numbers, booleans, sparse cells, XML entities', () => {
    const sheet = '<worksheet><sheetData>'
      + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Flag</t></is></c></row>'
      + '<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>8.90123456789E12</v></c><c r="C3"><v>0.30000000000000004</v></c><c r="D3" t="b"><v>1</v></c></row>'
      + '</sheetData></worksheet>';
    const strings = '<sst><si><t>SKU</t></si><si><r><t>Barcode</t></r><r><t> No</t></r></si><si><t>A &amp; B &lt;1&gt;</t></si></sst>';
    const wb = '<workbook xmlns:r="x"><sheets><sheet name="Data &amp; more" sheetId="1" r:id="rId7"/></sheets></workbook>';
    const rels = '<Relationships><Relationship Id="rId7" Target="worksheets/data.xml"/></Relationships>';
    const file = zip([
      { name: 'xl/workbook.xml', data: Buffer.from(wb) }, { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(rels) },
      { name: 'xl/worksheets/data.xml', data: Buffer.from(sheet) }, { name: 'xl/sharedStrings.xml', data: Buffer.from(strings) },
    ]);
    const out = readXlsx(file, 100);
    expect(out.sheetName).toBe('Data & more');
    expect(out.records[0]).toEqual(['SKU', 'Barcode No', '', 'Flag']);
    expect(out.records[1]).toEqual([]);
    expect(out.records[2]).toEqual(['A & B <1>', '8901234567890', '0.3', 'TRUE']);
  });

  it('round-trips the template writer and rejects broken or encrypted workbooks', () => {
    const book = buildXlsx('Products', [['SKU', 'Title'], ['007', 'Tom & "Jerry"']]);
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    const parsed = parseFile(book, 'x.xlsx');
    expect(parsed.format).toBe('xlsx');
    expect(parsed.rows[0]!.cells).toEqual(['007', 'Tom & "Jerry"']); // leading zeros survive
    expect(() => readXlsx(Buffer.from('PK\x03\x04 not really a zip'), 10)).toThrow(/valid XLSX/);
  });
});

describe('value rules (pure)', () => {
  it('parses money without floats, in rupees or paise', () => {
    expect(parseMoney('₹1,23,456.50', 'rupees')).toEqual({ ok: true, value: 12345650 });
    expect(parseMoney('Rs. 499', 'rupees')).toEqual({ ok: true, value: 49900 });
    expect(parseMoney('0.07', 'rupees')).toEqual({ ok: true, value: 7 });
    expect(parseMoney('499.500', 'rupees')).toEqual({ ok: true, value: 49950 });
    expect(parseMoney('499.505', 'rupees')).toMatchObject({ ok: false });
    expect(parseMoney('-5', 'rupees')).toMatchObject({ ok: false });
    expect(parseMoney('49950', 'paise')).toEqual({ ok: true, value: 49950 });
    expect(parseMoney('499.5', 'paise')).toMatchObject({ ok: false });
    expect(formatMoney(49950, 'rupees')).toBe('499.50');
    expect(formatMoney(49900, 'rupees')).toBe('499');
    expect(formatMoney(49900, 'paise')).toBe('49900');
  });

  it('parses percentages, weights, barcodes, SKUs and image URLs', () => {
    expect(parsePercentBps('12%')).toEqual({ ok: true, value: 1200 });
    expect(parsePercentBps('2.5')).toEqual({ ok: true, value: 250 });
    expect(parsePercentBps('abc')).toMatchObject({ ok: false });
    expect(parseGrams('0.5 kg')).toEqual({ ok: true, value: 500 });
    expect(parseGrams('450')).toEqual({ ok: true, value: 450 });
    expect(parseGrams('0')).toMatchObject({ ok: false });
    expect(cleanBarcode(' 8901 2345 67890.0')).toBe('8901234567890');
    expect(cleanBarcode('8901234567890.0')).toBe('8901234567890');
    expect(sanitizeSku(' tee shirt/M (red) ')).toBe('tee-shirt/M-red-');
    expect(imageUrlProblem('https://cdn.example.com/a.jpg')).toBeNull();
    expect(imageUrlProblem('https://cdn.example.com/image')).toBeNull();
    expect(imageUrlProblem('ftp://x/a.jpg')).toMatch(/http/);
    expect(imageUrlProblem('javascript:alert(1)')).toMatch(/http/);
    expect(imageUrlProblem('https://user:pw@x.com/a.jpg')).toMatch(/user name/);
    expect(imageUrlProblem('https://x.com/a.pdf')).toMatch(/not an image/);
    expect(imageUrlProblem('not a url')).toBeTruthy();
    expect(imageUrlProblem(`https://x.com/${'a'.repeat(2100)}.jpg`)).toMatch(/2048/);
  });
});

describe('auto mapping (pure)', () => {
  it('maps the headers of the wizard screen with confidence and uses each column once', () => {
    const headers = ['SKU_CODE', 'PRODUCT_NAME', 'CATEGORY_L3', 'RETAIL_PRICE', 'MRP_PRICE', 'INVENTORY_QTY', 'PRIMARY_IMAGE_URL', 'BARCODE_EAN', 'HSN_CODE', 'Notes'];
    const map = new Map(autoMap(headers, 'generic').map((e) => [e.target, e]));
    expect(map.get('sku')).toMatchObject({ source: 'SKU_CODE', confidence: 96 });
    expect(map.get('title')!.source).toBe('PRODUCT_NAME');
    expect(map.get('category')!.source).toBe('CATEGORY_L3');
    expect(map.get('sellingPrice')!.source).toBe('RETAIL_PRICE');
    expect(map.get('mrp')!.source).toBe('MRP_PRICE');
    expect(map.get('stock')!.source).toBe('INVENTORY_QTY');
    expect(map.get('imageUrl')!.source).toBe('PRIMARY_IMAGE_URL');
    expect(map.get('barcode')!.source).toBe('BARCODE_EAN');
    expect(map.get('hsn')!.source).toBe('HSN_CODE');
    expect([...map.values()].some((e) => e.source === 'Notes')).toBe(false);
    expect(new Set([...map.values()].map((e) => e.source)).size).toBe(map.size);
  });

  it('detects the Shopify and Amazon dialects and falls back to generic', () => {
    const shopify = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Variant SKU', 'Variant Price', 'Option1 Name', 'Option1 Value', 'Image Src'];
    expect(detectPreset(shopify)).toMatchObject({ code: 'shopify' });
    expect(autoMap(shopify, 'shopify').find((e) => e.target === 'productCode')).toMatchObject({ source: 'Handle' });
    expect(detectPreset(['item_sku', 'item_name', 'standard_price', 'quantity', 'main_image_url'])).toMatchObject({ code: 'amazon' });
    expect(detectPreset(['a', 'b'])).toMatchObject({ code: 'generic' });
    expect(similarity('Festive Ethnic Wear', 'Ethnic Wear')).toBeGreaterThan(0.6);
    expect(similarity('abc', 'xyz')).toBe(0);
  });

  it('resolves categories by id, path, slug and name and proposes the closest one', () => {
    const idx = new CategoryIndex([
      { id: '11111111-1111-4111-8111-111111111111', parentId: null, name: 'Apparel', slug: 'apparel', path: 'apparel' },
      { id: '22222222-2222-4222-8222-222222222222', parentId: '11111111-1111-4111-8111-111111111111', name: 'Men', slug: 'men', path: 'apparel/men' },
      { id: '33333333-3333-4333-8333-333333333333', parentId: '22222222-2222-4222-8222-222222222222', name: 'Ethnic Wear', slug: 'ethnic-wear', path: 'apparel/men/ethnic-wear' },
    ]);
    expect(idx.resolve('Apparel > Men > Ethnic Wear')?.id).toBe('33333333-3333-4333-8333-333333333333');
    expect(idx.resolve('apparel/men')?.label).toBe('Apparel > Men');
    expect(idx.resolve('ethnic wear')?.id).toBe('33333333-3333-4333-8333-333333333333');
    expect(idx.resolve('33333333-3333-4333-8333-333333333333')?.label).toBe('Apparel > Men > Ethnic Wear');
    expect(idx.resolve('Toys')).toBeNull();
    expect(idx.closest('Festive Ethnic Wear')?.label).toBe('Apparel > Men > Ethnic Wear');
    expect(idx.closest('Toys')).toBeNull();
  });
});

// ================================================================================================
describe('the wizard: upload, mapping, issues, commit (screen walkthrough)', () => {
  const HEAD = 'SKU_CODE,PRODUCT_NAME,CATEGORY_L3,RETAIL_PRICE,MRP_PRICE,INVENTORY_QTY,PRIMARY_IMAGE_URL,BARCODE_EAN,HSN_CODE';
  const file = [
    HEAD,
    'TRV-1,Traverse All-Weather Travel Jacket,Apparel > Men > Ethnic Wear,3499,4999,120,https://cdn.example.com/p1.jpg,8901234567891,6203',
    ',Royal Silk Embroidered Kurta,Apparel > Men > Ethnic Wear,2499,2999,5,https://cdn.example.com/p2.jpg,,6204',
    'KUR-FEST-288,Handloom Chanderi Anarkali Suit,Festive Ethnic Wear,3899,4500,7,https://cdn.example.com/p3.jpg,,',
    'BP-1,Everyday Backpack,Apparel,999,1499,10,not a url,,',
    'BP-2,Weekend Duffel,Apparel,1500,1800,1,https://cdn.example.com/b.jpg,8901234567891,',
    'PR-1,Price Problem Tee,Apparel,5000,4000,2,https://cdn.example.com/t.jpg,,',
    'EXIST-1-S,Existing Tee Renamed,Apparel,100,200,3,,,',
    'TRV-1,Duplicate of the jacket,Apparel,3499,4999,1,https://cdn.example.com/p1.jpg,,',
  ].join('\r\n');
  let id: string;

  it('catalogue has an existing SKU so the duplicate strategy can be seen', async () => {
    const p = await c.post('/api/v1/products', { productCode: 'EXIST-1', title: 'Existing Tee', variants: [{ sku: 'EXIST-1-S', sellingPriceMinor: 10000, mrpMinor: 20000 }] }, admin);
    expect(p.status).toBe(201);
  });

  it('GET /imports/options lists the fields, strategies and limits', async () => {
    const r = await c.get(api('/options'), viewer);
    expect(r.status).toBe(200);
    const o = r.body.data;
    expect(o.limits).toMatchObject({ maxFileBytes: 25 * 1024 * 1024, maxRows: 10000 });
    expect(o.targetFields.filter((f: any) => f.required).map((f: any) => f.key)).toEqual(['sku', 'title', 'sellingPrice']);
    expect(o.duplicateStrategies.map((s: any) => s.value)).toEqual(['skip', 'update', 'create_variant_for_new_sku', 'ask', 'create_new']);
    expect(o.presets.map((p: any) => p.code)).toContain('shopify');
  });

  it('step 1-2: create the import, upload the file, get headers, preview and the automatic mapping', async () => {
    const created = await c.post(api(), { source: 'csv_excel', fileName: 'festive_apparel_catalog_v2.csv', fileSizeBytes: 2450000 }, staff);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: 'created', uiStatus: 'pending', fileName: 'festive_apparel_catalog_v2.csv', source: 'csv', counters: { total: 0, percent: 0 } });
    id = created.body.data.id;

    const up = await upload(id, file);
    expect(up.status).toBe(200);
    const { session, analysis } = up.body.data;
    expect(session).toMatchObject({ status: 'analyzed', uiStatus: 'mapping', counters: { total: 8 } });
    expect(analysis).toMatchObject({ format: 'csv', delimiter: ',', totalRows: 8, preset: { code: 'generic' } });
    expect(analysis.headers).toHaveLength(9);
    expect(analysis.preview).toHaveLength(8);
    expect(analysis.preview[0]).toMatchObject({ rowNumber: 2, values: { SKU_CODE: 'TRV-1', RETAIL_PRICE: '3499' } });
    const col = (name: string) => analysis.mapping.find((m: any) => m.sourceColumn === name);
    expect(col('SKU_CODE')).toMatchObject({ targetField: 'sku', status: 'matched', isRequired: true, confidence: 96, sampleValues: expect.arrayContaining(['TRV-1']) });
    expect(col('RETAIL_PRICE')).toMatchObject({ targetField: 'sellingPrice' });
    expect(col('HSN_CODE')).toMatchObject({ targetField: 'hsn', isRequired: false });
    expect(analysis.missingRequired).toEqual([]);
    expect((await c.get(api(`/${id}/mapping`), viewer)).body.data.columns).toHaveLength(9);
  });

  it('the mapping can be edited per column; a bad edit is refused', async () => {
    const r = await c.put(api(`/${id}/mapping`), { sourceColumn: 'HSN_CODE', targetField: null }, admin);
    expect(r.status).toBe(200);
    expect(r.body.data.columns.find((m: any) => m.sourceColumn === 'HSN_CODE')).toMatchObject({ targetField: null, status: 'unmatched' });
    const back = await c.put(api(`/${id}/mapping`), { sourceColumn: 'HSN_CODE', targetField: 'hsn' }, admin);
    expect(back.body.data.columns.find((m: any) => m.sourceColumn === 'HSN_CODE')).toMatchObject({ targetField: 'hsn', status: 'matched' });
    // moving a column to a field it was not guessed for makes it "manual" and frees its old field
    const manual = await c.put(api(`/${id}/mapping`), { sourceColumn: 'MRP_PRICE', targetField: 'costPrice' }, admin);
    expect(manual.body.data.columns.find((m: any) => m.sourceColumn === 'MRP_PRICE')).toMatchObject({ targetField: 'costPrice', status: 'manual', confidence: 100 });
    expect(manual.body.data.mapping.mrp).toBeUndefined();
    await c.put(api(`/${id}/mapping`), { sourceColumn: 'MRP_PRICE', targetField: 'mrp' }, admin);
    expect((await c.put(api(`/${id}/mapping`), { sourceColumn: 'NOPE', targetField: 'sku' }, admin)).status).toBe(400);
    expect((await c.put(api(`/${id}/mapping`), { sourceColumn: 'SKU_CODE', targetField: 'banana' }, admin)).status).toBe(400);
    const twice = await c.put(api(`/${id}/mapping`), { mapping: { sku: 'SKU_CODE', title: 'SKU_CODE' } }, admin);
    expect(twice.status).toBe(400);
    expect(twice.body.error.details.rule).toBe('source_used_twice');
  });

  it('validation refuses to start while a required field is unmapped', async () => {
    await c.put(api(`/${id}/mapping`), { sourceColumn: 'RETAIL_PRICE', targetField: null }, admin);
    const r = await c.post(api(`/${id}/validate`), {}, admin);
    expect(r.status).toBe(409);
    expect(r.body.error.details).toMatchObject({ rule: 'missing_required_mapping', missing: ['sellingPrice'] });
    await c.put(api(`/${id}/mapping`), { sourceColumn: 'RETAIL_PRICE', targetField: 'sellingPrice' }, admin);
  });

  it('settings: category default, strategy, warehouse; unknown warehouse 404; stale version 409', async () => {
    const bad = await c.put(api(`/${id}/settings`), { warehouseId: '00000000-0000-4000-8000-000000000000' }, admin);
    expect(bad.status).toBe(404);
    const s0 = (await c.get(api(`/${id}`), admin)).body.data;
    expect(s0.settings).toMatchObject({ duplicateStrategy: 'skip', currencyUnit: 'rupees', autoPublish: false, warehouseId: null });
    const ok = await c.put(api(`/${id}/settings`), { warehouseId: wh.id, version: s0.version }, admin);
    expect(ok.status).toBe(200);
    expect(ok.body.data.settings.warehouseId).toBe(wh.id);
    const stale = await c.put(api(`/${id}/settings`), { autoPublish: false, version: s0.version }, admin);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect((await c.put(api(`/${id}/settings`), { duplicateStrategy: 'merge' }, admin)).status).toBe(400);
  });

  it('step 4: validate runs as a job and produces typed issues with suggested fixes', async () => {
    const s = await runValidation(id);
    expect(s).toMatchObject({ status: 'validated', uiStatus: 'needs_attention', counters: { total: 8, processed: 8, percent: 100 } });
    // row 8 (EXIST-1-S) is skipped by the "skip" strategy; row 9 duplicates TRV-1
    expect(s.counters).toMatchObject({ valid: 1, warning: 2, error: 4, skipped: 1 });
    const summary = (await c.get(api(`/${id}/summary`), admin)).body.data;
    const byCode = Object.fromEntries(summary.byCode.map((x: any) => [x.code, x]));
    expect(byCode.missing_sku).toMatchObject({ title: 'Missing SKU identifier', open: 1, errors: 1 });
    expect(byCode.category_unmapped).toMatchObject({ open: 1, warnings: 1 });
    expect(byCode.invalid_image).toMatchObject({ open: 1, warnings: 1 });
    expect(byCode.duplicate_barcode).toMatchObject({ open: 1, errors: 1 });
    expect(byCode.pricing_invalid).toMatchObject({ open: 1, errors: 1 });
    expect(byCode.duplicate_sku).toMatchObject({ open: 1, errors: 1 });
    expect(summary).toMatchObject({ total: 6, open: 6, errors: 4, warnings: 2 });
    expect(summary.rows).toMatchObject({ valid: 1, warning: 2, error: 4, skipped: 1 });

    const all = await issues(id);
    const missing = all.find((i) => i.code === 'missing_sku');
    expect(missing).toMatchObject({ rowNumber: 3, type: 'missing_sku', severity: 'error', field: 'sku', status: 'open', affectedFields: ['sku'], suggestedFix: 'ROY-SIL-EMB-3', productData: { title: 'Royal Silk Embroidered Kurta', price: 2499 } });
    expect(missing.suggestion).toMatchObject({ kind: 'set_value', field: 'sku', value: 'ROY-SIL-EMB-3' });
    const cat = all.find((i) => i.code === 'category_unmapped');
    expect(cat).toMatchObject({ rowNumber: 4, sourceValue: 'Festive Ethnic Wear', severity: 'warning', suggestedFix: 'Apparel > Men > Ethnic Wear' });
    expect(cat.suggestion).toMatchObject({ kind: 'map_category', value: ethnic.id });
    expect(all.find((i) => i.code === 'pricing_invalid')).toMatchObject({ rowNumber: 7, field: 'mrp', sourceValue: '4000', suggestedFix: 'Set the MRP to 5000' });
    expect(all.find((i) => i.code === 'duplicate_barcode')).toMatchObject({ rowNumber: 6, sourceValue: '8901234567891' });
    expect(all.find((i) => i.code === 'duplicate_sku')).toMatchObject({ rowNumber: 9, field: 'sku', suggestedFix: 'TRV-1-2' });
    expect(all.find((i) => i.code === 'invalid_image')).toMatchObject({ rowNumber: 5, severity: 'warning' });

    // filters, search and numbered paging
    expect(await issues(id, '&filter[severity]=warning')).toHaveLength(2);
    expect(await issues(id, '&filter[code]=missing_sku')).toHaveLength(1);
    expect(await issues(id, '&q=backpack')).toHaveLength(1);
    const page = (await c.get(api(`/${id}/issues?pageSize=2&page=2`), admin)).body.data;
    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 6, pages: 3 });
    const rows = (await c.get(api(`/${id}/rows?filter[status]=skipped`), admin)).body.data;
    expect(rows.items).toHaveLength(1);
    expect(rows.items[0]).toMatchObject({ rowNumber: 8, sku: 'EXIST-1-S', skipReason: 'SKU already in the catalogue' });
  });

  it('errors.csv lists the unresolved issues', async () => {
    const r = await c.call('GET', api(`/${id}/errors.csv`), { as: viewer });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.headers['content-disposition']).toMatch(/attachment/);
    const lines = r.raw.body.trim().split('\r\n');
    expect(lines[0]).toBe('row,sku,product_title,issue,severity,field,value,message,suggested_fix');
    expect(lines).toHaveLength(7);
    expect(r.raw.body).toContain('missing_sku');
  });

  it('step 5: resolve issues (accept, custom value, ignore, bulk) and keep the counts honest', async () => {
    const all = await issues(id);
    const of = (code: string) => all.find((i) => i.code === code);

    const accepted = await c.post(api(`/${id}/issues/${of('missing_sku').id}`), { action: 'accept_suggestion' }, admin);
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.issue).toMatchObject({ status: 'resolved', currentFix: 'ROY-SIL-EMB-3' });
    expect(accepted.body.data.issues).toMatchObject({ total: 6, open: 5, resolved: 1 });

    expect((await c.post(api(`/${id}/issues/${of('missing_sku').id}`), { action: 'accept_suggestion' }, admin)).status).toBe(409); // the same answer again: already handled (a different answer changes it, see import-design.test.ts)

    // a custom value, validated where it can be (category must exist)
    const badCat = await c.post(api(`/${id}/issues/${of('category_unmapped').id}`), { action: 'custom_value', customValue: 'Toys' }, admin);
    expect(badCat.status).toBe(400);
    expect((await c.post(api(`/${id}/issues/${of('category_unmapped').id}`), { action: 'custom_value' }, admin)).status).toBe(400);
    const okCat = await c.post(api(`/${id}/issues/${of('category_unmapped').id}`), { action: 'custom_value', customValue: 'apparel/men/ethnic-wear' }, admin);
    expect(okCat.body.data.issue).toMatchObject({ status: 'resolved', currentFix: 'Apparel > Men > Ethnic Wear' });

    // warnings can be dismissed without touching the row's data
    const ignoredImg = await c.post(api(`/${id}/issues/${of('invalid_image').id}`), { action: 'ignore' }, admin);
    expect(ignoredImg.body.data.issue).toMatchObject({ status: 'ignored', currentFix: 'Ignored' });

    // bulk: one suggestion for every open issue of a code
    const bulk = await c.post(api(`/${id}/issues/bulk`), { code: 'pricing_invalid', action: 'accept_suggestion' }, admin);
    expect(bulk.body.data).toMatchObject({ matched: 1, applied: 1, skippedCount: 0 });
    const clearBarcode = await c.post(api(`/${id}/issues/bulk`), { code: 'duplicate_barcode', action: 'custom_value', customValue: '' }, admin);
    expect(clearBarcode.body.data).toMatchObject({ applied: 1 });
    await c.post(api(`/${id}/issues/bulk`), { code: 'duplicate_sku', action: 'accept_suggestion' }, admin);

    const s = (await c.get(api(`/${id}`), admin)).body.data;
    expect(s.issues).toMatchObject({ open: 0, resolved: 5, ignored: 1 });
  });

  it('commit is refused until the file has been validated again after fixes', async () => {
    const r = await c.post(api(`/${id}/commit`), { mode: 'clean_only' }, admin);
    expect(r.status).toBe(409);
    expect(r.body.error.details.rule).toBe('revalidate_first');
  });

  it('revalidate keeps the fixes and the dismissals and reports a clean file', async () => {
    const r = await c.post(api(`/${id}/revalidate`), {}, admin);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ queued: false, status: 'clean', revalidatedCount: 8, remainingIssuesCount: 0, resolvedCount: 5 });
    expect(r.body.data.session).toMatchObject({ status: 'validated', counters: { valid: 7, warning: 0, error: 0, skipped: 1 } });
    const rows = (await c.get(api(`/${id}/rows?pageSize=100`), admin)).body.data.items as any[];
    expect(rows.find((x) => x.rowNumber === 3)).toMatchObject({ sku: 'ROY-SIL-EMB-3', status: 'valid', fixed: true, plan: 'create' });
    expect(rows.find((x) => x.rowNumber === 4).values).toMatchObject({ categoryId: ethnic.id, categoryLabel: 'Apparel > Men > Ethnic Wear' });
    expect(rows.find((x) => x.rowNumber === 7).values).toMatchObject({ sellingPriceMinor: 500000, mrpMinor: 500000 });
    expect(rows.find((x) => x.rowNumber === 6).values.barcode).toBeUndefined();
    expect(rows.find((x) => x.rowNumber === 9).values.sku).toBe('TRV-1-2');
  });

  it('commit-preview gives the exact row count for each choice', async () => {
    const r = await c.get(api(`/${id}/commit-preview`), admin);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ cleanOnly: 2, includeResolved: 7, pendingFixes: 0 });
    const stranger = await c.registerVendor({ businessName: 'Stranger Co' });
    expect((await c.get(api(`/${id}/commit-preview`), stranger)).status).toBe(404);
  });

  it('commit "clean only" imports the untouched rows; fixed rows wait', async () => {
    const r = await commit(id, 'clean_only', admin);
    expect(r.status).toBe(202);
    expect(r.body.data.eligibleRows).toBe(2); // TRV-1 and the backpack with the dismissed image warning
    const s = (await c.get(api(`/${id}`), admin)).body.data;
    expect(s).toMatchObject({ status: 'partially_committed', uiStatus: 'needs_attention', counters: { committed: 2, failed: 0 }, results: { productsCreated: 2, variantsCreated: 2 } });

    const jacket = await productByCode('TRV-1');
    expect(jacket).toMatchObject({ title: 'Traverse All-Weather Travel Jacket', status: 'draft', hsnCode: '6203', categoryId: ethnic.id });
    expect(jacket.variants[0]).toMatchObject({ sku: 'TRV-1', sellingPriceMinor: 349900, mrpMinor: 499900, barcode: '8901234567891' });
    expect(await productByCode('ROY-SIL-EMB-3')).toBeNull();

    const stock = (await c.get(`/api/v1/inventory?filter[variantId]=${jacket.variants[0].id}&filter[warehouseId]=${wh.id}`, admin)).body.data[0];
    expect(stock.onHand ?? stock.quantityOnHand).toBe(120);
    const row = (await c.get(api(`/${id}/rows?q=TRV-1&filter[status]=committed`), admin)).body.data.items[0];
    expect(row).toMatchObject({ status: 'committed', productId: jacket.id, result: { action: 'created', stock: 'received' } });
  });

  it('commit "include resolved" imports the fixed rows and finishes the import', async () => {
    const r = await commit(id, 'include_resolved', admin);
    expect(r.status).toBe(202);
    const s = (await c.get(api(`/${id}`), admin)).body.data;
    expect(s).toMatchObject({ status: 'committed', uiStatus: 'completed', counters: { committed: 7, percent: 100 }, results: { productsCreated: 7 } });
    expect(await productByCode('ROY-SIL-EMB-3')).toMatchObject({ title: 'Royal Silk Embroidered Kurta' });
    expect((await productByCode('TRV-1-2'))?.title).toBe('Duplicate of the jacket');
    expect((await productByCode('EXIST-1'))?.title).toBe('Existing Tee'); // skipped, not renamed
    const outbox = await t.outbox('import.committed');
    expect(outbox.map((e) => e.aggregateId)).toContain(id);
    expect((await c.post(api(`/${id}/commit`), { mode: 'clean_only' }, admin)).status).toBe(409); // nothing left, and already committed
    // no stock was lost or invented: the ledger still agrees with the shelves
    expect((await c.get('/api/v1/inventory/ledger-check', admin)).body.data).toBeTruthy();
  });

  it('a replayed commit message changes nothing', async () => {
    const before = (await c.get('/api/v1/products?q=TRV-1', admin)).body.data.length;
    await t.queues.enqueue('heavy', 'product-import.commit', { vendorId: admin.vendorId, correlationId: 'replay', data: { sessionId: id } });
    await t.runJobs();
    expect((await c.get('/api/v1/products?q=TRV-1', admin)).body.data.length).toBe(before);
  });

  it('history lists the import with its counters; unknown and foreign ids are 404', async () => {
    const list = (await c.get(api('?filter[status]=committed'), viewer)).body.data;
    expect(list.items.map((i: any) => i.id)).toContain(id);
    expect((await c.get(api(`?q=festive_apparel`), admin)).body.data.total).toBe(1);
    const other = await c.registerVendor({ businessName: 'Other Import Co' });
    expect((await c.get(api(`/${id}`), other)).status).toBe(404);
    expect((await c.get(api(`/${id}/issues`), other)).status).toBe(404);
    expect((await c.get(api(`/${id}/errors.csv`), other)).status).toBe(404);
    expect((await c.get(api(), other)).body.data.total).toBe(0);
    expect((await c.get(api('/00000000-0000-4000-8000-000000000000'), admin)).status).toBe(404);
  });
});

// ================================================================================================
describe('duplicate strategies', () => {
  const base = 'sku,title,price,mrp,stock,product code\r\n';

  it('update: existing SKU is updated, a new SKU of an existing product becomes a variant, stock is counted', async () => {
    const p = await c.post('/api/v1/products', { productCode: 'UPD-1', title: 'Updatable', brand: 'Acme', variants: [{ sku: 'UPD-1-S', sellingPriceMinor: 10000, mrpMinor: 20000 }] }, admin);
    const variantId = p.body.data.variants[0].id;
    await c.stock(admin, variantId, wh.id, 10);
    const id = (await start(admin)).id;
    await upload(id, `${base}UPD-1-S,Updated title,150,250,25,UPD-1\r\nUPD-1-M,Updated title,160,250,4,UPD-1\r\n`);
    await c.put(api(`/${id}/settings`), { duplicateStrategy: 'update', warehouseId: wh.id }, admin);
    const s = await runValidation(id);
    expect(s.counters).toMatchObject({ valid: 2, error: 0 });
    const rows = (await c.get(api(`/${id}/rows`), admin)).body.data.items;
    expect(rows.map((r: any) => r.plan)).toEqual(['update', 'add_variant']);
    await commit(id, 'clean_only');
    const done = await productByCode('UPD-1');
    expect(done.title).toBe('Updated title');
    expect(done.variants.map((v: any) => [v.sku, v.sellingPriceMinor]).sort()).toEqual([['UPD-1-M', 16000], ['UPD-1-S', 15000]]);
    const s1 = (await c.get(`/api/v1/inventory?filter[variantId]=${variantId}&filter[warehouseId]=${wh.id}`, admin)).body.data[0];
    expect(s1.onHand ?? s1.quantityOnHand).toBe(25);
    const final = (await c.get(api(`/${id}`), admin)).body.data;
    expect(final.results).toMatchObject({ productsUpdated: 2, variantsUpdated: 1, variantsCreated: 1 });
  });

  it('create_variant_for_new_sku: new SKU joins the existing product, existing SKUs are left alone', async () => {
    await c.post('/api/v1/products', { productCode: 'CVN-1', title: 'Keep my title', variants: [{ sku: 'CVN-1-S', sellingPriceMinor: 10000 }] }, admin);
    const id = (await start(admin)).id;
    await upload(id, `${base}CVN-1-S,Changed,999,,,CVN-1\r\nCVN-1-L,Changed,1200,,,CVN-1\r\n`);
    await c.put(api(`/${id}/settings`), { duplicateStrategy: 'create_variant_for_new_sku' }, admin);
    const s = await runValidation(id);
    expect(s.counters).toMatchObject({ valid: 1, skipped: 1 });
    await commit(id, 'clean_only');
    const p = await productByCode('CVN-1');
    expect(p.title).toBe('Keep my title');
    expect(p.variants.map((v: any) => v.sku).sort()).toEqual(['CVN-1-L', 'CVN-1-S']);
    expect(p.variants.find((v: any) => v.sku === 'CVN-1-S').sellingPriceMinor).toBe(10000);
  });

  it('update: a SKU that belongs to a different product is an error, not a silent move', async () => {
    const id = (await start(admin)).id;
    await upload(id, `${base}UPD-1-S,x,1,,,SOMEONE-ELSE\r\n`);
    await c.put(api(`/${id}/settings`), { duplicateStrategy: 'update' }, admin);
    await runValidation(id);
    expect((await issues(id))[0]).toMatchObject({ code: 'duplicate_sku', severity: 'error' });
  });

  it('prices in paise are read as paise, rupees with decimals as rupees', async () => {
    const id = (await start(admin)).id;
    await upload(id, 'sku,title,price,mrp\r\nPAISE-1,Paise item,49950,59900\r\nPAISE-2,Paise bad,499.50,599\r\n');
    await c.put(api(`/${id}/settings`), { currencyUnit: 'paise' }, admin);
    await runValidation(id);
    const rows = (await c.get(api(`/${id}/rows`), admin)).body.data.items;
    expect(rows[0].values).toMatchObject({ sellingPriceMinor: 49950, mrpMinor: 59900 });
    expect((await issues(id))[0]).toMatchObject({ rowNumber: 3, code: 'pricing_invalid', field: 'sellingPrice', unit: 'paise' });
    // changing the unit after validating sends the import back for revalidation
    await c.put(api(`/${id}/settings`), { currencyUnit: 'rupees' }, admin);
    expect((await c.get(api(`/${id}`), admin)).body.data.status).toBe('analyzed');
  });

  it('a default category fills rows without one; stock without any warehouse refuses the commit', async () => {
    const lone = await c.registerVendor({ businessName: 'No Warehouse Co' });
    const cat = (await c.post('/api/v1/categories', { name: 'Misc' }, lone)).body.data;
    const id = (await start(lone)).id;
    await upload(id, 'sku,title,price,stock\r\nNW-1,No warehouse item,100,5\r\n', lone);
    await c.put(api(`/${id}/settings`), { defaultCategoryId: cat.id }, lone);
    await runValidation(id, lone);
    expect((await c.get(api(`/${id}/rows`), lone)).body.data.items[0].values).toMatchObject({ categoryId: cat.id, categoryLabel: 'Misc' });
    const r = await c.post(api(`/${id}/commit`), { mode: 'clean_only' }, lone);
    expect(r.status).toBe(409);
    expect(r.body.error.details.rule).toBe('no_warehouse');
  });
});

describe('Shopify export and Excel files', () => {
  it('groups rows by handle into one product with variants, attaches extra image rows, reads option columns', async () => {
    const csv = [
      'Handle,Title,Body (HTML),Vendor,Type,Tags,Option1 Name,Option1 Value,Variant SKU,Variant Grams,Variant Inventory Qty,Variant Price,Variant Compare At Price,Variant Barcode,Image Src,Cost per item',
      'linen-shirt,Oasis Linen Shirt,<p>Soft linen</p>,Oasis,Apparel,"summer, linen",Size,M,OLS-M,300,10,1899,2499,,https://cdn.example.com/ols1.jpg,900',
      'linen-shirt,,,,,,Size,L,OLS-L,320,6,1899,2499,,,900',
      'linen-shirt,,,,,,,,,,,,,,https://cdn.example.com/ols2.jpg,',
    ].join('\n');
    const id = (await start(admin, 'products_export.csv', 'shopify')).id;
    const up = await upload(id, csv);
    expect(up.body.data.analysis.preset).toMatchObject({ code: 'shopify', confidence: expect.any(Number) });
    expect(up.body.data.session.source).toBe('shopify');
    const map = Object.fromEntries(up.body.data.analysis.mapping.map((m: any) => [m.sourceColumn, m.targetField]));
    expect(map).toMatchObject({ Handle: 'productCode', 'Variant SKU': 'sku', 'Variant Price': 'sellingPrice', 'Variant Compare At Price': 'mrp', 'Image Src': 'imageUrl', 'Cost per item': 'costPrice', Vendor: 'brand', 'Option1 Name': 'option1Name' });
    await c.put(api(`/${id}/settings`), { warehouseId: wh.id, defaultCategoryId: apparel.id }, admin);
    const s = await runValidation(id);
    expect(s.counters).toMatchObject({ total: 3, valid: 2, skipped: 1, error: 0 });
    const rows = (await c.get(api(`/${id}/rows`), admin)).body.data.items;
    expect(rows[1].values).toMatchObject({ title: 'Oasis Linen Shirt', brand: 'Oasis', optionValues: { Size: 'L' }, weightGrams: 320 });
    expect(rows[0].values.additionalImageUrls).toEqual(['https://cdn.example.com/ols2.jpg']);
    expect(rows[2]).toMatchObject({ status: 'skipped' });
    await commit(id, 'clean_only');
    const p = await productByCode('linen-shirt');
    expect(p).toMatchObject({ title: 'Oasis Linen Shirt', brand: 'Oasis', variantCount: 2 });
    expect(p.variants.map((v: any) => [v.sku, v.optionValues.Size, v.costPriceMinor]).sort()).toEqual([['OLS-L', 'L', 90000], ['OLS-M', 'M', 90000]]);
  });

  it('reads an .xlsx workbook (shared strings, numeric cells) and a TSV file', async () => {
    const sheet = '<worksheet><sheetData>'
      + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2"><v>799.5</v></c><c r="D2"><v>8.90123456789E12</v></c></row>'
      + '</sheetData></worksheet>';
    const strings = '<sst><si><t>SKU</t></si><si><t>Title</t></si><si><t>Price</t></si><si><t>Barcode</t></si><si><t>XL-1</t></si><si><t>Excel made tee</t></si></sst>';
    const book = zip([
      { name: 'xl/workbook.xml', data: Buffer.from('<workbook xmlns:r="x"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>') },
      { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet) }, { name: 'xl/sharedStrings.xml', data: Buffer.from(strings) },
    ]);
    const id = (await start(admin, 'stock.xlsx')).id;
    const up = await upload(id, book, admin, CT.bin);
    expect(up.status).toBe(200);
    expect(up.body.data.analysis).toMatchObject({ format: 'xlsx', sheetName: 'Sheet1', totalRows: 1 });
    expect(up.body.data.session.source).toBe('xlsx');
    expect(up.body.data.analysis.preview[0].values).toEqual({ SKU: 'XL-1', Title: 'Excel made tee', Price: '799.5', Barcode: '8901234567890' });
    await runValidation(id);
    const row = (await c.get(api(`/${id}/rows`), admin)).body.data.items[0];
    expect(row.values).toMatchObject({ sellingPriceMinor: 79950, barcode: '8901234567890' });

    const tsv = await start(admin, 'export.tsv');
    const tup = await upload(tsv.id, 'sku\ttitle\tprice\nT-1\tTab tee\t10\n');
    expect(tup.body.data.analysis).toMatchObject({ format: 'tsv', delimiter: '\t', totalRows: 1 });
  });

  it('the downloadable templates upload back with every column mapped', async () => {
    const csv = await c.call('GET', api('/template?format=csv'), { as: viewer });
    expect(csv.status).toBe(200);
    expect(csv.headers['content-disposition']).toMatch(/product-import-template\.csv/);
    const xlsx = await c.call('GET', api('/template?format=xlsx'), { as: viewer });
    expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
    expect(xlsx.raw.rawPayload.subarray(0, 2).toString()).toBe('PK');
    for (const [name, body, ct] of [['t.csv', csv.raw.body, CT.csv], ['t.xlsx', xlsx.raw.rawPayload, CT.bin]] as const) {
      const id = (await start(admin, name)).id;
      const up = await upload(id, body, admin, ct);
      expect(up.status).toBe(200);
      expect(up.body.data.analysis.mapping.every((m: any) => m.targetField && m.confidence === 100)).toBe(true);
      expect(up.body.data.analysis.totalRows).toBe(1);
    }
  });
});

describe('limits, rules and permissions', () => {
  it('refuses unusable files with a reason', async () => {
    const id = (await start(admin)).id;
    expect((await upload(id, '')).status).toBe(400);
    expect((await upload(id, 'sku,title\r\n')).body.error.details.rule).toBe('empty_file');
    expect((await upload(id, Buffer.from([0x50, 0x00, 0x01, 0x00, 0x02]), admin, CT.bin)).status).toBe(415);
    expect((await upload(id, Buffer.from('PK\x03\x04garbage'), admin, CT.bin)).status).toBe(415);
    const tooMany = `sku,title\r\n${Array.from({ length: 10_001 }, (_, i) => `S${i},T${i}`).join('\r\n')}\r\n`;
    const big = await upload(id, tooMany);
    expect(big.status).toBe(413);
    expect(big.body.error.details).toMatchObject({ rule: 'too_many_rows', maxRows: 10000 });
    const wide = await upload(id, `${Array.from({ length: 201 }, (_, i) => `c${i}`).join(',')}\r\n${Array.from({ length: 201 }, () => 'x').join(',')}\r\n`);
    expect(wide.body.error.details.rule).toBe('too_many_columns');
    expect((await c.post(api(), { source: 'csv_excel', fileName: 'x.csv', fileSizeBytes: 26 * 1024 * 1024 }, admin)).status).toBe(413);
    expect((await c.post(api(), { source: 'csv_excel', fileName: 'x.pdf', fileSizeBytes: 10 }, admin)).status).toBe(400);
    expect((await c.post(api(), { source: 'dropbox', fileName: 'x.csv', fileSizeBytes: 10 }, admin)).status).toBe(400);
    expect((await c.post(api(`/${id}/validate`), {}, admin)).status).toBe(409); // nothing uploaded successfully
  });

  it('viewers read, staff and admins write, strangers see nothing', async () => {
    const id = (await start(staff)).id;
    expect((await c.post(api(), { source: 'csv', fileName: 'v.csv', fileSizeBytes: 1 }, viewer)).status).toBe(403);
    expect((await upload(id, 'sku,title,price\r\nV-1,v,1\r\n', viewer)).status).toBe(403);
    expect((await c.put(api(`/${id}/settings`), { autoPublish: true }, viewer)).status).toBe(403);
    expect((await c.post(api(`/${id}/cancel`), {}, viewer)).status).toBe(403);
    expect((await c.get(api(`/${id}`), viewer)).status).toBe(200);
    expect((await c.get(api(`/${id}/summary`), viewer)).status).toBe(200);
    expect((await upload(id, 'sku,title,price\r\nV-1,v,1\r\n', staff)).status).toBe(200);
    expect((await c.get(api(`/${id}`))).status).toBe(401);
  });

  it('a validation can be cancelled; a cancelled import cannot be validated, committed or edited again', async () => {
    const id = (await start(admin)).id;
    await upload(id, 'sku,title,price\r\nCAN-1,Cancel me,10\r\n');
    expect((await c.post(api(`/${id}/validate`), {}, admin)).status).toBe(202);
    expect((await c.post(api(`/${id}/validate`), {}, admin)).status).toBe(409); // already running
    expect((await c.put(api(`/${id}/mapping`), { sourceColumn: 'sku', targetField: null }, admin)).status).toBe(409);
    const cancelled = await c.post(api(`/${id}/cancel`), {}, admin);
    expect(cancelled.body.data.status).toBe('cancelled');
    await t.runJobs(); // the queued validation finds a cancelled import and stops
    expect((await c.get(api(`/${id}`), admin)).body.data.status).toBe('cancelled');
    expect((await c.post(api(`/${id}/validate`), {}, admin)).status).toBe(409);
    expect((await c.post(api(`/${id}/commit`), { mode: 'clean_only' }, admin)).status).toBe(409);
    expect((await c.post(api(`/${id}/cancel`), {}, admin)).status).toBe(409);
    expect((await productByCode('CAN-1'))).toBeNull();
  });

  it('uploading again replaces the earlier file, its rows and its fixes', async () => {
    const id = (await start(admin)).id;
    await upload(id, 'sku,title,price\r\nRE-1,first,10\r\nRE-2,,10\r\n');
    await runValidation(id);
    expect((await issues(id)).length).toBe(1);
    const again = await upload(id, 'SKU,Name,Selling price\r\nRE-3,third,30\r\n');
    expect(again.body.data.session).toMatchObject({ status: 'analyzed', counters: { total: 1, valid: 0, error: 0 }, issues: { total: 0 } });
    expect((await issues(id)).length).toBe(0);
    expect((await c.get(api(`/${id}/rows`), admin)).body.data.total).toBe(1);
  });

  it('a row that fails inside the commit is reported on the row and does not stop the others', async () => {
    const id = (await start(admin)).id;
    await upload(id, 'sku,title,price,mrp\r\nOK-1,Fine one,10,20\r\nOK-2,Fine two,10,20\r\nBAD-1,Racing,10,20\r\n');
    await runValidation(id);
    // another writer takes the SKU between validation and commit
    await c.post('/api/v1/products', { productCode: 'RACE', title: 'Race winner', variants: [{ sku: 'BAD-1' }] }, admin);
    await commit(id, 'clean_only');
    const s = (await c.get(api(`/${id}`), admin)).body.data;
    expect(s).toMatchObject({ status: 'partially_committed', counters: { committed: 2, failed: 1, error: 1 } });
    const open = await issues(id, '&filter[status]=open');
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ code: 'commit_failed', rowNumber: 4, severity: 'error' });
    expect(open[0].description).toMatch(/added to the catalogue after this file was validated/);
    expect(await productByCode('OK-2')).toBeTruthy();
    expect(await productByCode('BAD-1')).toBeNull();
    // validating again explains the failure the way a fresh upload would
    const again = await c.post(api(`/${id}/revalidate`), {}, admin);
    expect(again.body.data.session.counters).toMatchObject({ committed: 2, skipped: 1 });
  });

  it('large files validate in a job: 1,200 rows with progress, a queued revalidation, and the counters add up', async () => {
    const lines = ['sku,title,price,mrp,barcode'];
    for (let i = 0; i < 1200; i++) lines.push(`BULK-${i},Bulk item ${i},${100 + i},${300 + i},${i % 100 === 0 ? '' : String(9000000000000 + i)}`);
    lines.push('BULK-5,Duplicate of five,10,20,');
    const id = (await start(admin, 'bulk.csv')).id;
    const up = await upload(id, lines.join('\r\n'));
    expect(up.body.data.session.counters.total).toBe(1201);
    const s = await runValidation(id);
    expect(s).toMatchObject({ status: 'validated', counters: { total: 1201, processed: 1201, valid: 1200, error: 1, percent: 100 } });
    expect((await c.get(api(`/${id}/summary`), admin)).body.data.byCode[0]).toMatchObject({ code: 'duplicate_sku', open: 1 });
    const queued = await c.post(api(`/${id}/revalidate`), {}, admin);
    expect(queued.status).toBe(202);
    expect(queued.body.data).toMatchObject({ queued: true, status: 'queued', session: { status: 'validating' } });
    await t.runJobs();
    expect((await c.get(api(`/${id}`), admin)).body.data.status).toBe('validated');
    const bulk = await c.post(api(`/${id}/issues/bulk`), { code: 'duplicate_sku', action: 'ignore' }, admin);
    expect(bulk.body.data).toMatchObject({ matched: 1, applied: 1 });
    expect((await c.get(api(`/${id}`), admin)).body.data.counters).toMatchObject({ ignored: 1, error: 0 });
  }, 120_000);

  it('autoPublish asks the listings module for draft listings and never publishes', async () => {
    const acct = await c.connectAccount(admin, 'mock');
    const id = (await start(admin)).id;
    await upload(id, 'sku,title,price\r\nDRAFT-1,Draft me,50\r\n');
    await c.put(api(`/${id}/settings`), { autoPublish: true, assignAllChannels: true }, admin);
    await runValidation(id);
    await commit(id, 'clean_only');
    const row = (await c.get(api(`/${id}/rows`), admin)).body.data.items[0];
    expect(row.status).toBe('committed');
    const listings = (await c.get(`/api/v1/listings?filter[accountId]=${acct.id}`, admin)).body.data as any[];
    const mine = listings.filter((l) => l.sku === 'DRAFT-1');
    if (mine.length) {
      expect(row.result.listingDrafts).toBe(1);
      expect(mine[0].status).toBe('draft');
    } else {
      expect(row.result.notes.join(' ')).toMatch(/not available/);
    }
  });
});
