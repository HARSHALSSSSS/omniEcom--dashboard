import { and, eq, inArray, schema, sql, type SQL, type Tx } from '@oms/database';
import { Errors } from '@oms/shared';
import { IN_WAREHOUSE } from './domain';
import { actionsFor, primaryAction, slaView, STAGE_LABELS, STAGE_STATUSES, stageOf, type SlaThresholds, type Stage } from './queue-domain';
import { fulfillmentTimeline } from './core';

const F = schema.fulfillments;
const FI = schema.fulfillmentItems;
const O = schema.orders;
const OI = schema.orderItems;
const W = schema.warehouses;
const PT = schema.pickTasks;
const PL = schema.pickLists;
const S = schema.shipments;
const X = schema.fulfillmentExceptions;
const PKG = schema.packages;
const PI = schema.packageItems;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
/** constants only, inlined as literals so the SELECT and GROUP BY copies of the stage expression are textually identical */
const list = (xs: readonly string[]) => sql.raw(xs.map((x) => `'${x}'`).join(', '));
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const LIVE_SHIPMENT = sql`${S.status} <> 'cancelled'`;
const PRIORITY_RANK = sql`(case ${F.priority} when 'urgent' then 0 when 'high' then 1 else 2 end)`;

export async function slaThresholds(tx: Tx, vendorId: string): Promise<SlaThresholds> {
  const [v] = await tx.select({ settings: schema.vendors.settings }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const s = ((v?.settings ?? {}) as { sla?: { atRiskMinutes?: number; approachingMinutes?: number } }).sla ?? {};
  return { atRiskMinutes: s.atRiskMinutes ?? 90, approachingMinutes: s.approachingMinutes ?? 240 };
}

// ------------------------------------------------------------------------------------------------
// the queue
// ------------------------------------------------------------------------------------------------
export interface QueueFilter { stage?: Stage; warehouseId?: string; carrier?: string; priority?: string; q?: string; hasException?: boolean }

/** the stage a fulfillment row is in: a held fulfillment stays in the stage it was held from */
const effectiveStatus = sql`(case when ${F.status} = 'on_hold' then ${F.holdFrom} else ${F.status} end)`;
const stageExpr = sql<Stage | null>`(case
  when ${effectiveStatus} in (${list(STAGE_STATUSES.awaiting_pick)}) then 'awaiting_pick'
  when ${effectiveStatus} in (${list(STAGE_STATUSES.picking)}) then 'picking'
  when ${effectiveStatus} in (${list(STAGE_STATUSES.packing)}) then 'packing'
  when ${effectiveStatus} in (${list(STAGE_STATUSES.ready_to_ship)}) then 'ready_to_ship' end)`;
const openException = sql`exists (select 1 from ${X} where ${X.vendorId} = ${F.vendorId} and ${X.fulfillmentId} = ${F.id} and ${X.status} = 'open')`;

function baseWhere(vendorId: string, allowed: string[] | null, f: QueueFilter): SQL[] {
  const w: SQL[] = [eq(F.vendorId, vendorId), inArray(F.status, [...IN_WAREHOUSE])];
  if (allowed) w.push(inArray(F.warehouseId, allowed.length ? allowed : [ZERO_UUID]));
  if (f.warehouseId) w.push(eq(F.warehouseId, f.warehouseId));
  if (f.priority) w.push(eq(F.priority, f.priority));
  if (f.carrier) {
    w.push(sql`exists (select 1 from ${S} where ${S.vendorId} = ${F.vendorId} and ${S.fulfillmentId} = ${F.id} and ${LIVE_SHIPMENT} and (lower(${S.carrier}) = lower(${f.carrier}) or ${S.providerCode} = ${f.carrier}))`);
  }
  if (f.hasException) w.push(openException);
  if (f.q?.trim()) {
    const like = `%${escapeLike(f.q.trim())}%`;
    w.push(sql`(${F.number} ilike ${like} or ${O.orderNumber} ilike ${like} or ${O.externalOrderId} ilike ${like} or exists (select 1 from ${FI} join ${OI} on ${OI.id} = ${FI.orderItemId} and ${OI.vendorId} = ${FI.vendorId} where ${FI.vendorId} = ${F.vendorId} and ${FI.fulfillmentId} = ${F.id} and (${OI.sku} ilike ${like} or ${OI.title} ilike ${like})))`);
  }
  return w;
}

const joined = (tx: Tx) => tx.select({
  f: F,
  stage: stageExpr,
  o: { orderNumber: O.orderNumber, marketplace: O.marketplace, accountId: O.marketplaceAccountId, status: O.status, dispatchDueAt: O.dispatchDueAt, placedAt: O.placedAt, paymentMethod: O.paymentMethod, buyer: O.buyer, shippingAddress: O.shippingAddress },
  wh: { code: W.code, name: W.name },
  account: schema.marketplaceAccounts.displayName,
}).from(F)
  .innerJoin(O, and(eq(O.id, F.orderId), eq(O.vendorId, F.vendorId)))
  .innerJoin(W, and(eq(W.id, F.warehouseId), eq(W.vendorId, F.vendorId)))
  .leftJoin(schema.marketplaceAccounts, and(eq(schema.marketplaceAccounts.id, O.marketplaceAccountId), eq(schema.marketplaceAccounts.vendorId, O.vendorId)));

type QueueRow = Awaited<ReturnType<ReturnType<typeof joined>['limit']>>[number];

export async function stageCounts(tx: Tx, vendorId: string, allowed: string[] | null, f: QueueFilter) {
  const rows = await tx.select({ stage: stageExpr, n: sql<number>`count(*)::int`, held: sql<number>`(count(*) filter (where ${F.status} = 'on_hold'))::int`, exceptions: sql<number>`(count(*) filter (where ${openException}))::int` })
    .from(F).innerJoin(O, and(eq(O.id, F.orderId), eq(O.vendorId, F.vendorId)))
    .where(and(...baseWhere(vendorId, allowed, { ...f, stage: undefined }))).groupBy(stageExpr);
  const out: Record<Stage | 'all' | 'onHold' | 'exceptions' | 'packed' | 'dispatchedToday', number> = { awaiting_pick: 0, picking: 0, packing: 0, ready_to_ship: 0, all: 0, onHold: 0, exceptions: 0, packed: 0, dispatchedToday: 0 };
  for (const r of rows) {
    if (r.stage) out[r.stage] += r.n;
    out.all += r.n; out.onHold += r.held; out.exceptions += r.exceptions;
  }
  // 'packed' is a real status (inside the ready_to_ship stage): packed but not yet handed to a carrier
  const [packed] = await tx.select({ n: sql<number>`count(*)::int` }).from(F).innerJoin(O, and(eq(O.id, F.orderId), eq(O.vendorId, F.vendorId)))
    .where(and(...baseWhere(vendorId, allowed, { ...f, stage: undefined }), eq(F.status, 'packed')));
  out.packed = packed?.n ?? 0;
  // handed over today: fulfillments that moved to 'shipped' since midnight (UTC)
  const E = schema.fulfillmentEvents;
  const [shipped] = await tx.select({ n: sql<number>`count(distinct ${E.fulfillmentId})::int` }).from(E)
    .innerJoin(F, and(eq(F.id, E.fulfillmentId), eq(F.vendorId, E.vendorId)))
    .where(and(eq(E.vendorId, vendorId), eq(E.toStatus, 'shipped'), sql`${E.createdAt} >= date_trunc('day', now())`, allowed ? inArray(F.warehouseId, allowed.length ? allowed : [ZERO_UUID]) : undefined));
  out.dispatchedToday = shipped?.n ?? 0;
  return out;
}

/** the latest status changes across the open fulfillments of the allowed warehouses, newest first (the activity strip of the Fulfillment screen) */
export async function recentActivity(tx: Tx, vendorId: string, allowed: string[] | null, limit: number) {
  const E = schema.fulfillmentEvents;
  const rows = await tx.select({ e: E, number: F.number, orderId: F.orderId, orderNumber: O.orderNumber }).from(E)
    .innerJoin(F, and(eq(F.id, E.fulfillmentId), eq(F.vendorId, E.vendorId)))
    .innerJoin(O, and(eq(O.id, F.orderId), eq(O.vendorId, F.vendorId)))
    .where(and(eq(E.vendorId, vendorId), allowed ? inArray(F.warehouseId, allowed.length ? allowed : [ZERO_UUID]) : undefined))
    .orderBy(sql`${E.id} desc`).limit(limit);
  const names = await userNames(tx, vendorId, rows.map((r) => r.e.actorId));
  return rows.map((r) => ({
    id: r.e.id, fulfillmentId: r.e.fulfillmentId, fulfillmentNumber: r.number, orderId: r.orderId, orderNumber: r.orderNumber,
    from: r.e.fromStatus, to: r.e.toStatus, note: r.e.note, at: r.e.createdAt.toISOString(), actor: r.e.actorId ? { id: r.e.actorId, name: names.get(r.e.actorId) ?? null } : null,
  }));
}

interface ItemLine { id: string; orderItemId: string; variantId: string; sku: string; title: string; barcode: string | null; quantity: number; pickedQuantity: number; packedQuantity: number; shortQuantity: number; fulfillmentId: string }

async function loadItems(tx: Tx, vendorId: string, fulfillmentIds: string[]): Promise<Map<string, ItemLine[]>> {
  const out = new Map<string, ItemLine[]>();
  if (!fulfillmentIds.length) return out;
  const rows = await tx.select({ i: FI, sku: OI.sku, title: OI.title, barcode: schema.productVariants.barcode }).from(FI)
    .innerJoin(OI, and(eq(OI.id, FI.orderItemId), eq(OI.vendorId, FI.vendorId)))
    .innerJoin(schema.productVariants, and(eq(schema.productVariants.id, FI.variantId), eq(schema.productVariants.vendorId, FI.vendorId)))
    .where(and(eq(FI.vendorId, vendorId), inArray(FI.fulfillmentId, fulfillmentIds))).orderBy(FI.createdAt, FI.id);
  for (const r of rows) {
    const line: ItemLine = { id: r.i.id, orderItemId: r.i.orderItemId, variantId: r.i.variantId, sku: r.sku, title: r.title, barcode: r.barcode, quantity: r.i.quantity, pickedQuantity: r.i.pickedQuantity, packedQuantity: r.i.packedQuantity, shortQuantity: r.i.shortQuantity, fulfillmentId: r.i.fulfillmentId };
    const l = out.get(line.fulfillmentId); if (l) l.push(line); else out.set(line.fulfillmentId, [line]);
  }
  return out;
}

interface TaskInfo { id: string; fulfillmentId: string; fulfillmentItemId: string; status: string; verified: boolean; quantity: number; pickedQuantity: number; binCode: string | null; sequence: number; pickList: { id: string; number: string; assignedTo: string | null; status: string } }

async function loadTasks(tx: Tx, vendorId: string, fulfillmentIds: string[]): Promise<Map<string, TaskInfo[]>> {
  const out = new Map<string, TaskInfo[]>();
  if (!fulfillmentIds.length) return out;
  const rows = await tx.select({ t: PT, binCode: schema.warehouseBins.code, pl: { id: PL.id, number: PL.number, assignedTo: PL.assignedTo, status: PL.status } }).from(PT)
    .innerJoin(PL, and(eq(PL.id, PT.pickListId), eq(PL.vendorId, PT.vendorId)))
    .leftJoin(schema.warehouseBins, and(eq(schema.warehouseBins.id, PT.binId), eq(schema.warehouseBins.vendorId, PT.vendorId)))
    .where(and(eq(PT.vendorId, vendorId), inArray(PT.fulfillmentId, fulfillmentIds), sql`${PT.status} <> 'cancelled'`)).orderBy(PT.sequence, PT.id);
  for (const r of rows) {
    const info: TaskInfo = { id: r.t.id, fulfillmentId: r.t.fulfillmentId, fulfillmentItemId: r.t.fulfillmentItemId, status: r.t.status, verified: r.t.verified, quantity: r.t.quantity, pickedQuantity: r.t.pickedQuantity, binCode: r.binCode, sequence: r.t.sequence, pickList: r.pl };
    const l = out.get(info.fulfillmentId); if (l) l.push(info); else out.set(info.fulfillmentId, [info]);
  }
  return out;
}

/** for an item with no pick task yet: the bin holding most of its stock in that warehouse (a suggestion, not a reservation) */
async function suggestedBins(tx: Tx, vendorId: string, pairs: Array<{ variantId: string; warehouseId: string }>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!pairs.length) return out;
  const rows = await tx.select({ variantId: schema.binStock.variantId, warehouseId: schema.binStock.warehouseId, quantity: schema.binStock.quantity, code: schema.warehouseBins.code }).from(schema.binStock)
    .innerJoin(schema.warehouseBins, and(eq(schema.warehouseBins.id, schema.binStock.binId), eq(schema.warehouseBins.vendorId, schema.binStock.vendorId)))
    .where(and(eq(schema.binStock.vendorId, vendorId), inArray(schema.binStock.variantId, [...new Set(pairs.map((p) => p.variantId))]), inArray(schema.binStock.warehouseId, [...new Set(pairs.map((p) => p.warehouseId))]), sql`${schema.binStock.quantity} > 0`))
    .orderBy(sql`${schema.binStock.quantity} desc`, schema.warehouseBins.code);
  for (const r of rows) { const k = `${r.variantId}:${r.warehouseId}`; if (!out.has(k)) out.set(k, r.code); }
  return out;
}

async function loadShipments(tx: Tx, vendorId: string, fulfillmentIds: string[]) {
  const out = new Map<string, typeof S.$inferSelect>();
  if (!fulfillmentIds.length) return out;
  const rows = await tx.select().from(S).where(and(eq(S.vendorId, vendorId), inArray(S.fulfillmentId, fulfillmentIds), LIVE_SHIPMENT)).orderBy(S.createdAt);
  for (const s of rows) out.set(s.fulfillmentId, s);
  return out;
}

async function openExceptionCounts(tx: Tx, vendorId: string, fulfillmentIds: string[]): Promise<Map<string, number>> {
  if (!fulfillmentIds.length) return new Map();
  const rows = await tx.select({ id: X.fulfillmentId, n: sql<number>`count(*)::int` }).from(X).where(and(eq(X.vendorId, vendorId), eq(X.status, 'open'), inArray(X.fulfillmentId, fulfillmentIds))).groupBy(X.fulfillmentId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** units of each fulfillment that are picked but not yet in a live package */
async function unpackedUnits(tx: Tx, vendorId: string, items: Map<string, ItemLine[]>): Promise<Map<string, number>> {
  const ids = [...items.keys()];
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const assigned = await tx.select({ id: PI.fulfillmentItemId, n: sql<number>`coalesce(sum(${PI.quantity}), 0)::int` }).from(PI)
    .innerJoin(PKG, and(eq(PKG.id, PI.packageId), eq(PKG.vendorId, PI.vendorId))).where(and(eq(PI.vendorId, vendorId), inArray(PKG.fulfillmentId, ids), inArray(PKG.status, ['open', 'packed', 'shipped']))).groupBy(PI.fulfillmentItemId);
  const by = new Map(assigned.map((a) => [a.id, a.n]));
  for (const [fid, lines] of items) out.set(fid, lines.reduce((n, l) => n + Math.max(0, l.pickedQuantity - (by.get(l.id) ?? 0)), 0));
  return out;
}

async function userNames(tx: Tx, vendorId: string, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)))];
  if (!uniq.length) return new Map();
  const rows = await tx.select({ id: schema.users.id, name: schema.users.fullName }).from(schema.users).where(and(eq(schema.users.vendorId, vendorId), inArray(schema.users.id, uniq)));
  return new Map(rows.map((u) => [u.id, u.name]));
}

const pickState = (l: Pick<ItemLine, 'quantity' | 'pickedQuantity' | 'shortQuantity'>): 'pending' | 'partial' | 'picked' | 'short' =>
  l.shortQuantity > 0 && l.pickedQuantity + l.shortQuantity >= l.quantity ? 'short' : l.pickedQuantity >= l.quantity ? 'picked' : l.pickedQuantity > 0 ? 'partial' : 'pending';

interface Context {
  th: SlaThresholds;
  items: Map<string, ItemLine[]>;
  tasks: Map<string, TaskInfo[]>;
  shipments: Map<string, typeof S.$inferSelect>;
  exceptions: Map<string, number>;
  unpacked: Map<string, number>;
  names: Map<string, string>;
  bins: Map<string, string>;
}

async function loadContext(tx: Tx, vendorId: string, rows: QueueRow[]): Promise<Context> {
  const ids = rows.map((r) => r.f.id);
  const [th, items, tasks, shipments, exceptions] = await Promise.all([slaThresholds(tx, vendorId), loadItems(tx, vendorId, ids), loadTasks(tx, vendorId, ids), loadShipments(tx, vendorId, ids), openExceptionCounts(tx, vendorId, ids)]);
  const pairs: Array<{ variantId: string; warehouseId: string }> = [];
  for (const r of rows) for (const it of items.get(r.f.id) ?? []) if (!(tasks.get(r.f.id) ?? []).some((t) => t.fulfillmentItemId === it.id)) pairs.push({ variantId: it.variantId, warehouseId: r.f.warehouseId });
  const [unpacked, names, bins] = await Promise.all([
    unpackedUnits(tx, vendorId, items),
    userNames(tx, vendorId, [...tasks.values()].flatMap((ts) => ts.map((t) => t.pickList.assignedTo))),
    suggestedBins(tx, vendorId, pairs),
  ]);
  return { th, items, tasks, shipments, exceptions, unpacked, names, bins };
}

const openTaskCount = (ts: TaskInfo[]) => ts.filter((t) => t.status === 'pending' || t.status === 'partial').length;

function factsOf(r: QueueRow, cx: Context) {
  const ts = cx.tasks.get(r.f.id) ?? [];
  const open = ts.filter((t) => t.status === 'pending' || t.status === 'partial');
  const sh = cx.shipments.get(r.f.id);
  return {
    orderStatus: r.o.status,
    fulfillment: { status: r.f.status, holdFrom: r.f.holdFrom, openTasks: open.length, unverifiedTasks: open.filter((t) => !t.verified).length, unpackedUnits: cx.unpacked.get(r.f.id) ?? 0 },
    shipment: sh ? { status: sh.status } : null,
  };
}

function rowDto(r: QueueRow, cx: Context) {
  const lines = cx.items.get(r.f.id) ?? [];
  const ts = cx.tasks.get(r.f.id) ?? [];
  const list = ts.find((t) => t.pickList.status === 'open' || t.pickList.status === 'in_progress')?.pickList ?? ts[0]?.pickList ?? null;
  const sh = cx.shipments.get(r.f.id) ?? null;
  const addr = r.o.shippingAddress as Record<string, unknown>;
  const buyer = r.o.buyer as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const actions = actionsFor(factsOf(r, cx));
  return {
    fulfillmentId: r.f.id, number: r.f.number, orderId: r.f.orderId, orderNumber: r.o.orderNumber,
    channel: { code: r.o.marketplace, accountId: r.o.accountId, name: r.account ?? r.o.marketplace },
    stage: r.stage, stageLabel: r.stage ? STAGE_LABELS[r.stage] : null, status: r.f.status, onHold: r.f.status === 'on_hold', priority: r.f.priority,
    sla: slaView(r.o.dispatchDueAt, cx.th), placedAt: r.o.placedAt.toISOString(),
    customerName: str(buyer.name) ?? str(addr.name), destination: { city: str(addr.city), state: str(addr.state), pincode: str(addr.pincode ?? addr.postalCode) }, paymentMethod: r.o.paymentMethod,
    warehouse: { id: r.f.warehouseId, code: r.wh.code, name: r.wh.name },
    assignee: list?.assignedTo ? { id: list.assignedTo, name: cx.names.get(list.assignedTo) ?? null } : null,
    pickList: list ? { id: list.id, number: list.number } : null,
    carrier: sh ? (sh.carrier ?? sh.providerCode) : null, awb: sh?.awb ?? null, shipmentId: sh?.id ?? null, shipmentStatus: sh?.status ?? null,
    shippingMethod: r.f.shipMethodKind,
    itemCount: lines.length, unitCount: lines.reduce((n, l) => n + l.quantity, 0), pickedUnits: lines.reduce((n, l) => n + l.pickedQuantity, 0), packedUnits: lines.reduce((n, l) => n + l.packedQuantity, 0),
    items: lines.map((l) => {
      const t = ts.find((x) => x.fulfillmentItemId === l.id && x.binCode);
      const suggested = t ? null : (cx.bins.get(`${l.variantId}:${r.f.warehouseId}`) ?? null);
      return { sku: l.sku, title: l.title, quantity: l.quantity, pickedQuantity: l.pickedQuantity, packedQuantity: l.packedQuantity, pickState: pickState(l), bin: t?.binCode ?? suggested, binSuggested: !t && suggested !== null };
    }),
    openExceptions: cx.exceptions.get(r.f.id) ?? 0, nextAction: primaryAction(actions), createdAt: r.f.createdAt.toISOString(),
  };
}

export async function listQueue(tx: Tx, vendorId: string, allowed: string[] | null, o: { filter: QueueFilter; page: number; pageSize: number }) {
  const where = and(...baseWhere(vendorId, allowed, o.filter), o.filter.stage ? sql`${stageExpr} = ${o.filter.stage}` : undefined);
  const [rows, [tot], counts] = await Promise.all([
    joined(tx).where(where).orderBy(PRIORITY_RANK, sql`${O.dispatchDueAt} asc nulls last`, F.createdAt, F.id).limit(o.pageSize).offset((o.page - 1) * o.pageSize),
    tx.select({ n: sql<number>`count(*)::int` }).from(F).innerJoin(O, and(eq(O.id, F.orderId), eq(O.vendorId, F.vendorId))).where(where),
    stageCounts(tx, vendorId, allowed, o.filter),
  ]);
  const cx = await loadContext(tx, vendorId, rows);
  return { items: rows.map((r) => rowDto(r, cx)), total: tot?.n ?? 0, counts };
}

// ------------------------------------------------------------------------------------------------
// the order workspace (drawer)
// ------------------------------------------------------------------------------------------------
export async function workspace(tx: Tx, vendorId: string, allowed: string[] | null, orderId: string, focusId?: string) {
  const [order] = await tx.select({ o: O, account: schema.marketplaceAccounts.displayName }).from(O)
    .leftJoin(schema.marketplaceAccounts, and(eq(schema.marketplaceAccounts.id, O.marketplaceAccountId), eq(schema.marketplaceAccounts.vendorId, O.vendorId)))
    .where(and(eq(O.id, orderId), eq(O.vendorId, vendorId)));
  if (!order) throw Errors.notFound('Order', orderId);
  const all = await joined(tx).where(and(eq(F.vendorId, vendorId), eq(F.orderId, orderId), allowed ? inArray(F.warehouseId, allowed.length ? allowed : [ZERO_UUID]) : undefined)).orderBy(F.createdAt, F.id);
  const cx = await loadContext(tx, vendorId, all);
  const live = all.filter((r) => r.f.status !== 'cancelled');
  const focus = focusId ? all.find((r) => r.f.id === focusId) : live.find((r) => stageOf(r.f.status, r.f.holdFrom) !== null) ?? live[0];
  if (focusId && !focus) throw Errors.notFound('Fulfillment', focusId);
  const addr = order.o.shippingAddress as Record<string, unknown>;
  const buyer = order.o.buyer as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

  let detail: Awaited<ReturnType<typeof focusDetail>> | null = null;
  if (focus) detail = await focusDetail(tx, vendorId, focus, cx);
  return {
    order: {
      id: order.o.id, orderNumber: order.o.orderNumber, externalOrderId: order.o.externalOrderId, status: order.o.status, placedAt: order.o.placedAt.toISOString(),
      channel: { code: order.o.marketplace, accountId: order.o.marketplaceAccountId, name: order.account ?? order.o.marketplace },
      customer: { name: str(buyer.name) ?? str(addr.name), city: str(addr.city), state: str(addr.state), pincode: str(addr.pincode ?? addr.postalCode) },
      paymentMethod: order.o.paymentMethod, codAmountMinor: order.o.codAmountMinor, totalMinor: order.o.totalMinor, currency: order.o.currency.trim(),
      sla: slaView(order.o.dispatchDueAt, cx.th), attentionReason: order.o.attentionReason,
    },
    fulfillments: all.map((r) => ({ id: r.f.id, number: r.f.number, status: r.f.status, stage: r.stage, warehouse: { id: r.f.warehouseId, code: r.wh.code, name: r.wh.name }, units: (cx.items.get(r.f.id) ?? []).reduce((n, l) => n + l.quantity, 0), focused: r.f.id === focus?.f.id })),
    fulfillment: detail,
    // with no fulfillment yet the only possible action is starting one
    actions: actionsFor(focus ? factsOf(focus, cx) : { orderStatus: order.o.status, fulfillment: null, shipment: null }),
  };
}

async function focusDetail(tx: Tx, vendorId: string, r: QueueRow, cx: Context) {
  const dto = rowDto(r, cx);
  const lines = cx.items.get(r.f.id) ?? [];
  const ts = cx.tasks.get(r.f.id) ?? [];
  const [exceptions, history, packages] = await Promise.all([
    tx.select().from(X).where(and(eq(X.vendorId, vendorId), eq(X.fulfillmentId, r.f.id))).orderBy(sql`${X.createdAt} desc`),
    fulfillmentTimeline(tx, vendorId, r.f.id),
    tx.select().from(PKG).where(and(eq(PKG.vendorId, vendorId), eq(PKG.fulfillmentId, r.f.id))).orderBy(PKG.createdAt),
  ]);
  const names = await userNames(tx, vendorId, [...exceptions.map((x) => x.raisedBy), ...history.map((h) => h.actorId)]);
  const sh = cx.shipments.get(r.f.id) ?? null;
  return {
    ...dto,
    id: r.f.id,
    items: lines.map((l) => {
      const task = ts.find((x) => x.fulfillmentItemId === l.id);
      return {
        id: l.id, pickTaskId: task?.id ?? null, orderItemId: l.orderItemId, variantId: l.variantId, sku: l.sku, barcode: l.barcode, title: l.title, quantity: l.quantity, pickedQuantity: l.pickedQuantity, packedQuantity: l.packedQuantity, shortQuantity: l.shortQuantity,
        pickState: pickState(l), bin: task?.binCode ?? cx.bins.get(`${l.variantId}:${r.f.warehouseId}`) ?? null, scanned: task ? task.verified : null,
      };
    }),
    packages: packages.map((p) => ({ id: p.id, number: p.number, barcode: p.barcode, status: p.status, weightGrams: p.weightGrams, boxType: p.boxType })),
    shipment: sh ? { id: sh.id, number: sh.number, status: sh.status, carrier: sh.carrier ?? sh.providerCode, awb: sh.awb, trackingUrl: sh.trackingUrl, hasLabel: Boolean((sh.providerData as { label?: unknown }).label), manifestId: sh.manifestId, estimatedDeliveryAt: iso(sh.estimatedDeliveryAt) } : null,
    exceptions: exceptions.map((x) => ({ id: x.id, kind: x.kind, status: x.status, details: x.details, raisedBy: x.raisedBy ? { id: x.raisedBy, name: names.get(x.raisedBy) ?? null } : null, createdAt: x.createdAt.toISOString(), resolvedAt: iso(x.resolvedAt) })),
    history: history.map((h) => ({ at: h.createdAt, from: h.fromStatus, to: h.toStatus, note: h.note, actor: h.actorId ? { id: h.actorId, name: names.get(h.actorId) ?? null } : null })),
    openTasks: openTaskCount(ts),
    routing: r.f.routing,
  };
}

// ------------------------------------------------------------------------------------------------
// exceptions list for the screen
// ------------------------------------------------------------------------------------------------
export interface ExceptionQuery { status?: string; kind?: string; warehouseId?: string; q?: string; page: number; pageSize: number }

const KIND_LABELS: Record<string, string> = {
  pick_short: 'Short pick', damaged: 'Damaged item', wrong_item: 'Wrong item', pack_issue: 'Packing issue', insufficient_stock: 'Insufficient stock', address_issue: 'Address issue', ndr: 'Failed delivery', rto: 'Return to origin', other: 'Other',
};

export async function exceptionsView(tx: Tx, vendorId: string, allowed: string[] | null, q: ExceptionQuery) {
  const where = and(
    eq(X.vendorId, vendorId), q.status ? eq(X.status, q.status) : undefined, q.kind ? eq(X.kind, q.kind) : undefined, q.warehouseId ? eq(F.warehouseId, q.warehouseId) : undefined,
    allowed ? inArray(F.warehouseId, allowed.length ? allowed : [ZERO_UUID]) : undefined,
    q.q?.trim() ? sql`(${O.orderNumber} ilike ${`%${escapeLike(q.q.trim())}%`} or ${F.number} ilike ${`%${escapeLike(q.q.trim())}%`})` : undefined,
  );
  const [rows, [tot], summary] = await Promise.all([
    tx.select({ x: X, f: { id: F.id, number: F.number, status: F.status, warehouseId: F.warehouseId, orderId: F.orderId }, orderNumber: O.orderNumber, marketplace: O.marketplace, warehouse: W.code }).from(X)
      .innerJoin(F, and(eq(F.id, X.fulfillmentId), eq(F.vendorId, X.vendorId))).innerJoin(O, and(eq(O.id, F.orderId), eq(O.vendorId, F.vendorId))).innerJoin(W, and(eq(W.id, F.warehouseId), eq(W.vendorId, F.vendorId)))
      .where(where).orderBy(sql`${X.createdAt} desc`, X.id).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
    tx.select({ n: sql<number>`count(*)::int` }).from(X).innerJoin(F, and(eq(F.id, X.fulfillmentId), eq(F.vendorId, X.vendorId))).innerJoin(O, and(eq(O.id, F.orderId), eq(O.vendorId, F.vendorId))).where(where),
    tx.select({ status: X.status, n: sql<number>`count(*)::int` }).from(X).innerJoin(F, and(eq(F.id, X.fulfillmentId), eq(F.vendorId, X.vendorId)))
      .where(and(eq(X.vendorId, vendorId), allowed ? inArray(F.warehouseId, allowed.length ? allowed : [ZERO_UUID]) : undefined)).groupBy(X.status),
  ]);
  const names = await userNames(tx, vendorId, rows.map((r) => r.x.raisedBy));
  const now = Date.now();
  return {
    items: rows.map((r) => ({
      id: r.x.id, kind: r.x.kind, kindLabel: KIND_LABELS[r.x.kind] ?? r.x.kind, status: r.x.status, details: r.x.details, resolution: r.x.resolution,
      fulfillment: { id: r.f.id, number: r.f.number, status: r.f.status }, orderId: r.f.orderId, orderNumber: r.orderNumber, channel: r.marketplace, warehouse: { id: r.f.warehouseId, code: r.warehouse },
      raisedBy: r.x.raisedBy ? { id: r.x.raisedBy, name: names.get(r.x.raisedBy) ?? null } : null, ageMinutes: Math.max(0, Math.floor((now - r.x.createdAt.getTime()) / 60_000)),
      createdAt: r.x.createdAt.toISOString(), resolvedAt: iso(r.x.resolvedAt),
    })),
    total: tot?.n ?? 0,
    counts: { open: summary.find((s) => s.status === 'open')?.n ?? 0, resolved: summary.find((s) => s.status === 'resolved')?.n ?? 0, dismissed: summary.find((s) => s.status === 'dismissed')?.n ?? 0 },
  };
}

