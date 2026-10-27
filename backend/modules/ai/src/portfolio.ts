import type { Tx } from '@oms/database';
import { profitability } from '@oms/mod-analytics';
import type { IntelItem } from './intelligence';

export interface DayRange { from: string; to: string }
const DAY = 86_400_000;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** the last 30 days unless a range is given; a range is at most 366 days */
export function portfolioRange(q: { from?: string; to?: string }): DayRange {
  const to = q.to ?? day(new Date());
  const from = q.from ?? day(new Date(Date.parse(to) - 29 * DAY));
  const span = (Date.parse(to) - Date.parse(from)) / DAY;
  if (Number.isNaN(span) || span < 0 || span > 365) throw new Error('invalid_range');
  return { from, to };
}

const TOP = 6;

/**
 * The portfolio behind the Product Intelligence strip and charts, for one range: what sold (net of discounts, before tax and shipping), the gross
 * margin (revenue less product cost; null until every sold line has a cost, never a guess), how many products need a decision and how the sales
 * split over the top products. Built from the profitability service so its numbers equal the Profitability screen.
 */
export async function portfolioSummary(tx: Tx, vendorId: string, r: DayRange, items: IntelItem[]) {
  const p = await profitability(tx, vendorId, r, 'product');
  const revenue = p.total.revenue.amountMinor ?? 0;
  const cost = p.total.productCost;
  const costKnown = revenue > 0 && cost.amountMinor !== null && cost.coverage >= 1;
  const grossProfitMinor = costKnown ? revenue - (cost.amountMinor ?? 0) : null;
  const orders = p.ordersInRange;
  const byVariant = new Map(items.map((i) => [i.variantId, i]));
  const top = p.groups.slice(0, TOP);
  const topRevenue = top.reduce((s, g) => s + (g.revenue.amountMinor ?? 0), 0);
  return {
    range: r,
    netSalesMinor: revenue, orders, averageOrderValueMinor: orders > 0 ? Math.round(revenue / orders) : 0,
    grossProfitMinor, grossMarginBps: grossProfitMinor === null ? null : Math.round((grossProfitMinor / revenue) * 10_000), costCoverage: cost.coverage,
    unitsSold: p.groups.reduce((s, g) => s + g.unitsSold, 0),
    prioritizedCount: items.filter((i) => i.recommendedAction !== 'hold').length,
    totalProducts: items.length,
    salesShare: top.map((g) => {
      const item = byVariant.get(g.key);
      return {
        variantId: item?.variantId ?? null, sku: g.label, title: item?.productName ?? g.title, category: item?.category ?? null, revenueMinor: g.revenue.amountMinor ?? 0, unitsSold: g.unitsSold,
        shareBps: revenue > 0 ? Math.round(((g.revenue.amountMinor ?? 0) / revenue) * 10_000) : 0, available: item?.inventory.available ?? null, runwayDays: item?.inventory.runwayDays ?? null,
      };
    }),
    otherShareBps: revenue > 0 ? Math.max(0, 10_000 - Math.round((topRevenue / revenue) * 10_000)) : 0,
    truncated: p.truncated,
  };
}
