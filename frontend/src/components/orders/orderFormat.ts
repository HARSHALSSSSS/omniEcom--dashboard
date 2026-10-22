import { errorMessage, isApiError } from "@/api/errors";
import { formatCurrency, formatInZone } from "@/utils/format";
import type { LedgerSla, OrderStatus } from "@/types/orders";

/** money in the order's currency; paise stay exact */
export function formatMoney(minor: number, currency = "INR"): string {
  return formatCurrency(minor, currency);
}

const DAY = { year: "numeric", month: "2-digit", day: "2-digit" } as const;

/** when the order came in, the way the ledger writes it: the time today, "Yesterday", or the day (business time zone) */
export function createdLabel(iso: string, now: Date = new Date()): string {
  const day = formatInZone(iso, DAY);
  if (day === formatInZone(now.toISOString(), DAY)) return formatInZone(iso, { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
  if (day === formatInZone(new Date(now.getTime() - 86_400_000).toISOString(), DAY)) return "Yesterday";
  return formatInZone(iso, { day: "2-digit", month: "short" });
}

/** "ready_to_dispatch" to "Ready to dispatch" */
export const sentenceCase = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : s);

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

/** the colour of a dispatch-SLA text (design palette: green healthy, amber approaching, red at risk or breached) */
export const SLA_TEXT: Record<LedgerSla["state"], string> = {
  safe: "text-[#16A34A]",
  approaching: "text-[#D97706]",
  at_risk: "text-[#DC2626]",
  breached: "text-[#DC2626]",
  none: "text-[#666666]",
};

/** the left rail of a ledger row: the SLA tone the API gives, blue for a fresh order that has none */
export function railColor(tone: "red" | "amber" | "green" | "none", status: OrderStatus): string | null {
  if (tone === "red") return "#DC2626";
  if (tone === "amber") return "#D97706";
  if (tone === "green") return "#16A34A";
  return status === "new" ? "#2563EB" : null;
}
