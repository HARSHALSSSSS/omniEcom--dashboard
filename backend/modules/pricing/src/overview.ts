import { and, eq, gte, schema, sql, type Tx } from '@oms/database';
import { loadSubjects, pairKey } from './proposal-context';
import { HISTORY_DAYS, monthlyGainMinor } from './proposal-domain';

const PP = schema.pricingProposals;
const POL = schema.pricingPolicies;
const A = schema.marketplaceAccounts;

const GAIN_SAMPLE = 2_000;

/**
 * The tiles of the pricing screen, from real rows:
 *  - pendingProposals: proposals waiting for a decision
 *  - potentialMarginGain: monthly contribution gain of the pending proposals = (new unit contribution x projected units - old unit
 *    contribution x units) summed, weighted by the units sold on that account in the last 30 days. Proposals whose cost price is unknown
 *    are not guessed: they are counted in `proposalsWithoutEstimate`.
 *  - autoAppliedLast30Days, channelsCovered (accounts an active policy applies to), activePolicies
 */
export async function pricingOverview(tx: Tx, vendorId: string, now = new Date()) {
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
  const [byStatus, decided, policies, accounts, pending] = await Promise.all([
    tx.select({ status: PP.status, n: sql<number>`count(*)::int` }).from(PP).where(eq(PP.vendorId, vendorId)).groupBy(PP.status),
    tx.select({ status: PP.status, n: sql<number>`count(*)::int` }).from(PP).where(and(eq(PP.vendorId, vendorId), gte(PP.decidedAt, since))).groupBy(PP.status),
    tx.select({ status: POL.status, accountId: POL.accountId }).from(POL).where(eq(POL.vendorId, vendorId)),
    tx.select({ id: A.id, name: A.displayName, marketplace: A.marketplace }).from(A).where(and(eq(A.vendorId, vendorId), eq(A.status, 'active'))),
    tx.select({ id: PP.id, variantId: PP.variantId, accountId: PP.accountId, proposed: PP.proposedPriceMinor, sales: PP.projectedSalesDeltaBps }).from(PP).where(and(eq(PP.vendorId, vendorId), eq(PP.status, 'pending_review'))).limit(GAIN_SAMPLE),
  ]);
  const count = (rows: Array<{ status: string; n: number }>, s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  const subjects = await loadSubjects(tx, vendorId, pending, now);
  let gain = 0;
  let withoutEstimate = 0;
  let opportunities = 0;
  for (const p of pending) {
    const s = subjects.get(pairKey(p));
    const g = s ? monthlyGainMinor(s.subject.currentMinor, p.proposed, s.subject.costMinor, s.subject.fees, s.subject.unitsInWindow, p.sales) : null;
    if (g === null) withoutEstimate++; else { gain += g; if (g > 0) opportunities++; }
  }
  const active = policies.filter((p) => p.status === 'active');
  const covered = active.some((p) => p.accountId === null) ? accounts : accounts.filter((a) => active.some((p) => p.accountId === a.id));
  return {
    pendingProposals: count(byStatus, 'pending_review'),
    potentialMarginGainMinor: gain,
    proposalsWithoutEstimate: withoutEstimate,
    autoAppliedLast30Days: count(decided, 'auto_applied'),
    /** approved by a person + applied automatically in the last 30 days */
    appliedLast30Days: count(decided, 'auto_applied') + count(decided, 'approved'),
    /** pending proposals whose estimated monthly contribution gain is positive */
    opportunitiesCount: opportunities,
    approvedLast30Days: count(decided, 'approved'),
    rejectedLast30Days: count(decided, 'rejected'),
    activePolicies: active.length,
    pausedPolicies: policies.length - active.length,
    channelsCovered: covered.length,
    channels: covered.map((a) => ({ accountId: a.id, name: a.name, marketplace: a.marketplace })),
    proposalCounts: Object.fromEntries(schema.PRICE_PROPOSAL_STATUSES.map((s) => [s, count(byStatus, s)])) as Record<(typeof schema.PRICE_PROPOSAL_STATUSES)[number], number>,
    basis: 'estimated' as const,
  };
}
