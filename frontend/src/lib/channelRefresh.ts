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

/** A listing was created, edited or published: the listing counts on the Hub cards and in Connection health change with it. */
export function refreshHubListingCounts(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["hub"] });
}
