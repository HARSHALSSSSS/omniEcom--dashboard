import { formatINR, formatNumber, formatPercent } from "@/utils/format";
import type { IntelAction, IntelSort, VelocityTrend } from "@/types/intelligence";

export const ACTION_LABELS: Record<IntelAction, string> = {
  reorder: "Reorder",
  raise_price: "Raise price",
  liquidate: "Liquidate",
  promote: "Promote",
  hold: "Hold",
};

export const ACTION_HINTS: Record<IntelAction, string> = {
  reorder: "Stock runs out before a restock could arrive",
  raise_price: "Priced below the competitor, or margin is thin while selling",
  liquidate: "Excess or aging stock holding capital",
  promote: "Slow sales with healthy stock and margin",
  hold: "Nothing to act on",
};

export const ACTION_TONE: Record<IntelAction, string> = {
  reorder: "border-amber-200 bg-amber-50 text-amber-800",
  raise_price: "border-blue-200 bg-blue-50 text-blue-800",
  liquidate: "border-rose-200 bg-rose-50 text-rose-800",
  promote: "border-purple-200 bg-purple-50 text-purple-800",
  hold: "border-border bg-muted text-muted-foreground",
};

export const SORT_LABELS: Record<IntelSort, string> = {
  priority: "Priority",
  velocity: "Fastest selling",
  runway: "Shortest runway",
  margin: "Lowest margin",
};

export const TREND_LABELS: Record<VelocityTrend, string> = { accelerating: "Accelerating", stable: "Stable", declining: "Declining" };
export const TREND_TONE: Record<VelocityTrend, string> = { accelerating: "text-emerald-600", stable: "text-muted-foreground", declining: "text-rose-600" };

export const CONFIDENCE_TONE = { high: "text-emerald-700", medium: "text-amber-700", low: "text-muted-foreground" } as const;

export const NO_READ_REASON = "Ask an admin to give your role the analytics permission.";
export const NO_PO_REASON = "You need the procurement write permission to draft purchase orders.";
export const NO_PRICING_REASON = "You need the pricing write permission to generate price proposals.";

/** units per day, one decimal; "0" stays "0" */
export const velocityText = (unitsPerDay: number): string => `${formatNumber(Math.round(unitsPerDay * 10) / 10)} / day`;

export const runwayText = (days: number | null, available: number): string => {
  if (days === null) return available > 0 ? "No sales to project" : "Out of stock";
  if (days < 1) return "Under a day";
  return `${formatNumber(Math.round(days))} ${Math.round(days) === 1 ? "day" : "days"}`;
};

/** short, in the tile: a runway under two weeks is the urgent one */
export const runwayUrgent = (days: number | null): boolean => days !== null && days <= 14;

export const marginText = (margin: number | null): string => (margin === null ? "No cost price" : formatPercent(margin));

export const money = (minor: number | null): string => (minor === null ? "N/A" : formatINR(minor));

/** signed gap of our price against the competitor's, "+12.0%" / "-4.5%" */
export const gapText = (gap: number | null): string | null => (gap === null ? null : `${gap > 0 ? "+" : ""}${formatPercent(gap)}`);
