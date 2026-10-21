import { and, asc, desc, eq, gte, inArray, isNull, lt, or, schema, sql, type SQL, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { lowStockRows } from './detectors';
import { bounds, publish, recordEvent, type Actor, type Bounds } from './engine';

const I = schema.issues;
const E = schema.issueEvents;
export type IssueRow = typeof I.$inferSelect;
export const ACTIVE = ['open', 'in_progress'] as const;

// ------------------------------------------------------------------------------------------------
// presentation helpers
// ------------------------------------------------------------------------------------------------
const hrefFor = (type: string, id: string): string | null => {
  switch (type) {
    case 'order': return `/orders/${id}`;
    case 'variant': return `/inventory/variants/${id}`;
    case 'listing': return `/listings/${id}`;
    case 'account': return `/channels/${id}`;
    case 'return': return `/returns/${id}`;
    case 'shipment': return `/shipping/shipments/${id}`;
    case 'sync_job': return `/sync/jobs/${id}`;
    default: return null;
  }
};

/** "Today", "Today, 3:30 PM", "Tomorrow", "Overdue", "Oct 21"; day-level deadlines (23:59:59 local) show no clock time */
export function dueLabel(dueAt: Date | null, b: Bounds): string | null {
  if (!dueAt) return null;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: b.tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(dueAt);
  const p = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  const dayLevel = p('hour') === 23 && p('minute') === 59 && p('second') === 59;
  const clock = dayLevel ? '' : `, ${new Intl.DateTimeFormat('en-US', { timeZone: b.tz, hour: 'numeric', minute: '2-digit' }).format(dueAt)}`;
  if (dueAt.getTime() < b.now.getTime() && !dayLevel) return 'Overdue';
  if (dueAt.getTime() < b.endOfToday.getTime()) return dayLevel && dueAt.getTime() < b.now.getTime() ? 'Today' : `Today${clock}`;
  if (dueAt.getTime() < b.endOfTomorrow.getTime()) return `Tomorrow${clock}`;
  return `${new Intl.DateTimeFormat('en-US', { timeZone: b.tz, month: 'short', day: 'numeric' }).format(dueAt)}${clock}`;
}

export interface IssueDto {
  id: string; key: string; area: string; priority: string; status: string; title: string; explanation: string; impact: string | null; count: number;
  dueAt: string | null; dueLabel: string | null; recommendedAction: { text: string; label: string; href: string } | Record<string, never>; assignedTo: string | null; assigneeName: string | null;
  snoozedUntil: string | null; statusNote: string | null; firstSeenAt: string; updatedAt: string;
}

const action = (i: IssueRow) => i.recommendedAction as IssueDto['recommendedAction'];
function toDto(i: IssueRow, b: Bounds, last?: { type: string; note: string | null }, names?: Map<string, string>): IssueDto {
  let statusNote: string | null = null;
  if (i.status === 'in_progress') statusNote = last?.type === 'started' && last.note ? last.note : 'Review started';
  else if (i.status === 'open' && last?.type === 'resolution_failed') statusNote = 'Resolution failed';
  return {
    id: i.id, key: i.key, area: i.area, priority: i.priority, status: i.status, title: i.title, explanation: i.explanation, impact: i.impact, count: i.count,
    dueAt: i.dueAt?.toISOString() ?? null, dueLabel: dueLabel(i.dueAt, b), recommendedAction: action(i), assignedTo: i.assignedTo, assigneeName: i.assignedTo ? names?.get(i.assignedTo) ?? null : null, snoozedUntil: i.snoozedUntil?.toISOString() ?? null,
    statusNote, firstSeenAt: i.firstSeenAt.toISOString(), updatedAt: i.updatedAt.toISOString(),
  };
}

// ------------------------------------------------------------------------------------------------
// queue
// ------------------------------------------------------------------------------------------------
export interface ListQuery { tab: 'all' | 'critical' | 'today' | 'upcoming'; area?: string; priority?: string; status?: string; due?: 'today' | 'tomorrow' | 'this_week'; sort?: 'priority' | 'due' | 'updated' }

function queueWhere(vendorId: string, q: ListQuery, b: Bounds): SQL {
  const c: Array<SQL | undefined> = [eq(I.vendorId, vendorId)];
  c.push(q.status ? eq(I.status, q.status) : inArray(I.status, [...ACTIVE]));
  if (q.area) c.push(eq(I.area, q.area));
  if (q.priority) c.push(eq(I.priority, q.priority));
  if (q.tab === 'critical') c.push(eq(I.priority, 'critical'));
  if (q.tab === 'today') c.push(lt(I.dueAt, b.endOfToday));
  if (q.tab === 'upcoming') c.push(or(gte(I.dueAt, b.endOfToday), isNull(I.dueAt)));
  if (q.due === 'today') c.push(lt(I.dueAt, b.endOfToday));
  if (q.due === 'tomorrow') c.push(and(gte(I.dueAt, b.endOfToday), lt(I.dueAt, b.endOfTomorrow)));
  if (q.due === 'this_week') c.push(lt(I.dueAt, b.endOfWeek));
  return and(...c)!;
}

const rank = sql`case ${I.priority} when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`;

export async function listIssues(tx: Tx, vendorId: string, q: ListQuery, win: { limit: number; offset: number }) {
  const b = await bounds(tx, vendorId);
  const where = queueWhere(vendorId, q, b);
  const order = q.sort === 'due' ? [sql`${I.dueAt} asc nulls last`, rank, desc(I.createdAt)] : q.sort === 'updated' ? [desc(I.updatedAt)] : [rank, sql`${I.dueAt} asc nulls last`, desc(I.createdAt), asc(I.id)];
  const [rs, [tot]] = await Promise.all([
    tx.select().from(I).where(where).orderBy(...order).limit(win.limit).offset(win.offset),
    tx.select({ n: sql<number>`count(*)::int` }).from(I).where(where),
  ]);
  const last = await lastEvents(tx, vendorId, rs.map((r) => r.id));
  const names = await assigneeNames(tx, vendorId, rs.map((r) => r.assignedTo));
  return { items: rs.map((r) => toDto(r, b, last.get(r.id), names)), total: tot?.n ?? 0 };
}

/** display names of the assignees (one query for the whole page) */
async function assigneeNames(tx: Tx, vendorId: string, ids: Array<string | null>) {
  const out = new Map<string, string>();
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (want.length === 0) return out;
  const rs = await tx.select({ id: schema.users.id, name: schema.users.fullName }).from(schema.users).where(and(eq(schema.users.vendorId, vendorId), inArray(schema.users.id, want)));
  for (const r of rs) out.set(r.id, r.name);
  return out;
}

/** members who can be assigned an issue: active, not deleted, of this business */
export async function assignableMembers(tx: Tx, vendorId: string) {
  return tx.select({ id: schema.users.id, name: schema.users.fullName, email: schema.users.email }).from(schema.users)
    .where(and(eq(schema.users.vendorId, vendorId), eq(schema.users.status, 'active'), isNull(schema.users.deletedAt))).orderBy(asc(schema.users.fullName), asc(schema.users.id));
}

/** the latest event of each issue (one query for the whole page) */
async function lastEvents(tx: Tx, vendorId: string, ids: string[]) {
  const out = new Map<string, { type: string; note: string | null }>();
  if (ids.length === 0) return out;
  const rs = await tx.selectDistinctOn([E.issueId], { issueId: E.issueId, type: E.type, note: E.note }).from(E).where(and(eq(E.vendorId, vendorId), inArray(E.issueId, ids))).orderBy(E.issueId, desc(E.id));
  for (const r of rs) out.set(r.issueId, { type: r.type, note: r.note });
  return out;
}

export async function issueCounts(tx: Tx, vendorId: string) {
  const b = await bounds(tx, vendorId);
  const rs = await tx.select({
    area: I.area, open: sql<number>`count(*)::int`, critical: sql<number>`(count(*) filter (where ${I.priority} = 'critical'))::int`,
    today: sql<number>`(count(*) filter (where ${I.dueAt} < ${b.endOfToday.toISOString()}::timestamptz))::int`, upcoming: sql<number>`(count(*) filter (where ${I.dueAt} >= ${b.endOfToday.toISOString()}::timestamptz or ${I.dueAt} is null))::int`,
  }).from(I).where(and(eq(I.vendorId, vendorId), inArray(I.status, [...ACTIVE]))).groupBy(I.area);
  const [seen] = await tx.select({ at: sql<Date | null>`max(${I.lastSeenAt})` }).from(I).where(eq(I.vendorId, vendorId));
  const sum = (k: 'open' | 'critical' | 'today' | 'upcoming') => rs.reduce((s, r) => s + r[k], 0);
  return {
    open: sum('open'), tabs: { all: sum('open'), critical: sum('critical'), today: sum('today'), upcoming: sum('upcoming') },
    byArea: Object.fromEntries(rs.map((r) => [r.area, r.open])) as Record<string, number>,
    updatedAt: (seen?.at ? new Date(seen.at) : b.now).toISOString(),
  };
}

// ------------------------------------------------------------------------------------------------
// detail
// ------------------------------------------------------------------------------------------------
export async function loadIssue(tx: Tx, vendorId: string, id: string): Promise<IssueRow> {
  const [row] = await tx.select().from(I).where(and(eq(I.id, id), eq(I.vendorId, vendorId)));
  if (!row) throw Errors.notFound('Issue', id);
  return row;
}

export async function issueDetail(tx: Tx, vendorId: string, id: string) {
  const b = await bounds(tx, vendorId);
  const i = await loadIssue(tx, vendorId, id);
  const events = await tx.select().from(E).where(and(eq(E.vendorId, vendorId), eq(E.issueId, id))).orderBy(desc(E.id)).limit(100);
  const d = i.details as Record<string, unknown>;
  const last = events[0] ? { type: events[0].type, note: events[0].note } : undefined;
  return {
    ...toDto(i, b, last, await assigneeNames(tx, vendorId, [i.assignedTo])),
    whyItMatters: typeof d.whyItMatters === 'string' ? d.whyItMatters : '',
    affected: { total: i.count, items: i.affected.map((a) => ({ type: a.type, id: a.id, label: a.label, href: hrefFor(a.type, a.id) })) },
    deadline: { at: i.dueAt?.toISOString() ?? null, label: dueLabel(i.dueAt, b) },
    resolution: i.resolution, resolvedAt: i.resolvedAt?.toISOString() ?? null,
    timeline: events.map((e) => ({ type: e.type, actorType: e.actorType, actorId: e.actorId, note: e.note, at: e.createdAt.toISOString() })),
  };
}

// ------------------------------------------------------------------------------------------------
// lifecycle (each change = one state update + one append-only event)
// ------------------------------------------------------------------------------------------------
const stateConflict = (i: IssueRow, rule: string, message: string) => Errors.conflict(message, { rule, status: i.status });
const bump = sql`${I.version} + 1`;

export async function startIssue(tx: Tx, vendorId: string, id: string, actor: Actor, note?: string | null) {
  const i = await loadIssue(tx, vendorId, id);
  if (i.status === 'in_progress') return i;
  if (i.status !== 'open') throw stateConflict(i, 'not_open', `A ${i.status} issue cannot be started`);
  const [row] = await tx.update(I).set({ status: 'in_progress', version: bump }).where(and(eq(I.id, id), eq(I.vendorId, vendorId))).returning();
  await recordEvent(tx, vendorId, id, 'started', actor, note ?? null);
  return row!;
}

export async function snoozeIssue(tx: Tx, vendorId: string, id: string, actor: Actor, until: Date, note?: string | null) {
  const i = await loadIssue(tx, vendorId, id);
  if (i.status === 'resolved') throw stateConflict(i, 'already_resolved', 'A resolved issue cannot be snoozed');
  const [row] = await tx.update(I).set({ status: 'snoozed', snoozedUntil: until, version: bump }).where(and(eq(I.id, id), eq(I.vendorId, vendorId))).returning();
  await recordEvent(tx, vendorId, id, 'snoozed', actor, note ?? null, { until: until.toISOString(), from: i.status });
  return row!;
}

export async function unsnoozeIssue(tx: Tx, vendorId: string, id: string, actor: Actor) {
  const i = await loadIssue(tx, vendorId, id);
  if (i.status !== 'snoozed') throw stateConflict(i, 'not_snoozed', 'Only a snoozed issue can be unsnoozed');
  const [row] = await tx.update(I).set({ status: 'open', snoozedUntil: null, version: bump }).where(and(eq(I.id, id), eq(I.vendorId, vendorId))).returning();
  await recordEvent(tx, vendorId, id, 'unsnoozed', actor);
  return row!;
}

export async function resolveIssue(tx: Tx, vendorId: string, id: string, actor: Actor, o: { note?: string | null; mode?: 'manual' | 'attempt'; data?: Record<string, unknown> } = {}, correlationId?: string) {
  const i = await loadIssue(tx, vendorId, id);
  if (i.status === 'resolved') throw stateConflict(i, 'already_resolved', 'The issue is already resolved');
  const mode = o.mode ?? 'manual';
  const resolvedBy = actor.id && /^[0-9a-f-]{36}$/i.test(actor.id) ? actor.id : null;
  const details = { ...(i.details as Record<string, unknown>), _resolvedCount: i.count, _cleared: false };
  const [row] = await tx.update(I).set({ status: 'resolved', resolvedAt: new Date(), resolvedBy, resolution: o.note ?? (mode === 'attempt' ? 'attempt' : 'manual'), snoozedUntil: null, details, version: bump })
    .where(and(eq(I.id, id), eq(I.vendorId, vendorId))).returning();
  await recordEvent(tx, vendorId, id, 'resolved', actor, o.note ?? null, { mode, ...(o.data ?? {}) });
  await publish(tx, vendorId, 'issue.resolved', i, { mode, resolvedBy }, correlationId);
  return row!;
}

export async function failResolution(tx: Tx, vendorId: string, id: string, actor: Actor, reason: string): Promise<void> {
  await recordEvent(tx, vendorId, id, 'resolution_failed', actor, reason);
  await tx.update(I).set({ version: bump }).where(and(eq(I.id, id), eq(I.vendorId, vendorId)));
}

export async function assignIssue(tx: Tx, vendorId: string, id: string, actor: Actor, userId: string) {
  const i = await loadIssue(tx, vendorId, id);
  if (i.status === 'resolved') throw stateConflict(i, 'already_resolved', 'A resolved issue cannot be assigned');
  const [u] = await tx.select({ id: schema.users.id, name: schema.users.fullName }).from(schema.users).where(and(eq(schema.users.id, userId), eq(schema.users.vendorId, vendorId), isNull(schema.users.deletedAt)));
  if (!u) throw new AppError('BAD_REQUEST', 'The assignee must be a member of this business', { details: { rule: 'assignee_not_member', userId } });
  const [row] = await tx.update(I).set({ assignedTo: userId, version: bump }).where(and(eq(I.id, id), eq(I.vendorId, vendorId))).returning();
  await recordEvent(tx, vendorId, id, 'assigned', actor, u.name, { userId });
  return row!;
}

// ------------------------------------------------------------------------------------------------
// snooze window rules
// ------------------------------------------------------------------------------------------------
export const SNOOZE_PRESETS = ['later_today', 'tomorrow', 'this_week'] as const;

/** turns a preset / ISO date / ISO instant into a time and enforces the limits: critical <= end of the next business day, others <= 7 days */
export async function snoozeUntil(tx: Tx, input: string, b: Bounds, priority: string): Promise<Date> {
  let until: Date;
  if (input === 'later_today') until = new Date(Math.min(b.now.getTime() + 3 * 3_600_000, b.endOfToday.getTime() - 1000));
  else if (input === 'tomorrow') until = b.tomorrow9;
  else if (input === 'this_week') until = new Date(b.endOfWeek.getTime() - 1000);
  else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split('-').map(Number) as [number, number, number];
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) throw new AppError('BAD_REQUEST', '`until` is not a valid date', { details: { rule: 'invalid_until' } });
    const r = (await tx.execute<{ ms: string }>(sql`select extract(epoch from (${input}::date + interval '9 hours') at time zone ${b.tz}) * 1000 ms`)).rows[0]!;
    until = new Date(Number(r.ms));
  } else {
    until = new Date(input);
    if (Number.isNaN(until.getTime())) throw new AppError('BAD_REQUEST', '`until` must be later_today, tomorrow, this_week, a date (YYYY-MM-DD) or an ISO time', { details: { rule: 'invalid_until' } });
  }
  if (until.getTime() <= b.now.getTime()) throw new AppError('BAD_REQUEST', '`until` must be in the future', { details: { rule: 'until_in_past' } });
  const max = priority === 'critical' ? b.nextBusinessDayEnd : new Date(b.now.getTime() + 7 * 86_400_000);
  if (until.getTime() > max.getTime()) {
    throw new AppError('BAD_REQUEST', priority === 'critical' ? 'A critical issue can be snoozed until the next business day at most' : 'An issue can be snoozed for 7 days at most', { details: { rule: 'snooze_too_long', maxUntil: max.toISOString() } });
  }
  return until;
}

// ------------------------------------------------------------------------------------------------
// history (resolved + snoozed)
// ------------------------------------------------------------------------------------------------
export async function issueHistory(tx: Tx, vendorId: string, status: 'all' | 'resolved' | 'snoozed', win: { limit: number; offset: number }) {
  const b = await bounds(tx, vendorId);
  const where = and(eq(I.vendorId, vendorId), status === 'all' ? inArray(I.status, ['resolved', 'snoozed']) : eq(I.status, status));
  const [rs, [tot], chips] = await Promise.all([
    tx.select({ i: I, by: schema.users.fullName }).from(I).leftJoin(schema.users, eq(schema.users.id, I.resolvedBy)).where(where).orderBy(desc(I.updatedAt), asc(I.id)).limit(win.limit).offset(win.offset),
    tx.select({ n: sql<number>`count(*)::int` }).from(I).where(where),
    tx.select({ status: I.status, n: sql<number>`count(*)::int` }).from(I).where(and(eq(I.vendorId, vendorId), inArray(I.status, ['resolved', 'snoozed']))).groupBy(I.status),
  ]);
  const n = (s: string) => chips.find((c) => c.status === s)?.n ?? 0;
  return {
    items: rs.map(({ i, by }) => ({
      id: i.id, title: i.title, area: i.area, status: i.status, updatedAt: i.updatedAt.toISOString(), resolvedBy: i.status === 'resolved' ? by ?? null : null,
      resolution: i.status === 'resolved' ? i.resolution : null, returnsAt: i.status === 'snoozed' ? i.snoozedUntil?.toISOString() ?? null : null, recommendedAction: action(i),
      returnsLabel: i.status === 'snoozed' ? dueLabel(i.snoozedUntil, b) : null,
    })),
    total: tot?.n ?? 0, counts: { all: n('resolved') + n('snoozed'), resolved: n('resolved'), snoozed: n('snoozed') },
  };
}

// ------------------------------------------------------------------------------------------------
// recommendation banner
// ------------------------------------------------------------------------------------------------
export async function recommendation(tx: Tx, vendorId: string) {
  const b = await bounds(tx, vendorId);
  const threshold = typeof b.settings.lowStockThreshold === 'number' ? b.settings.lowStockThreshold : 5;
  const low = await lowStockRows(tx, vendorId, threshold);
  const hot = low.filter((l) => l.sold7d >= 3);
  if (low.length === 0 || hot.length === 0) return null;
  return {
    text: low.length === 1
      ? 'The 1 low-stock product has sold at least 3 units in the last 7 days. Consider reviewing replenishment for it first.'
      : `${hot.length} of the ${low.length} low-stock products ${hot.length === 1 ? 'has' : 'have'} sold at least 3 units in the last 7 days. Consider reviewing replenishment for ${hot.length === 1 ? 'it' : 'these products'} first.`,
    evidence: { lowStockProducts: low.length, soldAtLeast3: hot.length, windowDays: 7, minUnits: 3, items: hot.sort((a, c) => c.sold7d - a.sold7d).slice(0, 10).map((l) => ({ variantId: l.variantId, sku: l.sku, title: l.title, available: l.available, sold7d: l.sold7d })) },
    action: { label: 'Review recommendation', href: '/inventory?health=low' },
  };
}

/** one issue as the queue shows it (used by the action endpoints) */
export async function listOne(tx: Tx, vendorId: string, row: IssueRow): Promise<IssueDto> {
  const b = await bounds(tx, vendorId);
  return toDto(row, b, (await lastEvents(tx, vendorId, [row.id])).get(row.id), await assigneeNames(tx, vendorId, [row.assignedTo]));
}
