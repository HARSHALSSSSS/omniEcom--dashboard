import { and, eq, inArray, schema, sql, type SQL, type Tx } from '@oms/database';
import { Errors } from '@oms/shared';
import type { Container } from '@oms/module-kit';
import { DISPOSITION_OPTIONS, RETURN_STAGES, STAGE_LABELS, reasonLabel, recommend, returnStage, type ReturnStage } from './domain';
import { predicates, returnSettings } from './dashboard';
import { connectorSupportsRefund, getReturnRow, type ReturnRow } from './service';

const R = schema.returnOrders;
const RI = schema.returnItems;
const O = schema.orders;
const OI = schema.orderItems;

const OPEN_FOR_EXPOSURE = ['pending', 'ready', 'processing', 'failed'];
const count = (pred: SQL) => sql<number>`(count(*) filter (where ${pred}))::int`;
const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const dayKey = (d: Date, tz: string): string => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

async function timezoneOf(tx: Tx, vendorId: string): Promise<string> {
  const [v] = await tx.select({ tz: schema.vendors.timezone }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  return v?.tz ?? 'Asia/Kolkata';
}

// ------------------------------------------------------------------------------------------------
// summary (KPI tiles)
// ------------------------------------------------------------------------------------------------
/** returns that count towards the return rate: a rejected or cancelled request never became a return */
const COUNTED = sql`${R.status} not in ('rejected', 'cancelled')`;

async function rate(tx: Tx, vendorId: string, from: Date, to: Date) {
  const [[ret], [ord]] = await Promise.all([
    tx.select({ n: sql<number>`count(distinct ${R.orderId})::int` }).from(R).where(and(eq(R.vendorId, vendorId), COUNTED, sql`${R.createdAt} >= ${from}`, sql`${R.createdAt} < ${to}`)),
    tx.select({ n: sql<number>`count(*)::int` }).from(O).where(and(eq(O.vendorId, vendorId), sql`${O.status} <> 'cancelled'`, sql`${O.placedAt} >= ${from}`, sql`${O.placedAt} < ${to}`)),
  ]);
  return { returnedOrders: ret?.n ?? 0, orders: ord?.n ?? 0, percent: pct(ret?.n ?? 0, ord?.n ?? 0) };
}

export async function summary(tx: Tx, vendorId: string, days: number, now: Date = new Date()) {
  const s = await returnSettings(tx, vendorId);
  const p = predicates(s);
  const tz = await timezoneOf(tx, vendorId);
  const since = new Date(now.getTime() - days * 86_400_000);
  const prevSince = new Date(since.getTime() - days * 86_400_000);
  const today = dayKey(now, tz);
  const [[tiles], exposure, stageRows, current, previous, recent] = await Promise.all([
    tx.select({
      open: count(sql`${R.status} in ('requested','approved','pickup_scheduled','picked_up','in_transit','received','inspecting')`),
      awaitingInspection: count(p.signals.awaiting_inspection), inspectionOverdue: count(p.issues.inspection_overdue), refundsPending: count(p.signals.refunds_pending),
      inWindow: count(sql`${R.createdAt} >= ${since}`),
    }).from(R).where(eq(R.vendorId, vendorId)),
    tx.select({ currency: sql<string>`coalesce(${R.refundCurrency}, ${O.currency})`, n: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(${R.refundAmountMinor}), 0)::bigint::float8`, actionable: count(p.signals.refunds_pending) })
      .from(R).innerJoin(O, and(eq(O.id, R.orderId), eq(O.vendorId, R.vendorId)))
      .where(and(eq(R.vendorId, vendorId), sql`${R.status} not in ('rejected','cancelled')`, inArray(R.refundStatus, OPEN_FOR_EXPOSURE))).groupBy(sql`coalesce(${R.refundCurrency}, ${O.currency})`),
    tx.select({ status: R.status, inspection: R.inspectionStatus, refund: R.refundStatus, n: sql<number>`count(*)::int` }).from(R).where(eq(R.vendorId, vendorId)).groupBy(R.status, R.inspectionStatus, R.refundStatus),
    rate(tx, vendorId, since, now), rate(tx, vendorId, prevSince, since),
    tx.select({ createdAt: R.createdAt }).from(R).where(and(eq(R.vendorId, vendorId), sql`${R.createdAt} >= ${new Date(now.getTime() - 2 * 86_400_000)}`)),
  ]);
  const stages = Object.fromEntries(RETURN_STAGES.map((k) => [k, 0])) as Record<ReturnStage, number>;
  for (const r of stageRows) stages[returnStage({ status: r.status, inspectionStatus: r.inspection, refundStatus: r.refund })] += r.n;
  const main = [...exposure].sort((a, b) => b.amount - a.amount)[0];
  return {
    window: { days, since: since.toISOString() },
    requests: { total: tiles!.inWindow, today: recent.filter((x) => dayKey(x.createdAt, tz) === today).length, open: tiles!.open },
    pendingInspections: { count: tiles!.awaitingInspection, overdue: tiles!.inspectionOverdue, overdueAfterHours: s.inspectionOverdueHours },
    returnRate: {
      percent: current.percent, returnedOrders: current.returnedOrders, orders: current.orders, previousPercent: previous.percent,
      deltaPoints: current.percent !== null && previous.percent !== null ? Math.round((current.percent - previous.percent) * 10) / 10 : null,
    },
    // what the customers are still owed on returns that are not rejected / cancelled; `actionable` = already inspected, refund can be issued
    refundExposure: { count: exposure.reduce((n, e) => n + e.n, 0), amountMinor: Math.round(main?.amount ?? 0), currency: main?.currency?.trim() ?? 'INR', actionableCount: exposure.reduce((n, e) => n + e.actionable, 0), mixedCurrencies: exposure.length > 1, byCurrency: exposure.map((e) => ({ currency: e.currency.trim(), count: e.n, amountMinor: Math.round(e.amount) })) },
    stages: RETURN_STAGES.map((k) => ({ stage: k, label: STAGE_LABELS[k], count: stages[k] })),
  };
}

// ------------------------------------------------------------------------------------------------
// insights
// ------------------------------------------------------------------------------------------------
export async function insights(tx: Tx, vendorId: string, days: number, now: Date = new Date()) {
  const tz = await timezoneOf(tx, vendorId);
  const since = new Date(now.getTime() - days * 86_400_000);
  const inWin = and(eq(R.vendorId, vendorId), COUNTED, sql`${R.createdAt} >= ${since}`);
  const [reasons, skus, sold, channels, daily] = await Promise.all([
    tx.select({ code: R.reasonCode, n: sql<number>`count(*)::int` }).from(R).where(inWin).groupBy(R.reasonCode).orderBy(sql`count(*) desc`, R.reasonCode),
    tx.select({ sku: OI.sku, title: sql<string>`min(${OI.title})`, returns: sql<number>`count(distinct ${R.id})::int`, units: sql<number>`coalesce(sum(${RI.quantity}), 0)::int` })
      .from(RI).innerJoin(R, and(eq(R.id, RI.returnOrderId), eq(R.vendorId, RI.vendorId))).innerJoin(OI, and(eq(OI.id, RI.orderItemId), eq(OI.vendorId, RI.vendorId))).where(inWin).groupBy(OI.sku).orderBy(sql`sum(${RI.quantity}) desc`, OI.sku).limit(10),
    tx.select({ sku: OI.sku, units: sql<number>`coalesce(sum(${OI.quantity}), 0)::int` }).from(OI).innerJoin(O, and(eq(O.id, OI.orderId), eq(O.vendorId, OI.vendorId)))
      .where(and(eq(OI.vendorId, vendorId), sql`${O.status} <> 'cancelled'`, sql`${O.placedAt} >= ${since}`)).groupBy(OI.sku),
    tx.select({ code: O.marketplace, n: sql<number>`count(*)::int` }).from(R).innerJoin(O, and(eq(O.id, R.orderId), eq(O.vendorId, R.vendorId))).where(inWin).groupBy(O.marketplace).orderBy(sql`count(*) desc`, O.marketplace),
    tx.select({ createdAt: R.createdAt, units: sql<number>`(select coalesce(sum(ri.quantity), 0)::int from return_items ri where ri.return_order_id = "return_orders"."id" and ri.vendor_id = "return_orders"."vendor_id")` }).from(R).where(inWin),
  ]);
  const total = reasons.reduce((n, r) => n + r.n, 0);
  const soldBy = new Map(sold.map((x) => [x.sku, x.units]));
  // trend: a point per day (up to 31 days) or per week; empty days are zero, not missing
  const granularity = days <= 31 ? 'day' as const : 'week' as const;
  const keyOf = (d: Date): string => {
    const k = dayKey(d, tz);
    if (granularity === 'day') return k;
    const dt = new Date(`${k}T00:00:00Z`); const back = (dt.getUTCDay() + 6) % 7; // week starts on Monday
    return new Date(dt.getTime() - back * 86_400_000).toISOString().slice(0, 10);
  };
  const buckets = new Map<string, { returns: number; units: number }>();
  const step = granularity === 'day' ? 86_400_000 : 7 * 86_400_000;
  for (let t = new Date(`${keyOf(since)}T00:00:00Z`).getTime(); t <= new Date(`${keyOf(now)}T00:00:00Z`).getTime(); t += step) buckets.set(new Date(t).toISOString().slice(0, 10), { returns: 0, units: 0 });
  for (const d of daily) { const b = buckets.get(keyOf(d.createdAt)); if (b) { b.returns += 1; b.units += d.units; } }
  return {
    window: { days, since: since.toISOString(), returns: total },
    reasons: reasons.map((r) => ({ code: r.code, label: reasonLabel(r.code), count: r.n, sharePercent: pct(r.n, total) })),
    topSkus: skus.map((s) => ({ sku: s.sku, title: s.title, returns: s.returns, unitsReturned: s.units, unitsSold: soldBy.get(s.sku) ?? 0, returnRatePercent: pct(s.units, soldBy.get(s.sku) ?? 0) })),
    channels: channels.map((c) => ({ code: c.code, returns: c.n, sharePercent: pct(c.n, total) })),
    trend: { granularity, points: [...buckets].map(([date, v]) => ({ date, returns: v.returns, units: v.units })) },
  };
}

// ------------------------------------------------------------------------------------------------
// next actions
// ------------------------------------------------------------------------------------------------
export interface Input { name: string; type: 'uuid' | 'string' | 'integer' | 'enum' | 'array'; required: boolean; default?: unknown; options?: Array<{ value: string; label: string; description?: string }>; note?: string }
export interface NextAction { key: 'approve' | 'receive' | 'inspection' | 'disposition' | 'refund' | 'complete'; label: string; method: 'POST'; href: string; permission: string; done: boolean; enabled: boolean; disabledReason: string | null; inputs: Input[] }

interface Facts {
  id: string; status: string; inspectionStatus: string; refundStatus: string; refundSource: string | null; warehouseId: string | null; refundAmountMinor: number | null; marketplace: string; orderTotalMinor: number;
  items: Array<{ id: string; sku: string | null; quantity: number; received: number; decided: number }>; connectorRefund: boolean;
  suggestion: ReturnType<typeof recommend>;
}

const FINISHED = ['passed', 'failed', 'requires_review'];

/** the steps of the return flow in order, each with whether it can be done now, why not, and what the call needs */
export function nextActions(f: Facts): NextAction[] {
  const closed = ['rejected', 'cancelled'].includes(f.status);
  const base = `/api/v1/returns/${f.id}`;
  const expected = f.items.reduce((n, i) => n + i.quantity, 0);
  const received = f.items.reduce((n, i) => n + i.received, 0);
  const undecided = f.items.reduce((n, i) => n + (i.received - i.decided), 0);
  const inWarehouse = ['received', 'inspecting'].includes(f.status);
  const step = (key: NextAction['key'], label: string, href: string, permission: string, done: boolean, reason: string | null, inputs: Input[] = []): NextAction => {
    const why = done ? 'Already done' : closed ? `The return was ${f.status}` : reason;
    return { key, label, method: 'POST', href: `${base}/${href}`, permission, done, enabled: !done && why === null, disabledReason: why, inputs };
  };
  const approvedOn = !['requested', 'rejected', 'cancelled'].includes(f.status);
  const fullyReceived = received >= expected && expected > 0 && approvedOn;
  const inspected = ['passed', 'failed'].includes(f.inspectionStatus) && inWarehouse || f.status === 'completed';
  const decidedAll = f.status === 'completed' || (received > 0 && undecided === 0);
  const refundDone = f.refundStatus === 'processed';
  const refundable = FINISHED.includes(f.inspectionStatus) && ['received', 'inspecting', 'completed'].includes(f.status);

  const approve = step('approve', 'Approve return', 'approve', 'returns:write', approvedOn, f.status === 'requested' ? null : 'Only a requested return can be approved', [{ name: 'note', type: 'string', required: false }, { name: 'warehouseId', type: 'uuid', required: false, note: 'warehouse that should receive the goods' }]);
  const receive = step('receive', 'Receive goods', 'receive', 'returns:write', fullyReceived && f.status !== 'approved', !approvedOn ? 'Approve the return first' : !(['approved', 'pickup_scheduled', 'picked_up', 'in_transit', 'received'].includes(f.status)) ? `Goods cannot be received for a ${f.status} return` : received >= expected ? 'Every expected unit is already received' : null, [
    { name: 'warehouseId', type: 'uuid', required: true, default: f.warehouseId },
    { name: 'items', type: 'array', required: true, note: 'returnItemId + quantity (at most what is still expected)', default: f.items.filter((i) => i.quantity > i.received).map((i) => ({ returnItemId: i.id, sku: i.sku, quantity: i.quantity - i.received })) },
  ]);
  const inspection = step('inspection', 'Inspect goods', 'inspection', 'returns:write', inspected, !inWarehouse ? (approvedOn ? 'Receive the goods first' : 'Approve and receive the return first') : null, [
    { name: 'result', type: 'enum', required: true, options: [{ value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }, { value: 'needs_review', label: 'Needs review' }] }, { name: 'checklist', type: 'array', required: true }, { name: 'note', type: 'string', required: false },
  ]);
  const disposition = step('disposition', 'Choose disposition', 'disposition', 'returns:write', decidedAll, !inWarehouse ? 'Receive the goods first' : !FINISHED.includes(f.inspectionStatus) ? 'Finish the inspection first' : undecided === 0 ? 'Every received unit is already decided' : null, [
    { name: 'kind', type: 'enum', required: true, default: f.suggestion.kind, options: DISPOSITION_OPTIONS.map((o) => ({ value: o.kind, label: o.label, description: o.description })), note: f.suggestion.reason },
    { name: 'items', type: 'array', required: false, note: 'defaults to every received, undecided unit' },
  ]);
  const retry = f.refundStatus === 'failed';
  const refund = step('refund', retry ? 'Retry refund' : 'Refund customer', retry ? 'refund/retry' : 'refund', 'returns:refund', refundDone,
    f.refundStatus === 'not_applicable' ? 'No refund is due for this return' : !refundable ? (inWarehouse || f.status === 'completed' ? 'Finish the inspection before refunding' : 'Receive and inspect the return first') : null,
    retry ? [] : [
      { name: 'mode', type: 'enum', required: true, default: 'manual', options: [{ value: 'manual', label: 'Record manually' }, ...(f.connectorRefund ? [{ value: 'connector', label: `Ask ${f.marketplace} to refund` }] : [])] },
      { name: 'amountMinor', type: 'integer', required: false, default: f.refundAmountMinor, note: `at most the order total (${f.orderTotalMinor})` }, { name: 'reference', type: 'string', required: false },
    ]);
  const complete = step('complete', 'Complete return', 'complete', 'returns:write', f.status === 'completed', !inWarehouse ? 'Receive the goods first' : undecided > 0 ? 'Some received units have no decision yet' : null, [{ name: 'acceptShort', type: 'enum', required: false, options: [{ value: 'true', label: 'Accept missing units' }], note: expected > received ? `${expected - received} unit(s) never arrived` : undefined }]);
  return [approve, receive, inspection, disposition, refund, complete];
}

export async function nextActionsFor(tx: Tx, c: Container, vendorId: string, id: string) {
  const r: ReturnRow = await getReturnRow(tx, vendorId, id);
  const [items, [o]] = await Promise.all([
    tx.select({ id: RI.id, sku: OI.sku, quantity: RI.quantity, received: RI.receivedQuantity, decided: RI.dispositionedQuantity }).from(RI).innerJoin(OI, and(eq(OI.id, RI.orderItemId), eq(OI.vendorId, RI.vendorId))).where(and(eq(RI.vendorId, vendorId), eq(RI.returnOrderId, id))).orderBy(RI.createdAt, RI.id),
    tx.select({ marketplace: O.marketplace, total: O.totalMinor }).from(O).where(and(eq(O.id, r.orderId), eq(O.vendorId, vendorId))),
  ]);
  if (!o) throw Errors.notFound('Order', r.orderId);
  const mismatch = r.status === 'received' && items.some((i) => i.received < i.quantity) ? { expected: items.reduce((n, i) => n + i.quantity, 0), received: items.reduce((n, i) => n + i.received, 0) } : null;
  const actions = nextActions({
    id, status: r.status, inspectionStatus: r.inspectionStatus, refundStatus: r.refundStatus, refundSource: r.refundSource, warehouseId: r.warehouseId, refundAmountMinor: r.refundAmountMinor, marketplace: o.marketplace, orderTotalMinor: o.total,
    items, connectorRefund: connectorSupportsRefund(c as never, o.marketplace), suggestion: recommend({ inspectionStatus: r.inspectionStatus, quantityMismatch: mismatch }),
  });
  const next = actions.find((a) => a.enabled) ?? null;
  return { returnId: id, number: r.number, status: r.status, stage: returnStage(r), stageLabel: STAGE_LABELS[returnStage(r)], next: next?.key ?? null, actions };
}
