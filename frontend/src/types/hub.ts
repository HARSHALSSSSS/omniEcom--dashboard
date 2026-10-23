/** Marketplace Hub contract: GET /marketplace-hub/* plus the marketplace-accounts and sync endpoints it builds on. */

export type HubStatus = "healthy" | "warning" | "error" | "paused";
export type HubCategory = "marketplace" | "storefront" | "shipping";
export type AccountStatus = "pending_authorization" | "active" | "paused" | "error" | "revoked";
export type ConnectionState = "unknown" | "connected" | "degraded" | "disconnected" | "error";
export type SyncState = "idle" | "syncing" | "error" | "paused";
export type SyncScope = "orders" | "inventory" | "listings" | "catalog";
export type Implementation = "planned" | "beta" | "ga";

export interface HubAccountCard {
  id: string;
  marketplace: string;
  name: string;
  connectorName: string;
  category: HubCategory;
  logoKey: string;
  accountIdentifier: string | null;
  mode: "live" | "sandbox";
  region: string;
  status: HubStatus;
  accountStatus: AccountStatus;
  connectionStatus: ConnectionState;
  authType: string;
  connectedAt: string | null;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  syncState: SyncState;
  syncProgress: number | null;
  stats: { activeListings: number; pendingOrders: number; syncedInventoryItems: number; errorCount: number };
  health: {
    pulseScore: number;
    riskLevel: "low" | "medium" | "high";
    frictionPoints: string[];
    /** percent of the per-account request allowance free right now (server process measure); null when not active */
    rateLimitRemainingPct: number | null;
    tokenExpiresInDays: number | null;
    tokenExpiresAt: string | null;
    syncSuccessRate24h: number | null;
    syncRuns24h: { finished: number; failed: number };
  };
  capabilities: string[];
  capabilityTags: string[];
  implementation: Implementation;
  version: number;
}

export interface HubSummary {
  total: number;
  healthy: number;
  warning: number;
  error: number;
  paused: number;
}

export interface HubAccounts {
  items: HubAccountCard[];
  summary: HubSummary;
}

export type JobStatus = "queued" | "running" | "retrying" | "succeeded" | "partially_failed" | "failed" | "dead_lettered" | "cancelled";

export interface HubSyncJob {
  id: string;
  type: string;
  status: JobStatus;
  trigger: string;
  marketplaceAccountId: string | null;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  scheduledAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  progress: { total: number; done: number; failed: number };
  error: { code: string; message: string } | null;
  failureDetails: Array<{ ref: string; code?: string; message: string }>;
  createdAt: string;
}

export interface SyncLogLine {
  id: number;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  createdAt: string;
}

export type LaneStatus = "healthy" | "warning" | "error" | "idle";

export interface HubLane {
  key: string;
  label: string;
  status: LaneStatus;
  jobs: number;
  finished: number;
  failed: number;
  successRate: number | null;
  itemsProcessed: number;
  itemsPerHour: number;
}

export interface HubHealth {
  overallPulseScore: number | null;
  networkStatus: "optimal" | "degraded" | "critical" | "not_connected";
  connectionsCount: number;
  totalActiveListings: number;
  totalPendingOrders: number;
  syncReliability: { windowHours: number; finished: number; failed: number; successRate: number | null };
  dataFlowLanes: HubLane[];
  summary: HubSummary;
  connections: HubAccountCard[];
  tokenWarnings: Array<{ accountId: string; name: string; marketplace: string; daysLeft: number | null; expired: boolean }>;
}

export interface InventoryPolicy {
  mode: "sync" | "paused";
  safetyBuffer: number;
  allocationPercent: number;
  maxQuantity: number | null;
  warehouseIds: string[];
  isDefault: boolean;
}

export interface HubAccountDetail extends HubAccountCard {
  capabilityMatrix: Record<string, Record<string, unknown>>;
  readiness: { sandbox: boolean; live: boolean; notes: string };
  recentJobs: HubSyncJob[];
  lanes: HubLane[];
  webhook: {
    supported: boolean;
    configured: boolean;
    secretRotatedAt: string | null;
    signatureHeader: string | null;
    lastEventAt: string | null;
    events24h: Record<string, number>;
  };
  inventoryPolicy: InventoryPolicy;
  listingsByStatus: Record<string, number>;
  authorization: { status: string; scopes: string[]; lastRefreshedAt: string | null; rotationCount: number } | null;
}

export interface SyncStart {
  accountId: string;
  jobs: Array<{ scope: SyncScope; job: HubSyncJob; created: boolean }>;
  skipped: Array<{ scope: SyncScope; reason: string }>;
}

export interface SyncStatus {
  accountId: string;
  state: SyncState;
  progress: number | null;
  active: HubSyncJob[];
  latest: HubSyncJob[];
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
}

export interface ConnectionTest {
  ok: boolean;
  marketplace: string;
  mode: "live" | "sandbox";
  checkedAt: string;
  steps: Array<{ name: string; ok: boolean; skipped: boolean; durationMs: number; message: string | null }>;
}

export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password" | "select";
  required: boolean;
  secret: boolean;
  pattern: string | null;
  help: string | null;
  options?: Array<{ value: string; label: string }>;
}

export interface ConnectorInfo {
  code: string;
  displayName: string;
  implementation: Implementation;
  authType: string;
  redirectFlow: boolean;
  refreshableTokens: boolean;
  enabledCapabilities: string[];
  capabilities: Record<string, Record<string, unknown>>;
  category: HubCategory;
  description: string;
  logoKey: string;
  supportedRegions: string[];
  authFlow: {
    type: string;
    mode: "redirect" | "credentials" | "both";
    fields: CredentialField[];
    redirectFields: CredentialField[];
    partnerGated: boolean;
    refreshable: boolean;
  };
}

export interface AccountFilters {
  category: "all" | HubCategory;
  marketplace: string;
  status: "all" | HubStatus;
  q: string;
}
