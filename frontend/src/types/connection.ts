import { z } from "zod";
import { ConnectorCapability, AuthType } from "./connector";

export type ConnectionHealthStatus = "healthy" | "warning" | "error" | "paused";

export type SyncState = "idle" | "syncing" | "error" | "paused";

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
    rateLimitRemainingPct: number;
    tokenExpiresInDays?: number;
  };
  capabilities: ConnectorCapability[];
  configValues?: Record<string, string>;
}

export interface ConnectorDirectoryItem {
  id: string;
  name: string;
  category: "marketplace" | "storefront" | "shipping";
  authType: AuthType;
  description: string;
  logoUrl?: string;
  rating: number;
  reviewsCount: number;
  isPopular?: boolean;
  isPartnerGated?: boolean;
  status: "available" | "connected" | "needs_attention" | "unavailable";
  pricing: {
    freeTrialDays: number;
    monthlyFeeINR: number;
    planName: string;
  };
  capabilities: ConnectorCapability[];
  supportedRegions: string[];
}

export const connectChannelSchema = z.object({
  connectorId: z.string(),
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
