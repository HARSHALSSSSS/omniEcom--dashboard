import { and, asc, count, desc, eq, inArray, lt, lte, schema, withSystem, withVendor, type Tx } from '@oms/database';
import { AppError, Errors, newId } from '@oms/shared';
import type { Container } from '@oms/module-kit';
import { assertFormat, checkParams, defOf, REPORT_TYPES } from './catalog';
import { invalid } from './params';
import { createRun, JOB_GENERATE } from './runs';
import type { ReportFormat } from './tabular';
import { addDays, daysInMonth, dayString, isValidTimeZone, localParts, zonedToUtc } from './tz';

const SCH = schema.reportSchedules;
const R = schema.reportRuns;
export type ScheduleRow = typeof SCH.$inferSelect;
export const FREQUENCIES = schema.REPORT_FREQUENCIES;
export const MAX_SCHEDULES = 50;
export const MAX_RECIPIENTS = 20;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface Cadence { frequency: (typeof FREQUENCIES)[number]; dayOfWeek: number | null; dayOfMonth: number | null; timeOfDay: string; timezone: string }

/**
 * The next moment (strictly after `after`) a schedule is due, on the wall clock of its time zone. A monthly schedule on day 31
 * runs on the last day of shorter months; a time that does not exist on a daylight saving change moves forward.
 */
export function computeNextRun(c: Cadence, after: Date): Date {
  const [hh, mm] = c.timeOfDay.split(':').map(Number) as [number, number];
  const p = localParts(after, c.timezone);
  const today = dayString(p.year, p.month, p.day);
  for (let k = 0; k < 400; k++) {
    const day = addDays(today, k);
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const due = c.frequency === 'daily' || (c.frequency === 'weekly' && weekday === c.dayOfWeek) || (c.frequency === 'monthly' && d === Math.min(c.dayOfMonth ?? 1, daysInMonth(y, m)));
    if (!due) continue;
    const at = zonedToUtc(y, m, d, hh, mm, c.timezone);
    if (at.getTime() > after.getTime()) return at;
  }
  throw new Error('no next run found');
}

export const cadenceLabel = (c: Cadence): string =>
  c.frequency === 'daily' ? `Daily at ${c.timeOfDay}` : c.frequency === 'weekly' ? `Weekly on ${WEEKDAY_NAMES[c.dayOfWeek ?? 0]} at ${c.timeOfDay}` : `Monthly on day ${c.dayOfMonth} at ${c.timeOfDay}`;

export function toScheduleDto(s: ScheduleRow, last?: { id: string; status: string; finishedAt: Date | null; downloadable: boolean } | null) {
  const def = defOf(s.reportType);
  return {
    id: s.id, name: s.name, reportType: s.reportType, reportTitle: def?.title ?? s.reportType, format: s.format as ReportFormat, frequency: s.frequency as Cadence['frequency'], dayOfWeek: s.dayOfWeek, dayOfMonth: s.dayOfMonth,
    timeOfDay: s.timeOfDay, timezone: s.timezone, cadence: cadenceLabel(s as unknown as Cadence), params: s.params, recipients: s.recipients, status: s.status as 'active' | 'paused',
    lastRunAt: s.lastRunAt?.toISOString() ?? null, lastRunStatus: s.lastRunStatus, nextRunAt: s.status === 'active' && s.nextRunAt ? s.nextRunAt.toISOString() : null,
    lastRun: last ? { id: last.id, status: last.status, finishedAt: last.finishedAt?.toISOString() ?? null, downloadUrl: last.downloadable ? `/api/v1/reports/runs/${last.id}/download` : null } : null,
    createdBy: s.createdBy, version: s.version, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
  };
}

export interface ScheduleInput {
  name: string; reportType: string; format: ReportFormat; frequency: Cadence['frequency']; dayOfWeek?: number | null; dayOfMonth?: number | null;
  timeOfDay?: string; timezone?: string; params?: Record<string, unknown>; recipients?: string[]; status?: 'active' | 'paused';
}

/** the business rules of a schedule; returns the row values */
function normalize(i: ScheduleInput, fallbackTz: string) {
  const def = defOf(i.reportType);
  if (!def) throw invalid(`Unknown report type ${i.reportType}`, 'unknown_report_type', 'reportType', { types: REPORT_TYPES });
  if (!def.schedulable) throw invalid(`${def.title} cannot be scheduled`, 'not_schedulable', 'reportType');
  assertFormat(def, i.format);
  const timezone = i.timezone ?? fallbackTz;
  if (!isValidTimeZone(timezone)) throw invalid(`Unknown time zone ${timezone}`, 'bad_timezone', 'timezone');
  const timeOfDay = i.timeOfDay ?? '06:00';
  if (!TIME_RE.test(timeOfDay)) throw invalid('timeOfDay must be HH:MM (24 hour)', 'bad_time', 'timeOfDay');
  const dayOfWeek = i.frequency === 'weekly' ? i.dayOfWeek ?? null : null;
  const dayOfMonth = i.frequency === 'monthly' ? i.dayOfMonth ?? null : null;
  if (i.frequency === 'weekly' && (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6)) throw invalid('A weekly schedule needs dayOfWeek (0 = Sunday .. 6)', 'day_required', 'dayOfWeek');
  if (i.frequency === 'monthly' && (dayOfMonth === null || dayOfMonth < 1 || dayOfMonth > 31)) throw invalid('A monthly schedule needs dayOfMonth (1-31; shorter months run on their last day)', 'day_required', 'dayOfMonth');
  const recipients = [...new Set((i.recipients ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (recipients.length > MAX_RECIPIENTS) throw invalid(`At most ${MAX_RECIPIENTS} recipients`, 'too_many_recipients', 'recipients');
  for (const e of recipients) if (!EMAIL_RE.test(e) || e.length > 254) throw invalid(`${e} is not a valid e-mail address`, 'bad_recipient', 'recipients');
  const params = checkParams(def, i.params ?? {}, { forSchedule: true });
  const name = i.name.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 120) throw invalid('Name must be 1-120 characters', 'bad_name', 'name');
  return { def, name, timezone, timeOfDay, dayOfWeek, dayOfMonth, recipients, params };
}

export async function createSchedule(tx: Tx, vendorId: string, i: ScheduleInput, actorId: string | null, now = new Date()): Promise<ScheduleRow> {
  const [v] = await tx.select({ tz: schema.vendors.timezone }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const n = normalize(i, v?.tz ?? 'Asia/Kolkata');
  const [c] = await tx.select({ n: count() }).from(SCH).where(eq(SCH.vendorId, vendorId));
  if (Number(c?.n ?? 0) >= MAX_SCHEDULES) throw new AppError('CONFLICT', `At most ${MAX_SCHEDULES} schedules`, { details: { rule: 'schedule_limit' } });
  const status = i.status ?? 'active';
  const cadence: Cadence = { frequency: i.frequency, dayOfWeek: n.dayOfWeek, dayOfMonth: n.dayOfMonth, timeOfDay: n.timeOfDay, timezone: n.timezone };
  const [row] = await tx.insert(SCH).values({
    vendorId, name: n.name, reportType: i.reportType, format: i.format, frequency: i.frequency, dayOfWeek: n.dayOfWeek, dayOfMonth: n.dayOfMonth, timeOfDay: n.timeOfDay, timezone: n.timezone,
    params: n.params, recipients: n.recipients, status, nextRunAt: status === 'active' ? computeNextRun(cadence, now) : null, createdBy: actorId,
  }).returning();
  return row!;
}

export async function getSchedule(tx: Tx, vendorId: string, id: string): Promise<ScheduleRow> {
  const [s] = await tx.select().from(SCH).where(and(eq(SCH.id, id), eq(SCH.vendorId, vendorId)));
  if (!s) throw Errors.notFound('Report schedule', id);
  return s;
}

export type SchedulePatch = Partial<ScheduleInput> & { version: number };

export async function updateSchedule(tx: Tx, vendorId: string, id: string, patch: SchedulePatch, now = new Date()): Promise<{ before: ScheduleRow; after: ScheduleRow }> {
  const before = await getSchedule(tx, vendorId, id);
  if (before.version !== patch.version) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: before.version } });
  const merged: ScheduleInput = {
    name: patch.name ?? before.name, reportType: patch.reportType ?? before.reportType, format: patch.format ?? (before.format as ReportFormat), frequency: patch.frequency ?? (before.frequency as Cadence['frequency']),
    dayOfWeek: patch.dayOfWeek !== undefined ? patch.dayOfWeek : before.dayOfWeek, dayOfMonth: patch.dayOfMonth !== undefined ? patch.dayOfMonth : before.dayOfMonth, timeOfDay: patch.timeOfDay ?? before.timeOfDay,
    timezone: patch.timezone ?? before.timezone, params: patch.params ?? (patch.reportType && patch.reportType !== before.reportType ? {} : before.params), recipients: patch.recipients ?? before.recipients,
  };
  const n = normalize(merged, before.timezone);
  const status = patch.status ?? (before.status as 'active' | 'paused');
  const cadence: Cadence = { frequency: merged.frequency, dayOfWeek: n.dayOfWeek, dayOfMonth: n.dayOfMonth, timeOfDay: n.timeOfDay, timezone: n.timezone };
  const [after] = await tx.update(SCH).set({
    name: n.name, reportType: merged.reportType, format: merged.format, frequency: merged.frequency, dayOfWeek: n.dayOfWeek, dayOfMonth: n.dayOfMonth, timeOfDay: n.timeOfDay, timezone: n.timezone,
    params: n.params, recipients: n.recipients, status, nextRunAt: status === 'active' ? computeNextRun(cadence, now) : null, version: before.version + 1,
  }).where(and(eq(SCH.id, id), eq(SCH.vendorId, vendorId), eq(SCH.version, before.version))).returning();
  if (!after) throw new AppError('VERSION_CONFLICT');
  return { before, after };
}

/** pause / resume are idempotent: asking for the state it already has changes nothing */
export async function setScheduleStatus(tx: Tx, vendorId: string, id: string, status: 'active' | 'paused', now = new Date()): Promise<{ before: ScheduleRow; after: ScheduleRow }> {
  const before = await getSchedule(tx, vendorId, id);
  if (before.status === status) return { before, after: before };
  const nextRunAt = status === 'active' ? computeNextRun(before as unknown as Cadence, now) : null;
  const [after] = await tx.update(SCH).set({ status, nextRunAt, version: before.version + 1 }).where(and(eq(SCH.id, id), eq(SCH.vendorId, vendorId))).returning();
  return { before, after: after! };
}

/** The run history keeps its rows: the link to the schedule is cleared first (the composite foreign key cannot null only the schedule column). */
export async function deleteSchedule(tx: Tx, vendorId: string, id: string): Promise<ScheduleRow> {
  const s = await getSchedule(tx, vendorId, id);
  await tx.update(R).set({ scheduleId: null }).where(and(eq(R.vendorId, vendorId), eq(R.scheduleId, id)));
  await tx.delete(SCH).where(and(eq(SCH.id, id), eq(SCH.vendorId, vendorId)));
  return s;
}

export async function listSchedules(tx: Tx, vendorId: string, q: { page: number; pageSize: number; status?: string }) {
  const where = and(eq(SCH.vendorId, vendorId), q.status ? eq(SCH.status, q.status) : undefined);
  const [c] = await tx.select({ n: count() }).from(SCH).where(where);
  const items = await tx.select().from(SCH).where(where).orderBy(asc(SCH.name), asc(SCH.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
  const last = items.length ? await tx.selectDistinctOn([R.scheduleId], { id: R.id, scheduleId: R.scheduleId, status: R.status, finishedAt: R.finishedAt, fileKey: R.fileKey, expiresAt: R.expiresAt })
    .from(R).where(and(eq(R.vendorId, vendorId), inArray(R.scheduleId, items.map((s) => s.id)))).orderBy(R.scheduleId, desc(R.createdAt)) : [];
  const now = new Date();
  const byId = new Map(last.map((l) => [l.scheduleId, { id: l.id, status: l.status, finishedAt: l.finishedAt, downloadable: l.status === 'succeeded' && l.fileKey !== null && (l.expiresAt === null || l.expiresAt > now) }]));
  return { items, last: byId, total: Number(c?.n ?? 0) };
}

/** a manual run of a schedule: same parameters, recipients are told, the next scheduled time is untouched */
export async function runScheduleNow(tx: Tx, vendorId: string, id: string, actorId: string | null) {
  const s = await getSchedule(tx, vendorId, id);
  const def = defOf(s.reportType);
  if (!def) throw invalid(`Unknown report type ${s.reportType}`, 'unknown_report_type', 'reportType');
  return createRun(tx, vendorId, { def, format: s.format as ReportFormat, params: s.params, trigger: 'manual', scheduleId: s.id, scheduleName: s.name, requestedBy: actorId });
}

export const enqueueRun = (c: Container, vendorId: string, runId: string, correlationId: string) =>
  c.queues.enqueue('heavy', JOB_GENERATE, { vendorId, correlationId, idempotencyKey: `report-run-${runId}`, data: { runId } });

/**
 * Scheduler tick (every minute): every active schedule whose time has come gets exactly one run (the schedule row is locked and its
 * next time moved on in the same transaction, so two ticks never both fire it), then the runs are queued on the heavy queue.
 * A schedule that was missed while the system was down runs once and then continues from now. Runs left queued (a lost enqueue) are re-queued.
 */
export async function tickSchedules(c: Container, now = new Date()): Promise<{ created: number; requeued: number }> {
  const due = await withSystem(c.database.db, (tx) => tx.select({ id: SCH.id, vendorId: SCH.vendorId }).from(SCH).where(and(eq(SCH.status, 'active'), lte(SCH.nextRunAt, now))).orderBy(asc(SCH.nextRunAt)).limit(200));
  const byVendor = new Map<string, string[]>();
  for (const d of due) byVendor.set(d.vendorId, [...(byVendor.get(d.vendorId) ?? []), d.id]);
  let created = 0;
  for (const [vendorId, ids] of byVendor) {
    const runIds: string[] = [];
    await withVendor(c.database.db, vendorId, async (tx) => {
      for (const id of ids) {
        const [s] = await tx.select().from(SCH).where(and(eq(SCH.id, id), eq(SCH.vendorId, vendorId))).for('update', { skipLocked: true });
        if (!s || s.status !== 'active' || !s.nextRunAt || s.nextRunAt > now) continue;
        const def = defOf(s.reportType);
        await tx.update(SCH).set({ nextRunAt: computeNextRun(s as unknown as Cadence, now) }).where(eq(SCH.id, id));
        if (!def) continue;
        const run = await createRun(tx, vendorId, { def, format: s.format as ReportFormat, params: s.params, trigger: 'schedule', scheduleId: s.id, scheduleName: s.name, requestedBy: s.createdBy });
        runIds.push(run.id);
      }
    });
    for (const runId of runIds) await enqueueRun(c, vendorId, runId, newId());
    created += runIds.length;
  }
  const stuck = await withSystem(c.database.db, (tx) => tx.select({ id: R.id, vendorId: R.vendorId }).from(R).where(and(eq(R.status, 'queued'), lt(R.createdAt, new Date(now.getTime() - 2 * 60_000)))).limit(100));
  for (const r of stuck) await enqueueRun(c, r.vendorId, r.id, newId());
  return { created, requeued: stuck.length };
}
