import type { QueryClient } from "@tanstack/react-query";
import { refreshShell } from "@/lib/session";

/** the screens that show a number or a list taken from the connected marketplaces */
const CHANNEL_DEPENDENT = [["hub"], ["marketplace-hub"], ["listings"], ["listing-audit"], ["pricing"], ["attention"], ["dashboard"], ["promotions"], ["inventory"]] as const;

/**
 * A marketplace was connected, reconnected, paused or disconnected: the Hub, Connection health, Listings, Pricing,
 * Needs attention, the dashboard and the sidebar badges all read stale numbers until they are refreshed.
 */
export function refreshAfterChannelChange(qc: QueryClient): void {
  for (const queryKey of CHANNEL_DEPENDENT) void qc.invalidateQueries({ queryKey });
  void refreshShell().catch(() => undefined);
}

/** Promotion numbers (overview, candidates, campaigns) depend on prices, listings, stock and fees: refresh them after any of those change. */
export function refreshPromotions(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["promotions"] });
}

/**
 * A campaign was created, changed, scheduled, started, ended or deleted: sale prices moved, so Pricing, Listings, the Hub's listing counts,
 * Inventory, Needs attention, the dashboard and the sidebar badges read stale numbers until they are refreshed.
 */
export function refreshAfterPromotionChange(qc: QueryClient): void {
  for (const queryKey of [["promotions"], ["listings"], ["pricing"], ["inventory"], ["attention"], ["dashboard"]] as const) void qc.invalidateQueries({ queryKey });
  refreshHubListingCounts(qc);
  void refreshShell().catch(() => undefined);
}

/** A listing was created, edited or published: the listing counts on the Hub cards and in Connection health change with it. */
export function refreshHubListingCounts(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["hub"] });
  // a listing going live also makes its draft product active: the Products screens (cards, list, tab counts, detail) re-read
  for (const queryKey of [["products"], ["productDetail"], ["product-edit"]] as const) void qc.invalidateQueries({ queryKey });
}
