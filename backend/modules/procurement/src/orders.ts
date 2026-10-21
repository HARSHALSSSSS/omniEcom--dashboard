import { and, eq, gte, ilike, inArray, isNull, lt, or, schema, sql, escapeLike, writeAudit, writeOutboxEvent, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { nextCounter } from '@oms/mod-inventory';
import { activeWarehouse, defaultWarehouse, getSupplierRow, invalid, rule, type Actor, type Fx, type PoLineRow, type PoRow, type SupplierRow } from './common';
import { asUuid, formatPoNumber, isLate, lineAmounts, outstanding, poTotals } from './domain';

const PO = schema.purchaseOrders;
const POL = schema.purchaseOrderLines;
const POR = schema.purchaseOrderReceipts;
const S = schema.suppliers;
const SP = schema.supplierProducts;
const V = schema.productVariants;
const P = schema.products;
const W = schema.warehouses;

export interface PoLineInput { variantId: string; quantity: number; unitCostMinor?: number }
export interface PoInput {
  supplierId?: string; warehouseId?: string; lines: PoLineInput[]; expectedAt?: Date | null; shippingMinor?: number; paymentTerms?: string | null; reference?: string | null; notes?: string | null;
}

// ------------------------------------------------------------------------------------------------
// line resolution: defaults from the supplier's price list, tax from the variant, totals in minor units
// ------------------------------------------------------------------------------------------------
interface ResolvedLine { variantId: string; sku: string; title: string; quantity: number; unitCostMinor: number; taxRateBps: number; totalMinor: number; taxMinor: number }

async function resolveLines(tx: Tx, vendorId: string, supplier: SupplierRow, lines: PoLineInput[], enforceMoq: boolean): Promise<ResolvedLine[]> {
  if (lines.length === 0) throw invalid('lines', 'A purchase order needs at least one line', 'no_lines');
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.variantId)) throw invalid('lines', 'Each variant may appear once; raise the quantity instead', 'duplicate_line');
    seen.add(l.variantId);
  }
  const ids = lines.map((l) => l.variantId);
  const variants = await tx.select({ id: V.id, sku: V.sku, title: P.title, cost: V.costPriceMinor, variantTax: V.taxRateBps, productTax: P.gstRateBps }).from(V)
    .innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId))).where(and(eq(V.vendorId, vendorId), isNull(V.deletedAt), inArray(V.id, ids)));
  const byVariant = new Map(variants.map((v) => [v.id, v]));
  const prices = new Map((await tx.select().from(SP).where(and(eq(SP.vendorId, vendorId), eq(SP.supplierId, supplier.id), inArray(SP.variantId, ids)))).map((p) => [p.variantId, p]));
  return lines.map((l, i) => {
    const v = byVariant.get(l.variantId);
    if (!v) throw Errors.notFound('Variant', l.variantId);
    const listed = prices.get(l.variantId);
    const quantity = enforceMoq ? l.quantity : Math.max(l.quantity, listed?.minOrderQuantity ?? 1);
    if (enforceMoq && listed && quantity < listed.minOrderQuantity) throw invalid(`lines.${i}.quantity`, `${v.sku}: the supplier's minimum order quantity is ${listed.minOrderQuantity}`, 'below_moq');
    const unitCostMinor = l.unitCostMinor ?? listed?.costMinor ?? v.cost;
    if (unitCostMinor === null || unitCostMinor === undefined) throw invalid(`lines.${i}.unitCostMinor`, `${v.sku}: no cost known; set the supplier price or send unitCostMinor`, 'cost_required');
    const taxRateBps = v.variantTax ?? v.productTax ?? 0;
    return { variantId: v.id, sku: v.sku, title: v.title, quantity, unitCostMinor, taxRateBps, ...lineAmounts(quantity, unitCostMinor, taxRateBps) };
  });
}

/** supplier for a PO that names none: the preferred (else cheapest) active supplier of the first line's variant */
async function supplierForLines(tx: Tx, vendorId: string, variantIds: string[]): Promise<SupplierRow> {
  for (const variantId of variantIds) {
    const [hit] = await tx.select({ s: S }).from(SP).innerJoin(S, and(eq(S.id, SP.supplierId), eq(S.vendorId, SP.vendorId)))
      .where(and(eq(SP.vendorId, vendorId), eq(SP.variantId, variantId), eq(S.status, 'active'), isNull(S.deletedAt))).orderBy(sql`${SP.isPreferred} desc`, SP.costMinor).limit(1);
    if (hit) return hit.s;
  }
  throw rule('No active supplier sells these products; choose a supplier', 'no_supplier');
}

const assertSupplierActive = (s: SupplierRow): void => {
  if (s.status !== 'active') throw rule(`Supplier ${s.name} is ${s.status}`, 'supplier_not_active', { status: s.status });
};

// ------------------------------------------------------------------------------------------------
// create / update / delete (drafts)
// ------------------------------------------------------------------------------------------------
async function writeLines(tx: Tx, vendorId: string, poId: string, lines: ResolvedLine[]): Promise<void> {
  await tx.insert(POL).values(lines.map((l) => ({
    vendorId, purchaseOrderId: poId, variantId: l.variantId, sku: l.sku, title: l.title, quantityOrdered: l.quantity, unitCostMinor: l.unitCostMinor, taxRateBps: l.taxRateBps, totalMinor: l.totalMinor,
  })));
}

export async function createPurchaseOrder(tx: Tx, vendorId: string, fx: Fx, actor: Actor, input: PoInput, o: { enforceMoq?: boolean; duplicatedFrom?: string } = {}) {
  const supplier = input.supplierId ? await getSupplierRow(tx, vendorId, input.supplierId) : await supplierForLines(tx, vendorId, input.lines.map((l) => l.variantId));
  assertSupplierActive(supplier);
  const warehouse = input.warehouseId ? await activeWarehouse(tx, vendorId, input.warehouseId) : await defaultWarehouse(tx, vendorId);
  const lines = await resolveLines(tx, vendorId, supplier, input.lines, o.enforceMoq ?? true);
  const totals = poTotals(lines, input.shippingMinor ?? 0);
  const year = new Date().getUTCFullYear();
  const poNumber = formatPoNumber(year, await nextCounter(tx, vendorId, `purchase_order:${year}`));
  const [row] = await tx.insert(PO).values({
    vendorId, poNumber, supplierId: supplier.id, warehouseId: warehouse.id, status: 'draft', expectedAt: input.expectedAt ?? null, currency: supplier.currency, ...totals,
    paymentTerms: input.paymentTerms ?? supplier.paymentTerms, reference: input.reference ?? null, notes: input.notes ?? null, createdBy: asUuid(actor.id),
  }).returning();
  await writeLines(tx, vendorId, row!.id, lines);
  await fx.audit({ action: 'purchase_order.create', resourceType: 'purchase_order', resourceId: row!.id, after: { poNumber, supplierId: supplier.id, warehouseId: warehouse.id, lines: lines.length, totalMinor: totals.totalMinor }, ...(o.duplicatedFrom ? { metadata: { duplicatedFrom: o.duplicatedFrom } } : {}) });
  return { row: row!, lines };
}

/**
 * Other modules (product intelligence, automation) draft a PO here. Missing supplier = the preferred supplier of the first line, missing
 * warehouse = the default one. Quantities below the supplier's minimum order are raised to it (an automation must not fail on MOQ).
 * Nothing is submitted: a person approves the draft.
 */
export async function createDraftPurchaseOrder(tx: Tx, vendorId: string, input: { supplierId?: string; warehouseId?: string; lines: Array<{ variantId: string; quantity: number; unitCostMinor?: number }>; reference?: string; notes?: string; actor?: Actor }): Promise<{ id: string; poNumber: string }> {
  const actor = input.actor ?? { type: 'system' as const, id: null };
  const fx: Fx = {
    audit: (e) => writeAudit(tx, { vendorId, actorType: actor.type, actorId: actor.id ?? null, ...e }),
    event: async (e) => void (await writeOutboxEvent(tx, { vendorId, ...e })),
  };
  const { row } = await createPurchaseOrder(tx, vendorId, fx, actor, { supplierId: input.supplierId, warehouseId: input.warehouseId, lines: input.lines, reference: input.reference, notes: input.notes }, { enforceMoq: false });
  return { id: row.id, poNumber: row.poNumber };
}

export async function getPoRow(tx: Tx, vendorId: string, id: string, lock = false): Promise<PoRow> {
  const q = tx.select().from(PO).where(and(eq(PO.id, id), eq(PO.vendorId, vendorId)));
  const [row] = await (lock ? q.for('update') : q);
  if (!row) throw Errors.notFound('Purchase order', id);
  return row;
}

export async function updatePurchaseOrder(tx: Tx, vendorId: string, fx: Fx, id: string, patch: Partial<PoInput> & { version?: number }) {
  const before = await getPoRow(tx, vendorId, id, true);
  if (before.status !== 'draft') throw rule(`A ${before.status} purchase order can no longer be edited`, 'not_draft', { status: before.status });
  if (patch.version !== undefined && patch.version !== before.version) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: before.version } });
  const supplier = patch.supplierId && patch.supplierId !== before.supplierId ? await getSupplierRow(tx, vendorId, patch.supplierId) : await getSupplierRow(tx, vendorId, before.supplierId);
  assertSupplierActive(supplier);
  const warehouse = patch.warehouseId && patch.warehouseId !== before.warehouseId ? await activeWarehouse(tx, vendorId, patch.warehouseId) : null;
  let totals = { subtotalMinor: before.subtotalMinor, taxMinor: before.taxMinor, shippingMinor: patch.shippingMinor ?? before.shippingMinor, totalMinor: before.totalMinor };
  if (patch.lines) {
    const lines = await resolveLines(tx, vendorId, supplier, patch.lines, true);
    await tx.delete(POL).where(and(eq(POL.vendorId, vendorId), eq(POL.purchaseOrderId, id)));
    await writeLines(tx, vendorId, id, lines);
    totals = poTotals(lines, patch.shippingMinor ?? before.shippingMinor);
  } else if (patch.shippingMinor !== undefined) {
    totals = { ...totals, shippingMinor: patch.shippingMinor, totalMinor: before.subtotalMinor + before.taxMinor + patch.shippingMinor };
  }
  const [after] = await tx.update(PO).set({
    supplierId: supplier.id, warehouseId: warehouse?.id ?? before.warehouseId, expectedAt: patch.expectedAt !== undefined ? patch.expectedAt : before.expectedAt,
    paymentTerms: patch.paymentTerms !== undefined ? patch.paymentTerms : supplier.id !== before.supplierId ? supplier.paymentTerms : before.paymentTerms,
    reference: patch.reference !== undefined ? patch.reference : before.reference, notes: patch.notes !== undefined ? patch.notes : before.notes, ...totals, version: sql`${PO.version} + 1`,
  }).where(and(eq(PO.id, id), eq(PO.vendorId, vendorId))).returning();
  await fx.audit({ action: 'purchase_order.update', resourceType: 'purchase_order', resourceId: id, before: { supplierId: before.supplierId, totalMinor: before.totalMinor }, after: { supplierId: after!.supplierId, totalMinor: after!.totalMinor, linesReplaced: !!patch.lines } });
  return after!;
}

export async function deleteDraft(tx: Tx, vendorId: string, fx: Fx, id: string): Promise<PoRow> {
  const po = await getPoRow(tx, vendorId, id, true);
  if (po.status !== 'draft') throw rule(`Only a draft can be deleted; cancel a ${po.status} purchase order instead`, 'not_draft', { status: po.status });
  await tx.delete(PO).where(and(eq(PO.id, id), eq(PO.vendorId, vendorId)));
  await fx.audit({ action: 'purchase_order.delete', resourceType: 'purchase_order', resourceId: id, before: { poNumber: po.poNumber, totalMinor: po.totalMinor } });
  return po;
}

export async function duplicatePurchaseOrder(tx: Tx, vendorId: string, fx: Fx, actor: Actor, id: string) {
  const po = await getPoRow(tx, vendorId, id);
  const lines = await tx.select().from(POL).where(and(eq(POL.vendorId, vendorId), eq(POL.purchaseOrderId, id))).orderBy(POL.createdAt, POL.id);
  const supplier = await getSupplierRow(tx, vendorId, po.supplierId);
  const [wh] = await tx.select({ status: W.status }).from(W).where(and(eq(W.id, po.warehouseId), eq(W.vendorId, vendorId), isNull(W.deletedAt)));
  return createPurchaseOrder(tx, vendorId, fx, actor, {
    supplierId: supplier.id, warehouseId: wh?.status === 'active' ? po.warehouseId : undefined, shippingMinor: po.shippingMinor, paymentTerms: po.paymentTerms, notes: `Copy of ${po.poNumber}`,
    lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantityOrdered, unitCostMinor: l.unitCostMinor })),
  }, { enforceMoq: false, duplicatedFrom: id });
}

// ------------------------------------------------------------------------------------------------
// reads
// ------------------------------------------------------------------------------------------------
export const toLineDto = (l: PoLineRow) => {
  const { taxMinor } = lineAmounts(l.quantityOrdered, l.unitCostMinor, l.taxRateBps);
  return {
    id: l.id, variantId: l.variantId, sku: l.sku, title: l.title, quantityOrdered: l.quantityOrdered, quantityReceived: l.quantityReceived, quantityDamaged: l.quantityDamaged, quantityOutstanding: outstanding(l),
    unitCostMinor: l.unitCostMinor, taxRateBps: l.taxRateBps, taxMinor, totalMinor: l.totalMinor,
  };
};

interface PoListParts { po: PoRow; supplierName: string; supplierCode: string; warehouseName: string; warehouseCode: string }
interface LineAgg { lines: number; ordered: number; received: number; damaged: number }

export const toPoSummaryDto = (p: PoListParts, a: LineAgg, now = new Date()) => ({
  id: p.po.id, poNumber: p.po.poNumber, supplierId: p.po.supplierId, supplierName: p.supplierName, supplierCode: p.supplierCode, warehouseId: p.po.warehouseId, warehouseName: p.warehouseName, warehouseCode: p.warehouseCode,
  status: p.po.status as (typeof schema.PURCHASE_ORDER_STATUSES)[number], itemsCount: a.lines, unitsOrdered: a.ordered, unitsReceived: a.received, unitsDamaged: a.damaged, unitsOutstanding: Math.max(0, a.ordered - a.received),
  currency: p.po.currency.trim(), subtotalMinor: p.po.subtotalMinor, taxMinor: p.po.taxMinor, shippingMinor: p.po.shippingMinor, totalMinor: p.po.totalMinor,
  orderDate: p.po.orderDate.toISOString(), expectedAt: p.po.expectedAt ? p.po.expectedAt.toISOString() : null, submittedAt: p.po.submittedAt ? p.po.submittedAt.toISOString() : null,
  receivedAt: p.po.receivedAt ? p.po.receivedAt.toISOString() : null, isLate: isLate(p.po.status, p.po.expectedAt, now), reference: p.po.reference, notes: p.po.notes, version: p.po.version,
  createdAt: p.po.createdAt.toISOString(), updatedAt: p.po.updatedAt.toISOString(),
});

async function lineAggregates(tx: Tx, vendorId: string, ids: string[]): Promise<Map<string, LineAgg>> {
  const out = new Map<string, LineAgg>(ids.map((id) => [id, { lines: 0, ordered: 0, received: 0, damaged: 0 }]));
  if (ids.length === 0) return out;
  const rows = await tx.select({ id: POL.purchaseOrderId, lines: sql<number>`count(*)::int`, ordered: sql<number>`sum(${POL.quantityOrdered})::int`, received: sql<number>`sum(${POL.quantityReceived})::int`, damaged: sql<number>`sum(${POL.quantityDamaged})::int` })
    .from(POL).where(and(eq(POL.vendorId, vendorId), inArray(POL.purchaseOrderId, ids))).groupBy(POL.purchaseOrderId);
  for (const r of rows) out.set(r.id, { lines: r.lines, ordered: r.ordered, received: r.received, damaged: r.damaged });
  return out;
}

export interface PoListQuery {
  page: { limit: number; offset: number }; status?: string; supplierId?: string; warehouseId?: string; q?: string; from?: Date; to?: Date;
  sort: 'orderDate' | '-orderDate' | 'expectedAt' | '-expectedAt' | 'totalMinor' | '-totalMinor' | 'poNumber' | '-poNumber';
}

export async function listPurchaseOrders(tx: Tx, vendorId: string, q: PoListQuery) {
  const search = q.q ? or(ilike(PO.poNumber, `%${escapeLike(q.q)}%`), ilike(S.name, `%${escapeLike(q.q)}%`), ilike(PO.reference, `%${escapeLike(q.q)}%`)) : undefined;
  const common = [eq(PO.vendorId, vendorId), q.supplierId ? eq(PO.supplierId, q.supplierId) : undefined, q.warehouseId ? eq(PO.warehouseId, q.warehouseId) : undefined, q.from ? gte(PO.orderDate, q.from) : undefined, q.to ? lt(PO.orderDate, q.to) : undefined, search];
  const [{ total } = { total: 0 }] = await tx.select({ total: sql<number>`count(*)::int` }).from(PO).innerJoin(S, and(eq(S.id, PO.supplierId), eq(S.vendorId, PO.vendorId))).where(and(...common, q.status ? eq(PO.status, q.status) : undefined));
  const field = q.sort.replace(/^-/, '');
  const col = field === 'orderDate' ? PO.orderDate : field === 'expectedAt' ? PO.expectedAt : field === 'totalMinor' ? PO.totalMinor : PO.poNumber;
  const dir = q.sort.startsWith('-') ? sql`desc nulls last` : sql`asc nulls last`;
  const page = await tx.select({ po: PO, supplierName: S.name, supplierCode: S.code, warehouseName: W.name, warehouseCode: W.code }).from(PO)
    .innerJoin(S, and(eq(S.id, PO.supplierId), eq(S.vendorId, PO.vendorId))).innerJoin(W, and(eq(W.id, PO.warehouseId), eq(W.vendorId, PO.vendorId)))
    .where(and(...common, q.status ? eq(PO.status, q.status) : undefined)).orderBy(sql`${col} ${dir}`, PO.id).limit(q.page.limit).offset(q.page.offset);
  const counts = await tx.select({ status: PO.status, n: sql<number>`count(*)::int` }).from(PO).innerJoin(S, and(eq(S.id, PO.supplierId), eq(S.vendorId, PO.vendorId))).where(and(...common)).groupBy(PO.status);
  const agg = await lineAggregates(tx, vendorId, page.map((r) => r.po.id));
  const now = new Date();
  const byStatus: Record<string, number> = Object.fromEntries(schema.PURCHASE_ORDER_STATUSES.map((s) => [s, 0]));
  for (const c of counts) byStatus[c.status] = c.n;
  return { items: page.map((r) => toPoSummaryDto(r, agg.get(r.po.id)!, now)), total, counts: { all: Object.values(byStatus).reduce((a, b) => a + b, 0), ...byStatus } };
}

const TIMELINE_LABELS: Record<string, string> = {
  'purchase_order.create': 'Draft created', 'purchase_order.update': 'Draft edited', 'purchase_order.approve': 'Approved and sent to the supplier', 'purchase_order.acknowledge': 'Supplier acknowledged the order',
  'purchase_order.cancel': 'Cancelled',
};

export async function getPurchaseOrderDetail(tx: Tx, vendorId: string, id: string) {
  const po = await getPoRow(tx, vendorId, id);
  const [supplier] = await tx.select().from(S).where(and(eq(S.id, po.supplierId), eq(S.vendorId, vendorId)));
  const [warehouse] = await tx.select({ id: W.id, code: W.code, name: W.name }).from(W).where(and(eq(W.id, po.warehouseId), eq(W.vendorId, vendorId)));
  const lines = await tx.select().from(POL).where(and(eq(POL.vendorId, vendorId), eq(POL.purchaseOrderId, id))).orderBy(POL.createdAt, POL.id);
  const receipts = await tx.select().from(POR).where(and(eq(POR.vendorId, vendorId), eq(POR.purchaseOrderId, id))).orderBy(POR.receivedAt, POR.id);
  const audits = await tx.select({ id: schema.auditLogs.id, action: schema.auditLogs.action, actorType: schema.auditLogs.actorType, actorId: schema.auditLogs.actorId, createdAt: schema.auditLogs.createdAt, after: schema.auditLogs.after })
    .from(schema.auditLogs).where(and(eq(schema.auditLogs.vendorId, vendorId), eq(schema.auditLogs.resourceType, 'purchase_order'), eq(schema.auditLogs.resourceId, id))).orderBy(schema.auditLogs.id);

  const userIds = [...new Set([...audits.filter((a) => a.actorType === 'user').map((a) => asUuid(a.actorId)), ...receipts.map((r) => r.receivedBy)].filter((x): x is string => !!x))];
  const users = userIds.length ? await tx.select({ id: schema.users.id, name: schema.users.fullName }).from(schema.users).where(inArray(schema.users.id, userIds)) : [];
  const nameOf = (uid: string | null) => (uid ? users.find((u) => u.id === uid)?.name ?? null : null);
  const skuOf = new Map(lines.map((l) => [l.id, l.sku]));
  const agg: LineAgg = { lines: lines.length, ordered: lines.reduce((s, l) => s + l.quantityOrdered, 0), received: lines.reduce((s, l) => s + l.quantityReceived, 0), damaged: lines.reduce((s, l) => s + l.quantityDamaged, 0) };

  const timeline = [
    ...audits.filter((a) => TIMELINE_LABELS[a.action]).map((a) => {
      const note = a.action === 'purchase_order.cancel' ? (a.after as { reason?: string } | null)?.reason ?? null : null;
      return { at: a.createdAt, type: a.action.replace('purchase_order.', ''), label: TIMELINE_LABELS[a.action]!, actorId: asUuid(a.actorId), actorName: nameOf(asUuid(a.actorId)), note };
    }),
    ...receipts.map((r) => {
      const got = r.items.reduce((s, i) => s + i.received, 0);
      const bad = r.items.reduce((s, i) => s + i.damaged, 0);
      return { at: r.receivedAt, type: 'receipt', label: `Received ${got} unit${got === 1 ? '' : 's'}${bad ? ` (${bad} damaged)` : ''}`, actorId: r.receivedBy, actorName: nameOf(r.receivedBy), note: r.note };
    }),
  ].sort((a, b) => a.at.getTime() - b.at.getTime()).map((e) => ({ ...e, at: e.at.toISOString() }));

  return {
    ...toPoSummaryDto({ po, supplierName: supplier!.name, supplierCode: supplier!.code, warehouseName: warehouse!.name, warehouseCode: warehouse!.code }, agg),
    paymentTerms: po.paymentTerms, cancelReason: po.cancelReason, acknowledgedAt: po.acknowledgedAt ? po.acknowledgedAt.toISOString() : null, cancelledAt: po.cancelledAt ? po.cancelledAt.toISOString() : null,
    approvedBy: po.approvedBy, approvedAt: po.approvedAt ? po.approvedAt.toISOString() : null, createdBy: po.createdBy,
    supplier: { id: supplier!.id, code: supplier!.code, name: supplier!.name, contactPerson: supplier!.contactPerson, email: supplier!.email, phone: supplier!.phone, gstin: supplier!.gstin, city: supplier!.city, state: supplier!.state, status: supplier!.status },
    warehouse: warehouse!, lines: lines.map(toLineDto),
    receipts: receipts.map((r) => ({
      id: r.id, receivedAt: r.receivedAt.toISOString(), receivedBy: r.receivedBy ? { id: r.receivedBy, name: nameOf(r.receivedBy) } : null, note: r.note,
      items: r.items.map((i) => ({ lineId: i.lineId, variantId: i.variantId, sku: skuOf.get(i.lineId) ?? null, received: i.received, damaged: i.damaged })),
    })),
    timeline,
  };
}
