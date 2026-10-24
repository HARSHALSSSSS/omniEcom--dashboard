import { and, count, desc, eq, inArray, schema, sql, type Tx } from '@oms/database';
import type { Facts } from '@oms/mod-rules';
import { draftPoQuantity, proposedChannelPrice } from './actions';
import type { ExecutionRow } from './engine';
import { render } from './kit';
import { screenAction, screenTrigger } from './triggers';

const EX = schema.automationExecutions;
const RULE = schema.automationRules;
const DAY_MS = 86_400_000;

export const RUN_STATUS_GROUPS = {
  success: ['executed', 'rolled_back'],
  awaiting_approval: ['pending_approval'],
  failed: ['failed', 'skipped', 'rejected'],
} as const;
export type RunStatus = keyof typeof RUN_STATUS_GROUPS;
export const runStatusOf = (s: string): RunStatus => (s === 'pending_approval' ? 'awaiting_approval' : (RUN_STATUS_GROUPS.success as readonly string[]).includes(s) ? 'success' : 'failed');

const money = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ------------------------------------------------------------------------------------------------
// overview: the metrics strip
// ------------------------------------------------------------------------------------------------
export async function overview(tx: Tx, vendorId: string, now = new Date()) {
  const since = new Date(now.getTime() - DAY_MS);
  const [rules] = await tx.select({ total: count(), active: sql<number>`count(*) filter (where ${RULE.status} = 'active')::int` }).from(RULE).where(eq(RULE.vendorId, vendorId));
  const [pending] = await tx.select({ n: count() }).from(EX).where(and(eq(EX.vendorId, vendorId), eq(EX.status, 'pending_approval')));
  const [day] = await tx.select({
    runs: count(),
    ok: sql<number>`count(*) filter (where ${EX.status} in ('executed','rolled_back'))::int`,
    failed: sql<number>`count(*) filter (where ${EX.status} = 'failed')::int`,
  }).from(EX).where(and(eq(EX.vendorId, vendorId), sql`${EX.createdAt} >= ${since}`, sql`${EX.status} <> 'skipped'`));
  const [last] = await tx.select({ e: EX, ruleName: RULE.name }).from(EX).innerJoin(RULE, eq(RULE.id, EX.ruleId)).where(and(eq(EX.vendorId, vendorId), inArray(EX.status, ['executed', 'failed', 'rolled_back']))).orderBy(desc(EX.decidedAt)).limit(1);
  const decided = (day?.ok ?? 0) + (day?.failed ?? 0);
  return {
    activeRules: rules?.active ?? 0, totalRules: rules?.total ?? 0, pendingApprovals: pending?.n ?? 0, runs24h: day?.runs ?? 0,
    successRate: decided === 0 ? null : Math.round(((day?.ok ?? 0) * 1000) / decided) / 10, // percent of the attempted runs of the last 24 hours; null while nothing ran
    lastRunAt: last?.e.decidedAt ? last.e.decidedAt.toISOString() : null, lastRunRule: last?.ruleName ?? null,
  };
}

// ------------------------------------------------------------------------------------------------
// human fields built from the structured facts of an execution
// ------------------------------------------------------------------------------------------------
interface Variant { sku: string; title: string; costMinor: number | null }

async function variantsOf(tx: Tx, vendorId: string, rows: Array<{ facts: unknown }>): Promise<Map<string, Variant>> {
  const ids = [...new Set(rows.map((r) => (r.facts as Facts).variantId).filter((v): v is string => typeof v === 'string'))];
  const out = new Map<string, Variant>();
  if (ids.length === 0) return out;
  const V = schema.productVariants;
  for (const r of await tx.select({ id: V.id, sku: V.sku, title: schema.products.title, cost: V.costPriceMinor }).from(V).innerJoin(schema.products, and(eq(schema.products.id, V.productId), eq(schema.products.vendorId, V.vendorId))).where(and(eq(V.vendorId, vendorId), inArray(V.id, ids)))) out.set(r.id, { sku: r.sku, title: r.title, costMinor: r.cost });
  return out;
}

interface Human { entityName: string; skuOrOrder: string; recommendedAction: string; financialImpact: number | null }

/** what the run is about and what it would do (or did), in words; money in minor units or null when it cannot be known */
export function humanize(ex: Pick<ExecutionRow, 'actionType' | 'actionParams' | 'facts' | 'eventType'>, variants: Map<string, Variant>): Human {
  const f = ex.facts as Facts;
  const p = ex.actionParams as Record<string, unknown>;
  const v = typeof f.variantId === 'string' ? variants.get(f.variantId) : undefined;
  const sku = v?.sku ?? (typeof f.sku === 'string' ? f.sku : '');
  const order = typeof f.orderNumber === 'string' ? f.orderNumber : '';
  const entityName = order ? `Order ${order}` : v?.title ?? (sku || ex.eventType);
  const skuOrOrder = order || sku;
  const what = skuOrOrder || 'this item';
  switch (ex.actionType) {
    case 'draft_purchase_order': {
      const qty = draftPoQuantity(p, f);
      const unit = num(p.unitCostMinor) ?? v?.costMinor ?? null;
      return { entityName, skuOrOrder, recommendedAction: `Draft a purchase order for ${qty} unit(s) of ${what} (available ${String(f.available ?? '?')}, reorder level ${String(f.reorderLevel ?? '?')})`, financialImpact: unit === null ? null : unit * qty };
    }
    case 'adjust_channel_price': {
      const proposed = proposedChannelPrice(p, f);
      const ours = num(f.ourPriceMinor);
      const comp = num(f.competitorPriceMinor);
      return { entityName, skuOrOrder, recommendedAction: proposed === null ? `Propose a new price for ${what}` : `Propose ${money(proposed)} for ${what}${ours === null ? '' : ` (now ${money(ours)})`}${comp === null ? '' : `, competitor at ${money(comp)}`}`, financialImpact: proposed !== null && ours !== null ? proposed - ours : null };
    }
    case 'snooze_listing': return { entityName, skuOrOrder, recommendedAction: `Snooze the listing of ${what} for ${String(p.days ?? 7)} day(s)`, financialImpact: null };
    case 'start_fulfillment': return { entityName, skuOrOrder, recommendedAction: `Start fulfillment of ${what}`, financialImpact: num(f.totalMinor) };
    case 'retry_sync_job': return { entityName: `${String(f.type ?? 'Sync')} sync job`, skuOrOrder, recommendedAction: `Retry the failed ${String(f.type ?? '')} sync job`.replace('  ', ' '), financialImpact: null };
    case 'set_reorder_level': return { entityName, skuOrOrder, recommendedAction: `Set the reorder level of ${what} to ${String(p.level ?? '?')}`, financialImpact: null };
    case 'notify': return { entityName, skuOrOrder, recommendedAction: `Notify the team: ${render(String(p.title ?? ''), f)}`, financialImpact: null };
    case 'create_recommendation': return { entityName, skuOrOrder, recommendedAction: `Create a recommendation: ${render(String(p.title ?? ''), f)}`, financialImpact: null };
    default: return { entityName, skuOrOrder, recommendedAction: ex.actionType.replace(/_/g, ' '), financialImpact: null };
  }
}

/** one line for the run log, from what the run did */
function summaryOf(e: ExecutionRow, h: Human): string {
  const r = (e.result ?? {}) as Record<string, unknown>;
  switch (e.status) {
    case 'pending_approval': return `Waiting for approval: ${h.recommendedAction}`;
    case 'failed': return `Failed: ${e.error ?? 'unknown error'}`;
    case 'skipped': return `Skipped: ${e.error ?? 'throttled'}`;
    case 'rejected': return `Dismissed${e.error ? `: ${e.error}` : ''} (${h.recommendedAction})`;
    default: break;
  }
  const done = e.status === 'rolled_back' ? ' (rolled back)' : '';
  switch (e.actionType) {
    case 'draft_purchase_order': return `Drafted ${String(r.poNumber ?? 'a purchase order')} for ${String(r.quantity ?? '')} unit(s) of ${h.skuOrOrder || 'the item'}${done}`;
    case 'adjust_channel_price': return `Created a price proposal of ${typeof r.proposedPriceMinor === 'number' ? money(r.proposedPriceMinor) : ''} for ${h.skuOrOrder || 'the item'}${done}`;
    case 'snooze_listing': return `Recommended snoozing the listing of ${h.skuOrOrder || 'the item'} for ${String(r.days ?? '')} day(s)${done}`;
    case 'notify': return `Notified the team: ${String(r.title ?? '')}${done}`;
    default: return `${h.recommendedAction}${done}`;
  }
}

// ------------------------------------------------------------------------------------------------
// approvals queue and run log
// ------------------------------------------------------------------------------------------------
export async function listApprovals(tx: Tx, vendorId: string, page: { limit: number; offset: number }) {
  const where = and(eq(EX.vendorId, vendorId), eq(EX.status, 'pending_approval'));
  const [rows, [total]] = await Promise.all([
    tx.select({ e: EX, ruleName: RULE.name, ruleMode: RULE.mode }).from(EX).innerJoin(RULE, eq(RULE.id, EX.ruleId)).where(where).orderBy(desc(EX.createdAt), desc(EX.id)).limit(page.limit).offset(page.offset),
    tx.select({ n: count() }).from(EX).where(where),
  ]);
  const variants = await variantsOf(tx, vendorId, rows.map((r) => r.e));
  const items = rows.map(({ e, ruleName }) => {
    const h = humanize(e, variants);
    return {
      id: e.id, ruleId: e.ruleId, ruleName, triggerEvent: e.eventType, triggerType: screenTrigger(e.eventType), actionType: screenAction(e.actionType),
      entityName: h.entityName, skuOrOrder: h.skuOrOrder, proposedAction: h.recommendedAction, recommendedAction: h.recommendedAction,
      financialImpact: h.financialImpact, currency: 'INR', timestamp: e.createdAt.toISOString(), status: 'pending' as const, facts: e.facts as Record<string, unknown>,
    };
  });
  return { items, total: total?.n ?? 0 };
}

export async function listRuns(tx: Tx, vendorId: string, q: { status?: RunStatus; ruleId?: string; limit: number; offset: number }) {
  const where = and(eq(EX.vendorId, vendorId), q.status ? inArray(EX.status, [...RUN_STATUS_GROUPS[q.status]]) : undefined, q.ruleId ? eq(EX.ruleId, q.ruleId) : undefined);
  const [rows, [total]] = await Promise.all([
    tx.select({ e: EX, ruleName: RULE.name }).from(EX).innerJoin(RULE, eq(RULE.id, EX.ruleId)).where(where).orderBy(desc(EX.createdAt), desc(EX.id)).limit(q.limit).offset(q.offset),
    tx.select({ n: count() }).from(EX).where(where),
  ]);
  const variants = await variantsOf(tx, vendorId, rows.map((r) => r.e));
  const items = rows.map(({ e, ruleName }) => {
    const h = humanize(e, variants);
    return {
      id: e.id, ruleId: e.ruleId, ruleName, executionStatus: runStatusOf(e.status), status: e.status as (typeof schema.AUTOMATION_EXECUTION_STATUSES)[number], triggeredAt: e.createdAt.toISOString(), timestamp: e.createdAt.toISOString(),
      summary: summaryOf(e, h), durationMs: typeof (e.result as { durationMs?: unknown } | null)?.durationMs === 'number' ? Number((e.result as { durationMs: number }).durationMs) : 0,
      entityName: h.entityName, skuOrOrder: h.skuOrOrder,
    };
  });
  return { items, total: total?.n ?? 0 };
}
