import { and, eq, inArray, lte, schema, sql, withSystem, withVendor, writeOutboxEvent, type Tx } from '@oms/database';
import type { Container } from '@oms/module-kit';
import { DETECTORS, type DetectCtx, type Detection } from './detectors';

const I = schema.issues;
const E = schema.issueEvents;
type IssueRow = typeof I.$inferSelect;

export interface Actor { type: string; id: string | null }
export const SYSTEM: Actor = { type: 'system', id: null };

// ------------------------------------------------------------------------------------------------
// business time ("today" is the vendor's calendar day)
// ------------------------------------------------------------------------------------------------
export interface Bounds {
  tz: string;
  now: Date;
  /** first instant of tomorrow / of the day after tomorrow / of next week (Monday) in the business time zone */
  endOfToday: Date;
  endOfTomorrow: Date;
  endOfWeek: Date;
  /** 09:00 tomorrow and the last instant of the next business day (Mon-Fri) */
  tomorrow9: Date;
  nextBusinessDayEnd: Date;
}

export async function bounds(tx: Tx, vendorId: string): Promise<Bounds & { settings: Record<string, unknown> }> {
  const [v] = await tx.select({ tz: schema.vendors.timezone, settings: schema.vendors.settings }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const tz = v?.tz ?? 'Asia/Kolkata';
  const r = (await tx.execute<Record<string, unknown>>(sql`with t as (select now() at time zone ${tz} l) select
      extract(epoch from (date_trunc('day', l) + interval '1 day') at time zone ${tz}) * 1000 eod,
      extract(epoch from (date_trunc('day', l) + interval '2 day') at time zone ${tz}) * 1000 eot,
      extract(epoch from (date_trunc('week', l) + interval '7 day') at time zone ${tz}) * 1000 eow,
      extract(epoch from (date_trunc('day', l) + interval '1 day 9 hours') at time zone ${tz}) * 1000 tomorrow9,
      extract(epoch from (date_trunc('day', l) + (case extract(isodow from l)::int when 5 then 4 when 6 then 3 else 2 end) * interval '1 day') at time zone ${tz}) * 1000 biz_end,
      extract(epoch from now()) * 1000 now_ms from t`)).rows[0]!;
  const d = (k: string) => new Date(Number(r[k]));
  return { tz, now: d('now_ms'), endOfToday: d('eod'), endOfTomorrow: d('eot'), endOfWeek: d('eow'), tomorrow9: d('tomorrow9'), nextBusinessDayEnd: d('biz_end'), settings: (v?.settings ?? {}) as Record<string, unknown> };
}

const numSetting = (o: unknown, k: string, dflt: number): number => {
  const x = (o as Record<string, unknown> | undefined)?.[k];
  return typeof x === 'number' && Number.isFinite(x) ? x : dflt;
};

export async function detectCtx(tx: Tx, vendorId: string): Promise<DetectCtx> {
  const b = await bounds(tx, vendorId);
  const s = b.settings;
  return {
    vendorId, tz: b.tz, now: b.now, dueToday: new Date(b.endOfToday.getTime() - 1000), dueTomorrow: new Date(b.endOfTomorrow.getTime() - 1000),
    settings: {
      lowStockThreshold: numSetting(s, 'lowStockThreshold', 5), defaultLeadDays: numSetting(s.inventory, 'defaultLeadTimeDays', 7),
      atRiskMinutes: numSetting(s.sla, 'atRiskMinutes', 90), approachingMinutes: numSetting(s.sla, 'approachingMinutes', 240),
      inspectionOverdueHours: numSetting(s.returns, 'inspectionOverdueHours', 24), awaitingFirstScanHours: numSetting(s.shipping, 'awaitingFirstScanHours', 12),
    },
  };
}

// ------------------------------------------------------------------------------------------------
// events + outbox
// ------------------------------------------------------------------------------------------------
export async function recordEvent(tx: Tx, vendorId: string, issueId: string, type: (typeof schema.ISSUE_EVENT_TYPES)[number], actor: Actor, note?: string | null, data: Record<string, unknown> = {}): Promise<void> {
  await tx.insert(E).values({ vendorId, issueId, type, actorType: actor.type, actorId: actor.id, note: note ?? null, data });
}

export async function publish(tx: Tx, vendorId: string, type: 'issue.opened' | 'issue.resolved', i: Pick<IssueRow, 'id' | 'key' | 'area' | 'priority' | 'title' | 'count'>, extra: Record<string, unknown> = {}, correlationId?: string): Promise<void> {
  await writeOutboxEvent(tx, { type, vendorId, aggregateType: 'issue', aggregateId: i.id, payload: { key: i.key, area: i.area, priority: i.priority, title: i.title, count: i.count, ...extra }, correlationId });
}

// ------------------------------------------------------------------------------------------------
// upsert: one row per (vendor, key, scope); a detector keeps updating it instead of duplicating
// ------------------------------------------------------------------------------------------------
export type UpsertOutcome = 'created' | 'updated' | 'unchanged' | 'reopened';

const sameDate = (a: Date | null, b: Date | null) => (a === null || b === null ? a === b : a.getTime() === b.getTime());

export async function upsertIssue(tx: Tx, vendorId: string, d: Detection, now = new Date()): Promise<UpsertOutcome> {
  const fields = { area: d.area, priority: d.priority, title: d.title, explanation: d.explanation, impact: d.impact, count: d.count, affected: d.affected, dueAt: d.dueAt, recommendedAction: d.recommendedAction, details: d.details };
  const [cur] = await tx.select().from(I).where(and(eq(I.vendorId, vendorId), eq(I.key, d.key), eq(I.scopeHash, d.scopeHash)));
  if (!cur) {
    const [row] = await tx.insert(I).values({ vendorId, key: d.key, scopeHash: d.scopeHash, status: 'open', ...fields, firstSeenAt: now, lastSeenAt: now }).returning();
    await recordEvent(tx, vendorId, row!.id, 'detected', SYSTEM, null, { count: d.count, priority: d.priority });
    await publish(tx, vendorId, 'issue.opened', row!);
    return 'created';
  }
  if (cur.status === 'resolved') {
    const d0 = (cur.details ?? {}) as Record<string, unknown>;
    const heldByHand = cur.resolvedBy !== null && d0._cleared !== true;
    // a manual resolve while the condition is still there stays resolved until it gets worse (or goes away and comes back)
    if (heldByHand && d.count <= Number(d0._resolvedCount ?? 0)) return 'unchanged';
    await tx.update(I).set({ ...fields, status: 'open', resolvedAt: null, resolvedBy: null, resolution: null, snoozedUntil: null, lastSeenAt: now, version: sql`${I.version} + 1` }).where(eq(I.id, cur.id));
    await recordEvent(tx, vendorId, cur.id, 'reopened', SYSTEM, null, { count: d.count });
    await publish(tx, vendorId, 'issue.opened', { ...cur, ...fields }, { reopened: true });
    return 'reopened';
  }
  const changed = cur.count !== d.count || cur.priority !== d.priority || cur.title !== d.title;
  const quiet = !changed && sameDate(cur.dueAt, d.dueAt) && cur.explanation === d.explanation;
  // snoozed issues stay snoozed (until snoozed_until); their numbers keep refreshing silently
  await tx.update(I).set({ ...fields, lastSeenAt: now, ...(quiet ? { updatedAt: cur.updatedAt } : { version: sql`${I.version} + 1` }) }).where(eq(I.id, cur.id));
  if (changed) await recordEvent(tx, vendorId, cur.id, 'updated', SYSTEM, null, { count: d.count, previousCount: cur.count, priority: d.priority, previousPriority: cur.priority });
  return changed ? 'updated' : 'unchanged';
}

// ------------------------------------------------------------------------------------------------
// sweep one vendor
// ------------------------------------------------------------------------------------------------
export interface SweepResult { created: number; updated: number; reopened: number; autoResolved: number; unsnoozed: number; detectors: number; failedDetectors: string[]; open: number }

export async function sweepVendor(tx: Tx, vendorId: string): Promise<SweepResult> {
  const ctx = await detectCtx(tx, vendorId);
  const res: SweepResult = { created: 0, updated: 0, reopened: 0, autoResolved: 0, unsnoozed: 0, detectors: 0, failedDetectors: [], open: 0 };

  // snoozes that ran out come back first, so a returning issue is judged as a normal open one
  const woke = await tx.update(I).set({ status: 'open', snoozedUntil: null, version: sql`${I.version} + 1` })
    .where(and(eq(I.vendorId, vendorId), eq(I.status, 'snoozed'), lte(I.snoozedUntil, ctx.now))).returning({ id: I.id });
  for (const w of woke) await recordEvent(tx, vendorId, w.id, 'unsnoozed', SYSTEM, 'Snooze ended');
  res.unsnoozed = woke.length;

  const reported = new Set<string>();
  const ran = new Set<string>();
  for (const det of DETECTORS) {
    let found: Detection[];
    try {
      // a savepoint: a failing detector must not poison the transaction or hide the other detectors' findings
      found = await tx.transaction((sp) => det.run(sp, ctx));
    } catch {
      res.failedDetectors.push(det.key);
      continue;
    }
    res.detectors++;
    ran.add(det.key);
    for (const f of found) {
      reported.add(`${f.key}\u0000${f.scopeHash}`);
      const out = await upsertIssue(tx, vendorId, f, ctx.now);
      if (out === 'created') res.created++;
      else if (out === 'updated') res.updated++;
      else if (out === 'reopened') res.reopened++;
    }
  }

  // detectors that ran and no longer report an issue: the condition is gone
  if (ran.size > 0) {
    const live = await tx.select().from(I).where(and(eq(I.vendorId, vendorId), inArray(I.key, [...ran]), inArray(I.status, ['open', 'in_progress', 'snoozed', 'resolved'])));
    for (const i of live) {
      if (reported.has(`${i.key}\u0000${i.scopeHash}`)) continue;
      if (i.status === 'resolved') {
        // remember that the condition went away, so a manual resolve is reopened when it comes back
        if (i.resolvedBy !== null && (i.details as Record<string, unknown>)._cleared !== true) await tx.update(I).set({ details: { ...i.details, _cleared: true }, updatedAt: i.updatedAt }).where(eq(I.id, i.id));
        continue;
      }
      await tx.update(I).set({ status: 'resolved', resolvedAt: ctx.now, resolvedBy: null, resolution: 'auto', snoozedUntil: null, version: sql`${I.version} + 1` }).where(eq(I.id, i.id));
      await recordEvent(tx, vendorId, i.id, 'auto_resolved', SYSTEM, 'The condition no longer applies');
      await publish(tx, vendorId, 'issue.resolved', i, { mode: 'auto' });
      res.autoResolved++;
    }
  }
  const [open] = await tx.select({ n: sql<number>`count(*)::int` }).from(I).where(and(eq(I.vendorId, vendorId), inArray(I.status, ['open', 'in_progress'])));
  res.open = open?.n ?? 0;
  return res;
}

// ------------------------------------------------------------------------------------------------
// the scheduled job: every active vendor, in bounded batches; one vendor failing never stops the rest
// ------------------------------------------------------------------------------------------------
export const SWEEP_BATCH = 50;
export async function sweepAllVendors(c: Container): Promise<{ vendors: number; failed: number }> {
  let after = '';
  let vendors = 0;
  let failed = 0;
  for (;;) {
    const batch = await withSystem(c.database.db, (tx) => tx.select({ id: schema.vendors.id }).from(schema.vendors)
      .where(and(eq(schema.vendors.status, 'active'), sql`${schema.vendors.deletedAt} is null`, after ? sql`${schema.vendors.id} > ${after}::uuid` : undefined)).orderBy(schema.vendors.id).limit(SWEEP_BATCH));
    if (batch.length === 0) break;
    for (const v of batch) {
      vendors++;
      try {
        await withVendor(c.database.db, v.id, (tx) => sweepVendor(tx, v.id));
      } catch (err) {
        failed++;
        c.logger.warn({ vendorId: v.id, err }, 'issues sweep failed for a vendor');
      }
    }
    after = batch[batch.length - 1]!.id;
    if (batch.length < SWEEP_BATCH) break;
  }
  return { vendors, failed };
}
