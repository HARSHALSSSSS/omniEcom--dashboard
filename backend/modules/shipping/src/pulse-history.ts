import { and, count, eq, inArray, schema, sql, type SQL, type Tx } from '@oms/database';

/**
 * The shipping pulse as it was at an earlier moment, rebuilt from timestamps that are already stored: the status history of fulfillments
 * (`fulfillment_events`) and of shipments (`shipment_tracking_events`). It is what "vs earlier" is compared with when no hourly snapshot
 * exists yet (a fresh install, a new vendor), so the deltas are real from the first day.
 *
 * Approximation, stated: a shipping method that was confirmed, then changed, carries the date of the last confirmation.
 */
const F = schema.fulfillments;
const S = schema.shipments;

export interface HistoricPulse { readyToShip: number; shippingSelected: number; labelReady: number; dispatched: number; inTransit: number }

const scope = (col: typeof F.warehouseId | typeof S.warehouseId, allowed: string[] | null): SQL | undefined => (allowed ? (allowed.length ? inArray(col, allowed) : sql`false`) : undefined);
// qualified by hand: a single-table select prints bare column names, which would bind to the table of the correlated subquery
const f = (col: string) => sql.raw(`"fulfillments"."${col}"`);
const s = (col: string) => sql.raw(`"shipments"."${col}"`);

export async function pulseAt(tx: Tx, vendorId: string, allowed: string[] | null, at: Date): Promise<HistoricPulse> {
  // the fulfillment status at `at`: the last change before it; else what the first later change moved it from; else today's status (no history kept)
  const fStatus = sql<string | null>`CASE WHEN ${f('created_at')} > ${at} THEN NULL ELSE coalesce(
    (SELECT e.to_status FROM fulfillment_events e WHERE e.vendor_id = ${f('vendor_id')} AND e.fulfillment_id = ${f('id')} AND e.created_at <= ${at} ORDER BY e.created_at DESC, e.id DESC LIMIT 1),
    (SELECT e.from_status FROM fulfillment_events e WHERE e.vendor_id = ${f('vendor_id')} AND e.fulfillment_id = ${f('id')} AND e.created_at > ${at} ORDER BY e.created_at ASC, e.id ASC LIMIT 1),
    ${f('status')}) END`;
  const waiting = sql`${fStatus} IN ('packed', 'ready_to_ship')`;
  const sStatus = sql<string | null>`CASE WHEN ${s('created_at')} > ${at} THEN NULL ELSE coalesce(
    (SELECT te.status FROM shipment_tracking_events te WHERE te.vendor_id = ${s('vendor_id')} AND te.shipment_id = ${s('id')} AND te.occurred_at <= ${at} ORDER BY te.occurred_at DESC, te.id DESC LIMIT 1),
    ${s('status')}) END`;
  const [ready, confirmed, ships] = await Promise.all([
    tx.select({ n: count() }).from(F).where(and(eq(F.vendorId, vendorId), scope(F.warehouseId, allowed), waiting)),
    tx.select({ n: count() }).from(F).where(and(eq(F.vendorId, vendorId), scope(F.warehouseId, allowed), waiting, sql`${F.shipConfirmedAt} <= ${at}`)),
    tx.select({ st: sStatus, n: count() }).from(S).where(and(eq(S.vendorId, vendorId), scope(S.warehouseId, allowed))).groupBy(sql`1`),
  ]);
  const inState = (...states: string[]): number => ships.filter((r) => r.st !== null && states.includes(r.st)).reduce((n, r) => n + Number(r.n), 0);
  return {
    readyToShip: Number(ready[0]?.n ?? 0), shippingSelected: Number(confirmed[0]?.n ?? 0),
    labelReady: inState('label_ready', 'manifested'), dispatched: inState('dispatched'), inTransit: inState('in_transit', 'out_for_delivery'),
  };
}
