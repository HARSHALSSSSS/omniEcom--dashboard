import { and, eq, isLowStock, schema, sql, type Tx } from '@oms/database';
import type { Container } from '@oms/module-kit';
import { loadCostFacts, priceFacts, priceForMargin } from '@oms/mod-pricing';
import { evaluateVariant, type AccountFacts, type Reason, type Verdict } from '../domain/eligibility';
import { maxDiscountBps } from '../domain/candidates';
import { discountBps, promoPrice } from '../domain/terms';
import { accountFacts, marginTargets, saleLineFilter, targetAccounts, variantInfo, type CampaignRow, type TargetAccount, type VariantInfo } from '../infrastructure/queries';
import { termsOf } from './items';

const OI = schema.orderItems;
const O = schema.orders;
const V = schema.productVariants;
const FP = schema.feeProfiles;

/** can a marketplace connector take price changes? (a connector that is not registered cannot) */
export type CanPush = (marketplace: string) => boolean;
export const canPushOf = (c: Container): CanPush => (marketplace) => { try { return c.connectors.get(marketplace as never).capabilities.pricing.push; } catch { return false; } };

export { marginTargets };

// ------------------------------------------------------------------------------------------------
// one variant on one channel under a campaign's terms
// ------------------------------------------------------------------------------------------------
export type ConflictKind = 'other_campaign' | 'existing_sale';
export interface ChannelView {
  accountId: string; marketplace: string; displayName: string;
  listed: boolean; canPushPrices: boolean;
  regularPriceMinor: number; promoPriceMinor: number; discountBps: number;
  /** the campaign can run this variant on this channel */
  ok: boolean;
  /** why not (or what is off), the same sentence the eligibility engine stores on the product */
  reason: string | null;
  conflict: { kind: ConflictKind; message: string } | null;
  unitCostMinor: number | null; feesConfigured: boolean;
  /** margin after cost and the channel's fees at the regular price / at the promotional price; null = cost unknown */
  marginRegularBps: number | null; marginPromoBps: number | null;
  targetMarginBps: number | null; belowTarget: boolean | null;
  /** the lowest promotional price that still earns the target margin (null without a cost or a target) */
  minPromoPriceMinor: number | null; maxDiscountBps: number | null;
}

const CONFLICT_REASONS: Partial<Record<Reason, ConflictKind>> = { conflicting_campaign: 'other_campaign', existing_sale: 'existing_sale' };

export interface Analysis { variants: Map<string, VariantInfo>; byVariant: Map<string, ChannelView[]> }

/**
 * Price every given variant on every channel the campaign targets, exactly as the eligibility engine does (the discount is taken
 * from the price the channel really sells at), and add the real margin picture: cost, the channel's fees, the pricing-policy target.
 * `campaign` may be a draft that does not exist yet (the preview): only its terms, accounts and window are read.
 */
export async function analyze(tx: Tx, vendorId: string, campaign: CampaignRow, variantIds: string[], canPush: CanPush, now: Date): Promise<Analysis> {
  const byVariant = new Map<string, ChannelView[]>();
  const accounts = await targetAccounts(tx, vendorId, campaign.accountIds);
  const variants = await variantInfo(tx, vendorId, variantIds);
  if (variants.size === 0 || accounts.length === 0) return { variants, byVariant };
  const facts = await accountFacts(tx, vendorId, campaign, accounts, variants, canPush, now);
  const [costs, target] = await Promise.all([
    loadCostFacts(tx, vendorId, [...variants.keys()].flatMap((variantId) => accounts.map((a) => ({ variantId, accountId: a.id })))),
    marginTargets(tx, vendorId),
  ]);
  const terms = termsOf(campaign);
  const label = new Map<string, TargetAccount>(accounts.map((a) => [a.id, a]));
  for (const [variantId, info] of variants) {
    const list: AccountFacts[] = facts.get(variantId) ?? [];
    const raw = info.sellingPriceMinor && info.sellingPriceMinor > 0 ? promoPrice(terms, info.sellingPriceMinor) : 0;
    const verdict: Verdict = evaluateVariant(info, info.sellingPriceMinor ?? 0, raw, list, (base) => promoPrice(terms, base));
    byVariant.set(variantId, list.map((f): ChannelView => {
      const a = label.get(f.accountId)!;
      const v = verdict.accounts.find((x) => x.accountId === f.accountId);
      const regular = f.regularMinor;
      const promo = regular > 0 ? Math.max(0, promoPrice(terms, regular)) : 0;
      const fees = costs.feesOf(f.accountId);
      const cost = costs.costOf(variantId);
      const tgt = target(f.accountId);
      const atRegular = regular > 0 ? priceFacts(regular, cost, fees) : null;
      const atPromo = promo > 0 ? priceFacts(promo, cost, fees) : null;
      const minPromo = cost !== null && tgt !== null ? priceForMargin(cost, tgt, fees ?? { feeBps: 0, fixedMinor: 0 }) : null;
      const kind = v?.reason ? CONFLICT_REASONS[v.reason] : undefined;
      const reason = v ? (v.ok ? null : (v.message ?? null)) : verdict.reason;
      return {
        accountId: f.accountId, marketplace: a.marketplace, displayName: a.displayName, listed: f.hasActiveListing, canPushPrices: f.canPush,
        regularPriceMinor: regular, promoPriceMinor: promo, discountBps: discountBps(regular, promo), ok: v?.ok ?? false, reason,
        conflict: kind && v?.message ? { kind, message: v.message } : null,
        unitCostMinor: cost, feesConfigured: fees !== null, marginRegularBps: atRegular?.marginBps ?? null, marginPromoBps: atPromo?.marginBps ?? null,
        targetMarginBps: tgt, belowTarget: atPromo?.marginBps === null || atPromo === null || tgt === null ? null : atPromo.marginBps < tgt,
        minPromoPriceMinor: minPromo, maxDiscountBps: maxDiscountBps(regular, minPromo),
      };
    }));
  }
  return { variants, byVariant };
}

/** the channel that tells the seller the most: the one with the thinnest known promotional margin, else the first listed one */
export function worstChannel(channels: ChannelView[]): ChannelView | null {
  const listed = channels.filter((c) => c.listed);
  const pool = listed.length ? listed : channels;
  const known = pool.filter((c) => c.marginPromoBps !== null);
  return known.length ? known.reduce((m, c) => (c.marginPromoBps! < m.marginPromoBps! ? c : m)) : (pool[0] ?? null);
}

// ------------------------------------------------------------------------------------------------
// stock, with the one shared definition of low stock
// ------------------------------------------------------------------------------------------------
export interface StockFacts { available: number; lowStock: boolean; unitsPerDay: number }

/**
 * Available stock (on hand minus reserved over the active warehouses) and whether the shared low-stock rule fires, from the same
 * inputs as the Inventory screen: reorder level or the business threshold, 14-day sales rate, variant or default lead time.
 */
export async function stockFacts(tx: Tx, vendorId: string, variantIds?: string[]): Promise<Map<string, StockFacts>> {
  const out = new Map<string, StockFacts>();
  if (variantIds && variantIds.length === 0) return out;
  const ids = variantIds ? sql`and v.id in (${sql.join(variantIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;
  const settings = (await tx.execute<{ settings: { inventory?: { defaultLeadTimeDays?: number }; lowStockThreshold?: number } | null }>(sql`select settings from vendors where id = ${vendorId}`)).rows[0]?.settings;
  const defaultLead = settings?.inventory?.defaultLeadTimeDays ?? 7;
  const threshold = typeof settings?.lowStockThreshold === 'number' ? settings.lowStockThreshold : 5;
  const rows = (await tx.execute<Record<string, unknown>>(sql`
    select v.id variant_id, coalesce(st.available, 0)::int available, st.reorder, coalesce(s.units, 0)::int units, coalesce(v.lead_time_days, ${defaultLead}::int)::int lead
    from product_variants v
    left join (select i.variant_id, sum(i.quantity_on_hand - i.quantity_reserved)::int available, max(i.reorder_level)::int reorder
      from inventory i join warehouses w on w.id = i.warehouse_id and w.vendor_id = i.vendor_id
      where i.vendor_id = ${vendorId}::uuid and w.status = 'active' and w.deleted_at is null group by i.variant_id) st on st.variant_id = v.id
    left join (select oi.variant_id, sum(oi.quantity)::int units from order_items oi join orders o on o.id = oi.order_id and o.vendor_id = oi.vendor_id
      where oi.vendor_id = ${vendorId}::uuid and oi.variant_id is not null and o.status <> 'cancelled' and o.placed_at >= now() - interval '14 days' group by oi.variant_id) s on s.variant_id = v.id
    where v.vendor_id = ${vendorId}::uuid and v.deleted_at is null ${ids}`)).rows;
  for (const r of rows) {
    const available = Number(r.available);
    const unitsPerDay = Number(r.units) / 14;
    out.set(String(r.variant_id), { available, unitsPerDay: Math.round(unitsPerDay * 100) / 100, lowStock: isLowStock({ available, reorder: r.reorder === null ? null : Number(r.reorder), threshold, unitsPerDay, leadDays: Number(r.lead) }) });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// what a campaign's sales really earned
// ------------------------------------------------------------------------------------------------
export interface Economics { units: number; revenueMinor: number; costMinor: number; feesMinor: number; unknownCostUnits: number; noFeeUnits: number }
export const NO_ECONOMICS: Economics = { units: 0, revenueMinor: 0, costMinor: 0, feesMinor: 0, unknownCostUnits: 0, noFeeUnits: 0 };

/**
 * Revenue, cost and marketplace fees of the order lines that count for a campaign. Fees come from the account's fee profile and are
 * computed per order line (commission on the line's revenue plus the fixed fee per unit).
 */
export async function salesEconomics(tx: Tx, vendorId: string, variantIds: string[], accountIds: string[], from: Date, to: Date): Promise<Economics> {
  if (variantIds.length === 0 || to <= from) return NO_ECONOMICS;
  const line = sql`(${OI.unitPriceMinor} * ${OI.quantity} - ${OI.discountMinor})`;
  const [r] = await tx.select({
    units: sql<string>`coalesce(sum(${OI.quantity}), 0)`,
    revenue: sql<string>`coalesce(sum(${line}), 0)`,
    cost: sql<string>`coalesce(sum(coalesce(${V.costPriceMinor}, 0) * ${OI.quantity}), 0)`,
    fees: sql<string>`coalesce(sum(round(${line} * coalesce(${FP.feePercentBps}, 0) / 10000.0) + coalesce(${FP.fixedFeeMinor}, 0) * ${OI.quantity}), 0)`,
    unknownCost: sql<string>`coalesce(sum(case when ${V.costPriceMinor} is null then ${OI.quantity} else 0 end), 0)`,
    noFee: sql<string>`coalesce(sum(case when ${FP.id} is null then ${OI.quantity} else 0 end), 0)`,
  }).from(OI)
    .innerJoin(O, and(eq(O.id, OI.orderId), eq(O.vendorId, OI.vendorId)))
    .innerJoin(V, and(eq(V.id, OI.variantId), eq(V.vendorId, OI.vendorId)))
    .leftJoin(FP, and(eq(FP.marketplaceAccountId, O.marketplaceAccountId), eq(FP.vendorId, O.vendorId)))
    .where(saleLineFilter(vendorId, variantIds, accountIds, from, to));
  return { units: Number(r?.units ?? 0), revenueMinor: Number(r?.revenue ?? 0), costMinor: Number(r?.cost ?? 0), feesMinor: Number(r?.fees ?? 0), unknownCostUnits: Number(r?.unknownCost ?? 0), noFeeUnits: Number(r?.noFee ?? 0) };
}

export interface Contribution {
  /** revenue - cost - marketplace fees of the promoted sales; null when any promoted unit has no cost price (never a guess) or nothing was sold */
  contributionMinor: number | null;
  /** contribution as basis points of the revenue; null with the amount */
  contributionBps: number | null;
  /** what the amount is net of: cost and the configured fees, or cost only when a channel has no fee profile */
  contributionBasis: 'after_cost_and_fees' | 'after_cost_only' | null;
}

export function contributionOf(e: Economics): Contribution {
  if (e.units === 0 || e.unknownCostUnits > 0) return { contributionMinor: null, contributionBps: null, contributionBasis: null };
  const amount = e.revenueMinor - e.costMinor - e.feesMinor;
  return { contributionMinor: amount, contributionBps: e.revenueMinor > 0 ? Math.round((amount * 10_000) / e.revenueMinor) : null, contributionBasis: e.noFeeUnits > 0 ? 'after_cost_only' : 'after_cost_and_fees' };
}

export const addEconomics = (a: Economics, b: Economics): Economics => ({
  units: a.units + b.units, revenueMinor: a.revenueMinor + b.revenueMinor, costMinor: a.costMinor + b.costMinor, feesMinor: a.feesMinor + b.feesMinor,
  unknownCostUnits: a.unknownCostUnits + b.unknownCostUnits, noFeeUnits: a.noFeeUnits + b.noFeeUnits,
});

