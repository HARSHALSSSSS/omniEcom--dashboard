import { and, eq, schema, type Tx } from '@oms/database';

/**
 * Dispatch SLA model.
 *
 * Policy resolution for an order: (marketplace + warehouse) -> (marketplace) -> business default
 * (vendor settings `sla.defaultHandlingHours`, 24 h when not set).
 *
 * Due date: `due = countStart + handlingHours`.
 *   countStart = placedAt, EXCEPT when the policy has a `cutoffTime` ("HH:MM", business time zone) and the order was placed
 *   STRICTLY AFTER the cut-off on its local day: then the clock starts at the beginning (00:00 local) of the NEXT local day
 *   ("next working morning"). An order placed exactly at the cut-off still makes today's batch.
 *
 * Band (derived at read time, never stored): see `slaBand`.
 */
export const DEFAULT_HANDLING_HOURS = 24;
export const DEFAULT_AT_RISK_MINUTES = 90;
export const DEFAULT_APPROACHING_MINUTES = 240;

/** statuses that no longer owe a dispatch deadline */
export const SLA_DONE_STATUSES = ['dispatched', 'in_transit', 'delivered', 'cancelled', 'returned'] as const;

export type SlaState = 'safe' | 'approaching' | 'at_risk' | 'breached' | 'none';

export interface SlaPolicyRow { marketplace: string; warehouseId: string | null; handlingHours: number; cutoffTime: string | null }
export interface SlaPolicySet { rows: SlaPolicyRow[]; defaultHandlingHours: number }
export interface SlaThresholds { atRiskMinutes: number; approachingMinutes: number }

/** local calendar parts of an instant in an IANA zone */
function zonedParts(d: Date, tz: string): { y: number; m: number; d: number; h: number; mi: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute') };
}

/** the UTC instant at which the wall clock in `tz` shows y-m-d h:mi (iterates so DST offsets are honoured) */
export function zonedTimeToUtc(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  const want = Date.UTC(y, m - 1, d, h, mi);
  let guess = want;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), tz);
    guess -= Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - want;
  }
  return new Date(guess);
}

/** "YYYY-MM-DD" of an instant in a time zone */
export function localDay(d: Date, tz: string): string {
  const p = zonedParts(d, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

export function resolvePolicy(set: SlaPolicySet, ref: { marketplace: string; warehouseId?: string | null }): { handlingHours: number; cutoffTime: string | null; source: 'warehouse' | 'marketplace' | 'default' } {
  const wh = ref.warehouseId ? set.rows.find((r) => r.marketplace === ref.marketplace && r.warehouseId === ref.warehouseId) : undefined;
  if (wh) return { handlingHours: wh.handlingHours, cutoffTime: wh.cutoffTime, source: 'warehouse' };
  const mp = set.rows.find((r) => r.marketplace === ref.marketplace && r.warehouseId === null);
  if (mp) return { handlingHours: mp.handlingHours, cutoffTime: mp.cutoffTime, source: 'marketplace' };
  return { handlingHours: set.defaultHandlingHours, cutoffTime: null, source: 'default' };
}

export function computeDispatchDue(placedAt: Date, ref: { marketplace: string; warehouseId?: string | null }, policies: SlaPolicySet, businessTz: string): Date {
  const p = resolvePolicy(policies, ref);
  let start = placedAt;
  if (p.cutoffTime) {
    const [ch, cm] = p.cutoffTime.split(':').map(Number) as [number, number];
    const local = zonedParts(placedAt, businessTz);
    if (local.h * 60 + local.mi > ch * 60 + cm) start = zonedTimeToUtc(local.y, local.m, local.d + 1, 0, 0, businessTz);
  }
  return new Date(start.getTime() + p.handlingHours * 3_600_000);
}

/**
 * Pure band function. `none` for finished/cancelled orders and for orders without a due date;
 * breached = now > due; at_risk = due - now <= atRiskMinutes; approaching = <= approachingMinutes; else safe.
 */
export function slaBand(o: { status: string; dueAt: Date | null }, now: Date, t: SlaThresholds): SlaState {
  if ((SLA_DONE_STATUSES as readonly string[]).includes(o.status) || !o.dueAt) return 'none';
  const ms = o.dueAt.getTime() - now.getTime();
  if (ms < 0) return 'breached';
  const min = ms / 60_000;
  if (min <= t.atRiskMinutes) return 'at_risk';
  if (min <= t.approachingMinutes) return 'approaching';
  return 'safe';
}

export function slaLabel(state: SlaState, minutesRemaining: number | null): string | null {
  if (state === 'none' || minutesRemaining === null) return null;
  if (state === 'breached') return `Overdue ${fmt(Math.abs(minutesRemaining))}`;
  if (state === 'safe') return 'Healthy';
  return `Due in ${fmt(minutesRemaining)}`;
}
const fmt = (m: number) => (m >= 120 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

/** whole minutes from now to due (negative = overdue); null without a due date */
export const minutesRemaining = (dueAt: Date | null, now: Date): number | null => (dueAt ? Math.floor((dueAt.getTime() - now.getTime()) / 60_000) : null);

export interface SlaConfig extends SlaThresholds { policies: SlaPolicySet; timezone: string }

export async function loadSlaConfig(tx: Tx, vendorId: string): Promise<SlaConfig> {
  const [v] = await tx.select({ settings: schema.vendors.settings, timezone: schema.vendors.timezone }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const sla = ((v?.settings as Record<string, unknown> | undefined)?.sla ?? {}) as { defaultHandlingHours?: number; atRiskMinutes?: number; approachingMinutes?: number };
  const S = schema.marketplaceSla;
  const rows = await tx.select({ marketplace: S.marketplace, warehouseId: S.warehouseId, handlingHours: S.handlingHours, cutoffTime: S.cutoffTime }).from(S).where(eq(S.vendorId, vendorId));
  return {
    timezone: v?.timezone ?? 'Asia/Kolkata',
    atRiskMinutes: sla.atRiskMinutes ?? DEFAULT_AT_RISK_MINUTES,
    approachingMinutes: Math.max(sla.approachingMinutes ?? DEFAULT_APPROACHING_MINUTES, sla.atRiskMinutes ?? DEFAULT_AT_RISK_MINUTES),
    policies: { rows, defaultHandlingHours: sla.defaultHandlingHours ?? DEFAULT_HANDLING_HOURS },
  };
}

/** recompute `dispatch_due_at` of one order (e.g. after its warehouse became known). No-op for finished orders. */
export async function recomputeDispatchDue(tx: Tx, vendorId: string, orderId: string, warehouseId?: string | null): Promise<Date | null> {
  const O = schema.orders;
  const [o] = await tx.select({ marketplace: O.marketplace, placedAt: O.placedAt, status: O.status, warehouseId: O.warehouseId }).from(O).where(and(eq(O.vendorId, vendorId), eq(O.id, orderId)));
  if (!o || (SLA_DONE_STATUSES as readonly string[]).includes(o.status)) return null;
  const cfg = await loadSlaConfig(tx, vendorId);
  const due = computeDispatchDue(o.placedAt, { marketplace: o.marketplace, warehouseId: warehouseId ?? o.warehouseId }, cfg.policies, cfg.timezone);
  await tx.update(O).set({ dispatchDueAt: due }).where(and(eq(O.vendorId, vendorId), eq(O.id, orderId)));
  return due;
}
