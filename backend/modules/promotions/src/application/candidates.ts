import { and, eq, inArray, isNotNull, isNull, schema, type Tx } from '@oms/database';
import { loadMarginView, priceForMargin } from '@oms/mod-pricing';
import { productIntelligence, type IntelItem } from '@oms/mod-ai';
import { THRESHOLDS, classify, maxDiscountBps, type CandidateStatus, type Eligibility } from '../domain/candidates';
import { stockFacts, type CanPush } from './analysis';

const C = schema.promotionCampaigns;
const I = schema.promotionItems;
const MP = schema.marketplacePrices;

export type CandidateConflictKind = 'pending_price_proposal' | 'other_campaign' | 'existing_sale';
export interface CandidateRow {
  variantId: string; productId: string; productName: string; sku: string;
  accountId: string; marketplace: string; channel: string; canPushPrices: boolean;
  regularPriceMinor: number; unitCostMinor: number | null; feesMinor: number | null;
  /** margin at the regular price after cost and the channel's fees; null = no cost price */
  marginBps: number | null; targetMarginBps: number | null;
  minPromoPriceMinor: number | null; maxDiscountBps: number | null;
  availableStock: number; lowStock: boolean; unitsSold30d: number; salesVelocity: number;
  recommendedAction: IntelItem['recommendedAction']; recommendationReasons: Array<{ key: string; text: string }>;
  existingCampaign: { id: string; name: string; status: string; endsAt: string | null } | null;
  conflicts: Array<{ kind: CandidateConflictKind; message: string }>;
  pendingProposal: { id: string; proposedPriceMinor: number } | null;
  eligibility: Eligibility; eligibilityReason: string | null; promotionStatus: CandidateStatus;
}

export interface CandidateBase { rows: CandidateRow[]; listedProducts: number; unlistedVariants: number }

const STATUS_RANK: Record<string, number> = { active: 0, scheduled: 1, draft: 2 };

/**
 * Every promotable placement: an active listing on an active channel with a price (the same rows the Pricing margin view uses), with
 * the real cost, fees and margin, stock (shared low-stock rule), recent sales and the intelligence recommendation, the campaign it is
 * already in and what would clash with a new sale (another running or scheduled campaign, a sale somebody set, a pending price proposal).
 */
export async function loadCandidates(tx: Tx, vendorId: string, canPush: CanPush, now: Date, f: { accountId?: string } = {}): Promise<CandidateBase> {
  const [view, intel, stock, inCampaign, sales] = await Promise.all([
    loadMarginView(tx, vendorId, { accountId: f.accountId }),
    productIntelligence(tx, vendorId, { sort: 'priority' }, { limit: 5000, offset: 0 }),
    stockFacts(tx, vendorId),
    tx.select({ variantId: I.variantId, itemStatus: I.status, campaignId: C.id, name: C.name, status: C.status, accountIds: C.accountIds, endsAt: C.endsAt }).from(I)
      .innerJoin(C, and(eq(C.vendorId, I.vendorId), eq(C.id, I.campaignId)))
      .where(and(eq(I.vendorId, vendorId), isNull(C.deletedAt), inArray(C.status, ['draft', 'scheduled', 'active']))),
    tx.select({ variantId: MP.variantId, accountId: MP.marketplaceAccountId, source: MP.source, endsAt: MP.saleEndsAt }).from(MP).where(and(eq(MP.vendorId, vendorId), isNotNull(MP.salePriceMinor))),
  ]);
  const feesBy = new Map(view.accounts.map((a) => [a.accountId, a.fees]));
  const intelBy = new Map(intel.items.map((i) => [i.variantId, i]));
  const foreignSale = new Set(sales.filter((s) => s.source !== 'schedule' && (s.endsAt === null || s.endsAt > now)).map((s) => `${s.variantId}|${s.accountId}`));
  const rows: CandidateRow[] = [];
  for (const r of view.rows) {
    const it = intelBy.get(r.variantId);
    const st = stock.get(r.variantId);
    const camps = inCampaign.filter((c) => c.variantId === r.variantId && (c.accountIds.length === 0 || c.accountIds.includes(r.accountId))).sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9));
    const existing = camps[0] ?? null;
    const running = camps.find((c) => (c.status === 'scheduled' || c.status === 'active') && c.itemStatus !== 'ineligible' && c.itemStatus !== 'ended') ?? null;
    const conflicts: CandidateRow['conflicts'] = [];
    if (running) conflicts.push({ kind: 'other_campaign', message: `${running.name} (${running.status}) already covers it on this channel` });
    if (foreignSale.has(`${r.variantId}|${r.accountId}`)) conflicts.push({ kind: 'existing_sale', message: 'A sale price is already scheduled or running on this channel' });
    if (r.proposalId && r.proposedPriceMinor !== null) conflicts.push({ kind: 'pending_price_proposal', message: 'A price change is waiting for review in Pricing' });
    // only a clash that blocks a new campaign makes the product ineligible; a pending price proposal is a warning
    const blocking = conflicts.find((c) => c.kind !== 'pending_price_proposal')?.message ?? null;
    const lowStock = st?.lowStock ?? false;
    const verdict = classify({ canPushPrices: canPush(r.marketplace), conflict: blocking, lowStock: lowStock || (st?.available ?? 0) <= 0, marginBps: r.marginBps, targetMarginBps: r.targetMarginBps, recommendedByIntelligence: it?.recommendedAction === 'promote' });
    const minPromo = r.unitCostMinor !== null && r.targetMarginBps !== null ? priceForMargin(r.unitCostMinor, r.targetMarginBps, feesBy.get(r.accountId) ?? { feeBps: 0, fixedMinor: 0 }) : null;
    rows.push({
      variantId: r.variantId, productId: r.productId, productName: r.productTitle, sku: r.sku, accountId: r.accountId, marketplace: r.marketplace, channel: r.channel, canPushPrices: canPush(r.marketplace),
      regularPriceMinor: r.currentPriceMinor, unitCostMinor: r.unitCostMinor, feesMinor: r.feesMinor, marginBps: r.marginBps, targetMarginBps: r.targetMarginBps,
      minPromoPriceMinor: minPromo, maxDiscountBps: maxDiscountBps(r.currentPriceMinor, minPromo),
      availableStock: st?.available ?? 0, lowStock, unitsSold30d: it?.unitsSold30d ?? 0, salesVelocity: it?.salesVelocity ?? 0,
      recommendedAction: it?.recommendedAction ?? 'hold', recommendationReasons: (it?.reasons ?? []).slice(0, 3).map((x) => ({ key: x.key, text: x.text })),
      existingCampaign: existing ? { id: existing.campaignId, name: existing.name, status: existing.status, endsAt: existing.endsAt?.toISOString() ?? null } : null,
      conflicts, pendingProposal: r.proposalId && r.proposedPriceMinor !== null ? { id: r.proposalId, proposedPriceMinor: r.proposedPriceMinor } : null,
      eligibility: verdict.eligibility, eligibilityReason: verdict.reason, promotionStatus: verdict.status,
    });
  }
  const listedVariants = new Set(rows.map((r) => r.variantId));
  return { rows, listedProducts: new Set(rows.map((r) => r.productId)).size, unlistedVariants: intel.items.filter((i) => !listedVariants.has(i.variantId)).length };
}

export const QUICK_FILTERS = ['high_margin', 'strong_sellers', 'eligible', 'high_inventory', 'not_in_campaign'] as const;
export type QuickFilter = (typeof QUICK_FILTERS)[number];
export const CANDIDATE_SORTS = ['priority', 'sales', 'margin', 'stock', 'name'] as const;
export type CandidateSort = (typeof CANDIDATE_SORTS)[number];

export interface CandidateFilters { segment: 'recommended' | 'all'; quick?: QuickFilter; accountId?: string; marketplace?: string; q?: string; status?: CandidateStatus; sort: CandidateSort }

const QUICK: Record<QuickFilter, (r: CandidateRow) => boolean> = {
  high_margin: (r) => r.marginBps !== null && r.marginBps >= THRESHOLDS.highMarginBps,
  strong_sellers: (r) => r.unitsSold30d >= THRESHOLDS.strongSellerUnits30d,
  eligible: (r) => r.eligibility === 'eligible',
  high_inventory: (r) => r.availableStock >= THRESHOLDS.highInventoryUnits,
  not_in_campaign: (r) => r.existingCampaign === null,
};

const RANK: Record<CandidateStatus, number> = { recommended: 0, review: 1, not_selected: 2, connector_unavailable: 3 };
const nullsLast = (a: number | null, b: number | null, dir: 1 | -1): number => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : (a - b) * dir);

/** the filtered, sorted rows plus the per-status counts (which follow every filter except the segment and the status) */
export function filterCandidates(rows: CandidateRow[], f: CandidateFilters): { rows: CandidateRow[]; counts: Record<'all' | CandidateStatus, number> } {
  const needle = f.q?.trim().toLowerCase();
  const base = rows.filter((r) => (!f.accountId || r.accountId === f.accountId) && (!f.marketplace || r.marketplace === f.marketplace)
    && (!f.quick || QUICK[f.quick](r)) && (!needle || r.sku.toLowerCase().includes(needle) || r.productName.toLowerCase().includes(needle)));
  const counts: Record<'all' | CandidateStatus, number> = { all: base.length, recommended: 0, review: 0, not_selected: 0, connector_unavailable: 0 };
  for (const r of base) counts[r.promotionStatus]++;
  // the "recommended" segment is what product intelligence recommends plus what needs a look first; "all" is everything
  const picked = base.filter((r) => (f.status ? r.promotionStatus === f.status : f.segment === 'all' || r.promotionStatus === 'recommended' || r.promotionStatus === 'review'));
  const cmp: Record<CandidateSort, (a: CandidateRow, b: CandidateRow) => number> = {
    priority: (a, b) => RANK[a.promotionStatus] - RANK[b.promotionStatus] || b.salesVelocity - a.salesVelocity,
    sales: (a, b) => b.unitsSold30d - a.unitsSold30d,
    margin: (a, b) => nullsLast(a.marginBps, b.marginBps, -1),
    stock: (a, b) => b.availableStock - a.availableStock,
    name: (a, b) => a.productName.localeCompare(b.productName),
  };
  return { rows: picked.sort((a, b) => cmp[f.sort](a, b) || a.sku.localeCompare(b.sku) || a.channel.localeCompare(b.channel)), counts };
}
