import { and, eq, inArray, or, schema, sql, type SQL, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import type { Container } from '@oms/module-kit';
import { STAGE_LABELS, STORED_TO_KIND, reasonLabel, returnStage, type Disposition } from './domain';
import { getReturnRow, type ReturnRow } from './service';
import { receiptOf } from './inspection';
import { STAGE_PREDICATES, isStage, ledgerOrder, type LedgerSort } from './ret-int-ledger';

const R = schema.returnOrders;
const RI = schema.returnItems;
const O = schema.orders;
const OI = schema.orderItems;

// ------------------------------------------------------------------------------------------------
// settings, channels, shared predicates
// ------------------------------------------------------------------------------------------------
export interface ReturnSettings { highValueMinor: number; inspectionOverdueHours: number }
export async function returnSettings(tx: Tx, vendorId: string): Promise<ReturnSettings> {
  const [v] = await tx.select({ settings: schema.vendors.settings }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const s = ((v?.settings ?? {}) as { returns?: { highValueMinor?: number; inspectionOverdueHours?: number } }).returns ?? {};
  return { highValueMinor: s.highValueMinor ?? 2_500_000, inspectionOverdueHours: s.inspectionOverdueHours ?? 24 };
}

/** channels from which the dashboard may create a return: the design says "Shopify connection only"; the built-in sandbox marketplace is allowed outside production so the flow can be exercised */
export const RETURN_CREATE_CHANNELS = ['shopify'] as const;
export const allowedCreateChannels = (c: Pick<Container, 'config'>): string[] => [...RETURN_CREATE_CHANNELS, ...(c.config.mockMarketplaceEnabled ? ['mock'] : [])];

const channelOf = (c: Pick<Container, 'connectors'>, code: string) => ({ code, name: c.connectors.has(code) ? c.connectors.get(code).displayName : code });
const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
export const maskEmail = (e: string): string => { const [l, d] = e.split('@'); return d ? `${l!.slice(0, 1)}***@${d}` : '***'; };

const OPEN_STATUSES = ['requested', 'approved', 'pickup_scheduled', 'picked_up', 'in_transit', 'received', 'inspecting'];
const list = (xs: readonly string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);
const rItems = (cond: SQL) => sql`exists (select 1 from return_items ri where ri.vendor_id = ${R.vendorId} and ri.return_order_id = ${R.id} and ${cond})`;

/** every signal / tab is ONE predicate used by the counts, the lists and the exports, so numbers always agree */
export function predicates(s: ReturnSettings) {
  const awaitingInspection = sql`(${R.status} in ('received','inspecting') and ${R.inspectionStatus} in ('not_started','in_progress'))`;
  const refundsPending = sql`(${R.refundStatus} in ('pending','ready','processing','failed') and ${R.inspectionStatus} in ('passed','failed','requires_review') and ${R.status} in ('received','inspecting','completed'))`;
  const inventoryDiscrepancy = sql`(${R.status} in ('received','inspecting') and ${rItems(sql`ri.received_quantity < ri.quantity`)})`;
  const highValue = sql`(${R.status} in (${list(OPEN_STATUSES)}) and ${R.refundAmountMinor} >= ${s.highValueMinor} and ${R.refundStatus} in ('pending','ready','processing','failed'))`;
  const inspectionOverdue = sql`(${awaitingInspection} and ${R.receivedAt} < now() - make_interval(hours => ${s.inspectionOverdueHours}::int))`;
  const dispositionMissing = sql`(${R.status} in ('received','inspecting') and ${R.inspectionStatus} in ('passed','failed','requires_review') and ${rItems(sql`ri.received_quantity > ri.dispositioned_quantity`)})`;
  const signals = { awaiting_inspection: awaitingInspection, refunds_pending: refundsPending, inventory_discrepancy: inventoryDiscrepancy, high_value_review: highValue } as const;
  return {
    signals,
    issues: { inspection_overdue: inspectionOverdue, refund_pending: refundsPending, quantity_mismatch: inventoryDiscrepancy, disposition_missing: dispositionMissing },
    tabs: {
      all: sql`true`,
      needs_attention: sql`(${awaitingInspection} or ${refundsPending} or ${inventoryDiscrepancy} or ${highValue})`,
      awaiting_receipt: sql`${R.status} in ('approved','pickup_scheduled','picked_up','in_transit')`,
      awaiting_inspection: awaitingInspection,
      refund_pending: refundsPending,
      completed: sql`${R.status} = 'completed'`,
    } as Record<string, SQL>,
  };
}
export const TABS = ['all', 'needs_attention', 'awaiting_receipt', 'awaiting_inspection', 'refund_pending', 'completed'] as const;
export const SIGNALS = ['awaiting_inspection', 'refunds_pending', 'inventory_discrepancy', 'high_value_review'] as const;

// ------------------------------------------------------------------------------------------------
// ledger
// ------------------------------------------------------------------------------------------------
export interface LedgerFilters { q?: string; marketplace?: string[]; signal?: string[]; inspectionStatus?: string[]; refundStatus?: string[]; disposition?: string[]; stage?: string[] }
export interface LedgerQuery extends LedgerFilters { tab?: string; sort?: LedgerSort; page: number; pageSize: number }

function filterWhere(vendorId: string, f: LedgerFilters, p: ReturnType<typeof predicates>): SQL[] {
  const w: SQL[] = [eq(R.vendorId, vendorId)];
  if (f.q?.trim()) {
    const like = `%${escapeLike(f.q.trim())}%`;
    w.push(sql`(${R.number} ilike ${like} or ${O.orderNumber} ilike ${like} or ${O.externalOrderId} ilike ${like} or exists (select 1 from return_items ri join order_items oi on oi.id = ri.order_item_id and oi.vendor_id = ri.vendor_id where ri.vendor_id = ${R.vendorId} and ri.return_order_id = ${R.id} and (oi.title ilike ${like} or oi.sku ilike ${like})))`);
  }
  if (f.marketplace?.length) w.push(inArray(O.marketplace, f.marketplace));
  if (f.signal?.length) w.push(or(...f.signal.map((s) => p.signals[s as keyof typeof p.signals]).filter((x): x is SQL => Boolean(x)))!);
  if (f.stage?.length) w.push(or(...f.stage.filter(isStage).map((st) => STAGE_PREDICATES[st]))!);
  if (f.inspectionStatus?.length) w.push(inArray(R.inspectionStatus, f.inspectionStatus));
  if (f.refundStatus?.length) w.push(inArray(R.refundStatus, f.refundStatus));
  if (f.disposition?.length) {
    const kinds = f.disposition.filter((d) => d !== 'pending');
    const stored = Object.entries(STORED_TO_KIND).filter(([, k]) => kinds.includes(k)).map(([s]) => s);
    const parts: SQL[] = [];
    if (f.disposition.includes('pending')) parts.push(sql`not ${rItems(sql`ri.disposition is not null`)}`);
    if (stored.length) parts.push(rItems(sql`ri.disposition in (${list(stored)})`));
    if (parts.length) w.push(or(...parts)!);
  }
  return w;
}

const joinO = (tx: Tx) => tx.select({ r: R, o: { number: O.orderNumber, marketplace: O.marketplace, currency: O.currency, buyer: O.buyer, externalOrderId: O.externalOrderId, accountId: O.marketplaceAccountId } }).from(R).innerJoin(O, and(eq(O.id, R.orderId), eq(O.vendorId, R.vendorId)));

export async function ledgerCounts(tx: Tx, vendorId: string, f: LedgerFilters, s: ReturnSettings) {
  const p = predicates(s);
  const agg = (pred: SQL) => sql<number>`(count(*) filter (where ${pred}))::int`;
  const [row] = await tx.select({
    all: sql<number>`count(*)::int`, needs_attention: agg(p.tabs.needs_attention!), awaiting_receipt: agg(p.tabs.awaiting_receipt!), awaiting_inspection: agg(p.tabs.awaiting_inspection!),
    refund_pending: agg(p.tabs.refund_pending!), completed: agg(p.tabs.completed!),
  }).from(R).innerJoin(O, and(eq(O.id, R.orderId), eq(O.vendorId, R.vendorId))).where(and(...filterWhere(vendorId, f, p)));
  return { all: row?.all ?? 0, needs_attention: row?.needs_attention ?? 0, awaiting_receipt: row?.awaiting_receipt ?? 0, awaiting_inspection: row?.awaiting_inspection ?? 0, refund_pending: row?.refund_pending ?? 0, completed: row?.completed ?? 0 };
}

interface ItemAgg { rid: string; id: string; quantity: number; received: number; decided: number; disposition: string | null; title: string; sku: string; createdAt: Date }
async function loadItems(tx: Tx, vendorId: string, ids: string[]): Promise<Map<string, ItemAgg[]>> {
  const out = new Map<string, ItemAgg[]>();
  if (!ids.length) return out;
  const rows = await tx.select({ rid: RI.returnOrderId, id: RI.id, quantity: RI.quantity, received: RI.receivedQuantity, decided: RI.dispositionedQuantity, disposition: RI.disposition, title: OI.title, sku: OI.sku, createdAt: RI.createdAt })
    .from(RI).innerJoin(OI, and(eq(OI.id, RI.orderItemId), eq(OI.vendorId, RI.vendorId))).where(and(eq(RI.vendorId, vendorId), inArray(RI.returnOrderId, ids))).orderBy(RI.createdAt, RI.id);
  for (const r of rows) { const l = out.get(r.rid); if (l) l.push(r); else out.set(r.rid, [r]); }
  return out;
}
async function loadUsers(tx: Tx, vendorId: string, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(isUuid))];
  if (!uniq.length) return new Map();
  const rows = await tx.select({ id: schema.users.id, name: schema.users.fullName }).from(schema.users).where(and(eq(schema.users.vendorId, vendorId), inArray(schema.users.id, uniq)));
  return new Map(rows.map((u) => [u.id, u.name]));
}

const dispositionOf = (items: ItemAgg[]): string => {
  const kinds = new Set(items.filter((i) => i.disposition).map((i) => STORED_TO_KIND[i.disposition as Disposition]));
  return kinds.size === 0 ? 'pending' : kinds.size === 1 ? [...kinds][0]! : 'mixed';
};
const refundActionable = (r: ReturnRow) => ['pending', 'ready', 'processing', 'failed'].includes(r.refundStatus) && ['passed', 'failed', 'requires_review'].includes(r.inspectionStatus) && ['received', 'inspecting', 'completed'].includes(r.status);
function displayStatus(r: ReturnRow): string {
  switch (r.status) {
    case 'pickup_scheduled': case 'picked_up': case 'in_transit': return 'in_transit';
    case 'inspecting': return refundActionable(r) ? 'refund_pending' : 'inspecting';
    case 'completed': return 'resolved';
    default: return r.status;
  }
}
function actionOf(r: ReturnRow): { key: 'inspect' | 'review' | 'view' | 'track' | 'refund'; href: string } {
  const base = `/api/v1/returns/${r.id}`;
  if (['approved', 'pickup_scheduled', 'picked_up', 'in_transit'].includes(r.status)) return { key: 'track', href: `${base}/detail` };
  if (['received', 'inspecting'].includes(r.status)) {
    if (['not_started', 'in_progress'].includes(r.inspectionStatus)) return { key: 'inspect', href: `${base}/inspection` };
    if (r.inspectionStatus === 'requires_review') return { key: 'review', href: `${base}/inspection` };
  }
  if (refundActionable(r)) return { key: 'refund', href: `${base}/refund` };
  return { key: 'view', href: `${base}/detail` };
}
function signalsOf(r: ReturnRow, items: ItemAgg[], s: ReturnSettings): string[] {
  const out: string[] = [];
  const open = ['received', 'inspecting'].includes(r.status);
  if (open && ['not_started', 'in_progress'].includes(r.inspectionStatus)) out.push('awaiting_inspection');
  if (refundActionable(r)) out.push('refunds_pending');
  if (open && items.some((i) => i.received < i.quantity)) out.push('inventory_discrepancy');
  if (OPEN_STATUSES.includes(r.status) && (r.refundAmountMinor ?? 0) >= s.highValueMinor && ['pending', 'ready', 'processing', 'failed'].includes(r.refundStatus)) out.push('high_value_review');
  return out;
}
const customerOf = (buyer: Record<string, unknown>, full: boolean) => {
  const name = typeof buyer.name === 'string' && buyer.name ? buyer.name : null;
  const email = typeof buyer.email === 'string' && buyer.email ? buyer.email : null;
  if (!name && !email) return null;
  return { name, email: email ? (full ? email : maskEmail(email)) : null };
};

/** what the latest saved checklist says about the goods: damage beats a wrong product beats missing parts (null before any inspection) */
export type PhysicalCondition = 'usable' | 'damaged' | 'wrong_product' | 'incomplete';
export function physicalOf(c: Record<string, unknown> | null | undefined): PhysicalCondition | null {
  if (!c) return null;
  if (c.visibleDamage === true || c.productUsable === false) return 'damaged';
  if (c.productMismatch === true) return 'wrong_product';
  if (c.packagingIntact === false || c.accessoriesPresent === false || c.missingQuantity === true) return 'incomplete';
  return 'usable';
}
async function loadPhysical(tx: Tx, vendorId: string, ids: string[]): Promise<Map<string, PhysicalCondition | null>> {
  const out = new Map<string, PhysicalCondition | null>();
  if (!ids.length) return out;
  const rows = await tx.select({ rid: schema.returnInspections.returnOrderId, checklist: schema.returnInspections.checklist }).from(schema.returnInspections)
    .where(and(eq(schema.returnInspections.vendorId, vendorId), inArray(schema.returnInspections.returnOrderId, ids), sql`${schema.returnInspections.checklist}->>'bulk' is null`)).orderBy(sql`${schema.returnInspections.createdAt} desc`, sql`${schema.returnInspections.id} desc`);
  for (const r of rows) if (!out.has(r.rid)) out.set(r.rid, physicalOf(r.checklist as Record<string, unknown>));
  return out;
}

export async function ledgerRows(tx: Tx, c: Container, vendorId: string, rows: Array<{ r: ReturnRow; o: { number: string; marketplace: string; currency: string; buyer: Record<string, unknown> } }>, s: ReturnSettings) {
  const ids = rows.map((x) => x.r.id);
  const [items, users, physical] = await Promise.all([loadItems(tx, vendorId, ids), loadUsers(tx, vendorId, rows.map((x) => x.r.inspectorId)), loadPhysical(tx, vendorId, ids)]);
  return rows.map(({ r, o }) => {
    const its = items.get(r.id) ?? [];
    const first = its[0];
    return {
      id: r.id, number: r.number, orderId: r.orderId, orderNumber: o.number,
      product: { title: first?.title ?? null, sku: first?.sku ?? null, itemCount: its.length },
      channel: channelOf(c, o.marketplace), reason: { code: r.reasonCode, label: reasonLabel(r.reasonCode) },
      quantity: its.reduce((n, i) => n + i.quantity, 0), receivedQuantity: its.reduce((n, i) => n + i.received, 0),
      status: r.status, displayStatus: displayStatus(r), stage: returnStage(r), stageLabel: STAGE_LABELS[returnStage(r)], requestedAt: r.createdAt.toISOString(), receivedAt: iso(r.receivedAt),
      inspection: { status: r.inspectionStatus, inspector: r.inspectorId ? { id: r.inspectorId, name: users.get(r.inspectorId) ?? null } : null, physical: physical.get(r.id) ?? null },
      refund: { status: r.refundStatus, amountMinor: r.refundAmountMinor, currency: r.refundCurrency ?? o.currency, source: r.refundSource as 'connector' | 'manual' | null },
      disposition: dispositionOf(its), customer: customerOf(o.buyer, false), signals: signalsOf(r, its, s), action: actionOf(r),
    };
  });
}

export async function listLedger(tx: Tx, c: Container, vendorId: string, q: LedgerQuery) {
  const s = await returnSettings(tx, vendorId);
  const p = predicates(s);
  const where = and(...filterWhere(vendorId, q, p), q.tab && q.tab !== 'all' ? p.tabs[q.tab] : undefined);
  const offset = (q.page - 1) * q.pageSize;
  const [rows, [tot]] = await Promise.all([
    joinO(tx).where(where).orderBy(...ledgerOrder(q.sort)).limit(q.pageSize).offset(offset),
    tx.select({ n: sql<number>`count(*)::int` }).from(R).innerJoin(O, and(eq(O.id, R.orderId), eq(O.vendorId, R.vendorId))).where(where),
  ]);
  return { items: await ledgerRows(tx, c, vendorId, rows, s), total: tot?.n ?? 0 };
}

export async function exportLedger(tx: Tx, c: Container, vendorId: string, q: LedgerFilters & { tab?: string }, max: number): Promise<Array<Awaited<ReturnType<typeof ledgerRows>>[number]>> {
  const s = await returnSettings(tx, vendorId);
  const p = predicates(s);
  const where = and(...filterWhere(vendorId, q, p), q.tab && q.tab !== 'all' ? p.tabs[q.tab] : undefined);
  const [tot] = await tx.select({ n: sql<number>`count(*)::int` }).from(R).innerJoin(O, and(eq(O.id, R.orderId), eq(O.vendorId, R.vendorId))).where(where);
  if ((tot?.n ?? 0) > max) throw new AppError('PAYLOAD_TOO_LARGE', `The export has ${tot!.n} rows (max ${max}); narrow the filters`, { details: { rows: tot!.n, max } });
  const rows = await joinO(tx).where(where).orderBy(sql`${R.createdAt} desc`, sql`${R.id} desc`).limit(max);
  const out: Awaited<ReturnType<typeof ledgerRows>> = [];
  for (let i = 0; i < rows.length; i += 500) out.push(...(await ledgerRows(tx, c, vendorId, rows.slice(i, i + 500), s)));
  return out;
}

// ------------------------------------------------------------------------------------------------
// overview
// ------------------------------------------------------------------------------------------------
export async function overview(tx: Tx, c: Container, vendorId: string) {
  const s = await returnSettings(tx, vendorId);
  const p = predicates(s);
  const n = (pred: SQL) => sql<number>`(count(*) filter (where ${pred}))::int`;
  const [row] = await tx.select({
    open: n(sql`${R.status} in (${list(OPEN_STATUSES)})`),
    requested: n(sql`${R.status} = 'requested'`), approved: n(sql`${R.status} = 'approved'`), inTransit: n(sql`${R.status} in ('pickup_scheduled','picked_up','in_transit')`), received: n(sql`${R.status} = 'received'`),
    inspecting: n(sql`(${R.status} in ('received','inspecting') and ${R.inspectionStatus} in ('in_progress','requires_review'))`),
    needReview: n(sql`(${R.status} in ('received','inspecting') and ${R.inspectionStatus} = 'requires_review')`),
    resolution: n(sql`(${R.status} = 'inspecting' and ${R.inspectionStatus} in ('passed','failed') and ${R.refundStatus} in ('pending','ready','processing'))`),
    resolutionPending: n(sql`(${R.status} = 'inspecting' and ${R.inspectionStatus} in ('passed','failed') and ${R.refundStatus} in ('pending','ready'))`),
    refunded: n(sql`(${R.refundStatus} = 'processed' and ${R.status} in ('received','inspecting'))`),
    closed: n(sql`(${R.status} = 'completed' and ${R.completedAt} >= now() - interval '30 days')`),
    awaiting_inspection: n(p.signals.awaiting_inspection), refunds_pending: n(p.signals.refunds_pending), inventory_discrepancy: n(p.signals.inventory_discrepancy), high_value_review: n(p.signals.high_value_review),
  }).from(R).where(eq(R.vendorId, vendorId));
  const allowed = allowedCreateChannels(c);
  const [acc] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.marketplaceAccounts).where(and(eq(schema.marketplaceAccounts.vendorId, vendorId), eq(schema.marketplaceAccounts.status, 'active'), inArray(schema.marketplaceAccounts.marketplace, allowed)));
  const available = (acc?.n ?? 0) > 0;
  const x = row!;
  return {
    statusLine: { open: x.open, awaitingInspection: x.awaiting_inspection, refundsPending: x.refunds_pending },
    createReturn: { available, reason: available ? null : 'shopify_only', allowedChannels: allowed },
    stages: {
      requested: { count: x.requested, hint: 'to_review' }, approved: { count: x.approved, hint: 'authorized' }, inTransit: { count: x.inTransit, hint: 'await_receipt' }, received: { count: x.received, hint: 'verify_stock' },
      inspecting: { count: x.inspecting, needReview: x.needReview }, resolution: { count: x.resolution, refundPending: x.resolutionPending }, refunded: { count: x.refunded, hint: 'disposition' }, closed: { count: x.closed, window: '30d' },
    },
    stagesNote: 'Stage counts are independent operational queues; closed totals cover the last 30 days.',
    attention: [
      { key: 'awaiting_inspection', count: x.awaiting_inspection }, { key: 'refunds_pending', count: x.refunds_pending },
      { key: 'inventory_discrepancy', count: x.inventory_discrepancy }, { key: 'high_value_review', count: x.high_value_review },
    ].filter((a) => a.count > 0) as Array<{ key: (typeof SIGNALS)[number]; count: number }>,
  };
}

// ------------------------------------------------------------------------------------------------
// detail drawer
// ------------------------------------------------------------------------------------------------
type Step = { step: string; status: 'complete' | 'pending'; actor: { id: string | null; name: string | null; kind: 'user' | 'system' | 'customer' } | null; at: string | null; note: string | null };

export async function returnDetailView(tx: Tx, c: Container, vendorId: string, id: string) {
  const r = await getReturnRow(tx, vendorId, id);
  const [o] = await tx.select().from(O).where(and(eq(O.id, r.orderId), eq(O.vendorId, vendorId)));
  const [items, events, rc] = await Promise.all([
    loadItems(tx, vendorId, [id]).then((m) => m.get(id) ?? []),
    tx.select().from(schema.returnEvents).where(and(eq(schema.returnEvents.vendorId, vendorId), eq(schema.returnEvents.returnOrderId, id))).orderBy(schema.returnEvents.id),
    receiptOf(tx, vendorId, id),
  ]);
  const users = await loadUsers(tx, vendorId, [r.inspectorId, ...events.map((e) => e.actorId)]);
  const channel = channelOf(c, o?.marketplace ?? 'unknown');
  const actor = (aid: string | null | undefined): Step['actor'] => (aid ? { id: aid, name: users.get(aid) ?? null, kind: users.has(aid) ? 'user' : 'system' } : null);
  const status = (to: string) => events.find((e) => e.toStatus === to && !(e.metadata as { kind?: string }).kind);
  const ofKind = (kind: string) => [...events].reverse().find((e) => (e.metadata as { kind?: string }).kind === kind);
  const requested = status('requested'), approved = status('approved'), received = status('received');
  const closedEv = status('completed') ?? status('rejected') ?? status('cancelled');
  const inspEv = ofKind('inspection'), dispEv = ofKind('disposition'), refundEv = ofKind('refund');
  const inspected = ['passed', 'failed', 'requires_review'].includes(r.inspectionStatus);
  const disposition = dispositionOf(items);
  const decidedAll = items.length > 0 && items.every((i) => i.received === 0 || i.decided >= i.received) && items.some((i) => i.disposition);
  const customerVia = r.source === 'customer' || r.source === 'marketplace' ? { id: null, name: `Customer via ${channel.name}`, kind: 'customer' as const } : actor(requested?.actorId);
  const timeline: Step[] = [
    { step: 'requested', status: 'complete', actor: customerVia, at: iso(requested?.createdAt ?? r.createdAt), note: requested?.note ?? r.reasonText ?? reasonLabel(r.reasonCode) },
    { step: 'approved', status: approved ? 'complete' : 'pending', actor: approved ? actor(approved.actorId) : null, at: iso(approved?.createdAt), note: approved ? approved.note ?? 'Return accepted for receipt' : r.status === 'rejected' ? 'Return rejected' : 'Awaiting approval' },
    { step: 'received', status: received ? 'complete' : 'pending', actor: received ? actor(received.actorId) : null, at: iso(r.receivedAt), note: received ? `${rc.received} of ${rc.expected} expected units received` : 'Awaiting receipt' },
    { step: 'inspection', status: inspected ? 'complete' : 'pending', actor: r.inspectorId ? { id: r.inspectorId, name: users.get(r.inspectorId) ?? null, kind: 'user' } : null, at: inspected ? iso(inspEv?.createdAt ?? r.inspectedAt) : null,
      note: inspected ? (inspEv?.note ?? `Inspection ${r.inspectionStatus}`) : r.inspectorId ? `Assigned to ${users.get(r.inspectorId) ?? 'an inspector'}` : 'Unassigned' },
    { step: 'refund', status: r.refundStatus === 'processed' ? 'complete' : 'pending', actor: r.refundSource === 'connector' ? { id: null, name: channel.name, kind: 'system' } : refundEv ? actor(refundEv.actorId) : null, at: iso(r.refundedAt ?? refundEv?.createdAt),
      note: r.refundStatus === 'not_applicable' ? 'No refund due' : r.refundStatus === 'pending' && !inspected ? 'Awaiting inspection decision' : r.refundStatus === 'failed' ? r.refundError ?? 'Refund failed' : `Refund ${r.refundStatus}` },
    { step: 'disposition', status: decidedAll ? 'complete' : 'pending', actor: dispEv ? actor(dispEv.actorId) : null, at: iso(dispEv?.createdAt), note: decidedAll ? `Disposition ${disposition}` : 'Operator decision' },
    { step: 'closed', status: closedEv ? 'complete' : 'pending', actor: closedEv ? actor(closedEv.actorId) : { id: null, name: 'System', kind: 'system' }, at: iso(r.completedAt ?? closedEv?.createdAt), note: closedEv ? closedEv.note ?? `Return ${closedEv.toStatus}` : 'Requires refund and disposition resolution' },
  ];
  const act = (key: string, label: string, method: string, href: string, enabled: boolean, disabledReason: string | null = null) => ({ key, label, method, href, enabled, disabledReason });
  const base = `/api/v1/returns/${id}`;
  const canInspect = ['received', 'inspecting'].includes(r.status);
  const undecided = items.reduce((n, i) => n + (i.received - i.decided), 0);
  const customer = o ? customerOf(o.buyer as Record<string, unknown>, true) : null;
  return {
    header: { id: r.id, number: r.number, status: r.status, displayStatus: displayStatus(r), orderId: r.orderId, orderNumber: o?.orderNumber ?? null, channel, customerName: customer?.name ?? null, source: r.source },
    product: { title: items[0]?.title ?? null, sku: items[0]?.sku ?? null, itemCount: items.length, quantity: rc.expected, reason: reasonLabel(r.reasonCode), receivedAt: iso(r.receivedAt) },
    details: {
      orderId: r.orderId, orderNumber: o?.orderNumber ?? null, externalOrderId: o?.externalOrderId ?? null, channel, customer, product: items[0]?.title ?? null, sku: items[0]?.sku ?? null,
      quantity: { expected: rc.expected, received: rc.received }, reason: { code: r.reasonCode, label: reasonLabel(r.reasonCode), text: r.reasonText },
      dates: { requestedAt: iso(requested?.createdAt ?? r.createdAt), approvedAt: iso(approved?.createdAt), receivedAt: iso(r.receivedAt), completedAt: iso(r.completedAt) },
      customerNote: 'Customer information is shown only when provided by the connected channel. No customer data is inferred.',
    },
    // a shortfall only means something once the goods are in: before that nothing is expected to have arrived
    receipt: { expected: rc.expected, received: rc.received, match: !r.receivedAt ? 'awaiting_receipt' : rc.mismatch ? 'quantity_mismatch' : 'matched', mismatch: r.receivedAt ? rc.mismatch : null },
    currentState: {
      inspection: { status: r.inspectionStatus, inspector: r.inspectorId ? { id: r.inspectorId, name: users.get(r.inspectorId) ?? null } : null },
      refund: { status: r.refundStatus, amountMinor: r.refundAmountMinor, currency: r.refundCurrency ?? o?.currency ?? null, source: r.refundSource, error: r.refundError },
      disposition,
    },
    timeline,
    actions: [
      act('assign_inspection', 'Assign inspection', 'POST', `${base}/inspection/assign`, canInspect && !inspected, canInspect ? (inspected ? 'inspection_finished' : null) : 'not_received'),
      act('save_inspection', 'Save inspection', 'POST', `${base}/inspection`, canInspect, canInspect ? null : 'not_received'),
      act('confirm_disposition', 'Confirm disposition', 'POST', `${base}/disposition`, canInspect && inspected && undecided > 0, !canInspect ? 'not_received' : !inspected ? 'inspection_not_finished' : undecided === 0 ? 'no_undecided_units' : null),
      act('record_refund', 'Record or request refund', 'POST', `${base}/refund`, refundActionable(r) && r.refundStatus !== 'processing', refundActionable(r) ? null : 'refund_not_actionable'),
      act('retry_refund', 'Retry refund', 'POST', `${base}/refund/retry`, r.refundStatus === 'failed', r.refundStatus === 'failed' ? null : 'refund_not_failed'),
      act('view_order', 'View order', 'GET', `/api/v1/orders/${r.orderId}`, true),
    ],
  };
}

// ------------------------------------------------------------------------------------------------
// refunds tab
// ------------------------------------------------------------------------------------------------
export async function listRefunds(tx: Tx, c: Container, vendorId: string, q: { page: number; pageSize: number; status?: string[]; marketplace?: string[]; q?: string }) {
  const s = await returnSettings(tx, vendorId);
  const p = predicates(s);
  const base = filterWhere(vendorId, { q: q.q, marketplace: q.marketplace }, p);
  // the actionable queue (after inspection) plus what has already been refunded; pre-inspection returns are not in it
  const scope = or(p.tabs.refund_pending!, sql`(${R.refundStatus} = 'processed')`)!;
  const where = and(...base, scope, q.status?.length ? inArray(R.refundStatus, q.status) : undefined);
  const [rows, [tot], [counts]] = await Promise.all([
    joinO(tx).where(where).orderBy(sql`${R.updatedAt} desc`, sql`${R.id} desc`).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
    tx.select({ n: sql<number>`count(*)::int` }).from(R).innerJoin(O, and(eq(O.id, R.orderId), eq(O.vendorId, R.vendorId))).where(where),
    tx.select({
      pending: sql<number>`(count(*) filter (where ${R.refundStatus} = 'pending'))::int`, ready: sql<number>`(count(*) filter (where ${R.refundStatus} = 'ready'))::int`,
      processing: sql<number>`(count(*) filter (where ${R.refundStatus} = 'processing'))::int`, failed: sql<number>`(count(*) filter (where ${R.refundStatus} = 'failed'))::int`,
    }).from(R).innerJoin(O, and(eq(O.id, R.orderId), eq(O.vendorId, R.vendorId))).where(and(...base, p.tabs.refund_pending!)),
  ]);
  const items = await loadItems(tx, vendorId, rows.map((x) => x.r.id));
  return {
    items: rows.map(({ r, o }) => ({
      returnId: r.id, number: r.number, orderNumber: o.number, channel: channelOf(c, o.marketplace), product: { title: items.get(r.id)?.[0]?.title ?? null, sku: items.get(r.id)?.[0]?.sku ?? null },
      refund: { status: r.refundStatus, amountMinor: r.refundAmountMinor, currency: r.refundCurrency ?? o.currency, source: r.refundSource as 'connector' | 'manual' | null, error: r.refundError },
      returnStatus: r.status, inspectionStatus: r.inspectionStatus, lastUpdateAt: r.updatedAt.toISOString(),
      action: { key: r.refundStatus === 'failed' ? 'review_failure' : r.refundStatus === 'processed' ? 'view' : 'review_refund', href: `/api/v1/returns/${r.id}/refund` },
    })),
    total: tot?.n ?? 0,
    counts: { pending: counts?.pending ?? 0, ready: counts?.ready ?? 0, processing: counts?.processing ?? 0, failed: counts?.failed ?? 0 },
  };
}

export async function refundView(tx: Tx, c: Container, vendorId: string, id: string) {
  const r = await getReturnRow(tx, vendorId, id);
  const [o] = await tx.select().from(O).where(and(eq(O.id, r.orderId), eq(O.vendorId, vendorId)));
  const items = (await loadItems(tx, vendorId, [id])).get(id) ?? [];
  const events = (await tx.select().from(schema.returnEvents).where(and(eq(schema.returnEvents.vendorId, vendorId), eq(schema.returnEvents.returnOrderId, id))).orderBy(schema.returnEvents.id)).filter((e) => (e.metadata as { kind?: string }).kind === 'refund');
  const users = await loadUsers(tx, vendorId, events.map((e) => e.actorId));
  const channel = channelOf(c, o?.marketplace ?? 'unknown');
  const find = (st: string[]) => events.find((e) => st.includes(String((e.metadata as { status?: string }).status)));
  const inspected = ['passed', 'failed', 'requires_review'].includes(r.inspectionStatus);
  const approvedEv = find(['ready', 'processing', 'processed', 'failed']), processingEv = find(['processing']), doneEv = find(['processed']);
  const a = (e?: (typeof events)[number]) => (e?.actorId ? { id: e.actorId, name: users.get(e.actorId) ?? null } : null);
  const st = r.refundStatus;
  const timeline = [
    { step: 'requested', status: st === 'not_applicable' ? 'pending' : 'complete', actor: { id: null, name: `Customer via ${channel.name}` }, at: st === 'not_applicable' ? null : r.createdAt.toISOString(), note: null },
    { step: 'approved', status: ['ready', 'processing', 'processed', 'failed'].includes(st) ? 'complete' : 'pending', actor: a(approvedEv), at: iso(approvedEv?.createdAt), note: ['ready', 'processing', 'processed', 'failed'].includes(st) ? null : inspected ? 'Awaiting operator confirmation' : 'Awaiting inspection decision' },
    { step: 'processing', status: ['processing', 'processed', 'failed'].includes(st) ? 'complete' : 'pending', actor: r.refundSource === 'connector' ? { id: null, name: channel.name } : a(processingEv), at: iso(processingEv?.createdAt), note: st === 'failed' ? r.refundError : st === 'processing' ? `Waiting for ${channel.name}` : null },
    { step: 'completed', status: st === 'processed' ? 'complete' : 'pending', actor: null, at: iso(r.refundedAt ?? doneEv?.createdAt), note: st === 'processed' ? (r.refundReference ? `Reference ${r.refundReference}` : null) : 'No connector completion received' },
  ];
  return {
    returnId: r.id, number: r.number, orderId: r.orderId, orderNumber: o?.orderNumber ?? null, channel, product: { title: items[0]?.title ?? null, sku: items[0]?.sku ?? null }, quantity: items.reduce((n, i) => n + i.quantity, 0),
    refund: { status: st, amountMinor: r.refundAmountMinor, currency: r.refundCurrency ?? o?.currency ?? null, source: r.refundSource, reference: r.refundReference, error: r.refundError, refundedAt: iso(r.refundedAt), lastUpdateAt: r.updatedAt.toISOString(), amountFrom: r.refundSource ?? 'order' },
    returnStatus: r.status, inspectionStatus: r.inspectionStatus, actionable: refundActionable(r), timeline,
    note: 'Return approval is not refund approval. Inspect and decide before proceeding with a supported refund action.',
    actions: [
      { key: 'view_inspection', label: 'View return inspection', method: 'GET', href: `/api/v1/returns/${id}/inspection`, enabled: true },
      { key: 'record_refund', label: 'Record or request refund', method: 'POST', href: `/api/v1/returns/${id}/refund`, enabled: refundActionable(r) && st !== 'processing' },
      { key: 'retry_refund', label: 'Retry refund', method: 'POST', href: `/api/v1/returns/${id}/refund/retry`, enabled: st === 'failed' },
    ],
  };
}

// ------------------------------------------------------------------------------------------------
// create from an order
// ------------------------------------------------------------------------------------------------
const FULFILLED = ['dispatched', 'in_transit', 'delivered', 'returned'];
export async function eligibility(tx: Tx, c: Container, vendorId: string, query: string) {
  const term = query.trim().replace(/^#/, '');
  if (!term) throw Errors.validation({ issues: [{ path: 'order', message: 'enter an order number' }] });
  const [o] = await tx.select().from(O).where(and(eq(O.vendorId, vendorId), or(eq(O.orderNumber, term), eq(O.externalOrderId, term), eq(O.orderNumber, `#${term}`))!)).orderBy(sql`${O.placedAt} desc`).limit(1);
  if (!o) throw Errors.notFound('Order', term);
  const allowed = allowedCreateChannels(c);
  if (!allowed.includes(o.marketplace)) throw new AppError('CONFLICT', 'Returns can only be created for orders from a connected Shopify store', { details: { rule: 'channel_not_supported', marketplace: o.marketplace, allowed } });
  if (!FULFILLED.includes(o.status)) throw new AppError('CONFLICT', `A ${o.status} order has not been fulfilled; only fulfilled orders can be returned`, { details: { rule: 'order_not_fulfilled', status: o.status } });
  const lines = await tx.select({ i: OI, options: schema.productVariants.optionValues }).from(OI).leftJoin(schema.productVariants, and(eq(schema.productVariants.id, OI.variantId), eq(schema.productVariants.vendorId, OI.vendorId))).where(and(eq(OI.vendorId, vendorId), eq(OI.orderId, o.id))).orderBy(OI.createdAt, OI.id);
  const used = lines.length ? await tx.select({ id: RI.orderItemId, n: sql<number>`coalesce(sum(${RI.quantity}), 0)::int` }).from(RI).innerJoin(R, and(eq(R.id, RI.returnOrderId), eq(R.vendorId, RI.vendorId))).where(and(eq(RI.vendorId, vendorId), inArray(RI.orderItemId, lines.map((l) => l.i.id)), inArray(R.status, ['requested', 'approved', 'pickup_scheduled', 'picked_up', 'in_transit', 'received', 'inspecting', 'completed']))).groupBy(RI.orderItemId) : [];
  const usedBy = new Map(used.map((u) => [u.id, u.n]));
  const items = lines.map(({ i, options }) => {
    const already = usedBy.get(i.id) ?? 0;
    return { orderItemId: i.id, title: i.title, variant: options && Object.keys(options).length ? Object.values(options).join(' / ') : null, sku: i.sku, fulfilledQty: i.quantity, alreadyReturnedQty: already, availableQty: Math.max(0, i.quantity - already), unitPriceMinor: i.unitPriceMinor };
  });
  return {
    order: { id: o.id, number: o.orderNumber, externalOrderId: o.externalOrderId, channel: channelOf(c, o.marketplace), status: o.status, fulfilled: true, placedAt: o.placedAt.toISOString(), customer: customerOf(o.buyer as Record<string, unknown>, true), itemCount: items.reduce((n, i) => n + i.fulfilledQty, 0), totalMinor: o.totalMinor, currency: o.currency },
    items, note: 'Only fulfilled items are eligible. Quantities cannot exceed the amount available to return. Creating a return does not issue a refund.',
  };
}

// ------------------------------------------------------------------------------------------------
// analytics
// ------------------------------------------------------------------------------------------------
const REASON_PHRASE: Record<string, string> = {
  size_fit: 'a sizing issue', damaged_in_transit: 'products arriving damaged', defective: 'defective products', wrong_item_sent: 'receiving the wrong item', not_as_described: 'products not as described', changed_mind: 'customers changing their mind', late_delivery: 'late delivery',
};
export async function analytics(tx: Tx, vendorId: string, days: number, sample: number) {
  const recent = await tx.select({ id: R.id, reason: R.reasonCode }).from(R).where(and(eq(R.vendorId, vendorId), sql`${R.createdAt} >= now() - make_interval(days => ${days}::int)`)).orderBy(sql`${R.createdAt} desc`, sql`${R.id} desc`).limit(sample);
  const total = recent.length;
  const ids = recent.map((x) => x.id);
  const lines = ids.length ? await tx.select({ rid: RI.returnOrderId, qty: RI.quantity, sku: OI.sku, title: OI.title }).from(RI).innerJoin(OI, and(eq(OI.id, RI.orderItemId), eq(OI.vendorId, RI.vendorId))).where(and(eq(RI.vendorId, vendorId), inArray(RI.returnOrderId, ids))) : [];
  const reasonOf = new Map(recent.map((x) => [x.id, x.reason]));
  const counts = new Map<string, number>();
  for (const x of recent) counts.set(x.reason, (counts.get(x.reason) ?? 0) + 1);
  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  const reasons = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code, count]) => ({ code, label: reasonLabel(code), count, sharePct: pct(count) }));
  // concentration: how few products explain half of the returned units
  const bySku = new Map<string, { title: string; units: number }>();
  for (const l of lines) { const e = bySku.get(l.sku) ?? { title: l.title, units: 0 }; e.units += l.qty; bySku.set(l.sku, e); }
  const sorted = [...bySku.values()].sort((a, b) => b.units - a.units);
  const units = sorted.reduce((n, x) => n + x.units, 0);
  let acc = 0, products = 0;
  for (const x of sorted) { acc += x.units; products++; if (acc * 2 >= units) break; }
  const concentration = { products, text: total ? `Return activity is concentrated around ${products} product${products === 1 ? '' : 's'}.` : 'No returns in this window.' };
  const intelligence: Array<{ kind: 'reason_spike' | 'sku_baseline'; text: string; evidence: string; action: { key: string; label: string; href: string } }> = [];
  if (total >= 3) {
    for (const r of reasons) {
      if (r.code === 'other' || r.sharePct <= 15) continue;
      const perSku = new Map<string, { title: string; n: number }>();
      for (const l of lines) if (reasonOf.get(l.rid) === r.code) { const e = perSku.get(l.sku) ?? { title: l.title, n: 0 }; e.n++; perSku.set(l.sku, e); }
      const top = [...perSku.entries()].sort((a, b) => b[1].n - a[1].n)[0];
      intelligence.push({
        kind: 'reason_spike', text: `${Math.round(r.sharePct)}% of recent returns mention ${REASON_PHRASE[r.code] ?? r.label.toLowerCase()}.`,
        evidence: `${r.count} of the last ${total} returns${top ? `. ${top[1].title} ${top[0]} accounts for ${top[1].n} of those mentions` : ''}.`,
        action: r.code === 'size_fit' ? { key: 'review_size_chart', label: 'Review size chart', href: top ? `/products?sku=${encodeURIComponent(top[0])}` : '/products' } : { key: 'review_returns', label: 'Review returns', href: `/returns?reason=${r.code}` },
      });
    }
  }
  const spikes = await tx.select({ sku: OI.sku, title: OI.title, recent: sql<number>`(count(distinct ${R.id}) filter (where ${R.createdAt} >= now() - interval '7 days'))::int`, prev: sql<number>`(count(distinct ${R.id}) filter (where ${R.createdAt} >= now() - interval '14 days' and ${R.createdAt} < now() - interval '7 days'))::int` })
    .from(RI).innerJoin(R, and(eq(R.id, RI.returnOrderId), eq(R.vendorId, RI.vendorId))).innerJoin(OI, and(eq(OI.id, RI.orderItemId), eq(OI.vendorId, RI.vendorId)))
    .where(and(eq(RI.vendorId, vendorId), sql`${R.createdAt} >= now() - interval '14 days'`)).groupBy(OI.sku, OI.title).having(sql`count(distinct ${R.id}) filter (where ${R.createdAt} >= now() - interval '7 days') >= 2 and count(distinct ${R.id}) filter (where ${R.createdAt} >= now() - interval '7 days') >= 2 * count(distinct ${R.id}) filter (where ${R.createdAt} >= now() - interval '14 days' and ${R.createdAt} < now() - interval '7 days')`).limit(50);
  for (const sp of [...spikes].sort((a, b) => b.recent - a.recent || a.sku.localeCompare(b.sku)).slice(0, 5)) intelligence.push({ kind: 'sku_baseline', text: 'Return activity for this SKU is higher than its recent baseline.', evidence: `${sp.sku} . ${sp.recent} returns in 7 days vs. ${sp.prev} in the preceding 7 days.`, action: { key: 'inspect_product', label: 'Inspect Product', href: `/products?sku=${encodeURIComponent(sp.sku)}` } });
  return { window: { returns: total, days, sample }, reasons, concentration, intelligence, recommendationOnly: true as const, note: 'Recommendations only. This never changes listings, inventory, or refund decisions.' };
}

// ------------------------------------------------------------------------------------------------
// attention list (computed live)
// ------------------------------------------------------------------------------------------------
const money = (minor: number | null, cur: string | null) => (minor == null ? 'amount unknown' : `${(minor / 100).toFixed(2)} ${cur ?? ''}`.trim());
export async function attentionList(tx: Tx, vendorId: string, limit = 500) {
  const s = await returnSettings(tx, vendorId);
  const p = predicates(s);
  const any = or(p.issues.inspection_overdue, p.issues.refund_pending, p.issues.quantity_mismatch, p.issues.disposition_missing)!;
  const rows = await joinO(tx).where(and(eq(R.vendorId, vendorId), any)).orderBy(sql`${R.createdAt} desc`, sql`${R.id} desc`).limit(limit);
  const items = await loadItems(tx, vendorId, rows.map((x) => x.r.id));
  const out = rows.map(({ r, o }) => {
    const its = items.get(r.id) ?? [];
    const expected = its.reduce((n, i) => n + i.quantity, 0), received = its.reduce((n, i) => n + i.received, 0);
    const inOpen = ['received', 'inspecting'].includes(r.status);
    const found: string[] = [];
    if (inOpen && received < expected) found.push('quantity_mismatch');
    if (inOpen && ['not_started', 'in_progress'].includes(r.inspectionStatus) && r.receivedAt && r.receivedAt.getTime() < Date.now() - s.inspectionOverdueHours * 3_600_000) found.push('inspection_overdue');
    if (inOpen && ['passed', 'failed', 'requires_review'].includes(r.inspectionStatus) && its.some((i) => i.received > i.decided)) found.push('disposition_missing');
    if (refundActionable(r)) found.push('refund_pending');
    const issue = found[0] ?? 'refund_pending';
    const href = `/api/v1/returns/${r.id}`;
    const cur = r.refundCurrency ?? o.currency;
    const impact: Record<string, string> = {
      quantity_mismatch: `Expected ${expected}, received ${received}`,
      inspection_overdue: `Received ${r.receivedAt ? r.receivedAt.toISOString().slice(0, 10) : 'recently'}, inspection ${r.inspectionStatus === 'in_progress' ? 'in progress' : 'not started'}`,
      disposition_missing: `Refund ${r.refundStatus.replace('_', ' ')}, stock destination not confirmed`,
      refund_pending: `Refund ${r.refundStatus}, ${money(r.refundAmountMinor, cur)}${(r.refundAmountMinor ?? 0) >= s.highValueMinor ? ', high-value review required' : ''}${r.refundStatus === 'failed' && r.refundError ? `, ${r.refundError}` : ''}`,
    };
    const action: Record<string, { text: string; href: string }> = {
      quantity_mismatch: { text: 'Review inspection', href: `${href}/inspection` },
      inspection_overdue: { text: r.inspectionStatus === 'in_progress' ? 'Resume inspection' : 'Start inspection', href: `${href}/inspection` },
      disposition_missing: { text: 'Review disposition', href: `${href}/disposition-options` },
      refund_pending: { text: r.refundStatus === 'failed' ? 'Review connector failure' : 'Review refund', href: `${href}/refund` },
    };
    return { returnId: r.id, number: r.number, orderNumber: o.number, issue: issue as 'inspection_overdue' | 'refund_pending' | 'quantity_mismatch' | 'disposition_missing', signals: found, impact: impact[issue]!, recommendedAction: action[issue]! };
  }).filter((x) => x.signals.length > 0);
  return { total: out.length, items: out };
}
