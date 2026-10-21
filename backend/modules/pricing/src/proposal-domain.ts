/**
 * Pure maths of price proposals. Money is integer minor units, rates are basis points. Nothing here touches the database.
 *
 * Unit margin of a price p:  p - cost - round(p * feeBps / 10000) - fixedFee   (the marketplace commission comes from the account's
 * fee profile; without a profile the fee is 0 and the margin is the gross margin over cost).
 */
export interface FeeTerms { feeBps: number; fixedMinor: number }
export const NO_FEES: FeeTerms = { feeBps: 0, fixedMinor: 0 };

/** what one unit sold at `price` leaves after cost and marketplace fees; null when the cost is unknown */
export function unitContribution(price: number, costMinor: number | null, fees: FeeTerms): number | null {
  if (costMinor === null) return null;
  return price - costMinor - Math.round((price * fees.feeBps) / 10_000) - fees.fixedMinor;
}

/** contribution as basis points of the price (can be negative); null when the cost is unknown */
export function marginBps(price: number, costMinor: number | null, fees: FeeTerms): number | null {
  const c = unitContribution(price, costMinor, fees);
  return c === null || price <= 0 ? null : Math.round((c * 10_000) / price);
}

/** change of the margin in basis points when the price moves from `current` to `proposed`; null when the cost is unknown */
export function marginDeltaBps(current: number, proposed: number, costMinor: number | null, fees: FeeTerms): number | null {
  const a = marginBps(current, costMinor, fees);
  const b = marginBps(proposed, costMinor, fees);
  return a === null || b === null ? null : b - a;
}

/**
 * Lowest price that still earns `minMarginBps` after cost and fees: p >= (cost + fixed) / (1 - fee - margin).
 * null = no such price exists (fees plus margin swallow the whole price) or the cost is unknown.
 */
export function priceForMargin(costMinor: number | null, minMarginBps: number, fees: FeeTerms): number | null {
  if (costMinor === null) return null;
  const keep = 10_000 - fees.feeBps - minMarginBps;
  if (keep <= 0) return null;
  return Math.ceil(((costMinor + fees.fixedMinor) * 10_000) / keep);
}

/** the lowest price a decrease may reach: the larger of the margin floor and (current - max discount) */
export function lowerBound(current: number, costMinor: number | null, p: { targetMarginMinBps: number; maxDiscountBps: number }, fees: FeeTerms): number {
  const byDiscount = Math.ceil((current * (10_000 - p.maxDiscountBps)) / 10_000);
  const byMargin = p.targetMarginMinBps > 0 ? priceForMargin(costMinor, p.targetMarginMinBps, fees) : null;
  return Math.max(byDiscount, byMargin ?? 0, 1);
}

/** how far the price moves, in basis points of the current price (signed) */
export const moveBps = (current: number, proposed: number): number => Math.round(((proposed - current) * 10_000) / current);

/**
 * Projected change of unit sales for a price move, in basis points. Constant price elasticity (a stated assumption, `params.elasticity`,
 * default 1.5: a 10% cut sells about 15% more). Only given when the variant has sold at least `minUnits` in the history window:
 * a number made from no sales would be a guess, so it is null instead.
 */
export function projectedSalesDeltaBps(current: number, proposed: number, unitsInWindow: number, o: { elasticity?: number; minUnits?: number } = {}): number | null {
  if (unitsInWindow < (o.minUnits ?? MIN_HISTORY_UNITS)) return null;
  const e = o.elasticity ?? DEFAULT_ELASTICITY;
  return Math.max(-9_000, Math.min(20_000, Math.round(-e * moveBps(current, proposed))));
}
export const MIN_HISTORY_UNITS = 3;
export const DEFAULT_ELASTICITY = 1.5;
export const HISTORY_DAYS = 30;

/** monthly contribution gain of a proposal: (new unit contribution x projected units) - (old unit contribution x units), null when unknown */
export function monthlyGainMinor(current: number, proposed: number, costMinor: number | null, fees: FeeTerms, unitsPerMonth: number, salesDeltaBps: number | null): number | null {
  const before = unitContribution(current, costMinor, fees);
  const after = unitContribution(proposed, costMinor, fees);
  if (before === null || after === null) return null;
  const units = unitsPerMonth * (1 + (salesDeltaBps ?? 0) / 10_000);
  return Math.round(after * units - before * unitsPerMonth);
}

// ---------------------------------------------------------------- strategies
export type Strategy = 'automated_match' | 'margin_floor' | 'velocity_boost' | 'custom';
export interface PolicyView { id: string; name: string; strategy: Strategy; targetMarginMinBps: number; maxDiscountBps: number; autoApproveUnderBps: number; params: Record<string, unknown> }
export interface Subject {
  currentMinor: number; mrpMinor: number | null; costMinor: number | null; fees: FeeTerms;
  competitorMinor: number | null; unitsInWindow: number; availableUnits: number;
}
export type Decision = { kind: 'propose'; proposedMinor: number; reasoning: string } | { kind: 'none'; reason: string };

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const rupees = (minor: number): string => `Rs ${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (bps: number): string => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

/**
 * Evaluate ONE policy for ONE variant on ONE account. A decrease never goes under the margin floor nor further than the maximum
 * discount; a raise never goes above the MRP. Moves smaller than `params.minChangeBps` (default 50 = 0.5%) are noise and ignored.
 */
export function decide(policy: PolicyView, s: Subject): Decision {
  const { currentMinor: cur } = s;
  const lower = lowerBound(cur, s.costMinor, policy, s.fees);
  const upper = Math.min(s.mrpMinor ?? Number.MAX_SAFE_INTEGER, Math.floor((cur * (10_000 + num(policy.params.maxIncreaseBps, 5_000))) / 10_000));
  let target: number;
  let why: string;
  switch (policy.strategy) {
    case 'automated_match': {
      if (s.competitorMinor === null) return { kind: 'none', reason: 'no competitor price on record' };
      const undercut = num(policy.params.undercutBps, 0);
      target = Math.round((s.competitorMinor * (10_000 - undercut)) / 10_000);
      why = `Competitor price is ${rupees(s.competitorMinor)}${undercut > 0 ? `; targeting ${pct(undercut)} below it` : '; matching it'}.`;
      if (target > cur && policy.params.allowIncrease === false) return { kind: 'none', reason: 'competitor is above the current price and raising is not allowed by this policy' };
      break;
    }
    case 'margin_floor': {
      const floor = policy.targetMarginMinBps > 0 ? priceForMargin(s.costMinor, policy.targetMarginMinBps, s.fees) : null;
      if (floor === null) return { kind: 'none', reason: s.costMinor === null ? 'the variant has no cost price' : 'no margin floor can be met at any price' };
      const now = marginBps(cur, s.costMinor, s.fees);
      if (now !== null && now >= policy.targetMarginMinBps) return { kind: 'none', reason: 'margin is already at or above the floor' };
      target = floor;
      why = `Current margin ${now === null ? 'is unknown' : pct(now)} is below the ${pct(policy.targetMarginMinBps)} floor; this is the lowest price that restores it.`;
      break;
    }
    case 'velocity_boost': {
      const slow = num(policy.params.slowUnits, 5);
      const minStock = num(policy.params.minStock, 10);
      if (s.unitsInWindow >= slow) return { kind: 'none', reason: 'the variant sells fast enough' };
      if (s.availableUnits < minStock) return { kind: 'none', reason: 'not enough stock to justify a discount' };
      const step = num(policy.params.stepBps, 500);
      target = Math.round((cur * (10_000 - step)) / 10_000);
      why = `Only ${s.unitsInWindow} unit${s.unitsInWindow === 1 ? '' : 's'} sold in the last ${HISTORY_DAYS} days with ${s.availableUnits} in stock; a ${pct(step)} reduction should speed it up.`;
      break;
    }
    case 'custom': {
      const wanted = num(policy.params.targetMarginBps, NaN);
      const p = Number.isNaN(wanted) ? null : priceForMargin(s.costMinor, wanted, s.fees);
      if (p === null) return { kind: 'none', reason: 'a custom policy needs params.targetMarginBps and a cost price' };
      target = p;
      why = `Price that earns the ${pct(wanted)} target margin.`;
      break;
    }
  }
  if (policy.strategy === 'margin_floor' && target > upper) return { kind: 'none', reason: 'the margin floor cannot be reached without going above the MRP' };
  let clamped: number;
  if (target >= cur) {
    if (upper <= cur) return { kind: 'none', reason: 'the price is already at the highest the MRP and policy allow' };
    clamped = Math.min(upper, target);
  } else {
    if (lower >= cur) return { kind: 'none', reason: 'the price is already at the lowest the guardrails allow' };
    clamped = Math.max(lower, target);
  }
  const note = clamped !== target ? ` Limited to ${rupees(clamped)} by the policy guardrails (margin floor ${pct(policy.targetMarginMinBps)}, maximum discount ${pct(policy.maxDiscountBps)}, MRP).` : '';
  if (Math.abs(moveBps(cur, clamped)) < num(policy.params.minChangeBps, 50)) return { kind: 'none', reason: 'the change is too small to matter' };
  return { kind: 'propose', proposedMinor: clamped, reasoning: `${policy.name}: ${why}${note}` };
}
