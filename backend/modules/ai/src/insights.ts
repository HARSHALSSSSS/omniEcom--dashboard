import { and, count, desc, eq, schema, type Tx } from '@oms/database';
import { advertisingSpend, businessHealth, dailyRevenueSeries, overview } from '@oms/mod-analytics';
import { detectAnomalies } from './detect';
import { buildItems, sortItems, type IntelItem } from './intelligence';

/**
 * Proactive insight cards: what is worth a look right now, each built from numbers that exist (product intelligence, business health,
 * revenue anomalies, recorded advertising spend, open recommendations, pending price proposals) and each with a ready-made question
 * for the assistant. Nothing is estimated beyond what the card says it is.
 */
export interface Insight {
  id: string; category: 'pricing' | 'stock' | 'channel' | 'campaign'; severity: 'info' | 'warning' | 'critical'; headline: string; summary: string;
  metricImpact: string | null; metric: { key: string; valueMinor?: number; value?: number } | null; suggestedPrompt: string; source: string;
}

const inr = (minor: number): string => `INR ${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const RANK = { critical: 0, warning: 1, info: 2 } as const;
const DAY = 86_400_000;
const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

function stockInsight(i: IntelItem): Insight {
  const weekly = i.sellingPriceMinor !== null ? Math.round(i.salesVelocity * 7 * i.sellingPriceMinor) : null;
  return {
    id: `stock:${i.variantId}`, category: 'stock', severity: i.inventory.available <= 0 ? 'critical' : 'warning',
    headline: i.inventory.available <= 0 ? `${i.sku} is out of stock` : `Stockout risk on ${i.sku}`, summary: `${i.productName}: ${i.reasons.map((r) => r.text).join(' ')}`,
    metricImpact: weekly === null ? null : `${inr(weekly)} of weekly sales depends on this SKU`, metric: weekly === null ? null : { key: 'weeklySalesMinor', valueMinor: weekly },
    suggestedPrompt: `Show me recommended replenishment quantities and lead times for ${i.sku}`, source: 'product_intelligence',
  };
}

function pricingInsight(i: IntelItem): Insight {
  const gap = i.competitor?.gapPercent ?? null;
  const upside = i.competitor && i.sellingPriceMinor !== null && gap !== null && gap > 0 ? Math.round((i.competitor.priceMinor - i.sellingPriceMinor) * i.salesVelocity * 30) : null;
  return {
    id: `pricing:${i.variantId}`, category: 'pricing', severity: 'info', headline: gap !== null && gap > 0 ? `${i.sku} is priced below the competitor` : `${i.sku} has a thin margin`,
    summary: `${i.productName}: ${i.reasons.map((r) => r.text).join(' ')}`, metricImpact: upside === null ? null : `Up to ${inr(upside)} more per month at the competitor's price if volume holds`,
    metric: upside === null ? null : { key: 'monthlyUpsideMinor', valueMinor: upside }, suggestedPrompt: `What is the margin on ${i.sku} and should I raise its price?`, source: 'product_intelligence',
  };
}

export async function buildInsights(tx: Tx, vendorId: string, limit: number): Promise<Insight[]> {
  const out: Insight[] = [];
  const items = await buildItems(tx, vendorId, {});
  for (const i of sortItems(items.filter((x) => x.recommendedAction === 'reorder'), 'velocity').slice(0, 3)) out.push(stockInsight(i));
  for (const i of sortItems(items.filter((x) => x.recommendedAction === 'raise_price'), 'velocity').slice(0, 2)) out.push(pricingInsight(i));

  const [pending] = await tx.select({ n: count() }).from(schema.pricingProposals).where(and(eq(schema.pricingProposals.vendorId, vendorId), eq(schema.pricingProposals.status, 'pending_review')));
  if (pending && pending.n > 0) out.push({ id: 'pricing:pending_proposals', category: 'pricing', severity: 'info', headline: `${pending.n} price proposal${pending.n === 1 ? ' is' : 's are'} waiting for review`, summary: 'Proposed price changes only take effect once someone approves them.', metricImpact: `${pending.n} proposal${pending.n === 1 ? '' : 's'} pending`, metric: { key: 'pendingProposals', value: pending.n }, suggestedPrompt: 'Check pending price proposals', source: 'pricing_proposals' });

  const health = await businessHealth(tx, vendorId);
  for (const h of health.issues.filter((x) => (x.area === 'marketplace' || x.area === 'sync') && x.severity !== 'info').slice(0, 2)) {
    out.push({ id: `channel:${h.code}`, category: 'channel', severity: h.severity, headline: h.message, summary: `${h.count} affected.`, metricImpact: `${h.count} affected`, metric: { key: h.code, value: h.count }, suggestedPrompt: 'What is stuck in operations?', source: 'business_health' });
  }
  for (const a of detectAnomalies(await dailyRevenueSeries(tx, vendorId, 40)).slice(0, 2)) {
    out.push({ id: `channel:anomaly:${a.metric}:${a.day}`, category: 'channel', severity: a.direction === 'down' && a.metric === 'revenue' ? 'warning' : 'info', headline: `Unusual ${a.metric.replace('_', ' ')} on ${a.day}`, summary: `${a.message}.`, metricImpact: null, metric: { key: a.metric, value: a.value }, suggestedPrompt: 'Is anything unusual in my sales?', source: 'anomaly' });
  }

  const to = day(Date.now());
  const from = day(Date.now() - 29 * DAY);
  const spend = await advertisingSpend(tx, vendorId, { from, to });
  if (spend.totalMinor > 0) {
    const revenue = (await overview(tx, vendorId, { from, to })).kpis.revenueMinor!.value;
    const roas = Math.round((revenue / spend.totalMinor) * 100) / 100;
    if (roas < 3) out.push({ id: 'campaign:low_return', category: 'campaign', severity: roas < 1 ? 'warning' : 'info', headline: 'Advertising returns little revenue', summary: `${inr(spend.totalMinor)} was spent on advertising in the last 30 days against ${inr(revenue)} of revenue (${roas}x). Revenue is not attributed to ads, so this is a ceiling for the return, not a measurement.`, metricImpact: `${roas}x revenue per INR spent`, metric: { key: 'revenueToSpend', value: roas }, suggestedPrompt: 'What is my profitability after advertising?', source: 'advertising' });
  }

  const recs = await tx.select().from(schema.aiRecommendations).where(and(eq(schema.aiRecommendations.vendorId, vendorId), eq(schema.aiRecommendations.status, 'open'))).orderBy(desc(schema.aiRecommendations.createdAt)).limit(20);
  for (const r of recs.filter((x) => x.kind === 'operations' || x.kind === 'catalog_quality')) {
    out.push({ id: `rec:${r.id}`, category: 'channel', severity: r.severity as Insight['severity'], headline: r.title, summary: r.summary, metricImpact: null, metric: null, suggestedPrompt: r.kind === 'catalog_quality' ? 'Which products have missing information?' : 'What is stuck in operations?', source: 'recommendation' });
  }
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]).slice(0, limit);
}
