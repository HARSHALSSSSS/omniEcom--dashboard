/**
 * The live side of a product import: the activity feed (`GET /imports/{id}/activity`) and the revalidation progress
 * (`revalidation` on `GET /imports/{id}`). Shapes follow the API; the screens never invent rows or counters.
 */
import type { ImportIssue, ImportSession, IssueSuggestion, Paged } from "./import";

export type ActivityKind =
  | "row_validated"
  | "row_warning"
  | "row_error"
  | "row_created"
  | "row_updated"
  | "row_skipped"
  | "row_failed"
  | "issue_resolved"
  | "stage";

export interface ActivityItem {
  id: string;
  at: string;
  kind: ActivityKind;
  rowNumber: number | null;
  sku: string | null;
  title: string | null;
  message: string;
}

export interface ActivityPage {
  items: ActivityItem[];
  /** cursor for the next (older) page; null at the end of the feed */
  nextBefore: string | null;
}

export interface ActivityQuery {
  limit?: number;
  before?: string | null;
}

export type RevalidationStatus = "idle" | "running" | "complete" | "failed";

export interface RevalidationChange {
  rowNumber: number;
  field: string;
  from: string | null;
  to: string | null;
  outcome: "passed" | "still_failing";
}

export interface ImportRevalidation {
  status: RevalidationStatus;
  total: number;
  checked: number;
  current: string | null;
  changes: RevalidationChange[];
}

/** what the sessions of the API carry beyond `ImportSession` (round 2 of the import design) */
export interface ImportScope {
  products: number;
  newProducts: number;
  updates: number;
}

export type ImportSessionX = ImportSession & {
  revalidation: ImportRevalidation | null;
  scope: ImportScope;
  products: number;
  plan: { create: number; update: number; addVariant: number; skip: number };
};

/** the catalogue product a duplicate row matches (`productData.existing`) */
export interface ExistingProduct {
  id: string;
  productId: string;
  variantId: string | null;
  productCode: string | null;
  sku: string | null;
  title: string | null;
  /** rupees */
  price: number | null;
  barcode: string | null;
}

export interface DuplicateMatch {
  existingSku: string | null;
  existingTitle: string | null;
  confidence: "exact" | "high" | "medium";
  reason: string;
}

export type Confidence = "high" | "medium" | "low";

/** an issue as the API sends it: `ImportIssue` plus the server's copy, the duplicate match and the confidence of its suggestion */
export type IssueX = Omit<ImportIssue, "suggestion" | "productData"> & {
  suggestion: (IssueSuggestion & { confidence?: Confidence; confidenceReason?: string }) | null;
  productData: ImportIssue["productData"] & { existing?: ExistingProduct | null };
  whyItMatters?: string;
  impact?: string;
  duplicateMatch?: DuplicateMatch | null;
};

export type IssueSort = "severity" | "-severity" | "row" | "-row" | "code" | "-code";

export interface IssuesListQuery {
  code?: string;
  severity?: "error" | "warning";
  status?: "open" | "resolved" | "ignored";
  q?: string;
  /** a target field key (`filter[field]`) */
  field?: string;
  sort?: IssueSort;
  page: number;
  pageSize: number;
}

export type IssuesPage = Paged<IssueX> & { sort: string };

/** `revalidation` of `GET /imports/{id}`: null before the first validation */
export const revalidationOf = (session: ImportSession | null | undefined): ImportRevalidation | null => (session as ImportSessionX | null | undefined)?.revalidation ?? null;

export const scopeOf = (session: ImportSession): ImportScope => (session as ImportSessionX).scope;

export const isDuplicateCode = (code: string): boolean => code.startsWith("duplicate_");

export const MATCH_LABEL: Record<DuplicateMatch["confidence"], string> = {
  exact: "Exact match · same SKU and title",
  high: "High-confidence match",
  medium: "Possible match",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };
