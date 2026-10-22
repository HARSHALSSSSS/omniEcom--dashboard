import { formatDateTime } from "@/utils/format";
import type { CapValue, DecisionItem, DecisionStatus, MethodKind, ProviderKind, SlaBand } from "@/types/shipping";

/** what the safe capability check found wrong, as one sentence */
export const failedChecks = (result: { checks: Array<{ ok: boolean; message: string }> }): string =>
  result.checks
    .filter((c) => !c.ok)
    .map((c) => c.message)
    .join(" ");

export const NO_WRITE_REASON = "Your role can view shipping but not change it.";
export const NO_CONFIGURE_REASON = "Only an admin can set up shipping methods and rules.";

/** "—" for anything the API does not know */
export const orDash = (value: string | number | null | undefined): string => (value === null || value === undefined || value === "" ? "—" : String(value));

export const dateOrDash = (iso: string | null | undefined): string => (iso ? formatDateTime(iso) : "—");

export const paymentText = (method: string): string => (method === "cod" ? "COD" : method === "prepaid" ? "Prepaid" : "—");

/** grams to "0.65 kg" ("—" when no parcel has been weighed yet) */
export const weightText = (grams: number | null | undefined): string => (grams === null || grams === undefined ? "—" : `${(grams / 1000).toFixed(2)} kg`);

export const destinationText = (d: { city: string | null; state: string | null }): string => [d.city, d.state].filter(Boolean).join(", ") || "—";

export const KIND_LABEL: Record<MethodKind, string> = { marketplace: "Marketplace shipping", seller: "Seller shipping", third_party: "Third-party provider" };

/** the three kinds as the design words them in the method list */
export const KIND_SUBTITLE = (kind: ProviderKind, channelName?: string | null, label?: string): string =>
  kind === "marketplace"
    ? `Marketplace shipping · ${channelName ?? "Marketplace"}`
    : kind === "seller"
      ? "Merchant managed · connected channels"
      : kind === "custom"
        ? "Configured logistics provider · you enter the AWB"
        : `Third-party provider${label ? ` · ${label}` : ""}`;

/** a configured method's kind in words (a configured logistics provider is its own kind) */
export const methodKindLabel = (kind: ProviderKind): string => (kind === "custom" ? "Configured logistics provider" : KIND_LABEL[kind]);

export const CAP_TEXT: Record<CapValue, { text: string; tone: string }> = {
  supported: { text: "Supported", tone: "text-[#16A34A]" },
  requires_configuration: { text: "Requires configuration", tone: "text-[#D97706]" },
  not_supported: { text: "Not supported by connector", tone: "text-[#666666]" },
};

/** "Due in 2h 10m" / "Overdue by 45m" / "No deadline" from the order's dispatch deadline */
export function slaText(sla: DecisionItem["sla"]): string {
  if (sla.band === "none" || sla.minutesRemaining === null) return "No deadline";
  const abs = Math.abs(sla.minutesRemaining);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const span = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return sla.minutesRemaining < 0 ? `Overdue by ${span}` : `Due in ${span}`;
}

export const SLA_TONE: Record<SlaBand, string> = {
  safe: "text-[#666666]",
  approaching: "text-[#D97706]",
  at_risk: "text-[#D97706] font-medium",
  breached: "text-[#DC2626] font-medium",
  none: "text-[#666666]",
};

export const SLA_LABEL: Record<SlaBand, string> = { safe: "On track", approaching: "Approaching", at_risk: "At risk", breached: "Overdue", none: "No deadline" };

/** the status words of the Orders to Ship table with their colours */
export function decisionStatus(item: Pick<DecisionItem, "status" | "selectedBy" | "pickup">): { text: string; tone: string } {
  const map: Record<DecisionStatus, { text: string; tone: string }> = {
    needs_decision: { text: "Needs Shipping Decision", tone: "text-[#D97706]" },
    selected:
      item.pickup.state === "awaiting"
        ? { text: "Awaiting slot booking", tone: "text-[#D97706]" }
        : item.selectedBy === "manual"
          ? { text: "Manual override", tone: "text-[#16A34A]" }
          : { text: "Selection confirmed", tone: "text-[#16A34A]" },
    label_pending: { text: "Label pending", tone: "text-[#2563EB]" },
    ready_to_dispatch: { text: "Label ready to print", tone: "text-[#16A34A]" },
    exception: { text: "Shipping Exception", tone: "text-[#DC2626]" },
    dispatched: { text: "AWB assigned", tone: "text-[#2563EB]" },
  };
  return map[item.status];
}

export const DECISION_STATUS_FILTER_LABEL: Record<DecisionStatus, string> = {
  needs_decision: "Needs shipping decision",
  selected: "Selection confirmed",
  label_pending: "Label pending",
  ready_to_dispatch: "Label ready to print",
  exception: "Shipping exception",
  dispatched: "AWB assigned",
};

/** "+8 since last sync" (against a stored snapshot) or "+8 vs 24 h ago" (against the rebuilt history) */
export function sinceText(delta: number, comparison?: { source: "snapshot" | "history"; windowHours: number }): string {
  const sign = delta >= 0 ? "+" : "−";
  if (comparison?.source !== "history") return `${sign}${Math.abs(delta)} since last sync`;
  const h = comparison.windowHours;
  return `${sign}${Math.abs(delta)} vs ${h >= 48 ? `${Math.round(h / 24)} days` : `${h} h`} ago`;
}

export const ruleFieldLabel = (field: string): string =>
  ({
    marketplace: "Marketplace",
    warehouse: "Warehouse",
    destinationZone: "Destination zone",
    destinationState: "Destination state",
    destinationCity: "Destination city",
    destinationPincode: "Destination pincode",
    orderValueMinor: "Order value",
    sku: "Product SKU",
    product: "Product",
    weightGrams: "Weight",
  })[field] ?? field;

export const ruleOpSymbol = (op: string): string =>
  ({ eq: "=", ne: "≠", contains: "contains", gt: ">", gte: "≥", lt: "<", lte: "≤", in: "is one of" })[op] ?? op;
