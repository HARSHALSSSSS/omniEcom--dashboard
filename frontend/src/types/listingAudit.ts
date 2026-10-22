/** Read models of the catalogue-level listing screens (GET /listings/audit/*, /listings/{id}/sync, /listings/{id}/channels). */

export type ScreenStatus = "live" | "ready" | "needs_review" | "syncing" | "failed" | "blocked";

export interface AuditWindow {
  generatedAt: string;
  listingsEvaluated: number;
  totalListings: number;
  /** the catalogue has more listings than were evaluated (newest first) */
  truncated: boolean;
}

export type SpectrumState = "ready" | "needs_review" | "blocked" | "not_listed";
export type HealthKey = "content" | "attributes" | "media" | "variants" | "compliance" | "price" | "stock" | "category" | "marketplace";

export interface HealthItem {
  key: HealthKey;
  label: string;
  scorePct: number;
  listings: number;
  checks: number;
  unchecked: number;
}

export interface CoverageItem {
  marketplace: string;
  name: string;
  activeProducts: number;
  totalProducts: number;
  percent: number;
}

export type JourneyState = "complete" | "warning" | "current" | "pending";
export interface JourneyStep {
  key: "master" | "mapped" | "content" | "review" | "live";
  title: string;
  statusText: string;
  state: JourneyState;
}

export interface Suggestion {
  id: string;
  marketplace: string;
  marketplaceName: string;
  attribute: string;
  label: string;
  title: string;
  description: string;
  note: string;
  /** a value the same product already carries on another listing; null = the merchant types it */
  suggestedValue: string | null;
  valueSource: string | null;
  listingIds: string[];
  listings: Array<{ id: string; sku: string; productTitle: string }>;
  total: number;
}

export interface ReadinessAudit extends AuditWindow {
  overall: { readinessPct: number | null; readyListings: number; cohortListings: number; readyProducts: number };
  spectrum: Record<SpectrumState, number>;
  health: HealthItem[];
  coverage: CoverageItem[];
  unlistedProducts: number;
  journey: {
    listingId: string;
    productTitle: string;
    sku: string;
    marketplace: string;
    marketplaceName: string;
    accountName: string;
    screenStatus: ScreenStatus;
    steps: JourneyStep[];
  } | null;
  suggestions: Suggestion[];
}

export interface PublishIssue {
  id: string;
  listingId: string;
  productId: string;
  productTitle: string;
  sku: string;
  marketplace: string;
  marketplaceName: string;
  issue: string;
  severity: "blocker" | "warning";
  field: string | null;
  fixAction: string | null;
}

export interface PublishChannel {
  marketplace: string;
  name: string;
  ready: number;
  blocked: number;
  warnings: number;
  categories: string[];
  accounts: Array<{ id: string; name: string; status: string }>;
  /** the active pricing policy that applies to the channel; null = no policy, channel prices stay as set */
  pricingRule: {
    policyId: string;
    name: string;
    strategy: "automated_match" | "margin_floor" | "velocity_boost" | "custom";
    strategyLabel: string;
    scope: "account" | "all_channels";
    summary: string;
  } | null;
  /** how the connector keeps the channel up to date */
  sync: { mode: "real_time" | "polling" | "manual"; label: string; detail: string };
}

export interface PublishingPreparation extends AuditWindow {
  candidateListings: number;
  readyListings: number;
  blockedListings: number;
  readyProducts: number;
  readyVariants: number;
  potentialIssueProducts: number;
  unvalidatedListings: number;
  readyListingIds: string[];
  readyIdsTruncated: boolean;
  issues: PublishIssue[];
  issuesTotal: number;
  channels: PublishChannel[];
  /** what the approval locks until the listing is submitted (price, MRP and content); stock is not locked */
  publishLock: { locked: string[]; notLocked: string[]; statement: string };
}

export interface BulkPublishSummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  failures: Array<{ id: string; sku: string | null; message: string }>;
}

export type StepStatus = "complete" | "in_progress" | "pending" | "failed" | "attention";
export interface SyncStep {
  key: "content" | "stock" | "listing";
  label: string;
  status: StepStatus;
  /** null while a job runs without reporting a total */
  progressPct: number | null;
  /** the running job's own counts (listings for content and stock, stages for a publish); null without a job total */
  progress: { done: number; total: number; failed: number; unit: "listings" | "stages" } | null;
  detail: string;
  at: string | null;
  jobId: string | null;
}

export type SyncState = "syncing" | "synced" | "attention" | "idle";
export interface ListingSync {
  listingId: string;
  generatedAt: string;
  listing: {
    id: string;
    productId: string;
    productTitle: string;
    sku: string;
    variantsCount: number;
    marketplace: string;
    marketplaceName: string;
    accountName: string;
    status: string;
    screenStatus: ScreenStatus;
    externalListingId: string | null;
  };
  state: SyncState;
  startedAt: string | null;
  lastSyncedAt: string | null;
  steps: SyncStep[];
  jobs: Array<{
    id: string;
    type: string;
    status: string;
    scheduledAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    attempts: number;
    maxAttempts: number;
    progress: { total: number; done: number; failed: number };
    error: { code: string; message: string } | null;
  }>;
}

export interface ListingChannel {
  accountId: string;
  accountName: string;
  marketplace: string;
  marketplaceName: string;
  listingId: string | null;
  screenStatus: ScreenStatus | "not_listed";
  readinessPercent: number | null;
  lastSyncAt: string | null;
  externalUrl: string | null;
  current: boolean;
}
export interface ListingChannels {
  listingId: string;
  productId: string;
  productTitle: string;
  variantId: string;
  sku: string;
  variantsCount: number;
  channels: ListingChannel[];
}
