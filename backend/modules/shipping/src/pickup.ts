import { and, eq, gte, inArray, ne, schema, sql, withVendor, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { effects, type Container, type OpCtx } from '@oms/module-kit';
import { loadThresholds } from './decision';
import { decisionKind, getMethodRow, methodName } from './methods';
import { getProvider } from './providers';
import { ACTIVE_SLOT, todayIn, type PickupRow } from './pickup-core';

/**
 * Pickup slots: the seller books a time for the carrier to collect N parcels from a warehouse (a date, a time window, a parcel count),
 * for one shipping method. A provider adapter that can schedule pickups is asked to (status `confirmed` with its reference); every
 * other method (a marketplace, the seller's own shipping, a courier without pickup scheduling) is recorded as a MANUAL booking
 * (status `manual`): the seller arranges it with the carrier and this is the record of it. The connector contract has no pickup call yet.
 */
const P = schema.shippingPickupSlots;
const W = schema.warehouses;
const SP = schema.vendorShippingProviders;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toPickupDto(c: Container, r: PickupRow, wh: { id: string; code: string; name: string }, m: typeof SP.$inferSelect | undefined) {
  return {
    id: r.id, warehouse: wh, method: m ? { id: m.id, name: methodName(c, m), kind: m.kind, providerCode: m.providerCode } : { id: r.methodId, name: r.providerCode, kind: 'third_party', providerCode: r.providerCode },
    date: r.slotDate, windowStart: r.windowStart, windowEnd: r.windowEnd, parcelCount: r.parcelCount, status: r.status as (typeof schema.PICKUP_SLOT_STATUSES)[number], mode: r.mode as 'provider' | 'manual',
    reference: r.reference, note: r.note, cancellable: (ACTIVE_SLOT as readonly string[]).includes(r.status), cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null, createdAt: r.createdAt.toISOString(),
  };
}

export async function listPickupSlots(tx: Tx, c: Container, vendorId: string, o: { scope: 'upcoming' | 'all'; warehouseId?: string; methodId?: string; limit: number }) {
  const th = await loadThresholds(tx, vendorId);
  const today = todayIn(th.timezone);
  const rows = await tx.select({ s: P, wh: { id: W.id, code: W.code, name: W.name } }).from(P).innerJoin(W, and(eq(W.id, P.warehouseId), eq(W.vendorId, P.vendorId)))
    .where(and(eq(P.vendorId, vendorId), o.scope === 'upcoming' ? and(gte(P.slotDate, today), ne(P.status, 'cancelled')) : undefined, o.warehouseId ? eq(P.warehouseId, o.warehouseId) : undefined, o.methodId ? eq(P.methodId, o.methodId) : undefined))
    .orderBy(P.slotDate, P.windowStart, P.id).limit(o.limit);
  const methods = rows.length ? await tx.select().from(SP).where(and(eq(SP.vendorId, vendorId), inArray(SP.id, [...new Set(rows.map((r) => r.s.methodId))]))) : [];
  return { items: rows.map((r) => toPickupDto(c, r.s, r.wh, methods.find((m) => m.id === r.s.methodId))), today };
}

export interface BookInput { warehouseId: string; methodId: string; date: string; windowStart: string; windowEnd: string; parcelCount: number; note?: string | null }

const adapterOf = (code: string): ReturnType<typeof getProvider> | null => { try { return getProvider(code); } catch { return null; } };

export async function bookPickupSlot(ctx: OpCtx, input: BookInput, assertWarehouse: (tx: Tx, warehouseId: string) => Promise<void>) {
  const db = ctx.c.database.db;
  const prep = await withVendor(db, ctx.vendorId, async (tx) => {
    const issues: Array<{ path: string; message: string }> = [];
    if (!DATE.test(input.date) || Number.isNaN(new Date(`${input.date}T00:00:00Z`).getTime())) issues.push({ path: 'date', message: 'a date as YYYY-MM-DD' });
    if (!HHMM.test(input.windowStart)) issues.push({ path: 'windowStart', message: 'a time as HH:MM' });
    if (!HHMM.test(input.windowEnd)) issues.push({ path: 'windowEnd', message: 'a time as HH:MM' });
    if (HHMM.test(input.windowStart) && HHMM.test(input.windowEnd) && input.windowEnd <= input.windowStart) issues.push({ path: 'windowEnd', message: 'the window must end after it starts' });
    const th = await loadThresholds(tx, ctx.vendorId);
    if (DATE.test(input.date) && input.date < todayIn(th.timezone)) issues.push({ path: 'date', message: 'a slot cannot be in the past' });
    if (issues.length) throw Errors.validation({ issues });
    const [wh] = await tx.select({ id: W.id, code: W.code, name: W.name, address: W.address }).from(W).where(and(eq(W.vendorId, ctx.vendorId), eq(W.id, input.warehouseId)));
    if (!wh) throw Errors.notFound('Warehouse', input.warehouseId);
    await assertWarehouse(tx, wh.id);
    const method = await getMethodRow(tx, ctx.vendorId, input.methodId);
    if (method.status !== 'active') throw new AppError('CONFLICT', 'This shipping method is disabled', { details: { rule: 'method_disabled' } });
    const clash = await tx.select({ id: P.id, a: P.windowStart, b: P.windowEnd }).from(P).where(and(eq(P.vendorId, ctx.vendorId), eq(P.warehouseId, wh.id), eq(P.methodId, method.id), eq(P.slotDate, input.date), inArray(P.status, [...ACTIVE_SLOT])));
    if (clash.some((x) => x.a < input.windowEnd && input.windowStart < x.b)) throw new AppError('CONFLICT', 'This method already has a slot at that time from this warehouse', { details: { rule: 'slot_overlap', slotId: clash[0]!.id } });
    return { wh, method };
  });

  // the provider is asked outside any transaction; marketplace / seller / providers without pickup scheduling are recorded as manual
  let mode: 'provider' | 'manual' = 'manual'; let status: 'confirmed' | 'manual' | 'failed' = 'manual'; let reference: string | null = null; let note = input.note ?? null;
  const kind = decisionKind(prep.method.kind);
  if (prep.method.kind !== 'marketplace' && kind !== 'seller') {
    const adapter = adapterOf(prep.method.providerCode);
    if (adapter?.schedulePickup) {
      try {
        const r = await adapter.schedulePickup({ date: input.date, windowStart: input.windowStart, windowEnd: input.windowEnd, parcelCount: input.parcelCount, warehouse: { code: prep.wh.code, name: prep.wh.name, address: prep.wh.address } }, prep.method.config);
        mode = 'provider'; status = 'confirmed'; reference = r.reference;
      } catch (e) { mode = 'provider'; status = 'failed'; note = `${(e as Error).message.slice(0, 200)}${note ? ` | ${note}` : ''}`; }
    }
  }
  return withVendor(db, ctx.vendorId, async (tx) => {
    const [row] = await tx.insert(P).values({
      vendorId: ctx.vendorId, warehouseId: prep.wh.id, methodId: prep.method.id, providerCode: prep.method.providerCode, slotDate: input.date, windowStart: input.windowStart, windowEnd: input.windowEnd,
      parcelCount: input.parcelCount, status, mode, reference, note, createdBy: ctx.actor.id,
    }).returning();
    await effects(tx, ctx).audit({ action: 'shipping.pickup_booked', resourceType: 'pickup_slot', resourceId: row!.id, after: { date: input.date, window: `${input.windowStart}-${input.windowEnd}`, parcels: input.parcelCount, status, mode, methodId: prep.method.id, warehouseId: prep.wh.id } });
    return toPickupDto(ctx.c, row!, { id: prep.wh.id, code: prep.wh.code, name: prep.wh.name }, prep.method);
  });
}

export async function cancelPickupSlot(ctx: OpCtx, id: string, assertWarehouse: (tx: Tx, warehouseId: string) => Promise<void>) {
  const db = ctx.c.database.db;
  const s0 = await withVendor(db, ctx.vendorId, async (tx) => {
    const [r] = await tx.select().from(P).where(and(eq(P.vendorId, ctx.vendorId), eq(P.id, id)));
    if (!r) throw Errors.notFound('Pickup slot', id);
    await assertWarehouse(tx, r.warehouseId);
    if (!(ACTIVE_SLOT as readonly string[]).includes(r.status)) throw new AppError('INVALID_STATE', `A ${r.status} slot cannot be cancelled`, { details: { status: r.status } });
    return { r, method: (await tx.select().from(SP).where(and(eq(SP.vendorId, ctx.vendorId), eq(SP.id, r.methodId))))[0] };
  });
  if (s0.r.mode === 'provider' && s0.r.reference && s0.method) {
    const adapter = adapterOf(s0.method.providerCode);
    await adapter?.cancelPickup?.(s0.r.reference, s0.method.config); // a provider that refuses keeps the slot (the error is the answer)
  }
  return withVendor(db, ctx.vendorId, async (tx) => {
    const [row] = await tx.update(P).set({ status: 'cancelled', cancelledAt: new Date(), version: sql`${P.version} + 1` }).where(and(eq(P.id, id), inArray(P.status, [...ACTIVE_SLOT]))).returning();
    if (!row) throw new AppError('INVALID_STATE', 'The slot changed in the meantime', { details: { id } });
    await effects(tx, ctx).audit({ action: 'shipping.pickup_cancelled', resourceType: 'pickup_slot', resourceId: id, before: { status: s0.r.status }, after: { status: 'cancelled' } });
    const [wh] = await tx.select({ id: W.id, code: W.code, name: W.name }).from(W).where(and(eq(W.vendorId, ctx.vendorId), eq(W.id, row.warehouseId)));
    return toPickupDto(ctx.c, row, wh!, s0.method);
  });
}
