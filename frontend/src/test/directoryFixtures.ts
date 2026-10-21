import type {
  AuthField,
  ConnectResult,
  ConnectorReadiness,
  Directory,
  DirectoryItem,
} from "@/types/directory";

const field = (
  key: string,
  label: string,
  over: Partial<AuthField> = {},
): AuthField => ({
  key,
  label,
  type: "text",
  required: true,
  secret: false,
  pattern: null,
  help: null,
  ...over,
});

export const item = (over: Partial<DirectoryItem> = {}): DirectoryItem => ({
  id: "mock",
  name: "Mock Marketplace",
  category: "marketplace",
  description: "Sandbox marketplace for testing",
  logoKey: "mock",
  supportedRegions: ["IN"],
  implementation: "beta",
  status: "available",
  statusReason: null,
  accountCount: 0,
  partnerGated: false,
  authFlow: {
    type: "api_key",
    mode: "credentials",
    fields: [
      field("sellerId", "Seller ID"),
      field("apiKey", "API key", { secret: true }),
    ],
    redirectFields: [],
    partnerGated: false,
    refreshable: false,
  },
  capabilities: ["orders.fetch", "inventory.push"],
  capabilityTags: ["orders", "inventory"],
  ...over,
});

const shopDomain = field("shopDomain", "Shop domain", {
  pattern: "^[a-z0-9][a-z0-9-]*\\.myshopify\\.com$",
});

export const shopify = item({
  id: "shopify",
  name: "Shopify",
  category: "storefront",
  description: "Your online store",
  status: "connected",
  accountCount: 2,
  capabilities: ["orders.fetch", "listings.publish"],
  capabilityTags: ["orders", "listings"],
  authFlow: {
    type: "oauth2",
    mode: "both",
    fields: [
      shopDomain,
      field("accessToken", "Access token", { secret: true }),
    ],
    redirectFields: [shopDomain],
    partnerGated: false,
    refreshable: false,
  },
});

export const delhivery = item({
  id: "delhivery",
  name: "Delhivery",
  category: "shipping",
  description: "Courier",
  implementation: "planned",
  status: "unavailable",
  statusReason: "This integration is not available yet",
  capabilities: [],
  capabilityTags: [],
});

export const directory = (items: DirectoryItem[]): Directory => ({
  items,
  summary: {
    total: items.length,
    connected: items.filter((i) => i.status === "connected").length,
    needsAttention: items.filter((i) => i.status === "needs_attention").length,
    available: items.filter((i) => i.status === "available").length,
    unavailable: items.filter((i) => i.status === "unavailable").length,
  },
});

export const sandboxOnly: ConnectorReadiness = {
  code: "mock",
  sandbox: true,
  live: false,
  notes: "Runs against the in-process simulator.",
  defaultMode: "sandbox",
};

export const account = {
  id: "acc1",
  name: "My mock",
  marketplace: "mock",
  connectorName: "Mock Marketplace",
  mode: "sandbox" as const,
  accountIdentifier: "S1",
  accountStatus: "active",
};

export const connected = (
  over: Partial<ConnectResult> = {},
): ConnectResult => ({
  status: "connected",
  ok: true,
  steps: [
    {
      name: "create_account",
      ok: true,
      skipped: false,
      message: null,
      durationMs: 4,
    },
    {
      name: "authorize",
      ok: true,
      skipped: false,
      message: "The marketplace accepted the credentials",
      durationMs: 120,
    },
    {
      name: "test",
      ok: true,
      skipped: false,
      message: "Connected",
      durationMs: 80,
    },
    {
      name: "first_sync",
      ok: true,
      skipped: false,
      message: "Queued: orders, inventory",
      durationMs: 9,
    },
  ],
  account,
  cleanedUp: false,
  redirect: null,
  jobs: [
    { id: "j1", type: "orders", status: "queued" },
    { id: "j2", type: "inventory", status: "queued" },
  ],
  error: null,
  ...over,
});
