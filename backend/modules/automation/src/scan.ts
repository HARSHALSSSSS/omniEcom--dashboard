import { and, eq, inArray, isNotNull, lt, schema, sql, withSystem, withVendor, writeOutboxEvent, isFeatureEnabled, type Tx } from '@oms/database';
import type { Container } from '@oms/module-kit';
import { loadSlaConfig } from '@oms/mod-orders';
import { latestCompetitorPrices } from '@oms/mod-pricing';
import { SCAN_EVENTS } from './triggers';

export const JOB_AUTOMATION_SCAN = 'automation.scan';

/** orders still before dispatch (the SLA clock is running) */
const PRE_DISPATCH = ['new', 'confirmed', 'picking', 'packed', 'ready_to_dispatch'];
/** a competitor price older than this is no longer a reason to act */
const COMPETITOR_FRESH_DAYS = 14;
const BATCH = 200;

export interface AutomationScanResult { vendors: number; slaAtRisk: number; competitorLower: number; cadence: number }

/**
 * Events that no module announces, found by looking at the data, for the vendors that have an active rule listening to them:
 *  - `order.sla_at_risk`: pre-dispatch orders due within the vendor's at-risk window (or already late);
 *  - `price.competitor_lower`: a fresh competitor price below our live price on an active listing;
 *  - `schedule.cadence`: one tick per local hour (rules pick the hour / weekday with conditions).
 * Each event carries a `dedupeKey`; an event is written once per key, so a scan that runs every few minutes never repeats itself.
 */
export async function scanAutomation(c: Container, now = new Date(), only?: { vendorId: string }): Promise<AutomationScanResult> {
  const R = schema.automationRules;
  const listening = await withSystem(c.database.db, (tx) =>
    tx.selectDistinct({ vendorId: R.vendorId, event: R.triggerEvent }).from(R).where(and(eq(R.status, 'active'), inArray(R.triggerEvent, [...SCAN_EVENTS]), only ? eq(R.vendorId, only.vendorId) : undefined)),
  );
  const byVendor = new Map<string, Set<string>>();
  for (const l of listening) byVendor.set(l.vendorId, (byVendor.get(l.vendorId) ?? new Set()).add(l.event));
  const result: AutomationScanResult = { vendors: byVendor.size, slaAtRisk: 0, competitorLower: 0, cadence: 0 };
  for (const [vendorId, events] of byVendor) {
    try {
      await withVendor(c.database.db, vendorId, async (tx) => {
        if (!(await isFeatureEnabled(tx, 'automation.enabled', vendorId, true))) return;
        if (events.has('order.sla_at_risk')) result.slaAtRisk += await scanSla(tx, vendorId, now);
        if (events.has('price.competitor_lower')) result.competitorLower += await scanCompetitors(tx, vendorId, now);
        if (events.has('schedule.cadence')) result.cadence += await scanCadence(tx, vendorId, now);
      });
    } catch (err) {
      c.logger.warn({ vendorId, err: (err as Error).message }, 'automation scan failed for a vendor'); // one vendor never blocks the others
    }
  }
  return result;
}

interface Candidate { aggregateType: string; aggregateId: string; dedupeKey: string; payload: Record<string, unknown> }

/** writes the events whose dedupeKey was never written (outbox) nor ran (executions); returns how many were written */
async function emitNew(tx: Tx, vendorId: string, type: string, candidates: Candidate[]): Promise<number> {
  if (candidates.length === 0) return 0;
  const keys = candidates.map((x) => x.dedupeKey);
  const O = schema.outboxEvents;
  const X = schema.automationExecutions;
  const seen = new Set<string>();
  for (const r of await tx.select({ k: sql<string>`${O.payload}->>'dedupeKey'` }).from(O).where(and(eq(O.vendorId, vendorId), eq(O.type, type), inArray(sql`${O.payload}->>'dedupeKey'`, keys)))) seen.add(r.k);
  for (const r of await tx.select({ k: sql<string>`${X.facts}->>'dedupeKey'` }).from(X).where(and(eq(X.vendorId, vendorId), eq(X.eventType, type), inArray(sql`${X.facts}->>'dedupeKey'`, keys)))) seen.add(r.k);
  let n = 0;
  for (const cand of candidates) {
    if (seen.has(cand.dedupeKey)) continue;
    await writeOutboxEvent(tx, { type, vendorId, aggregateType: cand.aggregateType, aggregateId: cand.aggregateId, payload: { ...cand.payload, dedupeKey: cand.dedupeKey } });
    n++;
  }
  return n;
}

async function scanSla(tx: Tx, vendorId: string, now: Date): Promise<number> {
  const O = schema.orders;
  const { atRiskMinutes } = await loadSlaConfig(tx, vendorId);
  const due = new Date(now.getTime() + atRiskMinutes * 60_000);
  const rows = await tx.select({ id: O.id, orderNumber: O.orderNumber, marketplace: O.marketplace, totalMinor: O.totalMinor, status: O.status, dueAt: O.dispatchDueAt })
    .from(O).where(and(eq(O.vendorId, vendorId), inArray(O.status, PRE_DISPATCH), isNotNull(O.dispatchDueAt), lt(O.dispatchDueAt, due))).orderBy(O.dispatchDueAt).limit(BATCH);
  return emitNew(tx, vendorId, 'order.sla_at_risk', rows.map((o) => {
    const minutesToDue = Math.round((o.dueAt!.getTime() - now.getTime()) / 60_000);
    return { aggregateType: 'order', aggregateId: o.id, dedupeKey: `${o.id}:${o.dueAt!.toISOString()}`, payload: { orderNumber: o.orderNumber, marketplace: o.marketplace, status: o.status, totalMinor: o.totalMinor, state: minutesToDue < 0 ? 'breached' : 'at_risk', minutesToDue, dueAt: o.dueAt!.toISOString() } };
  }));
}

async function scanCompetitors(tx: Tx, vendorId: string, now: Date): Promise<number> {
  const L = schema.marketplaceListings;
  const V = schema.productVariants;
  const A = schema.marketplaceAccounts;
  const listings = await tx.select({ id: L.id, variantId: L.variantId, accountId: L.marketplaceAccountId, priceMinor: sql<number | null>`coalesce(${L.priceMinor}, ${V.sellingPriceMinor})`, sku: V.sku, marketplace: A.marketplace })
    .from(L).innerJoin(V, and(eq(V.id, L.variantId), eq(V.vendorId, L.vendorId))).innerJoin(A, and(eq(A.id, L.marketplaceAccountId), eq(A.vendorId, L.vendorId)))
    .where(and(eq(L.vendorId, vendorId), eq(L.status, 'active'), sql`coalesce(${L.priceMinor}, ${V.sellingPriceMinor}) is not null`)).limit(2_000);
  const prices = await latestCompetitorPrices(tx, vendorId, [...new Set(listings.map((l) => l.variantId))]);
  const oldest = now.getTime() - COMPETITOR_FRESH_DAYS * 86_400_000;
  const out: Candidate[] = [];
  for (const l of listings) {
    const p = prices.get(l.variantId);
    if (!p || p.observedAt.getTime() < oldest || (p.accountId && p.accountId !== l.accountId) || p.priceMinor >= l.priceMinor!) continue;
    const gapMinor = l.priceMinor! - p.priceMinor;
    out.push({ aggregateType: 'listing', aggregateId: l.id, dedupeKey: `${l.id}:${l.priceMinor}:${p.priceMinor}:${p.observedAt.toISOString()}`, payload: { listingId: l.id, variantId: l.variantId, accountId: l.accountId, sku: l.sku, marketplace: l.marketplace, ourPriceMinor: l.priceMinor, competitorPriceMinor: p.priceMinor, gapMinor, gapBps: Math.round((gapMinor * 10_000) / l.priceMinor!), sellerName: p.sellerName } });
    if (out.length >= BATCH) break;
  }
  return emitNew(tx, vendorId, 'price.competitor_lower', out);
}

/** local calendar parts (business time zone) of an instant; weekday 1 = Monday */
export function localSlot(now: Date, timeZone: string): { date: string; hour: number; weekday: number } {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(String(p.weekday)) + 1 };
}

async function scanCadence(tx: Tx, vendorId: string, now: Date): Promise<number> {
  const [v] = await tx.select({ tz: schema.vendors.timezone }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const s = localSlot(now, v?.tz ?? 'Asia/Kolkata');
  const slot = `${s.date}T${String(s.hour).padStart(2, '0')}`;
  return emitNew(tx, vendorId, 'schedule.cadence', [{ aggregateType: 'schedule', aggregateId: vendorId, dedupeKey: `${vendorId}:${slot}`, payload: { ...s, slot } }]);
}
