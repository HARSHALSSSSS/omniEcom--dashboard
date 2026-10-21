import { and, eq, inArray, isNull, schema, sql, type SQL, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { allocationOrder } from '@oms/mod-warehouses';
import { channelSync, masterSummary, type AdjustmentInput } from './dashboard-ops';
import { advisoryText, lxCte, type Thresholds, type VendorCtx } from './dashboard-query';
import { createTransfer, receiveTransfer, shipTransfer, variantOverview } from './service';

/**
 * Read models and one-call writes for the Inventory screen: the KPI tiles, the human movement feed, a quick stock adjust that
 * speaks the screen's vocabulary (SKU, reasons) and an immediate warehouse-to-warehouse transfer. Everything is built on the
 * existing ledger (`applyMovement`) and the existing adjustment / transfer services: nothing here changes stock on its own.
 */
type Row = Record<string, unknown>;
type Actor = { type: 'user' | 'api_key' | 'system' | 'webhook'; id?: string | null };
const rows = async (tx: Tx, q: SQL): Promise<Row[]> => (await tx.execute<Row>(q)).rows;
const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const V = schema.productVariants;
const W = schema.warehouses;

/** a channel push older than this counts as stale in the KPI strip */
export const FRESH_SYNC_MINUTES = 60;

// ================================================================================================
// KPI tiles
// ================================================================================================
export const syncLabel = (minutes: number | null): string => {
  if (minutes === null) return 'Never synced';
  if (minutes < 1) return 'Synced just now';
  if (minutes < 60) return `Synced ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  if (minutes < 1440) { const h = Math.floor(minutes / 60); return `Synced ${h} hour${h === 1 ? '' : 's'} ago`; }
  const d = Math.floor(minutes / 1440);
  return `Synced ${d} day${d === 1 ? '' : 's'} ago`;
};

export async function inventoryKpis(tx: Tx, vendorId: string, vctx: VendorCtx, o: { warehouseId?: string; thresholds: Thresholds }, now = new Date()) {
  const cte = lxCte({ vendorId, defaultLeadDays: vctx.defaultLeadDays, lowStockThreshold: vctx.lowStockThreshold, agingDays: o.thresholds.agingDays, warehouseId: o.warehouseId });
  const [a] = await rows(tx, sql`${cte} select
      count(*)::int skus, coalesce(sum(available), 0)::int units, coalesce(sum(on_hand), 0)::int on_hand, coalesce(sum(reserved), 0)::int reserved, coalesce(sum(incoming), 0)::int incoming,
      count(*) filter (where stock_status = 'healthy')::int healthy, count(*) filter (where stock_status = 'low_stock')::int low,
      count(*) filter (where stock_status = 'out_of_stock')::int out, count(*) filter (where stock_status = 'excess')::int excess, count(*) filter (where is_risk)::int risk,
      coalesce(sum(on_hand::bigint * cost) filter (where cost is not null), 0)::bigint valuation,
      count(*) filter (where cost is not null and on_hand > 0)::int costed, count(*) filter (where cost is null and on_hand > 0)::int uncosted
    from lx`);
  const advice = await rows(tx, sql`${cte} select sku, title, available, cover, lead from lx where is_risk and available > 0 order by cover asc, variant_id limit 3`);
  const [untracked] = o.warehouseId ? [{ c: 0 }] : await rows(tx, sql`select count(*)::int c from product_variants v
    where v.vendor_id = ${vendorId}::uuid and v.deleted_at is null and v.status = 'active'
      and not exists (select 1 from inventory i join warehouses w on w.id = i.warehouse_id and w.vendor_id = i.vendor_id where i.vendor_id = v.vendor_id and i.variant_id = v.id and w.status = 'active' and w.deleted_at is null)`);
  const [vendor] = await tx.select({ currency: schema.vendors.currency }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));

  const sync = await channelSync(tx, vendorId, { master: await masterSummary(tx, vendorId) });
  const connected = sync.channels.filter((c) => c.state !== 'not_connected');
  const lastSuccessAt = sync.operations.lastSuccessAt;
  const minutes = lastSuccessAt ? Math.max(0, Math.floor((now.getTime() - new Date(lastSuccessAt).getTime()) / 60_000)) : null;
  const state = connected.length === 0 ? 'not_connected' : minutes === null ? 'never_synced' : sync.operations.failed.channels > 0 ? 'failed' : minutes <= FRESH_SYNC_MINUTES ? 'fresh' : 'stale';

  const low = n(a!.low);
  const risk = n(a!.risk);
  const names = advice.slice(0, 2).map((r) => String(r.title));
  return {
    asOf: now.toISOString(), mode: vctx.mode, warehouseId: o.warehouseId ?? null,
    totals: { skus: n(a!.skus), unitsAvailable: n(a!.units), unitsOnHand: n(a!.on_hand), unitsReserved: n(a!.reserved), unitsIncoming: n(a!.incoming), untrackedSkus: n(untracked?.c) },
    health: { healthy: n(a!.healthy), lowStock: low, outOfStock: n(a!.out), excess: n(a!.excess) },
    stockoutRiskCount: risk,
    valuation: { amountMinor: n(a!.valuation), currency: (vendor?.currency ?? 'INR').trim(), basis: 'cost' as const, skusCosted: n(a!.costed), skusWithoutCost: n(a!.uncosted) },
    channelSync: {
      state: state as 'fresh' | 'stale' | 'failed' | 'never_synced' | 'not_connected', lastSuccessAt, minutesSinceLastSuccess: minutes, label: connected.length ? syncLabel(minutes) : 'No channel connected',
      connectedChannels: connected.length, syncingChannels: sync.operations.syncing.channels, failedChannels: sync.operations.failed.channels, skusNeedingReview: sync.operations.requireReview.skus,
    },
    reorder: {
      show: low > 0 || risk > 0, recommendationOnly: true as const,
      title: low > 0 ? `${low} product${low === 1 ? ' is' : 's are'} approaching their critical stock thresholds` : advisoryText(risk),
      text: advice.length
        ? `${names.join(' and ')} ${names.length === 1 ? 'is' : 'are'} expected to run out before the replenishment lead time (${advice.slice(0, 2).map((r) => `${Math.round(n(r.cover) * 10) / 10} days of cover vs ${n(r.lead)}-day lead time`).join('; ')}).`
        : 'Review the low stock items and plan a replenishment.',
      lowStockCount: low, stockoutRiskCount: risk,
      items: advice.map((r) => ({ sku: String(r.sku), title: String(r.title), available: n(r.available), coverDays: Math.round(n(r.cover) * 10) / 10, leadTimeDays: n(r.lead) })),
      href: low > 0 ? '/inventory?filter[stockStatus]=low_stock' : '/inventory?filter[health]=stockout_risk',
    },
  };
}

// ================================================================================================
// movement feed
// ================================================================================================
export const FEED_KINDS = ['order_deduction', 'order_release', 'inward', 'transfer', 'manual_adjustment', 'damage', 'return', 'quarantine'] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

const TYPE_KIND: Record<(typeof schema.MOVEMENT_TYPES)[number], { kind: FeedKind; label: string }> = {
  reserve: { kind: 'order_deduction', label: 'Order reserved' }, commit: { kind: 'order_deduction', label: 'Order dispatched' }, release: { kind: 'order_release', label: 'Reservation released' },
  receive: { kind: 'inward', label: 'Stock received' }, incoming_receive: { kind: 'inward', label: 'Incoming stock received' }, incoming_add: { kind: 'inward', label: 'Stock on the way' },
  transfer_out: { kind: 'transfer', label: 'Transferred out' }, transfer_in: { kind: 'transfer', label: 'Transferred in' },
  adjust: { kind: 'manual_adjustment', label: 'Manual adjustment' }, count: { kind: 'manual_adjustment', label: 'Stock count' }, undamage: { kind: 'manual_adjustment', label: 'Restored from damaged' },
  damage: { kind: 'damage', label: 'Marked damaged' }, return_in: { kind: 'return', label: 'Customer return received' }, return_restock: { kind: 'return', label: 'Return restocked' },
  quarantine: { kind: 'quarantine', label: 'Moved to quarantine' }, quarantine_release: { kind: 'quarantine', label: 'Released from quarantine' },
};
const KIND_TYPES = (kind: FeedKind): string[] => Object.entries(TYPE_KIND).filter(([, v]) => v.kind === kind).map(([t]) => t);

export type FeedBucket = 'available' | 'incoming' | 'returned' | 'damaged' | 'quarantined';
/**
 * The signed number the screen shows for a movement: the change in SELLABLE stock (on hand - reserved) when there is one, otherwise the
 * change of the bucket the movement is about (incoming, returned, damaged, quarantined).
 */
export function signedQuantity(m: { deltaOnHand: number; deltaReserved: number; deltaIncoming: number; deltaReturned: number; deltaDamaged: number; deltaQuarantined: number }): { quantity: number; bucket: FeedBucket } {
  const sellable = m.deltaOnHand - m.deltaReserved;
  if (sellable !== 0) return { quantity: sellable, bucket: 'available' };
  if (m.deltaIncoming !== 0) return { quantity: m.deltaIncoming, bucket: 'incoming' };
  if (m.deltaReturned !== 0) return { quantity: m.deltaReturned, bucket: 'returned' };
  if (m.deltaDamaged !== 0) return { quantity: m.deltaDamaged, bucket: 'damaged' };
  if (m.deltaQuarantined !== 0) return { quantity: m.deltaQuarantined, bucket: 'quarantined' };
  return { quantity: 0, bucket: 'available' };
}

export interface FeedQuery { limit: number; cursor?: number; variantId?: string; warehouseId?: string; kind?: FeedKind; q?: string; from?: Date; to?: Date }

export async function movementFeed(tx: Tx, vendorId: string, q: FeedQuery) {
  const M = schema.inventoryMovements;
  const like = q.q ? `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const kindTypes = q.kind ? KIND_TYPES(q.kind) : null;
  const rs = await tx
    .select({ m: M, sku: V.sku, title: schema.products.title, whName: W.name })
    .from(M)
    .innerJoin(V, and(eq(V.id, M.variantId), eq(V.vendorId, M.vendorId)))
    .innerJoin(schema.products, and(eq(schema.products.id, V.productId), eq(schema.products.vendorId, V.vendorId)))
    .innerJoin(W, and(eq(W.id, M.warehouseId), eq(W.vendorId, M.vendorId)))
    .where(and(
      eq(M.vendorId, vendorId), q.cursor ? sql`${M.id} < ${q.cursor}` : undefined, q.variantId ? eq(M.variantId, q.variantId) : undefined, q.warehouseId ? eq(M.warehouseId, q.warehouseId) : undefined,
      kindTypes ? inArray(M.type, kindTypes) : undefined, q.from ? sql`${M.createdAt} >= ${q.from.toISOString()}::timestamptz` : undefined, q.to ? sql`${M.createdAt} <= ${q.to.toISOString()}::timestamptz` : undefined,
      like ? sql`(${V.sku} ILIKE ${like} OR ${schema.products.title} ILIKE ${like})` : undefined,
    ))
    .orderBy(sql`${M.id} DESC`)
    .limit(q.limit + 1);
  const hasMore = rs.length > q.limit;
  const page = hasMore ? rs.slice(0, q.limit) : rs;

  // batched lookups: order / transfer numbers and operator names
  const idsOf = (type: string) => [...new Set(page.filter((r) => r.m.referenceType === type && r.m.referenceId && UUID.test(r.m.referenceId)).map((r) => r.m.referenceId!))];
  const orderIds = idsOf('order');
  const transferIds = idsOf('transfer');
  const userIds = [...new Set(page.filter((r) => r.m.actorType === 'user' && r.m.actorId && UUID.test(r.m.actorId)).map((r) => r.m.actorId!))];
  const orderNo = new Map<string, string>();
  const transferNo = new Map<string, string>();
  const userName = new Map<string, string>();
  if (orderIds.length) for (const o of await tx.select({ id: schema.orders.id, no: schema.orders.orderNumber }).from(schema.orders).where(and(eq(schema.orders.vendorId, vendorId), inArray(schema.orders.id, orderIds)))) orderNo.set(o.id, o.no);
  if (transferIds.length) for (const t of await tx.select({ id: schema.stockTransfers.id, no: schema.stockTransfers.number }).from(schema.stockTransfers).where(and(eq(schema.stockTransfers.vendorId, vendorId), inArray(schema.stockTransfers.id, transferIds)))) transferNo.set(t.id, t.no);
  if (userIds.length) for (const u of await tx.select({ id: schema.users.id, name: schema.users.fullName }).from(schema.users).where(and(eq(schema.users.vendorId, vendorId), inArray(schema.users.id, userIds)))) userName.set(u.id, u.name);

  const items = page.map(({ m, sku, title, whName }) => {
    const info = TYPE_KIND[m.type as (typeof schema.MOVEMENT_TYPES)[number]] ?? { kind: 'manual_adjustment' as FeedKind, label: 'Stock movement' };
    const sq = signedQuantity(m);
    const refLabel = m.referenceType === 'order' ? orderNo.get(m.referenceId ?? '') ?? null : m.referenceType === 'transfer' ? transferNo.get(m.referenceId ?? '') ?? null : null;
    const operatorName = m.actorType === 'user' ? userName.get(m.actorId ?? '') ?? 'Team member' : m.actorType === 'api_key' ? 'API key' : m.actorType === 'webhook' ? 'Marketplace' : 'System';
    return {
      id: m.id, at: m.createdAt.toISOString(), variantId: m.variantId, sku, productTitle: title, warehouse: { id: m.warehouseId, name: whName },
      type: info.kind, typeLabel: info.label, movementType: m.type as (typeof schema.MOVEMENT_TYPES)[number],
      quantityDelta: sq.quantity, quantityBucket: sq.bucket, resultingAvailable: m.onHandAfter - m.reservedAfter, resultingOnHand: m.onHandAfter,
      reference: m.referenceType ? { type: m.referenceType, id: m.referenceId, label: refLabel } : null, reason: m.reason,
      operator: { type: m.actorType as 'user' | 'api_key' | 'system' | 'webhook', id: m.actorId, name: operatorName },
    };
  });
  return { items, nextCursor: hasMore ? String(page[page.length - 1]!.m.id) : null };
}

// ================================================================================================
// quick adjust (SKU or variant, default warehouse, the reasons of the screen)
// ================================================================================================
export const QUICK_REASONS = ['audit_correction', 'damaged', 'shrinkage', 'manual_addition'] as const;
export type QuickReason = (typeof QUICK_REASONS)[number];
const REASON_TEXT: Record<QuickReason, string> = { audit_correction: 'Physical audit correction', damaged: 'Damaged in transit / inspection', shrinkage: 'Inventory shrinkage', manual_addition: 'Manual inward stock addition' };

/**
 * Maps the screen reason + signed delta to one existing adjustment type. audit_correction goes both ways (correction), damaged moves
 * sellable units to the damaged bucket (decrease only), shrinkage is a loss (decrease only), manual_addition adds stock (increase only).
 */
export function adjustmentFor(reason: QuickReason, delta: number, notes?: string | null): Pick<AdjustmentInput, 'type' | 'direction' | 'quantity' | 'reason' | 'note'> {
  const bad = (message: string, rule: string) => new AppError('BAD_REQUEST', message, { details: { rule } });
  if (!Number.isInteger(delta) || delta === 0) throw bad('quantityDelta must be a non-zero whole number', 'delta_non_zero');
  const base = { quantity: Math.abs(delta), reason: REASON_TEXT[reason], note: notes ?? null };
  switch (reason) {
    case 'audit_correction': return { ...base, type: 'correction', direction: delta > 0 ? 'increase' : 'decrease' };
    case 'damaged':
      if (delta > 0) throw bad('Damaged stock reduces sellable stock: use a negative quantityDelta', 'damaged_requires_decrease');
      return { ...base, type: 'damage', direction: 'decrease' };
    case 'shrinkage':
      if (delta > 0) throw bad('Shrinkage is a loss: use a negative quantityDelta', 'shrinkage_requires_decrease');
      return { ...base, type: 'manual', direction: 'decrease' };
    case 'manual_addition':
      if (delta < 0) throw bad('A manual addition needs a positive quantityDelta', 'addition_requires_increase');
      return { ...base, type: 'manual', direction: 'increase' };
  }
}

/** resolves `variantId` or `sku` (case-insensitive) to one live variant of the business */
export async function resolveVariant(tx: Tx, vendorId: string, ref: { variantId?: string; sku?: string }): Promise<{ id: string; sku: string; title: string }> {
  if (!ref.variantId === !ref.sku) throw new AppError('BAD_REQUEST', 'Provide exactly one of variantId or sku', { details: { rule: 'variant_ref' } });
  const [v] = await tx.select({ id: V.id, sku: V.sku, title: schema.products.title }).from(V)
    .innerJoin(schema.products, and(eq(schema.products.id, V.productId), eq(schema.products.vendorId, V.vendorId)))
    .where(and(eq(V.vendorId, vendorId), isNull(V.deletedAt), ref.variantId ? eq(V.id, ref.variantId) : sql`lower(${V.sku}) = lower(${ref.sku!})`));
  if (!v) throw Errors.notFound('Variant', ref.variantId ?? ref.sku);
  return v;
}

/** the warehouse an operation uses when none is given: the default one, else the first active by priority */
export async function defaultWarehouseId(tx: Tx, vendorId: string): Promise<string> {
  const w = (await allocationOrder(tx, vendorId))[0];
  if (!w) throw new AppError('CONFLICT', 'The business has no active warehouse', { details: { rule: 'no_active_warehouse' } });
  return w.id;
}

/** validates the request and resolves it to one adjustment on one location (nothing is written yet) */
export async function planQuickAdjust(tx: Tx, vendorId: string, b: { variantId?: string; sku?: string; warehouseId?: string; reason: QuickReason; quantityDelta: number; notes?: string | null}) {
  const adj = adjustmentFor(b.reason, b.quantityDelta, b.notes);
  const variant = await resolveVariant(tx, vendorId, b);
  const warehouseId = b.warehouseId ?? (await defaultWarehouseId(tx, vendorId));
  return { variant, warehouseId, adjustment: adj as Pick<AdjustmentInput, 'type' | 'direction' | 'quantity' | 'reason' | 'note'> };
}

export async function stockRow(tx: Tx, vendorId: string, variantId: string, warehouseId: string) {
  const overview = await variantOverview(tx, vendorId, variantId);
  return { totals: overview.totals, row: overview.warehouses.find((w) => w.warehouseId === warehouseId) ?? null };
}

// ================================================================================================
// immediate transfer
// ================================================================================================
/**
 * Moves stock between two warehouses right now. It is a real transfer document (draft -> shipped -> received in ONE transaction), so the
 * ledger shows the usual transfer_out / incoming / receive movements and the numbering and audit stay the same as for staged transfers.
 * It never goes below what is reserved at the source (the ledger refuses).
 */
export async function transferNow(tx: Tx, vendorId: string, actor: Actor, b: { variantId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number; notes?: string | null }) {
  if (b.fromWarehouseId === b.toWarehouseId) throw new AppError('BAD_REQUEST', 'Source and destination must differ', { details: { rule: 'same_warehouse' } });
  const draft = await createTransfer(tx, vendorId, { fromWarehouseId: b.fromWarehouseId, toWarehouseId: b.toWarehouseId, items: [{ variantId: b.variantId, quantity: b.quantity }], notes: b.notes ?? null });
  await shipTransfer(tx, vendorId, draft.t.id, actor);
  return receiveTransfer(tx, vendorId, draft.t.id, undefined, actor);
}
