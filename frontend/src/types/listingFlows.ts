/** Wire types of the listing flow screens (blocker, not listed yet, bulk selection, quick view). Money is minor units (paise). */
import type { ListingRow, ScreenStatus } from "@/types/listing";

export type ChannelScreenStatus = ScreenStatus | "not_listed";

/** one connected account as seen from one variant: its listing there, or "not listed" where it could still be listed */
export interface ChannelStatus {
  accountId: string;
  accountName: string;
  marketplace: string;
  marketplaceName: string;
  listingId: string | null;
  screenStatus: ChannelScreenStatus;
  readinessPercent: number | null;
  lastSyncAt: string | null;
  externalUrl: string | null;
  /** the account the screen is about */
  current: boolean;
}

/** GET /listings/{id}/channels */
export interface ListingChannelsView {
  listingId: string;
  productId: string;
  productTitle: string;
  variantId: string;
  sku: string;
  variantsCount: number;
  channels: ChannelStatus[];
}

/** GET /listings/unlisted-context */
export interface UnlistedContext {
  variantId: string;
  productId: string;
  productTitle: string;
  sku: string;
  barcode: string | null;
  categoryName: string | null;
  variantsCount: number;
  inventoryAvailable: number;
  account: { id: string; displayName: string; marketplace: string; marketplaceName: string; status: string; canCreateListings: boolean };
  existingListingId: string | null;
  channels: ChannelStatus[];
}

/** GET /listings/selection */
export interface ListingSelection {
  items: ListingRow[];
  missingIds: string[];
}

/** the API takes at most this many listings in one call */
export const MAX_SELECTION = 100;

export type CompletenessStatus = "pass" | "warn" | "fail";

/** one row of the fixed completeness list of the quick view: Title, Images, SKU, Category, Weight */
export interface CompletenessRow {
  key: "title" | "images" | "sku" | "category" | "weight";
  label: string;
  status: CompletenessStatus;
  detail: string;
  field: string | null;
}

/** GET /listings/{id}/flow-details */
export interface ListingFlowDetails {
  listingId: string;
  productId: string;
  variantId: string;
  sku: string;
  variantsCount: number;
  marketplace: string;
  marketplaceName: string;
  category: {
    marketplaceCategoryId: string | null;
    marketplaceName: string | null;
    /** "Fashion > Apparel" */
    marketplacePath: string | null;
    masterName: string | null;
    /** "Apparel > Tops > Shirts" */
    masterPath: string | null;
    /** the path to show: the marketplace path, else the seller's own */
    fullPath: string | null;
    /** "Amazon Apparel" */
    channelCategory: string | null;
  };
  completeness: CompletenessRow[];
}

export type SuggestionSource = "product_attribute" | "variant_option" | "master_field" | "other_listing" | "other_channel" | "keyword_match" | "brand_default" | "category_default";

export interface SuggestionCandidate {
  value: string | number | boolean;
  confidence: number;
  source: SuggestionSource;
  reason: string;
}

/** a value the engine would enter for a failing check; nothing is saved until the user confirms it */
export interface FixSuggestion extends SuggestionCandidate {
  key: string;
  kind: "attribute" | "brand";
  field: string;
  label: string;
  severity: "fail" | "warn";
  confidenceLevel: "high" | "medium" | "low";
  alternatives: SuggestionCandidate[];
  apply: { attributeOverrides?: Record<string, string | number | boolean>; brand?: string };
}

/** GET /listings/{id}/fix-suggestions */
export interface ListingFixSuggestions {
  listingId: string;
  version: number;
  generatedAt: string;
  engine: "rules";
  note: string;
  suggestions: FixSuggestion[];
  unresolved: Array<{ key: string; label: string; reason: string }>;
}

export type BulkTextEdit = { op: "prefix" | "suffix" | "set"; value: string } | { op: "replace"; find: string; value: string; caseSensitive?: boolean };
export type BulkDescriptionEdit = { op: "append" | "prepend" | "set"; value: string } | { op: "replace"; find: string; value: string; caseSensitive?: boolean };
export type BulkListEdit = { op: "set" | "add" | "remove"; values: string[] } | { op: "clear" };
export type BulkBrandEdit = { op: "set"; value: string } | { op: "clear" };

export interface BulkContentEdits {
  title?: BulkTextEdit;
  description?: BulkDescriptionEdit;
  bulletPoints?: BulkListEdit;
  searchTerms?: BulkListEdit;
  brand?: BulkBrandEdit;
}

/** POST /listings/bulk-content */
export interface BulkContentRequest {
  ids: string[];
  edits: BulkContentEdits;
  dryRun?: boolean;
  /** listing id -> the version the screen showed (a listing that changed since is left alone) */
  versions?: Record<string, number>;
}

export interface BulkContentResult {
  action: "edit_content";
  dryRun: boolean;
  summary: { total: number; succeeded: number; failed: number; skipped: number };
  results: Array<{
    index: number;
    id: string;
    sku: string | null;
    ok: boolean;
    status: "done" | "skipped" | "failed";
    outcome: "updated" | "preview" | "unchanged" | null;
    message: string;
    changedFields: string[];
    changes: Record<string, { before: unknown; after: unknown }> | null;
    error: { code: string; message: string } | null;
  }>;
}
