import { and, count, desc, eq, gt, ilike, inArray, isNull, lte, or, schema, sql, withSystem, withVendor, type SQL, type Tx } from '@oms/database';
import { effects, type Container, type JobHandler, type OpCtx } from '@oms/module-kit';
import { CANDIDATE_STATUSES, candidateRows, flagsOfSelection, loadBase, loadOrderInfo, loadThresholds, optionsFor, recommend, selectedName, slaOf, statusCounts, toCsv, toDecisionItem, type Base, type Candidate, type DecisionStatus } from './decision';
import { connectorName, isVerified, methodName, type MethodKind } from './methods';
import { IN_FLIGHT } from './domain';
import { refreshTracking } from './service';

const S = schema.shipments;
const O = schema.orders;
const SP = schema.vendorShippingProviders;
const F = schema.fulfillments;
const A = schema.marketplaceAccounts;

export const TRACKING_STATUSES_DERIVED = ['tracking_active', 'awaiting_first_scan', 'in_transit', 'delivery_delayed', 'tracking_sync_failed', 'delivered'] as const;
export type TrackingDerived = (typeof TRACKING_STATUSES_DERIVED)[number];
const TRACKED = [...IN_FLIGHT, 'delivered', 'rto_delivered'] as const;
const ATTENTION: Record<TrackingDerived, 'none' | 'check_first_scan' | 'review_update' | 'retry_required' | 'completed'> = {
  tracking_active: 'none', in_transit: 'none', awaiting_first_scan: 'check_first_scan', delivery_delayed: 'review_update', tracking_sync_failed: 'retry_required', delivered: 'completed',
};

// ------------------------------------------------------------------------------------------------
// tracking (derived statuses over shipments)
// ------------------------------------------------------------------------------------------------
/** priority: delivered > sync failed > delayed (past the estimated delivery) > awaiting first scan (dispatched, no scan for N hours) > in transit > active */
const trackingExpr = (hours: number) => sql<TrackingDerived>`CASE
  WHEN ${S.status} IN ('delivered', 'rto_delivered') THEN 'delivered'
  WHEN ${S.providerData} -> 'trackingError' IS NOT NULL THEN 'tracking_sync_failed'
  WHEN ${S.estimatedDeliveryAt} IS NOT NULL AND ${S.estimatedDeliveryAt} < now() THEN 'delivery_delayed'
  WHEN ${S.status} = 'dispatched' AND ${S.dispatchedAt} < now() - interval '${sql.raw(String(Math.max(1, Math.floor(hours))))} hours' THEN 'awaiting_first_scan'
  WHEN ${S.status} IN ('in_transit', 'out_for_delivery') THEN 'in_transit'
  ELSE 'tracking_active' END`;

const lastEvent = sql<Date | null>`(SELECT max(te.occurred_at) FROM shipment_tracking_events te WHERE te.shipment_id = ${S.id})`;

interface TrackRow { shipmentId: string; orderId: string; orderNumber: string; marketplace: string; providerCode: string; spLabel: string | null; fKind: string | null; awb: string | null; carrier: string | null; status: string; dispatchedAt: Date | null; lastTrackedAt: Date | null; estimatedDeliveryAt: Date | null; lastEventAt: Date | string | null; error: { at?: string; message?: string } | null; derived: TrackingDerived }

function trackFields(hours: number) {
  return {
    shipmentId: S.id, orderId: S.orderId, orderNumber: O.orderNumber, marketplace: O.marketplace, providerCode: S.providerCode, spLabel: SP.label, fKind: F.shipMethodKind, awb: S.awb, carrier: S.carrier, status: S.status,
    dispatchedAt: S.dispatchedAt, lastTrackedAt: S.lastTrackedAt, estimatedDeliveryAt: S.estimatedDeliveryAt, lastEventAt: lastEvent, error: sql<{ at?: string; message?: string } | null>`${S.providerData} -> 'trackingError'`, derived: trackingExpr(hours),
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trackJoined = (tx: Tx, fields: any) => tx.select(fields).from(S)
  .innerJoin(O, and(eq(O.id, S.orderId), eq(O.vendorId, S.vendorId))).leftJoin(F, and(eq(F.id, S.fulfillmentId), eq(F.vendorId, S.vendorId))).leftJoin(SP, and(eq(SP.vendorId, S.vendorId), eq(SP.providerCode, S.providerCode)));

const trackBase = (vendorId: string, allowed: string[] | null): SQL[] => [eq(S.vendorId, vendorId), inArray(S.status, [...TRACKED]), ...(allowed ? [allowed.length ? inArray(S.warehouseId, allowed) : sql`false`] : [])];

export interface TrackingFilter { q?: string; marketplace?: string; method?: string; status?: TrackingDerived }

function trackItem(c: Container, r: TrackRow) {
  const kind: MethodKind = (r.fKind as MethodKind | null) ?? (r.providerCode === 'manual' ? 'seller' : 'third_party');
  return {
    shipmentId: r.shipmentId, orderId: r.orderId, number: r.orderNumber, channel: { code: r.marketplace, name: connectorName(c, r.marketplace) },
    method: { kind, name: kind === 'seller' ? 'Seller Shipping' : (r.spLabel ?? r.providerCode), providerCode: r.providerCode }, awb: r.awb, carrier: r.carrier,
    dispatchedAt: r.dispatchedAt?.toISOString() ?? null, status: r.derived, shipmentStatus: r.status,
    lastUpdateAt: (r.lastEventAt ? new Date(r.lastEventAt) : (r.lastTrackedAt ?? r.dispatchedAt))?.toISOString() ?? null, estimatedDeliveryAt: r.estimatedDeliveryAt?.toISOString() ?? null, attention: ATTENTION[r.derived],
  };
}

export async function listTracking(tx: Tx, c: Container, vendorId: string, allowed: string[] | null, o: { filter: TrackingFilter; limit: number; offset: number }) {
  const th = await loadThresholds(tx, vendorId);
  const f = o.filter;
  const expr = trackingExpr(th.awaitingFirstScanHours);
  const where = and(...trackBase(vendorId, allowed),
    ...(f.q ? [or(ilike(O.orderNumber, `%${f.q}%`), ilike(S.awb, `%${f.q}%`))!] : []), ...(f.marketplace ? [eq(O.marketplace, f.marketplace)] : []), ...(f.method ? [eq(S.providerCode, f.method)] : []), ...(f.status ? [sql`${expr} = ${f.status}`] : []));
  const [rows, totals, grouped] = await Promise.all([
    trackJoined(tx, trackFields(th.awaitingFirstScanHours)).where(where).orderBy(desc(S.dispatchedAt), S.id).limit(o.limit).offset(o.offset) as unknown as Promise<TrackRow[]>,
    trackJoined(tx, { n: count() }).where(where) as unknown as Promise<Array<{ n: number }>>,
    trackJoined(tx, { st: expr, ss: S.status, n: count() }).where(and(...trackBase(vendorId, allowed))).groupBy(sql`1`, S.status) as unknown as Promise<Array<{ st: TrackingDerived; ss: string; n: number }>>,
  ]);
  const byStatus = Object.fromEntries(TRACKING_STATUSES_DERIVED.map((s) => [s, 0])) as Record<TrackingDerived, number>;
  const stages = { dispatched: 0, inTransit: 0, delivered: 0 };
  for (const g of grouped) {
    byStatus[g.st] += Number(g.n);
    if (g.ss === 'dispatched') stages.dispatched += Number(g.n);
    else if (g.ss === 'delivered' || g.ss === 'rto_delivered') stages.delivered += Number(g.n);
    else stages.inTransit += Number(g.n);
  }
  return { items: rows.map((r) => trackItem(c, r)), total: Number(totals[0]?.n ?? 0), counters: { stages, byStatus } };
}

export async function trackingFailures(tx: Tx, vendorId: string, allowed: string[] | null) {
  const th = await loadThresholds(tx, vendorId);
  const rows = await trackJoined(tx, trackFields(th.awaitingFirstScanHours)).where(and(...trackBase(vendorId, allowed), sql`${S.providerData} -> 'trackingError' IS NOT NULL`)).orderBy(desc(S.updatedAt)).limit(100) as unknown as TrackRow[];
  return rows.map((r) => ({
    shipmentId: r.shipmentId, orderId: r.orderId, orderNumber: r.orderNumber, awb: r.awb, failedAt: r.error?.at ?? null, whatFailed: 'The latest tracking status was not received.',
    possibleReason: r.error?.message ? `${r.error.message} (connector timeout or tracking capability not verified)` : 'Connector timeout or tracking capability not verified.',
    action: { key: 'retry' as const, label: 'Retry', method: 'POST' as const, href: `/api/v1/shipments/${r.shipmentId}/refresh-tracking` },
  }));
}

/** refresh tracking for open shipments (bounded); a failing one is recorded on the shipment and never stops the others */
export async function refreshOpenShipments(ctx: OpCtx, allowed: string[] | null, ids?: string[]) {
  const open = await withVendor(ctx.c.database.db, ctx.vendorId, (tx) => tx.select({ id: S.id }).from(S).where(and(eq(S.vendorId, ctx.vendorId), inArray(S.status, [...IN_FLIGHT]), ...(ids ? [inArray(S.id, ids)] : []), ...(allowed ? [allowed.length ? inArray(S.warehouseId, allowed) : sql`false`] : []))).orderBy(S.lastTrackedAt).limit(200));
  const out = { processed: 0, updated: 0, failed: 0, failures: [] as Array<{ shipmentId: string; message: string }> };
  for (const s of open) {
    out.processed++;
    try { const r = await refreshTracking(ctx, s.id); if (r.applied > 0 || r.recorded > 0) out.updated++; } catch (e) { out.failed++; out.failures.push({ shipmentId: s.id, message: (e as Error).message }); }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// exceptions (six categories)
// ------------------------------------------------------------------------------------------------
export const EXCEPTION_KEYS = ['no_method_selected', 'label_unavailable', 'tracking_not_received', 'shipping_sync_failed', 'sla_risk', 'connector_capability_limit'] as const;
export type ExceptionKey = (typeof EXCEPTION_KEYS)[number];

const COPY: Record<ExceptionKey, { title: string; whatHappened: string; why: string; whatCanIDoNow: string; action: { key: string; label: string; target: 'options' | 'capability' | 'tracking' | 'retry' | 'order' } }> = {
  no_method_selected: { title: 'No shipping method selected', whatHappened: 'These orders are packed but no shipping method has been confirmed.', why: 'A method has to be confirmed before a label can be created. Your preference or rules only recommend one.', whatCanIDoNow: 'Open the order, review the recommended method and confirm it, or choose another available one.', action: { key: 'choose_shipping', label: 'Choose shipping', target: 'options' } },
  label_unavailable: { title: 'Label unavailable', whatHappened: 'The selected shipping method cannot produce a shipping label for these orders.', why: 'The method or its connector does not support label generation (or the method was removed after it was selected).', whatCanIDoNow: 'Check the method capability, or select a method that supports labels.', action: { key: 'verify_label_capability', label: 'Verify label capability', target: 'capability' } },
  tracking_not_received: { title: 'Tracking not received', whatHappened: 'These shipments were dispatched but no tracking update arrived in time, or delivery is past the estimated date.', why: 'The courier has not scanned the parcel yet, or the tracking feed is delayed.', whatCanIDoNow: 'Review the tracking timeline and check with the courier if the parcel was handed over.', action: { key: 'review_tracking', label: 'Review tracking', target: 'tracking' } },
  shipping_sync_failed: { title: 'Shipping sync failed', whatHappened: 'The latest tracking status could not be fetched for these shipments.', why: 'Possible connector timeout, or tracking capability is not verified.', whatCanIDoNow: 'Retry the sync. If it keeps failing, verify the method capability.', action: { key: 'retry_sync', label: 'Retry sync', target: 'retry' } },
  sla_risk: { title: 'SLA risk', whatHappened: 'These orders are close to, or past, the dispatch deadline and have not shipped.', why: 'The marketplace dispatch deadline is within the at-risk window or already passed.', whatCanIDoNow: 'Review the order deadline and ship these first.', action: { key: 'review_deadline', label: 'Review order deadline', target: 'order' } },
  connector_capability_limit: { title: 'Connector capability limitation', whatHappened: 'The selected method cannot report dispatch or delivery status back for these orders.', why: 'The connector does not support dispatch updates or status synchronisation.', whatCanIDoNow: 'View the capability matrix. Status updates may have to be entered manually.', action: { key: 'view_capability', label: 'View capability', target: 'capability' } },
};

interface ExcOrder { orderId: string; number: string; fulfillmentId: string | null; shipmentId: string | null; channel: { code: string; name: string }; detail: string | null }

export async function computeExceptions(tx: Tx, c: Container, vendorId: string, allowed: string[] | null) {
  const base = await loadBase(tx, vendorId);
  const [cands, ships] = await Promise.all([
    candidateRows(tx, vendorId, allowed, { th: base.th, limit: 1000 }),
    trackJoined(tx, trackFields(base.th.awaitingFirstScanHours)).where(and(...trackBase(vendorId, allowed), inArray(S.status, [...IN_FLIGHT]))).limit(1000) as unknown as Promise<TrackRow[]>,
  ]);
  const groups = Object.fromEntries(EXCEPTION_KEYS.map((k) => [k, [] as ExcOrder[]])) as Record<ExceptionKey, ExcOrder[]>;
  const ch = (m: string) => ({ code: m, name: connectorName(c, m) });
  for (const r of cands) {
    const o = { orderId: r.orderId, number: r.orderNumber, fulfillmentId: r.id, shipmentId: r.shipmentId, channel: ch(r.marketplace) };
    if (!r.confirmedAt && !r.shipmentId) groups.no_method_selected.push({ ...o, detail: r.status === 'exception' ? 'no_method_available' : null });
    if (r.kind && !r.shipmentId) {
      const sel = flagsOfSelection(c, base.methods, r.kind, r.providerId, r.marketplace);
      if (!sel) groups.label_unavailable.push({ ...o, detail: 'method_removed' });
      else if (!sel.flags.label) groups.label_unavailable.push({ ...o, detail: 'label_not_supported' });
      if (sel && r.confirmedAt) {
        const missing = (['dispatchUpdate', 'statusSync'] as const).filter((k) => !sel.flags[k]);
        if (missing.length) groups.connector_capability_limit.push({ ...o, detail: missing.join(',') });
      }
    }
    const sla = slaOf(r.dueAt, base.th, base.now);
    if (sla.band === 'at_risk' || sla.band === 'breached') groups.sla_risk.push({ ...o, detail: sla.band });
  }
  for (const s of ships) {
    const o = { orderId: s.orderId, number: s.orderNumber, fulfillmentId: null, shipmentId: s.shipmentId, channel: ch(s.marketplace) };
    if (s.derived === 'awaiting_first_scan' || s.derived === 'delivery_delayed') groups.tracking_not_received.push({ ...o, detail: s.derived });
    if (s.derived === 'tracking_sync_failed') groups.shipping_sync_failed.push({ ...o, detail: s.error?.message ?? null });
  }
  const distinct = new Set(Object.values(groups).flatMap((g) => g.map((x) => x.orderId)));
  return { groups, distinctOrders: distinct.size, base };
}

const actionHref = (key: ExceptionKey, o?: ExcOrder) => {
  const t = COPY[key].action.target;
  return t === 'options' || t === 'order' ? (o?.fulfillmentId ? `/api/v1/shipping/orders/${o.fulfillmentId}/options` : '/api/v1/shipping/orders') : t === 'retry' ? (o?.shipmentId ? `/api/v1/shipments/${o.shipmentId}/refresh-tracking` : '/api/v1/shipping/tracking/sync') : t === 'tracking' ? (o?.shipmentId ? `/api/v1/shipments/${o.shipmentId}/tracking` : '/api/v1/shipping/tracking') : '/api/v1/shipping/methods';
};

export async function exceptionsReport(tx: Tx, c: Container, vendorId: string, allowed: string[] | null, o: { category?: ExceptionKey; limit: number; offset: number }) {
  const { groups, distinctOrders } = await computeExceptions(tx, c, vendorId, allowed);
  const keys = o.category ? [o.category] : [...EXCEPTION_KEYS];
  const categories = keys.map((key) => {
    const list = groups[key];
    const window = o.category ? list.slice(o.offset, o.offset + o.limit) : list.slice(0, 10);
    const a = COPY[key].action;
    return {
      key, title: COPY[key].title, count: list.length, orders: window.map((x) => ({ ...x, action: { key: a.key, label: a.label, method: (a.target === 'retry' ? 'POST' : 'GET') as 'GET' | 'POST', href: actionHref(key, x) } })),
      whatHappened: COPY[key].whatHappened, why: COPY[key].why, whatCanIDoNow: COPY[key].whatCanIDoNow, action: { key: a.key, label: a.label, method: (a.target === 'retry' ? 'POST' : 'GET') as 'GET' | 'POST', href: actionHref(key, list[0]) },
    };
  });
  const total = o.category ? groups[o.category].length : EXCEPTION_KEYS.reduce((n, k) => n + groups[k].length, 0);
  return { categories, totalOrders: distinctOrders, categoryCount: EXCEPTION_KEYS.filter((k) => groups[k].length > 0).length, total };
}

export async function exceptionsCsv(tx: Tx, c: Container, vendorId: string, allowed: string[] | null): Promise<{ csv: string; rows: number }> {
  const { groups } = await computeExceptions(tx, c, vendorId, allowed);
  const lines: Array<Array<string | number | null>> = [['Category', 'Order', 'Marketplace', 'Detail', 'What happened', 'What can I do now']];
  for (const k of EXCEPTION_KEYS) for (const x of groups[k]) lines.push([COPY[k].title, x.number, x.channel.name, x.detail, COPY[k].whatHappened, COPY[k].whatCanIDoNow]);
  return { csv: toCsv(lines), rows: lines.length - 1 };
}

// ------------------------------------------------------------------------------------------------
// pulse counts + snapshots
// ------------------------------------------------------------------------------------------------
export const PULSE_KEYS = ['readyToShip', 'shippingSelected', 'labelReady', 'dispatched', 'inTransit', 'needDecision', 'labelUnavailable', 'trackingIssues'] as const;
export type Pulse = Record<(typeof PULSE_KEYS)[number], number>;

export async function pulseCounts(tx: Tx, c: Container, vendorId: string, allowed: string[] | null, pre?: Awaited<ReturnType<typeof computeExceptions>>): Promise<Pulse> {
  const exc = pre ?? await computeExceptions(tx, c, vendorId, allowed);
  const [counts, confirmed, ship] = await Promise.all([
    statusCounts(tx, vendorId, allowed),
    tx.select({ n: count() }).from(F).where(and(eq(F.vendorId, vendorId), inArray(F.status, [...CANDIDATE_STATUSES]), sql`${F.shipConfirmedAt} IS NOT NULL`, ...(allowed ? [allowed.length ? inArray(F.warehouseId, allowed) : sql`false`] : []))),
    tx.select({ st: S.status, n: count() }).from(S).where(and(eq(S.vendorId, vendorId), inArray(S.status, ['dispatched', 'in_transit', 'out_for_delivery']), ...(allowed ? [allowed.length ? inArray(S.warehouseId, allowed) : sql`false`] : []))).groupBy(S.status),
  ]);
  const sh = (s: string) => Number(ship.find((x) => x.st === s)?.n ?? 0);
  const g = exc.groups;
  return {
    readyToShip: Object.values(counts).reduce((a, b) => a + b, 0), needDecision: counts.needs_decision, shippingSelected: Number(confirmed[0]?.n ?? 0), labelReady: counts.ready_to_dispatch,
    labelUnavailable: g.label_unavailable.length, dispatched: sh('dispatched'), inTransit: sh('in_transit') + sh('out_for_delivery'), trackingIssues: g.tracking_not_received.length + g.shipping_sync_failed.length,
  };
}

export const SNAPSHOT_BASE_MIN = 30;
export const SNAPSHOT_SKIP_MIN = 50;

export async function takeSnapshot(tx: Tx, c: Container, vendorId: string, now = new Date()): Promise<{ skipped: boolean }> {
  const SN = schema.shippingSnapshots;
  const [recent] = await tx.select({ id: SN.id }).from(SN).where(and(eq(SN.vendorId, vendorId), gt(SN.takenAt, new Date(now.getTime() - SNAPSHOT_SKIP_MIN * 60_000)))).limit(1);
  if (recent) return { skipped: true };
  const counts = await pulseCounts(tx, c, vendorId, null);
  await tx.insert(SN).values({ vendorId, takenAt: now, counts });
  return { skipped: false };
}

export const JOB_SNAPSHOT = 'shipping.snapshot';
/** hourly: one snapshot per ACTIVE vendor (bounded batches); one vendor failing never stops the others */
export const snapshotJob: JobHandler = {
  queue: 'maintenance', name: JOB_SNAPSHOT,
  async handle(_env, c) {
    let after: string | null = null;
    let taken = 0; let failed = 0;
    for (;;) {
      const cursor: string | null = after;
      const batch: Array<{ id: string }> = await withSystem(c.database.db, (tx) => tx.select({ id: schema.vendors.id }).from(schema.vendors).where(and(eq(schema.vendors.status, 'active'), isNull(schema.vendors.deletedAt), ...(cursor ? [gt(schema.vendors.id, cursor)] : []))).orderBy(schema.vendors.id).limit(50));
      if (batch.length === 0) break;
      for (const v of batch) {
        try { const r = await withVendor(c.database.db, v.id, (tx) => takeSnapshot(tx, c, v.id)); if (!r.skipped) taken++; } catch (e) { failed++; c.logger.warn({ vendorId: v.id, err: (e as Error).message }, 'shipping snapshot failed for one vendor'); }
      }
      after = batch[batch.length - 1]!.id;
    }
    if (taken || failed) c.logger.info({ taken, failed }, 'shipping snapshots taken');
  },
};

// ------------------------------------------------------------------------------------------------
// overview
// ------------------------------------------------------------------------------------------------
export async function overview(tx: Tx, c: Container, vendorId: string, allowed: string[] | null, asOf: Date) {
  const exc = await computeExceptions(tx, c, vendorId, allowed);
  const base: Base = { ...exc.base, now: asOf };
  const pulse = await pulseCounts(tx, c, vendorId, allowed, exc);
  const SN = schema.shippingSnapshots;
  const [snap] = await tx.select().from(SN).where(and(eq(SN.vendorId, vendorId), lte(SN.takenAt, new Date(asOf.getTime() - SNAPSHOT_BASE_MIN * 60_000)))).orderBy(desc(SN.takenAt)).limit(1);
  const delta = (key: keyof Pulse): number | null => (snap && typeof snap.counts[key] === 'number' ? pulse[key] - snap.counts[key]! : null);
  const accounts = await tx.select().from(A).where(and(eq(A.vendorId, vendorId), eq(A.status, 'active')));
  const channels = [...new Set(accounts.map((a) => a.marketplace))];
  const selectedSources = await tx.select({ by: F.shipSelectedBy, n: count() }).from(F).where(and(eq(F.vendorId, vendorId), inArray(F.status, [...CANDIDATE_STATUSES]), sql`${F.shipConfirmedAt} IS NOT NULL`)).groupBy(F.shipSelectedBy);
  const fromPreference = selectedSources.filter((s) => s.by === 'rule' || s.by === 'preference').reduce((n, s) => n + Number(s.n), 0);

  // decision field: first five orders, those that still need a decision first
  let field: Candidate[] = await candidateRows(tx, vendorId, allowed, { filter: { status: 'needs_decision' }, th: base.th, limit: 5 });
  for (const st of ['exception', 'selected', 'label_pending', 'ready_to_dispatch'] as DecisionStatus[]) {
    if (field.length >= 5) break;
    field = [...field, ...(await candidateRows(tx, vendorId, allowed, { filter: { status: st }, th: base.th, limit: 5 - field.length }))];
  }
  const infos = await loadOrderInfo(tx, vendorId, field.map((r) => r.id));
  const decisionField = field.map((r) => {
    const item = toDecisionItem(c, base, r, infos.get(r.id));
    const rec = infos.get(r.id) ? recommend(c, base, optionsFor(c, base.methods, r.marketplace), r.marketplace, infos.get(r.id)!.facts) : null;
    return {
      fulfillmentId: r.id, order: { id: r.orderId, number: r.orderNumber }, channel: item.channel, warehouse: item.warehouse, itemCount: item.itemCount, weightGrams: item.weightGrams, availableMethods: item.availableMethods,
      merchantPreference: rec ? { kind: rec.kind, name: rec.name, why: rec.source === 'channel_override' ? 'default_for_channel' : rec.source === 'default_preference' ? 'default' : rec.source, whyText: rec.why } : null,
      selected: r.kind ? { kind: r.kind, name: selectedName(c, base.methods, r.kind, r.providerId, r.marketplace), confirmed: Boolean(r.confirmedAt) } : null,
    };
  });

  // availability comparison: what each connected channel can use, and how it is preferred
  const ruleKinds = new Set(base.rules.map((r) => (r.action.params as { kind?: string }).kind));
  const rows: Array<Record<string, unknown>> = [];
  const cmp = (channel: string, kind: MethodKind, m: typeof base.methods[number] | undefined, label: string) => {
    const usable = Boolean(m && m.status === 'active');
    const preferred = (base.pref?.overrides[channel] ?? base.pref?.defaultMethod) === kind;
    rows.push({
      channel: { code: channel, name: connectorName(c, channel) }, method: kind, provider: label, methodId: m?.id ?? null,
      availability: !usable ? 'unavailable' : isVerified(m!) ? 'ready' : 'requires_configuration', default: preferred ? 'preferred' : ruleKinds.has(kind) ? 'order_specific' : 'not_set',
      override: !usable ? 'unavailable' : isVerified(m!) ? 'where_supported' : 'verify_capability',
    });
  };
  for (const ch of channels) {
    cmp(ch, 'marketplace', base.methods.find((m) => m.kind === 'marketplace' && m.channelCode === ch), `${connectorName(c, ch)} Shipping`);
    cmp(ch, 'seller', base.methods.find((m) => m.kind === 'seller'), 'Seller Shipping');
    const tps = base.methods.filter((m) => m.kind === 'third_party');
    if (tps.length === 0) cmp(ch, 'third_party', undefined, 'Third-party provider');
    for (const m of tps) cmp(ch, 'third_party', m, methodName(c, m));
  }
  const g = exc.groups;
  return {
    asOf: asOf.toISOString(), generatedAt: new Date().toISOString(), baseline: snap ? snap.takenAt.toISOString() : null,
    statusLine: { connectedChannels: channels.length, activeMethods: base.methods.filter((m) => m.status === 'active').length, ordersNeedAttention: exc.distinctOrders },
    pulse: {
      readyToShip: { count: pulse.readyToShip, sinceLastSync: delta('readyToShip'), needDecision: pulse.needDecision },
      shippingSelected: { count: pulse.shippingSelected, sinceLastSync: delta('shippingSelected'), note: pulse.shippingSelected > 0 && fromPreference > 0 ? 'preference_confirmed' : null },
      labelReady: { count: pulse.labelReady, sinceLastSync: delta('labelReady'), labelUnavailable: pulse.labelUnavailable },
      dispatched: { count: pulse.dispatched, sinceLastSync: delta('dispatched') },
      inTransit: { count: pulse.inTransit, sinceLastSync: delta('inTransit'), trackingIssues: pulse.trackingIssues },
    },
    decisionField, availabilityComparison: rows,
    attention: { total: exc.distinctOrders, parts: { undecided: g.no_method_selected.length, label: g.label_unavailable.length, tracking: g.tracking_not_received.length, sync: g.shipping_sync_failed.length, slaRisk: g.sla_risk.length, capability: g.connector_capability_limit.length } },
  };
}

// ------------------------------------------------------------------------------------------------
// Sync Shipping: method verification + tracking refresh
// ------------------------------------------------------------------------------------------------
export async function syncShipping(ctx: OpCtx, allowed: string[] | null, verify: (tx: Tx, ctx: OpCtx, id: string) => Promise<{ ok: boolean }>) {
  const db = ctx.c.database.db;
  const { methods, orders } = await withVendor(db, ctx.vendorId, async (tx) => ({
    methods: await tx.select({ id: SP.id }).from(SP).where(and(eq(SP.vendorId, ctx.vendorId), eq(SP.status, 'active'))),
    orders: Number((await tx.select({ n: count() }).from(F).where(and(eq(F.vendorId, ctx.vendorId), inArray(F.status, [...CANDIDATE_STATUSES])))) [0]?.n ?? 0),
  }));
  let verified = 0; let notVerified = 0;
  for (const m of methods) {
    try { const r = await withVendor(db, ctx.vendorId, (tx) => verify(tx, ctx, m.id)); if (r.ok) verified++; else notVerified++; } catch { notVerified++; }
  }
  const tracking = await refreshOpenShipments(ctx, allowed);
  const out = {
    orders: orders + tracking.processed, statuses: tracking.processed - tracking.failed, processed: orders + tracking.processed, updated: tracking.updated + verified, requireAttention: tracking.failed + notVerified,
    methods: { checked: methods.length, verified, notVerified }, tracking, completedAt: new Date().toISOString(),
  };
  await withVendor(db, ctx.vendorId, (tx) => effects(tx, ctx).audit({ action: 'shipping.sync', resourceType: 'shipping', resourceId: ctx.vendorId, after: { processed: out.processed, updated: out.updated, requireAttention: out.requireAttention } }));
  return out;
}

