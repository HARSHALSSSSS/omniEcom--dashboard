/* eslint-disable @typescript-eslint/no-explicit-any -- raw SQL rows and jsonb audit payloads are untyped */
import { and, eq, escapeLike, inArray, schema, sql, type SQL, type Tx } from '@oms/database';
import { AppError } from '@oms/shared';
import { getProductAttributeValues } from '@oms/mod-attributes';
import { evaluateReadiness } from './readiness';
import * as svc from './service';

/**
 * Read models for the products dashboard (catalog list, product details tabs, variants workspace).
 * Everything here is read-only and batched: one filtered/sorted/paged query for the rows, then ONE query per
 * kind of decoration (thumbnails, channels, sales) for the ids of the page. No per-row queries.
 * Other areas' tables (inventory, listings, accounts, documents, audit, movements) are read through `schema`/SQL only.
 */

const P = schema.products;
const rows = async <T = Record<string, unknown>>(tx: Tx, q: SQL): Promise<T[]> => (await tx.execute(q)).rows as T[];
const csvList = (vals: Array<string | number>): SQL => sql.join(vals.map((v) => sql`${v}`), sql`, `);
const uuidList = (ids: string[]): SQL => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
const iso = (d: unknown): string | null => (d == null ? null : d instanceof Date ? d.toISOString() : new Date(String(d)).toISOString());
const chunk = <T>(a: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

export type ChannelNameFn = (code: string) => string;
export type InventoryStatus = 'healthy' | 'low' | 'out';
export type ChannelStatus = 'active' | 'attention' | 'pending' | 'draft' | 'unpublished';

export const MAX_EXPORT_ROWS = 50_000;
export const DEFAULT_LOW_STOCK = 5;

// ------------------------------------------------------------------------------------------------
// listing status vocabulary
// ------------------------------------------------------------------------------------------------
export function listingStatusOf(l: { status: string; error?: string | null }): ChannelStatus {
  if (l.status === 'rejected' || l.status === 'correction_required' || l.error) return 'attention';
  if (l.status === 'active') return 'active';
  if (l.status === 'pending' || l.status === 'approved' || l.status === 'ready') return 'pending';
  if (l.status === 'unpublished') return 'unpublished';
  return 'draft';
}
const RANK: Record<ChannelStatus, number> = { attention: 5, active: 4, pending: 3, draft: 2, unpublished: 1 };
export const rollupStatus = (ss: ChannelStatus[]): ChannelStatus => ss.reduce<ChannelStatus>((best, s) => (RANK[s] > RANK[best] ? s : best), 'unpublished');
const isConnected = (s: ChannelStatus) => s !== 'draft' && s !== 'unpublished';

export async function lowStockThreshold(tx: Tx, vendorId: string): Promise<number> {
  const [v] = await tx.select({ settings: schema.vendors.settings }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const n = Number((v?.settings as Record<string, unknown> | undefined)?.lowStockThreshold);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LOW_STOCK;
}

// ------------------------------------------------------------------------------------------------
// the shared product read model (CTEs). One row per live product with stock, readiness and attention flags.
//   inventory status: out = nothing available; low = some active variant is at/below its threshold (reorder level, else the
//   business low-stock threshold); healthy otherwise.
//   readiness: 11 core checks (title, description, brand, category, HSN, GST, origin, active variant, prices, MRPs, image);
//   publishReadinessPct = passed / 11. Brand, category, HSN, GST, variant, price, MRP and image are the blocking ones.
//   needs attention: not archived AND (active with a blocking check failing OR a channel listing rejected / correction
//   required / with an error code).
// ------------------------------------------------------------------------------------------------
const only = (col: string, id?: string): SQL => (id ? sql` and ${sql.raw(col)} = ${id}::uuid` : sql``);

function readModel(vendorId: string, thr: number, productId?: string): SQL {
  return sql`
  vs as (
    select pv.id, pv.product_id, pv.status, pv.tax_rate_bps, pv.selling_price_minor, pv.mrp_minor,
           coalesce(s.avail, 0)::int as avail, coalesce(s.rl, ${thr})::int as thr
    from product_variants pv
    left join (select variant_id, sum(quantity_on_hand - quantity_reserved)::int as avail, max(reorder_level) as rl
               from inventory where vendor_id = ${vendorId} group by variant_id) s on s.variant_id = pv.id
    where pv.vendor_id = ${vendorId} and pv.deleted_at is null${only('pv.product_id', productId)}),
  pa as (
    select product_id,
      count(*)::int as variant_count,
      count(*) filter (where status = 'active')::int as active_variants,
      coalesce(sum(avail) filter (where status = 'active'), 0)::int as avail,
      count(*) filter (where status = 'active' and avail > 0 and avail <= thr)::int as low_variants,
      count(*) filter (where status = 'active' and avail <= 0)::int as out_variants,
      count(*) filter (where tax_rate_bps is not null)::int as tax_ok,
      count(*) filter (where status = 'active' and (selling_price_minor is null or selling_price_minor <= 0))::int as price_missing,
      count(*) filter (where status = 'active' and (mrp_minor is null or mrp_minor <= 0))::int as mrp_missing
    from vs group by product_id),
  img as (
    select distinct product_id from product_documents
    where vendor_id = ${vendorId} and kind = 'image' and status in ('uploaded', 'processed') and deleted_at is null${only('product_id', productId)}),
  lp as (
    select distinct pv.product_id from marketplace_listings ml
    join product_variants pv on pv.id = ml.variant_id and pv.vendor_id = ml.vendor_id
    where ml.vendor_id = ${vendorId} and pv.deleted_at is null${only('pv.product_id', productId)}
      and (ml.status in ('rejected', 'correction_required') or ml.last_error_code is not null)),
  pch as (
    select distinct pv.product_id, ma.marketplace from marketplace_listings ml
    join product_variants pv on pv.id = ml.variant_id and pv.vendor_id = ml.vendor_id
    join marketplace_accounts ma on ma.id = ml.marketplace_account_id and ma.vendor_id = ml.vendor_id
    where ml.vendor_id = ${vendorId} and pv.deleted_at is null${only('pv.product_id', productId)}),
  pr as (
    select x.*,
      (x.c_title::int + x.c_desc::int + x.c_brand::int + x.c_cat::int + x.c_hsn::int + x.c_gst::int + x.c_origin::int + x.c_var::int + x.c_price::int + x.c_mrp::int + x.c_img::int) as ok_count,
      ((not x.c_brand)::int + (not x.c_cat)::int + (not x.c_hsn)::int + (not x.c_gst)::int + (not x.c_var)::int + (not x.c_price)::int + (not x.c_mrp)::int + (not x.c_img)::int) as err_fail
    from (
      select p.id, p.product_code, p.title, p.status, p.category_id, p.updated_at, p.created_at,
        coalesce(p.attributes ->> 'productType', 'physical') as product_type,
        coalesce(pa.variant_count, 0) as variant_count, coalesce(pa.active_variants, 0) as active_variants, coalesce(pa.avail, 0) as avail,
        coalesce(pa.low_variants, 0) as low_variants, coalesce(pa.out_variants, 0) as out_variants,
        (length(btrim(p.title)) >= 10) as c_title,
        (length(btrim(coalesce(p.description, ''))) >= 20) as c_desc,
        (btrim(coalesce(p.brand, '')) <> '') as c_brand,
        (p.category_id is not null) as c_cat,
        (p.hsn_code is not null) as c_hsn,
        coalesce(p.gst_rate_bps is not null or (coalesce(pa.variant_count, 0) > 0 and pa.tax_ok = pa.variant_count), false) as c_gst,
        (p.country_of_origin is not null) as c_origin,
        (coalesce(pa.active_variants, 0) > 0) as c_var,
        (coalesce(pa.price_missing, 0) = 0) as c_price,
        (coalesce(pa.mrp_missing, 0) = 0) as c_mrp,
        (img.product_id is not null) as c_img
      from products p
      left join pa on pa.product_id = p.id
      left join img on img.product_id = p.id
      where p.vendor_id = ${vendorId} and p.deleted_at is null${only('p.id', productId)}) x),
  pf as (
    select pr.*,
      round(100.0 * pr.ok_count / 11)::int as pct,
      case when pr.avail <= 0 then 'out' when pr.low_variants + pr.out_variants > 0 then 'low' else 'healthy' end as inv_status,
      (pr.status <> 'archived' and ((pr.status = 'active' and pr.err_fail > 0) or exists (select 1 from lp where lp.product_id = pr.id))) as attn
    from pr)`;
}

interface PfRow {
  id: string; product_code: string; title: string; status: 'draft' | 'active' | 'archived'; category_id: string | null; updated_at: Date | string; product_type: string;
  variant_count: number; active_variants: number; avail: number; low_variants: number; out_variants: number;
  c_title: boolean; c_desc: boolean; c_brand: boolean; c_cat: boolean; c_hsn: boolean; c_gst: boolean; c_origin: boolean; c_var: boolean; c_price: boolean; c_mrp: boolean; c_img: boolean;
  ok_count: number; err_fail: number; pct: number; inv_status: InventoryStatus; attn: boolean;
}

// ------------------------------------------------------------------------------------------------
// filters + sort
// ------------------------------------------------------------------------------------------------
export interface CatalogFilters {
  q?: string; status?: string[]; categoryId?: string[]; channel?: string[]; inventory?: string[]; productType?: string[]; needsAttention?: boolean;
}
export type SortSpec = Array<{ field: string; direction: 'asc' | 'desc' }>;

function whereOf(vendorId: string, f: CatalogFilters, o: { tabs?: boolean } = {}): SQL {
  const c: SQL[] = [];
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    c.push(sql`(f.title ilike ${like} or f.product_code ilike ${like} or exists (select 1 from product_variants pv where pv.vendor_id = ${vendorId} and pv.product_id = f.id and pv.deleted_at is null and (pv.sku ilike ${like} or pv.barcode ilike ${like})))`);
  }
  if (!o.tabs && f.status?.length) c.push(sql`f.status in (${csvList(f.status)})`);
  if (f.categoryId?.length) c.push(sql`f.category_id in (${uuidList(f.categoryId)})`);
  if (f.channel?.length) c.push(sql`exists (select 1 from pch where pch.product_id = f.id and pch.marketplace in (${csvList(f.channel)}))`);
  if (f.inventory?.length) c.push(sql`f.inv_status in (${csvList(f.inventory)})`);
  if (f.productType?.length) c.push(sql`f.product_type in (${csvList(f.productType)})`);
  if (!o.tabs && f.needsAttention) c.push(sql`f.attn`);
  return c.length ? sql`where ${sql.join(c, sql` and `)}` : sql``;
}

function orderOf(sort?: SortSpec): SQL {
  const s = sort?.[0];
  const dir = sql.raw((s ? s.direction : 'desc') === 'asc' ? 'asc' : 'desc');
  switch (s?.field) {
    case 'title': return sql`order by lower(f.title) ${dir}, f.id`;
    case 'sku': return sql`order by lower(f.product_code) ${dir}, f.id`;
    case 'inventory': return sql`order by f.avail ${dir}, f.id`;
    default: return sql`order by f.updated_at ${dir}, f.id`; // updatedAt, newest first unless told otherwise
  }
}

// ------------------------------------------------------------------------------------------------
// stats + tab counts
// ------------------------------------------------------------------------------------------------
export async function productStats(tx: Tx, vendorId: string, f: CatalogFilters) {
  const thr = await lowStockThreshold(tx, vendorId);
  const [r] = await rows<Record<string, number>>(tx, sql`
    with ${readModel(vendorId, thr)}
    select count(*)::int as all_n,
      count(*) filter (where f.status = 'active')::int as active_n,
      count(*) filter (where f.status = 'draft')::int as draft_n,
      count(*) filter (where f.status = 'archived')::int as archived_n,
      count(*) filter (where f.attn)::int as attn_n,
      coalesce(sum(f.variant_count), 0)::int as variants_n,
      coalesce(sum(f.active_variants) filter (where f.status = 'active'), 0)::int as active_variants_n
    from pf f ${whereOf(vendorId, f, { tabs: true })}`);
  const n = (k: string) => Number(r?.[k] ?? 0);
  return {
    products: n('all_n'), variants: n('variants_n'), activeProducts: n('active_n'), activeVariants: n('active_variants_n'),
    draft: n('draft_n'), archived: n('archived_n'), needsAttention: n('attn_n'),
    tabs: { all: n('all_n'), active: n('active_n'), draft: n('draft_n'), archived: n('archived_n'), needsAttention: n('attn_n') },
  };
}

// ------------------------------------------------------------------------------------------------
// catalog list
// ------------------------------------------------------------------------------------------------
async function pfRows(tx: Tx, vendorId: string, f: CatalogFilters, sort: SortSpec | undefined, win: { limit: number; offset: number }) {
  const thr = await lowStockThreshold(tx, vendorId);
  const list = await rows<PfRow>(tx, sql`with ${readModel(vendorId, thr)} select f.* from pf f ${whereOf(vendorId, f)} ${orderOf(sort)} limit ${win.limit} offset ${win.offset}`);
  const [c] = await rows<{ n: number }>(tx, sql`with ${readModel(vendorId, thr)} select count(*)::int as n from pf f ${whereOf(vendorId, f)}`);
  return { rows: list, total: Number(c?.n ?? 0) };
}

interface ChannelRow { product_id: string; marketplace: string; account_id: string; status: string; error: string | null; last_synced_at: Date | string | null }

async function listingRowsFor(tx: Tx, vendorId: string, productIds: string[]): Promise<ChannelRow[]> {
  if (!productIds.length) return [];
  return rows<ChannelRow>(tx, sql`
    select pv.product_id, ma.marketplace, ma.id as account_id, ml.status, ml.last_error_code as error, ml.last_synced_at
    from marketplace_listings ml
    join product_variants pv on pv.id = ml.variant_id and pv.vendor_id = ml.vendor_id
    join marketplace_accounts ma on ma.id = ml.marketplace_account_id and ma.vendor_id = ml.vendor_id
    where ml.vendor_id = ${vendorId} and pv.deleted_at is null and pv.product_id in (${uuidList(productIds)})`);
}

const thumbHref = (docId: string) => `/api/v1/documents/${docId}/content`;

async function thumbsFor(tx: Tx, vendorId: string, productIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!productIds.length) return out;
  const r = await rows<{ product_id: string; id: string }>(tx, sql`
    select distinct on (product_id) product_id, id from product_documents
    where vendor_id = ${vendorId} and kind = 'image' and status in ('uploaded', 'processed') and deleted_at is null and product_id in (${uuidList(productIds)})
    order by product_id, is_primary desc, sort_order, created_at, id`);
  for (const x of r) out.set(x.product_id, thumbHref(x.id));
  return out;
}

async function sales30d(tx: Tx, vendorId: string, productIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!productIds.length) return out;
  const r = await rows<{ product_id: string; units: number }>(tx, sql`
    select pv.product_id, coalesce(sum(oi.quantity), 0)::int as units
    from order_items oi
    join orders o on o.id = oi.order_id and o.vendor_id = oi.vendor_id
    join product_variants pv on pv.id = oi.variant_id and pv.vendor_id = oi.vendor_id
    where oi.vendor_id = ${vendorId} and pv.product_id in (${uuidList(productIds)}) and o.status <> 'cancelled' and o.created_at >= now() - interval '30 days'
    group by pv.product_id`);
  for (const x of r) out.set(x.product_id, Number(x.units));
  return out;
}

export interface CardSummary {
  thumbnailUrl: string | null; skuFamily: string; variantCount: number; availableUnits: number; inventoryStatus: InventoryStatus;
  channels: Array<{ code: string; name: string; listingStatus: ChannelStatus }>; publishReadinessPct: number;
  hint: { key: string; text: string }; primaryAction: { key: 'open' | 'review_inventory' | 'update_inventory' | 'continue_editing'; href: string };
}

function channelsOf(listings: ChannelRow[], names: ChannelNameFn): CardSummary['channels'] {
  const byCode = new Map<string, ChannelStatus[]>();
  for (const l of listings) byCode.set(l.marketplace, [...(byCode.get(l.marketplace) ?? []), listingStatusOf({ status: l.status, error: l.error })]);
  return [...byCode.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, ss]) => ({ code, name: names(code), listingStatus: rollupStatus(ss) }));
}

/** the card rules of the design: Active / Low stock / Out of stock / Draft */
export function cardHint(r: PfRow, o: { attention: number; unitsSold30d: number; live?: number }): Pick<CardSummary, 'hint' | 'primaryAction'> {
  const base = `/products/${r.id}`;
  // a product that is live on a channel is not "ready to publish", whatever its status says: the CTA follows the listings
  if (r.status === 'draft' && (o.live ?? 0) > 0) return { hint: { key: 'live_on_channels', text: `Live on ${o.live} ${o.live === 1 ? 'channel' : 'channels'}` }, primaryAction: { key: 'open', href: base } };
  if (r.status === 'draft') {
    const missing = [!r.c_img ? 'Images' : null, !r.c_desc ? 'description' : null].filter(Boolean) as string[];
    const text = missing.length === 2 ? 'Images and description missing' : missing.length === 1 ? `${missing[0]} missing` : r.pct >= 100 ? 'Ready to publish' : 'Product details incomplete';
    return { hint: { key: missing.length ? 'draft_missing_content' : r.pct >= 100 ? 'draft_ready' : 'draft_incomplete', text: text.charAt(0).toUpperCase() + text.slice(1) }, primaryAction: { key: 'continue_editing', href: `${base}/edit` } };
  }
  if (r.status === 'archived') return { hint: { key: 'archived', text: 'Archived' }, primaryAction: { key: 'open', href: base } };
  if (r.inv_status === 'out') return { hint: { key: 'out_of_stock', text: 'Potential lost sales' }, primaryAction: { key: 'update_inventory', href: `${base}?tab=inventory` } };
  if (r.inv_status === 'low') {
    const perDay = o.unitsSold30d / 30;
    const days = perDay > 0 ? Math.max(0, Math.floor(r.avail / perDay)) : null;
    return { hint: days !== null ? { key: 'low_stock_coverage', text: `Stock coverage: ${days} ${days === 1 ? 'day' : 'days'}` } : { key: 'low_stock', text: 'Stock is running low' }, primaryAction: { key: 'review_inventory', href: `${base}?tab=inventory` } };
  }
  if (o.attention > 0) return { hint: { key: 'listing_attention', text: `${o.attention} ${o.attention === 1 ? 'listing needs' : 'listings need'} attention` }, primaryAction: { key: 'open', href: base } };
  return { hint: { key: 'healthy', text: 'Everything looks good' }, primaryAction: { key: 'open', href: base } };
}

async function decorate(tx: Tx, vendorId: string, list: PfRow[], names: ChannelNameFn): Promise<Array<{ row: PfRow; summary: CardSummary }>> {
  const ids = list.map((r) => r.id);
  const lowIds = list.filter((r) => r.status === 'active' && r.inv_status === 'low').map((r) => r.id);
  const [listings, thumbs, sold] = await Promise.all([listingRowsFor(tx, vendorId, ids), thumbsFor(tx, vendorId, ids), sales30d(tx, vendorId, lowIds)]);
  const byProduct = new Map<string, ChannelRow[]>();
  for (const l of listings) byProduct.set(l.product_id, [...(byProduct.get(l.product_id) ?? []), l]);
  return list.map((row) => {
    const ls = byProduct.get(row.id) ?? [];
    const channels = channelsOf(ls, names);
    const attention = ls.filter((l) => listingStatusOf({ status: l.status, error: l.error }) === 'attention').length;
    const { hint, primaryAction } = cardHint(row, { attention, unitsSold30d: sold.get(row.id) ?? 0, live: channels.filter((ch) => ch.listingStatus === 'active').length });
    return {
      row,
      summary: {
        thumbnailUrl: thumbs.get(row.id) ?? null, skuFamily: row.product_code, variantCount: row.variant_count, availableUnits: row.avail, inventoryStatus: row.inv_status,
        channels, publishReadinessPct: row.pct, hint, primaryAction,
      },
    };
  });
}

export async function catalogPage(tx: Tx, vendorId: string, f: CatalogFilters, sort: SortSpec | undefined, win: { limit: number; offset: number }, names: ChannelNameFn) {
  const { rows: list, total } = await pfRows(tx, vendorId, f, sort, win);
  const cards = await decorate(tx, vendorId, list, names);
  const products = list.length ? await tx.select().from(P).where(and(eq(P.vendorId, vendorId), inArray(P.id, list.map((r) => r.id)))) : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = cards.flatMap(({ row, summary }) => {
    const p = byId.get(row.id);
    return p ? [{ ...svc.toProductDto(p, row.variant_count), summary }] : [];
  });
  return { items, total };
}

export async function catalogExportCsv(tx: Tx, vendorId: string, f: CatalogFilters, sort: SortSpec | undefined, names: ChannelNameFn) {
  const thr = await lowStockThreshold(tx, vendorId);
  const [c] = await rows<{ n: number }>(tx, sql`with ${readModel(vendorId, thr)} select count(*)::int as n from pf f ${whereOf(vendorId, f)}`);
  const total = Number(c?.n ?? 0);
  if (total > MAX_EXPORT_ROWS) throw new AppError('PAYLOAD_TOO_LARGE', `The export has ${total} rows; the limit is ${MAX_EXPORT_ROWS}. Narrow the filters.`, { details: { total, max: MAX_EXPORT_ROWS } });
  const { rows: list } = await pfRows(tx, vendorId, f, sort, { limit: MAX_EXPORT_ROWS, offset: 0 });
  const header = ['product_code', 'title', 'status', 'product_type', 'category_id', 'variants', 'available_units', 'inventory_status', 'channels', 'publish_readiness_pct', 'needs_attention', 'updated_at'];
  const out: Array<Array<string | number | boolean | null>> = [header];
  for (const part of chunk(list, 1000)) {
    for (const { row, summary } of await decorate(tx, vendorId, part, names)) {
      out.push([row.product_code, row.title, row.status, row.product_type, row.category_id, row.variant_count, row.avail, row.inv_status, summary.channels.map((x) => x.code).join('|'), row.pct, row.attn, iso(row.updated_at)]);
    }
  }
  return { rows: out, count: list.length };
}

// ------------------------------------------------------------------------------------------------
// per-product variant stock (shared by overview / inventory / variant grid)
// ------------------------------------------------------------------------------------------------
export interface VariantStock {
  id: string; sku: string; barcode: string | null; optionValues: Record<string, string>; status: 'active' | 'inactive';
  onHand: number; reserved: number; available: number; incoming: number; threshold: number; stockStatus: InventoryStatus;
}
const OPTION_ORDER = ['color', 'colour', 'size'];
/** "Navy / Large": color first, then size, then other options alphabetically (jsonb does not keep insertion order) */
export const variantName = (v: { sku: string; optionValues: Record<string, string> }) => {
  const keys = Object.keys(v.optionValues ?? {}).sort((a, b) => { const ia = OPTION_ORDER.indexOf(a.toLowerCase()); const ib = OPTION_ORDER.indexOf(b.toLowerCase()); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); });
  return keys.length ? keys.map((k) => v.optionValues[k]).join(' / ') : v.sku;
};
const stockStatusOf = (available: number, threshold: number): InventoryStatus => (available <= 0 ? 'out' : available <= threshold ? 'low' : 'healthy');

async function variantStocks(tx: Tx, vendorId: string, productId: string, thr: number): Promise<VariantStock[]> {
  const r = await rows<{ id: string; sku: string; barcode: string | null; option_values: Record<string, string>; status: 'active' | 'inactive'; on_hand: number; reserved: number; incoming: number; rl: number | null }>(tx, sql`
    select pv.id, pv.sku, pv.barcode, pv.option_values, pv.status,
      coalesce(sum(i.quantity_on_hand), 0)::int as on_hand, coalesce(sum(i.quantity_reserved), 0)::int as reserved,
      coalesce(sum(i.quantity_incoming), 0)::int as incoming, max(i.reorder_level) as rl
    from product_variants pv
    left join inventory i on i.vendor_id = pv.vendor_id and i.variant_id = pv.id
    where pv.vendor_id = ${vendorId} and pv.product_id = ${productId}::uuid and pv.deleted_at is null
    group by pv.id order by pv.created_at, pv.id`);
  return r.map((x) => {
    const available = Number(x.on_hand) - Number(x.reserved);
    const threshold = x.rl ?? thr;
    return { id: x.id, sku: x.sku, barcode: x.barcode, optionValues: x.option_values ?? {}, status: x.status, onHand: Number(x.on_hand), reserved: Number(x.reserved), available, incoming: Number(x.incoming), threshold, stockStatus: stockStatusOf(available, threshold) };
  });
}

interface WarehouseRow { id: string; code: string; name: string; on_hand: number; reserved: number; incoming: number }
async function warehouseBreakdown(tx: Tx, vendorId: string, productId: string) {
  const r = await rows<WarehouseRow>(tx, sql`
    select w.id, w.code, w.name, sum(i.quantity_on_hand)::int as on_hand, sum(i.quantity_reserved)::int as reserved, sum(i.quantity_incoming)::int as incoming
    from inventory i
    join product_variants pv on pv.id = i.variant_id and pv.vendor_id = i.vendor_id
    join warehouses w on w.id = i.warehouse_id and w.vendor_id = i.vendor_id
    where i.vendor_id = ${vendorId} and pv.product_id = ${productId}::uuid and pv.deleted_at is null and pv.status = 'active'
    group by w.id order by w.priority, w.code`);
  return r.map((w) => ({ warehouseId: w.id, code: w.code, name: w.name, available: Number(w.on_hand) - Number(w.reserved), onHand: Number(w.on_hand), reserved: Number(w.reserved), incoming: Number(w.incoming) }));
}

// ------------------------------------------------------------------------------------------------
// product inventory tab
// ------------------------------------------------------------------------------------------------
export async function productInventory(tx: Tx, vendorId: string, productId: string) {
  await svc.getProductRow(tx, vendorId, productId);
  const thr = await lowStockThreshold(tx, vendorId);
  const vs = (await variantStocks(tx, vendorId, productId, thr)).filter((v) => v.status === 'active');
  const byWarehouse = await warehouseBreakdown(tx, vendorId, productId);
  const totals = {
    available: vs.reduce((a, v) => a + v.available, 0), reserved: vs.reduce((a, v) => a + v.reserved, 0), incoming: vs.reduce((a, v) => a + v.incoming, 0),
    lowStockVariants: vs.filter((v) => v.stockStatus === 'low' || v.stockStatus === 'out').length,
  };
  const status: InventoryStatus = totals.available <= 0 ? 'out' : totals.lowStockVariants > 0 ? 'low' : 'healthy';
  const low = vs.filter((v) => v.stockStatus !== 'healthy');
  return {
    productId, totals, health: { status, variants: vs.length, lowStockThreshold: thr },
    byVariant: vs.map((v) => ({ variantId: v.id, name: variantName(v), sku: v.sku, available: v.available, reserved: v.reserved, incoming: v.incoming, threshold: v.threshold, status: v.stockStatus })),
    byWarehouse,
    lowStock: low.length ? { count: low.length, variants: low.map((v) => ({ variantId: v.id, name: variantName(v), sku: v.sku, available: v.available, status: v.stockStatus as 'low' | 'out' })) } : null,
  };
}

// ------------------------------------------------------------------------------------------------
// product listings tab
// ------------------------------------------------------------------------------------------------
interface ProductListingRow {
  id: string; variant_id: string; sku: string; marketplace: string; account_id: string; account_name: string; status: string; external_status: string | null;
  error: string | null; issues: Array<{ code: string; message: string; severity?: string }> | null; last_synced_at: Date | string | null; published_at: Date | string | null;
}
async function productListingRows(tx: Tx, vendorId: string, productId: string) {
  return rows<ProductListingRow>(tx, sql`
    select ml.id, ml.variant_id, pv.sku, ma.marketplace, ma.id as account_id, ma.display_name as account_name, ml.status, ml.external_status,
           ml.last_error_code as error, ml.issues, ml.last_synced_at, ml.published_at
    from marketplace_listings ml
    join product_variants pv on pv.id = ml.variant_id and pv.vendor_id = ml.vendor_id
    join marketplace_accounts ma on ma.id = ml.marketplace_account_id and ma.vendor_id = ml.vendor_id
    where ml.vendor_id = ${vendorId} and pv.product_id = ${productId}::uuid and pv.deleted_at is null
    order by ma.marketplace, pv.sku, ml.id`);
}

const firstError = (l: ProductListingRow): string | null => {
  const issue = (l.issues ?? []).find((i) => i.severity !== 'warning') ?? null;
  return issue?.message ?? l.error ?? null;
};

function channelSummary(ls: ProductListingRow[], names: ChannelNameFn) {
  const by = new Map<string, ProductListingRow[]>();
  for (const l of ls) by.set(l.account_id, [...(by.get(l.account_id) ?? []), l]);
  const channels = [...by.values()].map((group) => {
    const first = group[0]!;
    const status = rollupStatus(group.map((l) => listingStatusOf({ status: l.status, error: l.error })));
    const syncs = group.map((l) => (l.last_synced_at ? new Date(l.last_synced_at).getTime() : 0));
    const last = Math.max(0, ...syncs);
    const bad = group.find((l) => listingStatusOf({ status: l.status, error: l.error }) === 'attention');
    return {
      channel: { code: first.marketplace, name: names(first.marketplace), accountId: first.account_id }, accountName: first.account_name,
      listingStatus: status, listings: group.length, lastSyncAt: last ? new Date(last).toISOString() : null, error: bad ? firstError(bad) : null,
    };
  }).sort((a, b) => a.channel.code.localeCompare(b.channel.code));
  const lastSyncAt = channels.map((c) => c.lastSyncAt).filter(Boolean).sort().pop() ?? null;
  return {
    channels, lastSyncAt,
    summary: {
      connected: channels.filter((c) => isConnected(c.listingStatus)).length, active: channels.filter((c) => c.listingStatus === 'active').length,
      attention: channels.filter((c) => c.listingStatus === 'attention').length, lastSyncAt,
    },
  };
}

export async function productListings(tx: Tx, vendorId: string, productId: string, names: ChannelNameFn) {
  await svc.getProductRow(tx, vendorId, productId);
  const ls = await productListingRows(tx, vendorId, productId);
  const s = channelSummary(ls, names);
  return {
    productId, summary: s.summary, channels: s.channels.map((c) => ({ channel: c.channel, listingStatus: c.listingStatus, listings: c.listings, lastSyncAt: c.lastSyncAt, error: c.error })),
    items: ls.map((l) => {
      const st = listingStatusOf({ status: l.status, error: l.error });
      return {
        channel: { code: l.marketplace, name: names(l.marketplace), accountId: l.account_id }, listingId: l.id, variantId: l.variant_id, sku: l.sku, status: st, rawStatus: l.status,
        lastSyncAt: iso(l.last_synced_at), error: st === 'attention' ? firstError(l) ?? l.external_status : null,
      };
    }),
    publicationModel: 'master>listing>marketplace' as const,
  };
}

// ------------------------------------------------------------------------------------------------
// content tab
// ------------------------------------------------------------------------------------------------
type FieldState = 'complete' | 'missing' | 'needs_review';

export async function productContent(tx: Tx, vendorId: string, productId: string, names: ChannelNameFn) {
  const p = await svc.getProductRow(tx, vendorId, productId);
  const thr = await lowStockThreshold(tx, vendorId);
  const [pf] = await rows<PfRow>(tx, sql`with ${readModel(vendorId, thr, productId)} select f.* from pf f`);
  const ready = await evaluateReadiness(tx, vendorId, productId);
  const ok = (code: string) => ready.checks.filter((c) => c.code === code).every((c) => c.ok);
  const attrChecks = ready.checks.filter((c) => c.code.startsWith('attribute:'));
  const attributesOk = ['brand', 'category', 'hsn', 'gst', 'origin'].every(ok) && attrChecks.every((c) => c.ok);
  const marketplaceData = await rows<{ marketplace: string; data: Record<string, unknown>; updated_at: Date | string }>(tx, sql`select marketplace, data, updated_at from product_marketplace_data where vendor_id = ${vendorId} and product_id = ${productId}::uuid`);
  const ls = await productListingRows(tx, vendorId, productId);
  const channelState = (code: string): { state: 'ok' | 'needs_review' | 'not_published'; issues: Array<{ code: string; message: string; severity: string }> } => {
    const mine = ls.filter((l) => l.marketplace === code);
    if (!mine.length || mine.every((l) => !isConnected(listingStatusOf({ status: l.status, error: l.error })))) return { state: 'not_published', issues: [] };
    const issues = mine.flatMap((l) => (l.issues ?? []).filter((i) => i.severity !== 'warning').map((i) => ({ code: i.code, message: i.message, severity: i.severity ?? 'error' })));
    const attention = mine.some((l) => listingStatusOf({ status: l.status, error: l.error }) === 'attention');
    return { state: attention || issues.length ? 'needs_review' : 'ok', issues };
  };
  const codes = [...new Set([...ls.map((l) => l.marketplace), ...marketplaceData.map((m) => m.marketplace)])].sort();
  const marketplaceContent = codes.map((code) => ({ channel: { code, name: names(code) }, hasMasterData: marketplaceData.some((m) => m.marketplace === code), ...channelState(code) }));
  const mcState: 'ok' | 'needs_review' | 'not_published' = marketplaceContent.length === 0 || marketplaceContent.every((m) => m.state === 'not_published') ? 'not_published' : marketplaceContent.some((m) => m.state === 'needs_review') ? 'needs_review' : 'ok';
  const fields: Array<{ key: string; state: FieldState | 'ok' | 'needs_review' | 'not_published' }> = [
    { key: 'title', state: ok('title') ? 'complete' : 'needs_review' },
    { key: 'description', state: ok('description') ? 'complete' : 'missing' },
    { key: 'images', state: ok('image') ? 'complete' : 'missing' },
    { key: 'attributes', state: attributesOk ? 'complete' : 'missing' },
    { key: 'marketplace_content', state: mcState },
  ];

  const values = await getProductAttributeValues(tx, vendorId, productId);
  const attributeRows: Array<{ attribute: string; value: string | number | boolean | null; state: FieldState }> = [
    { attribute: 'title', value: p.title, state: ok('title') ? 'complete' : 'needs_review' },
    { attribute: 'description', value: p.description, state: ok('description') ? 'complete' : 'missing' },
    { attribute: 'brand', value: p.brand, state: ok('brand') ? 'complete' : 'missing' },
    { attribute: 'category', value: p.categoryId, state: ok('category') ? 'complete' : 'missing' },
    { attribute: 'hsn_code', value: p.hsnCode, state: ok('hsn') ? 'complete' : 'missing' },
    { attribute: 'gst_rate_bps', value: p.gstRateBps, state: ok('gst') ? 'complete' : 'missing' },
    { attribute: 'country_of_origin', value: p.countryOfOrigin, state: ok('origin') ? 'complete' : 'missing' },
    ...values.filter((v) => v.variantId === null).map((v) => ({ attribute: v.code, value: v.value, state: (v.value === null ? 'missing' : 'complete') as FieldState })),
    ...attrChecks.filter((c) => !c.ok).map((c) => ({ attribute: c.code.slice('attribute:'.length), value: null, state: 'missing' as FieldState })),
  ];
  const seen = new Set<string>();
  const masterAttributes = attributeRows.filter((r) => (seen.has(r.attribute) ? false : (seen.add(r.attribute), true)));
  return { productId, readiness: { pct: pf?.pct ?? 0, ready: ready.ready, errors: ready.errors, warnings: ready.warnings, fields }, masterAttributes, marketplaceContent };
}

// ------------------------------------------------------------------------------------------------
// activity feed
// ------------------------------------------------------------------------------------------------
export type ActivityScope = 'all' | 'master' | 'variants' | 'channels';
const SCOPE_TYPES: Record<ActivityScope, string[] | null> = { all: null, master: ['content', 'inventory'], variants: ['variants'], channels: ['listings'] };

function activityBase(vendorId: string, productId: string): SQL {
  return sql`
  u as (
    select 'audit'::text as src, a.created_at as at, 'a' || a.id::text as uid, a.action as event, a.resource_type as rtype, a.resource_id as rid,
           a.actor_type, a.actor_id, jsonb_build_object('before', a.before, 'after', a.after, 'metadata', a.metadata) as data
    from audit_logs a
    where a.vendor_id = ${vendorId} and (
      (a.resource_type = 'product' and a.resource_id = ${productId})
      or (a.resource_type = 'variant' and a.resource_id in (select id::text from product_variants where vendor_id = ${vendorId} and product_id = ${productId}::uuid))
      or (a.resource_type = 'listing' and a.resource_id in (select ml.id::text from marketplace_listings ml join product_variants pv on pv.id = ml.variant_id and pv.vendor_id = ml.vendor_id where ml.vendor_id = ${vendorId} and pv.product_id = ${productId}::uuid)))
    union all
    select 'movement', m.created_at, 'm' || m.id::text, 'inventory.' || m.type, 'variant', m.variant_id::text, m.actor_type, m.actor_id,
           jsonb_build_object('sku', pv.sku, 'warehouse', w.name, 'deltaOnHand', m.delta_on_hand, 'deltaReserved', m.delta_reserved, 'deltaIncoming', m.delta_incoming, 'reason', m.reason, 'referenceType', m.reference_type, 'onHandAfter', m.on_hand_after)
    from inventory_movements m
    join product_variants pv on pv.id = m.variant_id and pv.vendor_id = m.vendor_id
    join warehouses w on w.id = m.warehouse_id and w.vendor_id = m.vendor_id
    where m.vendor_id = ${vendorId} and pv.product_id = ${productId}::uuid
    union all
    select 'listing', coalesce(ml.last_synced_at, ml.updated_at), 'l' || ml.id::text, case when ml.last_error_code is not null then 'listing.sync_failed' else 'listing.synced' end, 'listing', ml.id::text, 'system', null,
           jsonb_build_object('channel', ma.marketplace, 'sku', pv.sku, 'status', ml.status, 'error', ml.last_error_code)
    from marketplace_listings ml
    join product_variants pv on pv.id = ml.variant_id and pv.vendor_id = ml.vendor_id
    join marketplace_accounts ma on ma.id = ml.marketplace_account_id and ma.vendor_id = ml.vendor_id
    where ml.vendor_id = ${vendorId} and pv.product_id = ${productId}::uuid and (ml.last_error_code is not null or ml.last_synced_at is not null)),
  t as (
    select u.*, case when u.src = 'movement' then 'inventory'
                     when u.src = 'listing' or u.rtype = 'listing' or u.event like 'product.marketplace%' then 'listings'
                     when u.rtype = 'variant' then 'variants' else 'content' end as type
    from u)`;
}

interface ActivityRaw { src: string; at: Date | string; uid: string; event: string; rtype: string | null; rid: string | null; actor_type: string; actor_id: string | null; data: Record<string, any>; type: 'inventory' | 'content' | 'listings' | 'variants'; actor_name: string | null }

const HUMAN: Record<string, string> = {
  'product.create': 'Product created', 'product.update': 'Product content edited', 'product.archive': 'Product archived', 'product.delete': 'Product deleted',
  'product.attributes_set': 'Product attributes updated', 'product.duplicate': 'Product duplicated', 'product.bulk_update_status': 'Product status changed',
  'variant.create': 'Variant added', 'variant.update': 'Variant updated', 'variant.delete': 'Variant deleted', 'variant.lead_time_set': 'Variant lead time changed', 'variant.bulk_archive': 'Variants archived', 'variant.bulk_activate': 'Variants activated', 'variant.bulk_delete': 'Variants deleted',
  'listing.create': 'Listing created', 'listing.publish': 'Listing published', 'listing.publish_requested': 'Listing publication requested', 'listing.approve': 'Listing approved', 'listing.update': 'Listing updated', 'listing.unpublish': 'Listing unpublished', 'listing.status_changed': 'Listing status changed', 'listing.validate': 'Listing validated', 'listing.delete': 'Listing deleted',
  'listing.sync_failed': 'Listing synchronization failed', 'listing.synced': 'Listing synchronized', 'product.marketplace_data_set': 'Marketplace content updated',
};

function activityRow(r: ActivityRaw, names: ChannelNameFn) {
  const d = r.data ?? {};
  const before = (d.before ?? {}) as Record<string, any>;
  const after = (d.after ?? {}) as Record<string, any>;
  const meta = (d.metadata ?? {}) as Record<string, any>;
  const params: Record<string, string | number | boolean | null> = {};
  let text: string;
  if (r.src === 'movement') {
    const delta = Number(d.deltaOnHand ?? 0);
    Object.assign(params, { sku: d.sku, warehouse: d.warehouse, deltaOnHand: delta, deltaReserved: Number(d.deltaReserved ?? 0), deltaIncoming: Number(d.deltaIncoming ?? 0), reason: d.reason ?? null, onHandAfter: Number(d.onHandAfter ?? 0) });
    const kind = r.event.slice('inventory.'.length);
    text = `Inventory ${kind.replace(/_/g, ' ')} for ${d.sku}${delta ? ` (${delta > 0 ? '+' : ''}${delta})` : ''}`;
  } else if (r.src === 'listing') {
    Object.assign(params, { channel: d.channel, channelName: names(String(d.channel)), sku: d.sku, status: d.status, error: d.error ?? null });
    text = `${names(String(d.channel))} listing ${r.event === 'listing.sync_failed' ? 'synchronization failed' : 'synchronized'}`;
  } else {
    const sku = after.sku ?? before.sku;
    if (sku) params.sku = String(sku);
    if (after.status) params.status = String(after.status);
    if (before.status) params.previousStatus = String(before.status);
    if (meta.marketplace) { params.channel = String(meta.marketplace); params.channelName = names(String(meta.marketplace)); }
    if (r.rtype === 'listing' && r.rid) params.listingId = r.rid;
    const base = HUMAN[r.event] ?? r.event.replace(/[._]/g, ' ');
    text = params.channelName && r.event === 'product.marketplace_data_set' ? `${params.channelName} content updated` : params.sku && r.rtype === 'variant' ? `${base} (${params.sku})` : base;
  }
  return { at: iso(r.at)!, type: r.type, event: r.event, params, text, actor: r.actor_id || r.actor_type ? { type: r.actor_type, id: r.actor_id, name: r.actor_name } : null };
}

export async function productActivity(tx: Tx, vendorId: string, productId: string, scope: ActivityScope, win: { limit: number; offset: number }, names: ChannelNameFn) {
  await svc.getProductRow(tx, vendorId, productId);
  const types = SCOPE_TYPES[scope];
  const where = types ? sql`where t.type in (${csvList(types)})` : sql``;
  const base = activityBase(vendorId, productId);
  const list = await rows<ActivityRaw>(tx, sql`
    with ${base}
    select t.*, usr.full_name as actor_name from t
    left join users usr on t.actor_type = 'user' and usr.id::text = t.actor_id
    ${where} order by t.at desc, t.uid desc limit ${win.limit} offset ${win.offset}`);
  const [c] = await rows<{ n: number }>(tx, sql`with ${base} select count(*)::int as n from t ${where}`);
  return { items: list.map((r) => activityRow(r, names)), total: Number(c?.n ?? 0) };
}

// ------------------------------------------------------------------------------------------------
// overview (shared header + health strip + Overview tab)
// ------------------------------------------------------------------------------------------------
export interface Action { key: string; label: string; method: string; href: string; enabled: boolean; disabledReason: string | null }

export async function productOverview(tx: Tx, vendorId: string, productId: string, names: ChannelNameFn) {
  const p = await svc.getProductRow(tx, vendorId, productId);
  const thr = await lowStockThreshold(tx, vendorId);
  const [vs, wh, ls, ready, pfRow] = await Promise.all([
    variantStocks(tx, vendorId, productId, thr),
    warehouseBreakdown(tx, vendorId, productId),
    productListingRows(tx, vendorId, productId),
    evaluateReadiness(tx, vendorId, productId),
    rows<PfRow>(tx, sql`with ${readModel(vendorId, thr, productId)} select f.* from pf f`),
  ]);
  const pf = pfRow[0]!;
  const [cat] = p.categoryId ? await tx.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).where(and(eq(schema.categories.vendorId, vendorId), eq(schema.categories.id, p.categoryId))) : [];
  const docs = await tx.select().from(schema.productDocuments)
    .where(and(eq(schema.productDocuments.vendorId, vendorId), eq(schema.productDocuments.productId, productId), eq(schema.productDocuments.kind, 'image'), inArray(schema.productDocuments.status, ['uploaded', 'processed']), sql`${schema.productDocuments.deletedAt} is null`))
    .orderBy(sql`${schema.productDocuments.isPrimary} desc`, schema.productDocuments.sortOrder, schema.productDocuments.createdAt);
  const media = docs.map((d) => ({ id: d.id, fileName: d.fileName, isPrimary: d.isPrimary, url: thumbHref(d.id) }));
  const active = vs.filter((v) => v.status === 'active');
  const inv = {
    available: active.reduce((a, v) => a + v.available, 0), reserved: active.reduce((a, v) => a + v.reserved, 0), incoming: active.reduce((a, v) => a + v.incoming, 0),
    lowStockVariants: active.filter((v) => v.stockStatus !== 'healthy').length,
  };
  const invStatus: InventoryStatus = inv.available <= 0 ? 'out' : inv.lowStockVariants > 0 ? 'low' : 'healthy';
  const ch = channelSummary(ls, names);
  const content = productContentSummary(ready, ls, pf.pct);
  const attentionChannel = ch.channels.find((c) => c.listingStatus === 'attention');
  const healthState: 'ready' | 'incomplete' = ready.ready ? 'ready' : 'incomplete';
  const missing = ready.checks.filter((c) => !c.ok && c.severity === 'error').map((c) => c.code);
  const attentionBanner = attentionChannel
    ? { key: 'listing_attention', text: `${attentionChannel.channel.name} listing requires review`, action: { key: 'review_listing', href: `/products/${productId}?tab=listings` } }
    : p.status !== 'archived' && healthState === 'incomplete'
      ? { key: 'product_incomplete', text: 'Product information incomplete', action: { key: 'complete_product', href: `/products/${productId}/edit` } }
      : null;
  const canPublish = ready.ready && p.status !== 'archived';
  const api = `/api/v1/products/${productId}`;
  const actions: Action[] = [
    { key: 'edit_product', label: 'Edit product', method: 'PATCH', href: api, enabled: p.status !== 'archived', disabledReason: p.status === 'archived' ? 'archived' : null },
    { key: 'manage_variants', label: 'Manage variants', method: 'GET', href: `${api}/variant-grid`, enabled: true, disabledReason: null },
    { key: 'update_inventory', label: 'Update inventory', method: 'POST', href: '/api/v1/inventory/receive', enabled: active.length > 0, disabledReason: active.length ? null : 'no_active_variant' },
    { key: 'manage_listings', label: 'Manage listings', method: 'GET', href: `${api}/listings`, enabled: true, disabledReason: null },
    { key: 'publish_product', label: 'Publish product', method: 'POST', href: '/api/v1/listings', enabled: canPublish, disabledReason: canPublish ? null : p.status === 'archived' ? 'archived' : 'readiness_incomplete' },
    { key: 'duplicate', label: 'Duplicate', method: 'POST', href: `${api}/duplicate`, enabled: true, disabledReason: null },
    { key: 'export', label: 'Export product', method: 'GET', href: `/api/v1/products/export?q=${encodeURIComponent(p.productCode)}`, enabled: true, disabledReason: null },
  ];
  const options: Record<string, string[]> = {};
  for (const v of vs) for (const [k, val] of Object.entries(v.optionValues)) options[k] = [...new Set([...(options[k] ?? []), val])];
  const recent = await productActivity(tx, vendorId, productId, 'all', { limit: 4, offset: 0 }, names);
  const productDto = svc.toProductDto(p, vs.length);
  return {
    product: { ...productDto, category: cat ? { id: cat.id, name: cat.name } : null, skuFamily: p.productCode },
    primaryImage: media[0] ? { id: media[0].id, url: media[0].url } : null,
    health: { state: healthState, missing, text: healthState === 'ready' ? 'Product information is complete.' : 'Add missing attributes to improve listing readiness.' },
    inventory: { ...inv, status: invStatus, byWarehouse: wh.map((w) => ({ warehouseId: w.warehouseId, warehouse: w.name, available: w.available })) },
    variants: {
      count: vs.length, sellable: active.length, options,
      items: vs.slice(0, 4).map((v) => ({ variantId: v.id, name: variantName(v), sku: v.sku, optionValues: v.optionValues, available: v.available, stockStatus: v.stockStatus, status: v.status })),
    },
    channels: { connected: ch.summary.connected, active: ch.summary.active, attention: ch.summary.attention, items: ch.channels.map((c) => ({ channel: c.channel, listingStatus: c.listingStatus, lastSyncAt: c.lastSyncAt, action: { key: c.listingStatus === 'attention' ? 'review' : 'view_listing', href: `/products/${productId}?tab=listings` } })) },
    content,
    attentionBanner,
    statusPanel: {
      catalog: healthState,
      inventory: invStatus,
      listings: { state: (ch.summary.connected === 0 ? 'not_published' : 'published') as 'not_published' | 'published', active: ch.summary.active, attention: ch.summary.attention },
      content: { pct: pf.pct, state: content.marketplaceContent },
      syncLastAt: ch.lastSyncAt,
    },
    media: { total: media.length, items: media.slice(0, 6) },
    recentActivity: recent.items,
    actions,
  };
}

function productContentSummary(ready: Awaited<ReturnType<typeof evaluateReadiness>>, ls: ProductListingRow[], pct: number) {
  const ok = (code: string) => ready.checks.filter((c) => c.code === code).every((c) => c.ok);
  const attrOk = ['brand', 'category', 'hsn', 'gst', 'origin'].every(ok) && ready.checks.filter((c) => c.code.startsWith('attribute:')).every((c) => c.ok);
  const connected = ls.filter((l) => isConnected(listingStatusOf({ status: l.status, error: l.error })));
  const needsReview = connected.some((l) => listingStatusOf({ status: l.status, error: l.error }) === 'attention' || (l.issues ?? []).some((i) => i.severity !== 'warning'));
  const marketplaceContent: 'ok' | 'needs_review' | 'not_published' = connected.length === 0 ? 'not_published' : needsReview ? 'needs_review' : 'ok';
  return {
    pct, marketplaceContent,
    fields: [
      { key: 'title', state: ok('title') ? 'complete' : 'needs_review' },
      { key: 'description', state: ok('description') ? 'complete' : 'missing' },
      { key: 'images', state: ok('image') ? 'complete' : 'missing' },
      { key: 'attributes', state: attrOk ? 'complete' : 'missing' },
      { key: 'marketplace_content', state: marketplaceContent },
    ] as Array<{ key: string; state: string }>,
  };
}

// ------------------------------------------------------------------------------------------------
// variants workspace
// ------------------------------------------------------------------------------------------------
export interface VariantGridFilters {
  q?: string; options?: Record<string, string[]>; channel?: string[]; inventory?: string[]; lifecycle?: string[];
}

function variantBase(vendorId: string, productId: string, thr: number): SQL {
  return sql`
  vg as (
    select pv.id, pv.product_id, pv.sku, pv.barcode, pv.option_values, pv.status, pv.lead_time_days, pv.currency, pv.selling_price_minor, pv.mrp_minor, pv.version, pv.created_at, pv.updated_at,
           coalesce(s.avail, 0)::int as avail, coalesce(s.rl, ${thr})::int as thr,
           case when pv.status = 'inactive' or p.status = 'archived' then 'archived' when p.status = 'draft' then 'draft' else 'active' end as lifecycle,
           case when coalesce(s.avail, 0) <= 0 then 'out' when coalesce(s.avail, 0) <= coalesce(s.rl, ${thr}) then 'low' else 'healthy' end as stock_status
    from product_variants pv
    join products p on p.id = pv.product_id and p.vendor_id = pv.vendor_id
    left join (select variant_id, sum(quantity_on_hand - quantity_reserved)::int as avail, max(reorder_level) as rl from inventory where vendor_id = ${vendorId} group by variant_id) s on s.variant_id = pv.id
    where pv.vendor_id = ${vendorId} and pv.product_id = ${productId}::uuid and pv.deleted_at is null)`;
}

function variantWhere(vendorId: string, f: VariantGridFilters): SQL {
  const c: SQL[] = [];
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    c.push(sql`(vg.sku ilike ${like} or vg.barcode ilike ${like} or vg.option_values::text ilike ${like})`);
  }
  for (const [name, vals] of Object.entries(f.options ?? {})) {
    if (vals.length) c.push(sql`lower(vg.option_values ->> ${name}::text) in (${sql.join(vals.map((v) => sql`${v.toLowerCase()}`), sql`, `)})`);
  }
  if (f.channel?.length) {
    c.push(sql`exists (select 1 from marketplace_listings ml join marketplace_accounts ma on ma.id = ml.marketplace_account_id and ma.vendor_id = ml.vendor_id where ml.vendor_id = ${vendorId} and ml.variant_id = vg.id and ma.marketplace in (${csvList(f.channel)}))`);
  }
  if (f.inventory?.length) c.push(sql`vg.stock_status in (${csvList(f.inventory)})`);
  if (f.lifecycle?.length) c.push(sql`vg.lifecycle in (${csvList(f.lifecycle)})`);
  return c.length ? sql`where ${sql.join(c, sql` and `)}` : sql``;
}

function variantOrder(sort?: SortSpec): SQL {
  const s = sort?.[0];
  const dir = sql.raw(s?.direction === 'desc' ? 'desc' : 'asc');
  switch (s?.field) {
    case 'inventory': return sql`order by vg.avail ${dir}, vg.sku`;
    case 'updatedAt': return sql`order by vg.updated_at ${dir}, vg.id`;
    case 'createdAt': return sql`order by vg.created_at ${dir}, vg.id`;
    default: return sql`order by lower(vg.sku) ${dir}, vg.id`;
  }
}

export async function variantGrid(tx: Tx, vendorId: string, productId: string, f: VariantGridFilters, sort: SortSpec | undefined, win: { limit: number; offset: number }, names: ChannelNameFn) {
  await svc.getProductRow(tx, vendorId, productId);
  const thr = await lowStockThreshold(tx, vendorId);
  const base = variantBase(vendorId, productId, thr);
  const where = variantWhere(vendorId, f);
  const list = await rows<Record<string, any>>(tx, sql`with ${base} select vg.* from vg ${where} ${variantOrder(sort)} limit ${win.limit} offset ${win.offset}`);
  const [c] = await rows<{ n: number }>(tx, sql`with ${base} select count(*)::int as n from vg ${where}`);
  const ids = list.map((r) => r.id as string);
  const chans = new Map<string, Map<string, ChannelStatus[]>>();
  const thumbs = new Map<string, string>();
  if (ids.length) {
    const ls = await rows<{ variant_id: string; marketplace: string; status: string; error: string | null }>(tx, sql`
      select ml.variant_id, ma.marketplace, ml.status, ml.last_error_code as error from marketplace_listings ml
      join marketplace_accounts ma on ma.id = ml.marketplace_account_id and ma.vendor_id = ml.vendor_id
      where ml.vendor_id = ${vendorId} and ml.variant_id in (${uuidList(ids)})`);
    for (const l of ls) {
      const m = chans.get(l.variant_id) ?? new Map<string, ChannelStatus[]>();
      m.set(l.marketplace, [...(m.get(l.marketplace) ?? []), listingStatusOf({ status: l.status, error: l.error })]);
      chans.set(l.variant_id, m);
    }
    const docs = await rows<{ variant_id: string | null; id: string }>(tx, sql`
      select distinct on (variant_id) variant_id, id from product_documents
      where vendor_id = ${vendorId} and product_id = ${productId}::uuid and kind = 'image' and status in ('uploaded', 'processed') and deleted_at is null and variant_id is not null
      order by variant_id, is_primary desc, sort_order, created_at`);
    for (const d of docs) if (d.variant_id) thumbs.set(d.variant_id, thumbHref(d.id));
  }
  const fallback = (await thumbsFor(tx, vendorId, [productId])).get(productId) ?? null;
  return {
    total: Number(c?.n ?? 0),
    items: list.map((r) => {
      const optionValues = (r.option_values ?? {}) as Record<string, string>;
      return {
        id: r.id as string, productId: r.product_id as string, sku: r.sku as string, barcode: (r.barcode ?? null) as string | null, name: variantName({ sku: r.sku, optionValues }), optionValues,
        currency: String(r.currency).trim(), mrpMinor: r.mrp_minor === null ? null : Number(r.mrp_minor), sellingPriceMinor: r.selling_price_minor === null ? null : Number(r.selling_price_minor),
        status: r.status as 'active' | 'inactive', lifecycle: r.lifecycle as 'active' | 'draft' | 'archived',
        stock: { available: Number(r.avail), threshold: Number(r.thr), status: r.stock_status as InventoryStatus },
        channels: [...(chans.get(r.id) ?? new Map<string, ChannelStatus[]>()).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, ss]) => ({ code, name: names(code), listingStatus: rollupStatus(ss) })),
        leadTimeDays: (r.lead_time_days ?? null) as number | null, thumbnailUrl: thumbs.get(r.id) ?? fallback, version: Number(r.version), createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
      };
    }),
  };
}

export async function variantGridCounts(tx: Tx, vendorId: string, productId: string) {
  await svc.getProductRow(tx, vendorId, productId);
  const thr = await lowStockThreshold(tx, vendorId);
  const [r] = await rows<Record<string, number>>(tx, sql`
    with ${variantBase(vendorId, productId, thr)}
    select count(*)::int as all_n,
      count(*) filter (where lifecycle = 'active')::int as active_n,
      count(*) filter (where lifecycle = 'active' and stock_status = 'low')::int as low_n,
      count(*) filter (where lifecycle = 'active' and stock_status = 'out')::int as out_n,
      count(*) filter (where lifecycle = 'draft')::int as draft_n,
      count(*) filter (where lifecycle = 'archived')::int as archived_n
    from vg`);
  const n = (k: string) => Number(r?.[k] ?? 0);
  return { all: n('all_n'), active: n('active_n'), lowStock: n('low_n'), outOfStock: n('out_n'), draft: n('draft_n'), archived: n('archived_n') };
}
