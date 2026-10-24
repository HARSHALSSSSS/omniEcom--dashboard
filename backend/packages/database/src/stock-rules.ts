import { sql, type SQL } from 'drizzle-orm';

/**
 * The ONE definition of "low stock", shared by the inventory screen (tabs, signals, KPIs) and the issue queue (Needs attention, the dashboard
 * card): a variant that still has something to sell (available > 0) and either
 *   - is at or under its reorder level (the largest reorder level of its warehouses), or the business low-stock threshold when it has none, or
 *   - would run out before more stock can arrive (units per day over the sales window: cover < lead time).
 * Nothing available is "out of stock", which is counted apart. Available = on hand - reserved over the active warehouses.
 */
export const LOW_STOCK_SALES_WINDOW_DAYS = 14;
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;
export const DEFAULT_LEAD_TIME_DAYS = 7;

export interface LowStockColumns { available: SQL; reorder: SQL; threshold: SQL; perDay: SQL; leadDays: SQL }

export function lowStockRule(c: LowStockColumns): SQL {
  return sql`(${c.available} > 0 and ((coalesce(${c.reorder}, ${c.threshold}) is not null and ${c.available} <= coalesce(${c.reorder}, ${c.threshold})) or (${c.perDay} > 0 and ${c.available} / ${c.perDay} < ${c.leadDays})))`;
}

/** the same rule over plain numbers (for code that already holds them, and for the tests that pin the definition) */
export function isLowStock(i: { available: number; reorder: number | null; threshold: number | null; unitsPerDay: number; leadDays: number }): boolean {
  if (i.available <= 0) return false;
  const level = i.reorder ?? i.threshold;
  if (level !== null && i.available <= level) return true;
  return i.unitsPerDay > 0 && i.available / i.unitsPerDay < i.leadDays;
}
