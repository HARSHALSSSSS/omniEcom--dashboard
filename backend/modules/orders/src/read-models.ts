import { and, eq, schema, sql, withVendor, type Tx } from '@oms/database';
import { canManualTransition, MANUAL_NEXT, type InternalOrderStatus } from '@oms/marketplace-core';
import { AppError, Errors } from '@oms/shared';
import { moveReservation, reservationsForOrder } from '@oms/mod-inventory';
import { effects, type OpCtx } from '@oms/module-kit';
import { localDay, loadSlaConfig, recomputeDispatchDue } from './sla';
import { FULFILLMENT_OWNED, getOrderRow } from './status';
import { transitionOrder } from './service';
import { dayRange, predicates, TAB_KEYS } from './workspace';

/**
 * Read models and bulk actions for the Orders screen: the tab / SLA / today numbers, the allowed next steps of one order (aware of
 * fulfillment ownership) and bulk confirm / cancel / assign warehouse / mark priority with per-order results.
 */
type Row = Record<string, unknown>;
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const rowsOf = async (tx: Tx, q: ReturnType<typeof sql>): Promise<Row[]> => (await tx.execute<Row>(q)).rows;
const PRE_DISPATCH = ['new', 'confirmed', 'picking', 'packed', 'ready_to_dispatch'] as const;
export const ALL_STATUSES = ['new', 'confirmed', 'picking', 'packed', 'ready_to_dispatch', 'dispatched', 'in_transit', 'delivered', 'cancelled', 'returned'] as const;
/** a priority flag lives in the order's attention reasons (`;` separated); there is no separate column */
export const PRIORITY_TOKEN = 'priority';
export const hasPriority = (attentionReason: string | null): boolean => (attentionReason ?? '').split(';').includes(PRIORITY_TOKEN);

// ================================================================================================
// summary numbers
// ================================================================================================
export async function summaryExtras(tx: Tx, vendorId: string, asOf: string | undefined, now = new Date()) {
  const cfg = await loadSlaConfig(tx, vendorId);
  const day = asOf ?? localDay(now, cfg.timezone);
  const range = dayRange(day, cfg.timezone, now);
  const P = predicates(now, cfg);
  const base = sql`o.vendor_id = ${vendorId}::uuid`;
  const today = sql`o.placed_at >= ${range.from.toISOString()}::timestamptz AND o.placed_at < ${range.to.toISOString()}::timestamptz`;
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [c] = await rowsOf(tx, sql`SELECT
      ${sql.join(ALL_STATUSES.map((s) => sql`count(*) FILTER (WHERE o.status = ${s})::int AS ${sql.raw(`s_${s}`)}`), sql`, `)},
      count(*)::int AS total,
      count(*) FILTER (WHERE ${P.band} = 'safe')::int AS b_safe, count(*) FILTER (WHERE ${P.band} = 'approaching')::int AS b_approaching,
      count(*) FILTER (WHERE ${P.band} = 'at_risk')::int AS b_at_risk, count(*) FILTER (WHERE ${P.band} = 'breached')::int AS b_breached,
      count(*) FILTER (WHERE ${today})::int AS today_orders, count(*) FILTER (WHERE ${today} AND o.status = 'new')::int AS today_new,
      coalesce(sum(o.total_minor) FILTER (WHERE ${today} AND o.status NOT IN ('cancelled','returned')), 0)::bigint AS today_revenue,
      count(*) FILTER (WHERE o.placed_at >= ${since}::timestamptz)::int AS w_orders, count(*) FILTER (WHERE o.placed_at >= ${since}::timestamptz AND o.status = 'cancelled')::int AS w_cancelled,
      avg(extract(epoch FROM (o.dispatched_at - o.placed_at)) / 3600.0) FILTER (WHERE o.dispatched_at IS NOT NULL AND o.dispatched_at >= ${since}::timestamptz) AS avg_hours,
      ${sql.join(TAB_KEYS.map((k) => sql`count(*) FILTER (WHERE ${P.tabs[k]})::int AS ${sql.raw(`t_${k}`)}`), sql`, `)}
    FROM orders o WHERE ${base}`);
  const [vendor] = await tx.select({ currency: schema.vendors.currency }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const statusCounts: Record<string, number> = {};
  for (const s of ALL_STATUSES) statusCounts[s] = num(c?.[`s_${s}`]);
  const windowOrders = num(c?.w_orders);
  const avg = c?.avg_hours === null || c?.avg_hours === undefined ? null : Math.round(Number(c.avg_hours) * 10) / 10;
  return {
    asOf: day, statusCounts: statusCounts as Record<(typeof ALL_STATUSES)[number], number>,
    tabs: { all: num(c?.t_all), needsAttention: num(c?.t_needs_attention), new: num(c?.t_new), processing: num(c?.t_processing), shipped: num(c?.t_shipped), delivered: num(c?.t_delivered), returnsDisputes: num(c?.t_returns_disputes) },
    sla: { safe: num(c?.b_safe), approaching: num(c?.b_approaching), atRisk: num(c?.b_at_risk), breached: num(c?.b_breached), atRiskMinutes: cfg.atRiskMinutes, approachingMinutes: cfg.approachingMinutes },
    today: { orders: num(c?.today_orders), newOrders: num(c?.today_new), revenueMinor: num(c?.today_revenue), currency: (vendor?.currency ?? 'INR').trim() },
    pendingDispatchCount: PRE_DISPATCH.reduce((n, s) => n + statusCounts[s]!, 0),
    avgFulfillmentHours: avg,
    cancellationRatePct: windowOrders > 0 ? Math.round((num(c?.w_cancelled) / windowOrders) * 1000) / 10 : null,
    windowDays: 30,
  };
}

// ================================================================================================
// next actions of one order
// ================================================================================================
export interface NextAction {
  key: string; label: string; kind: 'transition' | 'cancel' | 'allocate' | 'fulfillment'; method: 'GET' | 'POST'; href: string; body: Record<string, unknown> | null;
  enabled: boolean; disabledReason: string | null; message: string | null; useInstead: { key: string; href: string } | null;
}

const TRANSITION_LABEL: Partial<Record<InternalOrderStatus, string>> = {
  confirmed: 'Confirm order', picking: 'Start picking', packed: 'Mark as packed', ready_to_dispatch: 'Ready to dispatch', dispatched: 'Dispatch', in_transit: 'Mark in transit', delivered: 'Mark delivered', returned: 'Mark returned',
};
const REASON_TEXT: Record<string, string> = {
  managed_by_fulfillment: 'This order is being fulfilled: its status follows the warehouse work (pick, pack, ship). Use the fulfillment actions instead.',
  permission_required: 'Your role cannot change orders.',
  no_unallocated_stock: 'Every line already holds its stock.',
};

export async function nextActions(tx: Tx, vendorId: string, orderId: string, canWrite: boolean) {
  const o = await getOrderRow(tx, vendorId, orderId);
  const F = schema.fulfillments;
  const live = (await tx.select({ id: F.id, number: F.number, status: F.status }).from(F).where(and(eq(F.vendorId, vendorId), eq(F.orderId, orderId), sql`${F.status} <> 'cancelled'`)).orderBy(sql`${F.createdAt} DESC`).limit(1))[0] ?? null;
  const status = o.status as InternalOrderStatus;
  const fHref = live ? `/api/v1/fulfillments/${live.id}` : null;
  const actions: NextAction[] = [];
  const act = (a: Omit<NextAction, 'message' | 'useInstead'> & { useInstead?: NextAction['useInstead'] }) => actions.push({ ...a, message: a.disabledReason ? REASON_TEXT[a.disabledReason] ?? null : null, useInstead: a.useInstead ?? null });

  for (const to of MANUAL_NEXT[status].filter((s) => s !== 'cancelled')) {
    const managed = !!live && FULFILLMENT_OWNED.includes(to);
    const reason = !canWrite ? 'permission_required' : managed ? 'managed_by_fulfillment' : null;
    act({
      key: `to_${to}`, label: TRANSITION_LABEL[to] ?? to, kind: 'transition', method: 'POST', href: `/api/v1/orders/${o.id}/transition`, body: { status: to, version: o.version },
      enabled: reason === null, disabledReason: reason, useInstead: managed && fHref ? { key: 'open_fulfillment', href: fHref } : null,
    });
  }
  if (canManualTransition(status, 'cancelled')) {
    act({ key: 'cancel', label: 'Cancel order', kind: 'cancel', method: 'POST', href: `/api/v1/orders/${o.id}/cancel`, body: { reason: '' }, enabled: canWrite, disabledReason: canWrite ? null : 'permission_required' });
  }
  const open = (PRE_DISPATCH as readonly string[]).includes(status);
  if (open && ['partial', 'unallocated', 'pending'].includes(o.inventoryStatus)) {
    act({ key: 'allocate', label: 'Allocate stock', kind: 'allocate', method: 'POST', href: `/api/v1/orders/${o.id}/allocate`, body: null, enabled: canWrite, disabledReason: canWrite ? null : 'permission_required' });
  }
  if (live && fHref) act({ key: 'open_fulfillment', label: 'Open fulfillment', kind: 'fulfillment', method: 'GET', href: fHref, body: null, enabled: true, disabledReason: null });

  const primary = actions.find((a) => a.enabled && a.kind === 'transition') ?? actions.find((a) => a.key === 'open_fulfillment') ?? null;
  return {
    orderId: o.id, orderNumber: o.orderNumber, status, version: o.version, managedByFulfillment: !!live && FULFILLMENT_OWNED.some((s) => MANUAL_NEXT[status].includes(s)),
    fulfillment: live ? { id: live.id, number: live.number, status: live.status } : null, primaryAction: primary ? primary.key : null, actions,
  };
}

// ================================================================================================
// bulk actions
// ================================================================================================
export const BULK_ORDER_MAX = 200;
export type BulkOrderAction = 'confirm' | 'cancel' | 'assign_warehouse' | 'mark_priority';
export interface BulkOrderParams { reason?: string; reasonCode?: string; warehouseId?: string; priority?: boolean }
export interface BulkOrderResult { orderId: string; orderNumber: string | null; ok: boolean; changed: boolean; status: string | null; error?: { code: string; message: string; rule?: string } }

const errOf = (e: unknown): NonNullable<BulkOrderResult['error']> => {
  if (e instanceof AppError) { const rule = (e.details as { rule?: string } | undefined)?.rule; return { code: e.code, message: e.message, ...(rule ? { rule } : {}) }; }
  throw e;
};

/** re-homes an order to another warehouse before warehouse work starts: reservations move through the ledger, the SLA is recomputed */
async function assignWarehouse(tx: Tx, ctx: OpCtx, orderId: string, warehouseId: string): Promise<{ changed: boolean; status: string }> {
  const o = await getOrderRow(tx, ctx.vendorId, orderId, true);
  if (!['new', 'confirmed'].includes(o.status)) throw new AppError('INVALID_STATE', `A ${o.status} order can no longer be moved to another warehouse`, { details: { rule: 'too_late_to_reassign', status: o.status } });
  const F = schema.fulfillments;
  const [live] = await tx.select({ id: F.id }).from(F).where(and(eq(F.vendorId, ctx.vendorId), eq(F.orderId, orderId), sql`${F.status} <> 'cancelled'`)).limit(1);
  if (live) throw new AppError('CONFLICT', 'This order is being fulfilled: the warehouse is chosen by routing', { details: { rule: 'managed_by_fulfillment', fulfillmentId: live.id } });
  const W = schema.warehouses;
  const [w] = await tx.select({ id: W.id, status: W.status }).from(W).where(and(eq(W.vendorId, ctx.vendorId), eq(W.id, warehouseId), sql`${W.deletedAt} IS NULL`));
  if (!w) throw Errors.notFound('Warehouse', warehouseId);
  if (w.status !== 'active') throw new AppError('CONFLICT', 'The warehouse is not active', { details: { rule: 'warehouse_inactive' } });
  if (o.warehouseId === warehouseId && (await reservationsForOrder(tx, ctx.vendorId, orderId)).every((r) => r.status !== 'active' || r.warehouseId === warehouseId)) return { changed: false, status: o.status };
  for (const r of (await reservationsForOrder(tx, ctx.vendorId, orderId)).filter((x) => x.status === 'active' && x.warehouseId !== warehouseId)) {
    await moveReservation(tx, { vendorId: ctx.vendorId, orderId, orderItemId: r.orderItemId, variantId: r.variantId, fromWarehouseId: r.warehouseId, toWarehouseId: warehouseId, quantity: r.quantity, actor: ctx.actor });
  }
  await tx.update(schema.orders).set({ warehouseId, version: sql`${schema.orders.version} + 1` }).where(and(eq(schema.orders.vendorId, ctx.vendorId), eq(schema.orders.id, orderId)));
  await recomputeDispatchDue(tx, ctx.vendorId, orderId, warehouseId);
  await effects(tx, ctx).audit({ action: 'order.assign_warehouse', resourceType: 'order', resourceId: orderId, before: { warehouseId: o.warehouseId }, after: { warehouseId } });
  return { changed: true, status: o.status };
}

async function markPriority(tx: Tx, ctx: OpCtx, orderId: string, priority: boolean): Promise<{ changed: boolean; status: string }> {
  const o = await getOrderRow(tx, ctx.vendorId, orderId, true);
  if (!(PRE_DISPATCH as readonly string[]).includes(o.status)) throw new AppError('INVALID_STATE', `A ${o.status} order cannot be prioritised`, { details: { rule: 'already_dispatched_or_closed', status: o.status } });
  const tokens = (o.attentionReason ?? '').split(';').filter(Boolean);
  if (tokens.includes(PRIORITY_TOKEN) === priority) return { changed: false, status: o.status };
  const next = (priority ? [...tokens, PRIORITY_TOKEN] : tokens.filter((t) => t !== PRIORITY_TOKEN)).join(';') || null;
  await tx.update(schema.orders).set({ attentionReason: next, version: sql`${schema.orders.version} + 1` }).where(and(eq(schema.orders.vendorId, ctx.vendorId), eq(schema.orders.id, orderId)));
  await effects(tx, ctx).audit({ action: priority ? 'order.mark_priority' : 'order.unmark_priority', resourceType: 'order', resourceId: orderId, before: { attentionReason: o.attentionReason }, after: { attentionReason: next } });
  return { changed: true, status: o.status };
}

/** every order is its own transaction (and marketplace push), so one failure never blocks the others; the caller answers 200 with the per-order results */
export async function bulkOrders(ctx: OpCtx, action: BulkOrderAction, ids: string[], p: BulkOrderParams) {
  const results: BulkOrderResult[] = [];
  for (const id of [...new Set(ids)]) {
    const number = (await withVendor(ctx.c.database.db, ctx.vendorId, (tx) => tx.select({ n: schema.orders.orderNumber }).from(schema.orders).where(and(eq(schema.orders.vendorId, ctx.vendorId), eq(schema.orders.id, id)))))[0]?.n ?? null;
    if (number === null) { results.push({ orderId: id, orderNumber: null, ok: false, changed: false, status: null, error: { code: 'NOT_FOUND', message: 'Order not found' } }); continue; }
    try {
      if (action === 'confirm' || action === 'cancel') {
        const res = await transitionOrder(ctx, id, action === 'confirm' ? 'confirmed' : 'cancelled', action === 'cancel' ? { cancelReason: p.reason, note: p.reason, reasonCode: p.reasonCode ?? 'other', initiator: 'seller' } : {});
        results.push({ orderId: id, orderNumber: number, ok: true, changed: true, status: res.order.status });
      } else {
        const res = await withVendor(ctx.c.database.db, ctx.vendorId, (tx) => (action === 'assign_warehouse' ? assignWarehouse(tx, ctx, id, p.warehouseId!) : markPriority(tx, ctx, id, p.priority ?? true)));
        results.push({ orderId: id, orderNumber: number, ok: true, changed: res.changed, status: res.status });
      }
    } catch (e) {
      results.push({ orderId: id, orderNumber: number, ok: false, changed: false, status: null, error: errOf(e) });
    }
  }
  return { action, total: results.length, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}
