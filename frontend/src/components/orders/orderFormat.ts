import { errorMessage, isApiError } from "@/api/errors";
import { formatCurrency } from "@/utils/format";

/** money in the order's currency; paise stay exact */
export function formatMoney(minor: number, currency = "INR"): string {
  return formatCurrency(minor, currency);
}

export const NO_WRITE_REASON = "Your role can view orders but not change them.";

/** reasons the API gives for a disabled step, in words (`message` from the API wins when it has one) */
const REASON_TEXT: Record<string, string> = {
  permission_required: NO_WRITE_REASON,
  managed_by_fulfillment: "This order is being fulfilled: its status follows the warehouse work. Use Fulfillment instead.",
  no_unallocated_stock: "Every line already holds its stock.",
  already_dispatched_or_closed: "The order is already dispatched or closed.",
  no_fulfillment: "No fulfillment has been created for this order yet.",
};

export const reasonText = (reason: string | null, message?: string | null): string | undefined =>
  reason ? message || REASON_TEXT[reason] || reason.replace(/_/g, " ") : undefined;

/** what a failed write says; a stale version and a fulfillment-owned order get their own wording */
export function writeErrorMessage(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === "VERSION_CONFLICT") return "This order was changed by someone else. The latest version has been loaded; review it and try again.";
    if (e.rule === "managed_by_fulfillment") return REASON_TEXT.managed_by_fulfillment as string;
  }
  return errorMessage(e);
}

/** the lines of an address object, whatever keys the marketplace gave (blank ones are dropped) */
export function addressLines(address: Record<string, unknown>): string[] {
  const text = (key: string) => (typeof address[key] === "string" ? (address[key] as string).trim() : "");
  const cityLine = [text("city"), [text("state"), text("pincode")].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [text("line1"), text("line2"), cityLine, text("country")].filter(Boolean);
}

export const textOf = (obj: Record<string, unknown>, key: string): string | null =>
  typeof obj[key] === "string" && (obj[key] as string).trim() ? (obj[key] as string).trim() : null;
