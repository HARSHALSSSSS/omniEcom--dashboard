import { errorMessage, isApiError } from "@/api/errors";
import { formatCurrency } from "@/utils/format";

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
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** an amount in minor units as an editable text in major units: 123450 to "1234.50" */
export const fromMinor = (minor: number): string => (minor / 100).toFixed(2);
