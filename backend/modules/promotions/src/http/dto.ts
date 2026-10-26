import { z } from 'zod';
import { IsoDate } from '@oms/contracts';
import { schema } from '@oms/database';
import { discountBps } from '../domain/terms';
import { THRESHOLDS, capabilityOf, endsInHours, horizonOf } from '../domain/candidates';
import type { CanPush } from '../application/analysis';
import type { CampaignExtras, ItemInsight } from '../application/insights';
import type { AccountLite } from '../application/campaigns';
import type { CampaignRow, ItemRow } from '../infrastructure/queries';

const Channel = z.object({ accountId: z.string(), marketplace: z.string(), displayName: z.string(), canPushPrices: z.boolean().describe('false: the connector cannot take price changes, so a campaign there cannot be applied automatically') });
const ItemCounts = z.object({ total: z.number().int(), eligible: z.number().int(), pending_sync: z.number().int(), live: z.number().int(), ineligible: z.number().int(), ended: z.number().int() });
const VelocitySchema = z.object({
  liftBps: z.number().int().nullable().describe('Sales rate of the promoted variants during the campaign vs the 14 days before, in basis points; null until the campaign ran a full day and the baseline has at least 5 units'),
  promoUnits: z.number().int(), promoDays: z.number(), baselineUnits: z.number().int(), baselineDays: z.number().int(),
});

export const CampaignSchema = z.object({
  id: z.string(), name: z.string(), code: z.string().describe('Internal campaign code (unique, case-insensitive). It is not pushed to marketplaces as a coupon'), description: z.string().nullable(),
  type: z.enum(schema.PROMOTION_TYPES),
  valueBps: z.number().int().nullable().describe('percentage_discount and bundle: basis points off (1500 = 15%)'), valueMinor: z.number().int().nullable().describe('flat_discount: minor units off'),
  buyQuantity: z.number().int().nullable(), getQuantity: z.number().int().nullable(),
  minOrderMinor: z.number().int().describe('Informational: marketplaces cannot enforce a minimum order on a sale price'), budgetMinor: z.number().int().describe('0 = no budget limit'), currency: z.string(),
  status: z.enum(schema.PROMOTION_STATUSES), startsAt: IsoDate.nullable(), endsAt: IsoDate.nullable(),
  accountIds: z.array(z.string()).describe('Empty = every connected account'), channels: z.array(Channel),
  spendMinor: z.number().int().describe('Discount actually given: (original - promo price) x units sold in the window'), revenueMinor: z.number().int(), unitsMoved: z.number().int(), ordersCount: z.number().int(),
  budgetUsedBps: z.number().int().nullable(), statsUpdatedAt: IsoDate.nullable(), itemCounts: ItemCounts, endReason: z.string().nullable().describe('ended_manually | window_closed | budget_exhausted | cancelled'),
  horizon: z.enum(['past', 'now', 'next']).describe('past = ended or cancelled, now = running, next = not started (draft or scheduled)'),
  endingSoon: z.boolean().describe('running and ending within 72 hours'), endsInHours: z.number().int().nullable().describe('hours until a running campaign ends; null when it is not running or has no end'),
  capability: z.enum(['supported', 'partial', 'not_supported', 'none']).describe('whether the campaign channels can take price changes: all, some, none, or no channel at all'),
  version: z.number().int(), createdAt: IsoDate, updatedAt: IsoDate,
}).meta({ id: 'PromotionCampaign' });

const Contribution = {
  avgDiscountBps: z.number().int().nullable().describe('average discount over the campaign products that can run; null without products'),
  contributionMinor: z.number().int().nullable().describe('revenue - cost - marketplace fees of the promoted sales; null when nothing sold or any sold unit has no cost price'),
  contributionBps: z.number().int().nullable().describe('contribution as basis points of the revenue; null with contributionMinor'),
  contributionBasis: z.enum(['after_cost_and_fees', 'after_cost_only']).nullable().describe('after_cost_only: a channel has no fee profile, so its fees count as 0'),
};
export const CampaignListSchema = CampaignSchema.extend(Contribution).meta({ id: 'PromotionCampaignRow' });

const MarginRiskSchema = z.object({ checkedProducts: z.number().int(), belowTarget: z.number().int(), unknownCost: z.number().int(), conflicts: z.number().int() })
  .describe("today's margin picture of the campaign products at their promotional prices; null for a finished campaign");
export const CampaignDetailSchema = CampaignListSchema.extend({ velocity: VelocitySchema, marginRisk: MarginRiskSchema.nullable() }).meta({ id: 'PromotionCampaignDetail' });

export const ChannelDetail = z.object({
  accountId: z.string(), marketplace: z.string(), displayName: z.string(), listed: z.boolean(), canPushPrices: z.boolean(),
  regularPriceMinor: z.number().int(), promoPriceMinor: z.number().int(), discountBps: z.number().int(), ok: z.boolean(), reason: z.string().nullable(),
  conflict: z.object({ kind: z.enum(['other_campaign', 'existing_sale']), message: z.string() }).nullable(),
  unitCostMinor: z.number().int().nullable(), feesConfigured: z.boolean(), marginRegularBps: z.number().int().nullable(), marginPromoBps: z.number().int().nullable(),
  targetMarginBps: z.number().int().nullable(), belowTarget: z.boolean().nullable(), minPromoPriceMinor: z.number().int().nullable(), maxDiscountBps: z.number().int().nullable(),
}).meta({ id: 'PromotionChannelDetail' });

export const ItemSchema = z.object({
  id: z.string(), campaignId: z.string(), campaignName: z.string(), campaignCode: z.string(), campaignStatus: z.enum(schema.PROMOTION_STATUSES),
  variantId: z.string(), productId: z.string(), productName: z.string(), sku: z.string(),
  originalPriceMinor: z.number().int(), promoPriceMinor: z.number().int(), discountBps: z.number().int(),
  status: z.enum(schema.PROMOTION_ITEM_STATUSES), reason: z.string().nullable().describe('Why it is ineligible, or what is still pending (e.g. the connector cannot take prices)'),
  lastSyncedAt: IsoDate.nullable(), channels: z.array(Channel),
  availableStock: z.number().int().nullable().describe('on hand minus reserved over the active warehouses'), lowStock: z.boolean().nullable().describe('the shared low-stock rule of Inventory'),
  unitCostMinor: z.number().int().nullable(), marginRegularBps: z.number().int().nullable().describe('margin after cost and the channel fees at the regular price; null = no cost price'),
  marginPromoBps: z.number().int().nullable().describe('the same at the promotional price (the channel with the thinnest margin)'), targetMarginBps: z.number().int().nullable().describe('strictest active pricing-policy target of that channel'),
  belowTarget: z.boolean().nullable(), minPromoPriceMinor: z.number().int().nullable().describe('lowest promotional price that still earns the target margin'),
  conflict: z.object({ kind: z.string(), message: z.string() }).nullable().describe('another running or scheduled campaign, or a sale somebody else set, on a target channel'),
  channelDetails: z.array(ChannelDetail).describe('the same numbers per target channel; empty for a finished campaign'),
}).meta({ id: 'PromotionProduct' });

export function channelsOf(accountIds: string[], accounts: AccountLite[], canPush: CanPush) {
  const picked = accountIds.length ? accounts.filter((a) => accountIds.includes(a.id)) : accounts.filter((a) => a.status === 'active');
  return picked.map((a) => ({ accountId: a.id, marketplace: a.marketplace, displayName: a.displayName, canPushPrices: canPush(a.marketplace) }));
}

export function campaignDto(c: CampaignRow, accounts: AccountLite[], counts: Record<string, number> | undefined, endReason: string | null, canPush: CanPush, now: Date = new Date()) {
  const n = counts ?? {};
  const channels = channelsOf(c.accountIds, accounts, canPush);
  const hours = endsInHours(c.status, c.endsAt, now);
  const get = (k: string) => n[k] ?? 0;
  return {
    id: c.id, name: c.name, code: c.code, description: c.description, type: c.type as (typeof schema.PROMOTION_TYPES)[number],
    valueBps: c.valueBps, valueMinor: c.valueMinor, buyQuantity: c.buyQuantity, getQuantity: c.getQuantity, minOrderMinor: c.minOrderMinor, budgetMinor: c.budgetMinor, currency: c.currency.trim(),
    status: c.status as (typeof schema.PROMOTION_STATUSES)[number], startsAt: c.startsAt?.toISOString() ?? null, endsAt: c.endsAt?.toISOString() ?? null,
    accountIds: c.accountIds, channels,
    spendMinor: c.spendMinor, revenueMinor: c.revenueMinor, unitsMoved: c.unitsMoved, ordersCount: c.ordersCount,
    budgetUsedBps: c.budgetMinor > 0 ? Math.round((c.spendMinor * 10_000) / c.budgetMinor) : null, statsUpdatedAt: c.statsUpdatedAt?.toISOString() ?? null,
    itemCounts: { total: Object.values(n).reduce((s, v) => s + v, 0), eligible: get('eligible'), pending_sync: get('pending_sync'), live: get('live'), ineligible: get('ineligible'), ended: get('ended') },
    horizon: horizonOf(c.status), endsInHours: hours, endingSoon: hours !== null && hours > 0 && hours <= THRESHOLDS.endingSoonHours, capability: capabilityOf(channels),
    endReason, version: c.version, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  };
}


const NONE: ItemInsight = { availableStock: null, lowStock: null, unitCostMinor: null, marginRegularBps: null, marginPromoBps: null, targetMarginBps: null, belowTarget: null, minPromoPriceMinor: null, conflict: null, channelDetails: [] };

/** the campaign row with its list columns (average discount, contribution of its sales) */
export const withExtras = <T extends object>(dto: T, x: CampaignExtras | undefined) => ({ ...dto, avgDiscountBps: x?.avgDiscountBps ?? null, contributionMinor: x?.contributionMinor ?? null, contributionBps: x?.contributionBps ?? null, contributionBasis: x?.contributionBasis ?? null });

export function itemDto(r: { item: ItemRow; campaign: { id: string; name: string; code: string; status: string; accountIds: string[] }; sku: string; productId: string; title: string }, accounts: AccountLite[], canPush: CanPush, insight: ItemInsight = NONE) {
  const i = r.item;
  return {
    id: i.id, campaignId: r.campaign.id, campaignName: r.campaign.name, campaignCode: r.campaign.code, campaignStatus: r.campaign.status as (typeof schema.PROMOTION_STATUSES)[number],
    variantId: i.variantId, productId: r.productId, productName: r.title, sku: r.sku, originalPriceMinor: i.originalPriceMinor, promoPriceMinor: i.promoPriceMinor,
    discountBps: discountBps(i.originalPriceMinor, i.promoPriceMinor), status: i.status as (typeof schema.PROMOTION_ITEM_STATUSES)[number], reason: i.reason,
    lastSyncedAt: i.lastSyncedAt?.toISOString() ?? null, channels: channelsOf(r.campaign.accountIds, accounts, canPush), ...insight,
  };
}
