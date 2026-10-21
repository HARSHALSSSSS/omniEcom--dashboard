import { describe, expect, it } from 'vitest';
import { decide, lowerBound, marginBps, marginDeltaBps, monthlyGainMinor, priceForMargin, projectedSalesDeltaBps, unitContribution, type PolicyView, type Subject } from '../../modules/pricing/src/proposal-domain';
import { parseCsvLine, rupeesToMinor } from '../../modules/pricing/src/competitors';

const fees = { feeBps: 1000, fixedMinor: 0 };
const subject = (o: Partial<Subject> = {}): Subject => ({ currentMinor: 49_900, mrpMinor: 59_900, costMinor: 30_000, fees, competitorMinor: null, unitsInWindow: 0, availableUnits: 50, ...o });
const policy = (o: Partial<PolicyView> = {}): PolicyView => ({ id: 'p1', name: 'Match', strategy: 'automated_match', targetMarginMinBps: 2_000, maxDiscountBps: 2_000, autoApproveUnderBps: 0, params: {}, ...o });

describe('margin maths (integer minor units, fee profile)', () => {
  it('unit contribution and margin', () => {
    expect(unitContribution(49_900, 30_000, fees)).toBe(14_910); // 49900 - 30000 - 4990
    expect(marginBps(49_900, 30_000, fees)).toBe(2_988);
    expect(marginBps(49_900, null, fees)).toBeNull();
    expect(marginDeltaBps(49_900, 44_900, 30_000, fees)).toBe(2_318 - 2_988);
    expect(marginDeltaBps(49_900, 44_900, null, fees)).toBeNull();
  });
  it('lowest price that keeps a margin, with a fixed fee', () => {
    expect(priceForMargin(30_000, 2_000, fees)).toBe(42_858); // 30000 / (1 - 0.10 - 0.20)
    expect(priceForMargin(30_000, 2_000, { feeBps: 1000, fixedMinor: 700 })).toBe(43_858);
    expect(priceForMargin(30_000, 9_500, fees)).toBeNull(); // fees + margin swallow the price
    expect(priceForMargin(null, 2_000, fees)).toBeNull();
    const p = priceForMargin(30_000, 2_000, fees)!;
    expect(unitContribution(p, 30_000, fees)! * 10_000).toBeGreaterThanOrEqual(p * 2_000);
    expect(unitContribution(p - 1, 30_000, fees)! * 10_000).toBeLessThan((p - 1) * 2_000); // the floor is the exact lowest price
  });
  it('a decrease is bounded by the margin floor and the maximum discount', () => {
    expect(lowerBound(49_900, 30_000, { targetMarginMinBps: 2_000, maxDiscountBps: 2_000 }, fees)).toBe(42_858);
    expect(lowerBound(49_900, 30_000, { targetMarginMinBps: 0, maxDiscountBps: 1_000 }, fees)).toBe(44_910);
    expect(lowerBound(49_900, null, { targetMarginMinBps: 2_000, maxDiscountBps: 0 }, fees)).toBe(49_900); // 0 = no decreases
  });
});

describe('projected sales effect', () => {
  it('is null without enough history, an elasticity estimate with it', () => {
    expect(projectedSalesDeltaBps(49_900, 44_900, 2)).toBeNull();
    expect(projectedSalesDeltaBps(49_900, 44_900, 3)).toBe(1_503); // -1.5 x -1002 bps
    expect(projectedSalesDeltaBps(49_900, 44_900, 3, { elasticity: 2 })).toBe(2_004);
    expect(projectedSalesDeltaBps(49_900, 54_890, 10)).toBe(-1_500);
  });
  it('monthly gain weights the unit gain by sales', () => {
    expect(monthlyGainMinor(49_900, 53_000, 30_000, fees, 10, null)).toBe(Math.round((53_000 - 30_000 - 5_300) * 10 - 14_910 * 10));
    expect(monthlyGainMinor(49_900, 53_000, null, fees, 10, null)).toBeNull();
  });
});

describe('policy decisions', () => {
  it('automated_match: nothing without a competitor price', () => {
    expect(decide(policy(), subject())).toEqual({ kind: 'none', reason: 'no competitor price on record' });
  });
  it('automated_match: follows the competitor, never below the guardrails', () => {
    const d = decide(policy(), subject({ competitorMinor: 46_000 }));
    expect(d).toMatchObject({ kind: 'propose', proposedMinor: 46_000 });
    const clamped = decide(policy(), subject({ competitorMinor: 38_000 }));
    expect(clamped).toMatchObject({ kind: 'propose', proposedMinor: 42_858 });
    expect((clamped as { reasoning: string }).reasoning).toContain('Limited to');
    expect(decide(policy({ params: { undercutBps: 100 } }), subject({ competitorMinor: 46_000 }))).toMatchObject({ proposedMinor: 45_540 });
  });
  it('automated_match: a higher competitor raises the price up to the MRP unless raising is switched off', () => {
    expect(decide(policy(), subject({ competitorMinor: 58_000 }))).toMatchObject({ kind: 'propose', proposedMinor: 58_000 });
    expect(decide(policy(), subject({ competitorMinor: 80_000 }))).toMatchObject({ kind: 'propose', proposedMinor: 59_900 }); // MRP
    expect(decide(policy({ params: { allowIncrease: false } }), subject({ competitorMinor: 58_000 })).kind).toBe('none');
  });
  it('ignores noise and prices already at the limit', () => {
    expect(decide(policy(), subject({ competitorMinor: 49_800 })).kind).toBe('none'); // 0.2% move
    expect(decide(policy(), subject({ currentMinor: 42_858, competitorMinor: 30_000 }))).toMatchObject({ kind: 'none', reason: expect.stringContaining('lowest') });
    expect(decide(policy({ maxDiscountBps: 0 }), subject({ competitorMinor: 40_000 })).kind).toBe('none');
  });
  it('margin_floor raises only what earns too little', () => {
    const p = policy({ strategy: 'margin_floor', targetMarginMinBps: 3_500 });
    expect(decide(p, subject())).toMatchObject({ kind: 'propose', proposedMinor: Math.ceil(30_000 / (1 - 0.1 - 0.35)) });
    expect(decide(policy({ strategy: 'margin_floor', targetMarginMinBps: 2_000 }), subject()).kind).toBe('none');
    expect(decide(p, subject({ costMinor: null })).kind).toBe('none');
    expect(decide(p, subject({ mrpMinor: 52_000 }))).toMatchObject({ kind: 'none', reason: expect.stringContaining('MRP') });
  });
  it('velocity_boost needs a slow mover with stock', () => {
    const p = policy({ strategy: 'velocity_boost', params: { stepBps: 500 } });
    expect(decide(p, subject({ unitsInWindow: 1 }))).toMatchObject({ kind: 'propose', proposedMinor: 47_405 });
    expect(decide(p, subject({ unitsInWindow: 20 })).kind).toBe('none');
    expect(decide(p, subject({ unitsInWindow: 1, availableUnits: 3 })).kind).toBe('none');
  });
  it('custom prices for a target margin', () => {
    const p = policy({ strategy: 'custom', targetMarginMinBps: 0, maxDiscountBps: 10_000, params: { targetMarginBps: 3_000 } });
    const d = decide(p, subject({ currentMinor: 55_000 })) as { proposedMinor: number };
    expect(d.proposedMinor).toBe(Math.ceil(30_000 / 0.6));
    expect(decide(policy({ strategy: 'custom' }), subject()).kind).toBe('none');
  });
});

describe('competitor CSV helpers', () => {
  it('parses quoted cells and rupee amounts without floats', () => {
    expect(parseCsvLine('SKU-1,"1,299.50","Seller, Inc"')).toEqual(['SKU-1', '1,299.50', 'Seller, Inc']);
    expect(rupeesToMinor('499')).toBe(49_900);
    expect(rupeesToMinor('1,299.5')).toBe(129_950);
    expect(rupeesToMinor('Rs. 499.05')).toBe(49_905);
    expect(rupeesToMinor('0')).toBeNull();
    expect(rupeesToMinor('-5')).toBeNull();
    expect(rupeesToMinor('12.345')).toBeNull();
    expect(rupeesToMinor('abc')).toBeNull();
  });
});
