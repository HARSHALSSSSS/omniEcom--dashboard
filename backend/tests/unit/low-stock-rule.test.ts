import { describe, expect, it } from 'vitest';
import { isLowStock } from '@oms/database';

describe('the one low-stock rule (Inventory tabs, dashboard card, Needs attention, issues)', () => {
  const base = { reorder: null, threshold: 5, unitsPerDay: 0, leadDays: 7 };
  it('needs something left to sell: nothing available is out of stock, not low', () => {
    expect(isLowStock({ ...base, available: 0 })).toBe(false);
    expect(isLowStock({ ...base, available: -2, reorder: 10 })).toBe(false);
  });
  it('is at or under the reorder level, else the business threshold', () => {
    expect(isLowStock({ ...base, available: 5 })).toBe(true);
    expect(isLowStock({ ...base, available: 6 })).toBe(false);
    expect(isLowStock({ ...base, available: 8, reorder: 8 })).toBe(true);
    expect(isLowStock({ ...base, available: 6, reorder: 3 })).toBe(false); // its own level beats the business default
  });
  it('is also low when the cover is shorter than the lead time', () => {
    expect(isLowStock({ ...base, available: 20, unitsPerDay: 4, leadDays: 7 })).toBe(true); // 5 days of cover, 7 days to restock
    expect(isLowStock({ ...base, available: 28, unitsPerDay: 4, leadDays: 7 })).toBe(false);
    expect(isLowStock({ ...base, available: 6, unitsPerDay: 0, leadDays: 7 })).toBe(false); // no sales: no cover to speak of
  });
});
