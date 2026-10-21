import { and, eq, schema, sql, type Tx } from '@oms/database';
import { AppError, newId } from '@oms/shared';
import { addIncoming, markDamaged, receiveStock } from '@oms/mod-inventory';
import { activeWarehouse, getSupplierRow, invalid, rule, type Actor, type Fx, type PoLineRow, type PoRow } from './common';
import { CANCELLABLE_STATUSES, RECEIVABLE_STATUSES, asUuid, nextStatusAfterReceipt, outstanding } from './domain';
import { getPoRow } from './orders';

const PO = schema.purchaseOrders;
const POL = schema.purchaseOrderLines;
const POR = schema.purchaseOrderReceipts;
const SP = schema.supplierProducts;

const DAY_MS = 86_400_000;

async function linesOf(tx: Tx, vendorId: string, poId: string, lock = false): Promise<PoLineRow[]> {
  const q = tx.select().from(POL).where(and(eq(POL.vendorId, vendorId), eq(POL.purchaseOrderId, poId))).orderBy(POL.createdAt, POL.id);
  return lock ? q.for('update') : q;
}

const checkVersion = (po: PoRow, version?: number): void => {
  if (version !== undefined && version !== po.version) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: po.version } });
};

// ------------------------------------------------------------------------------------------------
// approve: draft -> submitted. The expected units become `incoming` in the PO's warehouse (inventory ledger).
// ------------------------------------------------------------------------------------------------
export async function approvePurchaseOrder(tx: Tx, vendorId: string, fx: Fx, actor: Actor, id: string, o: { version?: number; expectedAt?: Date | null } = {}) {
  const po = await getPoRow(tx, vendorId, id, true);
  if (po.status !== 'draft') throw rule(`A ${po.status} purchase order cannot be approved`, 'not_draft', { status: po.status });
  checkVersion(po, o.version);
  const supplier = await getSupplierRow(tx, vendorId, po.supplierId);
  if (supplier.status !== 'active') throw rule(`Supplier ${supplier.name} is ${supplier.status}`, 'supplier_not_active', { status: supplier.status });
  await activeWarehouse(tx, vendorId, po.warehouseId);
  const lines = await linesOf(tx, vendorId, id);
  if (lines.length === 0) throw invalid('lines', 'A purchase order needs at least one line', 'no_lines');

  const listed = await tx.select({ variantId: SP.variantId, lead: SP.leadTimeDays }).from(SP).where(and(eq(SP.vendorId, vendorId), eq(SP.supplierId, supplier.id)));
  const leadDays = Math.max(supplier.leadTimeDays, ...lines.map((l) => listed.find((p) => p.variantId === l.variantId)?.lead ?? 0));
  const now = new Date();
  const expectedAt = o.expectedAt ?? po.expectedAt ?? new Date(now.getTime() + leadDays * DAY_MS);
  for (const l of lines) {
    await addIncoming(tx, {
      vendorId, variantId: l.variantId, warehouseId: po.warehouseId, quantity: l.quantityOrdered, reason: `purchase order ${po.poNumber} submitted`,
      idempotencyKey: `po-submit:${po.id}:${l.variantId}`, referenceType: 'import', referenceId: po.id, actor,
    });
  }
  const [after] = await tx.update(PO).set({ status: 'submitted', submittedAt: now, approvedAt: now, approvedBy: asUuid(actor.id), expectedAt, version: sql`${PO.version} + 1` }).where(and(eq(PO.id, id), eq(PO.vendorId, vendorId))).returning();
  const units = lines.reduce((s, l) => s + l.quantityOrdered, 0);
  await fx.audit({ action: 'purchase_order.approve', resourceType: 'purchase_order', resourceId: id, before: { status: 'draft' }, after: { status: 'submitted', units, totalMinor: po.totalMinor, expectedAt: expectedAt.toISOString() } });
  await fx.event({ type: 'purchase_order.submitted', aggregateType: 'purchase_order', aggregateId: id, payload: { poNumber: po.poNumber, supplierId: po.supplierId, warehouseId: po.warehouseId, totalMinor: po.totalMinor, units, expectedAt: expectedAt.toISOString() } });
  return after!;
}

// ------------------------------------------------------------------------------------------------
// acknowledge: the supplier confirmed (optionally with a new delivery date)
// ------------------------------------------------------------------------------------------------
export async function acknowledgePurchaseOrder(tx: Tx, vendorId: string, fx: Fx, id: string, o: { version?: number; expectedAt?: Date | null }) {
  const po = await getPoRow(tx, vendorId, id, true);
  if (po.status !== 'submitted') throw rule(`Only a submitted purchase order can be acknowledged (this one is ${po.status})`, 'not_submitted', { status: po.status });
  checkVersion(po, o.version);
  const [after] = await tx.update(PO).set({ status: 'acknowledged', acknowledgedAt: new Date(), expectedAt: o.expectedAt ?? po.expectedAt, version: sql`${PO.version} + 1` }).where(and(eq(PO.id, id), eq(PO.vendorId, vendorId))).returning();
  await fx.audit({ action: 'purchase_order.acknowledge', resourceType: 'purchase_order', resourceId: id, before: { status: 'submitted', expectedAt: po.expectedAt?.toISOString() ?? null }, after: { status: 'acknowledged', expectedAt: after!.expectedAt?.toISOString() ?? null } });
  return after!;
}

// ------------------------------------------------------------------------------------------------
// receive: one goods receipt (a PO can be received in several parts)
// ------------------------------------------------------------------------------------------------
export interface ReceiptItemInput { lineId?: string; variantId?: string; receivedQuantity: number; damagedQuantity?: number }
type StoredItem = { lineId: string; variantId: string; received: number; damaged: number; receiptKey?: string };

/**
 * `receivedQuantity` is what physically arrived NOW (good + damaged), `damagedQuantity` the damaged part of it. Good units go on hand,
 * damaged units to the damaged bucket, both out of `incoming` (so incoming cannot drift). The PO row is locked first: two receipts of the
 * same line serialise and the second one sees the first one's quantities, so a line can never be over-received. A repeated `receiptKey`
 * returns the original receipt and moves nothing.
 */
export async function receivePurchaseOrder(tx: Tx, vendorId: string, fx: Fx, actor: Actor, id: string, input: { items: ReceiptItemInput[]; note?: string | null; receiptKey?: string; version?: number }) {
  const po = await getPoRow(tx, vendorId, id, true);
  if (input.receiptKey) {
    const previous = await tx.select().from(POR).where(and(eq(POR.vendorId, vendorId), eq(POR.purchaseOrderId, id)));
    const hit = previous.find((r) => (r.items as StoredItem[]).some((i) => i.receiptKey === input.receiptKey));
    if (hit) return { po, receiptId: hit.id, duplicate: true };
  }
  if (!RECEIVABLE_STATUSES.includes(po.status)) throw rule(`A ${po.status} purchase order cannot receive goods`, 'not_receivable', { status: po.status });
  checkVersion(po, input.version);
  const lines = await linesOf(tx, vendorId, id, true);
  const picked = new Map<string, { line: PoLineRow; received: number; damaged: number }>();
  input.items.forEach((item, i) => {
    const line = lines.find((l) => (item.lineId ? l.id === item.lineId : l.variantId === item.variantId));
    if (!line) throw invalid(`items.${i}`, 'That line is not part of this purchase order', 'unknown_line');
    if (picked.has(line.id)) throw invalid(`items.${i}`, 'Each line may appear once per receipt', 'duplicate_line');
    const damaged = item.damagedQuantity ?? 0;
    if (damaged > item.receivedQuantity) throw invalid(`items.${i}.damagedQuantity`, 'damagedQuantity cannot exceed receivedQuantity', 'damaged_exceeds_received');
    picked.set(line.id, { line, received: item.receivedQuantity, damaged });
  });
  const arriving = [...picked.values()].filter((p) => p.received > 0);
  if (arriving.length === 0) throw invalid('items', 'Nothing was received', 'nothing_received');
  for (const p of arriving) {
    const left = outstanding(p.line);
    if (p.received > left) throw rule(`${p.line.sku}: ${p.received} units exceed the ${left} still outstanding`, 'over_receipt', { lineId: p.line.id, sku: p.line.sku, outstanding: left, received: p.received });
  }

  const receiptId = newId();
  const key = input.receiptKey ?? receiptId;
  for (const p of arriving) {
    const target = { vendorId, variantId: p.line.variantId, warehouseId: po.warehouseId, referenceType: 'import' as const, referenceId: po.id, actor };
    await receiveStock(tx, { ...target, quantity: p.received, fromIncoming: true, reason: `purchase order ${po.poNumber} received`, idempotencyKey: `po-recv:${po.id}:${key}:${p.line.variantId}` });
    if (p.damaged > 0) await markDamaged(tx, { ...target, quantity: p.damaged, reason: `purchase order ${po.poNumber} received damaged`, idempotencyKey: `po-recv-damaged:${po.id}:${key}:${p.line.variantId}` });
    await tx.update(POL).set({ quantityReceived: p.line.quantityReceived + p.received, quantityDamaged: p.line.quantityDamaged + p.damaged }).where(eq(POL.id, p.line.id));
    p.line.quantityReceived += p.received;
    p.line.quantityDamaged += p.damaged;
  }
  const now = new Date();
  const stored: StoredItem[] = arriving.map((p) => ({ lineId: p.line.id, variantId: p.line.variantId, received: p.received, damaged: p.damaged, ...(input.receiptKey ? { receiptKey: input.receiptKey } : {}) }));
  await tx.insert(POR).values({ id: receiptId, vendorId, purchaseOrderId: id, warehouseId: po.warehouseId, receivedBy: asUuid(actor.id), receivedAt: now, note: input.note ?? null, items: stored });
  const status = nextStatusAfterReceipt(lines);
  const [after] = await tx.update(PO).set({ status, receivedAt: status === 'received' ? now : po.receivedAt, version: sql`${PO.version} + 1` }).where(and(eq(PO.id, id), eq(PO.vendorId, vendorId))).returning();
  const units = arriving.reduce((s, p) => s + p.received, 0);
  const damaged = arriving.reduce((s, p) => s + p.damaged, 0);
  await fx.audit({ action: 'purchase_order.receive', resourceType: 'purchase_order', resourceId: id, before: { status: po.status }, after: { status, units, damaged, receiptId } });
  await fx.event({ type: 'purchase_order.received', aggregateType: 'purchase_order', aggregateId: id, payload: { poNumber: po.poNumber, warehouseId: po.warehouseId, receiptId, units, damaged, complete: status === 'received' } });
  return { po: after!, receiptId, duplicate: false };
}

// ------------------------------------------------------------------------------------------------
// cancel: whatever never arrived stops being `incoming`
// ------------------------------------------------------------------------------------------------
export async function cancelPurchaseOrder(tx: Tx, vendorId: string, fx: Fx, actor: Actor, id: string, input: { reason: string; version?: number }) {
  const po = await getPoRow(tx, vendorId, id, true);
  if (!CANCELLABLE_STATUSES.includes(po.status)) throw rule(`A ${po.status} purchase order cannot be cancelled`, 'not_cancellable', { status: po.status });
  checkVersion(po, input.version);
  let released = 0;
  if (po.status !== 'draft') {
    for (const l of await linesOf(tx, vendorId, id, true)) {
      const left = outstanding(l);
      if (left === 0) continue;
      await addIncoming(tx, {
        vendorId, variantId: l.variantId, warehouseId: po.warehouseId, quantity: -left, reason: `purchase order ${po.poNumber} cancelled`,
        idempotencyKey: `po-cancel:${po.id}:${l.variantId}`, referenceType: 'import', referenceId: po.id, actor,
      });
      released += left;
    }
  }
  const [after] = await tx.update(PO).set({ status: 'cancelled', cancelledAt: new Date(), cancelReason: input.reason, version: sql`${PO.version} + 1` }).where(and(eq(PO.id, id), eq(PO.vendorId, vendorId))).returning();
  await fx.audit({ action: 'purchase_order.cancel', resourceType: 'purchase_order', resourceId: id, before: { status: po.status }, after: { status: 'cancelled', reason: input.reason, releasedUnits: released } });
  await fx.event({ type: 'purchase_order.cancelled', aggregateType: 'purchase_order', aggregateId: id, payload: { poNumber: po.poNumber, warehouseId: po.warehouseId, reason: input.reason, releasedUnits: released, previousStatus: po.status } });
  return { po: after!, releasedUnits: released };
}
