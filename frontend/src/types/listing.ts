/** Listings screen contract (GET /listings/overview, /listings/table, /listings/not-listed, POST /listings/bulk-actions). Money is minor units (paise). */

export const SCREEN_STATUSES = ["live", "ready", "needs_review", "syncing", "failed", "blocked"] as const;
export type ScreenStatus = (typeof SCREEN_STATUSES)[number];

/**
 * the tab strip: every listing, one screen status, the draft listings (lifecycle status `draft`, whatever their screen status is),
 * or the variants that have no listing yet
 */
export const LISTING_TABS = ["all", ...SCREEN_STATUSES, "draft", "not_listed"] as const;
export type ListingTab = (typeof LISTING_TABS)[number];

export const LISTING_STATUSES = ["draft", "ready", "approved", "pending", "active", "rejected", "correction_required", "unpublished"] as const;
export type ListingLifecycle = (typeof LISTING_STATUSES)[number];

export const CONTENT_STATES = ["synced", "sync_pending", "needs_review", "needs_republish", "failed"] as const;
export type ContentState = (typeof CONTENT_STATES)[number];

export const LISTING_SOURCES = ["created", "imported"] as const;
export type ListingSource = (typeof LISTING_SOURCES)[number];

/** "why not ready" causes: each one filters the table to the listings it affects */
export const LISTING_ISSUES = ["missing_attributes", "missing_images", "category_mismatch", "variant_issues"] as const;
export type ListingIssueKey = (typeof LISTING_ISSUES)[number];

/** readiness bands: 100 = 100% | high = 80-99% | medium = 50-79% | low = below 50% */
export const READINESS_BANDS = ["100", "high", "medium", "low"] as const;
export type ReadinessBand = (typeof READINESS_BANDS)[number];

export const INVENTORY_FILTERS = ["in_stock", "out_of_stock"] as const;
export type InventoryFilter = (typeof INVENTORY_FILTERS)[number];

/** high_velocity = sold at least 5 units in the last 30 days | missing_channel = could still be listed on a connected account */
export const POTENTIALS = ["high_velocity", "missing_channel"] as const;
export type Potential = (typeof POTENTIALS)[number];

export const PRODUCT_STATUSES = ["active", "draft", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const LISTING_SORTS = ["-updatedAt", "updatedAt", "title", "-title", "sku", "-sku", "price", "-price", "status", "-status"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export const BULK_ACTIONS = ["validate", "publish", "unpublish", "retry", "sync_inventory"] as const;
export type ListingBulkAction = (typeof BULK_ACTIONS)[number];

export interface ListingTableBlock {
  screenStatus: ScreenStatus;
  barcode: string | null;
  thumbnailUrl: string | null;
  imageCount: number;
  categoryName: string | null;
  marketplaceName: string;
  accountName: string;
  marketplaceCategoryName: string | null;
  priceMinor: number | null;
  mrpMinor: number | null;
  salePriceMinor: number | null;
  saleEndsAt: string | null;
  stock: { available: number; sellable: number; pushed: number | null; dirty: boolean };
  readiness: {
    percent: number;
    ready: boolean;
    errors: number;
    warnings: number;
    attributesChecked: boolean;
    topBlocker: { message: string; field: string | null } | null;
  };
  externalListingId: string | null;
  externalUrl: string | null;
  lastSyncAt: string | null;
}

export interface ListingIssue {
  code: string;
  message: string;
  attribute?: string;
  severity: "error" | "warning";
}

export interface ListingRow {
  id: string;
  marketplaceAccountId: string;
  marketplace: string;
  variantId: string;
  productId: string;
  sku: string;
  productTitle: string;
  externalSku: string;
  externalListingId: string | null;
  status: ListingLifecycle;
  source: ListingSource;
  currency: string;
  publishedAt: string | null;
  contentState: ContentState;
  contentChangedFields: string[];
  contentError: string | null;
  issues: ListingIssue[];
  version: number;
  updatedAt: string;
  table: ListingTableBlock;
}

export type TabCounts = Record<"all" | ScreenStatus, number>;

export interface ListingsTablePage {
  items: ListingRow[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  /** per tab; `draft` only comes with the one-product view (the numbered table's overview has the draft count) */
  counts: TabCounts & { draft?: number };
}

export interface ListingsOverview {
  totals: { listings: number; live: number; needsAttention: number; notListed: number };
  byScreenStatus: Partial<Record<ScreenStatus | "not_listed", number>>;
  byStatus: Record<string, number>;
  byContentState: Record<string, number>;
  byMarketplace: Array<{ marketplace: string; name: string; total: number; live: number; needsAttention: number; notListed: number }>;
}

export interface NotListedRow {
  variantId: string;
  productId: string;
  sku: string;
  barcode: string | null;
  productTitle: string;
  priceMinor: number | null;
  mrpMinor: number | null;
  accountId: string;
  accountName: string;
  marketplace: string;
  marketplaceName: string;
}

export interface NotListedPage {
  items: NotListedRow[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface ListingFilters {
  tab: ListingTab;
  q?: string;
  marketplace?: string;
  accountId?: string;
  status?: ListingLifecycle;
  contentState?: ContentState;
  source?: ListingSource;
  /** needs_review + failed + blocked */
  attention?: boolean;
  /** only the listings of this product */
  productId?: string;
  issue?: ListingIssueKey;
  /** master category (its sub-categories included) */
  categoryId?: string;
  productStatus?: ProductStatus;
  readiness?: ReadinessBand;
  inventory?: InventoryFilter;
  potential?: Potential;
}

export interface ListingsQuery extends ListingFilters {
  sort: ListingSort;
  page: number;
  pageSize: number;
}

export interface BulkItemResult {
  index: number;
  id: string;
  sku: string | null;
  ok: boolean;
  status: "done" | "skipped" | "failed";
  outcome: string | null;
  message: string;
  jobId: string | null;
  error: { code: string; message: string } | null;
}

export interface BulkListingsResponse {
  action: string;
  summary: { total: number; succeeded: number; failed: number; skipped: number };
  results: BulkItemResult[];
}

export interface ListingAccount {
  id: string;
  marketplace: string;
  displayName: string;
  status: string;
}

export interface MarketplaceOption {
  code: string;
  name: string;
}

export interface ListingChannels {
  accounts: ListingAccount[];
  marketplaces: MarketplaceOption[];
}

export interface CreateTarget {
  variantId: string;
  accountId: string;
  /** shown in the results */
  label: string;
}

export interface CreateOutcome {
  key: string;
  label: string;
  ok: boolean;
  message: string;
  listingId: string | null;
}

export type JobStatus = "queued" | "running" | "retrying" | "succeeded" | "partially_failed" | "failed" | "dead_lettered" | "cancelled";

export interface SyncJobView {
  id: string;
  status: JobStatus;
  error: { code: string; message: string } | null;
}

/** GET /listings/matrix: master products x marketplaces */
export type MatrixStatus = ScreenStatus | "not_listed";

export interface MatrixCell {
  status: MatrixStatus;
  listings: number;
  /** variants of the product that have a listing on this marketplace */
  listedVariants: number;
  byStatus: Partial<Record<ScreenStatus, number>>;
}

export interface ListingsMatrix {
  /** active master products */
  total: number;
  channels: Array<{ code: string; name: string; accounts: number; connected: boolean }>;
  items: Array<{ productId: string; title: string; sku: string; variantsCount: number; signal: MatrixStatus; channels: Record<string, MatrixCell> }>;
}

/** GET /listings/insights: catalogue reach and why listings are not ready */
export interface ListingsInsights {
  masterProducts: number;
  connectedChannels: number;
  activeListings: number;
  readyToPublish: number;
  needReview: number;
  issues: { notReady: number; missingAttributes: number; missingImages: number; categoryMismatch: number; variantIssues: number };
}

/** GET /listings/channel-summary: one row per marketplace of the connector registry */
export interface ChannelSummaryRow {
  code: string;
  name: string;
  implementation: string | null;
  /** the connector accepts listings through the API */
  listable: boolean;
  /** the channel group the marketplace belongs to (social) */
  group: string | null;
  accounts: number;
  activeAccounts: number;
  connected: boolean;
  listings: number;
  live: number;
  needsAttention: number;
  drafts: number;
  notListed: number;
}

export interface ChannelGroupRow extends Omit<ChannelSummaryRow, "implementation" | "listable" | "group"> {
  marketplaces: string[];
}

export interface ChannelSummary {
  channels: ChannelSummaryRow[];
  groups: ChannelGroupRow[];
}

/** GET /listings/filter-options */
export interface ListingFilterOptions {
  categories: Array<{ id: string; name: string; path: string; listings: number }>;
}

/** POST /listings/bulk-create */
export interface BulkCreateItem {
  index: number;
  variantId: string;
  accountId: string;
  sku: string | null;
  productTitle: string | null;
  accountName: string | null;
  marketplace: string | null;
  ok: boolean;
  status: "created" | "exists" | "failed";
  listingId: string | null;
  message: string;
  error: { code: string; message: string } | null;
}

export interface BulkCreateResponse {
  summary: { total: number; created: number; existing: number; failed: number };
  marketplaces: Array<{ code: string; name: string }>;
  results: BulkCreateItem[];
}

export interface BulkCreateInput {
  productIds?: string[];
  variantIds?: string[];
  accountIds: string[];
}

/** a master product found by the create dialog's search */
export interface ProductChoice {
  id: string;
  title: string;
  sku: string;
  variantCount: number;
  thumbnailUrl: string | null;
}
