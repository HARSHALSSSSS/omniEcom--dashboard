import { formatINR } from "@/utils/format";
import type { BulkListingsResponse, CreateOutcome, ListingBulkAction, ListingRow, NotListedRow } from "@/types/listing";

export const NO_WRITE_REASON = "Your role can view listings but not change them.";

export const price = (minor: number | null): string => (minor === null ? "—" : formatINR(minor));

/** initials for the image placeholder ("Cotton Kurta Set" to "CK") */
export const initialsOf = (title: string): string =>
  title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/** the one lifecycle action a row offers next to "Studio"; null when nothing can be done from the list */
export type RowAction = { action: Extract<ListingBulkAction, "publish" | "retry" | "unpublish">; label: string } | null;

export function rowActionOf(row: ListingRow): RowAction {
  switch (row.table.screenStatus) {
    case "ready":
      return { action: "publish", label: "Publish" };
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

