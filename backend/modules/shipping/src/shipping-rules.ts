import { and, eq, inArray, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { RULE_TYPE_SPECS, createRule, deleteRule, getRule, listRules, matches, updateRule, validateRule, type ConditionSet, type RuleRow } from '@oms/mod-rules';
import { effects, type OpCtx } from '@oms/module-kit';
import { loadOrderInfo } from './decision';
import { decisionKind, methodName, type MethodKind } from './methods';

export const DESTINATION_ZONES = ['local', 'regional', 'national'] as const;

/**
 * Shipping rules (IF / AND / THEN): a thin, validated layer over the generic rules engine (type `shipping`).
 * Priority is a RANK here (1 = evaluated first); it is stored as a descending number so the generic engine orders it correctly.
 */
const R = schema.businessRules;
export const MAX_SHIPPING_RULES = 100;
const RANK_BASE = 1000;
/** the operators the shipping rule editor offers: equals / not equals / contains / greater / less / one of */
export const SHIPPING_OPS = ['eq', 'ne', 'contains', 'gt', 'gte', 'lt', 'lte', 'in'] as const;
export type ShippingOp = (typeof SHIPPING_OPS)[number];
export const SHIPPING_FIELDS = Object.keys(RULE_TYPE_SPECS.shipping.fields);

export interface ShippingRuleInput { name: string; description?: string | null; enabled?: boolean; conditions: Array<{ field: string; op: ShippingOp; value: unknown }>; then: { prefer: { kind: MethodKind; providerId?: string | null } } }

const rank = (rows: RuleRow[]): Map<string, number> => new Map(rows.map((r, i) => [r.id, i + 1]));

async function shippingRules(tx: Tx, vendorId: string): Promise<RuleRow[]> {
  return listRules(tx, vendorId, { type: 'shipping' });
}

/** a new rule is evaluated last: one below the lowest existing priority */
const nextPriority = (rows: RuleRow[]): number => (rows.length ? Math.min(...rows.map((r) => r.priority)) - 1 : RANK_BASE - 1);

async function renumber(tx: Tx, vendorId: string, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) await tx.update(R).set({ priority: RANK_BASE - i - 1 }).where(and(eq(R.vendorId, vendorId), eq(R.id, orderedIds[i]!)));
}

async function validateInput(tx: Tx, vendorId: string, input: Pick<ShippingRuleInput, 'conditions' | 'then'>): Promise<{ conditions: ConditionSet; action: { type: string; params: Record<string, unknown> } }> {
  const issues: Array<{ path: string; message: string }> = [];
  if (input.conditions.length === 0) issues.push({ path: 'conditions', message: 'a shipping rule needs at least one condition' });
  input.conditions.forEach((c, i) => {
    if (!SHIPPING_FIELDS.includes(c.field)) issues.push({ path: `conditions[${i}].field`, message: `unknown field "${c.field}" (allowed: ${SHIPPING_FIELDS.join(', ')})` });
    if (!(SHIPPING_OPS as readonly string[]).includes(c.op)) issues.push({ path: `conditions[${i}].op`, message: `operator "${c.op}" is not offered for shipping rules (allowed: ${SHIPPING_OPS.join(', ')})` });
    if (c.field === 'destinationZone') {
      const values = Array.isArray(c.value) ? c.value : [c.value];
      if (c.op === 'contains' || c.op === 'gt' || c.op === 'gte' || c.op === 'lt' || c.op === 'lte' || values.some((v) => !(DESTINATION_ZONES as readonly unknown[]).includes(v))) issues.push({ path: `conditions[${i}].value`, message: `destinationZone is ${DESTINATION_ZONES.join(', ')} and is compared with equals / not equals / one of` });
    }
  });
  const conditions: ConditionSet = { combinator: 'all', conditions: input.conditions.map((c) => ({ field: c.field, op: c.op, value: c.value })) };
  const prefer = input.then.prefer;
  const action = { type: 'prefer_shipping_method', params: { kind: prefer.kind, ...(prefer.providerId ? { providerId: prefer.providerId } : {}) } };
  if (issues.length === 0) issues.push(...validateRule('shipping', conditions, action)); // value types: a real number / text, in-lists, parameters
  if (prefer.providerId) {
    const [m] = await tx.select({ kind: schema.vendorShippingProviders.kind }).from(schema.vendorShippingProviders).where(and(eq(schema.vendorShippingProviders.vendorId, vendorId), eq(schema.vendorShippingProviders.id, prefer.providerId)));
    if (!m || decisionKind(m.kind) !== prefer.kind) issues.push({ path: 'then.prefer.providerId', message: 'not a shipping method of this kind in your account' });
  }
  if (issues.length) throw Errors.validation({ issues });
  return { conditions, action };
}

// ------------------------------------------------------------------------------------------------
// ordersAffected: how many open orders match the rule right now (a dry run; cached 5 minutes per rule set)
// ------------------------------------------------------------------------------------------------
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; key: string; counts: Map<string, number> }>();
const OPEN = ['confirmed', 'picking', 'picked', 'packing', 'packed', 'ready_to_ship', 'on_hold'] as const;

export const invalidateAffected = (vendorId: string): void => { cache.delete(vendorId); };

async function affectedCounts(tx: Tx, vendorId: string, rows: RuleRow[]): Promise<Map<string, number>> {
  const key = rows.map((r) => `${r.id}:${r.version}`).join(',');
  const hit = cache.get(vendorId);
  if (hit && hit.key === key && Date.now() - hit.at < CACHE_MS) return hit.counts;
  const open = await tx.select({ id: schema.fulfillments.id }).from(schema.fulfillments).where(and(eq(schema.fulfillments.vendorId, vendorId), inArray(schema.fulfillments.status, [...OPEN]))).orderBy(sql`${schema.fulfillments.createdAt} DESC`).limit(500); // bounded
  const infos = await loadOrderInfo(tx, vendorId, open.map((o) => o.id));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.id, [...infos.values()].filter((i) => matches(r.conditions as ConditionSet, i.facts)).length);
  cache.set(vendorId, { at: Date.now(), key, counts });
  return counts;
}

// ------------------------------------------------------------------------------------------------
// DTO + reads
// ------------------------------------------------------------------------------------------------
type Ctx = Pick<OpCtx, 'c'>;
export function toShippingRuleDto(ctx: Ctx, r: RuleRow, position: number, affected: number | null, methods: Array<typeof schema.vendorShippingProviders.$inferSelect>) {
  const conds = (r.conditions as ConditionSet).conditions;
  const p = (r.action.params ?? {}) as { kind?: MethodKind; providerId?: string };
  const m = p.providerId ? methods.find((x) => x.id === p.providerId) : undefined;
  const kind = (p.kind ?? 'seller') as MethodKind;
  const label = m ? methodName(ctx.c, m) : kind === 'marketplace' ? 'Marketplace shipping' : kind === 'seller' ? 'Seller Shipping' : 'Third-party provider';
  return {
    id: r.id, name: r.name, description: r.description, status: (r.status === 'active' ? 'enabled' : 'disabled') as 'enabled' | 'disabled', priority: position,
    lastUpdatedAt: r.updatedAt.toISOString(), ordersAffected: affected,
    conditions: conds.map((c, i) => ({ combinator: (i === 0 ? 'if' : 'and') as 'if' | 'and', field: c.field, op: c.op, value: c.value ?? null })),
    then: { prefer: { kind, providerId: p.providerId ?? null, label } }, version: r.version,
  };
}

async function methodsOf(tx: Tx, vendorId: string) { return tx.select().from(schema.vendorShippingProviders).where(eq(schema.vendorShippingProviders.vendorId, vendorId)); }

export async function listShippingRules(tx: Tx, ctx: Ctx, vendorId: string) {
  const rows = await shippingRules(tx, vendorId);
  const [methods, counts] = await Promise.all([methodsOf(tx, vendorId), affectedCounts(tx, vendorId, rows)]);
  const pos = rank(rows);
  return { items: rows.map((r) => toShippingRuleDto(ctx, r, pos.get(r.id)!, counts.get(r.id) ?? 0, methods)), total: rows.length, max: MAX_SHIPPING_RULES, fields: SHIPPING_FIELDS, operators: [...SHIPPING_OPS] };
}

async function one(tx: Tx, ctx: Ctx, vendorId: string, id: string) {
  const rows = await shippingRules(tx, vendorId);
  const row = rows.find((r) => r.id === id);
  if (!row) throw Errors.notFound('Shipping rule', id);
  const [methods, counts] = await Promise.all([methodsOf(tx, vendorId), affectedCounts(tx, vendorId, rows)]);
  return toShippingRuleDto(ctx, row, rank(rows).get(id)!, counts.get(id) ?? 0, methods);
}

// ------------------------------------------------------------------------------------------------
// writes
// ------------------------------------------------------------------------------------------------
async function assertRoom(tx: Tx, vendorId: string): Promise<RuleRow[]> {
  const rows = await shippingRules(tx, vendorId);
  if (rows.length >= MAX_SHIPPING_RULES) throw new AppError('CONFLICT', `At most ${MAX_SHIPPING_RULES} shipping rules are allowed`, { details: { rule: 'max_rules', max: MAX_SHIPPING_RULES } });
  return rows;
}

export async function createShippingRule(tx: Tx, ctx: OpCtx, input: ShippingRuleInput) {
  const existing = await assertRoom(tx, ctx.vendorId);
  const v = await validateInput(tx, ctx.vendorId, input);
  const row = await createRule(tx, ctx.vendorId, ctx.actor.id, { type: 'shipping', name: input.name, description: input.description ?? null, status: input.enabled === false ? 'disabled' : 'active', priority: nextPriority(existing), conditions: v.conditions, action: v.action });
  const fx = effects(tx, ctx);
  await fx.audit({ action: 'shipping.rule_created', resourceType: 'rule', resourceId: row.id, after: { name: row.name, status: row.status, action: row.action } });
  await fx.event({ type: 'rule.created', aggregateType: 'rule', aggregateId: row.id, payload: { ruleType: 'shipping' } });
  invalidateAffected(ctx.vendorId);
  return one(tx, ctx, ctx.vendorId, row.id);
}

export async function patchShippingRule(tx: Tx, ctx: OpCtx, id: string, patch: Partial<ShippingRuleInput>) {
  const current = await getRule(tx, ctx.vendorId, id);
  if (current.type !== 'shipping') throw Errors.notFound('Shipping rule', id);
  const cs = (current.conditions as ConditionSet).conditions;
  const cp = current.action.params as { kind: MethodKind; providerId?: string };
  const merged = { conditions: patch.conditions ?? cs.map((c) => ({ field: c.field, op: c.op as ShippingOp, value: c.value })), then: patch.then ?? { prefer: { kind: cp.kind, providerId: cp.providerId ?? null } } };
  const v = (patch.conditions || patch.then) ? await validateInput(tx, ctx.vendorId, merged) : null;
  const { before, after } = await updateRule(tx, ctx.vendorId, id, {
    ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.enabled !== undefined ? { status: patch.enabled ? 'active' as const : 'disabled' as const } : {}), ...(v ? { conditions: v.conditions, action: v.action } : {}),
  });
  const fx = effects(tx, ctx);
  await fx.audit({ action: 'shipping.rule_updated', resourceType: 'rule', resourceId: id, before: { status: before.status, conditions: before.conditions, action: before.action }, after: { status: after.status, conditions: after.conditions, action: after.action } });
  await fx.event({ type: 'rule.updated', aggregateType: 'rule', aggregateId: id, payload: { ruleType: 'shipping' } });
  invalidateAffected(ctx.vendorId);
  return one(tx, ctx, ctx.vendorId, id);
}

export async function duplicateShippingRule(tx: Tx, ctx: OpCtx, id: string) {
  const existing = await assertRoom(tx, ctx.vendorId);
  const src = existing.find((r) => r.id === id);
  if (!src) throw Errors.notFound('Shipping rule', id);
  const row = await createRule(tx, ctx.vendorId, ctx.actor.id, { type: 'shipping', name: `${src.name} (copy)`.slice(0, 120), description: src.description, status: 'disabled', priority: nextPriority(existing), conditions: src.conditions as ConditionSet, action: src.action });
  await effects(tx, ctx).audit({ action: 'shipping.rule_duplicated', resourceType: 'rule', resourceId: row.id, after: { from: id } });
  invalidateAffected(ctx.vendorId);
  return one(tx, ctx, ctx.vendorId, row.id);
}

export async function removeShippingRule(tx: Tx, ctx: OpCtx, id: string) {
  const r = await getRule(tx, ctx.vendorId, id);
  if (r.type !== 'shipping') throw Errors.notFound('Shipping rule', id);
  await deleteRule(tx, ctx.vendorId, id);
  await renumber(tx, ctx.vendorId, (await shippingRules(tx, ctx.vendorId)).map((x) => x.id));
  const fx = effects(tx, ctx);
  await fx.audit({ action: 'shipping.rule_deleted', resourceType: 'rule', resourceId: id, before: { name: r.name } });
  await fx.event({ type: 'rule.deleted', aggregateType: 'rule', aggregateId: id, payload: { ruleType: 'shipping' } });
  invalidateAffected(ctx.vendorId);
}

export async function reorderShippingRules(tx: Tx, ctx: OpCtx, ids: string[]) {
  const rows = await shippingRules(tx, ctx.vendorId);
  const have = new Set(rows.map((r) => r.id));
  const unique = new Set(ids);
  const issues: Array<{ path: string; message: string }> = [];
  if (unique.size !== ids.length) issues.push({ path: 'ids', message: 'duplicate ids' });
  for (const id of ids) if (!have.has(id)) issues.push({ path: 'ids', message: `${id} is not a shipping rule of your account` });
  for (const id of have) if (!unique.has(id)) issues.push({ path: 'ids', message: `${id} is missing: send every shipping rule exactly once` });
  if (issues.length) throw Errors.validation({ issues });
  await renumber(tx, ctx.vendorId, ids);
  await effects(tx, ctx).audit({ action: 'shipping.rules_reordered', resourceType: 'rule', resourceId: ids[0] ?? 'none', after: { order: ids } });
  invalidateAffected(ctx.vendorId);
  return listShippingRules(tx, ctx, ctx.vendorId);
}
