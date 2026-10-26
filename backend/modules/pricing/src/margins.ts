import { and, eq, inArray, schema, sql, type Tx } from '@oms/database';
import { NO_FEES, feeAmount, marginBps, rupees, type FeeTerms } from './proposal-domain';

const V = schema.productVariants;
const P = schema.products;
const A = schema.marketplaceAccounts;
const L = schema.marketplaceListings;
const MP = schema.marketplacePrices;
const FP = schema.feeProfiles;
const POL = schema.pricingPolicies;
const PP = schema.pricingProposals;

/** hard cap on the listings one margin view looks at (the screen is a summary; narrow with filter[accountId] beyond it) */
export const MARGIN_ROW_LIMIT = 20_000;

const pct = (bps: number): string => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

/** the margin a policy asks for: its floor, or for a custom policy the margin it prices for; null = it sets no margin target */
export function policyTargetBps(p: { targetMarginMinBps: number; params: Record<string, unknown> }): number | null {
  if (p.targetMarginMinBps > 0) return p.targetMarginMinBps;
  const t = p.params.targetMarginBps;
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : null;
}

/** human summary of an account's fee terms: '12% commission + Rs 25.00 fixed', or 'fees not configured' without a fee profile */
export function feeTermsSummary(f: FeeTerms | null): string {
  if (!f) return 'fees not configured';
  const parts: string[] = [];
  if (f.feeBps > 0) parts.push(`${pct(f.feeBps)} commission`);
  if (f.fixedMinor > 0) parts.push(`${rupees(f.fixedMinor)} fixed`);
  return parts.length ? parts.join(' + ') : 'no fees';
}

/** cost + fee profile of the given pairs, in two queries (no per-row lookups) */
export async function loadCostFacts(tx: Tx, vendorId: string, pairs: Array<{ variantId: string; accountId: string }>) {
  const variantIds = [...new Set(pairs.map((p) => p.variantId))];
  const accountIds = [...new Set(pairs.map((p) => p.accountId))];
  const [variants, fees] = await Promise.all([
    variantIds.length ? tx.select({ id: V.id, cost: V.costPriceMinor }).from(V).where(and(eq(V.vendorId, vendorId), inArray(V.id, variantIds))) : [],
    accountIds.length ? tx.select({ accountId: FP.marketplaceAccountId, feeBps: FP.feePercentBps, fixedMinor: FP.fixedFeeMinor }).from(FP).where(and(eq(FP.vendorId, vendorId), inArray(FP.marketplaceAccountId, accountIds))) : [],
  ]);
  const cost = new Map(variants.map((v) => [v.id, v.cost]));
  const fee = new Map<string, FeeTerms>(fees.map((f) => [f.accountId, { feeBps: f.feeBps, fixedMinor: f.fixedMinor }]));
  return { costOf: (variantId: string): number | null => cost.get(variantId) ?? null, feesOf: (accountId: string): FeeTerms | null => fee.get(accountId) ?? null };
}

/** the real numbers of one price: unit cost, fees at that price and the margin; everything unknown stays null */
export function priceFacts(priceMinor: number, costMinor: number | null, fees: FeeTerms | null) {
  return {
    unitCostMinor: costMinor,
    feesMinor: fees ? feeAmount(priceMinor, fees) : null,
    marginBps: marginBps(priceMinor, costMinor, fees ?? NO_FEES),
  };
}

export type ReasonCode = 'below_margin_target' | 'competitor_undercut' | 'competitor_above' | 'competitor_match' | 'slow_velocity' | 'target_margin';

/** structured reason of a proposal, from its strategy and the facts stored with it */
export function proposalReason(p: { strategy: string; currentPriceMinor: number; proposedPriceMinor: number; competitorPriceMinor: number | null }, currentMarginBps: number | null, targetBps: number | null): { code: ReasonCode; text: string } {
  const comp = p.competitorPriceMinor;
  switch (p.strategy) {
    case 'margin_floor':
      return { code: 'below_margin_target', text: `${currentMarginBps === null ? 'Margin is unknown' : `Current margin is ${pct(currentMarginBps)}`}${targetBps !== null ? `, below the ${pct(targetBps)} target` : ''}; ${rupees(p.proposedPriceMinor)} restores it.` };
    case 'automated_match':
      if (comp !== null && comp < p.currentPriceMinor) return { code: 'competitor_undercut', text: `A competitor sells at ${rupees(comp)}, ${rupees(p.currentPriceMinor - comp)} under your price.` };
      if (comp !== null && comp > p.currentPriceMinor) return { code: 'competitor_above', text: `A competitor sells at ${rupees(comp)}, above your price: there is room to raise it.` };
      return { code: 'competitor_match', text: comp !== null ? `Matching the competitor price of ${rupees(comp)}.` : 'Following the competitor price.' };
    case 'velocity_boost':
      return { code: 'slow_velocity', text: 'Sales are slow with stock on hand; a lower price should move more units.' };
    default:
      return { code: 'target_margin', text: targetBps !== null ? `Price that earns the ${pct(targetBps)} target margin.` : 'Price chosen by a custom policy.' };
  }
}

// ------------------------------------------------------------------------------------------------
// listing-level margin view (margin overview + price table)
// ------------------------------------------------------------------------------------------------
export interface PricedListing {
  listingId: string; variantId: string; productId: string; productTitle: string; sku: string; accountId: string; channel: string; marketplace: string;
  currentPriceMinor: number; unitCostMinor: number | null; feesMinor: number | null; feesConfigured: boolean; marginBps: number | null;
  targetMarginBps: number | null; belowTarget: boolean | null; proposalId: string | null; proposedPriceMinor: number | null;
  /** the sale price in force right now on this channel (a campaign's or a manual one); null = no sale running. The margin above is at the regular price. */
  salePriceMinor: number | null; saleEndsAt: Date | null;
}
export interface AccountFacts { accountId: string; channel: string; marketplace: string; fees: FeeTerms | null; targetMarginBps: number | null }
export interface MarginView { rows: PricedListing[]; accounts: AccountFacts[]; targetMarginBps: number | null }

/**
 * Every active listing (on an active account) that has a price: the account's marketplace price, else the variant's selling price (the
 * same rule the proposal engine uses). Cost from the variant, fees from the account's fee profile, target from the strictest active
 * policy that applies to the account. Cost unknown => margin / belowTarget are null, never guessed.
 */
export async function loadMarginView(tx: Tx, vendorId: string, f: { accountId?: string }): Promise<MarginView> {
  const [accounts, policies, listings, pending] = await Promise.all([
    tx.select({ id: A.id, name: A.displayName, marketplace: A.marketplace, feeBps: FP.feePercentBps, fixedMinor: FP.fixedFeeMinor, hasFee: sql<boolean>`${FP.id} is not null` })
      .from(A).leftJoin(FP, and(eq(FP.marketplaceAccountId, A.id), eq(FP.vendorId, A.vendorId)))
      .where(and(eq(A.vendorId, vendorId), eq(A.status, 'active'), f.accountId ? eq(A.id, f.accountId) : undefined)).orderBy(A.displayName, A.id),
    tx.select({ accountId: POL.accountId, targetMarginMinBps: POL.targetMarginMinBps, params: POL.params }).from(POL).where(and(eq(POL.vendorId, vendorId), eq(POL.status, 'active'))),
    tx.select({
      listingId: L.id, variantId: L.variantId, accountId: L.marketplaceAccountId, productId: P.id, title: P.title, sku: V.sku, cost: V.costPriceMinor,
      price: sql<number | null>`coalesce(${MP.priceMinor}, ${V.sellingPriceMinor})`, sale: MP.salePriceMinor, saleStarts: MP.saleStartsAt, saleEnds: MP.saleEndsAt,
    }).from(L)
      .innerJoin(A, and(eq(A.id, L.marketplaceAccountId), eq(A.vendorId, L.vendorId)))
      .innerJoin(V, and(eq(V.id, L.variantId), eq(V.vendorId, L.vendorId)))
      .innerJoin(P, and(eq(P.id, V.productId), eq(P.vendorId, V.vendorId)))
      .leftJoin(MP, and(eq(MP.variantId, L.variantId), eq(MP.marketplaceAccountId, L.marketplaceAccountId), eq(MP.vendorId, L.vendorId)))
      .where(and(eq(L.vendorId, vendorId), eq(L.status, 'active'), eq(A.status, 'active'), f.accountId ? eq(L.marketplaceAccountId, f.accountId) : undefined))
      .orderBy(P.title, V.sku, L.id).limit(MARGIN_ROW_LIMIT),
    tx.select({ id: PP.id, variantId: PP.variantId, accountId: PP.accountId, proposed: PP.proposedPriceMinor }).from(PP).where(and(eq(PP.vendorId, vendorId), eq(PP.status, 'pending_review'), f.accountId ? eq(PP.accountId, f.accountId) : undefined)),
  ]);
  const targets = policies.map((p) => ({ accountId: p.accountId, target: policyTargetBps(p) })).filter((p): p is { accountId: string | null; target: number } => p.target !== null);
  const strictest = (xs: number[]): number | null => (xs.length ? Math.max(...xs) : null);
  const accountFacts = accounts.map((a): AccountFacts => ({
    accountId: a.id, channel: a.name, marketplace: a.marketplace, fees: a.hasFee ? { feeBps: a.feeBps ?? 0, fixedMinor: a.fixedMinor ?? 0 } : null,
    targetMarginBps: strictest(targets.filter((t) => t.accountId === null || t.accountId === a.id).map((t) => t.target)),
  }));
  const byAccount = new Map(accountFacts.map((a) => [a.accountId, a]));
  const pendingBy = new Map(pending.map((p) => [`${p.variantId}:${p.accountId}`, p]));
  const seen = new Set<string>();
  const now = new Date();
  const rows: PricedListing[] = [];
  for (const l of listings) {
    const key = `${l.variantId}:${l.accountId}`;
    const a = byAccount.get(l.accountId);
    if (!a || seen.has(key) || l.price === null || l.price <= 0) continue;
    seen.add(key);
    const facts = priceFacts(l.price, l.cost, a.fees);
    const pend = pendingBy.get(key);
    const onSale = l.sale !== null && (l.saleStarts === null || l.saleStarts <= now) && (l.saleEnds === null || l.saleEnds > now);
    rows.push({
      listingId: l.listingId, variantId: l.variantId, productId: l.productId, productTitle: l.title, sku: l.sku, accountId: l.accountId, channel: a.channel, marketplace: a.marketplace,
      currentPriceMinor: l.price, ...facts, feesConfigured: a.fees !== null, targetMarginBps: a.targetMarginBps,
      belowTarget: facts.marginBps === null || a.targetMarginBps === null ? null : facts.marginBps < a.targetMarginBps,
      proposalId: pend?.id ?? null, proposedPriceMinor: pend?.proposed ?? null, salePriceMinor: onSale ? l.sale : null, saleEndsAt: onSale ? l.saleEnds : null,
    });
  }
  return { rows, accounts: accountFacts, targetMarginBps: strictest(targets.filter((t) => !f.accountId || t.accountId === null || t.accountId === f.accountId).map((t) => t.target)) };
}

const avg = (xs: number[]): number | null => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** per-channel margin rows and totals of the pricing screen */
export async function marginOverview(tx: Tx, vendorId: string, f: { accountId?: string }) {
  const view = await loadMarginView(tx, vendorId, f);
  const channels = view.accounts.map((a) => {
    const rows = view.rows.filter((r) => r.accountId === a.accountId);
    const known = rows.filter((r) => r.marginBps !== null);
    const unknownCostCount = rows.length - known.length;
    return {
      accountId: a.accountId, channel: a.channel, marketplace: a.marketplace, priceCount: rows.length, pricedWithCostCount: known.length,
      avgMarginBps: avg(known.map((r) => r.marginBps as number)), belowTargetCount: rows.filter((r) => r.belowTarget === true).length,
      targetMarginBps: a.targetMarginBps, feeTermsSummary: feeTermsSummary(a.fees), feesConfigured: a.fees !== null, feePercentBps: a.fees?.feeBps ?? null, fixedFeeMinor: a.fees?.fixedMinor ?? null, unknownCostCount,
      nextAction: (unknownCostCount > 0 ? 'costs' : a.fees === null ? 'fees' : 'proposals') as 'costs' | 'fees' | 'proposals',
    };
  });
  const known = view.rows.filter((r) => r.marginBps !== null);
  return {
    channels,
    totals: {
      productsInView: new Set(view.rows.map((r) => r.productId)).size, productChannelPrices: view.rows.length, avgMarginBps: avg(known.map((r) => r.marginBps as number)),
      belowTargetCount: view.rows.filter((r) => r.belowTarget === true).length, unknownCostCount: view.rows.length - known.length, withProposalCount: view.rows.filter((r) => r.proposalId !== null).length, targetMarginBps: view.targetMarginBps,
    },
  };
}

export interface PriceTableQuery { accountId?: string; q?: string; state?: 'below_target' | 'proposed' | 'unknown_cost'; sort: 'product' | 'margin_asc' | 'margin_desc' | 'price_desc'; limit: number; offset: number }

/** numbered-page list of every listing price with its real cost, fees, margin and the pending proposal if any */
export async function priceTable(tx: Tx, vendorId: string, q: PriceTableQuery) {
  const view = await loadMarginView(tx, vendorId, { accountId: q.accountId });
  const needle = q.q?.toLowerCase();
  const byState = q.state === 'below_target' ? view.rows.filter((r) => r.belowTarget === true) : q.state === 'proposed' ? view.rows.filter((r) => r.proposalId !== null) : q.state === 'unknown_cost' ? view.rows.filter((r) => r.unitCostMinor === null) : view.rows;
  const rows = needle ? byState.filter((r) => r.sku.toLowerCase().includes(needle) || r.productTitle.toLowerCase().includes(needle)) : byState.slice();
  // unknown margins always last, whatever the direction; ties keep the product / sku order of the loader
  const byMargin = (dir: 1 | -1) => (a: PricedListing, b: PricedListing): number => {
    if (a.marginBps === null || b.marginBps === null) return a.marginBps === b.marginBps ? 0 : a.marginBps === null ? 1 : -1;
    return (a.marginBps - b.marginBps) * dir;
  };
  if (q.sort === 'margin_asc') rows.sort(byMargin(1));
  else if (q.sort === 'margin_desc') rows.sort(byMargin(-1));
  else if (q.sort === 'price_desc') rows.sort((a, b) => b.currentPriceMinor - a.currentPriceMinor);
  const items = rows.slice(q.offset, q.offset + q.limit).map((r) => ({
    listingId: r.listingId, variantId: r.variantId, productId: r.productId, productTitle: r.productTitle, sku: r.sku, accountId: r.accountId, channel: r.channel, marketplace: r.marketplace,
    currentPriceMinor: r.currentPriceMinor, unitCostMinor: r.unitCostMinor, feesMinor: r.feesMinor, marginBps: r.marginBps, targetMarginBps: r.targetMarginBps, belowTarget: r.belowTarget,
    proposalState: (r.proposalId ? 'proposed' : 'none') as 'none' | 'proposed', proposalId: r.proposalId, proposedPriceMinor: r.proposedPriceMinor,
    salePriceMinor: r.salePriceMinor, saleEndsAt: r.saleEndsAt?.toISOString() ?? null,
  }));
  return { items, total: rows.length };
}
