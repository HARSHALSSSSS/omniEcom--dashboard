/** Wire types of the Listing Studio (GET /listings/{id}/studio and the writes behind it). Money is always minor units (paise). */

export type ScreenStatus = "live" | "ready" | "needs_review" | "syncing" | "failed" | "blocked";
export type ContentState = "synced" | "sync_pending" | "needs_review" | "needs_republish" | "failed";
export type CheckStatus = "pass" | "warn" | "fail";
export type ReadinessGroupKey = "content" | "media" | "attributes" | "price" | "stock" | "category" | "marketplace";
export type FixActionKey =
  | "edit_content"
  | "upload_images"
  | "fill_attribute"
  | "set_price"
  | "set_mrp"
  | "map_category"
  | "add_barcode"
  | "restock"
  | "reconnect_account"
  | "validate"
  | "review_marketplace_feedback";
export type StudioActionKey =
  | "edit"
  | "validate"
  | "approve"
  | "publish"
  | "publish_flow"
  | "unpublish"
  | "refresh_status"
  | "sync_content"
  | "resolve_review"
  | "sync_inventory"
  | "delete";

export interface StudioAction {
  action: StudioActionKey;
  label: string;
  enabled: boolean;
  disabledReason: string | null;
}

export interface ListingIssue {
  code: string;
  message: string;
  attribute?: string;
  severity: "error" | "warning";
}

export interface ContentReview {
  reason?: string;
  fromCategoryId?: string;
  toCategoryId?: string;
  suggestedMarketplaceCategoryId?: string;
  suggestedMarketplaceCategoryName?: string;
}

export interface StudioListing {
  id: string;
  marketplaceAccountId: string;
  marketplace: string;
  variantId: string;
  productId: string;
  sku: string;
  productTitle: string;
  externalSku: string;
  externalListingId: string | null;
  status: "draft" | "ready" | "approved" | "pending" | "active" | "rejected" | "correction_required" | "unpublished";
  externalStatus: string | null;
  marketplaceCategoryId: string | null;
  currency: string;
  priceMinor: number | null;
  mrpMinor: number | null;
  effectivePriceMinor: number | null;
  effectiveMrpMinor: number | null;
  attributeValues: Record<string, string | number | boolean>;
  issues: ListingIssue[];
  contentState: ContentState;
  contentChangedFields: string[];
  contentReview: ContentReview;
  contentError: string | null;
  version: number;
  updatedAt: string;
  table: {
    screenStatus: ScreenStatus;
    thumbnailUrl: string | null;
    marketplaceName: string;
    accountName: string;
  };
}

export interface ContentField<T> {
  master: T;
  effective: T;
  overridden: boolean;
}

export interface StudioContent {
  title: ContentField<string>;
  description: ContentField<string | null>;
  bulletPoints: ContentField<string[]>;
  searchTerms: ContentField<string[]>;
  brand: ContentField<string | null>;
}

export interface ReadinessItem {
  key: string;
  group: ReadinessGroupKey;
  status: CheckStatus;
  label: string;
  message: string;
  field: string | null;
  fix: { action: FixActionKey; field: string | null } | null;
}

export interface Readiness {
  percent: number;
  ready: boolean;
  summary: { pass: number; warn: number; fail: number };
  topBlocker: { key: string; message: string; field: string | null; fix: { action: FixActionKey; field: string | null } | null } | null;
  groups: Array<{ key: ReadinessGroupKey; label: string; status: CheckStatus; passed: number; total: number; items: ReadinessItem[] }>;
}

export interface StudioAttribute {
  key: string;
  label: string;
  required: boolean;
  type: "string" | "number" | "boolean" | "enum";
  allowedValues: string[] | null;
  maxLength: number | null;
  value: string | number | boolean | null;
  source: string | null;
  channelSpecific: boolean;
  status: CheckStatus;
}

export interface StudioMedia {
  id: string;
  url: string | null;
  fileName: string;
  isPrimary: boolean;
  width: number | null;
  height: number | null;
}

export interface StudioVariation {
  variantId: string;
  sku: string;
  optionValues: Record<string, string> | null;
  priceMinor: number | null;
  available: number;
  listingId: string | null;
  listingStatus: string | null;
  current: boolean;
}

export interface ActivityItem {
  id: string;
  at: string;
  action: string;
  title: string;
  details: string;
  actor: { type: string; id: string | null; name: string };
}

export interface ActivityPage {
  total: number;
  items: ActivityItem[];
}

export interface ListingStudio {
  listing: StudioListing;
  product: { id: string; variantId: string; sku: string; title: string; brand: string | null; barcode: string | null; categoryName: string | null; thumbnailUrl: string | null };
  account: { id: string; displayName: string; marketplace: string; marketplaceName: string; status: string; mode: string };
  content: StudioContent;
  preview: {
    title: string;
    description: string | null;
    bulletPoints: string[];
    priceMinor: number | null;
    mrpMinor: number | null;
    discountPercent: number;
    images: string[];
    endpoint: string;
    payload: unknown;
    warnings: string[];
    approval: { approved: boolean; current: boolean; approvedAt: string | null };
  };
  readiness: Readiness;
  pricing: {
    priceMinor: number | null;
    mrpMinor: number | null;
    salePriceMinor: number | null;
    saleEndsAt: string | null;
    discountPercent: number;
    variantPriceMinor: number | null;
    variantMrpMinor: number | null;
    listingPriceOverride: boolean;
    listingMrpOverride: boolean;
    costMinor: number | null;
    grossMarginMinor: number | null;
    currency: string;
  };
  stock: { available: number; sellable: number; pushed: number | null; dirty: boolean; bufferOverride: number | null; maxQuantityOverride: number | null; pushedAt: string | null };
  category: { marketplaceCategoryId: string | null; marketplaceCategoryName: string | null; masterCategoryName: string | null; attributes: StudioAttribute[] };
  media: StudioMedia[];
  variations: StudioVariation[];
  contentSync: { state: ContentState; changedFields: string[]; review: ContentReview; error: string | null; changedAt: string | null; syncedAt: string | null };
  marketplaceIssues: ListingIssue[];
  externalUrl: string | null;
  activity: ActivityPage;
  actions: StudioAction[];
}

export interface ActivityPageResult extends ActivityPage {
  page: number;
  pageSize: number;
  pages: number;
}

/** PATCH /listings/{id} body: only what changed. null = back to the master / product value. */
export interface ListingPatch {
  version: number;
  priceMinor?: number | null;
  mrpMinor?: number | null;
  title?: string | null;
  description?: string | null;
  bulletPoints?: string[] | null;
  searchTerms?: string[] | null;
  brand?: string | null;
  attributeOverrides?: Record<string, string | number | boolean | null>;
  marketplaceCategoryId?: string;
}

export interface SyncJob {
  id: string;
  status: "queued" | "running" | "retrying" | "succeeded" | "partially_failed" | "failed" | "dead_lettered" | "cancelled";
  error: { code: string; message: string } | null;
}

export const isJobDone = (s: SyncJob["status"]): boolean => s !== "queued" && s !== "running" && s !== "retrying";

export interface FlowStep {
  step: "validate" | "approve" | "publish";
  status: "ok" | "failed" | "skipped" | "not_run";
  message: string;
  code: string | null;
  durationMs: number;
}

export interface PublishFlowResult {
  listingId: string;
  outcome: "queued" | "blocked" | "failed" | "not_applicable";
  steps: FlowStep[];
  job: SyncJob | null;
  alreadyQueued: boolean;
}

export interface ValidateResult {
  validation: { ready: boolean; errors: Array<{ code: string; message: string; attribute?: string }>; warnings: Array<{ code: string; message: string; attribute?: string }> };
}

export type ReviewResolution = { action: "accept_mapping" } | { action: "keep_current" } | { action: "set_category"; marketplaceCategoryId: string };

export interface MarketplaceCategory {
  id: string;
  name: string;
  path: string | null;
  leaf: boolean;
}

export interface JobResult {
  job: SyncJob;
  alreadyQueued: boolean;
}
