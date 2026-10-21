import type { Actor, TestApp, clientFor } from '@oms/testing';

/** shared fixtures of the product edit tests (tests/api/product-edit*.test.ts) */
type Client = ReturnType<typeof clientFor>;

export interface World { t: TestApp; c: Client }

/** runs SQL as the system scope (RLS bypass) on the in-process database: the way these tests seed rows no public endpoint creates */
export async function sql<R = any>(t: TestApp, q: string, params: unknown[] = []): Promise<R[]> {
  const pg = t.database!.pg;
  await pg.query(`select set_config('app.scope', 'system', false)`);
  try { return (await pg.query<R>(q, params)).rows; } finally { await pg.query(`select set_config('app.scope', '', false), set_config('app.vendor_id', '', false)`); }
}

let seq = 0;
export const uniq = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}${(seq++).toString(36).toUpperCase()}`;

export async function makeCategory(w: World, as: Actor, name: string): Promise<string> {
  const r = await w.c.post('/api/v1/categories', { name }, as);
  if (r.status !== 201) throw new Error(`category failed: ${JSON.stringify(r.body)}`);
  return r.body.data.id;
}

export interface MadeProduct { id: string; code: string; variantId: string; sku: string; version: number }

/** an ACTIVE product with one variant (the editor is for existing, listed products) unless `status: 'draft'` */
export async function makeProduct(w: World, as: Actor, o: { code?: string; title?: string; categoryId?: string | null; brand?: string | null; description?: string | null; status?: 'draft' | 'active'; extra?: Record<string, unknown> } = {}): Promise<MadeProduct> {
  const code = o.code ?? uniq('ED');
  const sku = `${code}-SKU`;
  const r = await w.c.post('/api/v1/products', {
    productCode: code, title: o.title ?? `Edit Product ${code}`, ...(o.brand !== null ? { brand: o.brand ?? 'Urban Carry' } : {}),
    ...(o.description !== null ? { description: o.description ?? 'A durable travel bag for short business trips and weekend travel.' } : {}),
    ...(o.categoryId ? { categoryId: o.categoryId } : {}), countryOfOrigin: 'IN', hsnCode: '4202', gstRateBps: 1800,
    status: o.status ?? 'active', variants: [{ sku, sellingPriceMinor: 49900, mrpMinor: 59900 }], ...(o.extra ?? {}),
  }, as);
  if (r.status !== 201) throw new Error(`product failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { id: r.body.data.id, code, variantId: r.body.data.variants[0].id, sku, version: r.body.data.version };
}

/** a live listing straight into the table (the listing creation / approval / publish flow is covered by the listings tests) */
export async function liveListing(w: World, vendorId: string, accountId: string, p: MadeProduct, o: { status?: string; marketplaceCategoryId?: string | null } = {}): Promise<string> {
  const rows = await sql<{ id: string }>(w.t, `insert into marketplace_listings (vendor_id, marketplace_account_id, variant_id, external_sku, status, external_listing_id, marketplace_category_id)
    values ($1, $2, $3, $4, $5, $6, $7) returning id`, [vendorId, accountId, p.variantId, p.sku, o.status ?? 'active', `EXT-${p.sku}-${accountId.slice(0, 6)}`, o.marketplaceCategoryId ?? null]);
  return rows[0]!.id;
}

/** uploads a real 600x600 PNG as a product image (confirmed) */
export async function addImage(w: World, as: Actor, productId: string, name = 'image.png'): Promise<string> {
  const { png: makePng } = await import('./image-fixtures');
  const reg = await w.c.post(`/api/v1/products/${productId}/documents`, { fileName: name, mimeType: 'image/png', sizeBytes: 5000, purpose: 'product_image' }, as);
  if (reg.status !== 201) throw new Error(`image register failed: ${JSON.stringify(reg.body)}`);
  const up = await w.c.call('POST', reg.body.data.upload.url, { as, raw: makePng(600, 600), contentType: 'image/png' });
  if (up.status >= 300) throw new Error(`image upload failed: ${JSON.stringify(up.body)}`);
  return reg.body.data.id;
}
