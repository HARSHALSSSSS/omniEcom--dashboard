/** Promotions as the API returns them (money in integer minor units, percentages in basis points). */

export const PROMOTION_TYPES = ["percentage_discount", "flat_discount", "bogo", "bundle"] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export const PROMOTION_STATUSES = ["draft", "scheduled", "active", "ended", "cancelled"] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

export const PROMOTION_ITEM_STATUSES = ["eligible", "pending_sync", "live", "ineligible", "ended"] as const;
export type PromotionItemStatus = (typeof PROMOTION_ITEM_STATUSES)[number];

export type PromotionLifecycleAction = "schedule" | "activate" | "end" | "cancel";

export interface PromotionChannel {
  accountId: string;
  marketplace: string;
  displayName: string;
}

export interface PromotionItemCounts {
  total: number;
  eligible: number;
  pending_sync: number;
  live: number;
  ineligible: number;
  ended: number;
}

export interface PromotionOverview {
  currency: string;
  activeCampaigns: number;
  scheduledCampaigns: number;
  draftCampaigns: number;
  endedCampaigns: number;
  revenueMinor: number;
  spendMinor: number;
  budgetMinor: number;
  budgetUsedBps: number | null;
  unitsMoved: number;
  velocityLiftBps: number | null;
  velocityCampaigns: number;
  statsUpdatedAt: string | null;
}

export interface PromotionCampaign {
  id: string;
  name: string;
  code: string;
  description: string | null;
  type: PromotionType;
  valueBps: number | null;
  valueMinor: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  minOrderMinor: number;
  /** 0 = no budget limit */
  budgetMinor: number;
  currency: string;
  status: PromotionStatus;
  startsAt: string | null;
  endsAt: string | null;
  /** empty = every connected account */
  accountIds: string[];
  channels: PromotionChannel[];
  spendMinor: number;
  revenueMinor: number;
  unitsMoved: number;
  ordersCount: number;
  budgetUsedBps: number | null;
  statsUpdatedAt: string | null;
  itemCounts: PromotionItemCounts;
  endReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionVelocity {
  liftBps: number | null;
  promoUnits: number;
  promoDays: number;
  baselineUnits: number;
  baselineDays: number;
}

export interface PromotionCampaignDetail extends PromotionCampaign {
  velocity: PromotionVelocity;
}

export interface PromotionProduct {
  id: string;
  campaignId: string;
  campaignName: string;
  campaignCode: string;
  campaignStatus: PromotionStatus;
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  originalPriceMinor: number;
  promoPriceMinor: number;
  discountBps: number;
  status: PromotionItemStatus;
  reason: string | null;
  lastSyncedAt: string | null;
  channels: PromotionChannel[];
}

export interface Paged<T, C> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  counts: C;
}

export type CampaignCounts = Record<"all" | PromotionStatus, number>;
export type ProductCounts = Record<"all" | PromotionItemStatus, number>;
export type CampaignsPage = Paged<PromotionCampaign, CampaignCounts>;
export type ProductsPage = Paged<PromotionProduct, ProductCounts>;

export type PromotionView = "overview" | "products" | "campaigns";

export interface CampaignsQuery {
  status?: PromotionStatus;
  type?: PromotionType;
  q?: string;
  page: number;
  pageSize: number;
}

export interface ProductsQuery {
  status?: PromotionItemStatus;
  campaignId?: string;
  accountId?: string;
  q?: string;
  page: number;
  pageSize: number;
}

/** which products a campaign takes */
export interface ProductSelection {
  variantIds?: string[];
  categoryIds?: string[];
  allActive?: boolean;
}

export interface SelectionResult {
  total: number;
  added: number;
  removed: number;
  skipped: Array<{ variantId: string; reason: string }>;
  droppedNoListing: number;
}

export interface CampaignWrite {
  name: string;
  code?: string;
  description?: string | null;
  type: PromotionType;
  valueBps?: number | null;
  valueMinor?: number | null;
  buyQuantity?: number | null;
  getQuantity?: number | null;
  minOrderMinor?: number;
  budgetMinor?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  accountIds?: string[];
}

export interface CreateCampaignResult {
  campaign: PromotionCampaign;
  products: SelectionResult | null;
}

export interface PushOutcome {
  accountId: string;
  skipped?: string;
}

export interface LifecycleResult {
  campaign: PromotionCampaign;
  changed: boolean;
  pushed: PushOutcome[];
}

/** a connected marketplace account the campaign can target */
export interface PromotionAccount {
  id: string;
  marketplace: string;
  displayName: string;
  status: string;
}

/** a variant the seller can pick for a campaign */
export interface PickerVariant {
  id: string;
  productId: string;
  sku: string;
  productTitle: string;
  optionValues: Record<string, string>;
  sellingPriceMinor: number | null;
  status: "active" | "inactive";
}

export interface PickerPage {
  items: PickerVariant[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CategoryOption {
  id: string;
  /** indented path name for the picker */
  label: string;
}

export interface ProcessResult {
  activated: number;
  ended: number;
  refreshed: number;
}
