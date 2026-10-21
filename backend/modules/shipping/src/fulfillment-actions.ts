import { and, eq, inArray, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import {
  Work, closePackage, createPackage, createPickList, fulfillmentWorkspace, itemsOf, listPickTasks, pickTask, raiseException, startFulfillment, type FulfillmentAction,
} from '@oms/mod-fulfillment';
import type { OpCtx } from '@oms/module-kit';
import { createManifest, closeManifest, createShipment, dispatchManifest, dispatchShipment } from './service';

/**
 * The one-click fulfillment actions of the screen, as a thin composite over the existing services (routing, pick lists, picking,
 * packing, labels, hand-over). Every action first asks the workspace read model whether it is allowed and refuses with the same
 * reason the screen shows (409 `action_not_available`); the real work then goes through the same functions as the individual
 * endpoints, so the validation (scan required, weight required, state machine) is identical.
 */
export const ORDER_PROGRESS = ['confirmed', 'picking', 'picked', 'packing', 'packed', 'ready_to_ship', 'shipped'] as const;
/** the status from which an action counts as "already done" (a replay is then a successful no-op) */
const DONE_FROM: Partial<Record<FulfillmentAction, (typeof ORDER_PROGRESS)[number]>> = { start: 'picking', pick_all: 'picked', pack: 'packed', ready: 'ready_to_ship', handover: 'shipped' };
const LATER = ['in_transit', 'delivered', 'delivery_failed', 'rto_in_transit', 'rto_received'];
export const alreadyDone = (action: FulfillmentAction, status: string): boolean => {
  const from = DONE_FROM[action];
  if (!from) return false;
  return LATER.includes(status) || (ORDER_PROGRESS as readonly string[]).indexOf(status) >= ORDER_PROGRESS.indexOf(from);
};

export interface ActionInput {
  orderId: string;
  action: FulfillmentAction;
  fulfillmentId?: string;
  override?: boolean;
  weightGrams?: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  boxType?: string;
  providerCode?: string;
  packageBarcodes?: string[];
  kind?: 'damaged' | 'wrong_item' | 'pack_issue' | 'insufficient_stock' | 'address_issue' | 'other';
  note?: string;
}
export type Capability = 'manage' | 'pick' | 'pack' | 'dispatch';
export interface ActionDeps { ctx: OpCtx; allowed: string[] | null; can: (tx: Tx, warehouseId: string, cap: Capability) => Promise<void> }
type Workspace = Awaited<ReturnType<typeof fulfillmentWorkspace>>;

const liveOf = (ws: Workspace) => ws.fulfillments.filter((f) => f.status !== 'cancelled');

/** which fulfillment the action applies to: the one named, the only live one, or a 400 asking the caller to choose */
function target(ws: Workspace, input: ActionInput): string | null {
  const live = liveOf(ws);
  if (input.fulfillmentId) {
    if (!ws.fulfillments.some((f) => f.id === input.fulfillmentId)) throw Errors.notFound('Fulfillment', input.fulfillmentId);
    return input.fulfillmentId;
  }
  if (live.length > 1) throw new AppError('BAD_REQUEST', 'This order ships from several warehouses: say which fulfillment', { details: { rule: 'fulfillment_required', fulfillments: live.map((f) => ({ id: f.id, number: f.number, warehouseId: f.warehouse.id })) } });
  return live[0]?.id ?? null;
}

/** step 1 (read, in a transaction): validate and decide. Returns what to do, or the already-done answer. */
export async function planAction(tx: Tx, d: ActionDeps, input: ActionInput) {
  const first = await fulfillmentWorkspace(tx, d.ctx.vendorId, d.allowed, input.orderId);
  const fid = target(first, input);
  const ws = fid && first.fulfillment?.id !== fid ? await fulfillmentWorkspace(tx, d.ctx.vendorId, d.allowed, input.orderId, fid) : first;
  const status = ws.fulfillment?.status ?? null;
  if (status && input.action !== 'exception' && alreadyDone(input.action, status)) return { fid, ws, done: true as const };
  const view = ws.actions.find((a) => a.action === input.action)!;
  if (!view.enabled) throw new AppError('INVALID_STATE', view.disabledReason ?? 'This action is not available', { details: { rule: 'action_not_available', action: input.action, reason: view.disabledReason } });
  if (input.action === 'pack' && !input.weightGrams) throw new AppError('BAD_REQUEST', 'A weight is required to pack', { details: { rule: 'weight_required' } });
  if (input.action === 'exception' && !input.kind) throw new AppError('BAD_REQUEST', 'An exception needs a kind', { details: { rule: 'kind_required' } });
  return { fid, ws, done: false as const };
}

/** step 2 for every action except `ready` (which talks to the courier outside a transaction) */
export async function applyInTx(tx: Tx, d: ActionDeps, w: Work, input: ActionInput, fid: string | null): Promise<Record<string, unknown>> {
  const { ctx } = d;
  switch (input.action) {
    case 'start': {
      if (!fid) {
        const res = await startFulfillment(tx, ctx, w, input.orderId);
        for (const f of res.fulfillments) await d.can(tx, f.warehouseId, 'manage');
        return { fulfillments: res.fulfillments.map((f) => ({ id: f.id, number: f.number, warehouseId: f.warehouseId })), warehouses: res.plan.allocations.length, unallocatedLines: res.plan.unallocated.length };
      }
      const [f] = await tx.select({ warehouseId: schema.fulfillments.warehouseId }).from(schema.fulfillments).where(and(eq(schema.fulfillments.id, fid), eq(schema.fulfillments.vendorId, ctx.vendorId)));
      await d.can(tx, f!.warehouseId, 'pick');
      const list = await createPickList(tx, ctx, w, { fulfillmentIds: [fid] });
      return { pickList: { id: list.id, number: list.number, tasks: list.tasks.length } };
    }
    case 'pick_all': {
      const [f] = await tx.select({ warehouseId: schema.fulfillments.warehouseId }).from(schema.fulfillments).where(and(eq(schema.fulfillments.id, fid!), eq(schema.fulfillments.vendorId, ctx.vendorId)));
      await d.can(tx, f!.warehouseId, 'pick');
      let units = 0; let tasks = 0;
      for (const t of await listPickTasks(tx, ctx.vendorId, { fulfillmentId: fid! })) {
        if (t.status !== 'pending' && t.status !== 'partial') continue;
        const left = t.quantity - t.pickedQuantity;
        if (left <= 0) continue;
        await pickTask(tx, ctx, w, t.id, { quantity: left, override: input.override === true, note: input.override ? 'pick all (manual)' : undefined });
        units += left; tasks += 1;
      }
      return { tasks, units, override: input.override === true };
    }
    case 'pack': {
      const [f] = await tx.select({ warehouseId: schema.fulfillments.warehouseId }).from(schema.fulfillments).where(and(eq(schema.fulfillments.id, fid!), eq(schema.fulfillments.vendorId, ctx.vendorId)));
      await d.can(tx, f!.warehouseId, 'pack');
      const items = await itemsOf(tx, ctx.vendorId, fid!);
      const used = await tx.select({ id: schema.packageItems.fulfillmentItemId, n: sql<number>`coalesce(sum(${schema.packageItems.quantity}), 0)::int` }).from(schema.packageItems)
        .innerJoin(schema.packages, and(eq(schema.packages.id, schema.packageItems.packageId), eq(schema.packages.vendorId, schema.packageItems.vendorId)))
        .where(and(eq(schema.packageItems.vendorId, ctx.vendorId), eq(schema.packages.fulfillmentId, fid!), inArray(schema.packages.status, ['open', 'packed', 'shipped']))).groupBy(schema.packageItems.fulfillmentItemId);
      const lines = items.map((i) => ({ fulfillmentItemId: i.id, quantity: i.pickedQuantity - (used.find((u) => u.id === i.id)?.n ?? 0) })).filter((l) => l.quantity > 0);
      const dims = { weightGrams: input.weightGrams, lengthMm: input.lengthMm, widthMm: input.widthMm, heightMm: input.heightMm, boxType: input.boxType };
      const pkg = await createPackage(tx, ctx, w, fid!, { ...dims, items: lines });
      const closed = await closePackage(tx, ctx, w, pkg.id, { ...dims, override: input.override === true });
      return { package: { id: closed.id, number: closed.number, barcode: closed.barcode, weightGrams: closed.weightGrams, units: lines.reduce((n, l) => n + l.quantity, 0) }, override: input.override === true };
    }
    case 'handover': {
      const [s] = await tx.select().from(schema.shipments).where(and(eq(schema.shipments.vendorId, ctx.vendorId), eq(schema.shipments.fulfillmentId, fid!), sql`${schema.shipments.status} in ('label_ready','manifested')`));
      if (!s) throw new AppError('CONFLICT', 'There is no shipment ready for hand-over', { details: { rule: 'no_shipment' } });
      await d.can(tx, s.warehouseId, 'dispatch');
      const after = await dispatchShipment(tx, ctx, w, s.id, { packageBarcodes: input.packageBarcodes });
      return { shipment: { id: after.id, number: after.number, awb: after.awb, carrier: after.carrier, status: after.status } };
    }
    case 'exception': {
      const [f] = await tx.select({ warehouseId: schema.fulfillments.warehouseId }).from(schema.fulfillments).where(and(eq(schema.fulfillments.id, fid!), eq(schema.fulfillments.vendorId, ctx.vendorId)));
      let last: unknown;
      for (const cap of ['manage', 'pick', 'pack'] as const) { try { await d.can(tx, f!.warehouseId, cap); last = undefined; break; } catch (e) { last = e; } }
      if (last) throw last;
      const x = await raiseException(tx, ctx, fid!, input.kind!, { note: input.note ?? null, source: 'fulfillment_screen' });
      return { exception: { id: x.id, kind: x.kind, status: x.status } };
    }
    default: throw new AppError('BAD_REQUEST', `Unknown action ${input.action}`);
  }
}

/** `ready`: books the label with the courier (outside any transaction, like POST /shipments) */
export async function applyReady(d: ActionDeps, input: ActionInput, fid: string): Promise<Record<string, unknown>> {
  const s = await createShipment(d.ctx, { fulfillmentId: fid, providerCode: input.providerCode });
  return { shipment: { id: s.id, number: s.number, awb: s.awb, carrier: s.carrier, status: s.status } };
}

// ------------------------------------------------------------------------------------------------
// batch hand-over (manifests)
// ------------------------------------------------------------------------------------------------
export const MAX_BATCH = 200;
export type BatchError = 'order_not_found' | 'no_shipment' | 'carrier_mismatch' | 'not_label_ready' | 'manifest_failed';

/** which shipments of these orders can go on a manifest for the carrier: one entry per order with the verdict */
export async function batchCandidates(tx: Tx, vendorId: string, allowed: string[] | null, carrier: string, orderIds: string[]) {
  const S = schema.shipments;
  const orders = await tx.select({ id: schema.orders.id, orderNumber: schema.orders.orderNumber }).from(schema.orders).where(and(eq(schema.orders.vendorId, vendorId), inArray(schema.orders.id, orderIds)));
  const ships = await tx.select().from(S).where(and(eq(S.vendorId, vendorId), inArray(S.orderId, orderIds), sql`${S.status} <> 'cancelled'`)).orderBy(S.createdAt);
  const wanted = carrier.trim().toLowerCase();
  return orderIds.map((orderId) => {
    const o = orders.find((x) => x.id === orderId);
    const base = { orderId, orderNumber: o?.orderNumber ?? null };
    if (!o) return { ...base, shipment: null, error: 'order_not_found' as BatchError };
    const mine = ships.filter((s) => s.orderId === orderId && (!allowed || allowed.includes(s.warehouseId)));
    if (mine.length === 0) return { ...base, shipment: null, error: 'no_shipment' as BatchError };
    const matching = mine.filter((s) => (s.carrier ?? '').toLowerCase() === wanted || s.providerCode.toLowerCase() === wanted);
    if (matching.length === 0) return { ...base, shipment: null, error: 'carrier_mismatch' as BatchError };
    const ready = matching.find((s) => s.status === 'label_ready');
    if (!ready) return { ...base, shipment: null, error: 'not_label_ready' as BatchError };
    return { ...base, shipment: ready, error: null };
  });
}

/** one manifest per (warehouse, provider): create, close and dispatch it in one transaction (all or nothing for that manifest) */
export async function handoverGroup(tx: Tx, ctx: OpCtx, w: Work, g: { warehouseId: string; providerCode: string; shipmentIds: string[] }) {
  const made = await createManifest(tx, ctx, { warehouseId: g.warehouseId, providerCode: g.providerCode, shipmentIds: g.shipmentIds });
  await closeManifest(tx, ctx, made.m.id);
  const done = await dispatchManifest(tx, ctx, w, made.m.id);
  return { id: done.m.id, number: done.m.number, warehouseId: done.m.warehouseId, providerCode: done.m.providerCode, status: done.m.status, shipmentCount: done.shipments.length };
}
