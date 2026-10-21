import { z } from 'zod';
import { IsoDate } from '@oms/contracts';
import { schema } from '@oms/database';
import { discountBps } from '../domain/terms';
import type { AccountLite } from '../application/campaigns';
import type { CampaignRow, ItemRow } from '../infrastructure/queries';

const Channel = z.object({ accountId: z.string(), marketplace: z.string(), displayName: z.string() });
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
  version: z.number().int(), createdAt: IsoDate, updatedAt: IsoDate,
}).meta({ id: 'PromotionCampaign' });

export const CampaignDetailSchema = CampaignSchema.extend({ velocity: VelocitySchema }).meta({ id: 'PromotionCampaignDetail' });

export const ItemSchema = z.object({
  id: z.string(), campaignId: z.string(), campaignName: z.string(), campaignCode: z.string(), campaignStatus: z.enum(schema.PROMOTION_STATUSES),
  variantId: z.string(), productId: z.string(), productName: z.string(), sku: z.string(),
  originalPriceMinor: z.number().int(), promoPriceMinor: z.number().int(), discountBps: z.number().int(),
  status: z.enum(schema.PROMOTION_ITEM_STATUSES), reason: z.string().nullable().describe('Why it is ineligible, or what is still pending (e.g. the connector cannot take prices)'),
  lastSyncedAt: IsoDate.nullable(), channels: z.array(Channel),
}).meta({ id: 'PromotionProduct' });

export function channelsOf(accountIds: string[], accounts: AccountLite[]) {
  const picked = accountIds.length ? accounts.filter((a) => accountIds.includes(a.id)) : accounts.filter((a) => a.status === 'active');
  return picked.map((a) => ({ accountId: a.id, marketplace: a.marketplace, displayName: a.displayName }));
}

export function campaignDto(c: CampaignRow, accounts: AccountLite[], counts: Record<string, number> | undefined, endReason: string | null) {
  const n = counts ?? {};
  const get = (k: string) => n[k] ?? 0;
  return {
    id: c.id, name: c.name, code: c.code, description: c.description, type: c.type as (typeof schema.PROMOTION_TYPES)[number],
    valueBps: c.valueBps, valueMinor: c.valueMinor, buyQuantity: c.buyQuantity, getQuantity: c.getQuantity, minOrderMinor: c.minOrderMinor, budgetMinor: c.budgetMinor, currency: c.currency.trim(),
    status: c.status as (typeof schema.PROMOTION_STATUSES)[number], startsAt: c.startsAt?.toISOString() ?? null, endsAt: c.endsAt?.toISOString() ?? null,
    accountIds: c.accountIds, channels: channelsOf(c.accountIds, accounts),
    spendMinor: c.spendMinor, revenueMinor: c.revenueMinor, unitsMoved: c.unitsMoved, ordersCount: c.ordersCount,
    budgetUsedBps: c.budgetMinor > 0 ? Math.round((c.spendMinor * 10_000) / c.budgetMinor) : null, statsUpdatedAt: c.statsUpdatedAt?.toISOString() ?? null,
    itemCounts: { total: Object.values(n).reduce((s, v) => s + v, 0), eligible: get('eligible'), pending_sync: get('pending_sync'), live: get('live'), ineligible: get('ineligible'), ended: get('ended') },
    endReason, version: c.version, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  };
}


export function itemDto(r: { item: ItemRow; campaign: { id: string; name: string; code: string; status: string; accountIds: string[] }; sku: string; productId: string; title: string }, accounts: AccountLite[]) {
  const i = r.item;
  return {
    id: i.id, campaignId: r.campaign.id, campaignName: r.campaign.name, campaignCode: r.campaign.code, campaignStatus: r.campaign.status as (typeof schema.PROMOTION_STATUSES)[number],
    variantId: i.variantId, productId: r.productId, productName: r.title, sku: r.sku, originalPriceMinor: i.originalPriceMinor, promoPriceMinor: i.promoPriceMinor,
    discountBps: discountBps(i.originalPriceMinor, i.promoPriceMinor), status: i.status as (typeof schema.PROMOTION_ITEM_STATUSES)[number], reason: i.reason,
    lastSyncedAt: i.lastSyncedAt?.toISOString() ?? null, channels: channelsOf(r.campaign.accountIds, accounts),
  };
}
