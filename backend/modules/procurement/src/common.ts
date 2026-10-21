import { and, desc, eq, isNull, schema, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';

export type Actor = { type: 'user' | 'api_key' | 'system' | 'webhook'; id?: string | null };

/** audit + outbox in the caller's transaction; routes build it from the request, other modules' calls from the actor */
export interface Fx {
  audit(e: { action: string; resourceType: string; resourceId: string; before?: unknown; after?: unknown; metadata?: Record<string, unknown> }): Promise<void>;
  event(e: { type: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown> }): Promise<void>;
}

export type SupplierRow = typeof schema.suppliers.$inferSelect;
export type PoRow = typeof schema.purchaseOrders.$inferSelect;
export type PoLineRow = typeof schema.purchaseOrderLines.$inferSelect;

export async function getSupplierRow(tx: Tx, vendorId: string, id: string): Promise<SupplierRow> {
  const S = schema.suppliers;
  const [s] = await tx.select().from(S).where(and(eq(S.id, id), eq(S.vendorId, vendorId), isNull(S.deletedAt)));
  if (!s) throw Errors.notFound('Supplier', id);
  return s;
}

export async function defaultWarehouse(tx: Tx, vendorId: string): Promise<{ id: string; code: string; name: string; status: string }> {
  const W = schema.warehouses;
  const [chosen] = await tx.select({ id: W.id, code: W.code, name: W.name, status: W.status }).from(W).where(and(eq(W.vendorId, vendorId), isNull(W.deletedAt), eq(W.status, 'active'))).orderBy(desc(W.isDefault), W.priority).limit(1);
  if (!chosen) throw new AppError('CONFLICT', 'There is no active warehouse to receive the goods', { details: { rule: 'no_warehouse' } });
  return chosen;
}

export async function activeWarehouse(tx: Tx, vendorId: string, id: string): Promise<{ id: string; code: string; name: string; status: string }> {
  const W = schema.warehouses;
  const [w] = await tx.select({ id: W.id, code: W.code, name: W.name, status: W.status }).from(W).where(and(eq(W.id, id), eq(W.vendorId, vendorId), isNull(W.deletedAt)));
  if (!w) throw Errors.notFound('Warehouse', id);
  if (w.status !== 'active') throw new AppError('CONFLICT', 'The warehouse is not active', { details: { rule: 'warehouse_inactive' } });
  return w;
}

export const rule = (message: string, ruleName: string, extra: Record<string, unknown> = {}): AppError => new AppError('CONFLICT', message, { details: { rule: ruleName, ...extra } });
export const invalid = (path: string, message: string, ruleName: string): AppError => Errors.validation({ issues: [{ path, message }], rule: ruleName });
