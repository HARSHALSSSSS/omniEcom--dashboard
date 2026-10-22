import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, mockControl, type Actor, type TestApp } from '@oms/testing';
import { LIMITS } from '../../modules/product-import/src/domain/catalogue';

/** The bulk-import design: settings toggles, per-row duplicate decisions, marketplace source, activity feed, revalidation progress, notifications. */
let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let staff: Actor;
let viewer: Actor;
let stranger: Actor;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  admin = await c.registerVendor({ businessName: 'Design Import Co' });
  staff = await c.addMember(admin, 'vendor_staff');
  viewer = await c.addMember(admin, 'vendor_viewer');
  stranger = await c.registerVendor({ businessName: 'Other Co' });
  await c.makeWarehouse(admin, { code: 'MAIN' });
}, 120_000);
afterAll(() => t.close());

const api = (path = '') => `/api/v1/imports${path}`;
const H = 'SKU,Product code (groups variants),Product title,Selling price,Stock quantity,Primary image URL';

async function newImport(csv: string, settings: Record<string, unknown> = {}, as: Actor = admin) {
  const r = await c.post(api(), { source: 'csv_excel', fileName: 'design.csv', fileSizeBytes: csv.length }, as);
  expect(r.status).toBe(201);
  const id = r.body.data.id as string;
  const up = await c.call('POST', api(`/${id}/file`), { as, raw: csv, contentType: 'text/csv' });
  expect(up.status, JSON.stringify(up.body)).toBe(200);
  if (Object.keys(settings).length) {
    const s = await c.put(api(`/${id}/settings`), settings, as);
    expect(s.status, JSON.stringify(s.body)).toBe(200);
  }
  return id;
}
async function validate(id: string) {
  expect((await c.post(api(`/${id}/validate`), {}, admin)).status).toBe(202);
  await t.runJobs();
  return (await c.get(api(`/${id}`), admin)).body.data;
}
async function commit(id: string, mode = 'include_resolved') {
  const r = await c.post(api(`/${id}/commit`), { mode }, admin);
  expect(r.status, JSON.stringify(r.body)).toBe(202);
  await t.runJobs();
  return (await c.get(api(`/${id}`), admin)).body.data;
}
const issues = async (id: string, q = '') => (await c.get(api(`/${id}/issues?pageSize=100${q}`), admin)).body.data.items as any[];
const rows = async (id: string) => (await c.get(api(`/${id}/rows?pageSize=100`), admin)).body.data.items as any[];
const product = async (code: string) => {
  const hit = ((await c.get(`/api/v1/products?q=${encodeURIComponent(code)}`, admin)).body.data as any[]).find((p) => p.productCode === code);
  return hit ? (await c.get(`/api/v1/products/${hit.id}`, admin)).body.data : null;
};

describe('settings toggles', () => {
  it('default to true and are stored with the settings', async () => {
    const id = await newImport(`${H}\nTG-0,TG-0,Plain,10,1,\n`);
    expect((await c.get(api(`/${id}`), admin)).body.data.settings).toMatchObject({ includeImages: true, includeQuantities: true, matchVariants: true });
    expect((await c.get(api('/options'), admin)).body.data.defaults).toMatchObject({ includeImages: true, includeQuantities: true, matchVariants: true });
    const s = await c.put(api(`/${id}/settings`), { includeImages: false }, admin);
    expect(s.body.data.settings).toMatchObject({ includeImages: false, includeQuantities: true, matchVariants: true });
    expect((await c.put(api(`/${id}/settings`), { includeImages: 'no' }, admin)).status).toBe(400);
  });

  const csv = `${H}\nTG-1,TG-GROUP,Trail Shirt S,499,7,https://cdn.example.com/a.jpg\nTG-2,TG-GROUP,,499,3,not a url\n`;

  it('with everything on: variants are grouped, bad image URLs are issues, stock is received', async () => {
    const id = await newImport(csv);
    await validate(id);
    expect((await issues(id)).map((i) => i.code)).toEqual(['invalid_image']);
    const done = await commit(id);
    expect(done).toMatchObject({ status: 'committed', results: { productsCreated: 1, variantsCreated: 2 } });
    expect((await product('TG-GROUP')).variants).toHaveLength(2);
    expect((await rows(id)).map((r) => r.result.stock)).toEqual(['received', 'received']);
  });

  it('with images, quantities and variant matching off: no image issue, no stock, one product per row', async () => {
    const off = { includeImages: false, includeQuantities: false, matchVariants: false };
    const id = await newImport(`${H}\nTO-1,TO-GROUP,Trail Shirt S,499,7,https://cdn.example.com/a.jpg\nTO-2,TO-GROUP,Trail Shirt M,499,3,not a url\n`, off);
    const v = await validate(id);
    expect(v.settings).toMatchObject(off);
    expect(await issues(id)).toEqual([]);
    expect(await c.get(api(`/${id}/commit-preview`), admin).then((r) => r.body.data)).toMatchObject({ cleanOnly: 2 });
    const done = await commit(id, 'clean_only');
    expect(done).toMatchObject({ status: 'committed', results: { productsCreated: 2, variantsCreated: 2 } });
    expect(await product('TO-GROUP')).toBeNull();
    expect((await product('TO-1')).variants).toHaveLength(1);
    expect((await product('TO-2')).variants).toHaveLength(1);
    const rs = await rows(id);
    expect(rs.map((r) => r.result.stock)).toEqual(['none', 'none']);
    expect(rs[0].values.imageUrl).toBeUndefined();
  });

  it('changing a toggle sends a validated import back to analyzed', async () => {
    const id = await newImport(`${H}\nTT-1,TT-1,Tee,100,1,\n`);
    await validate(id);
    const r = await c.put(api(`/${id}/settings`), { matchVariants: false }, admin);
    expect(r.body.data.status).toBe('analyzed');
  });
});

describe('per-row duplicate decisions', () => {
  it('"ask" raises one issue per existing SKU with the existing product; use_existing updates, create_new makes a new product', async () => {
    for (const [code, sku, title] of [['DUP-A', 'DUP-A-S', 'Existing Tee A'], ['DUP-B', 'DUP-B-S', 'Existing Tee B'], ['DUP-C', 'DUP-C-S', 'Existing Tee C']]) {
      expect((await c.post('/api/v1/products', { productCode: code, title, variants: [{ sku, sellingPriceMinor: 10000 }] }, admin)).status).toBe(201);
    }
    const id = await newImport(`${H}\nDUP-A-S,DUP-A,CSV Tee A,150,,\nDUP-B-S,DUP-B,CSV Tee B,160,,\nDUP-C-S,DUP-C,CSV Tee C,170,,\nDUP-N-S,DUP-N,Brand New,99,,\n`, { duplicateStrategy: 'ask' });
    await validate(id);
    const list = (await issues(id)).filter((i) => i.code === 'duplicate_sku');
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ severity: 'error', status: 'open', productData: { sku: 'DUP-A-S', title: 'CSV Tee A', price: 150, existing: { sku: 'DUP-A-S', title: 'Existing Tee A', price: 100, productCode: 'DUP-A' } } });
    expect(list[0].suggestion.existing.productId).toBe(list[0].productData.existing.id);
    expect((await c.get(api(`/${id}/commit-preview`), admin)).body.data.includeResolved).toBe(1); // only the new product is ready

    const a = await c.post(api(`/${id}/issues/${list[0].id}`), { action: 'use_existing' }, admin);
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(a.body.data.issue).toMatchObject({ status: 'resolved', resolution: { action: 'use_existing' } });
    const bulk = await c.post(api(`/${id}/issues/bulk`), { code: 'duplicate_sku', action: 'create_new' }, admin);
    expect(bulk.body.data).toMatchObject({ matched: 2, applied: 2, skippedCount: 0 });
    expect((await c.get(api(`/${id}/commit-preview`), admin)).body.data).toEqual({ cleanOnly: 1, includeResolved: 4, pendingFixes: 0 });

    const done = await commit(id);
    expect(done).toMatchObject({ status: 'committed', results: { productsCreated: 3, productsUpdated: 1 } });
    const rs = await rows(id);
    expect(rs[0].result).toMatchObject({ action: 'updated' });
    expect(rs[1].result).toMatchObject({ action: 'created', sku: 'DUP-B-S-2' });
    expect(rs[1].result.notes.join(' ')).toMatch(/already taken/);
    expect((await product('DUP-A')).title).toBe('CSV Tee A'); // updated
    expect((await product('DUP-B')).title).toBe('Existing Tee B'); // untouched
    expect((await product('DUP-B-2')).variants[0].sku).toBe('DUP-B-S-2');
  });

  it('the decision survives a revalidation and beats the global strategy', async () => {
    expect((await c.post('/api/v1/products', { productCode: 'DUP-R', title: 'Existing R', variants: [{ sku: 'DUP-R-S', sellingPriceMinor: 10000 }] }, admin)).status).toBe(201);
    const id = await newImport(`${H}\nDUP-R-S,DUP-R,CSV R,150,,\n`, { duplicateStrategy: 'ask' });
    await validate(id);
    const [iss] = await issues(id);
    expect((await c.post(api(`/${id}/issues/${iss.id}`), { action: 'use_existing' }, admin)).status).toBe(200);
    await c.put(api(`/${id}/settings`), { duplicateStrategy: 'skip' }, admin); // global strategy would skip it
    await validate(id);
    expect((await rows(id))[0]).toMatchObject({ status: 'valid', plan: 'update', skipReason: null });
    expect(await commit(id)).toMatchObject({ results: { productsUpdated: 1 } });
  });

  it('create_new strategy creates every existing SKU as a new product; decisions only apply to duplicate SKU issues', async () => {
    expect((await c.post('/api/v1/products', { productCode: 'DUP-S', title: 'Existing S', variants: [{ sku: 'DUP-S-S', sellingPriceMinor: 10000 }] }, admin)).status).toBe(201);
    const id = await newImport(`${H}\nDUP-S-S,DUP-S,CSV S,150,,\n,,No sku row,10,,\n`, { duplicateStrategy: 'create_new' });
    await validate(id);
    const list = await issues(id);
    expect(list.map((i) => i.code)).toEqual(['missing_sku']);
    const bad = await c.post(api(`/${id}/issues/${list[0].id}`), { action: 'use_existing' }, admin);
    expect(bad.status).toBe(400);
    await c.post(api(`/${id}/issues/${list[0].id}`), { action: 'ignore' }, admin);
    expect(await commit(id)).toMatchObject({ results: { productsCreated: 1 } });
    expect((await rows(id))[0].result.sku).toBe('DUP-S-S-2');
  });

  it('permissions and tenant isolation', async () => {
    const id = await newImport(`${H}\nPERM-1,PERM-1,Perm,10,,\n`);
    expect((await c.post(api(`/${id}/issues/bulk`), { code: 'duplicate_sku', action: 'create_new' }, viewer)).status).toBe(403);
    expect((await c.post(api(`/${id}/issues/bulk`), { code: 'duplicate_sku', action: 'create_new' }, stranger)).status).toBe(404);
  });
});

describe('activity feed and revalidation progress', () => {
  it('records validation, resolutions and the commit, newest first, with paging', async () => {
    const id = await newImport(`${H}\nAC-1,AC-1,Active One,10,,\nAC-2,AC-2,,10,,\n`);
    await validate(id);
    const feed = (await c.get(api(`/${id}/activity`), admin)).body.data;
    expect(feed.items[0]).toMatchObject({ kind: 'stage', rowNumber: null });
    expect(feed.items.map((e: any) => e.kind)).toEqual(expect.arrayContaining(['row_validated', 'row_error']));
    expect(feed.items.find((e: any) => e.kind === 'row_error')).toMatchObject({ rowNumber: 3, sku: 'AC-2' });

    const [iss] = await issues(id);
    await c.post(api(`/${id}/issues/${iss.id}`), { action: 'custom_value', customValue: 'Active Two' }, admin);
    expect(((await c.get(api(`/${id}/activity?limit=1`), admin)).body.data).items[0].kind).toBe('issue_resolved');
    await c.post(api(`/${id}/revalidate`), {}, admin);
    await commit(id);
    const all = (await c.get(api(`/${id}/activity?limit=100`), admin)).body.data;
    expect(all.items.map((e: any) => e.kind)).toEqual(expect.arrayContaining(['row_created', 'issue_resolved', 'stage']));
    expect(all.items[0].message).toMatch(/Import finished: 2 created/);
    const ids = all.items.map((e: any) => Number(e.id));
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    const p1 = (await c.get(api(`/${id}/activity?limit=2`), admin)).body.data;
    expect(p1.items).toHaveLength(2);
    expect(p1.nextBefore).toBe(p1.items[1].id);
    const p2 = (await c.get(api(`/${id}/activity?limit=2&before=${p1.nextBefore}`), admin)).body.data;
    expect(Number(p2.items[0].id)).toBeLessThan(Number(p1.nextBefore));
    expect((await c.get(api(`/${id}/activity`), stranger)).status).toBe(404);
    expect((await c.get(api(`/${id}/activity`), viewer)).status).toBe(200);
  });

  it('revalidation reports progress and what the seller fixed', async () => {
    const id = await newImport(`${H}\nRV-1,RV-1,Fine,10,,\nRV-2,RV-2,,10,,\n`);
    const first = await validate(id);
    expect(first.revalidation).toMatchObject({ status: 'complete', total: 2, checked: 2, current: null, changes: [] });
    const [iss] = await issues(id);
    await c.post(api(`/${id}/issues/${iss.id}`), { action: 'custom_value', customValue: 'Fixed title' }, admin);
    const r = await c.post(api(`/${id}/revalidate`), {}, admin);
    expect(r.status).toBe(200);
    expect(r.body.data.revalidation).toMatchObject({ status: 'complete', total: 2, checked: 2, changes: [{ rowNumber: 3, field: 'title', from: null, to: 'Fixed title', outcome: 'passed' }] });
    expect((await c.get(api(`/${id}`), admin)).body.data.revalidation.changes).toHaveLength(1); // kept until the next revalidate
    const fresh = await newImport(`${H}\nRV-9,RV-9,Never validated,10,,\n`);
    expect((await c.get(api(`/${fresh}`), admin)).body.data.revalidation).toBeNull();
  });
});

describe('import from a marketplace', () => {
  let account: string;
  it('lists sources: connection, counts and whether they can be imported', async () => {
    mockControl.reset();
    const a = await c.post('/api/v1/marketplace-accounts', { marketplace: 'mock', displayName: 'Sandbox Store' }, admin);
    account = a.body.data.id;
    const pending = (await c.get(api('/marketplace-sources'), admin)).body.data.items;
    expect(pending[0]).toMatchObject({ accountId: account, marketplace: 'mock', displayName: 'Sandbox Store', mode: 'sandbox', connection: 'disconnected', canImport: false, importedProducts: 0, lastImportAt: null });
    expect((await c.post(`/api/v1/marketplace-accounts/${account}/authorize`, { credentials: { sellerId: 'DESIGN-1', apiKey: 'sandbox_key' } }, admin)).status).toBe(200);
    const items = (await c.get(api('/marketplace-sources'), staff)).body.data.items;
    expect(items[0]).toMatchObject({ connection: 'connected', canImport: true, productsAvailable: null });
    expect((await c.get(api('/marketplace-sources'), stranger)).body.data.items).toEqual([]);
    expect((await c.post(api('/from-marketplace'), { accountId: account }, viewer)).status).toBe(403);
    expect((await c.post(api('/from-marketplace'), { accountId: account }, stranger)).status).toBe(404);
  });

  it('builds an analyzed session from the connector catalogue that validates and commits like a file', async () => {
    const r = await c.post(api('/from-marketplace'), { accountId: account }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const s = r.body.data;
    expect(s).toMatchObject({ source: 'marketplace', fileName: 'Sandbox Store catalog', status: 'analyzed', uiStatus: 'mapping', counters: { total: 25 }, settings: { currencyUnit: 'paise' } });
    const mapping = (await c.get(api(`/${s.id}/mapping`), admin)).body.data;
    expect(mapping.missingRequired).toEqual([]);
    expect(Object.keys(mapping.mapping)).toEqual(expect.arrayContaining(['sku', 'title', 'sellingPrice', 'stock']));
    const v = await validate(s.id);
    expect(v).toMatchObject({ status: 'validated', counters: { total: 25 } });
    const done = await commit(s.id, 'clean_only');
    expect(done.results.productsCreated).toBe(25);
    const p = await product('MOCK-DESIGN-1-SKU-001');
    expect(p).toMatchObject({ title: 'Sandbox Product 1', brand: 'SandboxBasics' });
    expect(p.variants[0]).toMatchObject({ sellingPriceMinor: 50900 });
    const src = (await c.get(api('/marketplace-sources'), admin)).body.data.items[0];
    expect(src.lastImportAt).not.toBeNull();
  });

  it('a larger catalogue runs as a job (202) and a second call returns the same running session', async () => {
    const limits = LIMITS as unknown as { marketplaceInlineProducts: number };
    const before = limits.marketplaceInlineProducts;
    limits.marketplaceInlineProducts = 10;
    try {
      const a2 = await c.post('/api/v1/marketplace-accounts', { marketplace: 'mock', displayName: 'Second Sandbox' }, admin);
      await c.post(`/api/v1/marketplace-accounts/${a2.body.data.id}/authorize`, { credentials: { sellerId: 'DESIGN-2', apiKey: 'sandbox_key' } }, admin);
      const first = await c.post(api('/from-marketplace'), { accountId: a2.body.data.id }, admin);
      expect(first.status, JSON.stringify(first.body)).toBe(202);
      expect(first.body.data).toMatchObject({ status: 'uploaded', uiStatus: 'analyzing', source: 'marketplace' });
      const again = await c.post(api('/from-marketplace'), { accountId: a2.body.data.id }, admin);
      expect(again.status).toBe(202);
      expect(again.body.data.id).toBe(first.body.data.id);
      expect((await c.post(api(`/${first.body.data.id}/validate`), {}, admin)).status).toBe(409); // not read yet
      await t.runJobs();
      expect((await c.get(api(`/${first.body.data.id}`), admin)).body.data).toMatchObject({ status: 'analyzed', counters: { total: 25 } });
    } finally { limits.marketplaceInlineProducts = before; }
  });

  it('refuses a disconnected account', async () => {
    const a3 = await c.post('/api/v1/marketplace-accounts', { marketplace: 'mock', displayName: 'Not connected' }, admin);
    expect((await c.post(api('/from-marketplace'), { accountId: a3.body.data.id }, admin)).status).toBeGreaterThanOrEqual(400);
  });
});

const HC = `${H},Category`;

describe('plan, scope and mapping reset', () => {
  it('derives scope, plan and distinct products from the rows and the duplicate decisions', async () => {
    expect((await c.post('/api/v1/products', { productCode: 'PL-X', title: 'Plan Existing', variants: [{ sku: 'PL-X-S', sellingPriceMinor: 10000 }] }, admin)).status).toBe(201);
    const id = await newImport(`${H}\nPL-X-S,PL-X,Plan Tee,150,,\nPL-N1,PL-G,Group S,99,,\nPL-N2,PL-G,Group M,99,,\n`, { duplicateStrategy: 'ask' });
    expect((await c.get(api(`/${id}`), admin)).body.data).toMatchObject({ scope: { products: 0, newProducts: 0, updates: 0 }, products: 0 }); // before validation
    const v = await validate(id);
    expect(v).toMatchObject({ products: 2, scope: { products: 1, newProducts: 1, updates: 0 }, plan: { create: 2, update: 0, addVariant: 0, skip: 0 } });
    const [dup] = await issues(id, '&filter[code]=duplicate_sku');
    expect(dup.duplicateMatch).toEqual({ existingSku: 'PL-X-S', existingTitle: 'Plan Existing', confidence: 'high', reason: expect.stringContaining('different title') });
    expect((await c.post(api(`/${id}/issues/${dup.id}`), { action: 'use_existing' }, admin)).status).toBe(200);
    const expected = { products: 2, scope: { products: 2, newProducts: 1, updates: 1 }, plan: { create: 2, update: 1, addVariant: 0, skip: 0 } };
    expect((await c.get(api(`/${id}`), admin)).body.data).toMatchObject(expected);
    expect((await c.get(api(`/${id}/summary`), admin)).body.data).toMatchObject(expected);
    // switching the decision re-plans
    expect((await c.post(api(`/${id}/issues/${dup.id}`), { action: 'create_new' }, admin)).status).toBe(200);
    expect((await c.get(api(`/${id}/summary`), admin)).body.data).toMatchObject({ scope: { products: 2, newProducts: 2, updates: 0 }, plan: { create: 3, update: 0 } });
  });

  it('every column carries its automatic suggestion, whatever the seller changed', async () => {
    const id = await newImport(`${H}\nMP-1,MP-1,Mapping,10,1,\n`);
    const before = (await c.get(api(`/${id}/mapping`), admin)).body.data.columns as any[];
    const sku = before.find((x) => x.sourceColumn === 'SKU');
    expect(sku).toMatchObject({ targetField: 'sku', autoTargetField: 'sku' });
    await c.put(api(`/${id}/mapping`), { sourceColumn: 'SKU', targetField: null }, admin);
    const after = (await c.get(api(`/${id}/mapping`), admin)).body.data.columns as any[];
    expect(after.find((x) => x.sourceColumn === 'SKU')).toMatchObject({ targetField: null, autoTargetField: 'sku' });
  });
});

describe('review screen data', () => {
  it('suggestions say how sure they are; every issue explains why it matters and its impact', async () => {
    const cat = await c.post('/api/v1/categories', { name: 'Kurtas' }, admin);
    expect(cat.status).toBe(201);
    const id = await newImport(`${HC}\nRC-1,RC-1,Cat Row,10,,,Kurtaz\nRC-2,RC-2,,10,,,\n`);
    await validate(id);
    const list = await issues(id);
    const catIssue = list.find((i) => i.code === 'category_unmapped');
    expect(catIssue.suggestion).toMatchObject({ kind: 'map_category', confidence: expect.stringMatching(/^(high|medium|low)$/), confidenceReason: expect.stringMatching(/match/) });
    const title = list.find((i) => i.code === 'missing_title');
    expect(title.whyItMatters.length).toBeGreaterThan(20);
    expect(title.impact).toMatch(/not imported/);
    expect(catIssue.whyItMatters).not.toBe(title.whyItMatters);
    expect(catIssue.impact).not.toBe(title.impact);
    expect(title.duplicateMatch).toBeNull();
  });

  it('lists issues filtered by field and sorted, echoing the sort', async () => {
    const id = await newImport(`${H}\nSO-1,SO-1,,10,,\nSO-2,SO-2,Has image problem,10,,not a url\nSO-3,SO-3,,10,,\n`);
    await validate(id);
    const get = async (q: string) => (await c.get(api(`/${id}/issues?${q}`), admin)).body.data;
    const dflt = await get('');
    expect(dflt.sort).toBe('severity');
    expect(dflt.items.map((i: any) => [i.severity, i.rowNumber])).toEqual([['error', 2], ['error', 4], ['warning', 3]]);
    const desc = await get('sort=-severity');
    expect(desc).toMatchObject({ sort: '-severity' });
    expect(desc.items[0].severity).toBe('warning');
    expect((await get('sort=-row')).items.map((i: any) => i.rowNumber)).toEqual([4, 3, 2]);
    expect((await get('sort=code')).items.map((i: any) => i.code)).toEqual(['invalid_image', 'missing_title', 'missing_title']);
    const byField = await get('filter[field]=imageUrl');
    expect(byField).toMatchObject({ total: 1 });
    expect(byField.items[0].code).toBe('invalid_image');
    expect((await c.get(api(`/${id}/issues?sort=colour`), admin)).status).toBe(400);
  });
});

describe('image upload for an image issue', () => {
  it('stores the image, resolves the issue and the commit attaches it to the product', async () => {
    const { png } = await import('../helpers/image-fixtures');
    const id = await newImport(`${H}\nIM-1,IM-1,Picture Row,10,,not a url\n`);
    await validate(id);
    const [iss] = await issues(id);
    const bytes = png(400, 400);
    const up = await c.call('POST', api(`/${id}/issues/${iss.id}/image`), { as: admin, raw: bytes, contentType: 'image/png' });
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    expect(up.body.data.issue).toMatchObject({ status: 'resolved', resolution: { action: 'upload_image' } });
    expect(up.body.data.issues).toMatchObject({ open: 0, resolved: 1 });
    expect((await c.post(api(`/${id}/commit`), { mode: 'include_resolved' }, admin)).status).toBe(409); // revalidate first
    await c.post(api(`/${id}/revalidate`), {}, admin);
    const done = await commit(id);
    expect(done.status).toBe('committed');
    expect((await rows(id))[0].result.notes.join(' ')).toMatch(/Uploaded image attached/);
    const p = await product('IM-1');
    const docs = (await c.get(`/api/v1/products/${p.id}/documents`, admin)).body.data as any[];
    expect(docs.filter((d) => d.purpose === 'product_image' && !d.isPlaceholder)).toHaveLength(1);
  });

  it('refuses other types, big files, broken images, other issue codes, readers and other tenants', async () => {
    const { png } = await import('../helpers/image-fixtures');
    const id = await newImport(`${H}\nIX-1,IX-1,,10,,not a url\n`);
    await validate(id);
    const list = await issues(id);
    const image = list.find((i) => i.code === 'invalid_image');
    const title = list.find((i) => i.code === 'missing_title');
    const post = (issueId: string, raw: Buffer, contentType: string, as: Actor = admin) => c.call('POST', api(`/${id}/issues/${issueId}/image`), { as, raw, contentType });
    expect((await post(image.id, Buffer.from('GIF89a'), 'image/gif')).status).toBe(415);
    expect((await post(image.id, Buffer.alloc(5 * 1024 * 1024 + 200 * 1024, 1), 'image/png')).status).toBe(413);
    expect((await post(image.id, Buffer.from('not a png at all'), 'image/png')).status).toBe(415); // the bytes are not a PNG
    expect((await post(title.id, png(300, 300), 'image/png')).status).toBe(400);
    expect((await post(image.id, png(300, 300), 'image/png', viewer)).status).toBe(403);
    expect((await post(image.id, png(300, 300), 'image/png', stranger)).status).toBe(404);
  });
});

describe('changing an answer', () => {
  it('a resolved issue can be answered differently until the row is imported', async () => {
    const cat = await c.post('/api/v1/categories', { name: 'Shirts' }, admin);
    const other = await c.post('/api/v1/categories', { name: 'Jackets' }, admin);
    const id = await newImport(`${HC}\nCH-1,CH-1,Change Me,10,,,Shirtz\n`);
    await validate(id);
    const [iss] = await issues(id);
    const first = await c.post(api(`/${id}/issues/${iss.id}`), { action: 'accept_suggestion' }, admin);
    expect(first.body.data.issue.resolution).toMatchObject({ action: 'accept_suggestion', value: cat.body.data.id });
    expect((await c.post(api(`/${id}/issues/${iss.id}`), { action: 'accept_suggestion' }, admin)).status).toBe(409); // same answer: nothing to change
    const changed = await c.post(api(`/${id}/issues/${iss.id}`), { action: 'custom_value', customValue: 'Jackets' }, admin);
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.data.issue).toMatchObject({ status: 'resolved', resolution: { value: other.body.data.id } });
    expect(changed.body.data.issues).toMatchObject({ open: 0, resolved: 1 });
    // an ignored error comes back when the answer changes to a fix
    const ign = await newImport(`${H}\nCH-2,CH-2,,10,,\n`);
    await validate(ign);
    const [t0] = await issues(ign);
    await c.post(api(`/${ign}/issues/${t0.id}`), { action: 'ignore' }, admin);
    expect((await rows(ign))[0].status).toBe('ignored');
    const fixed = await c.post(api(`/${ign}/issues/${t0.id}`), { action: 'custom_value', customValue: 'Now titled' }, admin);
    expect(fixed.status).toBe(200);
    expect((await rows(ign))[0].status).toBe('valid');
    expect(fixed.body.data.counters.ignored).toBe(0);
    await c.post(api(`/${ign}/revalidate`), {}, admin);
    expect(await commit(ign)).toMatchObject({ status: 'committed', results: { productsCreated: 1 } });
    expect((await c.post(api(`/${ign}/issues/${t0.id}`), { action: 'custom_value', customValue: 'Too late' }, admin)).status).toBe(409);
  });
});

describe('notifications', () => {
  it('a finished import notifies with the counts and a link to the processing page', async () => {
    const id = await newImport(`${H}\nNT-1,NT-1,Notify One,10,,\nNT-2,NT-2,Notify Two,10,,\n`);
    await validate(id);
    await commit(id, 'clean_only');
    await t.pump();
    const list = (await c.get('/api/v1/notifications?limit=100', admin)).body.data.items as any[];
    const n = list.find((x) => x.type === 'import.finished' && x.actionUrl === `/products/import/${id}/processing`);
    expect(n, JSON.stringify(list.map((x) => x.type))).toBeTruthy();
    expect(n).toMatchObject({ title: 'Import finished: 2 created, 0 updated, 0 failed', category: 'system', severity: 'info' });
    const types = (await c.get('/api/v1/notifications/types', admin)).body.data.map((x: any) => x.type);
    expect(types).toEqual(expect.arrayContaining(['import.finished', 'import.failed']));
  });
});
