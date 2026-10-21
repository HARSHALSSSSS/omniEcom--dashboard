import { and, eq, inArray, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import type { ConnectorRegistry } from '@oms/marketplace-core';
import {
  loadSlaConfig, localDay, minutesRemaining, slaBand, slaLabel, zonedTimeToUtc,
  type SlaConfig, type SlaState,
} from './sla';

/**
 * Orders workspace reads. ONE set of SQL predicates (`predicates`) feeds the ledger filters, the CSV export AND the tab / chip
 * counters of the workspace, so a counter always equals the number of rows the matching filter returns.
 *
 * Definitions (alias `o` = orders, "open" = not dispatched yet):
 *  - sla_risk          band at_risk or breached (see sla.ts)
 *  - unprocessed       open order (new..ready_to_dispatch) whose status is `new` OR whose inventory status is still `pending`
 *  - inventory_issue   open order whose inventory status is `partial` / `unallocated` (short on stock or unmapped SKU)
 *  - payment_issue     payment failed, or a PREPAID order still `pending` payment 24 h after it was placed (not cancelled / returned)
 *  - cancellation_risk an open cancellation request exists
 *  - returns           a return order that is not completed / cancelled / rejected exists
 *  - delayed           band breached
 *  - disputes          a return that was rejected or whose refund failed
 *  tabs: all | needs_attention (= sla_risk OR unprocessed OR inventory_issue OR payment_issue OR cancellation_risk OR returns)
 *        | new (status new) | processing (confirmed, picking, packed, ready_to_dispatch) | shipped (dispatched, in_transit)
 *        | delivered | returns_disputes (status returned OR returns OR disputes)
 */
export const ATTENTION_KEYS = ['sla_risk', 'unprocessed', 'inventory_issue', 'payment_issue', 'cancellation_risk', 'returns', 'delayed', 'disputes'] as const;
export const TAB_KEYS = ['all', 'needs_attention', 'new', 'processing', 'shipped', 'delivered', 'returns_disputes'] as const;
export const SLA_STATES = ['safe', 'approaching', 'at_risk', 'breached', 'none'] as const;
export const PIPELINE_STAGES = ['new', 'confirmed', 'picking', 'packed', 'ready_to_dispatch', 'dispatched', 'in_transit'] as const;
const PRE_DISPATCH = ['new', 'confirmed', 'picking', 'packed', 'ready_to_dispatch'];
const MAX_EXPORT_ROWS = 50_000;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- raw SQL rows
const list = (xs: readonly string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);
const rowsOf = async (tx: Tx, q: ReturnType<typeof sql>): Promise<Row[]> => (await tx.execute<Row>(q)).rows;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string).toISOString());

export function predicates(now: Date, cfg: Pick<SlaConfig, 'atRiskMinutes' | 'approachingMinutes'>) {
  const n = sql`${now.toISOString()}::timestamptz`;
  const done = sql`o.status IN ('dispatched','in_transit','delivered','cancelled','returned')`;
  const band = sql`(CASE WHEN ${done} OR o.dispatch_due_at IS NULL THEN 'none'
    WHEN o.dispatch_due_at < ${n} THEN 'breached'
    WHEN o.dispatch_due_at <= ${n} + make_interval(mins => ${cfg.atRiskMinutes}::int) THEN 'at_risk'
    WHEN o.dispatch_due_at <= ${n} + make_interval(mins => ${cfg.approachingMinutes}::int) THEN 'approaching'
    ELSE 'safe' END)`;
  const open = sql`o.status IN (${list(PRE_DISPATCH)})`;
  const p = {
    band,
    sla_risk: sql`(${band} IN ('at_risk','breached'))`,
    unprocessed: sql`(${open} AND (o.status = 'new' OR o.inventory_status = 'pending'))`,
    inventory_issue: sql`(${open} AND o.inventory_status IN ('partial','unallocated'))`,
    payment_issue: sql`(o.status NOT IN ('cancelled','returned') AND (o.payment_status = 'failed' OR (o.payment_method = 'prepaid' AND o.payment_status = 'pending' AND o.placed_at < ${n} - interval '24 hours')))`,
    cancellation_risk: sql`EXISTS (SELECT 1 FROM order_cancellations oc WHERE oc.vendor_id = o.vendor_id AND oc.order_id = o.id AND oc.status = 'requested')`,
    returns: sql`EXISTS (SELECT 1 FROM return_orders r WHERE r.vendor_id = o.vendor_id AND r.order_id = o.id AND r.status NOT IN ('completed','cancelled','rejected'))`,
    delayed: sql`(${band} = 'breached')`,
    disputes: sql`EXISTS (SELECT 1 FROM return_orders r WHERE r.vendor_id = o.vendor_id AND r.order_id = o.id AND (r.status = 'rejected' OR r.refund_status = 'failed'))`,
  };
  const needsAttention = sql`(${p.sla_risk} OR ${p.unprocessed} OR ${p.inventory_issue} OR ${p.payment_issue} OR ${p.cancellation_risk} OR ${p.returns})`;
  const tabs: Record<(typeof TAB_KEYS)[number], ReturnType<typeof sql>> = {
    all: sql`TRUE`,
    needs_attention: needsAttention,
    new: sql`o.status = 'new'`,
    processing: sql`o.status IN ('confirmed','picking','packed','ready_to_dispatch')`,
    shipped: sql`o.status IN ('dispatched','in_transit')`,
    delivered: sql`o.status = 'delivered'`,
    returns_disputes: sql`(o.status = 'returned' OR ${p.returns} OR ${p.disputes})`,
  };
  return { ...p, tabs };
}

// ------------------------------------------------------------------------------------------------
// filters (shared by the ledger and the export)
// ------------------------------------------------------------------------------------------------
export interface LedgerFilters {
  q?: string; marketplace?: string[]; status?: string[]; slaState?: string[]; payment?: string[]; fulfillmentStatus?: string[]; attention?: string[]; tab?: string;
  placedFrom?: Date; placedTo?: Date; date?: string;
}
export type LedgerSort = '-placedAt' | 'placedAt' | '-value' | 'value' | 'sla' | '-sla';

const PAYMENT_METHODS = ['prepaid', 'cod', 'unknown'];
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function dayRange(spec: string, tz: string, now: Date): { from: Date; to: Date } {
  let day = spec;
  if (spec === 'today') day = localDay(now, tz);
  else if (spec === 'yesterday') day = localDay(new Date(now.getTime() - 86_400_000), tz);
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return { from: zonedTimeToUtc(y, m, d, 0, 0, tz), to: zonedTimeToUtc(y, m, d + 1, 0, 0, tz) };
}

export function ledgerWhere(vendorId: string, f: LedgerFilters, cfg: SlaConfig, now: Date) {
  const P = predicates(now, cfg);
  const w: Array<ReturnType<typeof sql>> = [sql`o.vendor_id = ${vendorId}::uuid`];
  if (f.q?.trim()) {
    const like = `%${likeEscape(f.q.trim())}%`;
    w.push(sql`(o.order_number ILIKE ${like} OR o.external_order_id ILIKE ${like} OR o.buyer->>'name' ILIKE ${like}
      OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.vendor_id = o.vendor_id AND oi.order_id = o.id AND oi.sku ILIKE ${like}))`);
  }
  if (f.marketplace?.length) w.push(sql`o.marketplace IN (${list(f.marketplace)})`);
  if (f.status?.length) w.push(sql`o.status IN (${list(f.status)})`);
  if (f.slaState?.length) w.push(sql`${P.band} IN (${list(f.slaState)})`);
  if (f.payment?.length) {
    const methods = f.payment.filter((x) => PAYMENT_METHODS.includes(x));
    const statuses = f.payment.filter((x) => !PAYMENT_METHODS.includes(x));
    const ors: Array<ReturnType<typeof sql>> = [];
    if (methods.length) ors.push(sql`o.payment_method IN (${list(methods)})`);
    if (statuses.length) ors.push(sql`o.payment_status IN (${list(statuses)})`);
    w.push(sql`(${sql.join(ors, sql` OR `)})`);
  }
  if (f.fulfillmentStatus?.length) {
    const latest = sql`(SELECT f.status FROM fulfillments f WHERE f.vendor_id = o.vendor_id AND f.order_id = o.id ORDER BY f.created_at DESC, f.id DESC LIMIT 1)`;
    const real = f.fulfillmentStatus.filter((x) => x !== 'none');
    const ors: Array<ReturnType<typeof sql>> = [];
    if (real.length) ors.push(sql`${latest} IN (${list(real)})`);
    if (f.fulfillmentStatus.includes('none')) ors.push(sql`${latest} IS NULL`);
    w.push(sql`(${sql.join(ors, sql` OR `)})`);
  }
  if (f.attention?.length) w.push(sql`(${sql.join(f.attention.map((k) => P[k as (typeof ATTENTION_KEYS)[number]]), sql` OR `)})`);
  if (f.tab && f.tab !== 'all') w.push(P.tabs[f.tab as (typeof TAB_KEYS)[number]]);
  if (f.date) { const r = dayRange(f.date, cfg.timezone, now); w.push(sql`o.placed_at >= ${r.from.toISOString()}::timestamptz AND o.placed_at < ${r.to.toISOString()}::timestamptz`); }
  if (f.placedFrom) w.push(sql`o.placed_at >= ${f.placedFrom.toISOString()}::timestamptz`);
  if (f.placedTo) w.push(sql`o.placed_at <= ${f.placedTo.toISOString()}::timestamptz`);
  return { where: sql.join(w, sql` AND `), P };
}

const marketplaceNames = (reg: ConnectorRegistry, codes: string[]): Map<string, string> =>
  new Map(codes.map((c) => [c, reg.has(c) ? reg.get(c).displayName : c]));

function orderBy(sort: LedgerSort, band: ReturnType<typeof sql>) {
  switch (sort) {
    case 'placedAt': return sql`o.placed_at ASC, o.id ASC`;
    case 'value': return sql`o.total_minor ASC, o.id ASC`;
    case '-value': return sql`o.total_minor DESC, o.id ASC`;
    case 'sla': return sql`(${band} = 'none') ASC, o.dispatch_due_at ASC NULLS LAST, o.id ASC`;
    case '-sla': return sql`(${band} = 'none') ASC, o.dispatch_due_at DESC NULLS LAST, o.id ASC`;
    default: return sql`o.placed_at DESC, o.id DESC`;
  }
}

export type RowTone = 'red' | 'amber' | 'green' | 'none';
export const rowTone = (band: SlaState, f: { payment: boolean; inventory: boolean; unprocessed: boolean; cancellation: boolean }): RowTone =>
  band === 'breached' || band === 'at_risk' || f.payment ? 'red'
    : band === 'approaching' || f.inventory || f.unprocessed || f.cancellation ? 'amber'
      : band === 'safe' ? 'green' : 'none';

const SELECT_COLUMNS = (P: ReturnType<typeof predicates>) => sql`o.id, o.order_number, o.marketplace, o.buyer->>'name' AS customer_name, o.total_minor, o.currency, o.payment_status, o.payment_method, o.status,
  o.placed_at, o.dispatch_due_at, o.created_at, o.inventory_status, o.shipping_address->>'city' AS city, o.shipping_address->>'state' AS state,
  COALESCE(o.shipping_address->>'pincode', o.shipping_address->>'postalCode') AS pincode, o.carrier, o.tracking_number, o.warehouse_id, o.attention_reason, ${P.band} AS band, ${P.payment_issue} AS f_payment, ${P.inventory_issue} AS f_inventory, ${P.unprocessed} AS f_unprocessed, ${P.cancellation_risk} AS f_cancellation`;

export interface LedgerItem {
  id: string; number: string; marketplace: { code: string; name: string }; customerName: string | null; itemCount: number; valueMinor: number; currency: string;
  payment: { status: string; method: string }; fulfillmentStatus: string | null; sla: { state: SlaState; dueAt: string | null; minutesRemaining: number | null; label: string | null };
  status: string; createdAt: string; placedAt: string; rowTone: RowTone;
  inventoryIssue: { productTitle: string; sku: string; required: number; available: number; action: 'allocate' | 'restock' | 'map_sku' } | null;
  /** additive display fields for the table */
  destination: { city: string | null; state: string | null; pincode: string | null };
  lineCount: number; firstItem: { title: string; sku: string; imageUrl: string | null } | null;
  carrier: { name: string | null; trackingNumber: string | null } | null; warehouse: { id: string; name: string } | null;
  statusLabel: string; paymentLabel: string; priority: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  new: 'New', confirmed: 'Confirmed', picking: 'Picking', packed: 'Packed', ready_to_dispatch: 'Ready to dispatch', dispatched: 'Dispatched', in_transit: 'In transit', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned',
};
export const paymentLabel = (method: string, status: string): string => {
  const m = method === 'cod' ? 'Cash on delivery' : method === 'prepaid' ? 'Prepaid' : 'Payment method unknown';
  return `${m} - ${status.charAt(0).toUpperCase()}${status.slice(1)}`;
};

/** turn rows into ledger items with batched lookups (items, latest fulfillment, stock): never one query per row */
async function hydrate(tx: Tx, vendorId: string, reg: ConnectorRegistry, rows: Row[], now: Date): Promise<LedgerItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const idList = sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
  const counts = await rowsOf(tx, sql`SELECT order_id, sum(quantity)::int AS units FROM order_items WHERE vendor_id = ${vendorId}::uuid AND order_id IN (${idList}) GROUP BY order_id`);
  const unitsBy = new Map(counts.map((c) => [c.order_id as string, num(c.units)]));
  const fulf = await rowsOf(tx, sql`SELECT DISTINCT ON (order_id) order_id, status, warehouse_id FROM fulfillments WHERE vendor_id = ${vendorId}::uuid AND order_id IN (${idList}) ORDER BY order_id, created_at DESC, id DESC`);
  const fulfBy = new Map(fulf.map((f) => [f.order_id as string, f.status as string]));

  const fulfWh = new Map(fulf.map((f) => [f.order_id as string, f.warehouse_id as string]));
  // display extras: first line (+ thumbnail of its product), line count, warehouse names
  const lineRows = await rowsOf(tx, sql`SELECT oi.order_id, oi.title, oi.sku, oi.variant_id FROM order_items oi WHERE oi.vendor_id = ${vendorId}::uuid AND oi.order_id IN (${idList}) ORDER BY oi.order_id, oi.created_at, oi.id`);
  const firstBy = new Map<string, Row>();
  const linesBy = new Map<string, number>();
  for (const l of lineRows) { const k = l.order_id as string; if (!firstBy.has(k)) firstBy.set(k, l); linesBy.set(k, (linesBy.get(k) ?? 0) + 1); }
  const variantIds = [...new Set([...firstBy.values()].map((l) => l.variant_id as string | null).filter((v): v is string => !!v))];
  const thumbByVariant = new Map<string, string>();
  if (variantIds.length) {
    const vList = sql.join(variantIds.map((i) => sql`${i}::uuid`), sql`, `);
    const th = await rowsOf(tx, sql`SELECT v.id AS variant_id, d.id AS doc_id FROM product_variants v
      JOIN LATERAL (SELECT pd.id FROM product_documents pd WHERE pd.vendor_id = v.vendor_id AND pd.product_id = v.product_id AND pd.kind = 'image' AND pd.deleted_at IS NULL AND pd.status IN ('uploaded', 'processed') ORDER BY pd.is_primary DESC, pd.sort_order, pd.created_at LIMIT 1) d ON true
      WHERE v.vendor_id = ${vendorId}::uuid AND v.id IN (${vList})`);
    for (const t of th) thumbByVariant.set(t.variant_id as string, `/api/v1/documents/${t.doc_id}/content`);
  }
  const whIds = [...new Set([...rows.map((r) => r.warehouse_id as string | null), ...fulfWh.values()].filter((w): w is string => !!w))];
  const whNames = new Map<string, string>();
  if (whIds.length) for (const w of await tx.select({ id: schema.warehouses.id, name: schema.warehouses.name }).from(schema.warehouses).where(and(eq(schema.warehouses.vendorId, vendorId), inArray(schema.warehouses.id, whIds)))) whNames.set(w.id, w.name);

  const issueIds = rows.filter((r) => r.f_inventory).map((r) => r.id as string);
  const issueBy = new Map<string, LedgerItem['inventoryIssue']>();
  if (issueIds.length) {
    const OI = schema.orderItems;
    const lines = await tx.select({ orderId: OI.orderId, variantId: OI.variantId, sku: OI.sku, title: OI.title, quantity: OI.quantity, reserved: OI.reservedQuantity }).from(OI).where(and(eq(OI.vendorId, vendorId), inArray(OI.orderId, issueIds))).orderBy(OI.createdAt, OI.id);
    const short = lines.filter((l) => !l.variantId || l.reserved < l.quantity);
    const variantIds = [...new Set(short.map((l) => l.variantId).filter((v): v is string => !!v))];
    const free = new Map<string, number>();
    if (variantIds.length) {
      const I = schema.inventory;
      const stock = await tx.select({ variantId: I.variantId, free: sql<number>`coalesce(sum(${I.quantityOnHand} - ${I.quantityReserved}), 0)::int` }).from(I).where(and(eq(I.vendorId, vendorId), inArray(I.variantId, variantIds))).groupBy(I.variantId);
      for (const s of stock) free.set(s.variantId, s.free);
    }
    for (const l of short) {
      if (issueBy.has(l.orderId)) continue;
      const available = l.variantId ? free.get(l.variantId) ?? 0 : 0;
      issueBy.set(l.orderId, { productTitle: l.title, sku: l.sku, required: l.quantity - l.reserved, available, action: !l.variantId ? 'map_sku' : available > 0 ? 'allocate' : 'restock' });
    }
  }
  const names = marketplaceNames(reg, [...new Set(rows.map((r) => r.marketplace as string))]);
  return rows.map((r) => {
    const due = r.dispatch_due_at ? new Date(r.dispatch_due_at) : null;
    const state = r.band as SlaState;
    const mins = state === 'none' ? null : minutesRemaining(due, now);
    return {
      id: r.id, number: r.order_number, marketplace: { code: r.marketplace, name: names.get(r.marketplace) ?? r.marketplace }, customerName: r.customer_name ?? null, itemCount: unitsBy.get(r.id) ?? 0,
      valueMinor: num(r.total_minor), currency: String(r.currency).trim(), payment: { status: r.payment_status, method: r.payment_method }, fulfillmentStatus: fulfBy.get(r.id) ?? null,
      sla: { state, dueAt: iso(due), minutesRemaining: mins, label: slaLabel(state, mins) }, status: r.status, createdAt: iso(r.created_at)!, placedAt: iso(r.placed_at)!,
      rowTone: rowTone(state, { payment: !!r.f_payment, inventory: !!r.f_inventory, unprocessed: !!r.f_unprocessed, cancellation: !!r.f_cancellation }),
      inventoryIssue: issueBy.get(r.id) ?? null,
      destination: { city: r.city ?? null, state: r.state ?? null, pincode: r.pincode ?? null }, lineCount: linesBy.get(r.id) ?? 0,
      firstItem: firstBy.has(r.id) ? { title: firstBy.get(r.id)!.title as string, sku: firstBy.get(r.id)!.sku as string, imageUrl: thumbByVariant.get(firstBy.get(r.id)!.variant_id as string) ?? null } : null,
      carrier: r.carrier || r.tracking_number ? { name: r.carrier ?? null, trackingNumber: r.tracking_number ?? null } : null,
      warehouse: (r.warehouse_id ?? fulfWh.get(r.id)) ? { id: (r.warehouse_id ?? fulfWh.get(r.id)) as string, name: whNames.get((r.warehouse_id ?? fulfWh.get(r.id)) as string) ?? '' } : null,
      statusLabel: STATUS_LABEL[r.status as string] ?? (r.status as string), paymentLabel: paymentLabel(r.payment_method, r.payment_status), priority: ((r.attention_reason as string | null) ?? '').split(';').includes('priority'),
    };
  });
}

export async function ledger(tx: Tx, vendorId: string, reg: ConnectorRegistry, f: LedgerFilters, sort: LedgerSort, win: { limit: number; offset: number }, now = new Date()) {
  const cfg = await loadSlaConfig(tx, vendorId);
  const { where, P } = ledgerWhere(vendorId, f, cfg, now);
  const [t] = await rowsOf(tx, sql`SELECT count(*)::int AS n FROM orders o WHERE ${where}`);
  const rows = await rowsOf(tx, sql`SELECT ${SELECT_COLUMNS(P)} FROM orders o WHERE ${where} ORDER BY ${orderBy(sort, P.band)} LIMIT ${win.limit} OFFSET ${win.offset}`);
  return { total: num(t?.n), items: await hydrate(tx, vendorId, reg, rows, now) };
}

// ------------------------------------------------------------------------------------------------
// export
// ------------------------------------------------------------------------------------------------
const csvCell = (v: string | number | null | undefined): string => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function exportCsv(tx: Tx, vendorId: string, reg: ConnectorRegistry, f: LedgerFilters, sort: LedgerSort, now = new Date()): Promise<{ csv: string; rows: number }> {
  const cfg = await loadSlaConfig(tx, vendorId);
  const { where, P } = ledgerWhere(vendorId, f, cfg, now);
  const [t] = await rowsOf(tx, sql`SELECT count(*)::int AS n FROM orders o WHERE ${where}`);
  if (num(t?.n) > MAX_EXPORT_ROWS) throw new AppError('PAYLOAD_TOO_LARGE', `Too many orders to export (${num(t?.n)} > ${MAX_EXPORT_ROWS}); narrow the filters`, { details: { rows: num(t?.n), max: MAX_EXPORT_ROWS } });
  const raw = await rowsOf(tx, sql`SELECT ${SELECT_COLUMNS(P)} FROM orders o WHERE ${where} ORDER BY ${orderBy(sort, P.band)}`);
  // chunked hydration keeps parameter lists small
  const items: LedgerItem[] = [];
  for (let i = 0; i < raw.length; i += 1000) items.push(...(await hydrate(tx, vendorId, reg, raw.slice(i, i + 1000), now)));
  const header = ['Order number', 'Placed at', 'Marketplace', 'Customer', 'Units', 'Value', 'Currency', 'Payment method', 'Payment status', 'Status', 'Fulfillment', 'SLA state', 'Dispatch due at', 'SLA', 'City', 'Pincode', 'Carrier', 'Tracking number', 'Warehouse'];
  const lines = [header.map(csvCell).join(',')];
  for (const i of items) {
    lines.push([i.number, i.placedAt, i.marketplace.name, i.customerName, i.itemCount, (i.valueMinor / 100).toFixed(2), i.currency, i.payment.method, i.payment.status, i.status, i.fulfillmentStatus, i.sla.state, i.sla.dueAt, i.sla.label, i.destination.city, i.destination.pincode, i.carrier?.name, i.carrier?.trackingNumber, i.warehouse?.name].map(csvCell).join(','));
  }
  return { csv: lines.join('\r\n') + '\r\n', rows: items.length };
}

// ------------------------------------------------------------------------------------------------
// workspace summary
// ------------------------------------------------------------------------------------------------
export async function workspace(tx: Tx, vendorId: string, reg: ConnectorRegistry, asOf: string | undefined, now = new Date()) {
  const cfg = await loadSlaConfig(tx, vendorId);
  const day = asOf ?? localDay(now, cfg.timezone);
  const range = dayRange(day, cfg.timezone, now);
  const P = predicates(now, cfg);
  const base = sql`o.vendor_id = ${vendorId}::uuid`;

  // block 1: pulse (orders placed on the day, by current status)
  const stageRows = await rowsOf(tx, sql`SELECT o.status, count(*)::int AS n FROM orders o WHERE ${base} AND o.placed_at >= ${range.from.toISOString()}::timestamptz AND o.placed_at < ${range.to.toISOString()}::timestamptz GROUP BY o.status`);
  const byStatus = new Map(stageRows.map((r) => [r.status as string, num(r.n)]));

  // block 2: needs attention + SLA pressure + tabs, one pass over the vendor's orders
  const [c] = await rowsOf(tx, sql`SELECT
      count(*) FILTER (WHERE ${P.sla_risk})::int AS sla_risk, count(*) FILTER (WHERE ${P.unprocessed})::int AS unprocessed, count(*) FILTER (WHERE ${P.inventory_issue})::int AS inventory_issue,
      count(*) FILTER (WHERE ${P.payment_issue})::int AS payment_issue, count(*) FILTER (WHERE ${P.cancellation_risk})::int AS cancellation_risk, count(*) FILTER (WHERE ${P.returns})::int AS returns,
      count(*) FILTER (WHERE ${P.band} = 'safe')::int AS b_safe, count(*) FILTER (WHERE ${P.band} = 'approaching')::int AS b_approaching, count(*) FILTER (WHERE ${P.band} = 'at_risk')::int AS b_at_risk,
      count(*) FILTER (WHERE ${P.band} = 'breached')::int AS b_breached,
      ${sql.join(TAB_KEYS.map((k) => sql`count(*) FILTER (WHERE ${P.tabs[k]})::int AS ${sql.raw(`t_${k}`)}`), sql`, `)}
    FROM orders o WHERE ${base}`);

  // block 3: sources = orders placed in the last 24 h by marketplace
  const since = new Date(now.getTime() - 86_400_000);
  const srcRows = await rowsOf(tx, sql`SELECT o.marketplace, count(*)::int AS n FROM orders o WHERE ${base} AND o.placed_at >= ${since.toISOString()}::timestamptz AND o.placed_at <= ${now.toISOString()}::timestamptz GROUP BY o.marketplace ORDER BY n DESC, o.marketplace`);
  const srcTotal = srcRows.reduce((n, r) => n + num(r.n), 0);
  const names = marketplaceNames(reg, srcRows.map((r) => r.marketplace as string));

  const hours = (m: number) => (m % 60 === 0 ? `${m / 60} h` : `${m} min`);
  const atRisk = num(c?.b_at_risk);
  return {
    asOf: day, generatedAt: now.toISOString(),
    pulse: { today: [...byStatus.values()].reduce((a, b) => a + b, 0), stages: PIPELINE_STAGES.map((key) => ({ key, count: byStatus.get(key) ?? 0 })) },
    needsAttention: { slaRisk: num(c?.sla_risk), unprocessed: num(c?.unprocessed), inventoryIssue: num(c?.inventory_issue), paymentIssue: num(c?.payment_issue), cancellationRisk: num(c?.cancellation_risk), returns: num(c?.returns) },
    sources: { total: srcTotal, windowHours: 24, items: srcRows.map((r) => ({ channel: { code: r.marketplace as string, name: names.get(r.marketplace) ?? r.marketplace }, orders: num(r.n), sharePct: srcTotal ? Math.round((num(r.n) / srcTotal) * 1000) / 10 : 0 })) },
    slaPressure: {
      thresholds: { atRiskMinutes: cfg.atRiskMinutes, approachingMinutes: cfg.approachingMinutes },
      safe: { orders: num(c?.b_safe), hintKey: 'sla.safe', hint: `more than ${hours(cfg.approachingMinutes)}` },
      approaching: { orders: num(c?.b_approaching), hintKey: 'sla.approaching', hint: `${hours(cfg.atRiskMinutes)} to ${hours(cfg.approachingMinutes)}` },
      atRisk: { orders: atRisk, hintKey: 'sla.at_risk', hint: `less than ${hours(cfg.atRiskMinutes)}` },
      breached: { orders: num(c?.b_breached), hintKey: 'sla.breached', hint: 'past the deadline' },
      summary: `${atRisk} orders may breach dispatch SLA within the next ${cfg.atRiskMinutes} minutes.`,
      reviewHref: '/orders?filter[slaState]=at_risk',
    },
    tabs: { all: num(c?.t_all), needsAttention: num(c?.t_needs_attention), new: num(c?.t_new), processing: num(c?.t_processing), shipped: num(c?.t_shipped), delivered: num(c?.t_delivered), returnsDisputes: num(c?.t_returns_disputes) },
  };
}

// ------------------------------------------------------------------------------------------------
// drawer
// ------------------------------------------------------------------------------------------------
const STATUS_TEXT: Record<string, string> = {
  new: 'Order received', confirmed: 'Order confirmed', picking: 'Picking started', packed: 'Packed', ready_to_dispatch: 'Moved to ready to dispatch',
  dispatched: 'Dispatched', in_transit: 'In transit', delivered: 'Delivered', cancelled: 'Order cancelled', returned: 'Order returned',
};
const PICKING_OF: Record<string, 'pending' | 'in_progress' | 'done'> = {
  confirmed: 'pending', on_hold: 'pending', picking: 'in_progress',
  picked: 'done', packing: 'done', packed: 'done', ready_to_ship: 'done', shipped: 'done', in_transit: 'done', delivered: 'done',
};
const STAGE_LABEL: Record<SlaState, string> = { safe: 'On track', approaching: 'Approaching deadline', at_risk: 'At risk', breached: 'Breached', none: '' };

export async function drawer(tx: Tx, vendorId: string, reg: ConnectorRegistry, id: string, now = new Date()) {
  const O = schema.orders;
  const [o] = await tx.select().from(O).where(and(eq(O.vendorId, vendorId), eq(O.id, id)));
  if (!o) throw Errors.notFound('Order', id);
  const cfg = await loadSlaConfig(tx, vendorId);
  const OI = schema.orderItems;
  const items = await tx.select({ title: OI.title, sku: OI.sku, quantity: OI.quantity }).from(OI).where(and(eq(OI.vendorId, vendorId), eq(OI.orderId, id))).orderBy(OI.createdAt, OI.id);
  const F = schema.fulfillments;
  const fs = await tx.select().from(F).where(and(eq(F.vendorId, vendorId), eq(F.orderId, id))).orderBy(sql`${F.createdAt} DESC`, sql`${F.id} DESC`);
  const f = fs.find((x) => x.status !== 'cancelled') ?? null;
  const whId = f?.warehouseId ?? o.warehouseId;
  let warehouse: string | null = null;
  if (whId) warehouse = (await tx.select({ name: schema.warehouses.name }).from(schema.warehouses).where(and(eq(schema.warehouses.vendorId, vendorId), eq(schema.warehouses.id, whId))))[0]?.name ?? null;
  const E = schema.orderStatusEvents;
  const events = await tx.select().from(E).where(and(eq(E.vendorId, vendorId), eq(E.orderId, id), eq(E.applied, true))).orderBy(sql`${E.id} DESC`).limit(10);

  const due = o.dispatchDueAt;
  const band = slaBand({ status: o.status, dueAt: due }, now, cfg);
  const mins = band === 'none' ? null : minutesRemaining(due, now);
  const span = due ? due.getTime() - o.placedAt.getTime() : 0;
  const progressPct = band === 'none' || !due || span <= 0 ? null : Math.max(0, Math.min(100, Math.round(((now.getTime() - o.placedAt.getTime()) / span) * 100)));
  const buyer = o.buyer as Record<string, unknown>;
  const addr = o.shippingAddress as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const mp = reg.has(o.marketplace) ? reg.get(o.marketplace).displayName : o.marketplace;
  const cancellable = PRE_DISPATCH.includes(o.status);
  return {
    id: o.id, number: o.orderNumber, status: o.status, channel: { code: o.marketplace, name: mp }, createdAt: o.createdAt.toISOString(), placedAt: o.placedAt.toISOString(),
    sla: { state: band, dueAt: iso(due), minutesRemaining: mins, label: slaLabel(band, mins), progressPct, stageLabel: band === 'none' ? STATUS_TEXT[o.status] ?? o.status : STAGE_LABEL[band] },
    customer: { name: text(buyer.name), city: text(addr.city), state: text(addr.state) },
    value: { totalMinor: o.totalMinor, currency: o.currency.trim(), paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod },
    items: { units: items.reduce((n, i) => n + i.quantity, 0), lines: items.map((i) => ({ title: i.title, sku: i.sku, qty: i.quantity })) },
    fulfillment: { warehouse, picking: f ? PICKING_OF[f.status] ?? null : null, fulfillmentId: f?.id ?? null, status: f?.status ?? null },
    marketplaceStatus: o.marketplaceStatus ? `${mp}: ${o.marketplaceStatus}` : null,
    activity: events.map((e) => ({ at: e.createdAt.toISOString(), text: STATUS_TEXT[e.toStatus] ?? e.toStatus })),
    actions: [
      { key: 'open_fulfillment' as const, label: 'Open fulfillment', method: 'GET', href: f ? `/api/v1/fulfillments/${f.id}` : null, enabled: !!f, disabledReason: f ? null : 'no_fulfillment' },
      { key: 'cancel_order' as const, label: 'Cancel order', method: 'POST', href: `/api/v1/orders/${o.id}/cancel`, enabled: cancellable, disabledReason: cancellable ? null : 'already_dispatched_or_closed' },
    ],
  };
}

// ------------------------------------------------------------------------------------------------
// recent activity
// ------------------------------------------------------------------------------------------------
const EVENT_TEXT: Record<string, string> = {
  payment_confirmed: 'Payment confirmed', ready_to_dispatch: 'Moved to ready to dispatch', picking_started: 'Picking started', sla_risk: 'SLA risk detected', return_requested: 'Return request received',
};

export async function activity(tx: Tx, vendorId: string, reg: ConnectorRegistry, limit: number, now = new Date()) {
  const cfg = await loadSlaConfig(tx, vendorId);
  const P = predicates(now, cfg);
  const v = sql`${vendorId}::uuid`;
  const n = sql`${now.toISOString()}::timestamptz`;
  // every branch is bounded by its own ORDER BY ... LIMIT, so the union never scans a whole history
  const rows = await rowsOf(tx, sql`
    SELECT * FROM (
      (SELECT o.created_at AS at, o.id AS order_id, o.order_number, o.marketplace, 'payment_confirmed' AS event FROM orders o WHERE o.vendor_id = ${v} AND o.payment_status = 'paid' ORDER BY o.created_at DESC LIMIT ${limit})
      UNION ALL
      (SELECT e.created_at, o.id, o.order_number, o.marketplace, 'ready_to_dispatch' FROM order_status_events e JOIN orders o ON o.vendor_id = e.vendor_id AND o.id = e.order_id WHERE e.vendor_id = ${v} AND e.applied AND e.to_status = 'ready_to_dispatch' ORDER BY e.id DESC LIMIT ${limit})
      UNION ALL
      (SELECT e.created_at, o.id, o.order_number, o.marketplace, 'picking_started' FROM order_status_events e JOIN orders o ON o.vendor_id = e.vendor_id AND o.id = e.order_id WHERE e.vendor_id = ${v} AND e.applied AND e.to_status = 'picking' ORDER BY e.id DESC LIMIT ${limit})
      UNION ALL
      (SELECT o.dispatch_due_at - make_interval(mins => ${cfg.atRiskMinutes}::int), o.id, o.order_number, o.marketplace, 'sla_risk' FROM orders o WHERE o.vendor_id = ${v} AND ${P.band} = 'at_risk' ORDER BY o.dispatch_due_at ASC LIMIT ${limit})
      UNION ALL
      (SELECT r.created_at, o.id, o.order_number, o.marketplace, 'return_requested' FROM return_orders r JOIN orders o ON o.vendor_id = r.vendor_id AND o.id = r.order_id WHERE r.vendor_id = ${v} ORDER BY r.created_at DESC LIMIT ${limit})
    ) a WHERE a.at <= ${n} ORDER BY a.at DESC, a.event LIMIT ${limit}`);
  const names = marketplaceNames(reg, [...new Set(rows.map((r) => r.marketplace as string))]);
  return rows.map((r) => ({ at: iso(r.at)!, orderId: r.order_id as string, orderNumber: r.order_number as string, channel: { code: r.marketplace as string, name: names.get(r.marketplace) ?? r.marketplace }, event: r.event as string, text: EVENT_TEXT[r.event] ?? r.event }));
}

// ------------------------------------------------------------------------------------------------
// SLA policies
// ------------------------------------------------------------------------------------------------
export interface PolicyInput { marketplace: string; warehouseId?: string | null; handlingHours: number; cutoffTime?: string | null }

export const toPolicyDto = (r: typeof schema.marketplaceSla.$inferSelect) => ({
  id: r.id, marketplace: r.marketplace, warehouseId: r.warehouseId, handlingHours: r.handlingHours, cutoffTime: r.cutoffTime, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
});

export async function listPolicies(tx: Tx, vendorId: string) {
  const S = schema.marketplaceSla;
  const cfg = await loadSlaConfig(tx, vendorId);
  const rows = await tx.select().from(S).where(eq(S.vendorId, vendorId)).orderBy(S.marketplace, S.createdAt);
  return { defaultHandlingHours: cfg.policies.defaultHandlingHours, atRiskMinutes: cfg.atRiskMinutes, approachingMinutes: cfg.approachingMinutes, timezone: cfg.timezone, items: rows.map(toPolicyDto) };
}

export async function upsertPolicy(tx: Tx, vendorId: string, input: PolicyInput) {
  const S = schema.marketplaceSla;
  if (input.warehouseId) {
    const [w] = await tx.select({ id: schema.warehouses.id }).from(schema.warehouses).where(and(eq(schema.warehouses.vendorId, vendorId), eq(schema.warehouses.id, input.warehouseId)));
    if (!w) throw Errors.notFound('Warehouse', input.warehouseId);
  }
  const wh = input.warehouseId ?? null;
  const existing = (await tx.select().from(S).where(and(eq(S.vendorId, vendorId), eq(S.marketplace, input.marketplace), wh ? eq(S.warehouseId, wh) : sql`${S.warehouseId} IS NULL`)))[0];
  if (existing) {
    const [row] = await tx.update(S).set({ handlingHours: input.handlingHours, cutoffTime: input.cutoffTime ?? null, updatedAt: new Date() }).where(eq(S.id, existing.id)).returning();
    return { policy: toPolicyDto(row!), created: false };
  }
  const [row] = await tx.insert(S).values({ vendorId, marketplace: input.marketplace, warehouseId: wh, handlingHours: input.handlingHours, cutoffTime: input.cutoffTime ?? null }).returning();
  return { policy: toPolicyDto(row!), created: true };
}

export async function deletePolicy(tx: Tx, vendorId: string, id: string) {
  const S = schema.marketplaceSla;
  const [row] = await tx.delete(S).where(and(eq(S.vendorId, vendorId), eq(S.id, id))).returning();
  if (!row) throw Errors.notFound('SLA policy', id);
  return toPolicyDto(row);
}


