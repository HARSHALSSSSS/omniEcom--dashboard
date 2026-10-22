import { ROUTES } from "@/constants/routes";
import { formatINR } from "@/utils/format";
import type { BulkListingsResponse, CreateOutcome, ListingBulkAction, ListingRow, MatrixCell, MatrixStatus, NotListedRow } from "@/types/listing";

export const NO_WRITE_REASON = "Your role can view listings but not change them.";

export const price = (minor: number | null): string => (minor === null ? "—" : formatINR(minor));

/** the dot and text colour of every status (the design's palette) */
export const STATUS_COLOR: Record<MatrixStatus | "draft", string> = {
  draft: "#BDBDBD",
  live: "#16A34A",
  ready: "#16A34A",
  needs_review: "#D97706",
  blocked: "#DC2626",
  failed: "#DC2626",
  syncing: "#2563EB",
  not_listed: "#BDBDBD",
};

export const STATUS_LABEL: Record<MatrixStatus, string> = {
  live: "Live",
  ready: "Ready",
  needs_review: "Needs review",
  blocked: "Blocked",
  failed: "Failed",
  syncing: "Syncing",
  not_listed: "Not listed",
};

export const readinessColor = (percent: number): string => (percent >= 95 ? "#16A34A" : percent >= 70 ? "#D97706" : percent >= 50 ? "#2563EB" : "#DC2626");

/** the label under a status in a matrix cell: how much of the product is on that marketplace */
export function cellSublabel(cell: MatrixCell, variantsCount: number): string {
  if (cell.listedVariants === 0) return "Not published";
  return variantsCount > 1 ? `${cell.listedVariants} of ${variantsCount} variants` : "1 variant";
}

// ------------------------------------------------------------------------------------------------
// where a row leads (the routes of the listing workflow screens)
// ------------------------------------------------------------------------------------------------
export const studioPath = (listingId: string): string => `${ROUTES.LISTINGS}/${listingId}`;
export const blockedPath = (listingId: string): string => `${ROUTES.LISTINGS}/${listingId}/blocked`;
export const syncPath = (listingId: string): string => `${ROUTES.LISTINGS}/${listingId}/sync`;
export const unlistedPath = (variantId: string, accountId: string): string => `${ROUTES.LISTINGS}/${variantId}/unlisted?account=${accountId}`;
export const bulkReviewPath = (ids: string[]): string => `${ROUTES.LISTINGS_BULK}?ids=${ids.join(",")}`;

/** the screen a click on a row's status opens; null for a listing that is simply live or ready */
export function statusPathOf(row: ListingRow): string | null {
  switch (row.table.screenStatus) {
    case "blocked":
    case "failed":
    case "needs_review":
      return blockedPath(row.id);
    case "syncing":
      return syncPath(row.id);
    default:
      return null;
  }
}

/** the one button at the end of a row (the design's "Manage / Review / Fix / View / Publish") */
export type RowAction =
  | { kind: "publish"; label: string }
  | { kind: "review"; label: string }
  | { kind: "link"; label: string; to: string };

export function rowActionOf(row: ListingRow): RowAction {
  switch (row.table.screenStatus) {
    case "ready":
      return { kind: "publish", label: "Publish →" };
    case "needs_review":
      return { kind: "review", label: "Review →" };
    case "blocked":
    case "failed":
      return { kind: "link", label: "Fix →", to: blockedPath(row.id) };
    case "syncing":
      return { kind: "link", label: "View →", to: syncPath(row.id) };
    default:
      return { kind: "link", label: "Manage →", to: studioPath(row.id) };
  }
}

/** the lifecycle action a row offers next to its main button; null when there is none */
export type SecondaryAction = { action: Extract<ListingBulkAction, "retry" | "unpublish">; label: string } | null;

export function secondaryActionOf(row: ListingRow): SecondaryAction {
  switch (row.table.screenStatus) {
    case "failed":
      return { action: "retry", label: "Retry" };
    case "live":
      return { action: "unpublish", label: "Unpublish" };
    default:
      return null;
  }
}

export const ACTION_LABELS: Record<ListingBulkAction, string> = {
  validate: "Validate",
  publish: "Publish",
  unpublish: "Unpublish",
  retry: "Retry",
  sync_inventory: "Sync inventory",
};

export const ACTION_TITLES: Record<ListingBulkAction, string> = {
  validate: "Validation results",
  publish: "Publish results",
  unpublish: "Unpublish results",
  retry: "Retry results",
  sync_inventory: "Inventory sync results",
};

/** the content-sync states that need a person (the studio resolves them) */
export const CONTENT_ALERT = ["needs_review", "needs_republish", "failed"] as const;

export const notListedKey = (r: Pick<NotListedRow, "variantId" | "accountId">): string => `${r.variantId}:${r.accountId}`;

// ------------------------------------------------------------------------------------------------
// CSV export of the listings on screen
// ------------------------------------------------------------------------------------------------
/** one CSV field: always quoted; a leading = + - @ is defused so a spreadsheet never runs it as a formula */
const csvField = (value: string | number): string => {
  const text = String(value);
  return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
};

export function csvOfListings(rows: ListingRow[]): string {
  const head = ["Listing", "SKU", "Marketplace", "Account", "Readiness", "Status", "Price", "Stock"];
  const lines = rows.map((r) =>
    [r.productTitle, r.sku, r.table.marketplaceName, r.table.accountName, `${r.table.readiness.percent}%`, STATUS_LABEL[r.table.screenStatus], price(r.table.priceMinor), r.table.stock.sellable].map(csvField).join(","),
  );
  return [head.map(csvField).join(","), ...lines].join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------------------------------------
// results dialog
// ------------------------------------------------------------------------------------------------
export interface ResultRow {
  key: string;
  label: string;
  status: "done" | "skipped" | "failed";
  message: string;
  /** the publish / sync job still running in the background */
  jobId: string | null;
}

export interface ResultsView {
  title: string;
  summary: string;
  rows: ResultRow[];
}

const plural = (n: number) => `${n} ${n === 1 ? "listing" : "listings"}`;

export function viewOfBulk(action: ListingBulkAction, res: BulkListingsResponse): ResultsView {
  const { total, succeeded, failed, skipped } = res.summary;
  const extra = [failed ? `${failed} failed` : "", skipped ? `${skipped} skipped` : ""].filter(Boolean).join(", ");
  return {
    title: ACTION_TITLES[action],
    summary: `${succeeded} of ${plural(total)} succeeded${extra ? `, ${extra}` : ""}.`,
    rows: res.results.map((r) => ({
      key: r.id,
      label: r.sku ?? r.id,
      status: r.status,
      message: r.error?.message ?? r.message,
      jobId: r.ok ? r.jobId : null,
    })),
  };
}

export function viewOfCreate(outcomes: CreateOutcome[]): ResultsView {
  const ok = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.length - ok;
  return {
    title: "Create listing results",
    summary: `${ok} of ${outcomes.length} ${outcomes.length === 1 ? "draft" : "drafts"} created${failed ? `, ${failed} failed` : ""}.`,
    rows: outcomes.map((o) => ({ key: o.key, label: o.label, status: o.ok ? "done" : "failed", message: o.message, jobId: null })),
  };
}
