import { sql, type Tx } from '@oms/database';
import { classifyStock, DEFAULT_THRESHOLDS, type InventoryFinding } from '@oms/mod-analytics';
import { latestCompetitorPrices, type CompetitorPrice } from '@oms/mod-pricing';

/**
 * Product intelligence: one row per variant with what the data says about it and ONE recommended action. Every row carries the
 * facts it rests on (`reasons`, structured so the card text is generated from numbers) and a confidence that only reflects how much
 * data there is. No data, no recommendation: a variant without sales or stock simply gets `hold`.
 */
export const ACTIONS = ['reorder', 'raise_price', 'liquidate', 'promote', 'hold'] as const;
export type IntelAction = (typeof ACTIONS)[number];
export type Trend = 'accelerating' | 'stable' | 'declining';

const DAY = 86_400_000;
const DEFAULT_LEAD_DAYS = 14;
const LEAD_BUFFER_DAYS = 7;
const TREND_THRESHOLD_PERCENT = 20;
const MIN_TREND_UNITS = 4;
const HEADROOM_PERCENT = 5;
const LOW_MARGIN_PERCENT = 10;
const PROMOTE_MIN_MARGIN_PERCENT = 15;
const PROMOTE_MIN_COVER_DAYS = 45;
const PROMOTE_SLOW_UNITS_PER_DAY = 0.3;
const MIN_PROMOTE_AGE_DAYS = 14; // a variant listed this week has not had time to sell

export interface Reason { key: string; text: string; values: Record<string, number | string | null> }
export interface Confidence { score: number; level: 'low' | 'medium' | 'high'; factors: Array<{ key: string; weight: number; met: boolean; text: string }> }

export interface Facts {
  available: number; onHand: number; hasStockRecord: boolean; unitsPerDay: number; units30: number; coverDays: number | null; flags: InventoryFinding['flags']; trend: Trend | null; trendChangePercent: number | null;
  marginPercent: number | null; priceMinor: number | null; costMinor: number | null; competitorMinor: number | null; competitorFresh: boolean; leadDays: number; leadDaysSource: 'variant' | 'default'; ageDays: number | null; variantAgeDays: number; suggestedReorderUnits: number | null;
}

const inr = (minor: number): string => `INR ${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round1 = (v: number): number => Math.round(v * 10) / 10;

/** sales trend of the last 14 days against the 14 before; null when there are too few units to say anything */
export function trendOf(recent: number, previous: number): { trend: Trend | null; changePercent: number | null } {
  if (recent + previous < MIN_TREND_UNITS) return { trend: null, changePercent: null };
  if (previous === 0) return { trend: 'accelerating', changePercent: null };
  const change = round1(((recent - previous) / previous) * 100);
  return { trend: change >= TREND_THRESHOLD_PERCENT ? 'accelerating' : change <= -TREND_THRESHOLD_PERCENT ? 'declining' : 'stable', changePercent: change };
}

/** (list price - cost) / list price in percent; null without a cost or a price */
export const marginOf = (price: number | null, cost: number | null): number | null => (price === null || cost === null || price <= 0 ? null : round1(((price - cost) / price) * 100));

/** confidence = share of the evidence a recommendation could use, never a statistical claim */
export function confidenceOf(f: Facts): Confidence {
  const salesWeight = Math.round(40 * Math.min(1, f.units30 / 30));
  const factors: Confidence['factors'] = [
    { key: 'sales_history', weight: salesWeight, met: f.units30 >= 30, text: `${f.units30} unit(s) sold in the last 30 days (30 or more is full evidence)` },
    { key: 'cost_price', weight: f.costMinor !== null ? 20 : 0, met: f.costMinor !== null, text: f.costMinor !== null ? 'Cost price is set' : 'No cost price: margin is unknown' },
    { key: 'stock_record', weight: f.hasStockRecord ? 15 : 0, met: f.hasStockRecord, text: f.hasStockRecord ? 'Stock is tracked' : 'No stock record for this variant' },
    { key: 'competitor_price', weight: f.competitorFresh ? 10 : 0, met: f.competitorFresh, text: f.competitorFresh ? 'A competitor price was observed in the last 30 days' : 'No recent competitor price' },
    { key: 'history_age', weight: f.variantAgeDays >= 28 ? 15 : 0, met: f.variantAgeDays >= 28, text: f.variantAgeDays >= 28 ? 'Listed for four weeks or more' : 'Listed for less than four weeks' },
  ];
  const score = factors.reduce((s, x) => s + x.weight, 0);
  return { score, level: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low', factors };
}

/** the decision, in priority order: protect the stock-out first, then clear dead stock, then price, then demand */
export function decide(f: Facts): { action: IntelAction; reasons: Reason[] } {
  const reasons: Reason[] = [];
  const cover = f.coverDays;
  if (f.unitsPerDay > 0 && (f.available <= 0 || (cover !== null && cover < f.leadDays + LEAD_BUFFER_DAYS))) {
    reasons.push(f.available <= 0
      ? { key: 'out_of_stock_selling', text: `Out of stock while selling ${f.unitsPerDay} units a day.`, values: { unitsPerDay: f.unitsPerDay } }
      : { key: 'runway_below_lead_time', text: `${cover} days of stock left at ${f.unitsPerDay} units a day; restocking takes about ${f.leadDays} days${f.leadDaysSource === 'default' ? ' (business default)' : ''}.`, values: { coverDays: cover, unitsPerDay: f.unitsPerDay, leadDays: f.leadDays } });
    if (f.suggestedReorderUnits) reasons.push({ key: 'suggested_quantity', text: `About ${f.suggestedReorderUnits} units bring stock to 30 days of sales.`, values: { units: f.suggestedReorderUnits } });
    if (f.trend === 'accelerating') reasons.push({ key: 'demand_accelerating', text: f.trendChangePercent === null ? 'Sales picked up from none in the previous two weeks.' : `Sales are up ${f.trendChangePercent}% on the previous two weeks.`, values: { changePercent: f.trendChangePercent } });
    return { action: 'reorder', reasons };
  }
  if (f.available > 0 && (f.flags.includes('excess') || f.flags.includes('aging'))) {
    if (f.flags.includes('excess')) reasons.push({ key: 'excess_stock', text: cover !== null ? `${f.available} units are about ${Math.round(cover)} days of sales.` : `${f.available} units on hand with no sales in 30 days.`, values: { available: f.available, coverDays: cover } });
    if (f.ageDays !== null && f.flags.includes('aging')) reasons.push({ key: 'aging_stock', text: `Last received ${f.ageDays} days ago and selling slowly.`, values: { ageDays: f.ageDays, unitsPerDay: f.unitsPerDay } });
    return { action: 'liquidate', reasons };
  }
  if (f.unitsPerDay > 0 && f.available > 0) {
    const gap = f.competitorMinor !== null && f.priceMinor !== null && f.priceMinor > 0 ? round1(((f.competitorMinor - f.priceMinor) / f.priceMinor) * 100) : null;
    if (gap !== null && gap >= HEADROOM_PERCENT) reasons.push({ key: 'below_competitor', text: `Priced ${gap}% below the competitor (${inr(f.priceMinor!)} against ${inr(f.competitorMinor!)}) while selling ${f.unitsPerDay} units a day.`, values: { gapPercent: gap, priceMinor: f.priceMinor, competitorMinor: f.competitorMinor } });
    if (f.marginPercent !== null && f.marginPercent < LOW_MARGIN_PERCENT) reasons.push({ key: 'thin_margin', text: `Margin is only ${f.marginPercent}% on a product that sells ${f.unitsPerDay} units a day.`, values: { marginPercent: f.marginPercent, unitsPerDay: f.unitsPerDay } });
    if (reasons.length) return { action: 'raise_price', reasons };
  }
  const slow = f.unitsPerDay < PROMOTE_SLOW_UNITS_PER_DAY;
  if (f.available > 0 && ((slow && f.variantAgeDays >= MIN_PROMOTE_AGE_DAYS) || f.trend === 'declining') && (cover === null || cover > PROMOTE_MIN_COVER_DAYS) && (f.marginPercent === null || f.marginPercent >= PROMOTE_MIN_MARGIN_PERCENT)) {
    if (f.trend === 'declining') reasons.push({ key: 'demand_declining', text: f.trendChangePercent === null ? 'Sales fell against the previous two weeks.' : `Sales are down ${Math.abs(f.trendChangePercent)}% on the previous two weeks.`, values: { changePercent: f.trendChangePercent } });
    if (slow) reasons.push({ key: 'slow_sales', text: `Only ${f.unitsPerDay} units a day with ${f.available} in stock.`, values: { unitsPerDay: f.unitsPerDay, available: f.available } });
    if (f.marginPercent !== null) reasons.push({ key: 'margin_room', text: `A ${f.marginPercent}% margin leaves room for a promotion.`, values: { marginPercent: f.marginPercent } });
    return { action: 'promote', reasons };
  }
  reasons.push(f.units30 === 0 && f.available <= 0 ? { key: 'no_activity', text: 'No sales and no stock: nothing to act on.', values: {} } : { key: 'healthy', text: 'Stock, sales and price are in a normal range.', values: { unitsPerDay: f.unitsPerDay, coverDays: cover } });
  return { action: 'hold', reasons };
}

export interface IntelItem {
  id: string; variantId: string; productId: string; sku: string; productName: string; categoryId: string | null; category: string | null;
  salesVelocity: number; unitsSold30d: number; velocityTrend: Trend | null; trendChangePercent: number | null; marginPercent: number | null; sellingPriceMinor: number | null; costPriceMinor: number | null;
  inventory: { available: number; onHand: number; runwayDays: number | null; ageDays: number | null; leadTimeDays: number; suggestedReorderUnits: number | null };
  competitor: { priceMinor: number; observedAt: string; sellerName: string | null; gapPercent: number | null } | null;
  recommendedAction: IntelAction; confidence: Confidence; reasons: Reason[];
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const dateAgo = (n: number): string => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

export interface IntelQuery { action?: IntelAction; categoryId?: string; warehouseId?: string; q?: string; sort: 'priority' | 'velocity' | 'runway' | 'margin' }

/** every active variant of the business with its facts and recommendation (at most 5,000 variants) */
export async function buildItems(tx: Tx, vendorId: string, q: Pick<IntelQuery, 'categoryId' | 'warehouseId' | 'q'>): Promise<IntelItem[]> {
  const like = q.q ? `%${q.q.replace(/[%_\\]/g, '\\$&')}%` : null;
  const rs = (await tx.execute<Record<string, unknown>>(sql`
    select v.id variant_id, v.product_id, v.sku, v.selling_price_minor price, v.cost_price_minor cost, v.lead_time_days lead, v.created_at, p.title, p.category_id, c.name category,
      st.variant_id has_stock, coalesce(st.on_hand, 0) on_hand, coalesce(st.reserved, 0) reserved, st.reorder,
      coalesce(s.u30, 0) u30, coalesce(s.recent, 0) recent, coalesce(s.prev, 0) prev,
      (select max(m.created_at) from inventory_movements m where m.vendor_id = v.vendor_id and m.variant_id = v.id and m.type in ('receive', 'incoming_receive', 'return_restock')) last_received
    from product_variants v
    join products p on p.id = v.product_id and p.vendor_id = v.vendor_id
    left join categories c on c.id = p.category_id and c.vendor_id = p.vendor_id
    left join (select variant_id, sum(quantity_on_hand)::int on_hand, sum(quantity_reserved)::int reserved, max(reorder_level)::int reorder from inventory where vendor_id = ${vendorId} ${q.warehouseId ? sql`and warehouse_id = ${q.warehouseId}::uuid` : sql``} group by variant_id) st on st.variant_id = v.id
    left join (select variant_id, sum(units) filter (where day >= ${dateAgo(29)}::date)::int u30, sum(units) filter (where day >= ${dateAgo(13)}::date)::int recent, sum(units) filter (where day >= ${dateAgo(27)}::date and day < ${dateAgo(13)}::date)::int prev
      from analytics_daily_products where vendor_id = ${vendorId} and day >= ${dateAgo(29)}::date group by variant_id) s on s.variant_id = v.id
    where v.vendor_id = ${vendorId} and v.deleted_at is null and p.deleted_at is null and p.status <> 'archived' and v.status = 'active'
      ${q.categoryId ? sql`and p.category_id = ${q.categoryId}::uuid` : sql``}
      ${like ? sql`and (v.sku ilike ${like} or p.title ilike ${like})` : sql``}
    order by v.sku limit 5000`)).rows;
  if (rs.length === 0) return [];
  const settings = (await tx.execute<{ settings: { inventory?: { defaultLeadTimeDays?: number } } | null }>(sql`select settings from vendors where id = ${vendorId}`)).rows[0]?.settings;
  const defaultLead = settings?.inventory?.defaultLeadTimeDays ?? DEFAULT_LEAD_DAYS;
  const ids = rs.map((r) => String(r.variant_id));
  const competitors = new Map<string, CompetitorPrice>();
  for (let i = 0; i < ids.length; i += 1000) for (const [k, v] of await latestCompetitorPrices(tx, vendorId, ids.slice(i, i + 1000))) competitors.set(k, v);

  const now = new Date();
  return rs.map((r) => {
    const variantId = String(r.variant_id);
    const units30 = num(r.u30);
    const stock = classifyStock({ variantId, sku: String(r.sku), title: r.title ? String(r.title) : null, onHand: num(r.on_hand), reserved: num(r.reserved), reorderLevel: r.reorder === null ? null : num(r.reorder), unitsSold: units30, lastReceivedAt: r.last_received ? new Date(String(r.last_received)) : null }, DEFAULT_THRESHOLDS, now);
    const price = r.price === null ? null : num(r.price);
    const cost = r.cost === null ? null : num(r.cost);
    const comp = competitors.get(variantId) ?? null;
    const t = trendOf(num(r.recent), num(r.prev));
    const lead = r.lead === null ? defaultLead : num(r.lead);
    const facts: Facts = {
      available: stock.available, onHand: stock.onHand, hasStockRecord: r.has_stock !== null, unitsPerDay: stock.unitsPerDay, units30, coverDays: stock.daysOfCover, flags: stock.flags, trend: t.trend, trendChangePercent: t.changePercent,
      marginPercent: marginOf(price, cost), priceMinor: price, costMinor: cost, competitorMinor: comp ? comp.priceMinor : null, competitorFresh: comp !== null && now.getTime() - comp.observedAt.getTime() <= 30 * DAY,
      leadDays: lead, leadDaysSource: r.lead === null ? 'default' : 'variant', ageDays: stock.ageDays, variantAgeDays: Math.floor((now.getTime() - new Date(String(r.created_at)).getTime()) / DAY),
      suggestedReorderUnits: stock.suggestedReorderUnits ?? (stock.unitsPerDay > 0 ? Math.max(0, Math.ceil(stock.unitsPerDay * 30 - stock.available)) : null),
    };
    const d = decide(facts);
    return {
      id: variantId, variantId, productId: String(r.product_id), sku: String(r.sku), productName: String(r.title), categoryId: r.category_id ? String(r.category_id) : null, category: r.category ? String(r.category) : null,
      salesVelocity: stock.unitsPerDay, unitsSold30d: units30, velocityTrend: t.trend, trendChangePercent: t.changePercent, marginPercent: facts.marginPercent, sellingPriceMinor: price, costPriceMinor: cost,
      inventory: { available: stock.available, onHand: stock.onHand, runwayDays: stock.daysOfCover, ageDays: stock.ageDays, leadTimeDays: lead, suggestedReorderUnits: d.action === 'reorder' ? facts.suggestedReorderUnits : null },
      competitor: comp ? { priceMinor: comp.priceMinor, observedAt: comp.observedAt.toISOString(), sellerName: comp.sellerName, gapPercent: price && price > 0 ? round1(((comp.priceMinor - price) / price) * 100) : null } : null,
      recommendedAction: d.action, confidence: confidenceOf(facts), reasons: d.reasons,
    };
  });
}

const URGENCY: Record<IntelAction, number> = { reorder: 0, liquidate: 1, raise_price: 1, promote: 2, hold: 3 };

export function sortItems(items: IntelItem[], sort: IntelQuery['sort']): IntelItem[] {
  const nullsLast = (a: number | null, b: number | null, dir: 1 | -1) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : (a - b) * dir);
  const cmp: Record<IntelQuery['sort'], (a: IntelItem, b: IntelItem) => number> = {
    priority: (a, b) => URGENCY[a.recommendedAction] - URGENCY[b.recommendedAction] || b.salesVelocity - a.salesVelocity,
    velocity: (a, b) => b.salesVelocity - a.salesVelocity,
    runway: (a, b) => nullsLast(a.inventory.runwayDays, b.inventory.runwayDays, 1),
    margin: (a, b) => nullsLast(a.marginPercent, b.marginPercent, -1),
  };
  return [...items].sort((a, b) => cmp[sort](a, b) || a.sku.localeCompare(b.sku));
}

export async function productIntelligence(tx: Tx, vendorId: string, q: IntelQuery, page: { limit: number; offset: number }) {
  const all = await buildItems(tx, vendorId, q);
  const summary = Object.fromEntries(ACTIONS.map((a) => [a, all.filter((i) => i.recommendedAction === a).length])) as Record<IntelAction, number>;
  const filtered = q.action ? all.filter((i) => i.recommendedAction === q.action) : all;
  return { items: sortItems(filtered, q.sort).slice(page.offset, page.offset + page.limit), total: filtered.length, summary, variantsAnalysed: all.length };
}
