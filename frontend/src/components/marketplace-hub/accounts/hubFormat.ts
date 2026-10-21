import { formatRelativeTime } from "@/utils/format";
import type { HubAccountCard, HubCategory, HubSyncJob, JobStatus, LaneStatus } from "@/types/hub";

export type Tone = "good" | "warn" | "bad" | "info" | "neutral";

/** the status the seller reads: the health word, except where the account state says more (disconnected, not authorized) */
export function displayStatus(a: Pick<HubAccountCard, "status" | "accountStatus" | "syncState">): { label: string; tone: Tone } {
  if (a.accountStatus === "revoked") return { label: "Disconnected", tone: "neutral" };
  if (a.accountStatus === "pending_authorization") return { label: "Not authorized", tone: "warn" };
  if (a.status === "paused") return { label: "Paused", tone: "neutral" };
  if (a.syncState === "syncing") return { label: "Syncing", tone: "info" };
  if (a.status === "healthy") return { label: "Healthy", tone: "good" };
  if (a.status === "warning") return { label: "Attention", tone: "warn" };
  return { label: "Error", tone: "bad" };
}

export const laneTone = (s: LaneStatus): Tone => (s === "healthy" ? "good" : s === "warning" ? "warn" : s === "error" ? "bad" : "neutral");
export const laneLabel = (s: LaneStatus): string => (s === "healthy" ? "Healthy" : s === "warning" ? "Degraded" : s === "error" ? "Failing" : "No runs");
export const pulseTone = (score: number): Tone => (score >= 85 ? "good" : score >= 60 ? "warn" : "bad");

export const CATEGORY_LABEL: Record<HubCategory, string> = { marketplace: "Marketplaces", storefront: "Storefronts", shipping: "Logistics / 3PL" };

export const TAG_LABEL: Record<string, string> = {
  product_import: "Product import",
  listings: "Listings",
  inventory: "Inventory",
  orders: "Orders",
  shipping: "Shipping",
  returns: "Returns",
  promotions: "Pricing",
};

export const SCOPE_LABEL: Record<string, string> = { orders: "Orders", inventory: "Inventory", listings: "Listing status", catalog: "Product catalogue" };

export const JOB_TYPE_LABEL: Record<string, string> = {
  orders: "Order import",
  inventory: "Inventory push",
  prices: "Price push",
  listings: "Listings",
  listing_publish: "Listing publish",
  listing_status: "Listing status check",
  catalog_import: "Catalogue import",
  order_status: "Order status push",
  returns: "Returns",
  tracking: "Tracking",
  full: "Full sync",
};

export function tokenText(a: Pick<HubAccountCard, "health" | "accountStatus">): { text: string; tone: Tone } | null {
  const d = a.health.tokenExpiresInDays;
  if (a.accountStatus === "revoked" || a.accountStatus === "pending_authorization") return null;
  if (d === null) return { text: "Credential does not expire", tone: "neutral" };
  if (d < 0) return { text: "Access token expired", tone: "bad" };
  if (d < 14) return { text: `Access token expires in ${d} ${d === 1 ? "day" : "days"}`, tone: "warn" };
  return { text: `Access token valid for ${d} days`, tone: "neutral" };
}

export function describeJob(job: HubSyncJob): { label: string; tone: Tone; detail: string | null } {
  const progress = job.progress.total > 0 ? `${job.progress.done} of ${job.progress.total} items` : null;
  const reason = job.failureDetails[0]?.message ?? job.error?.message ?? null;
  const byStatus: Record<JobStatus, { label: string; tone: Tone; detail: string | null }> = {
    queued: { label: "Queued", tone: "neutral", detail: null },
    running: { label: "Running", tone: "info", detail: progress },
    retrying: { label: "Retrying", tone: "warn", detail: reason },
    succeeded: { label: "Done", tone: "good", detail: progress },
    partially_failed: { label: "Done with errors", tone: "warn", detail: [progress, job.progress.failed ? `${job.progress.failed} failed` : null, reason].filter(Boolean).join(" · ") || null },
    failed: { label: "Failed", tone: "bad", detail: reason },
    dead_lettered: { label: "Failed", tone: "bad", detail: reason },
    cancelled: { label: "Cancelled", tone: "neutral", detail: null },
  };
  return byStatus[job.status];
}

export const ago = (iso: string | null): string => (iso ? formatRelativeTime(iso) : "never");

export const WRITE_REASON = "Your role cannot change marketplace connections. Ask an admin for marketplace_accounts:write.";
