import { and, count, eq, ilike, inArray, ne, or, schema, sql, type SQL, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { evaluate, liveRules, type Facts, type RuleDef } from '@oms/mod-rules';
import { getFulfillment } from '@oms/mod-fulfillment';
import { effects, type Container, type OpCtx } from '@oms/module-kit';
import { connectorName, flagsFor, isVerified, methodName, type CapFlags, type MethodKind, type MethodRow, METHOD_KINDS } from './methods';

/**
 * The shipping DECISION per order: which kind of method moves a packed parcel, before a label exists.
 * Recommendation precedence: matching `shipping` rule -> per-marketplace override (fulfillment_preferences) -> default method.
 */
const F = schema.fulfillments;
const O = schema.orders;
const W = schema.warehouses;
const S = schema.shipments;
const SP = schema.vendorShippingProviders;
const FI = schema.fulfillmentItems;
const OI = schema.orderItems;
const PK = schema.packages;

export const CANDIDATE_STATUSES = ['packed', 'ready_to_ship'] as const;
export const DECISION_STATUSES = ['needs_decision', 'selected', 'label_pending', 'ready_to_dispatch', 'exception'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];
export const SLA_BANDS = ['safe', 'approaching', 'at_risk', 'breached', 'none'] as const;
export type SlaBand = (typeof SLA_BANDS)[number];
export const MANAGED_BY: Record<MethodKind, 'marketplace' | 'merchant' | 'provider'> = { marketplace: 'marketplace', seller: 'merchant', third_party: 'provider' };
export const MAX_BULK = 200;

// ------------------------------------------------------------------------------------------------
// settings + shared context
// ------------------------------------------------------------------------------------------------
export interface Thresholds { atRiskMinutes: number; approachingMinutes: number; awaitingFirstScanHours: number; timezone: string }
export async function loadThresholds(tx: Tx, vendorId: string): Promise<Thresholds> {
  const [v] = await tx.select({ settings: schema.vendors.settings, tz: schema.vendors.timezone }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const s = (v?.settings ?? {}) as { sla?: { atRiskMinutes?: number; approachingMinutes?: number }; shipping?: { awaitingFirstScanHours?: number } };
  return { atRiskMinutes: s.sla?.atRiskMinutes ?? 90, approachingMinutes: s.sla?.approachingMinutes ?? 240, awaitingFirstScanHours: s.shipping?.awaitingFirstScanHours ?? 12, timezone: v?.tz ?? 'Asia/Kolkata' };
}

export function slaOf(due: Date | null, th: Thresholds, now = new Date()): { dueAt: string | null; minutesRemaining: number | null; band: SlaBand } {
  if (!due) return { dueAt: null, minutesRemaining: null, band: 'none' };
  const m = Math.floor((due.getTime() - now.getTime()) / 60_000);
  return { dueAt: due.toISOString(), minutesRemaining: m, band: m < 0 ? 'breached' : m <= th.atRiskMinutes ? 'at_risk' : m <= th.approachingMinutes ? 'approaching' : 'safe' };
}

export interface Preference { defaultMethod: MethodKind; overrides: Record<string, string> }
export interface Base { methods: MethodRow[]; rules: RuleDef[]; pref: Preference | null; th: Thresholds; now: Date }

export async function loadBase(tx: Tx, vendorId: string, now = new Date()): Promise<Base> {
  const [methods, rules, [pref], th] = await Promise.all([
    tx.select().from(SP).where(eq(SP.vendorId, vendorId)).orderBy(SP.createdAt),
    liveRules(tx, vendorId, 'shipping'),
    tx.select().from(schema.fulfillmentPreferences).where(eq(schema.fulfillmentPreferences.vendorId, vendorId)),
    loadThresholds(tx, vendorId),
  ]);
  return { methods, rules, pref: pref ? { defaultMethod: pref.defaultMethod as MethodKind, overrides: pref.overrides } : null, th, now };
}

// ------------------------------------------------------------------------------------------------
// options + recommendation (pure, given the loaded base)
// ------------------------------------------------------------------------------------------------
export interface Option { kind: MethodKind; name: string; available: boolean; reason: string | null; managedBy: 'marketplace' | 'merchant' | 'provider'; providerId: string | null; providers?: Array<{ id: string; name: string }> }

export function optionsFor(c: Container, methods: MethodRow[], marketplace: string): Option[] {
  const mk = methods.find((m) => m.kind === 'marketplace' && m.channelCode === marketplace);
  const sl = methods.find((m) => m.kind === 'seller');
  const tps = methods.filter((m) => m.kind === 'third_party' && m.status === 'active');
  const tp = tps.find((m) => m.isDefault) ?? tps[0];
  const reason = (m: MethodRow | undefined): string | null => (!m ? 'method_not_configured' : m.status !== 'active' ? 'method_disabled' : null);
  return [
    { kind: 'marketplace', name: mk ? methodName(c, mk) : `${connectorName(c, marketplace)} Shipping`, available: reason(mk) === null, reason: reason(mk), managedBy: 'marketplace', providerId: mk?.id ?? null },
    { kind: 'seller', name: 'Seller Shipping', available: reason(sl) === null, reason: reason(sl), managedBy: 'merchant', providerId: sl?.id ?? null },
    { kind: 'third_party', name: tps.length === 1 ? tps[0]!.label : 'Third-party provider', available: tps.length > 0, reason: tps.length > 0 ? null : 'method_not_configured', managedBy: 'provider', providerId: tp?.id ?? null, providers: tps.map((p) => ({ id: p.id, name: p.label })) },
  ];
}

export interface Recommendation { kind: MethodKind; providerId: string | null; name: string; source: 'rule' | 'channel_override' | 'default_preference' | 'fallback'; why: string; ruleId: string | null }

export function recommend(c: Container, base: Base, opts: Option[], marketplace: string, facts: Facts): Recommendation | null {
  const pick = (kind: string | undefined, providerId?: string | null): Option | null => {
    const o = opts.find((x) => x.kind === kind);
    if (!o || !o.available) return null;
    if (providerId && !(o.providers?.some((p) => p.id === providerId) || o.providerId === providerId)) return null;
    return o;
  };
  const mk = (o: Option, source: Recommendation['source'], why: string, ruleId: string | null, providerId?: string | null): Recommendation => ({ kind: o.kind, providerId: providerId ?? o.providerId, name: providerId ? (o.providers?.find((p) => p.id === providerId)?.name ?? o.name) : o.name, source, why, ruleId });
  for (const m of evaluate(base.rules, facts, base.now)) {
    if (m.action.type !== 'prefer_shipping_method') continue;
    const p = m.action.params as { kind?: string; providerId?: string };
    const o = pick(p.kind, p.providerId);
    if (o) return mk(o, 'rule', `Matches your shipping rule "${m.rule.name}".`, m.rule.id, p.providerId);
  }
  const channel = connectorName(c, marketplace);
  const ov = base.pref?.overrides[marketplace];
  const ovo = pick(ov);
  if (ovo) return mk(ovo, 'channel_override', `Matches your default preference for ${channel} orders.`, null);
  const dm = pick(base.pref?.defaultMethod);
  if (dm) return mk(dm, 'default_preference', 'Matches your default shipping preference.', null);
  const first = METHOD_KINDS.map((k) => pick(k)).find(Boolean);
  if (first) return mk(first, 'fallback', base.pref ? 'Your preferred method is not available for this order; this is the first available method.' : 'No default preference is set; this is the first available method.', null);
  return null;
}

export function selectedName(c: Container, methods: MethodRow[], kind: MethodKind, providerId: string | null, marketplace: string): string {
  const m = providerId ? methods.find((x) => x.id === providerId) : undefined;
  if (m) return methodName(c, m);
  return kind === 'marketplace' ? `${connectorName(c, marketplace)} Shipping` : kind === 'seller' ? 'Seller Shipping' : 'Third-party provider';
}

/** what the method chosen for an order can do (null = there is no such method any more) */
export function flagsOfSelection(c: Container, methods: MethodRow[], kind: MethodKind, providerId: string | null, marketplace: string): { flags: CapFlags; verified: boolean } | null {
  const m = (providerId ? methods.find((x) => x.id === providerId && x.kind === kind && x.status === 'active') : undefined)
    ?? methods.find((x) => x.kind === kind && x.status === 'active' && (kind !== 'marketplace' || x.channelCode === marketplace));
  if (!m) return null;
  return { flags: flagsFor(c, m).flags, verified: isVerified(m) };
}

// ------------------------------------------------------------------------------------------------
// facts of an order (what rules are evaluated against)
// ------------------------------------------------------------------------------------------------
export interface OrderInfo { facts: Facts; marketplace: string; itemCount: number; weightGrams: number | null; city: string | null; state: string | null; pincode: string | null; skus: string[]; titles: string[]; warehouseCode: string; totalMinor: number }
const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null);

export async function loadOrderInfo(tx: Tx, vendorId: string, ids: string[]): Promise<Map<string, OrderInfo>> {
  const out = new Map<string, OrderInfo>();
  if (ids.length === 0) return out;
  const [rows, items, weights] = await Promise.all([
    tx.select({ id: F.id, marketplace: O.marketplace, wh: W.code, total: O.totalMinor, addr: O.shippingAddress }).from(F)
      .innerJoin(O, and(eq(O.id, F.orderId), eq(O.vendorId, F.vendorId))).innerJoin(W, and(eq(W.id, F.warehouseId), eq(W.vendorId, F.vendorId))).where(and(eq(F.vendorId, vendorId), inArray(F.id, ids))),
    tx.select({ fid: FI.fulfillmentId, sku: OI.sku, title: OI.title, qty: FI.quantity }).from(FI).innerJoin(OI, and(eq(OI.id, FI.orderItemId), eq(OI.vendorId, FI.vendorId))).where(and(eq(FI.vendorId, vendorId), inArray(FI.fulfillmentId, ids))),
    tx.select({ fid: PK.fulfillmentId, grams: sql<number>`coalesce(sum(${PK.weightGrams}), 0)::int`, withWeight: sql<number>`count(${PK.weightGrams})::int` }).from(PK).where(and(eq(PK.vendorId, vendorId), inArray(PK.fulfillmentId, ids), ne(PK.status, 'cancelled'))).groupBy(PK.fulfillmentId),
  ]);
  for (const r of rows) {
    const mine = items.filter((i) => i.fid === r.id);
    const w = weights.find((x) => x.fid === r.id);
    const weightGrams = w && w.withWeight > 0 ? w.grams : null;
    const a = (r.addr ?? {}) as Record<string, unknown>;
    const city = str(a.city); const state = str(a.state); const pincode = str(a.pincode ?? a.postalCode);
    const skus = mine.map((i) => i.sku); const titles = mine.map((i) => i.title);
    out.set(r.id, {
      marketplace: r.marketplace, itemCount: mine.reduce((n, i) => n + i.qty, 0), weightGrams, city, state, pincode, skus, titles, warehouseCode: r.wh, totalMinor: r.total,
      facts: { marketplace: r.marketplace, warehouse: r.wh, destinationState: state, destinationCity: city, destinationPincode: pincode, orderValueMinor: r.total, sku: skus, product: titles, weightGrams },
    });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// candidates: fulfillments that are packed / ready to ship (not yet dispatched), with the derived decision status
// ------------------------------------------------------------------------------------------------
const availExists = (kind: MethodKind, vendor: SQL | unknown, channel?: SQL | unknown): SQL =>
  sql`EXISTS (SELECT 1 FROM vendor_shipping_providers sp WHERE sp.vendor_id = ${vendor} AND sp.status = 'active' AND sp.kind = ${sql.raw(`'${kind}'`)}${channel ? sql` AND sp.channel_code = ${channel}` : sql``})`; // literal kind (not a parameter) so the same CASE can be grouped by

/** one CASE for list, filter and counts: the status can never differ between them */
export const statusExpr = sql<DecisionStatus>`CASE
  WHEN ${S.id} IS NOT NULL AND ${S.status} = 'created' THEN 'label_pending'
  WHEN ${S.id} IS NOT NULL THEN 'ready_to_dispatch'
  WHEN ${F.shipConfirmedAt} IS NOT NULL AND NOT (CASE ${F.shipMethodKind} WHEN 'marketplace' THEN ${availExists('marketplace', F.vendorId, O.marketplace)} WHEN 'seller' THEN ${availExists('seller', F.vendorId)} WHEN 'third_party' THEN ${availExists('third_party', F.vendorId)} ELSE false END) THEN 'exception'
  WHEN ${F.shipConfirmedAt} IS NOT NULL THEN 'selected'
  WHEN NOT (${availExists('marketplace', F.vendorId, O.marketplace)} OR ${availExists('seller', F.vendorId)} OR ${availExists('third_party', F.vendorId)}) THEN 'exception'
  ELSE 'needs_decision' END`;

const remainingMinutes = sql`EXTRACT(EPOCH FROM (${O.dispatchDueAt} - now())) / 60`;

export interface Candidate {
  id: string; number: string; orderId: string; orderNumber: string; marketplace: string; warehouseId: string; warehouseCode: string; warehouseName: string; status: DecisionStatus; fulfillmentStatus: string;
  kind: MethodKind | null; providerId: string | null; selectedBy: string | null; confirmedAt: Date | null; recommendation: Record<string, unknown>; dueAt: Date | null; totalMinor: number; currency: string; payment: string;
  shipmentId: string | null; shipmentStatus: string | null; createdAt: Date;
}
const candidateFields = {
  id: F.id, number: F.number, orderId: F.orderId, orderNumber: O.orderNumber, marketplace: O.marketplace, warehouseId: F.warehouseId, warehouseCode: W.code, warehouseName: W.name, status: statusExpr, fulfillmentStatus: F.status,
  kind: F.shipMethodKind, providerId: F.shipProviderId, selectedBy: F.shipSelectedBy, confirmedAt: F.shipConfirmedAt, recommendation: F.shipRecommendation, dueAt: O.dispatchDueAt, totalMinor: O.totalMinor, currency: O.currency, payment: O.paymentMethod,
  shipmentId: S.id, shipmentStatus: S.status, createdAt: F.createdAt,
};
/** the shared FROM ... JOIN: fulfillment + order + warehouse + its live shipment */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const joined = (tx: Tx, fields: any) => tx.select(fields).from(F)
  .innerJoin(O, and(eq(O.id, F.orderId), eq(O.vendorId, F.vendorId))).innerJoin(W, and(eq(W.id, F.warehouseId), eq(W.vendorId, F.vendorId))).leftJoin(S, and(eq(S.fulfillmentId, F.id), ne(S.status, 'cancelled')));

export interface DecisionFilter { q?: string; marketplace?: string; warehouse?: string; method?: string; sla?: SlaBand; status?: DecisionStatus }
const baseWhere = (vendorId: string, allowed: string[] | null): SQL[] => [eq(F.vendorId, vendorId), inArray(F.status, [...CANDIDATE_STATUSES]), ...(allowed ? [allowed.length ? inArray(F.warehouseId, allowed) : sql`false`] : [])];

function filterWhere(f: DecisionFilter, th: Thresholds): SQL[] {
  const w: SQL[] = [];
  if (f.q) { const like = `%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`; w.push(or(ilike(O.orderNumber, like), ilike(O.externalOrderId, like), ilike(F.number, like), sql`EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = ${O.id} AND oi.vendor_id = ${O.vendorId} AND oi.sku ILIKE ${like})`)!); }
  if (f.marketplace) w.push(eq(O.marketplace, f.marketplace));
  if (f.warehouse) w.push(eq(F.warehouseId, f.warehouse));
  if (f.method) w.push(f.method === 'unassigned' ? sql`${F.shipMethodKind} IS NULL` : eq(F.shipMethodKind, f.method));
  if (f.status) w.push(sql`${statusExpr} = ${f.status}`);
  if (f.sla === 'none') w.push(sql`${O.dispatchDueAt} IS NULL`);
  if (f.sla === 'breached') w.push(sql`${remainingMinutes} < 0`);
  if (f.sla === 'at_risk') w.push(sql`${remainingMinutes} >= 0 AND ${remainingMinutes} <= ${th.atRiskMinutes}`);
  if (f.sla === 'approaching') w.push(sql`${remainingMinutes} > ${th.atRiskMinutes} AND ${remainingMinutes} <= ${th.approachingMinutes}`);
  if (f.sla === 'safe') w.push(sql`${remainingMinutes} > ${th.approachingMinutes}`);
  return w;
}

export async function candidateRows(tx: Tx, vendorId: string, allowed: string[] | null, o: { filter?: DecisionFilter; th: Thresholds; limit: number; offset?: number }): Promise<Candidate[]> {
  const rows = await joined(tx, candidateFields).where(and(...baseWhere(vendorId, allowed), ...filterWhere(o.filter ?? {}, o.th))).orderBy(sql`${O.dispatchDueAt} ASC NULLS LAST`, F.createdAt, F.id).limit(o.limit).offset(o.offset ?? 0);
  return rows as unknown as Candidate[];
}
export async function candidateCount(tx: Tx, vendorId: string, allowed: string[] | null, filter: DecisionFilter, th: Thresholds): Promise<number> {
  const [r] = await joined(tx, { n: count() }).where(and(...baseWhere(vendorId, allowed), ...filterWhere(filter, th)));
  return Number((r as unknown as { n: number }).n);
}
export async function statusCounts(tx: Tx, vendorId: string, allowed: string[] | null): Promise<Record<DecisionStatus, number>> {
  const rows = await joined(tx, { st: statusExpr, n: count() }).where(and(...baseWhere(vendorId, allowed))).groupBy(sql`1`) as unknown as Array<{ st: DecisionStatus; n: number }>;
  const out = Object.fromEntries(DECISION_STATUSES.map((s) => [s, 0])) as Record<DecisionStatus, number>;
  for (const r of rows) out[r.st] = Number(r.n);
  return out;
}
export async function getCandidate(tx: Tx, vendorId: string, id: string): Promise<Candidate> {
  const [r] = await joined(tx, candidateFields).where(and(eq(F.vendorId, vendorId), eq(F.id, id))) as unknown as Candidate[];
  if (!r) throw Errors.notFound('Fulfillment', id);
  return r;
}

// ------------------------------------------------------------------------------------------------
// DTOs
// ------------------------------------------------------------------------------------------------
export function actionFor(status: DecisionStatus, r: Pick<Candidate, 'id' | 'shipmentId'>) {
  const opts = `/api/v1/shipping/orders/${r.id}/options`;
  switch (status) {
    case 'needs_decision': return { key: 'choose' as const, label: 'Choose shipping', method: 'GET' as const, href: opts, enabled: true };
    case 'selected': return { key: 'review' as const, label: 'Review', method: 'GET' as const, href: opts, enabled: true };
    case 'label_pending': return { key: 'view_label' as const, label: 'View label', method: 'GET' as const, href: `/api/v1/shipments/${r.shipmentId}/label`, enabled: false };
    case 'ready_to_dispatch': return { key: 'dispatch' as const, label: 'Dispatch', method: 'POST' as const, href: `/api/v1/shipments/${r.shipmentId}/dispatch`, enabled: true };
    default: return { key: 'resolve' as const, label: 'Resolve', method: 'GET' as const, href: opts, enabled: true };
  }
}

export function toDecisionItem(c: Container, base: Base, r: Candidate, info: OrderInfo | undefined) {
  const opts = optionsFor(c, base.methods, r.marketplace);
  const rec = info && !r.confirmedAt ? recommend(c, base, opts, r.marketplace, info.facts) : null;
  return {
    fulfillmentId: r.id, fulfillmentNumber: r.number, orderId: r.orderId, number: r.orderNumber, channel: { code: r.marketplace, name: connectorName(c, r.marketplace) },
    warehouse: { id: r.warehouseId, code: r.warehouseCode, name: r.warehouseName }, destination: { city: info?.city ?? null, state: info?.state ?? null },
    valueMinor: r.totalMinor, currency: r.currency.trim(), weightGrams: info?.weightGrams ?? null, itemCount: info?.itemCount ?? 0,
    availableMethods: opts.map((o) => ({ kind: o.kind, name: o.name, available: o.available, ...(o.reason ? { reason: o.reason } : {}) })),
    selectedMethod: r.kind ? { kind: r.kind, name: selectedName(c, base.methods, r.kind, r.providerId, r.marketplace), providerId: r.providerId } : null,
    selectionConfirmed: Boolean(r.confirmedAt), selectedBy: r.selectedBy as 'rule' | 'preference' | 'manual' | null,
    recommendedMethod: rec ? { kind: rec.kind, name: rec.name, why: rec.why, source: rec.source } : null,
    sla: slaOf(r.dueAt, base.th, base.now), status: r.status, shipmentId: r.shipmentId, action: actionFor(r.status, r),
  };
}

export async function listDecisions(tx: Tx, c: Container, vendorId: string, allowed: string[] | null, o: { filter: DecisionFilter; limit: number; offset: number }) {
  const base = await loadBase(tx, vendorId);
  const [rows, total, counts] = await Promise.all([candidateRows(tx, vendorId, allowed, { filter: o.filter, th: base.th, limit: o.limit, offset: o.offset }), candidateCount(tx, vendorId, allowed, o.filter, base.th), statusCounts(tx, vendorId, allowed)]);
  const infos = await loadOrderInfo(tx, vendorId, rows.map((r) => r.id));
  const readyToShip = Object.values(counts).reduce((a, b) => a + b, 0);
  return { items: rows.map((r) => toDecisionItem(c, base, r, infos.get(r.id))), total, counts: { readyToShip, ...counts } };
}

/** the Choose Shipping drawer */
export async function optionsDetail(tx: Tx, c: Container, vendorId: string, id: string) {
  const r = await getCandidate(tx, vendorId, id);
  if (!(CANDIDATE_STATUSES as readonly string[]).includes(r.fulfillmentStatus)) throw new AppError('INVALID_STATE', `This fulfillment is ${r.fulfillmentStatus}: there is no shipping decision to make`, { details: { status: r.fulfillmentStatus } });
  const base = await loadBase(tx, vendorId);
  const info = (await loadOrderInfo(tx, vendorId, [id])).get(id)!;
  const opts = optionsFor(c, base.methods, r.marketplace);
  const rec = recommend(c, base, opts, r.marketplace, info.facts);
  return {
    fulfillmentId: id, orderId: r.orderId, status: r.status,
    order: { number: r.orderNumber, marketplace: { code: r.marketplace, name: connectorName(c, r.marketplace) }, destination: { city: info.city, state: info.state, pincode: info.pincode }, warehouse: { id: r.warehouseId, code: r.warehouseCode, name: r.warehouseName }, product: info.titles[0] ?? null, sku: info.skus[0] ?? null, skus: info.skus, itemCount: info.itemCount, weightGrams: info.weightGrams, valueMinor: r.totalMinor, currency: r.currency.trim() },
    options: opts.map((o) => ({ kind: o.kind, name: o.name, recommended: rec?.kind === o.kind, available: o.available, managedBy: o.managedBy, providerId: o.providerId, providers: o.providers ?? [], selected: r.kind === o.kind && Boolean(r.confirmedAt), ...(o.reason ? { reason: o.reason } : {}) })),
    recommendation: rec ? { kind: rec.kind, providerId: rec.providerId, name: rec.name, why: rec.why, source: rec.source, ruleId: rec.ruleId } : null,
    selection: r.kind ? { kind: r.kind, providerId: r.providerId, confirmed: Boolean(r.confirmedAt), selectedBy: r.selectedBy as 'rule' | 'preference' | 'manual' | null, confirmedAt: r.confirmedAt?.toISOString() ?? null } : null,
  };
}

// ------------------------------------------------------------------------------------------------
// selection (idempotent) + recalculate
// ------------------------------------------------------------------------------------------------
export interface SelectionInput { kind: MethodKind; providerId?: string | null; source: 'recommended' | 'manual_override' }

export async function selectMethod(tx: Tx, ctx: OpCtx, id: string, input: SelectionInput) {
  const f = await getFulfillment(tx, ctx.vendorId, id, true);
  if (!(CANDIDATE_STATUSES as readonly string[]).includes(f.status)) throw new AppError('INVALID_STATE', `A ${f.status} fulfillment is not waiting for a shipping decision`, { details: { status: f.status } });
  const r = await getCandidate(tx, ctx.vendorId, id);
  const base = await loadBase(tx, ctx.vendorId);
  const info = (await loadOrderInfo(tx, ctx.vendorId, [id])).get(id)!;
  const opts = optionsFor(ctx.c, base.methods, r.marketplace);
  const opt = opts.find((o) => o.kind === input.kind)!;
  const unavailable = (reason: string | null): never => { throw new AppError('CONFLICT', 'This shipping method is not available for this order', { details: { rule: 'method_unavailable', kind: input.kind, reason } }); };
  if (!opt.available) unavailable(opt.reason);
  let providerId = opt.providerId;
  if (input.providerId) {
    const ok = input.kind === 'third_party' ? opt.providers?.some((p) => p.id === input.providerId) : opt.providerId === input.providerId;
    if (!ok) unavailable('provider_not_available');
    providerId = input.providerId;
  }
  if (r.confirmedAt && r.kind === input.kind && r.providerId === providerId) return { ...(await optionsDetail(tx, ctx.c, ctx.vendorId, id)), unchanged: true };
  if (r.shipmentId) throw new AppError('CONFLICT', 'A label was already created for this order: cancel the shipment before changing the method', { details: { rule: 'label_already_created', shipmentId: r.shipmentId } });
  const rec = recommend(ctx.c, base, opts, r.marketplace, info.facts);
  const followed = input.source === 'recommended' && rec?.kind === input.kind && (!rec.providerId || rec.providerId === providerId);
  const selectedBy = followed ? (rec!.source === 'rule' ? 'rule' : 'preference') : 'manual';
  const now = new Date();
  await tx.update(F).set({
    shipMethodKind: input.kind, shipProviderId: providerId, shipSelectedBy: selectedBy, shipConfirmedAt: now,
    shipRecommendation: rec ? { kind: rec.kind, providerId: rec.providerId, why: rec.why, source: rec.source, ruleId: rec.ruleId, computedAt: now.toISOString() } : {}, version: sql`${F.version} + 1`,
  }).where(eq(F.id, id));
  const fx = effects(tx, ctx);
  await fx.event({ type: 'shipping.method_selected', aggregateType: 'fulfillment', aggregateId: id, payload: { orderId: f.orderId, number: r.orderNumber, kind: input.kind, providerId, selectedBy } });
  await fx.audit({ action: 'shipping.method_selected', resourceType: 'fulfillment', resourceId: id, before: { kind: r.kind, confirmed: Boolean(r.confirmedAt) }, after: { kind: input.kind, providerId, selectedBy, source: input.source }, metadata: { orderId: f.orderId, number: r.orderNumber } });
  return { ...(await optionsDetail(tx, ctx.c, ctx.vendorId, id)), unchanged: false };
}

/** re-run the rules / preferences for an order and store the result (the confirmed selection, if any, is not touched) */
export async function recalculate(tx: Tx, ctx: OpCtx, id: string) {
  const r = await getCandidate(tx, ctx.vendorId, id);
  if (!(CANDIDATE_STATUSES as readonly string[]).includes(r.fulfillmentStatus)) throw new AppError('INVALID_STATE', `A ${r.fulfillmentStatus} fulfillment has no shipping decision`, { details: { status: r.fulfillmentStatus } });
  const base = await loadBase(tx, ctx.vendorId);
  const info = (await loadOrderInfo(tx, ctx.vendorId, [id])).get(id)!;
  const rec = recommend(ctx.c, base, optionsFor(ctx.c, base.methods, r.marketplace), r.marketplace, info.facts);
  await tx.update(F).set({ shipRecommendation: rec ? { kind: rec.kind, providerId: rec.providerId, why: rec.why, source: rec.source, ruleId: rec.ruleId, computedAt: new Date().toISOString() } : {} }).where(eq(F.id, id));
  return rec;
}

// ------------------------------------------------------------------------------------------------
// CSV (spreadsheet-formula-safe)
// ------------------------------------------------------------------------------------------------
const safeCell = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
export function toCsv(rows: Array<Array<string | number | boolean | null | undefined>>): string {
  return rows.map((r) => r.map((cell) => { const s = cell === null || cell === undefined ? '' : safeCell(String(cell)); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n') + '\r\n';
}
export const MAX_EXPORT_ROWS = 50_000;
