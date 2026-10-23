import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  ChannelConnection,
  ConnectorDirectoryItem,
  ConnectChannelInput,
} from "@/types/connection";
import type {
  HubAccountCard,
  HubAccountDetail,
  HubAccounts,
  HubHealth,
  HubSummary,
  HubLane,
  HubSyncJob,
  ConnectionTest,
} from "@/types/hub";
import type { Directory, ConnectResult } from "@/types/directory";
import type { ConnectorCapability, AuthType } from "@/types/connector";

export interface ConnectionsListResponse {
  data: ChannelConnection[];
  meta: {
    total: number;
    healthy: number;
    warning: number;
    error: number;
  };
}

export interface HealthOverviewResponse {
  data: {
    overallPulseScore: number;
    networkStatus: "optimal" | "degraded" | "critical";
    connectionsCount: number;
    totalActiveListings: number;
    totalPendingOrders: number;
    dataFlowLanes: Array<{
      lane: string;
      status: "healthy" | "warning" | "error";
      throughput: string;
      successRate: string;
    }>;
    connections: ChannelConnection[];
    summary?: HubSummary;
    syncReliability?: { windowHours: number; finished: number; failed: number; successRate: number | null };
    tokenWarnings?: Array<{ accountId: string; name: string; marketplace: string; daysLeft: number | null; expired: boolean }>;
    rawLanes?: HubLane[];
  };
}

function normalizeAuthType(rawAuthType?: string): AuthType {
  if (rawAuthType === "oauth" || rawAuthType === "redirect") return "oauth";
  if (rawAuthType === "partner_gated") return "partner_gated";
  return "api_credentials";
}

function mapCardToConnection(card: HubAccountCard): ChannelConnection {
  const friction = card.health.frictionPoints?.[0];
  const isAttention = card.status === "warning" || card.status === "error";

  return {
    id: card.id,
    connectorId: card.marketplace,
    name: card.name,
    category: card.category,
    status: card.status,
    authType: normalizeAuthType(card.authType),
    accountIdentifier:
      card.accountIdentifier ||
      (card.mode === "sandbox" ? "Sandbox Account" : "Connected"),
    connectedAt: card.connectedAt
      ? new Date(card.connectedAt).toLocaleDateString()
      : "Connected",
    lastSyncAt: card.lastSyncAt ? new Date(card.lastSyncAt).toISOString() : "Never",
    nextSyncAt: card.nextSyncAt ? new Date(card.nextSyncAt).toISOString() : undefined,
    syncState: card.syncState,
    syncProgress: card.syncProgress ?? undefined,
    stats: {
      activeListings: card.stats?.activeListings ?? 0,
      pendingOrders: card.stats?.pendingOrders ?? 0,
      syncedInventoryItems: card.stats?.syncedInventoryItems ?? 0,
      errorCount: card.stats?.errorCount ?? 0,
    },
    health: {
      pulseScore: card.health?.pulseScore ?? 100,
      riskLevel: card.health?.riskLevel ?? "low",
      frictionPoints: card.health?.frictionPoints ?? [],
      rateLimitRemainingPct: 85,
      tokenExpiresInDays: card.health?.tokenExpiresInDays ?? undefined,
    },
    capabilities: (card.capabilities || []) as ConnectorCapability[],
    attentionIssue: isAttention
      ? {
          issueTitle: friction || (card.status === "error" ? "Connection disrupted" : "Needs attention"),
          issueDescription:
            card.health.frictionPoints?.join(". ") ||
            "Synchronization requires verification or credentials update.",
          affectedAreas: ["Products", "Orders", "Inventory"],
          lastSuccessfulSync: card.lastSyncAt
            ? new Date(card.lastSyncAt).toLocaleString()
            : "Unknown",
          actionType: card.status === "error" ? "reconnect" : "retry_scheduled",
        }
      : undefined,
  };
}

function mapDetailToConnection(detail: HubAccountDetail): ChannelConnection {
  const base = mapCardToConnection(detail);

  const getLane = (key: string) => detail.lanes?.find((l) => l.key === key);
  const catalogLane = getLane("catalog");
  const listingLane = getLane("listings");
  const inventoryLane = getLane("inventory");
  const orderLane = getLane("orders");

  const syncTime = detail.lastSyncAt
    ? new Date(detail.lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Just now";

  return {
    ...base,
    entitySyncStatus: {
      products: {
        status: catalogLane?.status === "idle" ? "healthy" : (catalogLane?.status ?? "healthy"),
        timestamp: syncTime,
        pct: catalogLane?.successRate ?? undefined,
      },
      listings: {
        status: listingLane?.status === "idle" ? "healthy" : (listingLane?.status ?? "healthy"),
        timestamp: syncTime,
      },
      inventory: {
        status: inventoryLane?.status === "idle" ? "healthy" : (inventoryLane?.status ?? "healthy"),
        timestamp: syncTime,
        pct: inventoryLane?.successRate ?? undefined,
      },
      orders: {
        status: orderLane?.status === "idle" ? "healthy" : (orderLane?.status ?? "healthy"),
        timestamp: syncTime,
        pct: orderLane?.successRate ?? undefined,
      },
      shipping: {
        status: "healthy",
        timestamp: syncTime,
      },
    },
    activityHistory: (detail.recentJobs || []).slice(0, 5).map((job) => ({
      id: job.id,
      timeText: job.startedAt
        ? new Date(job.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "Recently",
      title: `${job.type.charAt(0).toUpperCase() + job.type.slice(1)} sync ${job.status.replace("_", " ")}`,
    })),
  };
}

export const connectorsApi = {
  getConnections: async (): Promise<ConnectionsListResponse> => {
    const res = await client.get(ENDPOINTS.HUB_ACCOUNTS);
    const accounts = unwrap<HubAccounts>(res);
    const data = (accounts.items || []).map(mapCardToConnection);
    return {
      data,
      meta: {
        total: accounts.summary.total,
        healthy: accounts.summary.healthy,
        warning: accounts.summary.warning,
        error: accounts.summary.error,
      },
    };
  },

  getConnection: async (id: string): Promise<ChannelConnection> => {
    const res = await client.get(ENDPOINTS.HUB_ACCOUNT(id));
    const detail = unwrap<HubAccountDetail>(res);
    return mapDetailToConnection(detail);
  },

  getDirectory: async (): Promise<ConnectorDirectoryItem[]> => {
    const res = await client.get(ENDPOINTS.HUB_DIRECTORY);
    const dir = unwrap<Directory>(res);
    return (dir.items || []).map((item) => {
      const cleanName = item.name
        .replace(/ Seller API| SP-API| Supplier Panel| API/i, "")
        .trim();
      const tags =
        item.capabilityTags && item.capabilityTags.length > 0
          ? item.capabilityTags
          : (item.capabilities || []).filter((c) => !c.includes("."));

      return {
        id: item.id,
        name: cleanName || item.name,
        category: item.category,
        authType: normalizeAuthType(item.authFlow.mode),
        description: item.description,
        rating: 4.9,
        reviewsCount: 120,
        isPopular: item.id === "amazon_in" || item.id === "flipkart",
        isPartnerGated: item.partnerGated,
        status: item.status,
        statusReason: item.statusReason,
        pricing: {
          freeTrialDays: 0,
          monthlyFeeINR: 0,
          planName: "Included in OMS",
        },
        capabilities: tags as ConnectorCapability[],
        supportedRegions: item.supportedRegions || ["IN"],
        fields: item.authFlow.fields || [],
        authFlow: item.authFlow,
      };
    });
  },

  testConnection: async (
    connectionId: string,
  ): Promise<{ success: boolean; latencyMs: number; message: string }> => {
    const res = await client.post(ENDPOINTS.MARKETPLACE_ACCOUNT_TEST(connectionId));
    const testRes = unwrap<ConnectionTest>(res);
    const steps = testRes.steps || [];
    const latencyMs = steps.reduce(
      (sum: number, s: { durationMs?: number }) => sum + (s.durationMs || 0),
      0,
    );
    const stepMessages = steps
      .filter((s: { message?: string | null }) => s.message)
      .map((s: { name: string; message: string | null }) => `${s.name}: ${s.message}`)
      .join(" • ");

    return {
      success: testRes.ok,
      latencyMs: latencyMs || 150,
      message: stepMessages || (testRes.ok ? "Connection healthy" : "Verification failed"),
    };
  },

  syncConnection: async (
    connectionId: string,
  ): Promise<{
    success: boolean;
    connection: ChannelConnection;
    syncedItemsCount: number;
  }> => {
    await client.post(ENDPOINTS.HUB_ACCOUNT_SYNC(connectionId), {
      scopes: ["orders", "inventory", "listings", "catalog"],
    });

    const conn = await connectorsApi.getConnection(connectionId);
    return {
      success: true,
      connection: conn,
      syncedItemsCount: conn.stats.syncedInventoryItems || 0,
    };
  },

  createConnection: async (
    payload: ConnectChannelInput,
  ): Promise<ChannelConnection> => {
    const idempotencyKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `conn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const res = await client.post(
      ENDPOINTS.HUB_CONNECT,
      {
        marketplace: payload.connectorId,
        displayName: payload.name || `${payload.connectorId} Account`,
        mode: payload.mode || "live",
        region: payload.region || "IN",
        credentials: payload.credentials,
        syncOptions: {
          syncCatalog: payload.syncCatalog ?? true,
          syncOrders: payload.syncOrders ?? true,
          syncInventory: payload.syncInventory ?? true,
          runFirstSync: true,
        },
      },
      {
        headers: { "Idempotency-Key": idempotencyKey },
      },
    );

    const result = unwrap<ConnectResult>(res);

    if (result.status === "failed") {
      throw new Error(result.error?.message || "Failed to authorize connector with marketplace.");
    }

    if (result.account) {
      return {
        id: result.account.id,
        connectorId: result.account.marketplace,
        name: result.account.name,
        category: "marketplace",
        status: "healthy",
        authType: "api_credentials",
        accountIdentifier: result.account.accountIdentifier || "Connected",
        connectedAt: "Just now",
        lastSyncAt: "Just now",
        syncState: "idle",
        stats: { activeListings: 0, pendingOrders: 0, syncedInventoryItems: 0, errorCount: 0 },
        health: { pulseScore: 100, riskLevel: "low", frictionPoints: [], rateLimitRemainingPct: 100 },
        capabilities: [],
      };
    }

    if (result.redirect?.authorizationUrl) {
      window.location.href = result.redirect.authorizationUrl;
    }

    return {
      id: result.redirect?.accountId || "pending",
      connectorId: payload.connectorId,
      name: payload.name || `${payload.connectorId} Account`,
      category: "marketplace",
      status: "healthy",
      authType: "oauth",
      accountIdentifier: "Authorizing...",
      connectedAt: "Just now",
      lastSyncAt: "Never",
      syncState: "idle",
      stats: { activeListings: 0, pendingOrders: 0, syncedInventoryItems: 0, errorCount: 0 },
      health: { pulseScore: 100, riskLevel: "low", frictionPoints: [], rateLimitRemainingPct: 100 },
      capabilities: [],
    };
  },

  disconnect: async (connectionId: string): Promise<void> => {
    await client.post(ENDPOINTS.MARKETPLACE_ACCOUNT_DISCONNECT(connectionId));
  },

  getHealthOverview: async (): Promise<HealthOverviewResponse["data"]> => {
    const res = await client.get(ENDPOINTS.HUB_HEALTH);
    const health = unwrap<HubHealth>(res);

    const netStatus =
      health.networkStatus === "not_connected" ? "optimal" : health.networkStatus;

    return {
      overallPulseScore: health.overallPulseScore ?? 100,
      networkStatus: netStatus,
      connectionsCount: health.connectionsCount,
      totalActiveListings: health.totalActiveListings,
      totalPendingOrders: health.totalPendingOrders,
      dataFlowLanes: (health.dataFlowLanes || []).map((lane) => ({
        lane: lane.label,
        status: lane.status === "idle" ? "healthy" : lane.status,
        throughput: `${lane.itemsPerHour || 0} items/hr`,
        successRate: lane.successRate !== null && lane.successRate !== undefined ? `${lane.successRate}%` : "100%",
      })),
      connections: (health.connections || []).map(mapCardToConnection),
      summary: health.summary,
      syncReliability: health.syncReliability,
      tokenWarnings: health.tokenWarnings,
      rawLanes: health.dataFlowLanes,
    };
  },

  getRecentSyncJobs: async (): Promise<HubSyncJob[]> => {
    try {
      const res = await client.get(`${ENDPOINTS.SYNC_JOBS}?limit=20`);
      const data = unwrap<HubSyncJob[]>(res);
      return data || [];
    } catch {
      return [];
    }
  },

  retrySyncJob: async (jobId: string): Promise<void> => {
    await client.post(ENDPOINTS.SYNC_JOB_RETRY(jobId));
  },
};
