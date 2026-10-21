import { describe, expect, it } from 'vitest';
import { evaluateVariant, windowsOverlap, type AccountFacts } from '../../modules/promotions/src/domain/eligibility';
import { stepFor } from '../../modules/promotions/src/domain/lifecycle';
import { budgetExhausted, discountBps, marginFloorPrice, promoPrice, validateTerms, velocityLiftBps, type Terms } from '../../modules/promotions/src/domain/terms';

const t = (o: Partial<Terms> & Pick<Terms, 'type'>): Terms => ({ valueBps: null, valueMinor: null, buyQuantity: null, getQuantity: null, ...o });
const account = (o: Partial<AccountFacts> = {}): AccountFacts => ({ accountId: 'a1', label: 'Amazon', hasActiveListing: true, regularMinor: 100_000, foreignSale: false, marginFloorBps: 0, conflictingCampaign: null, canPush: true, ...o });
const variant = { active: true, sellingPriceMinor: 100_000, costMinor: 40_000 };

describe('promotion terms', () => {
  it('prices a percentage, flat, bogo and bundle discount in whole minor units (half rounds up)', () => {
    expect(promoPrice(t({ type: 'percentage_discount', valueBps: 2000 }), 49_900)).toBe(39_920);
    expect(promoPrice(t({ type: 'percentage_discount', valueBps: 3333 }), 10_001)).toBe(6_668); // 6667.667 -> 6668
    expect(promoPrice(t({ type: 'percentage_discount', valueBps: 5000 }), 101)).toBe(51); // 50.5 -> 51
    expect(promoPrice(t({ type: 'flat_discount', valueMinor: 50_000 }), 249_900)).toBe(199_900);
    expect(promoPrice(t({ type: 'flat_discount', valueMinor: 60_000 }), 50_000)).toBe(-10_000); // refused later by the engine
    expect(promoPrice(t({ type: 'bogo', buyQuantity: 2, getQuantity: 1 }), 30_000)).toBe(20_000); // pay for 2 of 3
    expect(promoPrice(t({ type: 'bundle', valueBps: 1000, buyQuantity: 3 }), 20_000)).toBe(18_000);
  });

  it('is exact for the largest prices (no floating point drift)', () => {
    expect(promoPrice(t({ type: 'percentage_discount', valueBps: 1 }), 100_000_000_000)).toBe(99_990_000_000);
  });

  it('requires the fields of the type and forbids the others', () => {
    const problem = (terms: Terms): string | null => { try { validateTerms(terms); return null; } catch (e) { return JSON.stringify((e as { details: unknown }).details); } };
    expect(problem(t({ type: 'percentage_discount' }))).toMatch(/percentage/);
    expect(problem(t({ type: 'percentage_discount', valueBps: 9600 }))).toMatch(/between 1 and 9500/);
    expect(problem(t({ type: 'percentage_discount', valueBps: 1000, valueMinor: 5 }))).toMatch(/not used/);
    expect(problem(t({ type: 'flat_discount', valueMinor: 0 }))).toMatch(/at least 1/);
    expect(problem(t({ type: 'bogo', buyQuantity: 1 }))).toMatch(/required/);
    expect(problem(t({ type: 'bundle', valueBps: 1000, buyQuantity: 1 }))).toMatch(/2 and 10/);
    expect(problem(t({ type: 'bundle', valueBps: 1000, buyQuantity: 2, getQuantity: 1 }))).toMatch(/not used/);
    expect(problem(t({ type: 'bogo', buyQuantity: 2, getQuantity: 1 }))).toBeNull();
    expect(problem(t({ type: 'percentage_discount' }))).toContain('invalid_terms');
  });

  it('computes the discount, the margin floor, budget exhaustion and the velocity lift', () => {
    expect(discountBps(49_900, 39_920)).toBe(2000);
    expect(marginFloorPrice(40_000, 0)).toBe(40_000);
    expect(marginFloorPrice(40_000, 2000)).toBe(50_000); // 20 % margin on the price
    expect(marginFloorPrice(1, 3333)).toBe(2);
    expect(budgetExhausted(0, 999_999)).toBe(false); // 0 = unlimited
    expect(budgetExhausted(1000, 999)).toBe(false);
    expect(budgetExhausted(1000, 1000)).toBe(true);
    expect(velocityLiftBps(12, 3, 6, 14, 5)).toBe(83_333); // 4/day vs 0.43/day
    expect(velocityLiftBps(12, 3, 4, 14, 5)).toBeNull(); // not enough baseline sales
    expect(velocityLiftBps(12, 0, 6, 14, 5)).toBeNull();
    expect(velocityLiftBps(2, 3, 14, 14, 5)).toBe(-3333); // a drop is reported honestly
  });
});

describe('eligibility engine', () => {
  it('accepts a healthy variant on a listed account', () => {
    const v = evaluateVariant(variant, 100_000, 80_000, [account()]);
    expect(v).toMatchObject({ status: 'eligible', originalMinor: 100_000, promoMinor: 80_000, reason: null });
  });

  it('rejects, with a reason, each way a promotion cannot run', () => {
    const reason = (v: Parameters<typeof evaluateVariant>[0], raw: number, a: AccountFacts[]) => evaluateVariant(v, 100_000, raw, a).reason;
    expect(reason(variant, 80_000, [])).toMatch(/no connected marketplace account/);
    expect(reason({ ...variant, active: false }, 80_000, [account()])).toMatch(/not active/);
    expect(reason({ ...variant, sellingPriceMinor: null }, 80_000, [account()])).toMatch(/no selling price/);
    expect(reason(variant, 0, [account()])).toMatch(/zero or negative/);
    expect(reason(variant, 100_000, [account()])).toMatch(/not lower than the price/);
    expect(reason(variant, 80_000, [account({ hasActiveListing: false })])).toMatch(/Amazon: no active listing/);
    expect(reason(variant, 30_000, [account()])).toMatch(/below the cost price/);
    expect(reason(variant, 55_000, [account({ marginFloorBps: 5000 })])).toMatch(/margin floor/); // 50 % margin needs 80,000
    expect(reason(variant, 80_000, [account({ conflictingCampaign: 'Diwali' })])).toMatch(/another scheduled or active campaign.*Diwali/);
    expect(reason(variant, 80_000, [account({ regularMinor: 70_000 })])).toMatch(/not below the price on this account/);
    expect(reason(variant, 80_000, [account({ foreignSale: true })])).toMatch(/sale is already/);
  });

  it('is eligible when at least one account passes and says what is excluded; ineligible when none do', () => {
    const mixed = evaluateVariant(variant, 100_000, 80_000, [account(), account({ accountId: 'a2', label: 'Flipkart', hasActiveListing: false })]);
    expect(mixed.status).toBe('eligible');
    expect(mixed.reason).toBe('Flipkart: no active listing on this account');
    expect(mixed.accounts.map((a) => a.ok)).toEqual([true, false]);
    expect(evaluateVariant(variant, 100_000, 80_000, [account({ hasActiveListing: false })]).status).toBe('ineligible');
  });

  it('keeps a storable price on ineligible items (the original) and skips the cost checks when the cost is unknown', () => {
    const none = evaluateVariant(variant, 100_000, -5, [account()]);
    expect(none).toMatchObject({ status: 'ineligible', originalMinor: 100_000, promoMinor: 100_000 });
    expect(evaluateVariant({ ...variant, costMinor: null }, 100_000, 1_000, [account({ marginFloorBps: 5000 })]).status).toBe('eligible');
  });

  it('knows when two windows overlap (a missing bound is open-ended)', () => {
    const d = (n: number) => new Date(2026, 9, n);
    expect(windowsOverlap(d(1), d(10), d(5), d(15))).toBe(true);
    expect(windowsOverlap(d(1), d(10), d(10), d(15))).toBe(false); // touching is not overlapping
    expect(windowsOverlap(d(1), d(10), d(11), d(15))).toBe(false);
    expect(windowsOverlap(null, null, d(11), d(15))).toBe(true);
    expect(windowsOverlap(d(1), null, d(11), d(15))).toBe(true);
    expect(windowsOverlap(d(20), null, d(11), d(15))).toBe(false);
  });
});

describe('lifecycle', () => {
  it('allows the documented moves, treats a repeat as a no-op and refuses the rest', () => {
    expect(stepFor('schedule', 'draft')).toBe('apply');
    expect(stepFor('schedule', 'scheduled')).toBe('noop');
    expect(stepFor('schedule', 'active')).toBe('noop');
    expect(stepFor('schedule', 'ended')).toBe('invalid');
    expect(stepFor('activate', 'scheduled')).toBe('apply');
    expect(stepFor('activate', 'active')).toBe('noop');
    expect(stepFor('activate', 'cancelled')).toBe('invalid');
    expect(stepFor('end', 'active')).toBe('apply');
    expect(stepFor('end', 'ended')).toBe('noop');
    expect(stepFor('end', 'scheduled')).toBe('invalid');
    expect(stepFor('cancel', 'draft')).toBe('apply');
    expect(stepFor('cancel', 'active')).toBe('invalid');
    expect(stepFor('cancel', 'cancelled')).toBe('noop');
  });
});
