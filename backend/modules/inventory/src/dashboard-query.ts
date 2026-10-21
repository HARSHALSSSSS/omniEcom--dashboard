import { and, desc, eq, escapeLike, inArray, lt, schema, sql, type SQL, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { ledgerDrift } from './service';

/**
 * Read side of the Inventory Control Room. One SQL building block (`lxCte`) produces a row per tracked variant with its
 * stock buckets, 14-day velocity, coverage, lead time, health and signal flags; the overview, the ledger table, the
 * context panel, bulk selection and the CSV export are all queries over it, so every screen shows the same numbers.
 */
const M = schema.inventoryMovements;
const V = schema.productVariants;
const P = schema.products;
const W = schema.warehouses;

type Row = Record<string, unknown>;
const rows = async (tx: Tx, q: SQL): Promise<Row[]> => (await tx.execute<Row>(q)).rows;
const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const nn = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const round = (v: number, d: number): number => { const f = 10 ** d; return Math.round(v * f) / f; };
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string | Date).toISOString());
const uuidList = (ids: string[]): SQL => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const WINDOW_DAYS = 14;
const WD = sql.raw(String(WINDOW_DAYS));
export const DEFAULT_LEAD_DAYS = 7;
export const HEALTHS = ['stockout', 'critical', 'attention', 'healthy'] as const;
export type Health = (typeof HEALTHS)[number];
/** same default as the business setting (modules/vendors settings-defaults) */
const DEFAULT_LOW_STOCK_THRESHOLD = 5;
export const SIGNALS = ['low_stock', 'stockout_risk', 'inventory_mismatch', 'slow_moving', 'high_velocity', 'aging_inventory', 'warehouse_imbalance'] as const;
export type Signal = (typeof SIGNALS)[number];
/**
 * The four stock tabs of the screen. out_of_stock = nothing available; low_stock = at/below the reorder level or cover shorter than
 * the lead time; excess = cover above EXCESS_COVER_DAYS (or unsold and untouched for the aging window); everything else is healthy.
 */
export const STOCK_STATUSES = ['healthy', 'low_stock', 'out_of_stock', 'excess'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];
export const EXCESS_COVER_DAYS = 90;
const EXC = sql.raw(String(EXCESS_COVER_DAYS));
export type ChannelSyncState = 'healthy' | 'attention' | 'failed' | 'not_listed';

export const MARKETPLACE_NAMES: Record<string, string> = { amazon_in: 'Amazon', flipkart: 'Flipkart', myntra: 'Myntra', snapdeal: 'Snapdeal', shopify: 'Shopify', meesho: 'Meesho', mock: 'Sandbox marketplace' };
export const marketplaceName = (code: string): string => MARKETPLACE_NAMES[code] ?? code;
export const channelRef = (code: string, accountId: string | null) => ({ code, name: marketplaceName(code), accountId, availability: 'live' as const });

// ------------------------------------------------------------------------------------------------
// pure rules (unit tested)
// ------------------------------------------------------------------------------------------------
export interface HealthInput { available: number; unitsPerDay: number; leadTimeDays: number }
/** stockout = nothing available; critical = cover < half the lead time; attention = cover < lead time; no sales = no cover = healthy */
export function classifyHealth(i: HealthInput): { health: Health; coverDays: number | null } {
  const cover = i.unitsPerDay > 0 ? i.available / i.unitsPerDay : null;
  if (i.available <= 0) return { health: 'stockout', coverDays: cover === null ? null : 0 };
  if (cover !== null && cover < i.leadTimeDays / 2) return { health: 'critical', coverDays: cover };
  if (cover !== null && cover < i.leadTimeDays) return { health: 'attention', coverDays: cover };
  return { health: 'healthy', coverDays: cover };
}

export function healthText(i: { health: Health; coverDays: number | null; leadTimeDays: number; unitsPerDay: number }): string {
  if (i.health === 'stockout') return 'No stock is available to sell.';
  if (i.coverDays === null) return `No sales in the last ${WINDOW_DAYS} days, so coverage cannot be estimated.`;
  const cover = round(i.coverDays, 1);
  if (i.health === 'healthy') return `Estimated coverage is ${cover} days, above the ${i.leadTimeDays}-day lead time.`;
  return `Estimated coverage is ${cover} days while lead time is ${i.leadTimeDays} days.`;
}

export const toneOfHealth = (h: Health): 'good' | 'warn' | 'bad' => (h === 'healthy' ? 'good' : h === 'attention' ? 'warn' : 'bad');

export function scaleMaxDays(items: Array<{ coverDays: number | null; leadTimeDays: number }>): number {
  const maxLead = Math.max(0, ...items.map((i) => i.leadTimeDays));
  const maxCover = Math.max(0, ...items.map((i) => i.coverDays ?? 0));
  return Math.max(5, Math.ceil(Math.max(maxLead * 2, maxCover) / 5) * 5);
}

export interface WarehouseShare { warehouseId: string; name: string; units: number; sharePct: number; demandSharePct: number | null }
/** a warehouse is imbalanced when its share of stock deviates from its share of recent demand by more than `thresholdPts` */
export function imbalanced(shares: WarehouseShare[], thresholdPts: number): WarehouseShare[] {
  return shares.filter((s) => s.demandSharePct !== null && Math.abs(s.sharePct - s.demandSharePct) > thresholdPts);
}

// ------------------------------------------------------------------------------------------------
// business context
// ------------------------------------------------------------------------------------------------
/** `lowStockThreshold`: the business's own low-stock level (settings), used when a variant has no reorder level of its own */
export interface VendorCtx { tz: string; mode: 'simple' | 'warehouse'; defaultLeadDays: number; lowStockThreshold: number }
export async function vendorContext(tx: Tx, vendorId: string): Promise<VendorCtx> {
  const [v] = await tx.select({ tz: schema.vendors.timezone, settings: schema.vendors.settings }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const settings = (v?.settings ?? {}) as { inventory?: { mode?: 'simple' | 'warehouse'; defaultLeadTimeDays?: number }; lowStockThreshold?: number };
  const inv = settings.inventory ?? {};
  return { tz: v?.tz ?? 'Asia/Kolkata', mode: inv.mode === 'simple' ? 'simple' : 'warehouse', defaultLeadDays: inv.defaultLeadTimeDays ?? DEFAULT_LEAD_DAYS, lowStockThreshold: typeof settings.lowStockThreshold === 'number' ? settings.lowStockThreshold : DEFAULT_LOW_STOCK_THRESHOLD };
}

export const todayIn = (tz: string): string => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// ------------------------------------------------------------------------------------------------
// the SQL building block
// ------------------------------------------------------------------------------------------------
export interface LxOpts { vendorId: string; defaultLeadDays: number; lowStockThreshold?: number; agingDays: number; warehouseId?: string; variantIds?: string[]; driftIds?: string[] }

export function lxCte(o: LxOpts): SQL {
  const wh = o.warehouseId ? sql`and i.warehouse_id = ${o.warehouseId}::uuid` : sql``;
  const ids = o.variantIds ? (o.variantIds.length ? sql`and i.variant_id in (${uuidList(o.variantIds)})` : sql`and false`) : sql``;
  const drift = o.driftIds?.length ? sql`array[${uuidList(o.driftIds)}]::uuid[]` : sql`array[]::uuid[]`;
  const vid = o.vendorId;
  const thr = o.lowStockThreshold ?? null;
  return sql`
  with st as (
    select i.variant_id,
      sum(i.quantity_on_hand)::int on_hand, sum(i.quantity_reserved)::int reserved, sum(i.quantity_incoming)::int incoming,
      sum(i.quantity_returned)::int returned, sum(i.quantity_damaged)::int damaged, sum(i.quantity_quarantined)::int quarantined,
      max(i.reorder_level)::int reorder,
      (array_agg(w.id order by (i.quantity_on_hand - i.quantity_reserved) desc, w.code))[1] top_wh
    from inventory i join warehouses w on w.id = i.warehouse_id and w.vendor_id = i.vendor_id
    where i.vendor_id = ${vid}::uuid and w.status = 'active' and w.deleted_at is null ${wh} ${ids}
    group by i.variant_id),
  sold as (
    select oi.variant_id, sum(oi.quantity)::int units
    from order_items oi join orders o on o.id = oi.order_id and o.vendor_id = oi.vendor_id
    where oi.vendor_id = ${vid}::uuid and oi.variant_id is not null and o.status <> 'cancelled' and o.placed_at >= now() - make_interval(days => ${WD})
    group by 1),
  pct as (select coalesce(percentile_cont(0.9) within group (order by (units / ${WD}.0)::float8), 0)::float8 p90 from sold),
  ch as (
    select l.variant_id, count(*)::int listings, bool_or(coalesce(lu.status, '') = 'failed') failed, bool_or(l.quantity_dirty) dirty,
      bool_or(l.sellable_quantity is not null and l.pushed_quantity is distinct from l.sellable_quantity) mism
    from marketplace_listings l
    left join lateral (select u.status from channel_stock_updates u where u.vendor_id = l.vendor_id and u.listing_id = l.id order by u.requested_at desc limit 1) lu on true
    where l.vendor_id = ${vid}::uuid and l.status = 'active' group by 1),
  lh as (
    select st.variant_id, st.on_hand, st.reserved, st.incoming, st.returned, st.damaged, st.quarantined, st.reorder, st.top_wh,
      (st.on_hand - st.reserved) available,
      v.sku, v.barcode, v.product_id, p.title, p.category_id, v.cost_price_minor cost, (v.lead_time_days is not null) lead_is_variant, coalesce(v.lead_time_days, ${o.defaultLeadDays}::int)::int lead,
      coalesce(sold.units, 0) sold_units, (coalesce(sold.units, 0) / ${WD}.0)::float8 per_day,
      lm.last_at, lm.last_type,
      coalesce(ch.listings, 0) listings, coalesce(ch.failed, false) ch_failed, coalesce(ch.dirty, false) ch_dirty, coalesce(ch.mism, false) ch_mism
    from st
    join product_variants v on v.id = st.variant_id and v.vendor_id = ${vid}::uuid and v.deleted_at is null
    join products p on p.id = v.product_id and p.vendor_id = v.vendor_id and p.deleted_at is null
    left join sold on sold.variant_id = st.variant_id
    left join ch on ch.variant_id = st.variant_id
    left join lateral (select m.created_at last_at, m.type last_type from inventory_movements m where m.vendor_id = ${vid}::uuid and m.variant_id = st.variant_id order by m.id desc limit 1) lm on true),
  lx as (
    select lh.*,
      case when per_day > 0 then available / per_day end cover,
      case when available <= 0 then 'stockout' when per_day > 0 and available / per_day < lead / 2.0 then 'critical' when per_day > 0 and available / per_day < lead then 'attention' else 'healthy' end health,
      ((reorder is not null and available <= reorder) or (available > 0 and ${thr}::int is not null and available <= ${thr}::int)) is_low,
      (per_day > 0 and available / per_day < lead) is_risk,
      (available > 0 and per_day < 0.1) is_slow,
      (per_day > 0 and per_day >= (select p90 from pct)) is_fast,
      (available > 0 and (last_at is null or last_at < now() - make_interval(days => ${o.agingDays}::int))) is_aging,
      (ch_failed or ch_mism or variant_id = any(${drift})) is_mismatch,
      case when listings = 0 then 'not_listed' when ch_failed then 'failed' when ch_dirty or ch_mism then 'attention' else 'healthy' end channel_sync,
      (available > 0 and ((per_day > 0 and available / per_day > ${EXC}) or (per_day = 0 and (last_at is null or last_at < now() - make_interval(days => ${o.agingDays}::int))))) is_excess,
      case when available <= 0 then 'out_of_stock'
        when (coalesce(reorder, ${thr}::int) is not null and available <= coalesce(reorder, ${thr}::int)) or (per_day > 0 and available / per_day < lead) then 'low_stock'
        when (per_day > 0 and available / per_day > ${EXC}) or (per_day = 0 and (last_at is null or last_at < now() - make_interval(days => ${o.agingDays}::int))) then 'excess'
        else 'healthy' end stock_status
    from lh)`;
}

// ------------------------------------------------------------------------------------------------
// filters
// ------------------------------------------------------------------------------------------------
export interface LedgerFilters {
  q?: string; warehouse?: string; channel?: string; health?: Health | 'stockout_risk'; stockMin?: number; stockMax?: number;
  movement?: 'received' | 'adjusted' | 'reserved' | 'returned' | 'synced'; signal?: Signal; group?: string; stockStatus?: StockStatus;
}
const MOVEMENT_TYPES: Record<string, string[]> = {
  received: ['receive', 'incoming_receive'],
  adjusted: ['adjust', 'count', 'damage', 'undamage', 'quarantine', 'quarantine_release'],
  reserved: ['reserve', 'release', 'commit'],
  returned: ['return_in', 'return_restock'],
};
const SIGNAL_COLUMN: Partial<Record<Signal, string>> = { low_stock: 'is_low', stockout_risk: 'is_risk', inventory_mismatch: 'is_mismatch', slow_moving: 'is_slow', high_velocity: 'is_fast', aging_inventory: 'is_aging' };

function filterSql(vendorId: string, f: LedgerFilters, imbalancedWarehouses: string[]): SQL {
  const c: SQL[] = [];
  if (f.q) { const like = `%${escapeLike(f.q)}%`; c.push(sql`(sku ilike ${like} or title ilike ${like} or coalesce(barcode, '') ilike ${like})`); }
  if (f.channel) {
    c.push(sql`exists (select 1 from marketplace_listings l join marketplace_accounts a on a.id = l.marketplace_account_id and a.vendor_id = l.vendor_id
      where l.vendor_id = ${vendorId}::uuid and l.variant_id = lx.variant_id and l.status = 'active' and ${UUID.test(f.channel) ? sql`a.id = ${f.channel}::uuid` : sql`a.marketplace = ${f.channel}`})`);
  }
  if (f.health === 'stockout_risk') c.push(sql`health in ('attention', 'critical')`);
  else if (f.health) c.push(sql`health = ${f.health}`);
  if (f.stockStatus) c.push(sql`stock_status = ${f.stockStatus}`);
  if (f.stockMin !== undefined) c.push(sql`available >= ${f.stockMin}`);
  if (f.stockMax !== undefined) c.push(sql`available <= ${f.stockMax}`);
  if (f.movement === 'synced') {
    c.push(sql`exists (select 1 from channel_stock_updates u join marketplace_listings l on l.id = u.listing_id and l.vendor_id = u.vendor_id where u.vendor_id = ${vendorId}::uuid and l.variant_id = lx.variant_id and u.status = 'succeeded')`);
  } else if (f.movement) c.push(sql`last_type in (${sql.join((MOVEMENT_TYPES[f.movement] ?? []).map((t) => sql`${t}`), sql`, `)})`);
  if (f.signal === 'warehouse_imbalance') {
    c.push(imbalancedWarehouses.length
      ? sql`exists (select 1 from inventory i2 where i2.vendor_id = ${vendorId}::uuid and i2.variant_id = lx.variant_id and i2.warehouse_id in (${uuidList(imbalancedWarehouses)}) and i2.quantity_on_hand > 0)`
      : sql`false`);
  } else if (f.signal) c.push(sql.raw(SIGNAL_COLUMN[f.signal]!));
  if (f.group) c.push(sql`exists (select 1 from inventory_group_items gi where gi.vendor_id = ${vendorId}::uuid and gi.group_id = ${f.group}::uuid and gi.variant_id = lx.variant_id)`);
  return c.length ? sql`where ${sql.join(c, sql` and `)}` : sql``;
}

export type LedgerSort = 'health' | 'sku' | '-sku' | 'available' | '-available' | 'coverDays' | '-coverDays' | 'lastMovement' | '-lastMovement';
const ORDER: Record<LedgerSort, string> = {
  health: `case health when 'stockout' then 0 when 'critical' then 1 when 'attention' then 2 else 3 end, cover asc nulls last, sku asc`,
  sku: 'sku asc', '-sku': 'sku desc', available: 'available asc', '-available': 'available desc', coverDays: 'cover asc nulls last', '-coverDays': 'cover desc nulls last',
  lastMovement: 'last_at asc nulls first', '-lastMovement': 'last_at desc nulls last',
};

export interface Thresholds { agingDays: number; imbalancePct: number }
export const DEFAULT_THRESHOLDS: Thresholds = { agingDays: 90, imbalancePct: 20 };

/** inputs the lx query needs beyond the filters (drift ids only when the mismatch signal is asked for) */
async function lxInputs(tx: Tx, vendorId: string, vctx: VendorCtx, f: LedgerFilters, th: Thresholds, warehouseId: string | undefined, variantIds?: string[]) {
  const driftIds = f.signal === 'inventory_mismatch' ? [...new Set((await ledgerDrift(tx, vendorId)).map((d) => d.variantId))] : [];
  const imb = f.signal === 'warehouse_imbalance' ? imbalanced(await warehouseShares(tx, vendorId, undefined), th.imbalancePct).map((s) => s.warehouseId) : [];
  const opts: LxOpts = { vendorId, defaultLeadDays: vctx.defaultLeadDays, lowStockThreshold: vctx.lowStockThreshold, agingDays: th.agingDays, warehouseId, variantIds, driftIds };
  return { cte: lxCte(opts), where: filterSql(vendorId, f, imb) };
}

// ------------------------------------------------------------------------------------------------
// ledger rows
// ------------------------------------------------------------------------------------------------
export interface LedgerItem {
  variantId: string; productId: string; thumbnailUrl: string | null; title: string; sku: string; barcode: string | null;
  available: number; reserved: number; incoming: number; returned: number; damaged: number; quarantined: number; onHand: number;
  unitsPerDay: number; coverDays: number | null; leadTimeDays: number;
  warehouse: { id: string; name: string } | null; channelSync: ChannelSyncState; health: Health; stockStatus: StockStatus; lastMovementAt: string | null; borderTone: 'good' | 'warn' | 'bad';
}

async function thumbnails(tx: Tx, vendorId: string, productIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!productIds.length) return out;
  const rs = await rows(tx, sql`select distinct on (product_id) product_id, id from product_documents
    where vendor_id = ${vendorId}::uuid and product_id in (${uuidList([...new Set(productIds)])}) and kind = 'image' and deleted_at is null and status in ('uploaded', 'processed')
    order by product_id, is_primary desc, sort_order, created_at`);
  for (const r of rs) out.set(String(r.product_id), `/api/v1/documents/${String(r.id)}/content`);
  return out;
}

async function warehouseNames(tx: Tx, vendorId: string): Promise<Map<string, string>> {
  const ws = await tx.select({ id: W.id, name: W.name }).from(W).where(eq(W.vendorId, vendorId));
  return new Map(ws.map((w) => [w.id, w.name]));
}

function toItem(r: Row, vctx: VendorCtx, names: Map<string, string>, thumbs: Map<string, string>): LedgerItem {
  const health = String(r.health) as Health;
  const whId = r.top_wh ? String(r.top_wh) : null;
  return {
    variantId: String(r.variant_id), productId: String(r.product_id), thumbnailUrl: thumbs.get(String(r.product_id)) ?? null, title: String(r.title), sku: String(r.sku), barcode: r.barcode ? String(r.barcode) : null,
    available: n(r.available), reserved: n(r.reserved), incoming: n(r.incoming), returned: n(r.returned), damaged: n(r.damaged), quarantined: n(r.quarantined), onHand: n(r.on_hand),
    unitsPerDay: round(n(r.per_day), 2), coverDays: nn(r.cover) === null ? null : round(n(r.cover), 1), leadTimeDays: n(r.lead),
    warehouse: vctx.mode === 'simple' || !whId ? null : { id: whId, name: names.get(whId) ?? '' },
    channelSync: String(r.channel_sync) as ChannelSyncState, health, stockStatus: String(r.stock_status) as StockStatus, lastMovementAt: iso(r.last_at), borderTone: toneOfHealth(health),
  };
}

export interface LedgerRow extends LedgerItem {
  category: { id: string; name: string } | null;
  /** stock per active warehouse; `safetyStock` is that location's reorder level (null = none set) */
  warehouses: Array<{ warehouseId: string; warehouseName: string; city: string | null; onHand: number; reserved: number; available: number; safetyStock: number | null }>;
}

/** category + per-warehouse breakdown for a page of ledger rows (two batched queries, never per row) */
async function enrichRows(tx: Tx, vendorId: string, rs: Row[], items: LedgerItem[], warehouseId?: string): Promise<LedgerRow[]> {
  if (!items.length) return [];
  const catIds = [...new Set(rs.map((r) => (r.category_id ? String(r.category_id) : null)).filter((x): x is string => !!x))];
  const cats = new Map<string, string>();
  if (catIds.length) for (const c of await tx.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).where(and(eq(schema.categories.vendorId, vendorId), inArray(schema.categories.id, catIds)))) cats.set(c.id, c.name);
  const stock = await rows(tx, sql`select i.variant_id, w.id wid, w.name, w.address->>'city' city, i.quantity_on_hand::int on_hand, i.quantity_reserved::int reserved, i.reorder_level
    from inventory i join warehouses w on w.id = i.warehouse_id and w.vendor_id = i.vendor_id
    where i.vendor_id = ${vendorId}::uuid and w.status = 'active' and w.deleted_at is null and i.variant_id in (${uuidList(items.map((i) => i.variantId))})
      ${warehouseId ? sql`and w.id = ${warehouseId}::uuid` : sql``} order by w.priority, w.code`);
  const byVariant = new Map<string, LedgerRow['warehouses']>();
  for (const s of stock) {
    const list = byVariant.get(String(s.variant_id)) ?? byVariant.set(String(s.variant_id), []).get(String(s.variant_id))!;
    list.push({ warehouseId: String(s.wid), warehouseName: String(s.name), city: s.city ? String(s.city) : null, onHand: n(s.on_hand), reserved: n(s.reserved), available: n(s.on_hand) - n(s.reserved), safetyStock: nn(s.reorder_level) });
  }
  const catOf = new Map(rs.map((r) => [String(r.variant_id), r.category_id ? String(r.category_id) : null]));
  return items.map((it) => {
    const cid = catOf.get(it.variantId) ?? null;
    return { ...it, category: cid && cats.has(cid) ? { id: cid, name: cats.get(cid)! } : null, warehouses: byVariant.get(it.variantId) ?? [] };
  });
}

export interface LedgerQuery { filters: LedgerFilters; sort?: LedgerSort; page: number; pageSize: number; thresholds?: Thresholds }

export async function ledgerPage(tx: Tx, vendorId: string, vctx: VendorCtx, q: LedgerQuery) {
  const th = q.thresholds ?? DEFAULT_THRESHOLDS;
  const { cte, where } = await lxInputs(tx, vendorId, vctx, q.filters, th, q.filters.warehouse);
  const total = n((await rows(tx, sql`${cte} select count(*)::int c from lx ${where}`))[0]?.c);
  const order = sql.raw(ORDER[q.sort ?? 'health']);
  const rs = await rows(tx, sql`${cte} select * from lx ${where} order by ${order}, variant_id limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`);
  const [thumbs, names] = await Promise.all([thumbnails(tx, vendorId, rs.map((r) => String(r.product_id))), warehouseNames(tx, vendorId)]);
  return { items: await enrichRows(tx, vendorId, rs, rs.map((r) => toItem(r, vctx, names, thumbs)), q.filters.warehouse), total };
}

export async function ledgerCount(tx: Tx, vendorId: string, vctx: VendorCtx, filters: LedgerFilters, th: Thresholds = DEFAULT_THRESHOLDS): Promise<number> {
  const { cte, where } = await lxInputs(tx, vendorId, vctx, filters, th, filters.warehouse);
  return n((await rows(tx, sql`${cte} select count(*)::int c from lx ${where}`))[0]?.c);
}

/** every row matching the filters (bulk "all matching" selection and CSV export), at most `max`, with the true total */
export async function ledgerAll(tx: Tx, vendorId: string, vctx: VendorCtx, filters: LedgerFilters, max: number, th: Thresholds = DEFAULT_THRESHOLDS) {
  const { cte, where } = await lxInputs(tx, vendorId, vctx, filters, th, filters.warehouse);
  const rs = await rows(tx, sql`${cte} select * from lx ${where} order by sku asc, variant_id limit ${max + 1}`);
  if (rs.length > max) return { tooMany: true as const, items: [] as LedgerItem[] };
  const names = await warehouseNames(tx, vendorId);
  return { tooMany: false as const, items: rs.map((r) => toItem(r, vctx, names, new Map())) };
}

export async function ledgerForVariants(tx: Tx, vendorId: string, vctx: VendorCtx, variantIds: string[], th: Thresholds = DEFAULT_THRESHOLDS) {
  const cte = lxCte({ vendorId, defaultLeadDays: vctx.defaultLeadDays, lowStockThreshold: vctx.lowStockThreshold, agingDays: th.agingDays, variantIds });
  const rs = await rows(tx, sql`${cte} select * from lx`);
  const names = await warehouseNames(tx, vendorId);
  return new Map(rs.map((r) => [String(r.variant_id), toItem(r, vctx, names, new Map())]));
}

// ------------------------------------------------------------------------------------------------
// warehouse distribution
// ------------------------------------------------------------------------------------------------
export async function warehouseShares(tx: Tx, vendorId: string, warehouseId?: string): Promise<WarehouseShare[]> {
  const stock = await rows(tx, sql`select w.id, w.name, coalesce(sum(i.quantity_on_hand - i.quantity_reserved), 0)::int units
    from warehouses w
    left join inventory i on i.warehouse_id = w.id and i.vendor_id = w.vendor_id
      and exists (select 1 from product_variants v where v.id = i.variant_id and v.vendor_id = i.vendor_id and v.deleted_at is null)
    where w.vendor_id = ${vendorId}::uuid and w.status = 'active' and w.deleted_at is null ${warehouseId ? sql`and w.id = ${warehouseId}::uuid` : sql``}
    group by w.id, w.name order by w.priority, w.code`);
  const demand = await rows(tx, sql`select warehouse_id, sum(quantity)::int q from inventory_reservations
    where vendor_id = ${vendorId}::uuid and status in ('active', 'committed') and created_at >= now() - make_interval(days => ${WD}) group by 1`);
  const dm = new Map(demand.map((d) => [String(d.warehouse_id), n(d.q)]));
  const totalStock = stock.reduce((s, r) => s + Math.max(0, n(r.units)), 0);
  const totalDemand = stock.reduce((s, r) => s + (dm.get(String(r.id)) ?? 0), 0);
  return stock.map((r) => ({
    warehouseId: String(r.id), name: String(r.name), units: n(r.units),
    sharePct: totalStock > 0 ? round((Math.max(0, n(r.units)) / totalStock) * 100, 1) : 0,
    demandSharePct: totalDemand > 0 ? round(((dm.get(String(r.id)) ?? 0) / totalDemand) * 100, 1) : null,
  }));
}

// ------------------------------------------------------------------------------------------------
// recent movements (human text built from type + reference)
// ------------------------------------------------------------------------------------------------
const signed = (v: number): string => (v > 0 ? `+${v}` : String(v));
const units = (v: number): string => `${v} unit${v === 1 ? '' : 's'}`;
const returnedUnits = (v: number): string => `${v} returned unit${v === 1 ? '' : 's'}`;

export interface MovementFeedItem { at: string; type: string; text: string; detail: string | null; ref: { type: string; id: string } | null }
type MoveRow = typeof M.$inferSelect;

export function describeMovement(m: MoveRow, c: { title: string; warehouse: string; marketplace: string | null }): MovementFeedItem {
  const at = m.createdAt.toISOString();
  const availAfter = m.onHandAfter - m.reservedAfter;
  const availBefore = m.onHandAfter - m.deltaOnHand - (m.reservedAfter - m.deltaReserved);
  const orderRef = m.referenceType === 'order' && m.referenceId ? { type: 'order', id: m.referenceId } : null;
  const mk = c.marketplace ?? 'Marketplace';
  const ref = orderRef ?? (m.referenceType && m.referenceId ? { type: m.referenceType, id: m.referenceId } : { type: 'variant', id: m.variantId });
  const mk_ = (type: string, text: string, detail: string | null = null): MovementFeedItem => ({ at, type, text, detail, ref });
  switch (m.type) {
    case 'reserve': return mk_('order_reserved', orderRef ? `${mk} order reduced master inventory` : 'Stock reserved', `${availBefore} -> ${availAfter}`);
    case 'release': return mk_('order_released', orderRef ? `${mk} order released reserved stock` : 'Reservation released', `${availBefore} -> ${availAfter}`);
    case 'commit': return mk_('order_dispatched', orderRef ? `${mk} order dispatched` : 'Stock dispatched', `${units(-m.deltaOnHand)} left ${c.warehouse}`);
    case 'receive':
    case 'incoming_receive': return mk_('received', `${units(m.deltaOnHand)} received into ${c.warehouse}`, c.title);
    case 'incoming_add': return mk_('incoming', m.deltaIncoming >= 0 ? `${units(m.deltaIncoming)} on the way to ${c.warehouse}` : 'Incoming stock updated', c.title);
    case 'adjust':
    case 'count':
      if (m.deltaOnHand !== 0) return mk_('adjusted', 'Manual stock adjustment', `${c.title} ${signed(m.deltaOnHand)}`);
      if (m.deltaReturned < 0) return mk_('returned', `${units(-m.deltaReturned)} of returned stock written off`, c.title);
      if (m.deltaDamaged < 0) return mk_('adjusted', `${units(-m.deltaDamaged)} of damaged stock written off`, c.title);
      return mk_('adjusted', 'Manual stock adjustment', c.title);
    case 'return_in': return mk_('returned', m.deltaDamaged > 0 ? `${units(m.deltaDamaged)} returned and moved to Damaged stock` : `${returnedUnits(m.deltaReturned)} moved to Returned stock`, c.title);
    case 'return_restock':
      if (m.deltaOnHand > 0) return mk_('returned', `${returnedUnits(m.deltaOnHand)} restocked`, c.title);
      return mk_('returned', `${returnedUnits(-m.deltaReturned)} moved to Damaged stock`, c.title);
    case 'damage': return mk_('damaged', `${units(m.deltaDamaged)} marked damaged`, c.title);
    case 'undamage': return mk_('adjusted', `${units(m.deltaOnHand)} restored from damaged`, c.title);
    case 'quarantine': return mk_('quarantined', `${units(m.deltaQuarantined)} moved to Quarantine`, m.reason ?? c.title);
    case 'quarantine_release': return mk_('quarantine_released', `${units(-m.deltaQuarantined)} released from Quarantine`, m.reason ?? c.title);
    case 'transfer_out': return mk_('transferred', `${units(-m.deltaOnHand)} transferred out of ${c.warehouse}`, c.title);
    case 'transfer_in': return mk_('transferred', `${units(m.deltaOnHand)} transferred into ${c.warehouse}`, c.title);
    default: return mk_('adjusted', 'Stock movement', c.title);
  }
}

export async function recentMovements(tx: Tx, vendorId: string, o: { limit: number; variantId?: string; warehouseId?: string; until?: Date; withSync?: boolean }): Promise<MovementFeedItem[]> {
  const ms = await tx
    .select({ m: M, title: P.title, wh: W.name })
    .from(M)
    .innerJoin(V, and(eq(V.id, M.variantId), eq(V.vendorId, M.vendorId)))
    .innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId)))
    .innerJoin(W, and(eq(W.id, M.warehouseId), eq(W.vendorId, M.vendorId)))
    .where(and(eq(M.vendorId, vendorId), o.variantId ? eq(M.variantId, o.variantId) : undefined, o.warehouseId ? eq(M.warehouseId, o.warehouseId) : undefined, o.until ? lt(M.createdAt, o.until) : undefined))
    .orderBy(desc(M.id))
    .limit(o.limit);
  const orderIds = [...new Set(ms.filter((r) => r.m.referenceType === 'order' && r.m.referenceId && UUID.test(r.m.referenceId)).map((r) => r.m.referenceId!))];
  const mk = new Map<string, string>();
  if (orderIds.length) for (const r of await tx.select({ id: schema.orders.id, marketplace: schema.orders.marketplace }).from(schema.orders).where(and(eq(schema.orders.vendorId, vendorId), inArray(schema.orders.id, orderIds)))) mk.set(r.id, marketplaceName(r.marketplace));
  const feed = ms.map((r) => describeMovement(r.m, { title: r.title, warehouse: r.wh, marketplace: r.m.referenceId ? mk.get(r.m.referenceId) ?? null : null }));
  if (o.withSync) {
    const jobs = await tx
      .select({ j: schema.syncJobs, mp: schema.marketplaceAccounts.marketplace })
      .from(schema.syncJobs)
      .innerJoin(schema.marketplaceAccounts, and(eq(schema.marketplaceAccounts.id, schema.syncJobs.marketplaceAccountId), eq(schema.marketplaceAccounts.vendorId, schema.syncJobs.vendorId)))
      .where(and(eq(schema.syncJobs.vendorId, vendorId), eq(schema.syncJobs.type, 'inventory'), inArray(schema.syncJobs.status, ['succeeded', 'partially_failed']), o.until ? lt(schema.syncJobs.finishedAt, o.until) : undefined))
      .orderBy(desc(schema.syncJobs.finishedAt))
      .limit(o.limit);
    for (const { j, mp } of jobs) {
      const pushed = j.stats.pushed ?? 0;
      const failed = j.stats.failed ?? 0;
      if (!j.finishedAt || pushed + failed === 0) continue;
      feed.push({ at: j.finishedAt.toISOString(), type: 'synced', text: `Inventory sync ${failed ? 'finished with errors' : 'completed'} for ${marketplaceName(mp)}`, detail: failed ? `${pushed} updated, ${failed} failed` : `${pushed} SKU${pushed === 1 ? '' : 's'} updated`, ref: { type: 'sync_job', id: j.id } });
    }
  }
  return feed.sort((a, b) => b.at.localeCompare(a.at)).slice(0, o.limit);
}

// ------------------------------------------------------------------------------------------------
// overview
// ------------------------------------------------------------------------------------------------
export interface OverviewQuery { asOf?: string; warehouseId?: string; limit: number; movementsLimit: number; thresholds: Thresholds }

const ACTIONS: Record<Health, { key: string; label: string }> = {
  stockout: { key: 'review_stock', label: 'Review stock' },
  critical: { key: 'review_replenishment', label: 'Review replenishment' },
  attention: { key: 'review_replenishment', label: 'Reorder attention required' },
  healthy: { key: 'view_product', label: 'View product' },
};
const SIGNAL_TONE: Record<Signal, 'bad' | 'warn' | 'info' | 'neutral'> = { low_stock: 'bad', stockout_risk: 'bad', inventory_mismatch: 'warn', slow_moving: 'neutral', high_velocity: 'info', aging_inventory: 'neutral', warehouse_imbalance: 'warn' };

export const advisoryText = (riskCount: number): string => (riskCount > 0 ? `${riskCount} product${riskCount === 1 ? '' : 's'} may stock out before ${riskCount === 1 ? 'its' : 'their'} expected replenishment lead time.` : 'No product is expected to stock out before its replenishment lead time.');

export async function overview(tx: Tx, vendorId: string, vctx: VendorCtx, q: OverviewQuery) {
  const today = todayIn(vctx.tz);
  const asOf = q.asOf ?? today;
  if (asOf > today) throw new AppError('BAD_REQUEST', 'asOf cannot be in the future', { details: { asOf, today } });
  const th = q.thresholds;
  const drift = await ledgerDrift(tx, vendorId);
  const driftIds = [...new Set(drift.filter((d) => !q.warehouseId || d.warehouseId === q.warehouseId).map((d) => d.variantId))];
  const cte = lxCte({ vendorId, defaultLeadDays: vctx.defaultLeadDays, agingDays: th.agingDays, warehouseId: q.warehouseId, driftIds });
  const wh = q.warehouseId ? sql`and m.warehouse_id = ${q.warehouseId}::uuid` : sql``;

  const [agg] = await rows(tx, sql`${cte} select
      coalesce(sum(available), 0)::int available, coalesce(sum(reserved), 0)::int reserved, coalesce(sum(incoming), 0)::int incoming, coalesce(sum(returned), 0)::int returned,
      coalesce(sum(damaged), 0)::int damaged, coalesce(sum(quarantined), 0)::int quarantined, count(*)::int variants,
      count(*) filter (where is_low)::int low, count(*) filter (where is_risk)::int risk, count(*) filter (where is_mismatch)::int mismatch,
      count(*) filter (where is_slow)::int slow, count(*) filter (where is_fast)::int fast, count(*) filter (where is_aging)::int aging
    from lx`);
  const horizonRows = await rows(tx, sql`${cte} select * from lx order by ${sql.raw(ORDER.health)}, available asc, variant_id limit ${q.limit}`);
  const adviceRows = await rows(tx, sql`${cte} select * from lx where is_risk and available > 0 order by cover asc, variant_id limit 3`);
  const [flow] = await rows(tx, sql`select coalesce(sum(m.delta_on_hand), 0)::int c from inventory_movements m join warehouses w on w.id = m.warehouse_id and w.vendor_id = m.vendor_id
      where m.vendor_id = ${vendorId}::uuid and w.status = 'active' and m.type in ('receive', 'incoming_receive') ${wh}
      and m.created_at >= (${asOf}::date::timestamp at time zone ${vctx.tz}::text) and m.created_at < ((${asOf}::date + 1)::timestamp at time zone ${vctx.tz}::text)`);
  const trendRows = await rows(tx, sql`${cte},
    hist as (
      select m.variant_id, (m.created_at at time zone ${vctx.tz}::text)::date as dy, sum(m.delta_on_hand - m.delta_reserved)::int delta
      from inventory_movements m where m.vendor_id = ${vendorId}::uuid and m.created_at >= ((${asOf}::date - 6)::timestamp at time zone ${vctx.tz}::text) ${wh} group by 1, 2),
    days as (select generate_series((${asOf}::date - 6)::timestamp, ${asOf}::date::timestamp, interval '1 day')::date d)
    select days.d::text as dstr,
      count(*) filter (where lx.reorder is not null and (lx.available - coalesce(h.aft, 0)) <= lx.reorder)::int low,
      count(*) filter (where lx.per_day > 0 and (lx.available - coalesce(h.aft, 0)) / lx.per_day < lx.lead)::int risk,
      count(*) filter (where (lx.available - coalesce(h.aft, 0)) > 0 and lx.per_day < 0.1)::int slow
    from days cross join lx
    left join lateral (select sum(hh.delta)::int aft from hist hh where hh.variant_id = lx.variant_id and hh.dy > days.d) h on true
    group by days.d order by days.d`);

  const names = await warehouseNames(tx, vendorId);
  const thumbs = await thumbnails(tx, vendorId, horizonRows.map((r) => String(r.product_id)));
  const horizonItems = horizonRows.map((r) => {
    const it = toItem(r, vctx, names, thumbs);
    const a = ACTIONS[it.health];
    return {
      variantId: it.variantId, productId: it.productId, title: it.title, sku: it.sku, thumbnailUrl: it.thumbnailUrl, stock: it.available, unitsPerDay: it.unitsPerDay, coverDays: it.coverDays,
      leadTimeDays: it.leadTimeDays, leadTimeSource: (r.lead_is_variant ? 'variant' : 'default') as 'variant' | 'default', health: it.health,
      action: { key: a.key, label: a.label, href: it.health === 'healthy' ? `/products/${it.productId}` : `/inventory?variant=${it.variantId}` },
    };
  });

  const shares = await warehouseShares(tx, vendorId, q.warehouseId);
  const imb = imbalanced(shares, th.imbalancePct);
  const counts: Record<Signal, number> = {
    low_stock: n(agg!.low), stockout_risk: n(agg!.risk), inventory_mismatch: n(agg!.mismatch), slow_moving: n(agg!.slow), high_velocity: n(agg!.fast), aging_inventory: n(agg!.aging), warehouse_imbalance: imb.length,
  };
  const trendOf = (col: string): number[] => trendRows.map((r) => n(r[col]));
  const trends: Partial<Record<Signal, number[]>> = { low_stock: trendOf('low'), stockout_risk: trendOf('risk'), slow_moving: trendOf('slow') };
  const signals = SIGNALS.filter((s) => vctx.mode === 'warehouse' || s !== 'warehouse_imbalance').map((key) => ({
    key, count: counts[key], trend: trends[key] ?? null, tone: counts[key] > 0 ? SIGNAL_TONE[key] : ('neutral' as const), href: `/inventory?signal=${key}`,
  }));

  const riskCount = counts.stockout_risk;
  const advisory = {
    title: 'Reorder attention',
    text: advisoryText(riskCount),
    items: adviceRows.map((r) => ({ variantId: String(r.variant_id), title: String(r.title), sku: String(r.sku), units: n(r.available), coverDays: round(n(r.cover), 1), leadTimeDays: n(r.lead) })),
    recommendationOnly: true as const, recommendationId: null as string | null,
  };

  const [until] = asOf === today ? [null] : await rows(tx, sql`select ((${asOf}::date + 1)::timestamp at time zone ${vctx.tz}::text) e`);
  const feed = await recentMovements(tx, vendorId, { limit: q.movementsLimit, warehouseId: q.warehouseId, until: until ? new Date(until.e as string | Date) : undefined, withSync: true });

  const out: Record<string, unknown> = {
    asOf, live: asOf === today, mode: vctx.mode,
    pulse: { available: n(agg!.available), reserved: n(agg!.reserved), incoming: n(agg!.incoming), returned: n(agg!.returned), damaged: n(agg!.damaged), quarantined: n(agg!.quarantined), flow: { incomingToday: n(flow?.c) } },
    horizon: { leadTimeBasis: horizonItems.some((i) => i.leadTimeSource === 'variant') ? 'variant' : 'default', defaultLeadTimeDays: vctx.defaultLeadDays, windowDays: WINDOW_DAYS, scaleMaxDays: scaleMaxDays(horizonItems), items: horizonItems },
    signals, advisory, recentMovements: feed,
  };
  if (vctx.mode === 'warehouse') {
    const over = shares.filter((s) => s.demandSharePct !== null && s.sharePct > s.demandSharePct).sort((a, b) => b.sharePct - (b.demandSharePct ?? 0) - (a.sharePct - (a.demandSharePct ?? 0)))[0];
    let insight: { text: string; warehouseId: string; advisoryOnly: true } | null = null;
    if (over && over.demandSharePct !== null && over.sharePct - over.demandSharePct > th.imbalancePct) {
      const more = over.demandSharePct > 0 ? Math.round((over.sharePct / over.demandSharePct - 1) * 100) : null;
      insight = { warehouseId: over.warehouseId, advisoryOnly: true, text: more === null ? `${over.name} holds ${over.sharePct}% of inventory but has no recent demand.` : `${over.name} currently holds ${more}% more inventory than demand patterns suggest.` };
    }
    out.distribution = { byWarehouse: shares.map((s) => ({ warehouseId: s.warehouseId, name: s.name, units: s.units, sharePct: s.sharePct, demandSharePct: s.demandSharePct })), insight };
  } else {
    const [loc] = await tx.select({ id: W.id, name: W.name }).from(W).where(and(eq(W.vendorId, vendorId), eq(W.status, 'active'), sql`${W.deletedAt} IS NULL`)).orderBy(desc(W.isDefault), W.priority, W.code).limit(1);
    out.location = loc ? { id: loc.id, name: loc.name } : { id: null, name: 'Home Inventory' };
  }
  out.ledger = { total: n(agg!.variants) };
  return out;
}

// ------------------------------------------------------------------------------------------------
// variant panel
// ------------------------------------------------------------------------------------------------
export async function variantPanel(tx: Tx, vendorId: string, vctx: VendorCtx, variantId: string, can: { write: boolean }) {
  const [v] = await tx.select({ id: V.id, sku: V.sku, productId: V.productId, title: P.title }).from(V).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId))).where(and(eq(V.id, variantId), eq(V.vendorId, vendorId)));
  if (!v) throw Errors.notFound('Variant', variantId);
  const item = (await ledgerForVariants(tx, vendorId, vctx, [variantId])).get(variantId);
  const thumbs = await thumbnails(tx, vendorId, [v.productId]);
  const byLocation = await rows(tx, sql`select w.id, w.name, w.code, i.quantity_on_hand::int on_hand, i.quantity_reserved::int reserved, i.quantity_incoming::int incoming, i.quantity_returned::int returned, i.quantity_damaged::int damaged, i.quantity_quarantined::int quarantined
    from inventory i join warehouses w on w.id = i.warehouse_id and w.vendor_id = i.vendor_id
    where i.vendor_id = ${vendorId}::uuid and i.variant_id = ${variantId}::uuid and w.status = 'active' and w.deleted_at is null order by w.priority, w.code`);
  const channels = await rows(tx, sql`select l.id listing_id, a.id account_id, a.marketplace, l.sellable_quantity, l.pushed_quantity, l.quantity_dirty, lu.requested_quantity, lu.status last_status, lu.error_message, lu.requested_at
    from marketplace_listings l join marketplace_accounts a on a.id = l.marketplace_account_id and a.vendor_id = l.vendor_id
    left join lateral (select u.requested_quantity, u.status, u.error_message, u.requested_at from channel_stock_updates u where u.vendor_id = l.vendor_id and u.listing_id = l.id order by u.requested_at desc limit 1) lu on true
    where l.vendor_id = ${vendorId}::uuid and l.variant_id = ${variantId}::uuid and l.status = 'active' order by a.created_at`);
  const feed = await recentMovements(tx, vendorId, { limit: 5, variantId });
  const unitsPerDay = item?.unitsPerDay ?? 0;
  const health = item?.health ?? 'stockout';
  const lead = item?.leadTimeDays ?? vctx.defaultLeadDays;
  const act = (key: string, label: string, method: string, href: string, enabled = true, disabledReason: string | null = null) => ({ key, label, method, href, enabled, disabledReason });
  const noWrite = can.write ? null : 'Your role cannot change stock';
  return {
    product: { productId: v.productId, variantId: v.id, title: v.title, sku: v.sku, thumbnailUrl: thumbs.get(v.productId) ?? null },
    snapshot: { available: item?.available ?? 0, reserved: item?.reserved ?? 0, incoming: item?.incoming ?? 0, onHand: item?.onHand ?? 0, returned: item?.returned ?? 0, damaged: item?.damaged ?? 0, quarantined: item?.quarantined ?? 0 },
    byLocation: byLocation.map((r) => ({ warehouseId: String(r.id), name: String(r.name), code: String(r.code), available: n(r.on_hand) - n(r.reserved), onHand: n(r.on_hand), reserved: n(r.reserved), incoming: n(r.incoming), returned: n(r.returned), damaged: n(r.damaged), quarantined: n(r.quarantined) })),
    channelAvailability: channels.map((r) => {
      const mp = String(r.marketplace);
      return {
        channel: channelRef(mp, String(r.account_id)), listingId: String(r.listing_id), quantity: nn(r.requested_quantity) ?? nn(r.sellable_quantity) ?? nn(r.pushed_quantity),
        status: (r.last_status === 'failed' ? 'failed' : r.quantity_dirty ? 'syncing' : 'healthy') as 'failed' | 'syncing' | 'healthy', lastError: r.last_status === 'failed' && r.error_message ? String(r.error_message) : null, lastTriedAt: iso(r.requested_at),
      };
    }),
    health: { state: health, tone: toneOfHealth(health), text: healthText({ health, coverDays: item?.coverDays ?? null, leadTimeDays: lead, unitsPerDay }) },
    metrics: { unitsPerDay, coverDays: item?.coverDays ?? null, leadTimeDays: lead, windowDays: WINDOW_DAYS, lowStockThreshold: await reorderOf(tx, vendorId, variantId) },
    recentMovements: feed,
    actions: [
      act('adjust_stock', 'Adjust stock', 'POST', '/api/v1/inventory/adjustments', can.write, noWrite),
      act('transfer', 'Transfer', 'POST', '/api/v1/inventory/transfers', can.write, noWrite),
      act('view_product', 'View product', 'GET', `/api/v1/products/${v.productId}`),
      act('view_sync_history', 'View sync history', 'GET', `/api/v1/sync/jobs?filter[type]=inventory`),
    ],
  };
}

async function reorderOf(tx: Tx, vendorId: string, variantId: string): Promise<number | null> {
  const [r] = await rows(tx, sql`select max(reorder_level)::int r from inventory where vendor_id = ${vendorId}::uuid and variant_id = ${variantId}::uuid`);
  return nn(r?.r);
}
