import { isApiError } from "@/api/errors";
import { formatCurrency } from "@/utils/format";
import type { BulkOutcome, DecisionAction, PriceField, PriceHistoryRow, PriceProposal, PriceStrategy, ProposalStatus, ProposalTab } from "@/types/pricing";

export const NO_APPROVE_REASON = "Only admins can approve or reject price proposals";
export const NO_WRITE_REASON = "You do not have permission to change pricing";

export const STRATEGY_LABELS: Record<PriceStrategy, string> = {
  automated_match: "Match competitor",
  margin_floor: "Margin floor",
  velocity_boost: "Velocity boost",
  custom: "Target margin",
};

export const STRATEGY_HINTS: Record<PriceStrategy, string> = {
  automated_match: "Follows the competitor price you have recorded. Needs competitor prices.",
  margin_floor: "Raises prices that earn less margin than the floor.",
  velocity_boost: "Cuts the price of slow movers that still have stock.",
  custom: "Prices to earn a target margin after cost and marketplace fees.",
};

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  auto_applied: "Auto-applied",
  expired: "Expired",
  superseded: "Superseded",
  failed: "Failed",
};

export const TAB_LABELS: Record<ProposalTab, string> = { ...STATUS_LABELS, all: "All" };

export const STATUS_TONE: Record<ProposalStatus, string> = {
  pending_review: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  auto_applied: "border-sky-200 bg-sky-50 text-sky-700",
  rejected: "border-border bg-muted text-muted-foreground",
  expired: "border-border bg-muted text-muted-foreground",
  superseded: "border-border bg-muted text-muted-foreground",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
};

export const SORT_LABELS = { impact: "Biggest margin impact", newest: "Newest first", oldest: "Oldest first" } as const;

export const FIELD_LABELS: Record<PriceField, string> = { base: "Base price", mrp: "MRP", marketplace: "Channel price", sale: "Sale price" };
export const SOURCE_LABELS: Record<PriceHistoryRow["source"], string> = {
  manual: "Manual",
  rule: "Pricing rule",
  bulk: "Bulk update",
  catalog: "Catalog edit",
  schedule: "Scheduled sale",
  import: "Import",
};

export const ACTION_LABELS: Record<DecisionAction, string> = { approve: "Approve", reject: "Reject" };

export const OUTCOME_TEXT: Record<BulkOutcome, string> = {
  applied: "Price applied",
  rejected: "Rejected",
  unchanged: "Already decided, nothing changed",
  failed: "The price could not be applied",
  expired: "Expired before the decision",
  error: "Could not be decided",
};

/** 380 -> "3.8%"; at most two decimals, trailing zeros dropped */
export function bpsText(bps: number): string {
  const text = (Math.abs(bps) / 100).toFixed(2).replace(/\.?0+$/, "");
  return `${bps < 0 ? "-" : ""}${text}%`;
}

export const signedBps = (bps: number): string => `${bps > 0 ? "+" : ""}${bpsText(bps)}`;

/** "3.8" -> 380 exactly (string parsing, never a float); null when the text is not a percentage with at most 2 decimals */
export function parsePercentToBps(text: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return bps <= 10_000 ? bps : null;
}

/** 380 -> "3.8" for an input field */
export function percentText(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return "";
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}

/** a proposal can be decided while it waits for review; a failed one is approved again to retry */
export const isDecidable = (p: PriceProposal): boolean => p.status === "pending_review" || p.status === "failed";

export const money =(minor: number, currency: string): string => formatCurrency(minor, currency);

/** the sentence for a failed decision; the business rules of the API keep their own wording */
export function decisionError(e: unknown): string {
  if (!isApiError(e)) return e instanceof Error ? e.message : "Something went wrong. Please try again.";
  switch (e.rule) {
    case "proposal_expired":
      return "This proposal expired before a decision. Generate new proposals to get a fresh price.";
    case "proposal_closed":
      return "This proposal was replaced or closed. Reload the queue to see the current one.";
    case "proposal_already_decided":
      return "Someone already decided this proposal.";
    case "proposal_apply_failed":
      return e.message || "The price could not be applied. Check the price rules and approve again to retry.";
    default:
      return e.status === 403 ? "You do not have permission to decide price proposals." : e.message;
  }
}

export const isVersionConflict = (e: unknown): boolean => isApiError(e) && e.code === "VERSION_CONFLICT";

// ---------------------------------------------------------------------------- CSV export (client side: there is no endpoint)
function cell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  // a spreadsheet would run a cell that starts with these as a formula
  if (/^[=+\-@\t\r]/.test(text) && typeof value === "string") text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const rupees = (minor: number | null): string => (minor === null ? "" : `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`);

export function proposalsCsv(rows: PriceProposal[]): string {
  const head = ["SKU", "Product", "Channel", "Strategy", "Status", "Current price", "Proposed price", "Change %", "Competitor price", "Margin change %", "Sales change %", "Reasoning", "Created", "Expires"];
  const lines = rows.map((p) =>
    [
      p.sku,
      p.productTitle,
      p.channelName,
      STRATEGY_LABELS[p.strategy],
      STATUS_LABELS[p.status],
      rupees(p.currentPriceMinor),
      rupees(p.proposedPriceMinor),
      bpsText(p.priceChangeBps),
      rupees(p.competitorPriceMinor),
      p.estMarginDeltaBps === null ? "" : bpsText(p.estMarginDeltaBps),
      p.projectedSalesDeltaBps === null ? "" : bpsText(p.projectedSalesDeltaBps),
      p.reasoning,
      p.createdAt,
      p.expiresAt ?? "",
    ]
      .map(cell)
      .join(","),
  );
  return [head.map(cell).join(","), ...lines].join("\r\n");
}

export function historyCsv(rows: PriceHistoryRow[]): string {
  const head = ["When", "SKU", "Product", "Channel", "Field", "Old price", "New price", "Source", "By", "Reason"];
  const lines = rows.map((r) =>
    [r.createdAt, r.sku, r.productTitle, r.accountName ?? "All channels", FIELD_LABELS[r.field], rupees(r.oldPriceMinor), rupees(r.newPriceMinor), SOURCE_LABELS[r.source], r.actorName, r.reason]
      .map(cell)
      .join(","),
  );
  return [head.map(cell).join(","), ...lines].join("\r\n");
}

/** hands a text file to the browser's download */
export function downloadText(fileName: string, text: string, type = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
