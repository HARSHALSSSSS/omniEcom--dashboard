import { and, eq, gte, inArray, not, schema, sql, type Tx } from '@oms/database';
import { availabilityFor } from '@oms/mod-inventory';
import { competitorIsFresh, latestCompetitorPrices } from './competitors';
import { HISTORY_DAYS, NO_FEES, type FeeTerms, type Subject } from './proposal-domain';

const V = schema.productVariants;
const P = schema.products;
const A = schema.marketplaceAccounts;
const MP = schema.marketplacePrices;
const OI = schema.orderItems;
const O = schema.orders;

export interface Pair { variantId: string; accountId: string }
export const pairKey = (p: Pair): string => `${p.variantId}:${p.accountId}`;

/** everything the engine and the estimates need about one variant on one account, from real data */
export interface SubjectRow {
  variantId: string; accountId: string; sku: string; productTitle: string; marketplace: string; accountName: string; currency: string;
  subject: Subject;
  /** the competitor observation behind `subject.competitorMinor` (fresh ones only) */
  competitor: { priceMinor: number; observedAt: Date; sellerName: string | null } | null;
}

/**
 * Load the facts for a set of (variant, account) pairs in a fixed number of queries (no per-row lookups):
 * current regular price (the marketplace price, else the variant price), MRP, cost, the account's fee profile, units sold on that
 * account in the last 30 days (cancelled / returned orders do not count), stock available, the newest fresh competitor price.
 * Pairs without any price are left out: there is nothing to move.
 */
export async function loadSubjects(tx: Tx, vendorId: string, pairs: Pair[], now = new Date()): Promise<Map<string, SubjectRow>> {
  const out = new Map<string, SubjectRow>();
  if (pairs.length === 0) return out;
  const variantIds = [...new Set(pairs.map((p) => p.variantId))];
  const accountIds = [...new Set(pairs.map((p) => p.accountId))];
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
  const [variants, accounts, prices, fees, sold, stock, competitors] = await Promise.all([
    tx.select({ v: V, title: P.title }).from(V).innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId))).where(and(eq(V.vendorId, vendorId), inArray(V.id, variantIds))),
    tx.select({ id: A.id, marketplace: A.marketplace, name: A.displayName }).from(A).where(and(eq(A.vendorId, vendorId), inArray(A.id, accountIds))),
    tx.select().from(MP).where(and(eq(MP.vendorId, vendorId), inArray(MP.variantId, variantIds), inArray(MP.marketplaceAccountId, accountIds))),
    tx.select().from(schema.feeProfiles).where(and(eq(schema.feeProfiles.vendorId, vendorId), inArray(schema.feeProfiles.marketplaceAccountId, accountIds))),
    tx.select({ variantId: OI.variantId, accountId: O.marketplaceAccountId, units: sql<number>`sum(${OI.quantity})::int` }).from(OI)
      .innerJoin(O, and(eq(O.id, OI.orderId), eq(O.vendorId, OI.vendorId)))
      .where(and(eq(OI.vendorId, vendorId), inArray(OI.variantId, variantIds), inArray(O.marketplaceAccountId, accountIds), gte(O.placedAt, since), not(inArray(O.status, ['cancelled', 'returned']))))
      .groupBy(OI.variantId, O.marketplaceAccountId),
    availabilityFor(tx, vendorId, variantIds),
    latestCompetitorPrices(tx, vendorId, variantIds),
  ]);
  const vById = new Map(variants.map((r) => [r.v.id, r]));
  const aById = new Map(accounts.map((a) => [a.id, a]));
  const priceBy = new Map(prices.map((r) => [`${r.variantId}:${r.marketplaceAccountId}`, r]));
  const feeBy = new Map<string, FeeTerms>(fees.map((f) => [f.marketplaceAccountId, { feeBps: f.feePercentBps, fixedMinor: f.fixedFeeMinor }]));
  const soldBy = new Map(sold.map((r) => [`${r.variantId}:${r.accountId}`, r.units]));
  for (const p of pairs) {
    const v = vById.get(p.variantId);
    const a = aById.get(p.accountId);
    if (!v || !a) continue;
    const mp = priceBy.get(pairKey(p));
    const current = mp?.priceMinor ?? v.v.sellingPriceMinor;
    if (current === null || current <= 0) continue;
    const obs = competitors.get(p.variantId);
    const usable = obs && competitorIsFresh(obs.observedAt, now) && (obs.accountId === null || obs.accountId === p.accountId) ? obs : null;
    out.set(pairKey(p), {
      variantId: p.variantId, accountId: p.accountId, sku: v.v.sku, productTitle: v.title, marketplace: a.marketplace, accountName: a.name, currency: v.v.currency.trim(),
      subject: {
        currentMinor: current, mrpMinor: mp?.mrpMinor ?? v.v.mrpMinor, costMinor: v.v.costPriceMinor, fees: feeBy.get(p.accountId) ?? NO_FEES,
        competitorMinor: usable?.priceMinor ?? null, unitsInWindow: soldBy.get(pairKey(p)) ?? 0, availableUnits: stock.get(p.variantId)?.available ?? 0,
      },
      competitor: usable ? { priceMinor: usable.priceMinor, observedAt: usable.observedAt, sellerName: usable.sellerName } : null,
    });
  }
  return out;
}
