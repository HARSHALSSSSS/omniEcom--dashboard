import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  ChannelConnection,
  EntitySync,
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
import { JOB_TYPE_LABEL, describeJob } from "@/components/marketplace-hub/accounts/hubFormat";

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
      card.accountIdentifier || (card.mode === "sandbox" ? "Sandbox account" : card.name),
    connectedAt: card.connectedAt ?? "",
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
      rateLimitRemainingPct: card.health?.rateLimitRemainingPct ?? null,
      tokenExpiresInDays: card.health?.tokenExpiresInDays ?? undefined,
    },
    capabilities: (card.capabilities || []) as ConnectorCapability[],
    account: card,
    attentionIssue: isAttention
      ? {
          issueTitle: friction || (card.status === "error" ? "Connection disrupted" : "Needs attention"),
          issueDescription: card.health.frictionPoints?.slice(1).join(". ") || "",
          affectedAreas: [],
          lastSuccessfulSync: card.lastSyncAt ?? "",
          actionType: card.accountStatus === "active" ? "retry_scheduled" : "reconnect",
        }
      : undefined,
  };
}

const ENTITY_JOB_TYPES = {
  products: ["catalog_import"],
  listings: ["listing_publish", "listing_status", "listings"],
  inventory: ["inventory"],
  orders: ["orders"],
  shipping: ["order_status", "tracking"],
} as const;
const ENTITY_LANE = { products: "listings", listings: "listings", inventory: "inventory", orders: "orders", shipping: "tracking" } as const;

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** What one entity's sync is doing, from the newest job of its type (the 10 newest jobs of the account come with the detail), else from its 24 h lane. */
function entitySync(detail: HubAccountDetail, entity: keyof typeof ENTITY_JOB_TYPES): EntitySync {
  const types = ENTITY_JOB_TYPES[entity] as readonly string[];
  const job = (detail.recentJobs || []).find((j) => types.includes(j.type));
  if (job) {
    const at = job.finishedAt ?? job.startedAt ?? job.createdAt;
    const active = job.status === "queued" || job.status === "running" || job.status === "retrying";
    const status: EntitySync["status"] = active
      ? "syncing"
      : job.status === "succeeded"
        ? "healthy"
        : job.status === "partially_failed"
          ? "warning"
          : job.status === "cancelled"
            ? "idle"
            : "error";
    const pct = job.status === "succeeded" ? 100 : job.progress.total > 0 ? Math.round((job.progress.done / job.progress.total) * 100) : undefined;
    return { status, timestamp: clock(at), at, pct };
  }
  const lane = detail.lanes?.find((l) => l.key === ENTITY_LANE[entity]);
  return { status: !lane || lane.status === "idle" ? "idle" : lane.status, timestamp: "" };
}

function mapDetailToConnection(detail: HubAccountDetail): ChannelConnection {
  const base = mapCardToConnection(detail);
  return {
    ...base,
    entitySyncStatus: {
      products: entitySync(detail, "products"),
      listings: entitySync(detail, "listings"),
      inventory: entitySync(detail, "inventory"),
      orders: entitySync(detail, "orders"),
      shipping: entitySync(detail, "shipping"),
    },
    activityHistory: (detail.recentJobs || []).slice(0, 5).map((job) => ({
      id: job.id,
      timeText: job.startedAt
        ? new Date(job.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "Queued",
      title: `${JOB_TYPE_LABEL[job.type] ?? job.type} ${describeJob(job).label.toLowerCase()}`,
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
        health: { pulseScore: 100, riskLevel: "low", frictionPoints: [], rateLimitRemainingPct: null },
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
      health: { pulseScore: 100, riskLevel: "low", frictionPoints: [], rateLimitRemainingPct: null },
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
