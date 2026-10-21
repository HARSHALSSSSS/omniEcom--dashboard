import { and, asc, eq, schema, sql, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { effects, type OpCtx } from '@oms/module-kit';

const POL = schema.pricingPolicies;
const A = schema.marketplaceAccounts;
const L = schema.marketplaceListings;
export type PolicyRow = typeof POL.$inferSelect;
type Strategy = (typeof schema.PRICING_STRATEGIES)[number];

export interface PolicyInput {
  name: string; accountId?: string | null; strategy: Strategy; targetMarginMinBps: number; maxDiscountBps: number; autoApproveUnderBps: number;
  params: Record<string, unknown>; status: 'active' | 'paused';
}

/** per-strategy rules that the schema cannot express */
export function assertPolicyRules(p: Pick<PolicyInput, 'strategy' | 'targetMarginMinBps' | 'params'>): void {
  if (p.strategy === 'margin_floor' && p.targetMarginMinBps <= 0) throw new AppError('BAD_REQUEST', 'A margin floor policy needs a minimum margin above 0', { details: { rule: 'margin_floor_needs_target' } });
  if (p.strategy === 'custom' && typeof p.params.targetMarginBps !== 'number') throw new AppError('BAD_REQUEST', 'A custom policy needs params.targetMarginBps', { details: { rule: 'custom_needs_target_margin' } });
}

/** how many variants the policy would look at: variants with an active listing on its account (every active account when it has none) */
export async function affectedVariants(tx: Tx, vendorId: string, accountId: string | null): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(distinct ${L.variantId})::int` }).from(L).innerJoin(A, and(eq(A.id, L.marketplaceAccountId), eq(A.vendorId, L.vendorId)))
    .where(and(eq(L.vendorId, vendorId), eq(L.status, 'active'), eq(A.status, 'active'), accountId ? eq(L.marketplaceAccountId, accountId) : undefined));
  return r?.n ?? 0;
}

export async function toPolicyDto(tx: Tx, vendorId: string, p: PolicyRow, accountName: string | null) {
  return {
    id: p.id, name: p.name, accountId: p.accountId, channel: accountName ?? 'All connected channels', strategy: p.strategy as Strategy,
    targetMarginMinBps: p.targetMarginMinBps, maxDiscountBps: p.maxDiscountBps, autoApproveUnderBps: p.autoApproveUnderBps, params: p.params,
    status: p.status as 'active' | 'paused', affectedVariants: await affectedVariants(tx, vendorId, p.accountId), version: p.version, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
  };
}

async function accountName(tx: Tx, vendorId: string, accountId: string | null | undefined): Promise<string | null> {
  if (!accountId) return null;
  const [a] = await tx.select({ n: A.displayName }).from(A).where(and(eq(A.id, accountId), eq(A.vendorId, vendorId)));
  if (!a) throw Errors.notFound('Marketplace account', accountId);
  return a.n;
}

export async function getPolicyDto(tx: Tx, vendorId: string, id: string) {
  const p = await getPolicy(tx, vendorId, id);
  return toPolicyDto(tx, vendorId, p, await accountName(tx, vendorId, p.accountId));
}

export async function listPolicies(tx: Tx, vendorId: string, f: { status?: 'active' | 'paused'; accountId?: string }) {
  const rows = await tx.select({ p: POL, account: A.displayName }).from(POL).leftJoin(A, and(eq(A.id, POL.accountId), eq(A.vendorId, POL.vendorId)))
    .where(and(eq(POL.vendorId, vendorId), f.status ? eq(POL.status, f.status) : undefined, f.accountId ? eq(POL.accountId, f.accountId) : undefined)).orderBy(asc(POL.createdAt), asc(POL.id));
  return Promise.all(rows.map((r) => toPolicyDto(tx, vendorId, r.p, r.account)));
}

export async function getPolicy(tx: Tx, vendorId: string, id: string, lock = false): Promise<PolicyRow> {
  const q = tx.select().from(POL).where(and(eq(POL.id, id), eq(POL.vendorId, vendorId)));
  const [row] = lock ? await q.for('update') : await q;
  if (!row) throw Errors.notFound('Pricing policy', id);
  return row;
}

export async function createPolicy(tx: Tx, ctx: OpCtx, input: PolicyInput) {
  assertPolicyRules(input);
  const name = await accountName(tx, ctx.vendorId, input.accountId);
  const [row] = await tx.insert(POL).values({ vendorId: ctx.vendorId, ...input, accountId: input.accountId ?? null, name: input.name.trim() }).returning();
  await effects(tx, ctx).audit({ action: 'pricing.policy_created', resourceType: 'pricing_policy', resourceId: row!.id, after: input });
  return toPolicyDto(tx, ctx.vendorId, row!, name);
}

export async function updatePolicy(tx: Tx, ctx: OpCtx, id: string, patch: Partial<PolicyInput>, version?: number) {
  const cur = await getPolicy(tx, ctx.vendorId, id, true);
  if (version !== undefined && version !== cur.version) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: cur.version } });
  const next = { ...cur, ...patch, name: patch.name?.trim() ?? cur.name } as PolicyRow;
  assertPolicyRules({ strategy: next.strategy as Strategy, targetMarginMinBps: next.targetMarginMinBps, params: next.params });
  const name = await accountName(tx, ctx.vendorId, next.accountId);
  const [row] = await tx.update(POL).set({
    name: next.name, accountId: next.accountId, strategy: next.strategy, targetMarginMinBps: next.targetMarginMinBps, maxDiscountBps: next.maxDiscountBps,
    autoApproveUnderBps: next.autoApproveUnderBps, params: next.params, status: next.status, version: sql`${POL.version} + 1`,
  }).where(eq(POL.id, id)).returning();
  await effects(tx, ctx).audit({ action: 'pricing.policy_updated', resourceType: 'pricing_policy', resourceId: id, before: { name: cur.name, strategy: cur.strategy, status: cur.status, accountId: cur.accountId }, after: patch });
  return toPolicyDto(tx, ctx.vendorId, row!, name);
}

export async function deletePolicy(tx: Tx, ctx: OpCtx, id: string): Promise<void> {
  const cur = await getPolicy(tx, ctx.vendorId, id, true);
  await tx.delete(POL).where(eq(POL.id, id));
  await effects(tx, ctx).audit({ action: 'pricing.policy_deleted', resourceType: 'pricing_policy', resourceId: id, before: { name: cur.name, strategy: cur.strategy } });
}
