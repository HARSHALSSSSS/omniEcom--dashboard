/** GET /workspace/recommendations: up to three context cards, each null when the caller may not read it or it has nothing to show. */
export interface ChannelProblem {
  code: string;
  title: string;
  explanation: string;
  action: { label?: string; href?: string };
}

export interface ChannelAction {
  key: "retry_sync" | "manage";
  label: string;
  method: "GET" | "POST";
  /** an API path (`/api/v1/marketplace-accounts/{id}/inventory-sync`) for retry_sync */
  href: string;
  enabled: boolean;
  disabledReason: string | null;
}

export interface ChannelCard {
  channel: { code: string; name: string; accountId?: string | null };
  displayName: string;
  mode: string;
  connection: "connected" | "needs_attention" | "not_connected";
  health: "healthy" | "attention";
  lastSyncAt: string | null;
  syncMode: "automatic" | "manual";
  openIssueCount: number;
  openIssues: ChannelProblem[];
  actions: ChannelAction[];
}

export interface ProductCard {
  productId: string;
  variantId: string;
  title: string;
  sku: string;
  location: string | null;
  status: "out" | "low" | "healthy";
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  salesVelocityPerDay: number;
  estimatedCoverDays: number | null;
  recentMovements: Array<{ at: string; type: string; label: string; quantity: number; positive: boolean }>;
  actions: Array<{ key: string; label: string; href: string }>;
}

export interface ReplenishmentCard {
  headline: string;
  approachingThreshold: number;
  summary: string;
  rationale: string;
  targetDays: number;
  formula: string;
  shown: number;
  totalProducts: number;
  items: Array<{ variantId: string; name: string; sku: string; available: number; salesVelocityPerDay: number; coverDays: number | null; suggestedUnits: number }>;
  note: string;
  actions: Array<{ key: string; label: string; href: string }>;
}

export interface Recommendations {
  asOf: string;
  channel: ChannelCard | null;
  channelConnections: number;
  product: ProductCard | null;
  replenishment: ReplenishmentCard | null;
}

export type SyncJobStatus = "queued" | "running" | "retrying" | "succeeded" | "partially_failed" | "failed" | "dead_lettered" | "cancelled";

export interface SyncJob {
  id: string;
  type: string;
  status: SyncJobStatus;
  attempts: number;
  maxAttempts: number;
  finishedAt: string | null;
  progress: { total: number; done: number; failed: number };
}

export const SYNC_JOB_DONE: readonly SyncJobStatus[] = ["succeeded", "partially_failed", "failed", "dead_lettered", "cancelled"];
