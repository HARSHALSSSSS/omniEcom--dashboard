import { and, asc, desc, eq, inArray, lt, schema, sql, withSystem, writeAudit, writeOutboxEvent, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { effects, type Container, type OpCtx } from '@oms/module-kit';
import { loadSubjects, pairKey, type SubjectRow } from './proposal-context';
import { loadCostFacts, policyTargetBps, priceFacts, proposalReason } from './margins';
import { feeAmount, marginBps, marginDeltaBps, NO_FEES, projectedSalesDeltaBps } from './proposal-domain';
import { SyncWork, setMarketplacePrice } from './service';

const PP = schema.pricingProposals;
const POL = schema.pricingPolicies;
const V = schema.productVariants;
const P = schema.products;
const A = schema.marketplaceAccounts;
type Status = (typeof schema.PRICE_PROPOSAL_STATUSES)[number];
type Strategy = (typeof schema.PRICING_STRATEGIES)[number];
export type ProposalRow = typeof PP.$inferSelect;

export const DEFAULT_EXPIRY_DAYS = 7;
const isUuid = (s: string | null | undefined): s is string => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// ------------------------------------------------------------------------------------------------
// read model
// ------------------------------------------------------------------------------------------------
export interface ProposalView {
  p: ProposalRow; sku: string; title: string; accountName: string; marketplace: string; policyName: string | null; decidedByName: string | null;
  policyTargetMarginMinBps: number | null; policyParams: Record<string, unknown> | null;
}
type CostFacts = Awaited<ReturnType<typeof loadCostFacts>>;

export function toProposalDto(v: ProposalView, facts: CostFacts) {
  const { p } = v;
  const cost = facts.costOf(p.variantId);
  const fees = facts.feesOf(p.accountId);
  const now = priceFacts(p.currentPriceMinor, cost, fees);
  const proposedMarginBps = marginBps(p.proposedPriceMinor, cost, fees ?? NO_FEES);
  const targetMarginBps = v.policyTargetMarginMinBps === null ? null : policyTargetBps({ targetMarginMinBps: v.policyTargetMarginMinBps, params: v.policyParams ?? {} });
  const reason = proposalReason(p, now.marginBps, targetMarginBps);
  const closed = p.status === 'approved' || p.status === 'auto_applied';
  return {
    id: p.id, status: p.status as Status, strategy: p.strategy as Strategy, variantId: p.variantId, sku: v.sku, productTitle: v.title,
    accountId: p.accountId, channelName: v.accountName, marketplace: v.marketplace, policyId: p.policyId, policyName: v.policyName,
    currentPriceMinor: p.currentPriceMinor, proposedPriceMinor: p.proposedPriceMinor, currency: p.currency.trim(), priceChangeBps: Math.round(((p.proposedPriceMinor - p.currentPriceMinor) * 10_000) / p.currentPriceMinor),
    competitorPriceMinor: p.competitorPriceMinor, estMarginDeltaBps: p.estMarginDeltaBps, projectedSalesDeltaBps: p.projectedSalesDeltaBps, reasoning: p.reasoning,
    expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null, createdAt: p.createdAt.toISOString(),
    decidedBy: p.decidedBy, decidedByName: v.decidedByName, decidedAt: p.decidedAt ? p.decidedAt.toISOString() : null, decisionNote: p.decisionNote,
    /** real inputs behind the numbers (null = unknown, never guessed): cost price, commission + fixed fee at the price the proposal started from, margins in bps of the price */
    unitCostMinor: now.unitCostMinor, feesMinor: now.feesMinor, proposedFeesMinor: fees ? feeAmount(p.proposedPriceMinor, fees) : null, currentMarginBps: now.marginBps, proposedMarginBps, targetMarginBps,
    reasonCode: reason.code, reasonText: reason.text,
    appliedAt: p.appliedAt ? p.appliedAt.toISOString() : null, failureMessage: p.failureMessage,
    /** true when the price is saved here but the marketplace's connector cannot take price updates (the note says what to do) */
    pushSkipped: closed && p.failureMessage !== null, version: p.version,
  };
}
export type ProposalDto = ReturnType<typeof toProposalDto>;

function viewQuery(tx: Tx) {
  return tx.select({ p: PP, sku: V.sku, title: P.title, accountName: A.displayName, marketplace: A.marketplace, policyName: POL.name, policyTargetMarginMinBps: POL.targetMarginMinBps, policyParams: POL.params, decidedByName: schema.users.fullName })
    .from(PP)
    .innerJoin(V, and(eq(V.id, PP.variantId), eq(V.vendorId, PP.vendorId)))
    .innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId)))
    .innerJoin(A, and(eq(A.id, PP.accountId), eq(A.vendorId, PP.vendorId)))
    .leftJoin(POL, and(eq(POL.id, PP.policyId), eq(POL.vendorId, PP.vendorId)))
    .leftJoin(schema.users, and(eq(schema.users.id, PP.decidedBy), eq(schema.users.vendorId, PP.vendorId)));
}

export async function getProposalDto(tx: Tx, vendorId: string, id: string): Promise<ProposalDto> {
  const [row] = await viewQuery(tx).where(and(eq(PP.id, id), eq(PP.vendorId, vendorId)));
  if (!row) throw Errors.notFound('Price proposal', id);
  return toProposalDto(row, await loadCostFacts(tx, vendorId, [row.p]));
}

export interface ProposalQuery { status?: Status; accountId?: string; strategy?: Strategy; q?: string; sort: 'impact' | 'newest' | 'oldest'; limit: number; offset: number }

export async function listProposals(tx: Tx, vendorId: string, q: ProposalQuery) {
  const common = and(
    eq(PP.vendorId, vendorId), q.accountId ? eq(PP.accountId, q.accountId) : undefined, q.strategy ? eq(PP.strategy, q.strategy) : undefined,
    q.q ? sql`(${V.sku} ILIKE ${`%${q.q}%`} OR ${P.title} ILIKE ${`%${q.q}%`})` : undefined,
  );
  const where = and(common, q.status ? eq(PP.status, q.status) : undefined);
  const order = q.sort === 'impact'
    // biggest margin impact first (the screen says "sorted by highest margin impact"); proposals without an estimate come last
    ? [sql`abs(coalesce(${PP.estMarginDeltaBps}, 0)) desc`, sql`(${PP.estMarginDeltaBps} is null) asc`, desc(PP.createdAt)]
    : [q.sort === 'newest' ? desc(PP.createdAt) : asc(PP.createdAt)];
  const [rows, totals, counts] = await Promise.all([
    viewQuery(tx).where(where).orderBy(...order, desc(PP.id)).limit(q.limit).offset(q.offset),
    tx.select({ n: sql<number>`count(*)::int` }).from(PP).innerJoin(V, and(eq(V.id, PP.variantId), eq(V.vendorId, PP.vendorId))).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId))).where(where),
    tx.select({ status: PP.status, n: sql<number>`count(*)::int` }).from(PP).innerJoin(V, and(eq(V.id, PP.variantId), eq(V.vendorId, PP.vendorId))).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId))).where(common).groupBy(PP.status),
  ]);
  const byStatus = Object.fromEntries(schema.PRICE_PROPOSAL_STATUSES.map((s) => [s, counts.find((c) => c.status === s)?.n ?? 0])) as Record<Status, number>;
  const facts = await loadCostFacts(tx, vendorId, rows.map((r) => r.p));
  return { items: rows.map((r) => toProposalDto(r, facts)), total: totals[0]?.n ?? 0, counts: { ...byStatus, all: Object.values(byStatus).reduce((a, b) => a + b, 0) } };
}

// ------------------------------------------------------------------------------------------------
// creation (exported contract: createPriceProposal)
// ------------------------------------------------------------------------------------------------
export interface PriceProposalInput {
  variantId: string; accountId: string; strategy: Strategy; proposedPriceMinor: number; reasoning: string;
  policyId?: string | null; competitorPriceMinor?: number | null; expiresAt?: Date | null;
  actor?: { type: 'user' | 'api_key' | 'system' | 'webhook'; id: string | null };
  /** estimates are computed from the variant's real cost, the account's fee profile and sales history unless the caller states them */
  estMarginDeltaBps?: number | null; projectedSalesDeltaBps?: number | null; elasticity?: number;
}

/** insert one proposal for a loaded subject: validates, supersedes the open one for the same variant+account, writes event + audit */
export async function insertProposal(tx: Tx, vendorId: string, input: PriceProposalInput, s: SubjectRow, now = new Date()): Promise<ProposalRow> {
  const reasoning = input.reasoning.trim();
  if (!reasoning) throw new AppError('BAD_REQUEST', 'A proposal needs a reasoning', { details: { rule: 'reasoning_required' } });
  if (!schema.PRICING_STRATEGIES.includes(input.strategy)) throw new AppError('BAD_REQUEST', 'Unknown pricing strategy', { details: { rule: 'unknown_strategy', strategy: input.strategy } });
  if (!Number.isInteger(input.proposedPriceMinor) || input.proposedPriceMinor < 1) throw new AppError('BAD_REQUEST', 'The proposed price must be a positive amount in minor units', { details: { rule: 'invalid_price' } });
  const cur = s.subject.currentMinor;
  if (input.proposedPriceMinor === cur) throw new AppError('BAD_REQUEST', 'The proposed price equals the current price', { details: { rule: 'no_change', priceMinor: cur } });
  if (s.subject.mrpMinor !== null && input.proposedPriceMinor > s.subject.mrpMinor) throw new AppError('BAD_REQUEST', 'The proposed price cannot be higher than the MRP', { details: { rule: 'price_above_mrp', priceMinor: input.proposedPriceMinor, mrpMinor: s.subject.mrpMinor } });
  // one open proposal per variant+account: serialise concurrent creators, then retire the older one
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`price_proposal:${vendorId}:${input.variantId}:${input.accountId}`}))`);
  const retired = await tx.update(PP).set({ status: 'superseded', decidedAt: now, decisionNote: 'Superseded by a newer proposal', version: sql`${PP.version} + 1` })
    .where(and(eq(PP.vendorId, vendorId), eq(PP.variantId, input.variantId), eq(PP.accountId, input.accountId), eq(PP.status, 'pending_review'))).returning({ id: PP.id });
  const est = input.estMarginDeltaBps !== undefined ? input.estMarginDeltaBps : marginDeltaBps(cur, input.proposedPriceMinor, s.subject.costMinor, s.subject.fees);
  const sales = input.projectedSalesDeltaBps !== undefined ? input.projectedSalesDeltaBps : projectedSalesDeltaBps(cur, input.proposedPriceMinor, s.subject.unitsInWindow, { elasticity: input.elasticity });
  const [row] = await tx.insert(PP).values({
    vendorId, variantId: input.variantId, accountId: input.accountId, policyId: input.policyId ?? null, strategy: input.strategy, currentPriceMinor: cur, proposedPriceMinor: input.proposedPriceMinor,
    currency: s.currency, competitorPriceMinor: input.competitorPriceMinor !== undefined ? input.competitorPriceMinor : s.subject.competitorMinor, estMarginDeltaBps: est, projectedSalesDeltaBps: sales, reasoning,
    expiresAt: input.expiresAt !== undefined ? input.expiresAt : new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 86_400_000),
  }).returning();
  const actor = input.actor ?? { type: 'system' as const, id: null };
  await writeAudit(tx, {
    vendorId, actorType: actor.type, actorId: actor.id, action: 'pricing.proposal_created', resourceType: 'price_proposal', resourceId: row!.id,
    after: { variantId: input.variantId, accountId: input.accountId, strategy: input.strategy, currentPriceMinor: cur, proposedPriceMinor: input.proposedPriceMinor, policyId: input.policyId ?? null, supersededIds: retired.map((r) => r.id) },
  });
  await writeOutboxEvent(tx, {
    type: 'pricing.proposal_created', vendorId, aggregateType: 'price_proposal', aggregateId: row!.id,
    payload: { proposalId: row!.id, variantId: input.variantId, sku: s.sku, accountId: input.accountId, strategy: input.strategy, currentPriceMinor: cur, proposedPriceMinor: input.proposedPriceMinor },
  });
  return row!;
}

/**
 * EXPORTED CONTRACT. Create a price proposal for review (status `pending_review`). The current price, the margin estimate and the
 * projected sales effect come from the real data; an older open proposal for the same variant and account is superseded.
 */
export async function createPriceProposal(tx: Tx, vendorId: string, input: PriceProposalInput): Promise<{ id: string; status: string }> {
  const key = pairKey(input);
  let s = (await loadSubjects(tx, vendorId, [input])).get(key);
  if (!s) {
    const [v] = await tx.select({ id: V.id }).from(V).where(and(eq(V.id, input.variantId), eq(V.vendorId, vendorId)));
    if (!v) throw Errors.notFound('Variant', input.variantId);
    const [a] = await tx.select({ id: A.id }).from(A).where(and(eq(A.id, input.accountId), eq(A.vendorId, vendorId)));
    if (!a) throw Errors.notFound('Marketplace account', input.accountId);
    throw new AppError('BAD_REQUEST', 'The variant has no price to propose a change to', { details: { rule: 'no_current_price', variantId: input.variantId } });
  }
  s = s!;
  const row = await insertProposal(tx, vendorId, input, s);
  return { id: row.id, status: row.status };
}

// ------------------------------------------------------------------------------------------------
// decisions
// ------------------------------------------------------------------------------------------------
export type DecideOutcome = 'applied' | 'rejected' | 'unchanged' | 'failed' | 'expired';
export interface DecideResult { outcome: DecideOutcome; proposal: ProposalDto }

async function canPushPrices(ctx: OpCtx, marketplace: string): Promise<boolean> {
  try { return ctx.c.connectors.get(marketplace).capabilities.pricing.push; } catch { return false; }
}

/**
 * Put the proposed price live through the pricing module (reason `proposal:<id>`). A price the pricing rules refuse (e.g. it is now above
 * the MRP) moves the proposal to `failed` with the message, never silently. A connector that cannot take prices does not fail the
 * proposal: the price is saved here and the proposal says (failureMessage + pushSkipped) that the marketplace must be updated by hand.
 */
export async function applyProposal(tx: Tx, ctx: OpCtx, work: SyncWork, row: ProposalRow, status: 'approved' | 'auto_applied', note: string | null): Promise<{ ok: true; pushSkipped: boolean } | { ok: false; message: string }> {
  const [acct] = await tx.select({ marketplace: A.marketplace, name: A.displayName }).from(A).where(and(eq(A.id, row.accountId), eq(A.vendorId, ctx.vendorId)));
  const canPush = acct ? await canPushPrices(ctx, acct.marketplace) : false;
  try {
    await tx.transaction((sp) => setMarketplacePrice(sp, ctx, work, { variantId: row.variantId, accountId: row.accountId, priceMinor: row.proposedPriceMinor, source: 'manual', reason: `proposal:${row.id}` }));
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    await tx.update(PP).set({ status: 'failed', failureMessage: e.message, decidedBy: isUuid(ctx.actor.id) ? ctx.actor.id : null, decidedAt: new Date(), decisionNote: note, version: sql`${PP.version} + 1` }).where(eq(PP.id, row.id));
    await effects(tx, ctx).audit({ action: 'pricing.proposal_failed', resourceType: 'price_proposal', resourceId: row.id, after: { message: e.message, rule: (e.details as { rule?: string } | undefined)?.rule ?? null } });
    return { ok: false, message: e.message };
  }
  const pushSkipped = !canPush;
  const failureMessage = pushSkipped ? `The price is saved in the dashboard, but ${acct?.name ?? 'this marketplace'} cannot take price updates through its API: update it in the seller panel.` : null;
  const now = new Date();
  await tx.update(PP).set({ status, decidedBy: isUuid(ctx.actor.id) ? ctx.actor.id : null, decidedAt: now, decisionNote: note, appliedAt: now, failureMessage, version: sql`${PP.version} + 1` }).where(eq(PP.id, row.id));
  const fx = effects(tx, ctx);
  await fx.audit({ action: status === 'approved' ? 'pricing.proposal_approved' : 'pricing.proposal_auto_applied', resourceType: 'price_proposal', resourceId: row.id, before: { priceMinor: row.currentPriceMinor }, after: { priceMinor: row.proposedPriceMinor, variantId: row.variantId, accountId: row.accountId, pushSkipped, note } });
  await fx.event({ type: 'pricing.proposal_approved', aggregateType: 'price_proposal', aggregateId: row.id, payload: { proposalId: row.id, variantId: row.variantId, accountId: row.accountId, currentPriceMinor: row.currentPriceMinor, proposedPriceMinor: row.proposedPriceMinor, auto: status === 'auto_applied', pushSkipped } });
  return { ok: true, pushSkipped };
}

/**
 * Approve or reject one proposal. Idempotent: repeating a decision that was already taken changes nothing (`unchanged`). Opposite
 * decisions on a decided proposal, or a decision on an expired / superseded one, are 409 INVALID_STATE. `version` (optional) is the
 * version the reviewer saw (409 VERSION_CONFLICT when somebody else changed it first).
 */
export async function decideProposal(tx: Tx, ctx: OpCtx, work: SyncWork, id: string, action: 'approve' | 'reject', o: { version?: number; note?: string | null } = {}): Promise<DecideResult> {
  const [row] = await tx.select().from(PP).where(and(eq(PP.id, id), eq(PP.vendorId, ctx.vendorId))).for('update');
  if (!row) throw Errors.notFound('Price proposal', id);
  const done = async (outcome: DecideOutcome): Promise<DecideResult> => ({ outcome, proposal: await getProposalDto(tx, ctx.vendorId, id) });
  const wasApplied = row.status === 'approved' || row.status === 'auto_applied';
  if (action === 'approve' && wasApplied) return done('unchanged');
  if (action === 'reject' && row.status === 'rejected') return done('unchanged');
  if (row.status === 'expired' || row.status === 'superseded') throw new AppError('INVALID_STATE', `This proposal is ${row.status} and can no longer be decided`, { details: { rule: 'proposal_closed', status: row.status } });
  if (row.status === 'rejected' || (action === 'reject' && wasApplied)) throw new AppError('INVALID_STATE', `This proposal was already ${row.status === 'rejected' ? 'rejected' : 'approved and applied'}`, { details: { rule: 'proposal_already_decided', status: row.status } });
  if (o.version !== undefined && o.version !== row.version) throw new AppError('VERSION_CONFLICT', undefined, { details: { currentVersion: row.version } });
  const now = new Date();
  if (row.status === 'pending_review' && row.expiresAt && row.expiresAt <= now) {
    await tx.update(PP).set({ status: 'expired', decidedAt: now, decisionNote: 'Expired before a decision', version: sql`${PP.version} + 1` }).where(eq(PP.id, id));
    return done('expired');
  }
  const note = o.note?.trim() || null;
  if (action === 'reject') {
    await tx.update(PP).set({ status: 'rejected', decidedBy: isUuid(ctx.actor.id) ? ctx.actor.id : null, decidedAt: now, decisionNote: note, version: sql`${PP.version} + 1` }).where(eq(PP.id, id));
    const fx = effects(tx, ctx);
    await fx.audit({ action: 'pricing.proposal_rejected', resourceType: 'price_proposal', resourceId: id, before: { status: row.status }, after: { status: 'rejected', note } });
    await fx.event({ type: 'pricing.proposal_rejected', aggregateType: 'price_proposal', aggregateId: id, payload: { proposalId: id, variantId: row.variantId, accountId: row.accountId, note } });
    return done('rejected');
  }
  const res = await applyProposal(tx, ctx, work, row, 'approved', note);
  return done(res.ok ? 'applied' : 'failed');
}

export interface BulkItemResult { id: string; outcome: DecideOutcome | 'error'; code?: string; message?: string }

/** up to 100 decisions in one call; every proposal is decided on its own (a savepoint), so partial success is normal */
export async function bulkDecide(tx: Tx, ctx: OpCtx, work: SyncWork, ids: string[], action: 'approve' | 'reject', note: string | null) {
  const unique = [...new Set(ids)];
  const items: BulkItemResult[] = [];
  for (const id of unique) {
    try {
      items.push({ id, outcome: (await tx.transaction((sp) => decideProposal(sp, ctx, work, id, action, { note }))).outcome });
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      items.push({ id, outcome: 'error', code: e.code, message: e.message });
    }
  }
  const failed = items.filter((i) => i.outcome === 'error' || i.outcome === 'failed' || i.outcome === 'expired').length;
  return { action, total: items.length, succeeded: items.length - failed, failed, items };
}

// ------------------------------------------------------------------------------------------------
// expiry (scheduler)
// ------------------------------------------------------------------------------------------------
/** open proposals past their `expiresAt` become `expired` (a stale price suggestion must not be approvable); returns how many */
export async function expireProposals(c: Container, now = new Date()): Promise<number> {
  return withSystem(c.database.db, async (tx) => {
    const rows = await tx.update(PP).set({ status: 'expired', decidedAt: now, decisionNote: 'Expired before a decision', version: sql`${PP.version} + 1` })
      .where(and(eq(PP.status, 'pending_review'), lt(PP.expiresAt, now))).returning({ id: PP.id, vendorId: PP.vendorId });
    for (const r of rows) await writeAudit(tx, { vendorId: r.vendorId, actorType: 'system', actorId: 'pricing-expiry', action: 'pricing.proposal_expired', resourceType: 'price_proposal', resourceId: r.id });
    return rows.length;
  });
}

/** helper for the generator: open proposals for a set of pairs, keyed by pair */
export async function openProposals(tx: Tx, vendorId: string, variantIds: string[]): Promise<Map<string, ProposalRow>> {
  if (variantIds.length === 0) return new Map();
  const rows = await tx.select().from(PP).where(and(eq(PP.vendorId, vendorId), eq(PP.status, 'pending_review'), inArray(PP.variantId, variantIds)));
  return new Map(rows.map((r) => [`${r.variantId}:${r.accountId}`, r]));
}
