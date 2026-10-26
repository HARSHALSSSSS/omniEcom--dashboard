/**
 * Pure rules of the Products tab (promotion candidates) and the Overview. Nothing here touches the database; every threshold is
 * a named constant that the API also returns, so the screen never has to restate it.
 */
export const THRESHOLDS = {
  /** `quick=high_margin`: margin at the regular price of at least 30% */
  highMarginBps: 3000,
  /** `quick=strong_sellers`: at least 50 units sold in the last 30 days */
  strongSellerUnits30d: 50,
  /** `quick=high_inventory`: at least 30 units available */
  highInventoryUnits: 30,
  /** without a pricing-policy target, a margin below 15% is a margin risk (the same level product intelligence needs before it suggests a promotion) */
  minHealthyMarginBps: 1500,
  /** an active campaign ending within this many hours is "ending soon" */
  endingSoonHours: 72,
} as const;

export const ELIGIBILITY = ['eligible', 'margin_risk', 'low_inventory', 'verification_required', 'not_provided', 'conflict'] as const;
export type Eligibility = (typeof ELIGIBILITY)[number];
export const PROMOTION_STATUSES = ['recommended', 'review', 'not_selected', 'connector_unavailable'] as const;
export type CandidateStatus = (typeof PROMOTION_STATUSES)[number];

export interface CandidateFacts {
  canPushPrices: boolean;
  /** a scheduled/active campaign or a sale somebody else set already covers this variant on this channel */
  conflict: string | null;
  /** nothing left to sell, or the shared low-stock rule fires */
  lowStock: boolean;
  /** margin at the regular price after cost and the channel's fees; null = cost unknown */
  marginBps: number | null;
  targetMarginBps: number | null;
  /** product intelligence says `promote` */
  recommendedByIntelligence: boolean;
}

/** the margin level under which promoting is risky: the channel's pricing-policy target, else the default healthy level */
export const marginRiskLevel = (targetMarginBps: number | null): number => targetMarginBps ?? THRESHOLDS.minHealthyMarginBps;

/** why the product can or cannot be promoted on the channel, in priority order; `reason` is the sentence the seller reads */
export function classify(f: CandidateFacts): { eligibility: Eligibility; reason: string | null; status: CandidateStatus } {
  let eligibility: Eligibility = 'eligible';
  let reason: string | null = null;
  if (!f.canPushPrices) { eligibility = 'not_provided'; reason = 'This marketplace connection cannot take price changes, so a promotion cannot be applied automatically'; }
  else if (f.conflict) { eligibility = 'conflict'; reason = f.conflict; }
  else if (f.lowStock) { eligibility = 'low_inventory'; reason = 'Stock is low or the product is sold out: a promotion would raise the stock-out risk'; }
  else if (f.marginBps !== null && f.marginBps < marginRiskLevel(f.targetMarginBps)) {
    eligibility = 'margin_risk';
    reason = f.targetMarginBps !== null ? 'The margin is already below the pricing-policy target' : 'The margin is already below the healthy level';
  } else if (f.marginBps === null) { eligibility = 'verification_required'; reason = 'No cost price: the margin under a promotion cannot be checked'; }
  const status: CandidateStatus = eligibility === 'not_provided' ? 'connector_unavailable' : eligibility === 'eligible' && f.recommendedByIntelligence ? 'recommended' : eligibility === 'eligible' ? 'not_selected' : 'review';
  return { eligibility, reason, status };
}

/** how far below the regular price a promotional price may go and still earn the target margin; null = not knowable or already below it */
export function maxDiscountBps(regularMinor: number, minPromoPriceMinor: number | null): number | null {
  if (minPromoPriceMinor === null || regularMinor <= 0) return null;
  return Math.max(0, Math.round(((regularMinor - minPromoPriceMinor) * 10_000) / regularMinor));
}

/** campaign is on the "past" / "now" / "next" side of the Campaigns tab toggle */
export type Horizon = 'past' | 'now' | 'next';
export const HORIZON_STATUSES: Record<Horizon, readonly string[]> = {
  past: ['ended', 'cancelled'],
  /** everything that is not finished (the default view of the screen) */
  now: ['draft', 'scheduled', 'active'],
  /** not started yet */
  next: ['draft', 'scheduled'],
};
/** the single horizon a campaign belongs to for display: finished, running, or coming */
export const horizonOf = (status: string): Horizon => (status === 'ended' || status === 'cancelled' ? 'past' : status === 'active' ? 'now' : 'next');

/** hours until an active campaign ends (rounded up); null when it is not running or has no end */
export function endsInHours(status: string, endsAt: Date | null, now: Date): number | null {
  if (status !== 'active' || !endsAt) return null;
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 3_600_000));
}

/** whether every, some or none of the channels can take price changes */
export function capabilityOf(channels: Array<{ canPushPrices: boolean }>): 'supported' | 'partial' | 'not_supported' | 'none' {
  if (channels.length === 0) return 'none';
  const n = channels.filter((c) => c.canPushPrices).length;
  return n === channels.length ? 'supported' : n === 0 ? 'not_supported' : 'partial';
}
