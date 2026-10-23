import type { ChannelConnection } from "@/types/connection";
import type { HubAtRisk, HubLane, HubSyncJob } from "@/types/hub";
import { JOB_TYPE_LABEL, ago } from "@/components/marketplace-hub/accounts/hubFormat";

export type Level = "healthy" | "warning" | "error" | "idle";

export const DAY_MS = 24 * 3_600_000;

/** the sync runs of the last 24 hours, newest first */
export const lastDay = (jobs: HubSyncJob[], now = Date.now()): HubSyncJob[] =>
  jobs.filter((j) => now - new Date(j.createdAt).getTime() <= DAY_MS).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export const FAILED = ["failed", "dead_lettered"];
export const isFailed = (j: HubSyncJob) => FAILED.includes(j.status);
export const isActive = (j: HubSyncJob) => ["queued", "running", "retrying"].includes(j.status);

export const laneOf = (lanes: HubLane[] | undefined, key: string): HubLane | undefined => lanes?.find((l) => l.key === key);
export const laneLevel = (lane: HubLane | undefined): Level => (!lane || lane.status === "idle" ? "idle" : lane.status);

/** the connection's own state as the screen words it (a paused account is neither a problem nor healthy) */
export type ConnState = "healthy" | "attention" | "critical" | "paused";
export function connState(c: ChannelConnection): ConnState {
  const a = c.account;
  if (a && (a.accountStatus === "revoked" || a.accountStatus === "pending_authorization")) return "critical";
  if (c.status === "paused" || a?.accountStatus === "paused") return "paused";
  return c.status === "error" ? "critical" : c.status === "warning" ? "attention" : "healthy";
}
export const needsReconnect = (c: ChannelConnection): boolean => Boolean(c.account) && c.account!.accountStatus !== "active" && c.account!.accountStatus !== "paused";

/** the auth column: the account state first, then the server's token warnings (it already leaves out tokens a connector renews by itself) */
export function authLevel(c: ChannelConnection, warnings: Array<{ accountId: string; expired: boolean }> = []): Level {
  if (needsReconnect(c)) return "error";
  const w = warnings.find((x) => x.accountId === c.id);
  return w ? (w.expired ? "error" : "warning") : "healthy";
}

/** does the connector offer this capability at all (the table shows a dash when it does not) */
export const offers = (c: ChannelConnection, tag: string): boolean => (c.account?.capabilityTags ?? []).includes(tag);

export const LANE_FOR_COLUMN = { catalog: ["listings", "product_import"], inventory: ["inventory", "inventory"], orders: ["orders", "orders"] } as const;

/** the five steps of a recovery, read from facts: a problem exists, its cause is known, a retry runs, a run succeeded after the failure, the connection is healthy */
export function recoverySteps(c: ChannelConnection, jobs: HubSyncJob[]): { detected: boolean; diagnosed: boolean; retrying: boolean; verified: boolean; healthy: boolean } {
  const mine = jobs.filter((j) => j.marketplaceAccountId === c.id);
  const lastFailure = mine.find(isFailed);
  const state = connState(c);
  const healthy = state === "healthy";
  return {
    detected: state === "attention" || state === "critical" || healthy,
    diagnosed: c.health.frictionPoints.length > 0 || healthy,
    retrying: mine.some(isActive),
    verified: healthy || Boolean(lastFailure && mine.some((j) => j.status === "succeeded" && new Date(j.createdAt) > new Date(lastFailure.createdAt))),
    healthy,
  };
}

/** what the connections that need attention put at risk, for one connection */
export const riskOf = (atRisk: HubAtRisk | undefined, id: string) => atRisk?.accounts.find((a) => a.accountId === id);

export function jobLabel(j: HubSyncJob): string {
  return JOB_TYPE_LABEL[j.type] ?? j.type;
}

export const jobWhen = (j: HubSyncJob): string => ago(j.startedAt ?? j.createdAt);

export const jobTime = (j: HubSyncJob): string => new Date(j.startedAt ?? j.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export const jobWord = (j: HubSyncJob): string => (isFailed(j) ? "failed" : j.status === "partially_failed" ? "finished with errors" : isActive(j) ? "running" : j.status === "cancelled" ? "cancelled" : "completed");
