import { z } from 'zod';
import { IsoDate } from '@oms/contracts';
import { ELIGIBILITY, PROMOTION_STATUSES } from '../domain/candidates';
import { ChannelDetail } from './dto';

const Reason = z.object({ key: z.string(), text: z.string() });

const Pressure = z.object({
  variantId: z.string(), productName: z.string(), sku: z.string(), accountId: z.string(), channel: z.string(), availableStock: z.number().int(),
  marginBps: z.number().int().nullable(), unitsSold30d: z.number().int(), eligibility: z.string(), reasons: z.array(Reason),
});

const OverviewChannel = z.object({
  accountId: z.string(), marketplace: z.string(), displayName: z.string(), status: z.string(), canPushPrices: z.boolean(),
  capability: z.enum(['supported', 'not_supported', 'verification_required']).describe('supported = connected and the connector takes prices; not_supported = the connector cannot; verification_required = the account is not connected'),
  activeCampaigns: z.number().int(), scheduledCampaigns: z.number().int(), liveProducts: z.number().int(), listedProducts: z.number().int(), opportunities: z.number().int(),
});

/** the figures the Overview tab needs beyond the original tiles (all additive; every unknown is null, never a guess) */
export const OverviewInsightsSchema = z.object({
  productsOnPromotion: z.number().int().describe('distinct products in scheduled or running campaigns whose sale is pending or live'),
  liveProducts: z.number().int().describe('distinct products whose sale price is live on a running campaign'),
  eligibleProducts: z.number().int().describe('distinct products in draft, scheduled or running campaigns that can run'),
  conflictItems: z.number().int().describe('campaign products blocked by another campaign or an existing sale'),
  belowMarginTargetItems: z.number().int().nullable().describe('products of scheduled or running campaigns whose margin at the promotional price is below the pricing-policy target of a channel; null when there is nothing to check'),
  endingSoonCampaigns: z.number().int(), nextEndsAt: IsoDate.nullable(), resultsCampaigns: z.number().int().describe('campaigns that ran and have results'),
  opportunities: z.number().int().describe('distinct products recommended for a promotion (product intelligence says promote, and nothing blocks it)'),
  listedProducts: z.number().int().describe('distinct products with an active priced listing'), unlistedVariants: z.number().int().describe('active variants with no active listing (they cannot be promoted)'),
  connectorLimitations: z.number().int().describe('accounts that are not connected or whose connector cannot take price changes'),
  contributionMinor: z.number().int().nullable().describe('revenue - cost - marketplace fees of all promoted sales; null when nothing sold or any promoted unit has no cost price'),
  contributionBps: z.number().int().nullable(), contributionBasis: z.enum(['after_cost_and_fees', 'after_cost_only']).nullable(),
  channels: z.array(OverviewChannel),
  pressure: z.object({
    strongCandidate: Pressure.nullable().describe('best seller that is eligible, well stocked and has a healthy margin; null when none qualifies'),
    reviewFirst: Pressure.nullable().describe('best seller that is low on stock or has a thin margin; null when none'),
  }),
  recentActivity: z.array(z.object({ id: z.number().int(), action: z.string(), createdAt: IsoDate, campaignId: z.string().nullable(), campaignName: z.string().nullable() })),
  thresholds: z.object({ highMarginBps: z.number().int(), strongSellerUnits30d: z.number().int(), highInventoryUnits: z.number().int(), minHealthyMarginBps: z.number().int(), endingSoonHours: z.number().int() }),
});

export const CandidateSchema = z.object({
  variantId: z.string(), productId: z.string(), productName: z.string(), sku: z.string(),
  accountId: z.string(), marketplace: z.string(), channel: z.string(), canPushPrices: z.boolean(),
  regularPriceMinor: z.number().int(), unitCostMinor: z.number().int().nullable(), feesMinor: z.number().int().nullable().describe('commission and fixed fee at the regular price; null = no fee profile'),
  marginBps: z.number().int().nullable().describe('margin after cost and fees at the regular price; null = no cost price'), targetMarginBps: z.number().int().nullable(),
  minPromoPriceMinor: z.number().int().nullable(), maxDiscountBps: z.number().int().nullable().describe('the deepest discount that still earns the target margin'),
  availableStock: z.number().int(), lowStock: z.boolean(), unitsSold30d: z.number().int(), salesVelocity: z.number().describe('units per day'),
  recommendedAction: z.enum(['reorder', 'raise_price', 'liquidate', 'promote', 'hold']), recommendationReasons: z.array(Reason),
  existingCampaign: z.object({ id: z.string(), name: z.string(), status: z.string(), endsAt: IsoDate.nullable() }).nullable().describe('the running, else scheduled, else draft campaign that already has it on this channel'),
  conflicts: z.array(z.object({ kind: z.enum(['pending_price_proposal', 'other_campaign', 'existing_sale']), message: z.string() })),
  pendingProposal: z.object({ id: z.string(), proposedPriceMinor: z.number().int() }).nullable(),
  eligibility: z.enum(ELIGIBILITY), eligibilityReason: z.string().nullable(), promotionStatus: z.enum(PROMOTION_STATUSES),
}).meta({ id: 'PromotionCandidate' });

export const PreviewItem = z.object({
  variantId: z.string(), productId: z.string(), productName: z.string(), sku: z.string(), availableStock: z.number().int().nullable(), lowStock: z.boolean().nullable(),
}).extend(ChannelDetail.shape).meta({ id: 'PromotionPreviewRow' });
