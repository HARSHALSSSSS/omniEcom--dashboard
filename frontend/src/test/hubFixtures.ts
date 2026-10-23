import type { HubAccountCard, HubAccountDetail, HubHealth, HubLane, HubSyncJob } from "@/types/hub";

export const card = (over: Partial<HubAccountCard> = {}): HubAccountCard => ({
  id: "a1111111-1111-4111-8111-111111111111",
  marketplace: "amazon_in",
  name: "Acme Amazon",
  connectorName: "Amazon India",
  category: "marketplace",
  logoKey: "amazon_in",
  accountIdentifier: "A1SELLER",
  mode: "live",
  region: "IN",
  status: "healthy",
  accountStatus: "active",
  connectionStatus: "connected",
  authType: "oauth2_lwa",
  connectedAt: "2026-10-01T08:00:00.000Z",
  lastSyncAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  nextSyncAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  syncState: "idle",
  syncProgress: null,
  stats: { activeListings: 120, pendingOrders: 7, syncedInventoryItems: 118, errorCount: 0 },
  health: {
    pulseScore: 96,
    riskLevel: "low",
    frictionPoints: [],
    rateLimitRemainingPct: null,
    tokenExpiresInDays: null,
    tokenExpiresAt: null,
    syncSuccessRate24h: 100,
    syncRuns24h: { finished: 10, failed: 0 },
  },
  capabilities: ["orders.fetch", "inventory.push"],
  capabilityTags: ["orders", "inventory"],
  implementation: "ga",
  version: 3,
  ...over,
});

export const FLIPKART = card({
  id: "b2222222-2222-4222-8222-222222222222",
  marketplace: "flipkart",
  name: "Acme Flipkart",
  connectorName: "Flipkart",
  accountIdentifier: "FKSELLER",
  status: "warning",
  stats: { activeListings: 30, pendingOrders: 2, syncedInventoryItems: 28, errorCount: 2 },
  health: { ...card().health, pulseScore: 70, frictionPoints: ["2 sync runs failed in the last 24 hours"], tokenExpiresInDays: 5, syncSuccessRate24h: 80, syncRuns24h: { finished: 10, failed: 2 } },
});

export const SHOPIFY = card({
  id: "c3333333-3333-4333-8333-333333333333",
  marketplace: "shopify",
  name: "Acme Store",
  connectorName: "Shopify",
  category: "storefront",
  accountIdentifier: "acme.myshopify.com",
  capabilityTags: ["orders"],
});

export const REVOKED = card({
  id: "d4444444-4444-4444-8444-444444444444",
  name: "Old Amazon",
  status: "error",
  accountStatus: "revoked",
  connectionStatus: "disconnected",
  health: { ...card().health, pulseScore: 20, frictionPoints: ["The account was disconnected: reconnect it to resume syncing"] },
});

export const summaryOf = (items: HubAccountCard[]) => ({
  total: items.length,
  healthy: items.filter((i) => i.status === "healthy").length,
  warning: items.filter((i) => i.status === "warning").length,
  error: items.filter((i) => i.status === "error").length,
  paused: items.filter((i) => i.status === "paused").length,
});

export const accounts = (items: HubAccountCard[]) => ({ items, summary: summaryOf(items) });

export const job = (over: Partial<HubSyncJob> = {}): HubSyncJob => ({
  id: "j1",
  type: "orders",
  status: "queued",
  trigger: "manual",
  marketplaceAccountId: card().id,
  attempts: 0,
  maxAttempts: 5,
  nextRetryAt: null,
  scheduledAt: "2026-10-21T08:00:00.000Z",
  startedAt: null,
  finishedAt: null,
  progress: { total: 0, done: 0, failed: 0 },
  error: null,
  failureDetails: [],
  createdAt: "2026-10-21T08:00:00.000Z",
  ...over,
});

export const lane = (over: Partial<HubLane> = {}): HubLane => ({
  key: "orders",
  label: "Order ingestion",
  status: "healthy",
  jobs: 12,
  finished: 12,
  failed: 0,
  successRate: 100,
  itemsProcessed: 240,
  itemsPerHour: 10,
  ...over,
});

export const LANES: HubLane[] = [
  lane(),
  lane({ key: "inventory", label: "Inventory sync", status: "warning", successRate: 92.5, failed: 1, itemsPerHour: 3.5 }),
  lane({ key: "listings", label: "Catalog and listings", status: "idle", jobs: 0, finished: 0, failed: 0, successRate: null, itemsProcessed: 0, itemsPerHour: 0 }),
];

export const health = (over: Partial<HubHealth> = {}): HubHealth => ({
  overallPulseScore: 83,
  networkStatus: "degraded",
  connectionsCount: 2,
  totalActiveListings: 150,
  totalPendingOrders: 9,
  syncReliability: { windowHours: 24, finished: 20, failed: 2, successRate: 90 },
  dataFlowLanes: LANES,
  summary: summaryOf([card(), FLIPKART]),
  connections: [card(), FLIPKART],
  tokenWarnings: [],
  generatedAt: new Date().toISOString(),
  accountLanes: [],
  atRisk: { staleStockListings: 0, problemListings: 0, openOrders: 0, accounts: [] },
  ...over,
});

export const detail = (over: Partial<HubAccountDetail> = {}): HubAccountDetail => ({
  ...card(),
  capabilityMatrix: {
    orders: { fetch: true, webhook: false, maxLookbackDays: 30 },
    inventory: { push: true, pull: false, batch: true },
  },
  readiness: { sandbox: true, live: false, notes: "Sandbox verified." },
  recentJobs: [job({ id: "j9", status: "failed", error: { code: "UPSTREAM", message: "Marketplace refused the request" } })],
  lanes: LANES,
  webhook: { supported: true, configured: true, secretRotatedAt: null, signatureHeader: "x-sig", lastEventAt: null, events24h: { processed: 4 } },
  inventoryPolicy: { mode: "sync", safetyBuffer: 2, allocationPercent: 80, maxQuantity: null, warehouseIds: [], isDefault: false },
  listingsByStatus: { active: 120, rejected: 2 },
  authorization: { status: "active", scopes: ["sellingpartnerapi::orders"], lastRefreshedAt: null, rotationCount: 1 },
  ...over,
});
