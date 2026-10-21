import { marginFloorPrice } from './terms';

/** why a variant cannot take part on an account (stable codes; the message is what the seller reads) */
export const REASONS = {
  no_target_accounts: 'no connected marketplace account to run on',
  variant_inactive: 'the product or variant is not active',
  no_price: 'the variant has no selling price',
  price_zero: 'the promotional price would be zero or negative',
  no_discount: 'the promotional price is not lower than the price',
  no_active_listing: 'no active listing on this account',
  below_cost: 'the promotional price is below the cost price',
  below_margin_floor: 'the promotional price is below the pricing margin floor',
  conflicting_campaign: 'another scheduled or active campaign already covers it',
  not_below_regular_price: 'the promotional price is not below the price on this account',
  existing_sale: 'a sale is already scheduled or running on this account',
} as const;
export type Reason = keyof typeof REASONS;

export interface AccountFacts {
  accountId: string;
  label: string;
  hasActiveListing: boolean;
  /** what the listing sells for without a sale: the account's own price, else the variant price */
  regularMinor: number;
  /** a sale set by someone else (or another campaign) that is scheduled or running */
  foreignSale: boolean;
  /** highest margin floor of the active pricing policies for the account (basis points; 0 = none) */
  marginFloorBps: number;
  conflictingCampaign: string | null;
  canPush: boolean;
}
export interface VariantFacts { active: boolean; sellingPriceMinor: number | null; costMinor: number | null }

/** `regularMinor` is the price the account sells at without a sale and `promoMinor` the promotional price computed from it (the discount applies to the price the customer really sees) */
export interface AccountVerdict { accountId: string; label: string; ok: boolean; reason?: Reason; message?: string; canPush: boolean; regularMinor: number; promoMinor: number }
export interface Verdict {
  status: 'eligible' | 'ineligible';
  /** the original price the discount is computed from (the variant's selling price, kept as the last known one when it is missing) */
  originalMinor: number;
  promoMinor: number;
  reason: string | null;
  accounts: AccountVerdict[];
}

const fail = (a: AccountFacts, reason: Reason, promoMinor: number, extra?: string): AccountVerdict => ({ accountId: a.accountId, label: a.label, ok: false, reason, message: extra ? `${REASONS[reason]} (${extra})` : REASONS[reason], canPush: a.canPush, regularMinor: a.regularMinor, promoMinor });

/** The eligibility engine for one variant: pure, so every rule is unit-testable. `promoRaw` is the discounted price before checks. */
export function evaluateVariant(v: VariantFacts, lastOriginalMinor: number, promoRaw: number, accounts: AccountFacts[], promoFor?: (basePriceMinor: number) => number): Verdict {
  const base = { originalMinor: v.sellingPriceMinor ?? lastOriginalMinor, promoMinor: v.sellingPriceMinor ?? lastOriginalMinor };
  const variantWide = (reason: Reason): Verdict => ({ status: 'ineligible', ...base, reason: REASONS[reason], accounts: [] });
  if (accounts.length === 0) return variantWide('no_target_accounts');
  if (!v.active) return variantWide('variant_inactive');
  if (v.sellingPriceMinor === null || v.sellingPriceMinor <= 0) return variantWide('no_price');
  if (promoRaw <= 0) return variantWide('price_zero');
  if (promoRaw >= v.sellingPriceMinor) return variantWide('no_discount');
  const promo = promoRaw;
  const verdicts = accounts.map((a): AccountVerdict => {
    // the discount is taken from the price this account really sells at (its own price, else the variant price)
    const own = promoFor && a.regularMinor > 0 ? promoFor(a.regularMinor) : promo;
    if (!a.hasActiveListing) return fail(a, 'no_active_listing', own);
    if (own <= 0) return fail(a, 'price_zero', own);
    if (v.costMinor !== null && own < v.costMinor) return fail(a, 'below_cost', own);
    if (v.costMinor !== null && a.marginFloorBps > 0 && own < marginFloorPrice(v.costMinor, a.marginFloorBps)) return fail(a, 'below_margin_floor', own);
    if (a.conflictingCampaign) return fail(a, 'conflicting_campaign', own, a.conflictingCampaign);
    if (own >= a.regularMinor) return fail(a, 'not_below_regular_price', own);
    if (a.foreignSale) return fail(a, 'existing_sale', own);
    return { accountId: a.accountId, label: a.label, ok: true, canPush: a.canPush, regularMinor: a.regularMinor, promoMinor: own };
  });
  const failed = verdicts.filter((a) => !a.ok);
  const reason = failed.length ? failed.map((a) => `${a.label}: ${a.message}`).join('; ').slice(0, 500) : null;
  // the item shows the lowest price among the accounts that can run it (they all get the same percentage off their own price)
  const shown = (verdicts.some((a) => a.ok) ? verdicts.filter((a) => a.ok) : verdicts).reduce((m, a) => (a.regularMinor > 0 && a.regularMinor < m.regularMinor ? a : m));
  const original = promoFor && shown.regularMinor > 0 ? shown.regularMinor : v.sellingPriceMinor;
  return { status: failed.length < verdicts.length ? 'eligible' : 'ineligible', originalMinor: original, promoMinor: promoFor ? shown.promoMinor : promo, reason, accounts: verdicts };
}

/** two time windows overlap; a missing bound is open-ended */
export function windowsOverlap(aStart: Date | null, aEnd: Date | null, bStart: Date | null, bEnd: Date | null): boolean {
  const startsBeforeBEnds = aStart === null || bEnd === null || aStart < bEnd;
  const endsAfterBStarts = aEnd === null || bStart === null || aEnd > bStart;
  return startsBeforeBEnds && endsAfterBStarts;
}
