import type { Tx } from '@oms/database';
import { collectProfit, comp, computeProfit, type Basis, type Component, type Profit, type Range } from './profit';
import { previousRange } from './queries';
import { advertisingSpend, type SpendTotals } from './spend';

/**
 * The P&L bridge of the profitability screen: gross revenue down to net contribution, one step per cost bucket, each step saying
 * whether its amount is actual, estimated or missing. Nothing is rounded into existence: a step without data is null.
 */
export interface Delta { changeMinor: number | null; changePercent: number | null }
export const delta = (cur: number | null, prev: number | null): Delta => ({
  changeMinor: cur === null || prev === null ? null : cur - prev,
  changePercent: cur === null || prev === null || prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10,
});

/** advertising is known only once the seller has recorded some spend in the range (a recorded 0 counts: it says "no ads") */
export const adComponent = (s: SpendTotals): Component => (s.rows > 0 ? comp(s.totalMinor, 'actual', 1) : comp(null, 'missing', 0));
const channelAd = (s: SpendTotals, marketplace: string): Component => (s.rows > 0 ? comp(s.byMarketplace.get(marketplace) ?? 0, 'actual', 1) : comp(null, 'missing', 0));

const CHANNEL_LABELS: Record<string, string> = { amazon_in: 'Amazon', flipkart: 'Flipkart', myntra: 'Myntra', snapdeal: 'Snapdeal', shopify: 'Shopify', meesho: 'Meesho', mock: 'Sandbox' };
export const channelLabel = (code: string): string => CHANNEL_LABELS[code] ?? code;

const worst = (...b: Basis[]): Basis => (b.includes('missing') ? 'missing' : b.includes('estimated') ? 'estimated' : 'actual');
const pct = (v: number | null, of: number): number | null => (v === null || of <= 0 ? null : Math.round((Math.abs(v) / of) * 1000) / 10);
const neg = (v: number | null): number | null => (v === null ? null : -v);
const share = (c: number) => `${Math.round(c * 100)}%`;

/** marketplace fees and penalties are charged by the same party, so the bridge shows them as one step */
export function feesAndPenalties(p: Profit): Component {
  const f = p.marketplaceFees;
  const pen = p.penalties;
  const known = f.amountMinor !== null || pen.amountMinor !== null;
  return comp(known ? (f.amountMinor ?? 0) + (pen.amountMinor ?? 0) : null, known ? worst(f.basis === 'missing' ? 'actual' : f.basis, pen.basis === 'missing' ? 'actual' : pen.basis) : 'missing', Math.min(f.coverage, pen.coverage));
}

export interface Step { key: string; label: string; type: 'positive' | 'negative' | 'subtotal'; amountMinor: number | null; basis: Basis; coverage: number; shareOfRevenuePercent: number | null; tooltip: string }

export function buildSteps(p: Profit, ad: Component) {
  const revenue = p.revenue.amountMinor ?? 0;
  const fees = feesAndPenalties(p);
  const missing = [...p.missing, ...(ad.basis === 'missing' ? ['advertising'] : [])];
  const net = p.contributionMinor === null || ad.amountMinor === null ? null : p.contributionMinor - ad.amountMinor;
  const knownPartMinor = p.knownPartMinor - (ad.amountMinor ?? 0);
  const step = (key: string, label: string, type: Step['type'], amount: number | null, c: Component, tooltip: string): Step => ({ key, label, type, amountMinor: amount, basis: c.basis, coverage: c.coverage, shareOfRevenuePercent: pct(amount, revenue), tooltip });
  const netBasis: Basis = missing.length ? 'missing' : worst(p.productCost.basis, fees.basis, p.refunds.basis);
  const steps: Step[] = [
    step('gross_revenue', 'Gross revenue', 'positive', revenue, p.revenue, 'Item price x quantity minus line discounts for every order placed in the period (cancelled orders excluded).'),
    step('returns_refunds', 'Returns and refunds', 'negative', neg(p.refunds.amountMinor), p.refunds, 'Refunds paid on returns of these orders, plus pending refunds (estimated until they are processed).'),
    step('product_cost', 'Product cost', 'negative', neg(p.productCost.amountMinor), p.productCost, p.productCost.basis === 'missing' ? 'No cost price is set on the products sold. Add cost prices to see this step.' : `Quantity sold x the product's CURRENT cost price (an estimate: cost prices are not versioned). Known for ${share(p.productCost.coverage)} of revenue.`),
    step('marketplace_fees', 'Marketplace fees', 'negative', neg(fees.amountMinor), fees, `Commission and fixed fees (actual when entered on the order, estimated from the fee profile otherwise) plus recorded penalties. Fees known for ${share(p.marketplaceFees.coverage)} of orders, penalties for ${share(p.penalties.coverage)}.`),
    step('shipping', 'Shipping', 'negative', neg(p.shipping.amountMinor), p.shipping, p.shipping.basis === 'missing' ? 'No courier cost is recorded on the shipments of these orders.' : `Courier cost recorded on the shipments. Known for ${share(p.shipping.coverage)} of orders.`),
    step('advertising', 'Advertising', 'negative', neg(ad.amountMinor), ad, ad.basis === 'missing' ? 'No advertising spend is recorded for this period. Add it under marketing spend (record 0 to confirm there were no ads).' : 'Sum of the marketing spend recorded for the period, including spend that is not tied to one marketplace.'),
    { key: 'net_contribution', label: 'Net contribution', type: 'subtotal', amountMinor: net, basis: netBasis, coverage: net === null ? 0 : 1, shareOfRevenuePercent: pct(net, revenue), tooltip: net === null ? `Not available: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing. Revenue minus the known costs is INR ${(knownPartMinor / 100).toFixed(2)} (not a profit figure).` : 'Revenue minus refunds, product cost, marketplace fees, shipping and advertising.' },
  ];
  return { steps, netContributionMinor: net, knownPartMinor, netMarginPercent: net !== null && revenue > 0 ? Math.round((net / revenue) * 1000) / 10 : null, missing, completeness: (missing.length ? 'incomplete' : p.completeness) as Profit['completeness'] };
}

export async function profitWaterfall(tx: Tx, vendorId: string, r: Range, compare: boolean) {
  const c = await collectProfit(tx, vendorId, r, 'marketplace');
  const total = computeProfit(c.inputs);
  const spend = await advertisingSpend(tx, vendorId, r);
  const bridge = buildSteps(total, adComponent(spend));

  const channels = [...c.groups.values()].map((g) => {
    const p = computeProfit(g.inputs);
    const ad = channelAd(spend, g.key);
    const fees = feesAndPenalties(p);
    const net = p.contributionMinor === null || ad.amountMinor === null ? null : p.contributionMinor - ad.amountMinor;
    const rev = p.revenue.amountMinor ?? 0;
    return {
      channel: g.key, label: channelLabel(g.key), orders: g.orders.size, grossRevenue: p.revenue, cogs: p.productCost, marketplaceFees: fees, shippingCosts: p.shipping, returnsImpact: p.refunds, advertisingSpend: ad,
      netProfitMinor: net, knownPartMinor: p.knownPartMinor - (ad.amountMinor ?? 0), netMarginPercent: net !== null && rev > 0 ? Math.round((net / rev) * 1000) / 10 : null,
      missing: [...p.missing, ...(ad.basis === 'missing' ? ['advertising'] : [])],
    };
  }).sort((a, b) => (b.grossRevenue.amountMinor ?? 0) - (a.grossRevenue.amountMinor ?? 0));

  let comparison = null;
  if (compare) {
    const pr = previousRange(r);
    const pc = await collectProfit(tx, vendorId, pr, 'none');
    const prevTotal = computeProfit(pc.inputs);
    const prevBridge = buildSteps(prevTotal, adComponent(await advertisingSpend(tx, vendorId, pr)));
    bridge.steps.forEach((s, i) => { const prev = prevBridge.steps[i]!; Object.assign(s, { previousAmountMinor: prev.amountMinor, change: delta(s.amountMinor, prev.amountMinor) }); });
    comparison = {
      range: pr, ordersAnalysed: pc.ordersAnalysed, truncated: pc.truncated, grossRevenue: delta(total.revenue.amountMinor, prevTotal.revenue.amountMinor), netContribution: delta(bridge.netContributionMinor, prevBridge.netContributionMinor),
      netMarginPoints: bridge.netMarginPercent === null || prevBridge.netMarginPercent === null ? null : Math.round((bridge.netMarginPercent - prevBridge.netMarginPercent) * 10) / 10,
      previousNetContributionMinor: prevBridge.netContributionMinor, previousGrossRevenueMinor: prevTotal.revenue.amountMinor,
    };
  }
  return {
    range: r, ordersAnalysed: c.ordersAnalysed, ordersInRange: c.ordersInRange, windows: c.windows, truncated: c.truncated, ...bridge,
    grossRevenueMinor: total.revenue.amountMinor ?? 0, unallocatedAdvertisingMinor: spend.unallocatedMinor, channels, comparison,
  };
}

/** per-metric differences between two periods of the plain profitability total */
export function profitDeltas(cur: Profit, prev: Profit) {
  return {
    revenue: delta(cur.revenue.amountMinor, prev.revenue.amountMinor), productCost: delta(cur.productCost.amountMinor, prev.productCost.amountMinor), shipping: delta(cur.shipping.amountMinor, prev.shipping.amountMinor),
    marketplaceFees: delta(cur.marketplaceFees.amountMinor, prev.marketplaceFees.amountMinor), refunds: delta(cur.refunds.amountMinor, prev.refunds.amountMinor), contribution: delta(cur.contributionMinor, prev.contributionMinor),
    marginPoints: cur.marginPercent === null || prev.marginPercent === null ? null : Math.round((cur.marginPercent - prev.marginPercent) * 10) / 10,
  };
}
