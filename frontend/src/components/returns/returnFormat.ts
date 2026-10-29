import { errorMessage, isApiError } from "@/api/errors";
import { formatCurrency, formatInZone } from "@/utils/format";
import type { LedgerRow, SyncJob, SyncReport, SyncSkipReason } from "@/types/returns";

const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };

/** "07 Oct" */
export const fmtShortDay = (iso: string): string => formatInZone(iso, { day: "2-digit", month: "short" });
/** "07 Oct 2026" */
export const fmtDay = (iso: string): string => formatInZone(iso, { day: "2-digit", month: "short", year: "numeric" });
/** "07 Oct · 14:20" */
export const fmtStamp = (iso: string): string => `${fmtShortDay(iso)} · ${formatInZone(iso, TIME)}`;
/** "07 Oct 2026 · 14:20" */
export const fmtFullStamp = (iso: string): string => `${fmtDay(iso)} · ${formatInZone(iso, TIME)}`;

/** money in the return's currency; paise stay exact */
export function formatMoney(minor: number, currency: string | null | undefined = "INR"): string {
  return formatCurrency(minor, currency);
}

export const NO_WRITE_REASON = "Your role can view returns but not change them.";
export const NO_REFUND_REASON = "Only an admin can confirm a refund (permission returns:refund).";

/** what a failed write says: the API's own sentence for a 409 (it names the rule), the missing permission for a 403 */
export function writeErrorMessage(e: unknown): string {
  if (isApiError(e)) {
    if (e.status === 403) {
      const needed = e.details?.requiredPermission;
      return typeof needed === "string" ? `You do not have permission for this (needs ${needed}).` : errorMessage(e);
    }
    if (e.status === 409 && !e.message && e.rule) return e.rule.replace(/_/g, " ");
  }
  return errorMessage(e);
}

/** the text of an API enum value: "needs_review" to "Needs review" */
export const humanize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");

/** minor units from what a person typed in major units ("1,234.50" to 123450); null when it is not an amount */
export function toMinor(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  const parts = cleaned.split(".");
  if (parts.length > 2 || parts.length === 0) return null;
  const [whole, frac] = parts;
  if (!whole || !/^\d+$/.test(whole)) return null;
  if (frac !== undefined && !/^\d{1,2}$/.test(frac)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** an amount in minor units as an editable text in major units: 123450 to "1234.50" */
export const fromMinor = (minor: number): string => (minor / 100).toFixed(2);

/** a cell that a spreadsheet would run as a formula is neutralised, quotes are doubled */
const csvCell = (value: string | number | null | undefined): string => {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** the counts of the sync jobs added up */
export function syncTotals(report: SyncReport): { fetched: number; created: number; duplicates: number; cancelled: number; rejected: number; failed: number } {
  const t = { fetched: 0, created: 0, duplicates: 0, cancelled: 0, rejected: 0, failed: 0 };
  for (const a of report.accounts) {
    const s = a.job?.stats ?? {};
    t.fetched += s.fetched ?? 0;
    t.created += s.created ?? 0;
    t.duplicates += s.duplicates ?? 0;
    t.cancelled += s.cancelled ?? 0;
    t.rejected += s.rejected ?? 0;
    t.failed += s.failed ?? 0;
  }
  return t;
}

/** what one finished sync job did: "2 new, 1 already in the ledger, 1 withdrawn" */
export function syncJobLine(job: SyncJob): string {
  const s = job.stats;
  const parts: string[] = [];
  if ((s.created ?? 0) > 0) parts.push(`${s.created} new`);
  if ((s.duplicates ?? 0) > 0) parts.push(`${s.duplicates} already in the ledger`);
  if ((s.cancelled ?? 0) > 0) parts.push(`${s.cancelled} withdrawn`);
  if ((s.rejected ?? 0) > 0) parts.push(`${s.rejected} rejected by the marketplace`);
  if ((s.failed ?? 0) > 0) parts.push(`${s.failed} could not be imported`);
  return parts.length > 0 ? parts.join(", ") : "No new or changed returns";
}

export const SYNC_SKIP_TEXT: Record<SyncSkipReason, string> = {
  returns_fetch_not_supported: "This marketplace does not send returns through its connector.",
  connector_not_ready: "The connector for this marketplace is not live yet.",
  connector_unavailable: "The connector for this marketplace is not available.",
};

/** the one-line outcome of a finished sync, for the toast */
export function syncHeadline(report: SyncReport): string {
  const t = syncTotals(report);
  if (report.nothingToSync) return "No connected marketplace can send returns yet.";
  const bits = [plural(t.created, "new return", "new returns")];
  if (t.duplicates > 0) bits.push(`${t.duplicates} already in the ledger`);
  if (t.cancelled > 0) bits.push(`${t.cancelled} withdrawn`);
  if (t.failed > 0) bits.push(`${plural(t.failed, "return", "returns")} could not be imported`);
  return `${plural(report.accounts.length, "account", "accounts")} checked: ${bits.join(", ")}.`;
}

/** the rows picked on the screen as a CSV (the server export covers a whole filtered list) */
export function rowsToCsv(rows: LedgerRow[]): string {
  const header = ["Return", "Order", "Product", "SKU", "Marketplace", "Reason", "Quantity", "Received quantity", "Status", "Requested", "Received", "Inspection", "Refund", "Refund amount", "Currency", "Disposition"];
  const lines = rows.map((r) => [
    r.number,
    r.orderNumber,
    r.product.title,
    r.product.sku,
    r.channel.code,
    r.reason.label,
    r.quantity,
    r.receivedQuantity,
    r.stageLabel,
    r.requestedAt,
    r.receivedAt,
    r.inspection.status,
    r.refund.status,
    r.refund.amountMinor === null ? "" : (r.refund.amountMinor / 100).toFixed(2),
    r.refund.currency,
    r.disposition,
  ]);
  return [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\r\n");
}
