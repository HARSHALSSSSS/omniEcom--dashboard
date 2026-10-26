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
  /** false: the connector cannot take price changes */
  canPushPrices: boolean;
}

export interface PromotionItemCounts {
  total: number;
  eligible: number;
  pending_sync: number;
  live: number;
  ineligible: number;
  ended: number;
}

export type ContributionBasis = "after_cost_and_fees" | "after_cost_only";
export type ChannelCapability = "supported" | "not_supported" | "verification_required";
export type Eligibility = "eligible" | "margin_risk" | "low_inventory" | "verification_required" | "not_provided" | "conflict";
export type CandidateStatus = "recommended" | "review" | "not_selected" | "connector_unavailable";

export interface PromotionThresholds {
  highMarginBps: number;
  strongSellerUnits30d: number;
  highInventoryUnits: number;
  minHealthyMarginBps: number;
  endingSoonHours: number;
}

export interface OverviewChannel {
  accountId: string;
  marketplace: string;
  displayName: string;
  status: string;
  canPushPrices: boolean;
  capability: ChannelCapability;
  activeCampaigns: number;
  scheduledCampaigns: number;
  liveProducts: number;
  listedProducts: number;
  opportunities: number;
}

export interface PressurePick {
  variantId: string;
  productName: string;
  sku: string;
  accountId: string;
  channel: string;
  availableStock: number;
  marginBps: number | null;
  unitsSold30d: number;
  eligibility: string;
  reasons: Array<{ key: string; text: string }>;
}

export interface PromotionActivity {
  id: number;
  action: string;
  createdAt: string;
  campaignId: string | null;
  campaignName: string | null;
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
  productsOnPromotion: number;
  liveProducts: number;
  eligibleProducts: number;
  conflictItems: number;
  /** null: nothing scheduled or running to check */
  belowMarginTargetItems: number | null;
  endingSoonCampaigns: number;
  nextEndsAt: string | null;
  resultsCampaigns: number;
  opportunities: number;
  listedProducts: number;
  unlistedVariants: number;
  connectorLimitations: number;
  /** null: nothing sold, or a promoted unit has no cost price */
  contributionMinor: number | null;
  contributionBps: number | null;
  contributionBasis: ContributionBasis | null;
  channels: OverviewChannel[];
  pressure: { strongCandidate: PressurePick | null; reviewFirst: PressurePick | null };
  recentActivity: PromotionActivity[];
  thresholds: PromotionThresholds;
}

/** one product on one channel, as the Products tab lists it */
export interface PromotionCandidate {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  accountId: string;
  marketplace: string;
  channel: string;
  canPushPrices: boolean;
  regularPriceMinor: number;
  unitCostMinor: number | null;
  feesMinor: number | null;
  marginBps: number | null;
  targetMarginBps: number | null;
  minPromoPriceMinor: number | null;
  maxDiscountBps: number | null;
  availableStock: number;
  lowStock: boolean;
  unitsSold30d: number;
  salesVelocity: number;
  recommendedAction: "reorder" | "raise_price" | "liquidate" | "promote" | "hold";
  recommendationReasons: Array<{ key: string; text: string }>;
  existingCampaign: { id: string; name: string; status: string; endsAt: string | null } | null;
  conflicts: Array<{ kind: "pending_price_proposal" | "other_campaign" | "existing_sale"; message: string }>;
  pendingProposal: { id: string; proposedPriceMinor: number } | null;
  eligibility: Eligibility;
  eligibilityReason: string | null;
  promotionStatus: CandidateStatus;
}

export const CANDIDATE_STATUSES = ["recommended", "review", "not_selected", "connector_unavailable"] as const;
export const CANDIDATE_QUICK_FILTERS = ["high_margin", "strong_sellers", "eligible", "high_inventory", "not_in_campaign"] as const;
export type CandidateQuick = (typeof CANDIDATE_QUICK_FILTERS)[number];
export const CANDIDATE_SORTS = ["priority", "sales", "margin", "stock", "name"] as const;
export type CandidateSort = (typeof CANDIDATE_SORTS)[number];
/** custom = the seller's own selection (no server filter) */
export const PRODUCT_SEGMENTS = ["recommended", "custom", "all"] as const;
export type ProductSegment = (typeof PRODUCT_SEGMENTS)[number];

export interface CandidatesQuery {
  segment: "recommended" | "all";
  status?: CandidateStatus;
  quick?: CandidateQuick;
  accountId?: string;
  marketplace?: string;
  sort?: CandidateSort;
  q?: string;
  page: number;
  pageSize: number;
}

export interface CandidatesPage {
  items: PromotionCandidate[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  counts: Record<"all" | CandidateStatus, number>;
  summary: { recommendedProducts: number; listedProducts: number; unlistedVariants: number; placements: number };
  thresholds: PromotionThresholds;
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
  /** past = ended or cancelled, now = running, next = not started */
  horizon: "past" | "now" | "next";
  /** running and ending within the threshold */
  endingSoon: boolean;
  /** hours until a running campaign ends; null when it is not running or has no end */
  endsInHours: number | null;
  /** whether the campaign channels can take price changes: all, some, none, or no channel at all */
  capability: "supported" | "partial" | "not_supported" | "none";
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MarginRisk {
  checkedProducts: number;
  belowTarget: number;
  unknownCost: number;
  conflicts: number;
}

/** a campaign as the ledger lists it: the campaign plus its average discount, the contribution of its sales and its margin risk */
export interface PromotionCampaignRow extends PromotionCampaign {
  avgDiscountBps: number | null;
  /** revenue - cost - marketplace fees of the promoted sales; null when nothing sold or any sold unit has no cost price */
  contributionMinor: number | null;
  contributionBps: number | null;
  contributionBasis: ContributionBasis | null;
  /** today's margin picture of its products at the promotional prices; null once finished */
  marginRisk: MarginRisk | null;
}

export interface PromotionVelocity {
  liftBps: number | null;
  promoUnits: number;
  promoDays: number;
  baselineUnits: number;
  baselineDays: number;
}

export interface PromotionCampaignDetail extends PromotionCampaignRow {
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
export type CampaignHorizon = "past" | "now" | "next";
export const CAMPAIGN_HORIZONS: readonly CampaignHorizon[] = ["past", "now", "next"];
export const CAMPAIGN_SORTS = ["newest", "ends_soon", "revenue", "name"] as const;
export type CampaignSort = (typeof CAMPAIGN_SORTS)[number];
export type CampaignsPage = Paged<PromotionCampaignRow, CampaignCounts> & { horizonCounts: Record<CampaignHorizon, number> };
export type ProductsPage = Paged<PromotionProduct, ProductCounts>;

export type PromotionView = "overview" | "products" | "campaigns";

export interface CampaignsQuery {
  status?: PromotionStatus;
  type?: PromotionType;
  horizon?: CampaignHorizon;
  endingSoon?: boolean;
  marketplace?: string;
  accountId?: string;
  sort?: CampaignSort;
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

/** what the Create Campaign dialog starts from when it is opened for chosen products (the Products tab, an Overview opportunity) */
export interface CampaignPrefill {
  /** the one channel the campaign runs on; null = every connected channel */
  accountId: string | null;
  variants: PickerVariant[];
  /** a discount that keeps the margin target on the chosen products, when it is known */
  discountBps: number | null;
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

/** the body of POST /promotions/preview: the create terms plus the products to look at (nothing is saved) */
export interface PreviewRequest {
  type: PromotionType;
  valueBps?: number | null;
  valueMinor?: number | null;
  buyQuantity?: number | null;
  getQuantity?: number | null;
  accountIds?: string[];
  variantIds: string[];
  startsAt?: string | null;
  endsAt?: string | null;
}

/** one product on one channel under the previewed terms */
export interface PreviewRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  availableStock: number | null;
  lowStock: boolean | null;
  accountId: string;
  marketplace: string;
  displayName: string;
  listed: boolean;
  canPushPrices: boolean;
  regularPriceMinor: number;
  promoPriceMinor: number;
  discountBps: number;
  ok: boolean;
  reason: string | null;
  conflict: { kind: "other_campaign" | "existing_sale"; message: string } | null;
  unitCostMinor: number | null;
  feesConfigured: boolean;
  marginRegularBps: number | null;
  marginPromoBps: number | null;
  targetMarginBps: number | null;
  belowTarget: boolean | null;
  minPromoPriceMinor: number | null;
  maxDiscountBps: number | null;
}

export interface PreviewSummary {
  products: number;
  placements: number;
  runnable: number;
  notRunnable: number;
  notListed: number;
  belowMarginTarget: number;
  unknownCost: number;
  conflicts: number;
  connectorCannotPush: number;
  avgDiscountBps: number | null;
  unknownVariants: number;
}

export interface PreviewResult {
  summary: PreviewSummary;
  items: PreviewRow[];
}
