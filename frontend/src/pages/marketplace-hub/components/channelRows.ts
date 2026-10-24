import type { ChannelConnection } from "@/types/connection";
import type { ConnectorDirectoryItem } from "@/types/connection";
import type { HubAccountCard } from "@/types/hub";

export type ChannelStatus = "healthy" | "warning" | "error" | "paused" | "disconnected" | "not_connected" | "syncing";

/** One line of the hub: either a real account of the business or a directory connector that is not connected yet. */
export interface ChannelRowData {
  id: string;
  name: string;
  slug: string;
  connected: boolean;
  status: ChannelStatus;
  account?: HubAccountCard;
  accountIdentifier?: string;
  listings?: number;
  openOrders?: number;
  stockSynced?: number;
  lastSyncAt?: string | null;
  syncProgress?: number | null;
  notConnectedText?: string;
  unavailableReason?: string | null;
}

/** the state the seller reads for an account: account state first (disconnected, paused), then a running sync, then the health word */
export function channelStatus(c: ChannelConnection): ChannelStatus {
  const a = c.account;
  if (a && (a.accountStatus === "revoked" || a.accountStatus === "pending_authorization")) return "disconnected";
  if (c.status === "paused" || a?.accountStatus === "paused") return "paused";
  if (c.syncState === "syncing") return "syncing";
  return c.status === "warning" ? "warning" : c.status === "error" ? "error" : "healthy";
}

export const STATUS_LABEL: Record<ChannelStatus, string> = {
  healthy: "Healthy",
  warning: "Needs attention",
  error: "Error",
  paused: "Paused",
  disconnected: "Disconnected",
  not_connected: "Not connected",
  syncing: "Syncing",
};

/** an account the business can sell through right now: connected, paused or needing attention; not a disconnected / unauthorised one */
export const isConnectedConnection = (c: ChannelConnection): boolean => channelStatus(c) !== "disconnected";

export const needsAttention = (s: ChannelStatus) => s === "warning" || s === "error" || s === "disconnected";

export function rowFromConnection(c: ChannelConnection): ChannelRowData {
  return {
    id: c.id,
    name: c.name,
    slug: c.connectorId,
    connected: true,
    status: channelStatus(c),
    account: c.account,
    accountIdentifier: c.accountIdentifier,
    listings: c.stats.activeListings,
    openOrders: c.stats.pendingOrders,
    stockSynced: c.stats.syncedInventoryItems,
    lastSyncAt: c.lastSyncAt === "Never" ? null : c.lastSyncAt,
    syncProgress: c.syncProgress ?? null,
  };
}

export function rowFromDirectory(d: ConnectorDirectoryItem): ChannelRowData {
  return {
    id: `dir-${d.id}`,
    name: d.name,
    slug: d.id,
    connected: false,
    status: "not_connected",
    notConnectedText: d.description || undefined,
    unavailableReason: d.status === "unavailable" ? (d.statusReason ?? "Not available yet") : null,
  };
}

export const listingsText = (n: number) => `${n} ${n === 1 ? "listing" : "listings"}`;
