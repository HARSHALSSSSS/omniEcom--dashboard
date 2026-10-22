import { and, eq, gte, inArray, schema, type Tx } from '@oms/database';

/** the parts of pickup slots the order decision needs (kept apart from pickup.ts, which itself needs the decision module) */
const P = schema.shippingPickupSlots;
export type PickupRow = typeof P.$inferSelect;
export const ACTIVE_SLOT = ['requested', 'confirmed', 'manual'] as const;

/** today's date (YYYY-MM-DD) where the business is */
export const todayIn = (timezone: string, now = new Date()): string => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); } catch { return now.toISOString().slice(0, 10); }
};

/** the upcoming active slot of every (warehouse, method), keyed `warehouseId:methodId`: "booked" on the Orders to Ship rows */
export async function upcomingSlotMap(tx: Tx, vendorId: string, timezone: string): Promise<Map<string, PickupRow>> {
  const rows = await tx.select().from(P).where(and(eq(P.vendorId, vendorId), gte(P.slotDate, todayIn(timezone)), inArray(P.status, [...ACTIVE_SLOT]))).orderBy(P.slotDate, P.windowStart);
  const out = new Map<string, PickupRow>();
  for (const r of rows) { const k = `${r.warehouseId}:${r.methodId}`; if (!out.has(k)) out.set(k, r); }
  return out;
}
