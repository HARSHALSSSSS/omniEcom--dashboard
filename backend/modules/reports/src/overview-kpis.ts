import type { Tx } from '@oms/database';
import { AppError } from '@oms/shared';
import { previousRange, profitability, type Profit } from '@oms/mod-analytics';
import { marketplacesReport, returnsReport, salesReport, type Period } from './queries';

const DAY = 86_400_000;
export const COMPARES = ['none', 'previous', 'previous_year'] as const;
export type Compare = (typeof COMPARES)[number];
export interface DayRange { from: string; to: string } // inclusive UTC dates

const bps = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 10_000) : null);
const change = (cur: number, prev: number): number | null => (prev > 0 ? Math.round(((cur - prev) / prev) * 10_000) : null);
const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/** the default window is the last 30 days; a range is at most 366 days */
export function parseRange(q: { from?: string; to?: string }): DayRange {
  const to = q.to ?? dayOf(new Date());
  const from = q.from ?? dayOf(new Date(Date.parse(to) - 29 * DAY));
  const span = (Date.parse(to) - Date.parse(from)) / DAY;
  if (Number.isNaN(span)) throw new AppError('BAD_REQUEST', '`from` and `to` must be real dates (YYYY-MM-DD)');
  if (span < 0) throw new AppError('BAD_REQUEST', '`from` must not be after `to`');
  if (span > 365) throw new AppError('BAD_REQUEST', 'A report range is at most 366 days');
  return { from, to };
}

/** the same number of days right before the range, or the same dates one year earlier */
export function comparisonRange(r: DayRange, compare: Compare): DayRange | null {
  if (compare === 'none') return null;
  if (compare === 'previous') return previousRange(r);
  const back = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCFullYear(x.getUTCFullYear() - 1); return dayOf(x); };
  return { from: back(r.from), to: back(r.to) };
}

/** day buckets up to a month, week buckets up to four months, month buckets beyond */
export const autoPeriod = (r: DayRange): Period => {
  const days = (Date.parse(r.to) - Date.parse(r.from)) / DAY + 1;
  return days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
};

const windowOf = (r: DayRange) => ({ from: new Date(`${r.from}T00:00:00Z`), to: new Date(Date.parse(`${r.to}T00:00:00Z`) + DAY) });

async function figures(tx: Tx, vendorId: string, r: DayRange, period: Period) {
  const w = windowOf(r);
  const sales = await salesReport(tx, vendorId, w, { period });
  const returns = await returnsReport(tx, vendorId, w);
  const pg = await profitability(tx, vendorId, r, 'marketplace');
  const profit: Profit = pg.total;
  const channelMarginBps = new Map(pg.groups.map((g) => [g.key, g.marginPercent === null ? null : Math.round(g.marginPercent * 100)]));
  const t = sales.totals;
  const refundsMinor = returns.refunds.filter((x) => x.status === 'processed').reduce((s, x) => s + x.amountMinor, 0);
  return {
    sales, channelMarginBps,
    totals: {
      orders: t.orders, units: t.units, grossMinor: t.grossMinor, taxMinor: t.taxMinor, shippingMinor: t.shippingMinor, discountMinor: t.discountMinor,
      /** what the goods earned: order subtotal less discounts, before tax and shipping */
      netSalesMinor: t.subtotalMinor - t.discountMinor, averageOrderValueMinor: t.averageOrderValueMinor,
    },
    refunds: { amountMinor: refundsMinor, rateBps: bps(refundsMinor, t.grossMinor), returns: returns.totals.returns },
    margin: {
      /** null while a cost is missing: the share of revenue whose product cost is known is `coverage` */
      marginBps: profit.marginPercent === null ? null : Math.round(profit.marginPercent * 100),
      contributionMinor: profit.contributionMinor, coverage: profit.productCost.coverage, completeness: profit.completeness, missing: profit.missing,
    },
  };
}

/** one aggregated read for the Reports overview: totals, the same for the comparison range, refunds, margin, the trend and the channels (all from the report and analytics services) */
export async function overviewKpis(tx: Tx, vendorId: string, r: DayRange, compare: Compare, periodOverride?: Period) {
  const period = periodOverride ?? autoPeriod(r);
  const cur = await figures(tx, vendorId, r, period);
  const pr = comparisonRange(r, compare);
  const prev = pr ? await figures(tx, vendorId, pr, period) : null;
  const accounts = (await marketplacesReport(tx, vendorId, windowOf(r))).accounts;
  const prevByChannel = new Map((prev?.sales.byMarketplace ?? []).map((c) => [c.marketplace, c]));
  const total = cur.totals.grossMinor;
  return {
    range: r, previousRange: pr, compare, period,
    totals: cur.totals, previous: prev?.totals ?? null,
    refunds: cur.refunds, previousRefunds: prev?.refunds ?? null,
    margin: cur.margin, previousMargin: prev?.margin ?? null,
    series: cur.sales.series, previousSeries: prev?.sales.series ?? null,
    channels: cur.sales.byMarketplace.map((c) => {
      const p = prevByChannel.get(c.marketplace);
      return {
        marketplace: c.marketplace, orders: c.orders, grossMinor: c.grossMinor, shareBps: bps(c.grossMinor, total) ?? 0,
        averageOrderValueMinor: c.orders > 0 ? Math.round(c.grossMinor / c.orders) : 0, marginBps: cur.channelMarginBps.get(c.marketplace) ?? null,
        previousGrossMinor: pr ? (p?.grossMinor ?? 0) : null, changeBps: pr ? change(c.grossMinor, p?.grossMinor ?? 0) : null,
      };
    }),
    connectedAccounts: accounts.filter((a) => a.status === 'active').length, totalAccounts: accounts.length,
  };
}
