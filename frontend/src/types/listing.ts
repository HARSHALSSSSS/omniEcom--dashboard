import { z } from "zod";

export type ListingStatus =
  | "live"
  | "ready"
  | "needs_review"
  | "blocked"
  | "syncing"
  | "draft"
  | "not_listed"
  | "failed";

export type ListingActionType =
  | "manage"
  | "review"
  | "fix"
  | "view"
  | "publish";

export interface ChannelListingItem {
  id: string;
  productId?: string;
  productTitle: string; // e.g., "Premium Travel Bag"
  sku: string; // e.g., "TRV-1042"
  barcode?: string;
  imageUrl?: string;
  channel: "amazon" | "flipkart" | "meesho" | "shopify" | "snapdeal" | "social";
  channelName: string; // "Amazon", "Flipkart", "Meesho", "Shopify"
  channelListingId?: string; // ASIN, FSN, Shopify Product ID
  channelSku?: string;
  category: string;
  status: ListingStatus;
  sellingPrice: number;
  mrp: number;
  stock: number; // inventory
  readinessScore: number; // 0 to 100
  lastSyncAt: string;
  lastSyncText: string; // "4 min ago", "18 min ago", "Syncing", "2 hr ago"
  actionType: ListingActionType;
  actionLabel: string; // "Review →", "Manage →", "Fix →", "View →", "Publish →"
  publishedAt?: string;
  syncErrors?: string[];
  blockers?: string[];
  attributes?: Record<string, string>;
  qualityScore?: number;
  issueType?: "missing_attributes" | "missing_images" | "category_mismatch" | "variant_issues" | null;
  issueDescription?: string;
}

export interface ListingMatrixChannelStatus {
  channel: "amazon" | "flipkart" | "meesho" | "shopify";
  status: ListingStatus;
  label: string; // "Live", "Ready", "Needs review", "Not listed", "Draft"
  sublabel: string; // "4 min ago", "7 min ago", "18 min ago", "11 min ago", "No listing yet", "Not published"
  color: string;
}

export interface ListingMatrixRow {
  id: string;
  masterTitle: string; // "Premium Travel Bag"
  masterSku: string; // "TRV-1042"
  variantsCount: number; // 4
  signalColor: string; // "#16A34A" or "#D97706"
  channels: {
    amazon: ListingMatrixChannelStatus;
    flipkart: ListingMatrixChannelStatus;
    meesho: ListingMatrixChannelStatus;
    shopify: ListingMatrixChannelStatus;
  };
  connections: {
    amazonToFlipkart: { color: string; style: "solid" | "dashed" };
    flipkartToMeesho: { color: string; style: "solid" | "dashed" };
    meeshoToShopify: { color: string; style: "solid" | "dashed" };
  };
}

export interface CatalogReachKPIs {
  activeListings: number; // 1,042
  masterProducts: number; // 427
  connectedChannels: number; // 4
  readyToPublish: number; // 186
  needReview: number; // 27
}

export interface ListingIssueSummary {
  notReadyCount: number; // 27
  missingAttributes: number; // 12
  missingImages: number; // 7
  categoryMismatch: number; // 5
  variantIssues: number; // 3
}

export interface PublishingPreparationIssue {
  id: string;
  productTitle: string;
  sku: string;
  channel: string;
  issue: string;
  severity: "warning" | "blocker";
}

export interface PublishingPreparationData {
  cohortName: string; // "Ready catalog cohort"
  scopeExplanation: string; // "Catalog-level preparation, not a bulk listing selection."
  selectionDistinction: string; // "The 18 selected listings in the bulk screen are a separate scope."
  readyProductsCount: number; // 186
  readyVariantsCount: number; // 1,284
  potentialIssuesCount: number; // 7
  potentialIssues: PublishingPreparationIssue[];
}

export interface ListingHealthMetric {
  name: string; // "Content", "Attributes", "Media", "Variants", "Compliance"
  score: number; // 92, 84, 96, 89, 71
  color: string; // "#16A34A" or "#D97706"
}

export interface MarketplaceCoverageItem {
  channel: string; // "amazon", "flipkart", "meesho", "shopify"
  channelName: string; // "Amazon", "Flipkart", "Meesho", "Shopify"
  percentage: number; // 100, 74, 44, 55
  activeCount: number; // 427, 318, 186, 236
  totalCount: number; // 427
  color: string; // "#16A34A" or "#D97706"
}

export interface ListingJourneyStep {
  title: string; // "Master", "Mapped", "Content ready", "Marketplace review", "Live"
  statusText: string; // "✓ Complete", "⚠️ Material missing", "⭕ Current stage", "Pending"
  state: "complete" | "warning" | "current" | "pending";
}

export interface ListingReadinessAuditData {
  overallReadinessPct: number; // 72
  readyProductsCount: number; // 186
  cohortDescription: string; // "186 products can be published without additional changes. 72% readiness of preparation cohort."
  spectrogram: Array<{
    id: string;
    status: "ready" | "needs_review" | "blocked" | "not_listed";
    color: string;
  }>;
  healthMetrics: ListingHealthMetric[];
  coverage: MarketplaceCoverageItem[];
  unlistedCount: number; // 241
  journey: {
    productTitle: string; // "Premium Travel Bag"
    channelName: string; // "Meesho"
    statusText: string; // "Needs review"
    steps: ListingJourneyStep[];
    suggestionBox?: {
      id: string;
      title: string; // "4 Meesho listings are missing material information"
      description: string; // "Material is required for these marketplace categories."
      suggestedField: string; // "Material"
      suggestedValue: string; // "Cotton"
      note: string; // "Requires merchant confirmation before applying"
    };
  };
}

export interface ListingFilterParams {
  channel?: string;
  status?: string;
  search?: string;
  marketplace?: string;
  category?: string;
  readiness?: string;
  inventory?: string;
  productStatus?: string;
  potential?: string;
  issue?: string;
  page?: number;
  pageSize?: number;
}

export interface ListingStudioData {
  listing: ChannelListingItem;
  content: {
    title: string;
    description: string;
    bulletPoints: string[];
    searchTerms: string[];
    brand: string;
    manufacturer: string;
  };
  attributes: Array<{
    key: string;
    label: string;
    value: string;
    isRequired: boolean;
    channelSpecific: boolean;
  }>;
  media: Array<{
    id: string;
    url: string;
    isPrimary: boolean;
    aspectRatio: string;
    sizeBytes: number;
  }>;
  variations: Array<{
    id: string;
    sku: string;
    name: string;
    size?: string;
    color?: string;
    price: number;
    stock: number;
    status: ListingStatus;
  }>;
  pricing: {
    sellingPrice: number;
    mrp: number;
    minPrice: number;
    maxPrice: number;
    channelCommissionPct: number;
    estimatedPayout: number;
  };
  readiness: {
    score: number;
    issues: Array<{
      id: string;
      field: string;
      severity: "blocker" | "warning";
      message: string;
      suggestedFix?: string;
    }>;
  };
  activity: Array<{
    id: string;
    timestamp: string;
    action: string;
    actor: string;
    details: string;
  }>;
}

export const updateListingSchema = z.object({
  title: z.string().min(3).optional(),
  productTitle: z.string().min(3).optional(),
  sellingPrice: z.number().positive().optional(),
  mrp: z.number().positive().optional(),
  attributes: z.record(z.string()).optional(),
});
export type UpdateListingInput = z.infer<typeof updateListingSchema>;

export const publishListingSchema = z.object({
  listingId: z.string(),
  channel: z.enum(["amazon", "flipkart", "meesho", "shopify"]).optional(),
});
export type PublishListingInput = z.infer<typeof publishListingSchema>;

export const createListingSchema = z.object({
  productTitle: z.string().min(3, "Title must be at least 3 characters"),
  sku: z.string().min(2, "SKU is required"),
  channel: z.enum(["amazon", "flipkart", "meesho", "shopify", "snapdeal", "social"]),
  sellingPrice: z.number().positive("Price must be positive"),
  mrp: z.number().positive("MRP must be positive"),
  stock: z.number().int().nonnegative().default(0),
  category: z.string().default("General"),
});
export type CreateListingInput = z.infer<typeof createListingSchema>;

export interface ListingChannelStatusItem {
  channel: string; // "amazon", "flipkart", "shopify"
  channelName: string; // "Amazon", "Flipkart", "Shopify"
  status: "live" | "blocked" | "needs_review" | "draft" | "syncing";
  readinessPct: number; // 42, 100, 100
  lastSyncText: string; // "2 hr ago", "11 min ago", "5 min ago"
  accentColor: string; // "#DC2626", "#16A34A"
}

export interface ListingBlockerDetail {
  id: string; // listing id (e.g. "list-3")
  productId: string;
  productTitle: string; // "Cotton Overshirt"
  sku: string; // "OS-2048"
  variantsCount: number; // 3
  channelCategory: string; // "Amazon Apparel"
  fullCategoryPath: string; // "Apparel > Tops > Shirts"
  channel: string; // "amazon"
  channelName: string; // "Amazon"
  status: "blocked" | "ready" | "live";
  blockedCount: number; // 1
  bannerMessage: string; // "1 listing is blocked and cannot be published"
  bannerSubtext: string; // "A mandatory product attribute is missing. Resolve the issue below to enable publishing."
  issueTitle: string; // "Mandatory product attribute missing"
  missingAttribute: string; // "Material"
  currentAttributeValue?: string;
  description: string; // "Add material to continue. This attribute is required for Amazon apparel categories and cannot be published without it."
  otherChannels: ListingChannelStatusItem[];
}

export interface ListingSyncStep {
  name: string; // "Catalog update", "Inventory sync", "Listing update"
  progressPct: number; // 72, 100, 46
  status: "in_progress" | "complete" | "pending";
  statusLabel: string; // "72%", "Complete", "46%"
  color: string; // "#2563EB" or "#16A34A"
}

export interface ListingSyncTelemetryDetail {
  id: string; // e.g. "list-3" or "list-4"
  productId: string;
  productTitle: string; // "Cotton Overshirt"
  sku: string; // "OS-2048"
  variantsCount: number; // 3
  channel: string; // "meesho"
  channelName: string; // "Meesho"
  status: "syncing";
  startedAgoText: string; // "Started 3 min ago"
  lastSyncedAgoText: string; // "Last synced 3 min ago"
  bannerTitle: string; // "Sync in progress · Meesho"
  bannerSubtext: string; // "Catalog, inventory, and listing data are being synchronized. No action required."
  syncSteps: ListingSyncStep[];
  otherChannels: Array<{
    channel: string;
    channelName: string;
    status: "syncing" | "live" | "ready" | "blocked" | "draft";
    lastSyncText: string; // "3 min ago", "8 min ago", "12 min ago"
    accentColor: string;
  }>;
}

export interface ListingUnlistedDetail {
  id: string;
  productId: string;
  productTitle: string;
  sku: string;
  variantsCount: number;
  channel: string;
  channelName: string;
  status: "not_listed";
  description: string;
  inventoryAvailable: number;
  otherChannels: Array<{
    channel: string;
    channelName: string;
    status: "not_listed" | "live" | "draft" | "ready" | "blocked" | "syncing";
    statusLabel: string;
    lastSyncText: string;
    accentColor: string;
    statusDotColor: string;
  }>;
}
