import { and, eq, inArray, schema, sql, type SQL, type Tx } from '@oms/database';
import type { Container, OpCtx } from '@oms/module-kit';
import { effects } from '@oms/module-kit';
import type { ShipmentStatus } from './domain';
import { labelsPdf, paginate } from './pdf-labels';
import { listMethods } from './methods';
import { providerCatalog } from './service';

const S = schema.shipments;
const O = schema.orders;
const TE = schema.shipmentTrackingEvents;

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const list = (xs: readonly string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);

/** the buckets of the shipments table of the screen, as shipment statuses */
export const GROUPS = {
  pre_dispatch: ['created', 'label_ready', 'manifested'],
  in_transit: ['dispatched', 'in_transit', 'out_for_delivery'],
  delivered: ['delivered'],
  ndr: ['delivery_failed'],
  rto: ['rto_initiated', 'rto_in_transit', 'rto_delivered'],
  cancelled: ['cancelled'],
} as const satisfies Record<string, readonly ShipmentStatus[]>;
export type Group = keyof typeof GROUPS;
export const GROUP_KEYS = Object.keys(GROUPS) as Group[];

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  created: 'Created', label_ready: 'Label ready', manifested: 'Manifested', dispatched: 'Dispatched', in_transit: 'In transit', out_for_delivery: 'Out for delivery', delivered: 'Delivered',
  delivery_failed: 'Delivery failed', rto_initiated: 'RTO initiated', rto_in_transit: 'RTO in transit', rto_delivered: 'RTO delivered', cancelled: 'Cancelled',
};

const inGroup = (g: Group): SQL => sql`${S.status} in (${list(GROUPS[g])})`;
const warehouseScope = (allowed: string[] | null): SQL | undefined => (allowed ? inArray(S.warehouseId, allowed.length ? allowed : [ZERO_UUID]) : undefined);
const carrierName = sql<string>`coalesce(${S.carrier}, ${S.providerCode})`;
const hasLabel = sql`(${S.providerData} ? 'label')`;

// ------------------------------------------------------------------------------------------------
// ribbon
// ------------------------------------------------------------------------------------------------
const count = (pred: SQL) => sql<number>`(count(*) filter (where ${pred}))::int`;

interface Tally { awbCount: number; preDispatch: number; inTransit: number; delivered: number; ndr: number; rto: number; deliveredWithEta: number; deliveredOnTime: number; deliverySeconds: number | null; deliveredTimed: number }

const tallyColumns = {
  awbCount: count(sql`${S.awb} is not null and ${S.status} <> 'cancelled'`), preDispatch: count(inGroup('pre_dispatch')), inTransit: count(inGroup('in_transit')), delivered: count(inGroup('delivered')),
  ndr: count(inGroup('ndr')), rto: count(inGroup('rto')),
  deliveredWithEta: count(sql`${S.status} = 'delivered' and ${S.estimatedDeliveryAt} is not null and ${S.deliveredAt} is not null`),
  deliveredOnTime: count(sql`${S.status} = 'delivered' and ${S.estimatedDeliveryAt} is not null and ${S.deliveredAt} is not null and ${S.deliveredAt} <= ${S.estimatedDeliveryAt}`),
  deliveredTimed: count(sql`${S.status} = 'delivered' and ${S.deliveredAt} is not null and ${S.dispatchedAt} is not null`),
  deliverySeconds: sql<number | null>`(sum(extract(epoch from (${S.deliveredAt} - ${S.dispatchedAt}))) filter (where ${S.status} = 'delivered' and ${S.deliveredAt} is not null and ${S.dispatchedAt} is not null))::float8`,
};

const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const view = (t: Tally) => ({
  awbCount: t.awbCount, preDispatch: t.preDispatch, inTransit: t.inTransit, delivered: t.delivered, ndr: t.ndr, rto: t.rto,
  onTimePercent: pct(t.deliveredOnTime, t.deliveredWithEta), onTimeSample: t.deliveredWithEta,
  avgDeliveryDays: t.deliveredTimed > 0 && t.deliverySeconds !== null ? Math.round((t.deliverySeconds / t.deliveredTimed / 86_400) * 10) / 10 : null,
});

/** the carrier ribbon: per carrier AWB counts, on-time %, in transit, delivered, NDR, RTO, average delivery days. Unknown is null, never a guess. */
export async function summary(tx: Tx, vendorId: string, allowed: string[] | null, days: number, now: Date = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const where = and(eq(S.vendorId, vendorId), sql`${S.createdAt} >= ${since}`, warehouseScope(allowed));
  const [rows, [tot]] = await Promise.all([
    tx.select({ code: S.providerCode, name: carrierName, ...tallyColumns }).from(S).where(where).groupBy(S.providerCode, carrierName).orderBy(sql`count(*) desc`, carrierName),
    tx.select(tallyColumns).from(S).where(where),
  ]);
  const totals = view(tot!);
  const [inFlightExc] = await tx.select({ ndr: count(sql`${S.status} = 'delivery_failed'`), rto: count(sql`${S.status} in ('rto_initiated','rto_in_transit')`) }).from(S).where(and(eq(S.vendorId, vendorId), warehouseScope(allowed)));
  return {
    window: { days, since: since.toISOString() },
    carriers: rows.map((r) => ({ code: r.code, name: r.name, ...view(r) })),
    totals,
    // shipments that are stuck right now (not limited to the window): failed delivery attempts and parcels coming back
    exceptions: { shipments: (inFlightExc?.ndr ?? 0) + (inFlightExc?.rto ?? 0), ndr: inFlightExc?.ndr ?? 0, rto: inFlightExc?.rto ?? 0 },
  };
}

// ------------------------------------------------------------------------------------------------
// shipments table
// ------------------------------------------------------------------------------------------------
export interface ShipmentFilter { q?: string; carrier?: string; status?: string; group?: Group; warehouseId?: string; payment?: 'cod' | 'prepaid'; labelAvailable?: boolean; from?: Date; to?: Date }

function filterWhere(vendorId: string, allowed: string[] | null, f: ShipmentFilter): SQL[] {
  const w: SQL[] = [eq(S.vendorId, vendorId)];
  const scope = warehouseScope(allowed); if (scope) w.push(scope);
  if (f.carrier) w.push(sql`(lower(${S.carrier}) = lower(${f.carrier}) or ${S.providerCode} = ${f.carrier})`);
  if (f.status) w.push(eq(S.status, f.status));
  if (f.warehouseId) w.push(eq(S.warehouseId, f.warehouseId));
  if (f.payment) w.push(f.payment === 'cod' ? eq(O.paymentMethod, 'cod') : sql`${O.paymentMethod} <> 'cod'`);
  if (f.labelAvailable !== undefined) w.push(f.labelAvailable ? sql`(${hasLabel} and ${S.status} <> 'cancelled')` : sql`(not ${hasLabel} or ${S.status} = 'cancelled')`);
  if (f.from) w.push(sql`${S.createdAt} >= ${f.from}`);
  if (f.to) w.push(sql`${S.createdAt} <= ${f.to}`);
  if (f.q?.trim()) {
    const like = `%${escapeLike(f.q.trim())}%`;
    w.push(sql`(${S.awb} ilike ${like} or ${S.number} ilike ${like} or ${O.orderNumber} ilike ${like} or ${O.externalOrderId} ilike ${like} or ${O.buyer}->>'name' ilike ${like} or ${O.shippingAddress}->>'pincode' ilike ${like} or ${O.shippingAddress}->>'city' ilike ${like})`);
  }
  return w;
}

export async function listShipmentRows(tx: Tx, vendorId: string, allowed: string[] | null, o: { filter: ShipmentFilter; page: number; pageSize: number }) {
  const base = and(...filterWhere(vendorId, allowed, o.filter));
  const where = and(base, o.filter.group ? inGroup(o.filter.group) : undefined);
  const [rows, [tot], grouped] = await Promise.all([
    tx.select({ s: S, o: { id: O.id, orderNumber: O.orderNumber, marketplace: O.marketplace, paymentMethod: O.paymentMethod, buyer: O.buyer, shippingAddress: O.shippingAddress } }).from(S)
      .innerJoin(O, and(eq(O.id, S.orderId), eq(O.vendorId, S.vendorId))).where(where).orderBy(sql`${S.createdAt} desc`, S.id).limit(o.pageSize).offset((o.page - 1) * o.pageSize),
    tx.select({ n: sql<number>`count(*)::int` }).from(S).innerJoin(O, and(eq(O.id, S.orderId), eq(O.vendorId, S.vendorId))).where(where),
    tx.select({ pre_dispatch: count(inGroup('pre_dispatch')), in_transit: count(inGroup('in_transit')), delivered: count(inGroup('delivered')), ndr: count(inGroup('ndr')), rto: count(inGroup('rto')), cancelled: count(inGroup('cancelled')), all: sql<number>`count(*)::int` })
      .from(S).innerJoin(O, and(eq(O.id, S.orderId), eq(O.vendorId, S.vendorId))).where(base),
  ]);
  const ids = rows.map((r) => r.s.id);
  const last = new Map<string, typeof TE.$inferSelect>();
  if (ids.length) {
    for (const e of await tx.select().from(TE).where(and(eq(TE.vendorId, vendorId), inArray(TE.shipmentId, ids))).orderBy(sql`${TE.occurredAt} desc`, sql`${TE.id} desc`)) if (!last.has(e.shipmentId)) last.set(e.shipmentId, e);
  }
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const items = rows.map(({ s, o: ord }) => {
    const addr = ord.shippingAddress as Record<string, unknown>;
    const buyer = ord.buyer as Record<string, unknown>;
    const ev = last.get(s.id);
    return {
      id: s.id, number: s.number, awb: s.awb, carrier: s.carrier ?? s.providerCode, providerCode: s.providerCode, service: s.service,
      orderId: ord.id, orderNumber: ord.orderNumber, channel: ord.marketplace, customerName: str(buyer.name) ?? str(addr.name),
      destination: { city: str(addr.city), state: str(addr.state), pincode: str(addr.pincode ?? addr.postalCode) },
      paymentMethod: ord.paymentMethod, codAmountMinor: s.codAmountMinor,
      status: s.status as ShipmentStatus, statusLabel: STATUS_LABELS[s.status as ShipmentStatus] ?? s.status,
      lastEvent: ev ? { status: ev.status, rawStatus: ev.rawStatus, location: ev.location, note: ev.note, occurredAt: ev.occurredAt.toISOString() } : null,
      estimatedDeliveryAt: iso(s.estimatedDeliveryAt), dispatchedAt: iso(s.dispatchedAt), deliveredAt: iso(s.deliveredAt), attempts: s.attempts, isRto: s.isRto,
      labelAvailable: Boolean((s.providerData as { label?: unknown }).label) && s.status !== 'cancelled', labelUrl: `/api/v1/shipments/${s.id}/label`, trackingUrl: s.trackingUrl, manifestId: s.manifestId, createdAt: s.createdAt.toISOString(),
    };
  });
  return { items, total: tot?.n ?? 0, counts: grouped[0]! };
}

// ------------------------------------------------------------------------------------------------
// carriers
// ------------------------------------------------------------------------------------------------
export async function carriers(tx: Tx, c: Container, vendorId: string, allowed: string[] | null, now: Date = new Date()) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [methods, usage] = await Promise.all([
    listMethods(tx, c, vendorId),
    tx.select({ code: S.providerCode, last30d: count(sql`${S.createdAt} >= ${since}`), inTransit: count(inGroup('in_transit')), lastShipmentAt: sql<Date | null>`max(${S.createdAt})` }).from(S).where(and(eq(S.vendorId, vendorId), warehouseScope(allowed))).groupBy(S.providerCode),
  ]);
  const by = new Map(usage.map((u) => [u.code, u]));
  const items = methods.items.map((m) => {
    const u = by.get(m.providerCode);
    return {
      id: m.id, kind: m.kind, name: m.name, providerCode: m.providerCode, status: m.active ? (m.state === 'configured' ? 'active' as const : 'needs_configuration' as const) : 'disabled' as const,
      isDefault: m.isDefault, verification: m.verification, capabilities: m.capabilities, supportedOrderTypes: m.supportedOrderTypes, channel: m.channel,
      shipmentsLast30d: u?.last30d ?? 0, inTransit: u?.inTransit ?? 0, lastShipmentAt: u?.lastShipmentAt ? new Date(u.lastShipmentAt).toISOString() : null,
    };
  });
  const configured = new Set(methods.items.map((m) => m.providerCode));
  return { items, activeCount: items.filter((i) => i.status === 'active').length, availableProviders: providerCatalog(c).filter((p) => !configured.has(p.code)).map((p) => ({ code: p.code, name: p.name, description: p.description, capabilities: p.capabilities })) };
}

// ------------------------------------------------------------------------------------------------
// bulk labels
// ------------------------------------------------------------------------------------------------
export type LabelError = 'not_found' | 'shipment_cancelled' | 'label_unavailable';
export interface LabelResult { shipmentId: string; ok: boolean; awb: string | null; number: string | null; format: 'text' | 'pdf_base64' | null; url: string | null; includedInCombined: boolean; error: { code: LabelError; message: string } | null }

const ERROR_TEXT: Record<LabelError, string> = { not_found: 'Shipment not found', shipment_cancelled: 'The shipment was cancelled: its label is void', label_unavailable: 'This shipment has no label yet' };

/**
 * Collect the labels of up to 100 shipments with one result each (a failure of one never fails the others). Text labels are also
 * merged into ONE printable PDF (4x6 in pages); labels a courier delivers as a ready PDF stay separate and are listed by url.
 */
export async function bulkLabels(tx: Tx, ctx: OpCtx, allowed: string[] | null, input: { shipmentIds: string[]; combine: boolean }) {
  const ids = [...new Set(input.shipmentIds)];
  const rows = await tx.select().from(S).where(and(eq(S.vendorId, ctx.vendorId), inArray(S.id, ids), warehouseScope(allowed)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const texts: Array<{ id: string; content: string }> = [];
  const results: LabelResult[] = ids.map((id) => {
    const s = byId.get(id);
    const fail = (code: LabelError): LabelResult => ({ shipmentId: id, ok: false, awb: s?.awb ?? null, number: s?.number ?? null, format: null, url: null, includedInCombined: false, error: { code, message: ERROR_TEXT[code] } });
    if (!s) return fail('not_found');
    if (s.status === 'cancelled') return fail('shipment_cancelled');
    const label = (s.providerData as { label?: { format: 'text' | 'pdf_base64'; content: string } }).label;
    if (!label) return fail('label_unavailable');
    const merge = input.combine && label.format === 'text';
    if (merge) texts.push({ id, content: label.content });
    return { shipmentId: id, ok: true, awb: s.awb, number: s.number, format: label.format, url: `/api/v1/shipments/${id}/label`, includedInCombined: merge, error: null };
  });
  const okCount = results.filter((r) => r.ok).length;
  await effects(tx, ctx).audit({ action: 'shipping.labels_printed', resourceType: 'shipment', resourceId: 'bulk', metadata: { requested: ids.length, ok: okCount, shipmentIds: ids.slice(0, 100) } });
  return {
    results,
    summary: { requested: ids.length, ok: okCount, failed: ids.length - okCount },
    combined: texts.length
      ? { available: true as const, format: 'pdf_base64' as const, fileName: 'shipping-labels.pdf', pages: paginate(texts.map((t) => t.content)).length, shipmentIds: texts.map((t) => t.id), content: labelsPdf(texts.map((t) => t.content)).toString('base64') }
      : { available: false as const, format: null, fileName: null, pages: 0, shipmentIds: [] as string[], content: null },
  };
}
