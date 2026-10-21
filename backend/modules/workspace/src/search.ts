import { sql, type Tx } from '@oms/database';
import { dayIn, inList, marketplaceName, n, rows, vendorFacts, type Row } from './util';
import type { Can } from './shell';

export type Badge = { key: string; label: string; tone: 'neutral' | 'good' | 'warn' | 'bad' | 'info' };
export interface SearchItem { id: string; title: string; subtitle: string; meta: string; badge: Badge | null; href: string }
export interface SearchGroup { type: 'product' | 'order' | 'sku'; label: string; total: number; items: SearchItem[] }

/** `%`, `_` and `\` typed by the user are literals, never wildcards */
export const likePattern = (q: string): string => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const SEP = ' · ';
/** counting stops here: "total" of a group is exact up to this many matches (the UI shows "N results"; deeper counts are not worth a scan) */
const TOTAL_CAP = 1000;
/** orders are searched among the most recent ones (the table has no trigram index): bounds the scan on large accounts */
const ORDER_WINDOW = 20_000;

const stockBadge = (available: number, threshold: number): { badge: Badge; label: string } =>
  available <= 0 ? { badge: { key: 'out_of_stock', label: 'Out of stock', tone: 'bad' }, label: 'Out of stock' }
    : available <= threshold ? { badge: { key: 'low_stock', label: 'Low stock', tone: 'warn' }, label: 'Low stock' }
      : { badge: { key: 'in_stock', label: 'In stock', tone: 'good' }, label: 'In stock' };

async function products(tx: Tx, vendorId: string, like: string, limit: number, threshold: number): Promise<SearchGroup> {
  const match = sql`p.vendor_id = ${vendorId} and p.deleted_at is null and (p.title ilike ${like} escape '\\' or p.product_code ilike ${like} escape '\\'
      or exists (select 1 from product_variants v where v.vendor_id = p.vendor_id and v.product_id = p.id and v.deleted_at is null and (v.sku ilike ${like} escape '\\' or v.barcode ilike ${like} escape '\\')))`;
  const found = await rows(tx, sql`select p.id, p.title, p.product_code, p.status from products p where ${match} order by p.title, p.id limit ${limit}`);
  const [cnt] = await rows(tx, sql`select count(*)::int c from (select 1 from products p where ${match} limit ${TOTAL_CAP}) s`);
  const stock = found.length ? await rows(tx, sql`select v.product_id, min(v.sku) sku, coalesce(sum(i.quantity_on_hand - i.quantity_reserved), 0)::int available, max(i.reorder_level) reorder
      from product_variants v left join inventory i on i.vendor_id = v.vendor_id and i.variant_id = v.id
      where v.vendor_id = ${vendorId} and v.deleted_at is null and v.product_id in (${inList(found.map((f) => String(f.id)))}) group by v.product_id`) : [];
  return {
    type: 'product', label: 'Products', total: n(cnt?.c),
    items: found.map((p) => {
      const s = stock.find((x) => x.product_id === p.id);
      const available = n(s?.available);
      const b = stockBadge(available, s?.reorder === null || s?.reorder === undefined ? threshold : n(s.reorder));
      return { id: String(p.id), title: String(p.title), subtitle: [String(s?.sku ?? p.product_code), `${available} available`, b.label].join(SEP), meta: 'Product', badge: b.badge, href: `/products/${String(p.id)}` };
    }),
  };
}

const STAGE: Record<string, string> = { new: 'New', confirmed: 'Confirmed', picking: 'Picking', packed: 'Packing', ready_to_dispatch: 'Ready to dispatch', dispatched: 'Dispatched', in_transit: 'In transit', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned' };
const PRE_DISPATCH = new Set(['new', 'confirmed', 'picking', 'packed', 'ready_to_dispatch']);

/** "Dispatch today" / "Dispatch tomorrow" / "Dispatch overdue" / "Dispatch due Oct 7", by business-day boundaries */
export function dispatchText(dueAt: Date, now: Date, tz: string): string {
  const due = dayIn(tz, dueAt);
  const today = dayIn(tz, now);
  if (dueAt.getTime() < now.getTime() && due <= today) return due === today ? 'Dispatch today' : 'Dispatch overdue';
  if (due === today) return 'Dispatch today';
  if (due < today) return 'Dispatch overdue';
  if (due === dayIn(tz, new Date(now.getTime() + 86_400_000))) return 'Dispatch tomorrow';
  return `Dispatch due ${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${due}T00:00:00Z`))}`;
}

async function orders(tx: Tx, vendorId: string, like: string, limit: number, tz: string): Promise<SearchGroup> {
  const recent = sql`(select * from orders where vendor_id = ${vendorId} order by placed_at desc, id limit ${ORDER_WINDOW}) o`;
  const match = sql`(o.order_number ilike ${like} escape '\\' or o.external_order_id ilike ${like} escape '\\' or o.buyer->>'name' ilike ${like} escape '\\')`;
  const found = await rows(tx, sql`select o.id, o.order_number, o.marketplace, o.status, o.dispatch_due_at, o.attention_reason,
      (select i.title from order_items i where i.vendor_id = o.vendor_id and i.order_id = o.id order by i.created_at, i.id limit 1) first_item
    from ${recent} where ${match} order by o.placed_at desc, o.id limit ${limit}`);
  const [cnt] = await rows(tx, sql`select count(*)::int c from (select 1 from ${recent} where ${match} limit ${TOTAL_CAP}) s`);
  const now = new Date();
  return {
    type: 'order', label: 'Orders', total: n(cnt?.c),
    items: found.map((o: Row) => {
      const status = String(o.status);
      const parts = [o.first_item ? String(o.first_item) : null, marketplaceName(String(o.marketplace)), STAGE[status] ?? status,
        PRE_DISPATCH.has(status) && o.dispatch_due_at ? dispatchText(new Date(String(o.dispatch_due_at)), now, tz) : null].filter((x): x is string => Boolean(x));
      return {
        id: String(o.id), title: `Order ${String(o.order_number)}`, subtitle: parts.join(SEP), meta: 'Order',
        badge: o.attention_reason ? { key: 'needs_attention', label: 'Needs attention', tone: 'warn' as const } : null, href: `/orders/${String(o.id)}`,
      };
    }),
  };
}

async function skus(tx: Tx, vendorId: string, like: string, limit: number, threshold: number): Promise<SearchGroup> {
  const match = sql`v.vendor_id = ${vendorId} and v.deleted_at is null and (v.sku ilike ${like} escape '\\' or v.barcode ilike ${like} escape '\\')`;
  const found = await rows(tx, sql`select v.id variant_id, v.sku, w.id warehouse_id, w.name warehouse, coalesce(i.quantity_on_hand - i.quantity_reserved, 0)::int available, i.reorder_level reorder
    from product_variants v left join inventory i on i.vendor_id = v.vendor_id and i.variant_id = v.id left join warehouses w on w.vendor_id = i.vendor_id and w.id = i.warehouse_id
    where ${match} order by v.sku, w.name, v.id limit ${limit}`);
  const [cnt] = await rows(tx, sql`select count(*)::int c from (select 1 from product_variants v left join inventory i on i.vendor_id = v.vendor_id and i.variant_id = v.id where ${match} limit ${TOTAL_CAP}) s`);
  return {
    type: 'sku', label: 'Inventory', total: n(cnt?.c),
    items: found.map((r) => {
      const available = n(r.available);
      const threshold_ = r.reorder === null ? threshold : n(r.reorder);
      return {
        id: String(r.warehouse_id ? `${String(r.variant_id)}:${String(r.warehouse_id)}` : r.variant_id), title: r.warehouse ? `${String(r.sku)} / ${String(r.warehouse)}` : String(r.sku),
        subtitle: [`Available ${available}`, `Threshold ${threshold_}`].join(SEP), meta: 'Inventory', badge: stockBadge(available, threshold_).badge, href: `/inventory/variants/${String(r.variant_id)}`,
      };
    }),
  };
}

export async function search(tx: Tx, vendorId: string, can: Can, o: { q: string; scope: 'all' | 'products' | 'orders' | 'skus'; limit: number }) {
  const facts = await vendorFacts(tx, vendorId);
  const like = likePattern(o.q);
  const groups: SearchGroup[] = [];
  if ((o.scope === 'all' || o.scope === 'products') && can('products:read')) groups.push(await products(tx, vendorId, like, o.limit, facts.lowStockThreshold));
  if ((o.scope === 'all' || o.scope === 'orders') && can('orders:read')) groups.push(await orders(tx, vendorId, like, o.limit, facts.timezone));
  if ((o.scope === 'all' || o.scope === 'skus') && can('inventory:read')) groups.push(await skus(tx, vendorId, like, o.limit, facts.lowStockThreshold));
  return { query: o.q, scope: o.scope, groups, total: groups.reduce((a, g) => a + g.total, 0), shown: groups.reduce((a, g) => a + g.items.length, 0) };
}
