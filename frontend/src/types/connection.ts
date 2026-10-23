import { z } from "zod";
import { ConnectorCapability, AuthType } from "./connector";
import type { AuthField, AuthFlow } from "./directory";
import type { HubAccountCard } from "./hub";

export type ConnectionHealthStatus = "healthy" | "warning" | "error" | "paused";

export type SyncState = "idle" | "syncing" | "error" | "paused";

export interface EntitySync {
  status: "healthy" | "warning" | "error" | "syncing" | "idle";
  /** clock time of the run this status comes from; "" when no run is known */
  timestamp: string;
  /** ISO time of that run */
  at?: string;
  /** progress of a running job, 100 for a finished one */
  pct?: number;
}

export interface ChannelConnection {
  id: string;
  connectorId: string;
  name: string;
  category: "marketplace" | "storefront" | "shipping";
  status: ConnectionHealthStatus;
  authType: AuthType;
  accountIdentifier: string;
  connectedAt: string;
  lastSyncAt: string;
  nextSyncAt?: string;
  syncState: SyncState;
  syncProgress?: number;
  stats: {
    activeListings: number;
    pendingOrders: number;
    syncedInventoryItems: number;
    errorCount: number;
  };
  health: {
    pulseScore: number; // 0-100
    riskLevel: "low" | "medium" | "high";
    frictionPoints: string[];
    rateLimitRemainingPct: number | null;
    tokenExpiresInDays?: number;
  };
  capabilities: ConnectorCapability[];
  /** the hub card this connection was mapped from (version, account status, mode) for write actions */
  account?: HubAccountCard;
  configValues?: Record<string, string>;
  attentionIssue?: {
    issueTitle: string;
    issueDescription: string;
    affectedAreas: string[];
    lastSuccessfulSync: string;
    actionType: "reconnect" | "retry_scheduled" | "learn_more";
  };
  entitySyncStatus?: {
    products: EntitySync;
    listings: EntitySync;
    inventory: EntitySync;
    orders: EntitySync;
    shipping: EntitySync;
  };
  activityHistory?: Array<{
    id: string;
    timeText: string;
    title: string;
  }>;
}

export interface ConnectorDirectoryItem {
  id: string;
  name: string;
  category: "marketplace" | "storefront" | "shipping";
  authType: AuthType;
  description: string;
  logoKey?: string;
  isPartnerGated?: boolean;
  status: "available" | "connected" | "needs_attention" | "unavailable";
  statusReason?: string | null;
  implementation?: "planned" | "beta" | "ga";
  /** how many accounts of this connector the business has */
  accountCount?: number;
  /** screen chips: product_import, listings, inventory, orders, shipping, returns, promotions */
  capabilities: ConnectorCapability[];
  /** the connector's flat capability list, e.g. orders.fetch */
  capabilityFlags?: string[];
  supportedRegions: string[];
  readiness?: { sandbox: boolean; live: boolean; notes: string };
  limits?: { requestsPerSecond: number; burst: number; maxBatchSize: number };
  webhooks?: boolean;
  fields?: AuthField[];
  authFlow?: AuthFlow;
}

export const connectChannelSchema = z.object({
  connectorId: z.string(),
  name: z.string().optional(),
  region: z.string().optional(),
  mode: z.enum(["live", "sandbox"]).optional(),
  credentials: z.record(z.string()),
  syncCatalog: z.boolean().default(true),
  syncOrders: z.boolean().default(true),
  syncInventory: z.boolean().default(true),
});
export type ConnectChannelInput = z.infer<typeof connectChannelSchema>;

export const testConnectionSchema = z.object({
  connectorId: z.string(),
  credentials: z.record(z.string()),
});
export type TestConnectionInput = z.infer<typeof testConnectionSchema>;
