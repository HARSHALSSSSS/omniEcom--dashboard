import { and, eq, inArray, isNull, schema, sql, type Tx } from '@oms/database';
import { classifyStock, stockLines, DEFAULT_THRESHOLDS } from '@oms/mod-analytics';
import { createPurchaseOrder } from './orders';
import { activeWarehouse, defaultWarehouse, type Actor, type Fx } from './common';
import { OPEN_PO_STATUSES, round1 } from './domain';
import { supplierDeliveryStats } from './suppliers';

const S = schema.suppliers;
const SP = schema.supplierProducts;

const rows = async (tx: Tx, q: ReturnType<typeof sql>): Promise<Array<Record<string, unknown>>> => (await tx.execute<Record<string, unknown>>(q)).rows;
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const statusList = (xs: readonly string[]) => sql.join(xs.map((s) => sql`${s}`), sql`, `);

// ------------------------------------------------------------------------------------------------
// reorder suggestions: the analytics inventory-health numbers minus what is already on order, matched to a supplier
// ------------------------------------------------------------------------------------------------
export interface Suggestion {
  variantId: string; sku: string; title: string | null; available: number; unitsPerDay: number; daysOfCover: number | null; reorderLevel: number | null;
  suggestedUnits: number; onOrderUnits: number; netUnits: number;
  supplier: { id: string; name: string; costMinor: number; minOrderQuantity: number; leadTimeDays: number; isPreferred: boolean } | null;
}

/** units still owed by draft and open purchase orders, per variant (a suggestion must not re-order what is already coming) */
async function onOrderUnits(tx: Tx, vendorId: string, variantIds: string[]): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();
  const found = await tx.select({ variantId: schema.purchaseOrderLines.variantId, n: sql<number>`sum(${schema.purchaseOrderLines.quantityOrdered} - ${schema.purchaseOrderLines.quantityReceived})::int` })
    .from(schema.purchaseOrderLines).innerJoin(schema.purchaseOrders, and(eq(schema.purchaseOrders.id, schema.purchaseOrderLines.purchaseOrderId), eq(schema.purchaseOrders.vendorId, schema.purchaseOrderLines.vendorId)))
    .where(and(eq(schema.purchaseOrderLines.vendorId, vendorId), inArray(schema.purchaseOrderLines.variantId, variantIds), inArray(schema.purchaseOrders.status, ['draft', ...OPEN_PO_STATUSES])))
    .groupBy(schema.purchaseOrderLines.variantId);
  return new Map(found.map((r) => [r.variantId, r.n]));
}

export async function reorderSuggestions(tx: Tx, vendorId: string, only?: string[]): Promise<Suggestion[]> {
  const findings = (await stockLines(tx, vendorId, DEFAULT_THRESHOLDS.windowDays)).map((l) => classifyStock(l, DEFAULT_THRESHOLDS))
    .filter((f) => (f.suggestedReorderUnits ?? 0) > 0 && (!only || only.includes(f.variantId)));
  if (findings.length === 0) return [];
  const ids = findings.map((f) => f.variantId);
  const ordered = await onOrderUnits(tx, vendorId, ids);
  const offers = await tx.select({ sp: SP, supplierName: S.name, supplierLead: S.leadTimeDays }).from(SP).innerJoin(S, and(eq(S.id, SP.supplierId), eq(S.vendorId, SP.vendorId)))
    .where(and(eq(SP.vendorId, vendorId), inArray(SP.variantId, ids), eq(S.status, 'active'), isNull(S.deletedAt))).orderBy(sql`${SP.isPreferred} desc`, SP.costMinor);
  const bestOffer = new Map<string, (typeof offers)[number]>();
  for (const o of offers) if (!bestOffer.has(o.sp.variantId)) bestOffer.set(o.sp.variantId, o);
  return findings.map((f): Suggestion => {
    const onOrder = ordered.get(f.variantId) ?? 0;
    const offer = bestOffer.get(f.variantId);
    return {
      variantId: f.variantId, sku: f.sku, title: f.title, available: f.available, unitsPerDay: f.unitsPerDay, daysOfCover: f.daysOfCover, reorderLevel: f.reorderLevel,
      suggestedUnits: f.suggestedReorderUnits!, onOrderUnits: onOrder, netUnits: Math.max(0, f.suggestedReorderUnits! - onOrder),
      supplier: offer ? { id: offer.sp.supplierId, name: offer.supplierName, costMinor: offer.sp.costMinor, minOrderQuantity: offer.sp.minOrderQuantity, leadTimeDays: offer.sp.leadTimeDays ?? offer.supplierLead, isPreferred: offer.sp.isPreferred } : null,
    };
  }).filter((s) => s.netUnits > 0).sort((a, b) => (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity) || a.sku.localeCompare(b.sku));
}

/** draft POs grouped by supplier; variants nobody supplies are reported, never guessed */
export async function purchaseOrdersFromSuggestions(tx: Tx, vendorId: string, fx: Fx, actor: Actor, input: { warehouseId?: string; variantIds?: string[]; dryRun: boolean }) {
  const warehouse = input.warehouseId ? await activeWarehouse(tx, vendorId, input.warehouseId) : await defaultWarehouse(tx, vendorId);
  const suggestions = await reorderSuggestions(tx, vendorId, input.variantIds);
  const unassigned = suggestions.filter((s) => !s.supplier).map((s) => ({ variantId: s.variantId, sku: s.sku, suggestedUnits: s.netUnits, reason: 'no_supplier' as const }));
  const bySupplier = new Map<string, Suggestion[]>();
  for (const s of suggestions) if (s.supplier) bySupplier.set(s.supplier.id, [...(bySupplier.get(s.supplier.id) ?? []), s]);
  const orders = [];
  for (const [supplierId, items] of bySupplier) {
    const lines = items.map((s) => ({ variantId: s.variantId, quantity: Math.max(s.netUnits, s.supplier!.minOrderQuantity), unitCostMinor: s.supplier!.costMinor }));
    if (input.dryRun) {
      orders.push({ id: null as string | null, poNumber: null as string | null, supplierId, supplierName: items[0]!.supplier!.name, lines: lines.length, units: lines.reduce((s, l) => s + l.quantity, 0), totalMinor: lines.reduce((s, l) => s + l.quantity * l.unitCostMinor, 0), skus: items.map((s) => s.sku) });
      continue;
    }
    const { row } = await createPurchaseOrder(tx, vendorId, fx, actor, { supplierId, warehouseId: warehouse.id, lines, reference: 'reorder-suggestions', notes: 'Created from reorder suggestions' }, { enforceMoq: false });
    orders.push({ id: row.id as string | null, poNumber: row.poNumber as string | null, supplierId, supplierName: items[0]!.supplier!.name, lines: lines.length, units: lines.reduce((s, l) => s + l.quantity, 0), totalMinor: row.totalMinor, skus: items.map((s) => s.sku) });
  }
  return { dryRun: input.dryRun, warehouseId: warehouse.id, orders, unassigned };
}

// ------------------------------------------------------------------------------------------------
// overview tiles
// ------------------------------------------------------------------------------------------------
export async function procurementOverview(tx: Tx, vendorId: string) {
  const open = statusList(OPEN_PO_STATUSES);
  const [t] = await rows(tx, sql`select
      count(*)::int open_pos,
      count(distinct p.warehouse_id)::int inbound_warehouses
    from purchase_orders p where p.vendor_id = ${vendorId} and p.status in (${open})`);
  const [late] = await rows(tx, sql`select count(*)::int n from purchase_orders p where p.vendor_id = ${vendorId} and p.status in (${open}) and p.expected_at is not null
      and ((date_trunc('day', p.expected_at at time zone 'UTC') + interval '1 day') at time zone 'UTC') <= now()`);
  const [week] = await rows(tx, sql`select count(*)::int n from purchase_orders p where p.vendor_id = ${vendorId} and p.status in (${open}) and p.expected_at is not null
      and p.expected_at >= now() and p.expected_at < now() + interval '7 days'`);
  const [owed] = await rows(tx, sql`select coalesce(sum(l.quantity_ordered - l.quantity_received), 0)::int units, coalesce(sum((l.quantity_ordered - l.quantity_received) * l.unit_cost_minor), 0)::bigint value
    from purchase_order_lines l join purchase_orders p on p.id = l.purchase_order_id and p.vendor_id = l.vendor_id where l.vendor_id = ${vendorId} and p.status in (${open})`);
  const byStatus = await rows(tx, sql`select status, count(*)::int n from purchase_orders where vendor_id = ${vendorId} group by status`);
  const [sup] = await rows(tx, sql`select count(*) filter (where status = 'active')::int active, count(*)::int total, avg(lead_time_days) filter (where status = 'active') configured from suppliers where vendor_id = ${vendorId} and deleted_at is null`);
  const [wh] = await rows(tx, sql`select count(*)::int n from warehouses where vendor_id = ${vendorId} and deleted_at is null and status = 'active'`);
  const delivered = await supplierDeliveryStats(tx, vendorId);
  const names = delivered.size ? await tx.select({ id: S.id, name: S.name }).from(S).where(and(eq(S.vendorId, vendorId), inArray(S.id, [...delivered.keys()]))) : [];
  const leadTimes = [...delivered.entries()].map(([supplierId, d]) => ({ supplierId, supplierName: names.find((n) => n.id === supplierId)?.name ?? null, averageLeadTimeDays: d.averageLeadTimeDays, deliveredPurchaseOrders: d.delivered })).sort((a, b) => b.deliveredPurchaseOrders - a.deliveredPurchaseOrders);
  const withLead = leadTimes.filter((l) => l.averageLeadTimeDays !== null);
  const weighted = withLead.reduce((s, l) => s + l.averageLeadTimeDays! * l.deliveredPurchaseOrders, 0);
  const deliveredCount = withLead.reduce((s, l) => s + l.deliveredPurchaseOrders, 0);
  const counts: Record<string, number> = Object.fromEntries(schema.PURCHASE_ORDER_STATUSES.map((s) => [s, 0]));
  for (const r of byStatus) counts[String(r.status)] = num(r.n);
  return {
    openPurchaseOrders: num(t?.open_pos), unitsInTransit: num(owed?.units), valueInTransitMinor: num(owed?.value), latePurchaseOrders: num(late?.n), dueThisWeek: num(week?.n),
    warehousesCount: num(wh?.n), warehousesWithInbound: num(t?.inbound_warehouses), activeSuppliers: num(sup?.active), totalSuppliers: num(sup?.total),
    averageLeadTimeDays: deliveredCount > 0 ? round1(weighted / deliveredCount) : null,
    configuredLeadTimeDays: sup?.configured === null || sup?.configured === undefined ? null : round1(Number(sup.configured)),
    leadTimeBySupplier: leadTimes, statusCounts: counts, reorderSuggestionsCount: (await reorderSuggestions(tx, vendorId)).length,
  };
}
