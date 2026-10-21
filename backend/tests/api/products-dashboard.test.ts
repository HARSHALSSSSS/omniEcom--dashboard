import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, PNG_1x1, type Actor, type TestApp } from '@oms/testing';
import { buildWorld, orderArrives, type World } from '../helpers/stage4';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
let w: World;
let admin: Actor;
let viewer: Actor;
let staff: Actor;
let other: Actor;
let whId: string;
let catBags: string;
let catShoes: string;

/** product code -> { productId, variants: { sku -> variantId } } */
const P: Record<string, { id: string; v: Record<string, string> }> = {};
const WPC = 'P-STAGE-TEE'; // product code of the world's product
const FAKE = '00000000-0000-4000-8000-000000000000';

const owner = async (q: string, params: unknown[] = []) => {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { return await pg.query<any>(q, params); } finally { await pg.exec('SET ROLE oms_app'); }
};

const addImage = async (productId: string, variantId?: string) => {
  const reg = await c.post(`/api/v1/products/${productId}/documents`, { fileName: 'front.png', mimeType: 'image/png', sizeBytes: PNG_1x1.length, ...(variantId ? { variantId } : {}) }, admin);
  expect(reg.status, JSON.stringify(reg.body)).toBe(201);
  const up = await c.call('POST', reg.body.data.upload.url, { as: admin, raw: PNG_1x1, contentType: 'image/png' });
  expect(up.status, JSON.stringify(up.body)).toBe(200);
  return up.body.data.id as string;
};

interface VariantSpec { sku: string; color?: string; size?: string; stock?: number; status?: 'active' | 'inactive'; barcode?: string }
const mk = async (code: string, o: { status?: 'draft' | 'active' | 'archived'; cat?: string | null; image?: boolean; desc?: boolean; title?: string; variants: VariantSpec[] }) => {
  const wantArchived = o.status === 'archived';
  const r = await c.post('/api/v1/products', {
    productCode: code, title: o.title ?? `Product ${code} title`, brand: 'Acme', countryOfOrigin: 'IN', hsnCode: '6109', gstRateBps: 1200,
    ...(o.desc === false ? {} : { description: 'A long enough description text' }),
    ...(o.cat ? { categoryId: o.cat } : {}),
    ...(o.status === 'active' ? { status: 'active' } : {}),
    variants: o.variants.map((v) => ({
      sku: v.sku, sellingPriceMinor: 49900, mrpMinor: 59900, optionValues: { ...(v.color ? { color: v.color } : {}), ...(v.size ? { size: v.size } : {}) },
      ...(v.status ? { status: v.status } : {}), ...(v.barcode ? { barcode: v.barcode } : {}),
    })),
  }, admin);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const entry = { id: r.body.data.id as string, v: Object.fromEntries((r.body.data.variants as any[]).map((v) => [v.sku, v.id])) };
  P[code] = entry;
  for (const v of o.variants) if (v.stock) await c.stock(admin, entry.v[v.sku]!, whId, v.stock);
  if (o.image) await addImage(entry.id);
  if (wantArchived) expect((await c.patch(`/api/v1/products/${entry.id}`, { status: 'archived' }, admin)).status).toBe(200);
  return entry;
};

const createListing = async (variantId: string) => {
  const r = await c.post('/api/v1/listings', { marketplaceAccountId: w.account.id, variantId, marketplaceCategoryId: 'mock-apparel' }, admin);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.data.id as string;
};

const catalog = async (qs = '', as: Actor = admin) => {
  const r = await c.get(`/api/v1/products/catalog${qs ? `?${qs}` : ''}`, as);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data as { items: any[]; page: number; pageSize: number; total: number; pages: number };
};
const codes = (items: any[]) => items.map((i) => i.productCode as string).sort();
const stats = async (qs = '', as: Actor = admin) => (await c.get(`/api/v1/products/stats${qs ? `?${qs}` : ''}`, as)).body.data;
const wc = (c1: string) => P[c1]!;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  w = await buildWorld(t, c, { warehouses: 1, stock: [30], sku: 'STAGE-TEE' });
  admin = w.admin;
  whId = w.warehouses[0]!.id;
  viewer = await c.addMember(admin, 'vendor_viewer');
  staff = await c.addMember(admin, 'vendor_staff');
  other = await c.registerVendor({ businessName: 'Someone Else' });
  catBags = (await c.post('/api/v1/categories', { name: 'Bags' }, admin)).body.data.id;
  catShoes = (await c.post('/api/v1/categories', { name: 'Shoes' }, admin)).body.data.id;

  // the world's product: active, 30 units, a live mock listing; then 27 units sold -> 3 available (low) with sales in the last 30 days
  const wp = (await c.get(`/api/v1/variants?sku=${w.variant.sku}`, admin)).body.data[0];
  P['WP'] = { id: wp.productId, v: { [w.variant.sku]: w.variant.variantId } };
  await orderArrives(t, c, w, 27);

  await mk('HEALTHY', { status: 'active', cat: catBags, image: true, variants: [{ sku: 'HEALTHY-1', color: 'Black', size: 'L', stock: 50, barcode: '8901234567890' }] });
  await mk('LOWSTK', { status: 'active', cat: catBags, image: true, variants: [{ sku: 'LOW-1', color: 'Navy', size: 'L', stock: 3 }, { sku: 'LOW-2', color: 'Black', size: 'L', stock: 40 }] });
  await mk('OUTSTK', { status: 'active', cat: catShoes, image: true, variants: [{ sku: 'OUT-1', color: 'Red', size: '42' }] });
  await mk('DRAFT1', { cat: catBags, desc: false, variants: [{ sku: 'DRAFT-1' }] });
  await mk('DRAFT2', { cat: catShoes, image: false, variants: [{ sku: 'DRAFT-2' }] });
  await mk('ARCH1', { status: 'archived', cat: catShoes, image: true, variants: [{ sku: 'ARCH-1' }] });
  const h = await mk('LISTERR', { status: 'active', cat: catBags, image: true, variants: [{ sku: 'ERR-1', color: 'Green', size: 'M', stock: 20 }] });
  const listingId = await createListing(h.v['ERR-1']!);
  await owner(`update marketplace_listings set status = 'correction_required', last_error_code = 'MOCK_ERR' where id = $1`, [listingId]);
  await mk('GRID', {
    status: 'active', cat: catBags, image: true,
    variants: [
      { sku: 'GRID-BK-CAB', color: 'Black', size: 'Cabin', stock: 40 }, { sku: 'GRID-BK-LRG', color: 'Black', size: 'Large', stock: 0 },
      { sku: 'GRID-NV-CAB', color: 'Navy', size: 'Cabin', stock: 3 }, { sku: 'GRID-NV-LRG', color: 'Navy', size: 'Large', stock: 20 },
      { sku: 'GRID-X', color: 'Red', size: 'Cabin', status: 'inactive' },
    ],
  });
  // DRAFT2 is a draft with a description but no image; make one product digital for the productType filter
  expect((await c.patch(`/api/v1/products/${wc('DRAFT2').id}`, { productType: 'digital' }, admin)).status).toBe(200);
}, 120_000);
afterAll(() => t.close());

// ================================================================================================
describe('GET /products/stats and tab counts', () => {
  it('counts products, variants, active, draft, archived and needs attention; tabs equal the top-level numbers', async () => {
    const s = await stats();
    // WP, HEALTHY, LOWSTK, OUTSTK, LISTERR, GRID active; DRAFT1, DRAFT2 draft; ARCH1 archived
    expect(s).toMatchObject({ products: 9, activeProducts: 6, draft: 2, archived: 1 });
    // variants: WP1 + HEALTHY1 + LOWSTK2 + OUTSTK1 + DRAFT1 + DRAFT2 + ARCH1 + LISTERR1 + GRID5
    expect(s.variants).toBe(1 + 1 + 2 + 1 + 1 + 1 + 1 + 1 + 5);
    // active variants of active products: WP1 + HEALTHY1 + LOWSTK2 + OUTSTK1 + LISTERR1 + GRID4 (GRID-X is inactive)
    expect(s.activeVariants).toBe(1 + 1 + 2 + 1 + 1 + 4);
    // WP: active but no category / image (blocking checks); LISTERR: its listing needs correction
    expect(s.needsAttention).toBe(2);
    expect(s.tabs).toEqual({ all: 9, active: 6, draft: 2, archived: 1, needsAttention: 2 });
    expect([s.products, s.activeProducts, s.draft, s.archived, s.needsAttention]).toEqual([s.tabs.all, s.tabs.active, s.tabs.draft, s.tabs.archived, s.tabs.needsAttention]);
  });

  it('every tab count equals the total of the matching catalog filter', async () => {
    const s = await stats();
    expect((await catalog()).total).toBe(s.tabs.all);
    expect((await catalog('filter[status]=active')).total).toBe(s.tabs.active);
    expect((await catalog('filter[status]=draft')).total).toBe(s.tabs.draft);
    expect((await catalog('filter[status]=archived')).total).toBe(s.tabs.archived);
    expect((await catalog('filter[needsAttention]=true')).total).toBe(s.tabs.needsAttention);
  });

  it('narrows with the same filters (q, category, channel, inventory) and respects tenants', async () => {
    expect((await stats('q=LOWSTK')).tabs).toEqual({ all: 1, active: 1, draft: 0, archived: 0, needsAttention: 0 });
    const bags = await stats(`filter[categoryId]=${catBags}`);
    expect(bags.tabs).toMatchObject({ all: 5, draft: 1, needsAttention: 1 }); // HEALTHY, LOWSTK, LISTERR, GRID, DRAFT1
    expect((await stats('filter[channel]=mock')).tabs).toMatchObject({ all: 2, needsAttention: 2 }); // WP and LISTERR have mock listings
    const out = await stats('filter[inventory]=out');
    expect(out.tabs.all).toBe((await catalog('filter[inventory]=out')).total);
    expect((await stats('', other)).tabs).toEqual({ all: 0, active: 0, draft: 0, archived: 0, needsAttention: 0 });
    expect((await stats('', viewer)).products).toBe(9); // read permission is enough
    expect((await c.get('/api/v1/products/stats?filter[inventory]=nope', admin)).status).toBe(400);
  });
});

// ================================================================================================
describe('GET /products/catalog: filters, sort, pagination', () => {
  it('returns numbered pages with total/pages and rejects out-of-range paging', async () => {
    const p1 = await catalog('pageSize=4&page=1');
    expect(p1).toMatchObject({ page: 1, pageSize: 4, total: 9, pages: 3 });
    expect(p1.items).toHaveLength(4);
    const p3 = await catalog('pageSize=4&page=3');
    expect(p3.items).toHaveLength(1);
    expect(codes([...p1.items, ...(await catalog('pageSize=4&page=2')).items, ...p3.items])).toHaveLength(9);
    expect(new Set([...p1.items, ...(await catalog('pageSize=4&page=2')).items, ...p3.items].map((i) => i.id)).size).toBe(9);
    expect((await c.get('/api/v1/products/catalog?pageSize=101', admin)).status).toBe(400);
    expect((await c.get('/api/v1/products/catalog?page=0', admin)).status).toBe(400);
    const deep = await c.get('/api/v1/products/catalog?page=101&pageSize=100', admin); // offset 10,000 + 100 > the 10,000-row cap
    expect(deep.status).toBe(400);
    expect((await catalog('page=5&pageSize=50')).items).toHaveLength(0);
  });

  it('filters by status (single and repeated)', async () => {
    expect(codes((await catalog('filter[status]=draft')).items)).toEqual(['DRAFT1', 'DRAFT2']);
    expect(codes((await catalog('filter[status]=archived')).items)).toEqual(['ARCH1']);
    expect((await catalog('filter[status]=draft&filter[status]=archived')).total).toBe(3);
    expect((await c.get('/api/v1/products/catalog?filter[status]=bogus', admin)).status).toBe(400);
  });

  it('filters by category', async () => {
    expect(codes((await catalog(`filter[categoryId]=${catShoes}`)).items)).toEqual(['ARCH1', 'DRAFT2', 'OUTSTK']);
    expect((await catalog(`filter[categoryId]=${catShoes}&filter[categoryId]=${catBags}`)).total).toBe(8);
    expect((await c.get('/api/v1/products/catalog?filter[categoryId]=not-a-uuid', admin)).status).toBe(400);
  });

  it('filters by channel (marketplace code with a listing)', async () => {
    expect(codes((await catalog('filter[channel]=mock')).items)).toEqual(['LISTERR', WPC]);
    expect((await catalog('filter[channel]=amazon_in')).total).toBe(0);
  });

  it('filters by inventory band', async () => {
    expect(codes((await catalog('filter[inventory]=healthy')).items)).toEqual(['HEALTHY', 'LISTERR']);
    expect(codes((await catalog('filter[inventory]=low')).items)).toEqual(['GRID', 'LOWSTK', WPC]);
    expect(codes((await catalog('filter[inventory]=out')).items)).toEqual(['ARCH1', 'DRAFT1', 'DRAFT2', 'OUTSTK']);
    expect((await catalog('filter[inventory]=low&filter[inventory]=out')).total).toBe(7);
  });

  it('filters by product type and needs attention', async () => {
    expect(codes((await catalog('filter[productType]=digital')).items)).toEqual(['DRAFT2']);
    expect((await catalog('filter[productType]=physical')).total).toBe(8);
    expect((await c.get('/api/v1/products/catalog?filter[productType]=bogus', admin)).status).toBe(400);
    expect(codes((await catalog('filter[needsAttention]=true')).items)).toEqual(['LISTERR', WPC]);
    expect((await catalog('filter[needsAttention]=false')).total).toBe(9);
  });

  it('searches name, SKU family, variant SKU and barcode; wildcards are escaped', async () => {
    expect(codes((await catalog('q=lowstk')).items)).toEqual(['LOWSTK']); // product code / title, case-insensitive
    expect(codes((await catalog('q=LOW-2')).items)).toEqual(['LOWSTK']); // variant SKU
    expect(codes((await catalog('q=89012345')).items)).toEqual(['HEALTHY']); // barcode
    expect(codes((await catalog('q=Product%20OUTSTK')).items)).toEqual(['OUTSTK']); // title
    expect((await catalog('q=%25')).total).toBe(0); // a literal % matches nothing instead of everything
    expect((await catalog('q=_')).total).toBe(0);
    expect((await catalog('q=nothing-matches-this')).total).toBe(0);
    expect(codes((await catalog('q=DRAFT&filter[status]=draft')).items)).toEqual(['DRAFT1', 'DRAFT2']); // filters combine
  });

  it('sorts by updatedAt (default, newest first), title, sku and inventory, in both directions', async () => {
    const def = (await catalog('pageSize=50')).items;
    const times = def.map((i) => Date.parse(i.updatedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    const byTitle = (await catalog('pageSize=50&sort=title')).items.map((i) => i.title.toLowerCase());
    expect(byTitle).toEqual([...byTitle].sort());
    const byTitleDesc = (await catalog('pageSize=50&sort=-title')).items.map((i) => i.title.toLowerCase());
    expect(byTitleDesc).toEqual([...byTitle].reverse());
    const bySku = (await catalog('pageSize=50&sort=sku')).items.map((i) => i.productCode.toLowerCase());
    expect(bySku).toEqual([...bySku].sort());
    expect((await catalog('pageSize=50&sort=-sku')).items.map((i) => i.productCode.toLowerCase())).toEqual([...bySku].reverse());
    const inv = (await catalog('pageSize=50&sort=-inventory')).items;
    expect(inv.slice(0, 3).map((i) => i.productCode)).toEqual(['GRID', 'HEALTHY', 'LOWSTK']); // 63, 50, 43
    expect(inv.map((i) => i.summary.availableUnits)).toEqual([...inv.map((i) => i.summary.availableUnits)].sort((a, b) => b - a));
    expect((await catalog('pageSize=50&sort=inventory')).items[0].summary.availableUnits).toBe(0);
    expect((await c.get('/api/v1/products/catalog?sort=-nope', admin)).status).toBe(400);
  });

  it('keeps product core fields and the old shapes', async () => {
    const item = (await catalog('q=HEALTHY')).items[0];
    expect(item).toMatchObject({ productCode: 'HEALTHY', status: 'active', productType: 'physical', variantCount: 1, brand: 'Acme', categoryId: catBags, version: 1 });
    expect(Object.keys(item)).toEqual(expect.arrayContaining(['id', 'title', 'description', 'tags', 'createdAt', 'updatedAt', 'summary']));
  });
});

// ================================================================================================
describe('catalog card summaries (one per state)', () => {
  const byCode = async () => Object.fromEntries((await catalog('pageSize=50')).items.map((i) => [i.productCode, i.summary])) as Record<string, any>;

  it('Active and healthy: units, readiness, thumbnail, open product', async () => {
    const s = (await byCode()).HEALTHY;
    expect(s).toMatchObject({ skuFamily: 'HEALTHY', variantCount: 1, availableUnits: 50, inventoryStatus: 'healthy', publishReadinessPct: 100, channels: [] });
    expect(s.thumbnailUrl).toMatch(/^\/api\/v1\/documents\/[0-9a-f-]+\/content$/);
    expect(s.primaryAction).toEqual({ key: 'open', href: `/products/${wc('HEALTHY').id}` });
    expect(s.hint.key).toBe('healthy');
    expect((await c.get(s.thumbnailUrl, viewer)).status).toBe(200); // the thumbnail route serves the image
  });

  it('Active with a listing that needs attention: "1 listing needs attention" / open', async () => {
    const s = (await byCode()).LISTERR;
    expect(s).toMatchObject({ availableUnits: 20, inventoryStatus: 'healthy', hint: { key: 'listing_attention', text: '1 listing needs attention' }, primaryAction: { key: 'open' } });
    expect(s.channels).toEqual([expect.objectContaining({ code: 'mock', listingStatus: 'attention' })]);
    expect(s.channels[0].name).toBeTruthy();
  });

  it('Low stock with sales: "Stock coverage: N days" / review inventory; the channel list shows the live listing', async () => {
    const s = (await byCode())[WPC]!;
    // 30 units, 27 sold (reserved) -> 3 available; 27 units in 30 days = 0.9 / day -> 3 days
    expect(s).toMatchObject({ availableUnits: 3, inventoryStatus: 'low', hint: { key: 'low_stock_coverage', text: 'Stock coverage: 3 days' }, primaryAction: { key: 'review_inventory', href: `/products/${wc('WP').id}?tab=inventory` } });
    expect(s.channels).toEqual([expect.objectContaining({ code: 'mock', listingStatus: 'active' })]);
    expect(s.publishReadinessPct).toBe(82); // 9 of 11 core checks: no category, no image
    expect(s.thumbnailUrl).toBeNull();
  });

  it('Low stock without sales: no invented coverage number', async () => {
    const s = (await byCode()).LOWSTK;
    expect(s).toMatchObject({ availableUnits: 43, inventoryStatus: 'low', hint: { key: 'low_stock', text: 'Stock is running low' }, primaryAction: { key: 'review_inventory' } });
  });

  it('Out of stock: "Potential lost sales" / update inventory', async () => {
    expect((await byCode()).OUTSTK).toMatchObject({ availableUnits: 0, inventoryStatus: 'out', hint: { key: 'out_of_stock', text: 'Potential lost sales' }, primaryAction: { key: 'update_inventory' } });
  });

  it('Draft: what is missing + publish readiness % / continue editing', async () => {
    const s = await byCode();
    expect(s.DRAFT1).toMatchObject({ publishReadinessPct: 82, hint: { text: 'Images and description missing' }, primaryAction: { key: 'continue_editing', href: `/products/${wc('DRAFT1').id}/edit` } });
    expect(s.DRAFT2).toMatchObject({ publishReadinessPct: 91, hint: { text: 'Images missing' }, primaryAction: { key: 'continue_editing' } });
  });

  it('Archived: neutral hint, open product', async () => {
    expect((await byCode()).ARCH1).toMatchObject({ hint: { key: 'archived' }, primaryAction: { key: 'open' } });
  });
});

// ================================================================================================
describe('product details: overview', () => {
  it('Active product with a live listing but incomplete content: real numbers, disabled publish', async () => {
    const r = await c.get(`/api/v1/products/${wc('WP').id}/overview`, admin);
    expect(r.status).toBe(200);
    const o = r.body.data;
    expect(o.product).toMatchObject({ id: wc('WP').id, status: 'active', category: null, variantCount: 1, skuFamily: expect.any(String) });
    expect(o.health.state).toBe('incomplete');
    expect(o.health.missing).toEqual(expect.arrayContaining(['category', 'image']));
    expect(o.inventory).toMatchObject({ available: 3, reserved: 27, incoming: 0, lowStockVariants: 1, status: 'low' });
    expect(o.inventory.byWarehouse).toEqual([expect.objectContaining({ warehouseId: whId, available: 3 })]);
    expect(o.variants).toMatchObject({ count: 1, sellable: 1, options: { color: ['Blue'], size: ['M'] } });
    expect(o.variants.items[0]).toMatchObject({ sku: w.variant.sku, available: 3, stockStatus: 'low', status: 'active' });
    expect(o.channels).toMatchObject({ connected: 1, active: 1, attention: 0 });
    expect(o.channels.items[0]).toMatchObject({ listingStatus: 'active', channel: { code: 'mock', accountId: w.account.id } });
    expect(o.content).toMatchObject({ pct: 82, marketplaceContent: 'ok' });
    expect(o.content.fields).toEqual(expect.arrayContaining([{ key: 'images', state: 'missing' }, { key: 'title', state: 'complete' }]));
    expect(o.statusPanel).toMatchObject({ catalog: 'incomplete', inventory: 'low', listings: { state: 'published', active: 1, attention: 0 }, content: { pct: 82 } });
    expect(o.attentionBanner).toMatchObject({ key: 'product_incomplete' });
    expect(o.media).toEqual({ total: 0, items: [] });
    expect(o.primaryImage).toBeNull();
    const publish = o.actions.find((a: any) => a.key === 'publish_product');
    expect(publish).toMatchObject({ enabled: false, disabledReason: 'readiness_incomplete', method: 'POST' });
    expect(o.recentActivity.length).toBeGreaterThan(0);
    expect(o.recentActivity.length).toBeLessThanOrEqual(4);
  });

  it('Ready product: publish enabled, media, no banner', async () => {
    const o = (await c.get(`/api/v1/products/${wc('HEALTHY').id}/overview`, admin)).body.data;
    expect(o.health).toMatchObject({ state: 'ready', missing: [] });
    expect(o.attentionBanner).toBeNull();
    expect(o.actions.find((a: any) => a.key === 'publish_product')).toMatchObject({ enabled: true, disabledReason: null });
    expect(o.media.total).toBe(1);
    expect(o.primaryImage.url).toBe(o.media.items[0].url);
    expect(o.media.items[0]).toMatchObject({ isPrimary: true, fileName: 'front.png' });
    expect(o.content).toMatchObject({ pct: 100, marketplaceContent: 'not_published' });
    expect(o.inventory).toMatchObject({ available: 50, status: 'healthy', lowStockVariants: 0 });
    expect(o.product.category).toMatchObject({ id: catBags, name: 'Bags' });
  });

  it('Draft / unpublished: 0 channels, "not published", publish disabled', async () => {
    const o = (await c.get(`/api/v1/products/${wc('DRAFT1').id}/overview`, admin)).body.data;
    expect(o.product.status).toBe('draft');
    expect(o.health.state).toBe('incomplete');
    expect(o.channels).toMatchObject({ connected: 0, active: 0, attention: 0, items: [] });
    expect(o.statusPanel).toMatchObject({ catalog: 'incomplete', listings: { state: 'not_published', active: 0, attention: 0 }, syncLastAt: null });
    expect(o.attentionBanner).toMatchObject({ key: 'product_incomplete', action: { key: 'complete_product' } });
    expect(o.actions.find((a: any) => a.key === 'publish_product').enabled).toBe(false);
  });

  it('A listing that needs correction becomes the attention banner', async () => {
    const o = (await c.get(`/api/v1/products/${wc('LISTERR').id}/overview`, admin)).body.data;
    expect(o.channels).toMatchObject({ connected: 1, active: 0, attention: 1 });
    expect(o.attentionBanner.key).toBe('listing_attention');
    expect(o.attentionBanner.text).toMatch(/listing requires review$/);
    expect(o.statusPanel.listings).toEqual({ state: 'published', active: 0, attention: 1 });
    expect(o.channels.items[0]).toMatchObject({ listingStatus: 'attention', action: { key: 'review' } });
    expect(o.content.marketplaceContent).toBe('needs_review');
  });

  it('is tenant-isolated and permission-checked; unknown id is 404', async () => {
    expect((await c.get(`/api/v1/products/${wc('WP').id}/overview`, other)).status).toBe(404);
    expect((await c.get(`/api/v1/products/${FAKE}/overview`, admin)).status).toBe(404);
    expect((await c.get(`/api/v1/products/${wc('WP').id}/overview`, viewer)).status).toBe(200);
    expect((await c.get(`/api/v1/products/${wc('WP').id}/overview`)).status).toBe(401);
    expect((await c.get('/api/v1/products/not-a-uuid/overview', admin)).status).toBe(400);
  });
});

describe('product details: inventory, listings, content tabs', () => {
  it('inventory: totals, health, by variant, by warehouse and the low-stock callout', async () => {
    const r = await c.get(`/api/v1/products/${wc('LOWSTK').id}/inventory`, admin);
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.totals).toEqual({ available: 43, reserved: 0, incoming: 0, lowStockVariants: 1 });
    expect(d.health).toMatchObject({ status: 'low', variants: 2, lowStockThreshold: 5 });
    expect(d.byVariant.map((v: any) => [v.sku, v.available, v.status])).toEqual([['LOW-1', 3, 'low'], ['LOW-2', 40, 'healthy']]);
    expect(d.byVariant[0].name).toBe('Navy / L');
    expect(d.byWarehouse).toEqual([expect.objectContaining({ warehouseId: whId, available: 43, onHand: 43, reserved: 0 })]);
    expect(d.lowStock).toEqual({ count: 1, variants: [expect.objectContaining({ sku: 'LOW-1', available: 3, status: 'low' })] });
    // healthy product: no callout; out-of-stock product: everything out
    expect((await c.get(`/api/v1/products/${wc('HEALTHY').id}/inventory`, admin)).body.data).toMatchObject({ lowStock: null, health: { status: 'healthy' } });
    expect((await c.get(`/api/v1/products/${wc('OUTSTK').id}/inventory`, admin)).body.data).toMatchObject({ totals: { available: 0, lowStockVariants: 1 }, health: { status: 'out' }, lowStock: { count: 1 } });
    // reserved stock of the sold product
    expect((await c.get(`/api/v1/products/${wc('WP').id}/inventory`, admin)).body.data.totals).toEqual({ available: 3, reserved: 27, incoming: 0, lowStockVariants: 1 });
    expect((await c.get(`/api/v1/products/${wc('LOWSTK').id}/inventory`, other)).status).toBe(404);
  });

  it('inventory: a per-warehouse reorder level overrides the business threshold', async () => {
    // HEALTHY has 50 units; a reorder level of 60 makes it low for this variant only
    await owner(`update inventory set reorder_level = 60 where variant_id = $1`, [wc('HEALTHY').v['HEALTHY-1']]);
    const d = (await c.get(`/api/v1/products/${wc('HEALTHY').id}/inventory`, admin)).body.data;
    expect(d.byVariant[0]).toMatchObject({ threshold: 60, status: 'low' });
    expect((await catalog('q=HEALTHY')).items[0].summary.inventoryStatus).toBe('low');
    await owner(`update inventory set reorder_level = null where variant_id = $1`, [wc('HEALTHY').v['HEALTHY-1']]);
    expect((await catalog('q=HEALTHY')).items[0].summary.inventoryStatus).toBe('healthy');
  });

  it('listings: summary, per-listing rows and the error of a failing listing', async () => {
    const ok = (await c.get(`/api/v1/products/${wc('WP').id}/listings`, admin)).body.data;
    expect(ok.summary).toMatchObject({ connected: 1, active: 1, attention: 0 });
    expect(ok.publicationModel).toBe('master>listing>marketplace');
    expect(ok.items).toEqual([expect.objectContaining({ listingId: w.variant.listingId, variantId: w.variant.variantId, sku: w.variant.sku, status: 'active', error: null, channel: expect.objectContaining({ code: 'mock' }) })]);
    expect(ok.channels).toEqual([expect.objectContaining({ listingStatus: 'active', listings: 1 })]);
    const bad = (await c.get(`/api/v1/products/${wc('LISTERR').id}/listings`, admin)).body.data;
    expect(bad.summary).toMatchObject({ connected: 1, active: 0, attention: 1 });
    expect(bad.items[0]).toMatchObject({ status: 'attention', rawStatus: 'correction_required', error: 'MOCK_ERR' });
    const none = (await c.get(`/api/v1/products/${wc('DRAFT1').id}/listings`, admin)).body.data;
    expect(none).toMatchObject({ summary: { connected: 0, active: 0, attention: 0, lastSyncAt: null }, items: [], channels: [] });
    expect((await c.get(`/api/v1/products/${wc('WP').id}/listings`, other)).status).toBe(404);
  });

  it('content: readiness per field, master attributes and marketplace content per channel', async () => {
    const d = (await c.get(`/api/v1/products/${wc('DRAFT1').id}/content`, admin)).body.data;
    expect(d.readiness).toMatchObject({ pct: 82, ready: false });
    expect(Object.fromEntries(d.readiness.fields.map((f: any) => [f.key, f.state]))).toEqual({ title: 'complete', description: 'missing', images: 'missing', attributes: 'complete', marketplace_content: 'not_published' });
    expect(d.masterAttributes.find((a: any) => a.attribute === 'description')).toMatchObject({ value: null, state: 'missing' });
    expect(d.masterAttributes.find((a: any) => a.attribute === 'brand')).toMatchObject({ value: 'Acme', state: 'complete' });
    expect(d.marketplaceContent).toEqual([]);

    // marketplace-specific data shows up per channel
    expect((await c.put(`/api/v1/products/${wc('WP').id}/marketplace-data/mock`, { data: { bullet_points: ['a'] } }, admin)).status).toBe(200);
    const wp = (await c.get(`/api/v1/products/${wc('WP').id}/content`, admin)).body.data;
    expect(wp.marketplaceContent).toEqual([expect.objectContaining({ channel: expect.objectContaining({ code: 'mock' }), hasMasterData: true, state: 'ok', issues: [] })]);
    expect(wp.readiness.fields.find((f: any) => f.key === 'marketplace_content').state).toBe('ok');
    const bad = (await c.get(`/api/v1/products/${wc('LISTERR').id}/content`, admin)).body.data;
    expect(bad.marketplaceContent[0]).toMatchObject({ state: 'needs_review', hasMasterData: false });
    expect((await c.get(`/api/v1/products/${wc('WP').id}/content`, other)).status).toBe(404);
  });
});

// ================================================================================================
describe('product activity feed', () => {
  it('merges audit, inventory movements and listing events, newest first, with structured params', async () => {
    const r = await c.get(`/api/v1/products/${wc('WP').id}/activity?pageSize=50`, admin);
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.total).toBe(d.items.length);
    const types = new Set(d.items.map((i: any) => i.type));
    expect(types).toEqual(new Set(['inventory', 'content', 'listings']));
    const times = d.items.map((i: any) => Date.parse(i.at));
    expect(times).toEqual([...times].sort((a: number, b: number) => b - a));
    const created = d.items.find((i: any) => i.event === 'product.create');
    expect(created).toMatchObject({ type: 'content', text: 'Product created', actor: { type: 'user', id: admin.userId, name: 'Asha Admin' } });
    const receive = d.items.find((i: any) => i.event === 'inventory.receive');
    expect(receive).toMatchObject({ type: 'inventory', params: expect.objectContaining({ sku: w.variant.sku, deltaOnHand: 30 }) });
    expect(receive.text).toContain('+30');
    expect(d.items.some((i: any) => i.event === 'inventory.reserve')).toBe(true);
    expect(d.items.some((i: any) => i.type === 'listings' && i.event.startsWith('listing.'))).toBe(true);
    // every row is complete
    for (const i of d.items) expect(i).toEqual(expect.objectContaining({ at: expect.any(String), type: expect.any(String), event: expect.any(String), text: expect.any(String), params: expect.any(Object) }));
  });

  it('scopes: master, variants, channels; and pages', async () => {
    await c.post(`/api/v1/products/${wc('WP').id}/variants`, { sku: 'WP-EXTRA', optionValues: { color: 'Blue', size: 'L' }, sellingPriceMinor: 49900, mrpMinor: 59900 }, admin);
    const all = (await c.get(`/api/v1/products/${wc('WP').id}/activity?pageSize=100`, admin)).body.data;
    const master = (await c.get(`/api/v1/products/${wc('WP').id}/activity?scope=master&pageSize=100`, admin)).body.data;
    const variants = (await c.get(`/api/v1/products/${wc('WP').id}/activity?scope=variants`, admin)).body.data;
    const channels = (await c.get(`/api/v1/products/${wc('WP').id}/activity?scope=channels&pageSize=100`, admin)).body.data;
    expect(master.items.every((i: any) => ['content', 'inventory'].includes(i.type))).toBe(true);
    expect(variants.items.map((i: any) => i.event)).toEqual(['variant.create']);
    expect(variants.items[0]).toMatchObject({ type: 'variants', text: 'Variant added (WP-EXTRA)', params: { sku: 'WP-EXTRA' } });
    expect(channels.items.length).toBeGreaterThan(0);
    expect(channels.items.every((i: any) => i.type === 'listings')).toBe(true);
    expect(master.total + variants.total + channels.total).toBe(all.total);
    const p1 = (await c.get(`/api/v1/products/${wc('WP').id}/activity?pageSize=2&page=1`, admin)).body.data;
    const p2 = (await c.get(`/api/v1/products/${wc('WP').id}/activity?pageSize=2&page=2`, admin)).body.data;
    expect(p1).toMatchObject({ page: 1, pageSize: 2, total: all.total });
    expect([...p1.items, ...p2.items].map((i: any) => i.at + i.event)).toEqual(all.items.slice(0, 4).map((i: any) => i.at + i.event));
    expect((await c.get(`/api/v1/products/${wc('WP').id}/activity?scope=bogus`, admin)).status).toBe(400);
  });

  it('does not show other products or tenants', async () => {
    const d = (await c.get(`/api/v1/products/${wc('HEALTHY').id}/activity?pageSize=100`, admin)).body.data;
    expect(d.items.some((i: any) => JSON.stringify(i.params).includes(w.variant.sku))).toBe(false);
    expect((await c.get(`/api/v1/products/${wc('HEALTHY').id}/activity`, other)).status).toBe(404);
    expect((await c.get(`/api/v1/products/${FAKE}/activity`, admin)).status).toBe(404);
  });
});

// ================================================================================================
describe('variants workspace grid', () => {
  const grid = async (qs = '', id = wc('GRID').id, as: Actor = admin) => {
    const r = await c.get(`/api/v1/products/${id}/variant-grid${qs ? `?${qs}` : ''}`, as);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r.body.data as { items: any[]; total: number; page: number; pages: number };
  };
  const skus = (d: { items: any[] }) => d.items.map((i) => i.sku as string).sort();

  it('lists variants with stock, channels, lifecycle and thumbnail', async () => {
    const d = await grid();
    expect(d.total).toBe(5);
    const nv = d.items.find((i) => i.sku === 'GRID-NV-CAB');
    expect(nv).toMatchObject({ name: 'Navy / Cabin', optionValues: { color: 'Navy', size: 'Cabin' }, stock: { available: 3, threshold: 5, status: 'low' }, lifecycle: 'active', status: 'active', leadTimeDays: null, channels: [] });
    expect(nv.thumbnailUrl).toMatch(/\/content$/);
    expect(d.items.find((i) => i.sku === 'GRID-BK-CAB').stock).toMatchObject({ available: 40, status: 'healthy' });
    expect(d.items.find((i) => i.sku === 'GRID-BK-LRG').stock).toMatchObject({ available: 0, status: 'out' });
    expect(d.items.find((i) => i.sku === 'GRID-X')).toMatchObject({ lifecycle: 'archived', status: 'inactive' });
    expect(d.items.map((i) => i.sku)).toEqual([...d.items.map((i) => i.sku)].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))); // default sku asc
  });

  it('filters: color, size, generic option, q, inventory, lifecycle, channel', async () => {
    expect(skus(await grid('filter[color]=Black'))).toEqual(['GRID-BK-CAB', 'GRID-BK-LRG']);
    expect(skus(await grid('filter[size]=Cabin'))).toEqual(['GRID-BK-CAB', 'GRID-NV-CAB', 'GRID-X']);
    expect(skus(await grid('filter[color]=Black&filter[color]=Navy')).length).toBe(4);
    expect(skus(await grid('filter[option.color]=black&filter[size]=Large'))).toEqual(['GRID-BK-LRG']); // case-insensitive, filters combine
    expect(skus(await grid('filter[option.material]=Cotton')).length).toBe(0);
    expect(skus(await grid('q=Navy'))).toEqual(['GRID-NV-CAB', 'GRID-NV-LRG']);
    expect(skus(await grid('q=GRID-X'))).toEqual(['GRID-X']);
    expect((await grid('q=%25')).total).toBe(0);
    expect(skus(await grid('filter[inventory]=low'))).toEqual(['GRID-NV-CAB']);
    expect(skus(await grid('filter[inventory]=out&filter[lifecycle]=active'))).toEqual(['GRID-BK-LRG']);
    expect(skus(await grid('filter[inventory]=out'))).toEqual(['GRID-BK-LRG', 'GRID-X']); // the inactive one has no stock either
    expect(skus(await grid('filter[lifecycle]=archived'))).toEqual(['GRID-X']);
    expect((await grid('filter[lifecycle]=draft')).total).toBe(0);
    expect((await c.get(`/api/v1/products/${wc('GRID').id}/variant-grid?filter[inventory]=bogus`, admin)).status).toBe(400);
    expect((await c.get(`/api/v1/products/${wc('GRID').id}/variant-grid?filter[option.bad!]=x`, admin)).status).toBe(200); // a malformed option name is simply ignored
  });

  it('channel filter and channel list per variant', async () => {
    await createListing(wc('GRID').v['GRID-BK-CAB']!);
    const d = await grid('filter[channel]=mock');
    expect(skus(d)).toEqual(['GRID-BK-CAB']);
    expect(d.items[0].channels).toEqual([expect.objectContaining({ code: 'mock', listingStatus: 'draft' })]);
    expect((await grid('filter[channel]=amazon_in')).total).toBe(0);
  });

  it('sorts and pages', async () => {
    const inv = await grid('sort=-inventory');
    expect(inv.items.map((i) => i.stock.available)).toEqual([40, 20, 3, 0, 0]);
    const p1 = await grid('pageSize=2&page=1');
    const p3 = await grid('pageSize=2&page=3');
    expect(p1).toMatchObject({ page: 1, total: 5, pages: 3 });
    expect(p1.items).toHaveLength(2);
    expect(p3.items).toHaveLength(1);
    expect((await c.get(`/api/v1/products/${wc('GRID').id}/variant-grid?sort=bogus`, admin)).status).toBe(400);
  });

  it('lifecycle follows the product: draft and archived products', async () => {
    expect((await grid('', wc('DRAFT1').id)).items[0].lifecycle).toBe('draft');
    expect((await grid('', wc('ARCH1').id)).items[0].lifecycle).toBe('archived');
  });

  it('counts: all / active / low stock / out of stock / draft / archived', async () => {
    const counts = async (id: string, as: Actor = admin) => (await c.get(`/api/v1/products/${id}/variant-grid/counts`, as)).body.data;
    expect(await counts(wc('GRID').id)).toEqual({ all: 5, active: 4, lowStock: 1, outOfStock: 1, draft: 0, archived: 1 });
    expect(await counts(wc('DRAFT1').id)).toEqual({ all: 1, active: 0, lowStock: 0, outOfStock: 0, draft: 1, archived: 0 });
    expect(await counts(wc('LOWSTK').id)).toEqual({ all: 2, active: 2, lowStock: 1, outOfStock: 0, draft: 0, archived: 0 });
    expect((await c.get(`/api/v1/products/${wc('GRID').id}/variant-grid/counts`, other)).status).toBe(404);
    expect((await c.get(`/api/v1/products/${wc('GRID').id}/variant-grid`, other)).status).toBe(404);
    expect((await c.get(`/api/v1/products/${wc('GRID').id}/variant-grid`, viewer)).status).toBe(200);
  });
});

describe('POST /products/{id}/variants/bulk', () => {
  const bulk = (body: unknown, id = wc('GRID').id, as: Actor = admin) => c.post(`/api/v1/products/${id}/variants/bulk`, body, as);
  const counts = async () => (await c.get(`/api/v1/products/${wc('GRID').id}/variant-grid/counts`, admin)).body.data;

  it('archives, with the last-active-variant guard, then activates and deletes (per-item results)', async () => {
    const v = wc('GRID').v;
    let r = await bulk({ ids: [v['GRID-NV-LRG'], v['GRID-BK-CAB']], action: 'archive' });
    expect(r.status).toBe(200);
    expect(r.body.data.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
    expect(await counts()).toMatchObject({ all: 5, active: 2, archived: 3 });

    // archive the last two active variants: the first goes, the second is refused (an active product needs one)
    r = await bulk({ ids: [v['GRID-BK-LRG'], v['GRID-NV-CAB']], action: 'archive' });
    expect(r.body.data.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(r.body.data.results[0]).toMatchObject({ ok: true, id: v['GRID-BK-LRG'] });
    expect(r.body.data.results[1]).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(await counts()).toMatchObject({ active: 1, archived: 4 });

    r = await bulk({ ids: [v['GRID-NV-LRG'], v['GRID-BK-CAB']], action: 'activate' });
    expect(r.body.data.summary).toMatchObject({ succeeded: 2, failed: 0 });
    expect(await counts()).toMatchObject({ active: 3, archived: 2 });
    // idempotent: activating an active variant is fine
    expect((await bulk({ ids: [v['GRID-NV-LRG']], action: 'activate' })).body.data.summary.failed).toBe(0);

    // a variant of another product is reported, not touched
    r = await bulk({ ids: [wc('LOWSTK').v['LOW-1'], v['GRID-X']], action: 'delete' });
    expect(r.body.data.results[0]).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(r.body.data.results[1]).toMatchObject({ ok: true });
    expect(await counts()).toMatchObject({ all: 4 });
    expect((await c.get(`/api/v1/variants/${v['GRID-X']}`, admin)).status).toBe(404);
    // restore for the remaining tests
    await bulk({ ids: [v['GRID-BK-LRG'], v['GRID-NV-CAB']], action: 'activate' });
    expect(await counts()).toMatchObject({ all: 4, active: 4, archived: 0 });
  });

  it('delete respects reservations (the sold product keeps its variant)', async () => {
    const r = await bulk({ ids: [w.variant.variantId], action: 'delete' }, wc('WP').id);
    expect(r.body.data.results[0]).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('validates the body and permissions; other tenants get 404', async () => {
    expect((await bulk({ ids: [], action: 'archive' })).status).toBe(400);
    expect((await bulk({ ids: [wc('GRID').v['GRID-BK-CAB']], action: 'explode' })).status).toBe(400);
    expect((await bulk({ ids: ['x'], action: 'archive' })).status).toBe(400);
    expect((await bulk({ ids: Array.from({ length: 201 }, () => FAKE), action: 'archive' })).status).toBe(400);
    expect((await bulk({ ids: [wc('GRID').v['GRID-BK-CAB']], action: 'archive' }, wc('GRID').id, viewer)).status).toBe(403);
    expect((await bulk({ ids: [wc('GRID').v['GRID-BK-CAB']], action: 'archive' }, wc('GRID').id, other)).status).toBe(404);
    expect((await bulk({ ids: [FAKE], action: 'archive' }, FAKE)).status).toBe(404);
    expect((await bulk({ ids: [FAKE], action: 'archive' })).body.data.results[0]).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('PUT /variants/{id}/lead-time', () => {
  const put = (id: string, body: unknown, as: Actor = admin) => c.put(`/api/v1/variants/${id}/lead-time`, body, as);
  const v = () => wc('LOWSTK').v['LOW-1']!;

  it('writes the lead time (staff too), shows in the grid and the activity feed, and can be cleared', async () => {
    const r = await put(v(), { leadTimeDays: 14 }, staff);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ variantId: v(), sku: 'LOW-1', leadTimeDays: 14 });
    expect((await owner('select lead_time_days from product_variants where id = $1', [v()])).rows[0].lead_time_days).toBe(14);
    const g = (await c.get(`/api/v1/products/${wc('LOWSTK').id}/variant-grid?q=LOW-1`, admin)).body.data.items[0];
    expect(g.leadTimeDays).toBe(14);
    const act = (await c.get(`/api/v1/products/${wc('LOWSTK').id}/activity?scope=variants`, admin)).body.data.items;
    expect(act[0]).toMatchObject({ event: 'variant.lead_time_set', type: 'variants' });
    expect((await put(v(), { leadTimeDays: 0 })).body.data.leadTimeDays).toBe(0);
    expect((await put(v(), { leadTimeDays: 365 })).body.data.leadTimeDays).toBe(365);
    expect((await put(v(), { leadTimeDays: null })).body.data.leadTimeDays).toBeNull();
    expect((await owner('select lead_time_days from product_variants where id = $1', [v()])).rows[0].lead_time_days).toBeNull();
  });

  it('validates the range and type', async () => {
    for (const bad of [{ leadTimeDays: 366 }, { leadTimeDays: -1 }, { leadTimeDays: 1.5 }, { leadTimeDays: '7' }, {}, { leadTimeDays: undefined }]) {
      expect((await put(v(), bad)).status, JSON.stringify(bad)).toBe(400);
    }
  });

  it('needs products:write and stays inside the tenant', async () => {
    expect((await put(v(), { leadTimeDays: 5 }, viewer)).status).toBe(403);
    expect((await put(v(), { leadTimeDays: 5 }, other)).status).toBe(404);
    expect((await put(FAKE, { leadTimeDays: 5 })).status).toBe(404);
    expect((await owner('select lead_time_days from product_variants where id = $1', [v()])).rows[0].lead_time_days).toBeNull();
  });
});

// ================================================================================================
describe('POST /products/{id}/duplicate', () => {
  it('copies master + variants as a draft with -COPY SKUs; no stock, listings or documents', async () => {
    await put14();
    const r = await c.post(`/api/v1/products/${wc('GRID').id}/duplicate`, {}, admin);
    expect(r.status).toBe(201);
    expect(r.headers.location).toBe(`/api/v1/products/${r.body.data.id}`);
    const d = r.body.data;
    expect(d).toMatchObject({ productCode: 'GRID-COPY', status: 'draft', brand: 'Acme', categoryId: catBags, hsnCode: '6109', gstRateBps: 1200, countryOfOrigin: 'IN', variantCount: 4 });
    expect(d.title).toBe('Product GRID title (copy)');
    expect(d.variants.map((v: any) => v.sku).sort()).toEqual(['GRID-BK-CAB-COPY', 'GRID-BK-LRG-COPY', 'GRID-NV-CAB-COPY', 'GRID-NV-LRG-COPY']);
    const nv = d.variants.find((v: any) => v.sku === 'GRID-NV-CAB-COPY');
    expect(nv).toMatchObject({ optionValues: { color: 'Navy', size: 'Cabin' }, sellingPriceMinor: 49900, mrpMinor: 59900, barcode: null });
    expect(d.id).not.toBe(wc('GRID').id);

    // nothing operational was copied
    const inv = (await c.get(`/api/v1/products/${d.id}/inventory`, admin)).body.data;
    expect(inv.totals).toEqual({ available: 0, reserved: 0, incoming: 0, lowStockVariants: 4 });
    expect(inv.byWarehouse).toEqual([]);
    expect((await c.get(`/api/v1/products/${d.id}/listings`, admin)).body.data.items).toEqual([]);
    expect((await c.get(`/api/v1/products/${d.id}/overview`, admin)).body.data.media.total).toBe(0);
    expect((await c.get(`/api/v1/products/${d.id}/documents`, admin)).body.data).toEqual([]);
    // the source is untouched and the copy is audited
    expect((await c.get(`/api/v1/products/${wc('GRID').id}/inventory`, admin)).body.data.totals.available).toBe(63);
    P['GRID-COPY'] = { id: d.id, v: {} };
    expect((await owner(`select count(*)::int as n from audit_logs where action = 'product.duplicate' and resource_id = $1`, [d.id])).rows[0].n).toBe(1);
  });

  it('adds a numeric suffix when the code or a SKU is taken', async () => {
    const second = (await c.post(`/api/v1/products/${wc('GRID').id}/duplicate`, {}, admin)).body.data;
    expect(second.productCode).toBe('GRID-COPY-2');
    expect(second.variants.map((v: any) => v.sku).sort()).toEqual(['GRID-BK-CAB-COPY-2', 'GRID-BK-LRG-COPY-2', 'GRID-NV-CAB-COPY-2', 'GRID-NV-LRG-COPY-2']);
    // only a SKU is taken (the code HEALTHY-COPY is free): the whole copy still moves to -COPY-2
    await mk('SKUCLASH', { variants: [{ sku: 'HEALTHY-1-COPY' }] });
    const third = (await c.post(`/api/v1/products/${wc('HEALTHY').id}/duplicate`, {}, admin)).body.data;
    expect(third).toMatchObject({ productCode: 'HEALTHY-COPY-2' });
    expect(third.variants[0].sku).toBe('HEALTHY-1-COPY-2');
    expect(third.variants[0].barcode).toBeNull(); // unique per vendor: not copied
    // copying a copy keeps working
    expect((await c.post(`/api/v1/products/${second.id}/duplicate`, {}, admin)).body.data.productCode).toBe('GRID-COPY-2-COPY');
  });

  it('is a write: viewers are refused, unknown and foreign ids are 404', async () => {
    expect((await c.post(`/api/v1/products/${wc('GRID').id}/duplicate`, {}, viewer)).status).toBe(403);
    expect((await c.post(`/api/v1/products/${wc('GRID').id}/duplicate`, {}, other)).status).toBe(404);
    expect((await c.post(`/api/v1/products/${FAKE}/duplicate`, {}, admin)).status).toBe(404);
  });
});
async function put14() { await c.put(`/api/v1/variants/${wc('GRID').v['GRID-NV-LRG']}/lead-time`, { leadTimeDays: 9 }, admin); }

describe('POST /products/bulk-actions', () => {
  const act = (body: unknown, as: Actor = admin) => c.post('/api/v1/products/bulk-actions', body, as);

  it('returns per-item results with partial success', async () => {
    const r = await act({ ids: [wc('ARCH1').id, wc('HEALTHY').id, FAKE], action: 'unarchive' });
    expect(r.status).toBe(200);
    expect(r.body.data.summary).toEqual({ total: 3, succeeded: 1, failed: 2 });
    expect(r.body.data.results[0]).toMatchObject({ ok: true, productId: wc('ARCH1').id, status: 'draft' });
    expect(r.body.data.results[1]).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(r.body.data.results[2]).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect((await c.get(`/api/v1/products/${wc('ARCH1').id}`, admin)).body.data.status).toBe('draft');
  });

  it('archive and duplicate', async () => {
    const a = await act({ ids: [wc('ARCH1').id, wc('OUTSTK').id], action: 'archive' });
    expect(a.body.data.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
    expect((await act({ ids: [wc('OUTSTK').id], action: 'archive' })).body.data.results[0]).toMatchObject({ ok: false, error: { code: 'CONFLICT' } }); // already archived
    expect((await c.get(`/api/v1/products/${wc('OUTSTK').id}`, admin)).body.data.status).toBe('archived');
    expect((await act({ ids: [wc('OUTSTK').id], action: 'unarchive' })).body.data.summary.succeeded).toBe(1);

    const d = await act({ ids: [wc('DRAFT1').id, FAKE], action: 'duplicate' });
    expect(d.body.data.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
    const copy = (await c.get(`/api/v1/products/${d.body.data.results[0].newProductId}`, admin)).body.data;
    expect(copy).toMatchObject({ productCode: 'DRAFT1-COPY', status: 'draft' });
    expect(d.body.data.results[0].newProductCode).toBe('DRAFT1-COPY');
  });

  it('check_publish_readiness says which products can be published and what is missing, and changes nothing', async () => {
    const before = (await c.get(`/api/v1/products/${wc('DRAFT1').id}`, admin)).body.data.version;
    const r = await act({ ids: [wc('HEALTHY').id, wc('DRAFT1').id, wc('WP').id, FAKE], action: 'check_publish_readiness' });
    expect(r.status).toBe(200);
    expect(r.body.data.summary).toEqual({ total: 4, succeeded: 3, failed: 1, canPublish: 1 });
    const [ok, draft, wp, missing] = r.body.data.results;
    expect(ok).toMatchObject({ ok: true, canPublish: true, missing: [] });
    expect(draft.canPublish).toBe(false);
    expect(draft.missing.map((m: any) => m.code)).toEqual(['image']);
    expect(wp.missing.map((m: any) => m.code).sort()).toEqual(['category', 'image']);
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect((await c.get(`/api/v1/products/${wc('DRAFT1').id}`, admin)).body.data.version).toBe(before);
  });

  it('validates input, caps at 200 ids, needs products:write and respects tenants', async () => {
    expect((await act({ ids: [], action: 'archive' })).status).toBe(400);
    expect((await act({ ids: [FAKE], action: 'publish' })).status).toBe(400);
    expect((await act({ ids: Array.from({ length: 201 }, () => FAKE), action: 'archive' })).status).toBe(400);
    expect((await act({ ids: Array.from({ length: 200 }, () => FAKE), action: 'check_publish_readiness' })).body.data.summary.total).toBe(200);
    expect((await act({ ids: [wc('HEALTHY').id], action: 'archive' }, viewer)).status).toBe(403);
    const foreign = await act({ ids: [wc('HEALTHY').id], action: 'archive' }, other);
    expect(foreign.body.data.results[0]).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect((await c.get(`/api/v1/products/${wc('HEALTHY').id}`, admin)).body.data.status).toBe('active');
  });
});

// ================================================================================================
describe('GET /products/export', () => {
  const exp = (qs = '', as: Actor = admin) => c.get(`/api/v1/products/export${qs ? `?${qs}` : ''}`, as);
  const lines = (csv: string) => csv.split('\r\n').filter(Boolean);

  it('returns the filtered catalog as a CSV attachment', async () => {
    const r = await exp('filter[status]=draft&sort=sku');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^text\/csv/);
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="products\.csv"/);
    const rows = lines(r.raw.body);
    expect(rows[0]).toBe('product_code,title,status,product_type,category_id,variants,available_units,inventory_status,channels,publish_readiness_pct,needs_attention,updated_at');
    const total = (await catalog('filter[status]=draft')).total;
    expect(rows).toHaveLength(total + 1);
    expect(rows[1]).toMatch(/^DRAFT1,/);
    // channels column
    const ch = lines((await exp('filter[channel]=mock')).raw.body).slice(1);
    expect(ch).toHaveLength((await catalog('filter[channel]=mock')).total); // WP, LISTERR and GRID (a draft listing)
    expect(ch).toHaveLength(3);
    expect(ch.every((l) => l.includes(',mock,'))).toBe(true);
  });

  it('uses the same filters as the catalog list and the same row count', async () => {
    for (const qs of ['filter[inventory]=low', `filter[categoryId]=${catBags}`, 'filter[needsAttention]=true', 'q=GRID']) {
      expect(lines((await exp(qs)).raw.body).length - 1, qs).toBe((await catalog(qs)).total);
    }
    expect(lines((await exp('', other)).raw.body)).toHaveLength(1); // header only
    expect((await exp('filter[status]=bogus')).status).toBe(400);
    expect((await exp('', viewer)).status).toBe(200);
  });

  it('neutralises spreadsheet formulas and quotes commas', async () => {
    await mk('EVIL-1', { title: '=HYPERLINK("http://evil","x"), hi', variants: [{ sku: 'EVIL-1-A' }] });
    const csv = (await exp('q=EVIL-1')).raw.body;
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x""), hi"`);
    expect(csv).not.toMatch(/,=HYPERLINK/);
    expect((await owner(`select count(*)::int as n from audit_logs where action = 'product.export' and vendor_id = $1`, [admin.vendorId])).rows[0].n).toBeGreaterThan(0);
  });

  it('refuses more than 50,000 rows with 413 (and the catalog still pages that vendor)', async () => {
    const big = await c.registerVendor({ businessName: 'Big Catalog' });
    await owner(`insert into products (vendor_id, product_code, title) select $1::uuid, 'GEN-' || g, 'Generated product ' || g from generate_series(1, 50001) g`, [big.vendorId]);
    const r = await exp('', big);
    expect(r.status).toBe(413);
    expect(r.body.error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', details: { total: 50001, max: 50000 } });
    expect((await exp('q=GEN-5000', big)).status).toBe(200); // narrowed: allowed
    const page = await c.get('/api/v1/products/catalog?pageSize=100&page=2&sort=sku', big);
    expect(page.body.data).toMatchObject({ total: 50001, pages: 501, page: 2 });
    expect(page.body.data.items).toHaveLength(100);
    expect((await c.get('/api/v1/products/stats', big)).body.data.products).toBe(50001);
  }, 120_000);
});

// ================================================================================================
describe('existing endpoints are unchanged', () => {
  it('cursor list, detail, variants and async exports keep their shapes', async () => {
    const list = await c.get('/api/v1/products?limit=2', admin);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.meta).toMatchObject({ limit: 2, hasMore: true, nextCursor: expect.any(String) });
    expect(list.body.data[0]).toEqual(expect.objectContaining({ id: expect.any(String), productCode: expect.any(String), variantCount: expect.any(Number), version: expect.any(Number), status: expect.any(String) }));
    const page2 = await c.get(`/api/v1/products?limit=2&cursor=${encodeURIComponent(list.body.meta.nextCursor)}`, admin);
    expect(page2.body.data[0].id).not.toBe(list.body.data[0].id);
    const detail = await c.get(`/api/v1/products/${wc('LOWSTK').id}`, admin);
    expect(detail.body.data).toMatchObject({ productCode: 'LOWSTK', productType: 'physical', variantCount: 2 });
    expect(detail.body.data.variants).toHaveLength(2);
    expect((await c.get(`/api/v1/products/${wc('LOWSTK').id}/variants`, admin)).body.data).toHaveLength(2);
    expect((await c.get(`/api/v1/variants?filter[productId]=${wc('LOWSTK').id}`, admin)).body.data).toHaveLength(2);
    expect((await c.get(`/api/v1/products/${wc('LOWSTK').id}/readiness`, admin)).body.data).toMatchObject({ ready: true, errors: 0 });
    expect((await c.post('/api/v1/products/bulk', { action: 'update_status', ids: [wc('DRAFT2').id], status: 'draft' }, admin)).body.data.summary).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect((await c.post('/api/v1/products/exports', { status: 'active' }, admin)).status).toBe(202);
    // productType round-trips through create/update
    const dig = await c.post('/api/v1/products', { productCode: 'DIGI-1', title: 'Digital thing', productType: 'service' }, admin);
    expect(dig.body.data.productType).toBe('service');
    expect((await c.patch(`/api/v1/products/${dig.body.data.id}`, { productType: 'digital' }, admin)).body.data.productType).toBe('digital');
    expect((await c.patch(`/api/v1/products/${dig.body.data.id}`, { title: 'Digital thing 2' }, admin)).body.data.productType).toBe('digital'); // untouched by other patches
    expect((await c.patch(`/api/v1/products/${dig.body.data.id}`, { productType: 'robot' }, admin)).status).toBe(400);
  });
});

describe('needs attention follows the readiness rules', () => {
  it('fixing the blocking checks of an active product clears it; tabs and filters stay equal', async () => {
    const before = await stats();
    expect(before.needsAttention).toBe(2);
    expect((await c.patch(`/api/v1/products/${wc('WP').id}`, { categoryId: catBags }, admin)).status).toBe(200);
    await addImage(wc('WP').id);
    const after = await stats();
    expect(after.needsAttention).toBe(1);
    expect(codes((await catalog('filter[needsAttention]=true')).items)).toEqual(['LISTERR']);
    const wp = (await catalog('q=STAGE-TEE')).items[0].summary;
    expect(wp.publishReadinessPct).toBe(100);
    expect((await c.get(`/api/v1/products/${wc('WP').id}/overview`, admin)).body.data.health.state).toBe('ready');
    expect((await c.get(`/api/v1/products/${wc('WP').id}/overview`, admin)).body.data.actions.find((a: any) => a.key === 'publish_product').enabled).toBe(true);
    // the tabs always add up to the totals
    expect(after.tabs.all).toBe(after.tabs.active + after.tabs.draft + after.tabs.archived);
    expect((await catalog()).total).toBe(after.tabs.all);
    expect((await catalog('filter[status]=draft')).total).toBe(after.draft);
    expect((await catalog('filter[status]=archived')).total).toBe(after.archived);
    expect((await catalog('filter[status]=active')).total).toBe(after.activeProducts);
  });

  it('a draft or archived product is never "needs attention", even when incomplete', async () => {
    expect((await catalog('filter[needsAttention]=true&filter[status]=draft')).total).toBe(0);
    expect((await catalog('filter[needsAttention]=true&filter[status]=archived')).total).toBe(0);
  });
});
