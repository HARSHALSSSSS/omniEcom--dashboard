import { Errors } from '@oms/shared';

export type PromotionType = 'percentage_discount' | 'flat_discount' | 'bogo' | 'bundle';

/** What the discount is: percentage in basis points, flat in minor units, bogo as buy X get Y, bundle as a percentage off a set of N items. */
export interface Terms {
  type: PromotionType;
  valueBps: number | null;
  valueMinor: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
}

export const MAX_PERCENT_BPS = 9500;
export const MAX_SET_SIZE = 10;

const issue = (path: string, message: string) => Errors.validation({ rule: 'invalid_terms', issues: [{ path, message }] });

/** every type has the fields it needs and none of the others (a percentage campaign cannot carry a flat amount) */
export function validateTerms(t: Terms): void {
  const has = (v: number | null) => v !== null;
  const forbid = (path: string, v: number | null) => { if (has(v)) throw issue(path, `not used by a ${t.type} campaign`); };
  switch (t.type) {
    case 'percentage_discount':
      if (!has(t.valueBps)) throw issue('valueBps', 'the percentage (in basis points) is required');
      if (t.valueBps! < 1 || t.valueBps! > MAX_PERCENT_BPS) throw issue('valueBps', `must be between 1 and ${MAX_PERCENT_BPS} basis points`);
      forbid('valueMinor', t.valueMinor); forbid('buyQuantity', t.buyQuantity); forbid('getQuantity', t.getQuantity);
      return;
    case 'flat_discount':
      if (!has(t.valueMinor)) throw issue('valueMinor', 'the discount amount (minor units) is required');
      if (t.valueMinor! < 1) throw issue('valueMinor', 'must be at least 1');
      forbid('valueBps', t.valueBps); forbid('buyQuantity', t.buyQuantity); forbid('getQuantity', t.getQuantity);
      return;
    case 'bogo':
      if (!has(t.buyQuantity) || !has(t.getQuantity)) throw issue('buyQuantity', 'buy and get quantities are required');
      if (t.buyQuantity! < 1 || t.buyQuantity! > MAX_SET_SIZE) throw issue('buyQuantity', `must be between 1 and ${MAX_SET_SIZE}`);
      if (t.getQuantity! < 1 || t.getQuantity! > MAX_SET_SIZE) throw issue('getQuantity', `must be between 1 and ${MAX_SET_SIZE}`);
      forbid('valueBps', t.valueBps); forbid('valueMinor', t.valueMinor);
      return;
    case 'bundle':
      if (!has(t.valueBps)) throw issue('valueBps', 'the bundle discount (basis points) is required');
      if (t.valueBps! < 1 || t.valueBps! > MAX_PERCENT_BPS) throw issue('valueBps', `must be between 1 and ${MAX_PERCENT_BPS} basis points`);
      if (!has(t.buyQuantity)) throw issue('buyQuantity', 'the number of items in the bundle is required');
      if (t.buyQuantity! < 2 || t.buyQuantity! > MAX_SET_SIZE) throw issue('buyQuantity', `a bundle has between 2 and ${MAX_SET_SIZE} items`);
      forbid('valueMinor', t.valueMinor); forbid('getQuantity', t.getQuantity);
  }
}

/**
 * The per-unit price a customer pays under the campaign, as an integer in minor units (half rounds up). It may be zero or negative
 * for a flat discount larger than the price: the eligibility engine rejects those. Marketplaces take one price per listing, so a
 * buy-X-get-Y campaign is applied as its effective unit price (buy 2 get 1 = two thirds of the price) and a bundle as its
 * percentage off; coupon-style conditions cannot be pushed to a marketplace.
 */
export function promoPrice(t: Terms, originalMinor: number): number {
  switch (t.type) {
    case 'percentage_discount':
    case 'bundle':
      return Math.floor((originalMinor * (10_000 - t.valueBps!) + 5_000) / 10_000);
    case 'flat_discount':
      return originalMinor - t.valueMinor!;
    case 'bogo': {
      const set = t.buyQuantity! + t.getQuantity!;
      return Math.floor((originalMinor * t.buyQuantity! * 2 + set) / (2 * set));
    }
  }
}

/** how much of the price the customer saves, in basis points of the original price */
export const discountBps = (originalMinor: number, promoMinor: number): number => (originalMinor > 0 ? Math.round(((originalMinor - promoMinor) * 10_000) / originalMinor) : 0);

/** the lowest price that still keeps a margin of `marginBps` on the price (price = cost / (1 - margin)); rounded up */
export function marginFloorPrice(costMinor: number, marginBps: number): number {
  if (marginBps <= 0) return costMinor;
  if (marginBps >= 10_000) return Number.MAX_SAFE_INTEGER;
  return Math.ceil((costMinor * 10_000) / (10_000 - marginBps));
}

/** the campaign has spent its whole budget (a budget of 0 means unlimited) */
export const budgetExhausted = (budgetMinor: number, spendMinor: number): boolean => budgetMinor > 0 && spendMinor >= budgetMinor;

/** velocity lift (basis points) from two sales rates; null without enough baseline sales to compare against */
export function velocityLiftBps(promoUnits: number, promoDays: number, baselineUnits: number, baselineDays: number, minBaselineUnits: number): number | null {
  if (promoDays <= 0 || baselineDays <= 0 || baselineUnits < minBaselineUnits) return null;
  const promoRate = promoUnits / promoDays;
  const baseRate = baselineUnits / baselineDays;
  return Math.round((promoRate / baseRate - 1) * 10_000);
}
