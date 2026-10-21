/** Listings screen contract (GET /listings/overview, /listings/table, /listings/not-listed, POST /listings/bulk-actions). Money is minor units (paise). */

export const SCREEN_STATUSES = ["live", "ready", "needs_review", "syncing", "failed", "blocked"] as const;
export type ScreenStatus = (typeof SCREEN_STATUSES)[number];

/** the tab strip: every listing, one screen status, or the variants that have no listing yet */
export const LISTING_TABS = ["all", ...SCREEN_STATUSES, "not_listed"] as const;
export type ListingTab = (typeof LISTING_TABS)[number];

export const LISTING_STATUSES = ["draft", "ready", "approved", "pending", "active", "rejected", "correction_required", "unpublished"] as const;
export type ListingLifecycle = (typeof LISTING_STATUSES)[number];

export const CONTENT_STATES = ["synced", "sync_pending", "needs_review", "needs_republish", "failed"] as const;
export type ContentState = (typeof CONTENT_STATES)[number];

export const LISTING_SOURCES = ["created", "imported"] as const;
export type ListingSource = (typeof LISTING_SOURCES)[number];

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
  counts: TabCounts;
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
