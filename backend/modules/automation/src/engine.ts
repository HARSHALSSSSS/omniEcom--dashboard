import { and, desc, eq, inArray, schema, sql, writeAudit, writeOutboxEvent, withVendor, isFeatureEnabled, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import type { Container, DomainEventLike } from '@oms/module-kit';
import { Work } from '@oms/mod-fulfillment';
import { matches, OPS, type ConditionSet, type Facts } from '@oms/mod-rules';
import { ACTIONS } from './actions';
import { factsOf } from './kit';
import { TRIGGERS, screenAction, screenTrigger } from './triggers';

export { TRIGGERS } from './triggers';
export { ACTIONS } from './actions';
export { factsOf, render } from './kit';

const RULE = schema.automationRules;
const EX = schema.automationExecutions;
export type RuleRow = typeof RULE.$inferSelect;
export type ExecutionRow = typeof EX.$inferSelect;

// ------------------------------------------------------------------------------------------------
// rules
// ------------------------------------------------------------------------------------------------
const FIELD = /^[A-Za-z][A-Za-z0-9_.]{0,60}$/;
export function validateRule(input: { triggerEvent: string; conditions: ConditionSet; action: { type: string; params: Record<string, unknown> } }): Record<string, unknown> {
  if (!TRIGGERS[input.triggerEvent]) throw new AppError('BAD_REQUEST', 'Unknown trigger event', { details: { allowed: Object.keys(TRIGGERS) } });
  for (const c of input.conditions.conditions) {
    if (!FIELD.test(c.field)) throw new AppError('BAD_REQUEST', `Invalid condition field "${c.field}"`, { details: { rule: 'condition_field' } });
    if (!(OPS as readonly string[]).includes(c.op)) throw new AppError('BAD_REQUEST', `Unknown operator "${c.op}"`, { details: { allowed: OPS } });
  }
  if (input.triggerEvent === 'schedule.cadence') validateCadence(input.conditions);
  const def = ACTIONS[input.action.type];
  if (!def) throw new AppError('BAD_REQUEST', 'Unknown action type', { details: { allowed: Object.keys(ACTIONS) } });
  if (def.triggers !== '*' && !def.triggers.includes(input.triggerEvent)) throw new AppError('BAD_REQUEST', `The action "${input.action.type}" cannot be used with the trigger "${input.triggerEvent}"`, { details: { actionTriggers: def.triggers } });
  const parsed = def.schema.safeParse(input.action.params);
  if (!parsed.success) throw new AppError('VALIDATION_FAILED', 'Invalid action parameters', { details: { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
  return parsed.data;
}

export interface RuleStats { runsCount: number; lastRunAt: Date | null }

/** the marketplace a rule is limited to: a `marketplace eq <code>` condition (the screen's channel filter) */
export const channelFilterOf = (c: ConditionSet): string | null => {
  const f = c.conditions.find((x) => x.field === 'marketplace' && x.op === 'eq' && typeof x.value === 'string');
  return f ? String(f.value) : null;
};

/** daily / weekly cadence of a `schedule.cadence` rule, read from its `hour` / `weekday` conditions */
export const scheduleOf = (r: Pick<RuleRow, 'triggerEvent' | 'conditions'>): { cadence: 'daily' | 'weekly'; hour: number; weekday: number | null } | null => {
  if (r.triggerEvent !== 'schedule.cadence') return null;
  const get = (field: string) => (r.conditions as ConditionSet).conditions.find((x) => x.field === field && x.op === 'eq')?.value;
  const hour = Number(get('hour'));
  const weekday = get('weekday');
  return { cadence: weekday === undefined ? 'daily' : 'weekly', hour: Number.isFinite(hour) ? hour : 0, weekday: weekday === undefined ? null : Number(weekday) };
};

/** `schedule.cadence` needs `hour eq 0..23`; `weekday eq 1..7` (Monday = 1) makes it weekly, otherwise it is daily */
function validateCadence(c: ConditionSet) {
  const eq = (field: string) => c.conditions.filter((x) => x.field === field);
  const bad = (message: string) => new AppError('BAD_REQUEST', message, { details: { rule: 'cadence' } });
  const [h, ...moreH] = eq('hour');
  if (!h || moreH.length || h.op !== 'eq' || !Number.isInteger(h.value) || Number(h.value) < 0 || Number(h.value) > 23) throw bad('A scheduled rule needs one condition "hour eq <0-23>" (business time zone)');
  const [d, ...moreD] = eq('weekday');
  if (d && (moreD.length || d.op !== 'eq' || !Number.isInteger(d.value) || Number(d.value) < 1 || Number(d.value) > 7)) throw bad('"weekday eq <1-7>" (Monday = 1) makes a rule weekly; it may appear once');
}

export const toRuleDto = (r: RuleRow, stats: RuleStats = { runsCount: 0, lastRunAt: null }) => ({
  id: r.id, name: r.name, description: r.description, triggerEvent: r.triggerEvent, conditions: r.conditions, action: r.action, mode: r.mode as (typeof schema.AUTOMATION_MODES)[number], status: r.status as (typeof schema.AUTOMATION_RULE_STATUSES)[number], version: r.version, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  // additive fields in the vocabulary of the Automation screen
  triggerType: screenTrigger(r.triggerEvent), actionType: screenAction(r.action.type), requiresExplicitApproval: r.mode !== 'auto', runsCount: stats.runsCount, lastRunAt: stats.lastRunAt ? stats.lastRunAt.toISOString() : null, channelFilter: channelFilterOf(r.conditions as ConditionSet), schedule: scheduleOf(r),
});

/** runs = executions that were attempted (executed / failed / rolled back); skipped and rejected ones never ran */
export async function ruleStats(tx: Tx, vendorId: string, ruleIds: string[]): Promise<Map<string, RuleStats>> {
  const out = new Map<string, RuleStats>();
  if (ruleIds.length === 0) return out;
  const rows = await tx.select({ ruleId: EX.ruleId, n: sql<number>`count(*)::int`, last: sql<Date | null>`max(${EX.decidedAt})` }).from(EX)
    .where(and(eq(EX.vendorId, vendorId), inArray(EX.ruleId, ruleIds), inArray(EX.status, ['executed', 'failed', 'rolled_back']))).groupBy(EX.ruleId);
  for (const r of rows) out.set(r.ruleId, { runsCount: r.n, lastRunAt: r.last ? new Date(r.last) : null });
  return out;
}

/** a rule row with its run statistics */
export async function ruleDto(tx: Tx, vendorId: string, r: RuleRow) { return toRuleDto(r, (await ruleStats(tx, vendorId, [r.id])).get(r.id)); }

export const toExecutionDto = (e: ExecutionRow) => ({ id: e.id, ruleId: e.ruleId, eventId: e.eventId, eventType: e.eventType, status: e.status as (typeof schema.AUTOMATION_EXECUTION_STATUSES)[number], actionType: e.actionType, actionParams: e.actionParams, facts: e.facts, result: e.result, error: e.error, canRollback: e.status === 'executed' && Boolean(e.rollback), decidedBy: e.decidedBy, decidedAt: e.decidedAt ? e.decidedAt.toISOString() : null, executedAt: e.executedAt ? e.executedAt.toISOString() : null, createdAt: e.createdAt.toISOString() });

export async function getRule(tx: Tx, vendorId: string, id: string): Promise<RuleRow> {
  const [r] = await tx.select().from(RULE).where(and(eq(RULE.id, id), eq(RULE.vendorId, vendorId)));
  if (!r) throw Errors.notFound('Automation rule', id);
  return r;
}
export async function getExecution(tx: Tx, vendorId: string, id: string, lock = false): Promise<ExecutionRow> {
  const q = tx.select().from(EX).where(and(eq(EX.id, id), eq(EX.vendorId, vendorId)));
  const [e] = await (lock ? q.for('update') : q);
  if (!e) throw Errors.notFound('Execution', id);
  return e;
}
export async function listExecutions(tx: Tx, vendorId: string, q: { status?: string; ruleId?: string; limit: number }) {
  return (await tx.select().from(EX).where(and(eq(EX.vendorId, vendorId), q.status ? eq(EX.status, q.status) : undefined, q.ruleId ? eq(EX.ruleId, q.ruleId) : undefined)).orderBy(desc(EX.createdAt)).limit(q.limit)).map(toExecutionDto);
}

/** what WOULD happen for an event payload (nothing is changed) */
export function dryRun(rule: Pick<RuleRow, 'triggerEvent' | 'conditions' | 'action' | 'mode'>, payload: Record<string, unknown>) {
  const facts = factsOf({ type: rule.triggerEvent, payload });
  const matched = matches(rule.conditions as ConditionSet, facts);
  return { matched, facts, wouldDo: matched ? { action: rule.action.type, params: rule.action.params, needsApproval: rule.mode === 'approval' } : null };
}

// ------------------------------------------------------------------------------------------------
// running
// ------------------------------------------------------------------------------------------------
const MAX_PER_RULE_PER_HOUR = 120;

/** a domain event: every active rule that listens to it and matches runs (or waits for approval). At most once per (rule, event). */
export async function handleEvent(c: Container, e: DomainEventLike): Promise<number> {
  const vendorId = e.vendorId;
  if (!vendorId || !TRIGGERS[e.type]) return 0;
  const pendingRuns: string[] = [];
  await withVendor(c.database.db, vendorId, async (tx) => {
    if (!(await isFeatureEnabled(tx, 'automation.enabled', vendorId, true))) return;
    const rules = await tx.select().from(RULE).where(and(eq(RULE.vendorId, vendorId), eq(RULE.triggerEvent, e.type), eq(RULE.status, 'active')));
    if (rules.length === 0) return;
    const facts = factsOf({ type: e.type, payload: e.payload, aggregateId: e.aggregateId });
    for (const rule of rules) {
      if (!matches(rule.conditions as ConditionSet, facts)) continue;
      const [recent] = await tx.select({ n: sql<number>`count(*)::int` }).from(EX).where(and(eq(EX.ruleId, rule.id), sql`${EX.createdAt} > now() - interval '1 hour'`));
      const throttled = (recent?.n ?? 0) >= MAX_PER_RULE_PER_HOUR;
      const [row] = await tx.insert(EX).values({ vendorId, ruleId: rule.id, eventId: e.id, eventType: e.type, status: throttled ? 'skipped' : 'pending_approval', facts: facts as Record<string, unknown>, actionType: rule.action.type, actionParams: rule.action.params, error: throttled ? 'rate limit: too many executions of this rule in the last hour' : null }).onConflictDoNothing().returning();
      if (!row || throttled) continue;
      if (rule.mode === 'auto') pendingRuns.push(row.id);
      else await writeOutboxEvent(tx, { type: 'automation.approval_requested', vendorId, aggregateType: 'automation_execution', aggregateId: row.id, payload: { ruleId: rule.id, rule: rule.name, action: rule.action.type } });
    }
  });
  for (const id of pendingRuns) await executeExecution(c, vendorId, id, { type: 'system', id: 'automation' }).catch((err) => c.logger.warn({ executionId: id, err: (err as Error).message }, 'automation run failed'));
  return pendingRuns.length;
}

/** runs a pending execution (auto rules at once; approval rules when a person approves). Marketplace pushes dispatch after commit. */
export async function executeExecution(c: Container, vendorId: string, id: string, by: { type: 'user' | 'system'; id: string | null }) {
  const work = new Work();
  const after: Array<() => Promise<unknown>> = [];
  const out = await withVendor(c.database.db, vendorId, async (tx) => {
    const ex = await getExecution(tx, vendorId, id, true);
    if (ex.status !== 'pending_approval') throw new AppError('INVALID_STATE', `This execution is ${ex.status}`, { details: { status: ex.status } });
    const def = ACTIONS[ex.actionType];
    let status: ExecutionRow['status'] = 'executed';
    let result: Record<string, unknown> | null = null;
    let rollback: Record<string, unknown> | null = null;
    let error: string | null = null;
    const started = Date.now();
    try {
      if (!def) throw new AppError('BAD_REQUEST', 'Unknown action type');
      const r = await tx.transaction((sp) => def.run({ c, tx: sp, vendorId, facts: ex.facts as Facts, event: { id: ex.eventId, type: ex.eventType, aggregateId: String((ex.facts as { aggregateId?: string }).aggregateId ?? '') }, work, ruleId: ex.ruleId, after }, def.schema.parse(ex.actionParams)));
      result = { ...r.result, durationMs: Date.now() - started }; rollback = r.rollback ?? null;
    } catch (e) { status = 'failed'; error = (e instanceof Error ? e.message : 'failed').slice(0, 300); }
    const [row] = await tx.update(EX).set({ status, result, rollback, error, decidedBy: by.id, decidedAt: new Date(), executedAt: status === 'executed' ? new Date() : null }).where(eq(EX.id, id)).returning();
    await writeAudit(tx, { vendorId, actorType: by.type, actorId: by.id, action: status === 'executed' ? 'automation.executed' : 'automation.failed', resourceType: 'automation_execution', resourceId: id, after: { rule: ex.ruleId, action: ex.actionType, result, error } });
    await writeOutboxEvent(tx, { type: 'automation.rule_fired', vendorId, aggregateType: 'automation_execution', aggregateId: id, payload: { ruleId: ex.ruleId, action: ex.actionType, status } });
    return toExecutionDto(row!);
  });
  await work.flush(c);
  for (const f of after) await f().catch((err) => c.logger.warn({ err: (err as Error).message }, 'automation follow-up failed'));
  return out;
}

export async function rejectExecution(tx: Tx, vendorId: string, id: string, by: { id: string | null }, note?: string | null, kind: 'reject' | 'dismiss' = 'reject') {
  const ex = await getExecution(tx, vendorId, id, true);
  if (ex.status !== 'pending_approval') throw new AppError('INVALID_STATE', `This execution is ${ex.status}`, { details: { status: ex.status } });
  const [after] = await tx.update(EX).set({ status: 'rejected', decidedBy: by.id, decidedAt: new Date(), error: note ?? null }).where(eq(EX.id, id)).returning();
  await writeAudit(tx, { vendorId, actorType: 'user', actorId: by.id, action: kind === 'dismiss' ? 'automation.dismissed' : 'automation.rejected', resourceType: 'automation_execution', resourceId: id, metadata: { note: note ?? null } });
  return toExecutionDto(after!);
}

export async function rollbackExecution(c: Container, vendorId: string, id: string, by: { id: string | null }) {
  const work = new Work();
  const out = await withVendor(c.database.db, vendorId, async (tx) => {
    const ex = await getExecution(tx, vendorId, id, true);
    const def = ACTIONS[ex.actionType];
    if (ex.status !== 'executed' || !ex.rollback || !def?.undo) throw new AppError('INVALID_STATE', 'Only an executed, reversible action can be rolled back', { details: { status: ex.status, reversible: Boolean(def?.undo) } });
    await def.undo({ c, tx, vendorId }, ex.rollback, work);
    const [after] = await tx.update(EX).set({ status: 'rolled_back' }).where(eq(EX.id, id)).returning();
    await writeAudit(tx, { vendorId, actorType: 'user', actorId: by.id, action: 'automation.rolled_back', resourceType: 'automation_execution', resourceId: id, after: { restored: ex.rollback } });
    return toExecutionDto(after!);
  });
  await work.flush(c);
  return out;
}
