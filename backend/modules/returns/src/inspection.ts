import { and, eq, inArray, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { effects, type OpCtx } from '@oms/module-kit';
import { CONDITION_FOR_KIND, DISPOSITION_OPTIONS, KIND_TO_STORED, RESULT_TO_STATUS, STORED_TO_KIND, recommend, type DispositionKind, type InspectionResult } from './domain';
import { getReturnRow, inspectReturn, logReturnEvent, type ReturnRow } from './service';

const R = schema.returnOrders;
const RI = schema.returnItems;
const INS = schema.returnInspections;

const inspectable = (status: string) => ['received', 'inspecting'].includes(status);
const finished = (s: string) => ['passed', 'failed', 'requires_review'].includes(s);

export interface Checklist {
  packagingIntact: boolean; productUsable: boolean; accessoriesPresent: boolean; visibleDamage: boolean; productMismatch: boolean; missingQuantity: boolean;
  custom?: Array<{ label: string; ok: boolean }>;
}

/** expected (requested) vs received units of a return; a mismatch drives the "system condition" and the recommendation */
export async function receiptOf(tx: Tx, vendorId: string, returnId: string): Promise<{ expected: number; received: number; decided: number; mismatch: { expected: number; received: number } | null }> {
  const [t] = await tx.select({ e: sql<number>`coalesce(sum(${RI.quantity}), 0)::int`, r: sql<number>`coalesce(sum(${RI.receivedQuantity}), 0)::int`, d: sql<number>`coalesce(sum(${RI.dispositionedQuantity}), 0)::int` }).from(RI).where(and(eq(RI.vendorId, vendorId), eq(RI.returnOrderId, returnId)));
  const expected = t?.e ?? 0, received = t?.r ?? 0;
  return { expected, received, decided: t?.d ?? 0, mismatch: received < expected ? { expected, received } : null };
}

// ------------------------------------------------------------------------------------------------
// assignment
// ------------------------------------------------------------------------------------------------
async function assertMember(tx: Tx, vendorId: string, userId: string): Promise<{ id: string; name: string }> {
  const [u] = await tx.select({ id: schema.users.id, name: schema.users.fullName }).from(schema.users).where(and(eq(schema.users.id, userId), eq(schema.users.vendorId, vendorId), eq(schema.users.status, 'active')));
  if (!u) throw new AppError('BAD_REQUEST', 'The inspector must be an active member of this business', { details: { rule: 'inspector_not_member', userId } });
  return u;
}

async function assignOne(tx: Tx, ctx: OpCtx, r: ReturnRow, user: { id: string; name: string }): Promise<string | null> {
  if (!inspectable(r.status)) return 'not_received';
  if (finished(r.inspectionStatus)) return 'inspection_finished';
  await tx.update(R).set({ inspectorId: user.id, inspectionStatus: 'in_progress', inspectionStartedAt: r.inspectionStartedAt ?? new Date(), version: sql`${R.version} + 1` }).where(eq(R.id, r.id));
  await logReturnEvent(tx, ctx, r, 'assignment', `inspection assigned to ${user.name}`, { inspectorId: user.id });
  await effects(tx, ctx).audit({ action: 'return.inspection_assigned', resourceType: 'return', resourceId: r.id, before: { inspectorId: r.inspectorId }, after: { inspectorId: user.id } });
  return null;
}

/** "Assign inspection": names the inspector and starts the inspection track; it never decides anything */
export async function assignInspection(tx: Tx, ctx: OpCtx, ids: string[], userId: string): Promise<{ assigned: string[]; skipped: Array<{ id: string; reason: string }> }> {
  const user = await assertMember(tx, ctx.vendorId, userId);
  const unique = [...new Set(ids)];
  const rows = await tx.select().from(R).where(and(eq(R.vendorId, ctx.vendorId), inArray(R.id, unique))).orderBy(R.id).for('update');
  const byId = new Map(rows.map((r) => [r.id, r]));
  const assigned: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const id of unique) {
    const r = byId.get(id);
    if (!r) { skipped.push({ id, reason: 'not_found' }); continue; }
    const problem = await assignOne(tx, ctx, r, user);
    if (problem) skipped.push({ id, reason: problem }); else assigned.push(id);
  }
  return { assigned, skipped };
}

// ------------------------------------------------------------------------------------------------
// inspection record
// ------------------------------------------------------------------------------------------------
export async function saveInspection(tx: Tx, ctx: OpCtx, id: string, input: { checklist: Omit<Checklist, 'custom'>; custom?: Array<{ label: string; ok: boolean }>; result: InspectionResult; note?: string | null; /** a status mark without a checklist (bulk): the record says so and says nothing about the physical condition */ bulk?: boolean }): Promise<ReturnRow> {
  const r = await getReturnRow(tx, ctx.vendorId, id, true);
  if (!inspectable(r.status)) throw new AppError('CONFLICT', `A ${r.status} return has not been received, so it cannot be inspected`, { details: { rule: 'not_received', status: r.status } });
  const rc = await receiptOf(tx, ctx.vendorId, id);
  const systemCondition = rc.mismatch ? 'quantity_mismatch' : 'receipt_matched';
  const isUser = ctx.actor.type === 'user' && ctx.actor.id;
  await tx.insert(INS).values({ vendorId: ctx.vendorId, returnOrderId: id, checklist: input.bulk ? { bulk: true, custom: [] } : { ...input.checklist, custom: input.custom ?? [] }, result: input.result, systemCondition, note: input.note ?? null, inspectorId: isUser ? ctx.actor.id : null });
  const status = RESULT_TO_STATUS[input.result];
  const [after] = await tx.update(R).set({
    inspectionStatus: status, inspectionStartedAt: r.inspectionStartedAt ?? new Date(), inspectedAt: new Date(), ...(isUser ? { inspectorId: ctx.actor.id } : {}),
    // saving an inspection takes a received return into `inspecting` (the status machine allows received -> inspecting)
    ...(r.status === 'received' ? { status: 'inspecting' } : {}), version: sql`${R.version} + 1`,
  }).where(eq(R.id, id)).returning();
  if (r.status === 'received') await tx.insert(schema.returnEvents).values({ vendorId: ctx.vendorId, returnOrderId: id, fromStatus: 'received', toStatus: 'inspecting', actorId: ctx.actor.id, note: 'inspection saved', metadata: {} });
  await logReturnEvent(tx, ctx, { id, status: after!.status }, 'inspection', input.note ?? `inspection ${status}`, { result: input.result, systemCondition });
  await effects(tx, ctx).audit({ action: 'return.inspection_saved', resourceType: 'return', resourceId: id, before: { inspectionStatus: r.inspectionStatus }, after: { inspectionStatus: status, result: input.result, systemCondition } });
  return after!;
}

const NO_CHECKS: Omit<Checklist, 'custom'> = { packagingIntact: true, productUsable: true, accessoriesPresent: true, visibleDamage: false, productMismatch: false, missingQuantity: false };

/**
 * "Mark inspection status" on several returns: sets pass / fail / needs review without walking the checklist. The history says it was a
 * bulk mark (no checklist, so the physical condition stays what the last real inspection said) and, like every inspection, it never
 * approves a refund or selects a disposition. Returns that are not at the warehouse yet are skipped with a reason.
 */
export async function markInspection(tx: Tx, ctx: OpCtx, ids: string[], input: { result: InspectionResult; note?: string | null }): Promise<{ marked: string[]; skipped: Array<{ id: string; reason: string }> }> {
  const unique = [...new Set(ids)];
  const rows = await tx.select().from(R).where(and(eq(R.vendorId, ctx.vendorId), inArray(R.id, unique))).orderBy(R.id).for('update');
  const byId = new Map(rows.map((r) => [r.id, r]));
  const marked: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const id of unique) {
    const r = byId.get(id);
    if (!r) skipped.push({ id, reason: 'not_found' });
    else if (!inspectable(r.status)) skipped.push({ id, reason: 'not_received' });
    else { await saveInspection(tx, ctx, id, { checklist: NO_CHECKS, result: input.result, note: input.note, bulk: true }); marked.push(id); }
  }
  return { marked, skipped };
}

export async function getInspection(tx: Tx, vendorId: string, id: string) {
  const r = await getReturnRow(tx, vendorId, id);
  const rows = await tx.select({ i: INS, inspector: schema.users.fullName }).from(INS).leftJoin(schema.users, eq(schema.users.id, INS.inspectorId)).where(and(eq(INS.vendorId, vendorId), eq(INS.returnOrderId, id))).orderBy(sql`${INS.createdAt} desc`, sql`${INS.id} desc`);
  const rc = await receiptOf(tx, vendorId, id);
  const dto = ({ i, inspector }: (typeof rows)[number]) => ({ id: i.id, checklist: i.checklist, result: i.result as InspectionResult, systemCondition: i.systemCondition, note: i.note, inspector: i.inspectorId ? { id: i.inspectorId, name: inspector } : null, at: i.createdAt.toISOString() });
  let inspector: { id: string; name: string | null } | null = null;
  if (r.inspectorId) { const [u] = await tx.select({ n: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, r.inspectorId)); inspector = { id: r.inspectorId, name: u?.n ?? null }; }
  return {
    returnId: id, number: r.number, status: r.inspectionStatus, inspector, startedAt: r.inspectionStartedAt ? r.inspectionStartedAt.toISOString() : null,
    systemCondition: rc.mismatch ? 'quantity_mismatch' : 'receipt_matched', quantity: { expected: rc.expected, received: rc.received },
    latest: rows[0] ? dto(rows[0]) : null, history: rows.map(dto),
    note: 'Inspection does not approve a refund or select a disposition.',
  };
}

// ------------------------------------------------------------------------------------------------
// disposition
// ------------------------------------------------------------------------------------------------
export async function dispositionOptions(tx: Tx, vendorId: string, id: string) {
  const r = await getReturnRow(tx, vendorId, id);
  const rc = await receiptOf(tx, vendorId, id);
  const items = await tx.select().from(RI).where(and(eq(RI.vendorId, vendorId), eq(RI.returnOrderId, id)));
  const undecided = items.reduce((n, i) => n + (i.receivedQuantity - i.dispositionedQuantity), 0);
  const decided = [...new Set(items.filter((i) => i.disposition).map((i) => STORED_TO_KIND[i.disposition as keyof typeof STORED_TO_KIND]))];
  const blocked = !inspectable(r.status) ? 'not_received' : !finished(r.inspectionStatus) ? 'inspection_not_finished' : undecided === 0 ? 'no_undecided_units' : null;
  return {
    returnId: id, number: r.number, inspectionStatus: r.inspectionStatus,
    recommendation: recommend({ inspectionStatus: r.inspectionStatus, quantityMismatch: rc.mismatch }),
    options: DISPOSITION_OPTIONS.map((o) => ({ ...o, stored: KIND_TO_STORED[o.kind] })),
    undecidedUnits: undecided, decided, canConfirm: blocked === null, blockedReason: blocked,
    note: 'No option is selected. The operator must explicitly confirm the disposition before stock can move.',
  };
}

/** Explicit operator decision: moves the received, not yet decided units through the inventory engine. Never automatic. */
export async function applyDisposition(tx: Tx, ctx: OpCtx, id: string, input: { kind: DispositionKind; items?: Array<{ returnItemId: string; quantity: number }>; note?: string | null }, guard?: (warehouseId: string) => Promise<void>): Promise<ReturnRow> {
  const r = await getReturnRow(tx, ctx.vendorId, id, true);
  if (!inspectable(r.status)) throw new AppError('CONFLICT', `A ${r.status} return has not been received, so no disposition can be applied`, { details: { rule: 'not_received', status: r.status } });
  if (!finished(r.inspectionStatus)) throw new AppError('CONFLICT', 'Finish the inspection before choosing a disposition', { details: { rule: 'inspection_not_finished', inspectionStatus: r.inspectionStatus } });
  if (r.warehouseId && guard) await guard(r.warehouseId);
  const items = await tx.select().from(RI).where(and(eq(RI.vendorId, ctx.vendorId), eq(RI.returnOrderId, id))).orderBy(RI.createdAt, RI.id);
  let plan: Array<{ returnItemId: string; quantity: number }>;
  if (input.items?.length) {
    for (const l of input.items) if (!items.some((i) => i.id === l.returnItemId)) throw Errors.notFound('Return item', l.returnItemId);
    plan = input.items;
  } else plan = items.filter((i) => i.receivedQuantity - i.dispositionedQuantity > 0).map((i) => ({ returnItemId: i.id, quantity: i.receivedQuantity - i.dispositionedQuantity }));
  if (plan.length === 0) throw new AppError('CONFLICT', 'There are no received units waiting for a decision', { details: { rule: 'no_undecided_units' } });
  const after = await inspectReturn(tx, ctx, id, plan.map((l) => ({ returnItemId: l.returnItemId, quantity: l.quantity, condition: CONDITION_FOR_KIND[input.kind], disposition: KIND_TO_STORED[input.kind], notes: input.note ?? null })), { strictQuarantine: true, touchInspection: false });
  const units = plan.reduce((n, l) => n + l.quantity, 0);
  await logReturnEvent(tx, ctx, after, 'disposition', input.note ?? `disposition ${input.kind}`, { disposition: input.kind, units });
  await effects(tx, ctx).audit({ action: 'return.disposition_confirmed', resourceType: 'return', resourceId: id, after: { kind: input.kind, units } });
  return after;
}
