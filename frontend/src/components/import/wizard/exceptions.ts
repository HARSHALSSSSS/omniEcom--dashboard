import type { ExistingProduct, ImportIssue, ImportPlan, ImportScope, ImportSummary } from "@/types/import";

/** the kinds of exception the review step groups the API's issue codes into (the design's filter pills) */
export type ExceptionBucket = "categories" | "skus" | "duplicates" | "images" | "other";

export const BUCKET_ORDER: ExceptionBucket[] = ["categories", "skus", "duplicates", "images", "other"];

export function bucketOf(code: string): ExceptionBucket {
  if (code === "category_unmapped") return "categories";
  if (code === "missing_sku" || code === "invalid_sku") return "skus";
  if (code.startsWith("duplicate")) return "duplicates";
  if (code === "invalid_image") return "images";
  return "other";
}

export const isDuplicateIssue = (issue: Pick<ImportIssue, "code">): boolean => bucketOf(issue.code) === "duplicates";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** pill label: "Categories · 8" */
export const PILL_LABEL: Record<ExceptionBucket, (n: number) => string> = {
  categories: (n) => `Categories · ${n}`,
  skus: (n) => `Missing SKUs · ${n}`,
  duplicates: (n) => `Duplicates · ${n}`,
  images: (n) => `Image URL · ${n}`,
  other: (n) => `Other · ${n}`,
};

/** side panel line: "8 category mappings" */
export const SIDEBAR_LABEL: Record<ExceptionBucket, (n: number) => string> = {
  categories: (n) => `${n} ${plural(n, "category mapping", "category mappings")}`,
  skus: (n) => `${n} missing ${plural(n, "SKU", "SKUs")}`,
  duplicates: (n) => `${n} duplicate ${plural(n, "product", "products")}`,
  images: (n) => `${n} invalid image ${plural(n, "URL", "URLs")}`,
  other: (n) => `${n} other ${plural(n, "issue", "issues")}`,
};

export interface BucketInfo {
  bucket: ExceptionBucket;
  /** open issues of this kind */
  open: number;
  /** the API's issue codes of this kind that occur in the file */
  codes: string[];
}

/** open issues per kind, from the validation summary (all five kinds, in the design's order) */
export function bucketsOf(summary: ImportSummary | undefined): BucketInfo[] {
  const out = new Map<ExceptionBucket, BucketInfo>(BUCKET_ORDER.map((b) => [b, { bucket: b, open: 0, codes: [] }]));
  for (const row of summary?.byCode ?? []) {
    const info = out.get(bucketOf(row.code));
    if (!info) continue;
    info.open += row.open;
    if (row.open > 0) info.codes.push(row.code);
  }
  return BUCKET_ORDER.map((b) => out.get(b) as BucketInfo);
}

/** the existing catalogue product a duplicate issue points at (null on every other issue) */
export const existingProductOf = (issue: ImportIssue): ExistingProduct | null => issue.productData.existing;

/** "CSV SKU vs Existing master product" values of a duplicate card */
export const existingSkuOf = (issue: ImportIssue): string => issue.duplicateMatch?.existingSku ?? issue.productData.existing?.sku ?? "–";

/** the sidebar plan numbers ("New", "Matched", "Updated") of a session or summary */
export const planNumbers = (s: { plan: ImportPlan; scope: ImportScope }) => ({ created: s.plan.create, matched: s.plan.update + s.plan.addVariant, updated: s.scope.updates });

/** the product a row is about, in the seller's words */
export const productName = (issue: ImportIssue): string => issue.productData.title || issue.productData.sku || `Row ${issue.rowNumber}`;

/** what accepting the suggestion would do */
export function suggestionText(issue: ImportIssue): string | null {
  return issue.suggestion?.label ?? issue.suggestedFix ?? null;
}
