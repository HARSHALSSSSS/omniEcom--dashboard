import type { ConnectorDirectoryItem } from "@/types/connection";

/** The platform does not bill connectors (the directory API reports no price), so the screens say exactly that. */
export const FEE_TEXT = "Included in your workspace";
export const FEE_NOTE = "This platform does not charge a separate connector fee.";

export const CAPABILITY_ROWS = [
  { key: "product_import", label: "Product import" },
  { key: "listings", label: "Listings" },
  { key: "inventory", label: "Inventory" },
  { key: "orders", label: "Orders" },
  { key: "returns", label: "Returns" },
  { key: "reviews", label: "Reviews" },
  { key: "promotions", label: "Promotions" },
  { key: "shipping", label: "Shipping" },
] as const;

export const CAPABILITY_LABEL: Record<string, string> = Object.fromEntries(CAPABILITY_ROWS.map((r) => [r.key, r.label]));

export type Support = "Supported" | "Depends" | "N/A";

/**
 * From the connector's declared capability tags. "Depends": the connector has the capability, but the marketplace only gives API access to
 * approved partners. Reviews are not a capability the platform has, so no connector supports them.
 */
export function capabilitySupport(c: ConnectorDirectoryItem, key: string): Support {
  if (!(c.capabilities as string[]).includes(key)) return "N/A";
  return c.isPartnerGated || c.authFlow?.partnerGated ? "Depends" : "Supported";
}

export const supportedCapabilities = (c: ConnectorDirectoryItem): string[] => CAPABILITY_ROWS.filter((r) => capabilitySupport(c, r.key) !== "N/A").map((r) => r.label);

export function accessText(c: ConnectorDirectoryItem): string {
  const mode = c.authFlow?.mode;
  const base = mode === "redirect" ? "Authorize on the marketplace" : mode === "both" ? "Authorize on the marketplace or paste API credentials" : "API credentials";
  return c.isPartnerGated ? `${base} · partner approval required` : base;
}

export const regionsText = (c: ConnectorDirectoryItem): string => (c.supportedRegions.length ? c.supportedRegions.join(", ") : "Not stated");

export function environmentText(c: ConnectorDirectoryItem): string {
  if (!c.readiness) return "Not stated";
  const { sandbox, live } = c.readiness;
  return live && sandbox ? "Sandbox and live" : live ? "Live" : sandbox ? "Sandbox only" : "Not verified yet";
}

export const limitText = (c: ConnectorDirectoryItem): string => (c.limits ? `${c.limits.requestsPerSecond} requests/s, burst ${c.limits.burst}` : "Not stated");

/** what the seller has to bring: the labels of the fields of the connect form (secrets are marked) */
export function requirementItems(c: ConnectorDirectoryItem): string[] {
  const flow = c.authFlow;
  if (!flow) return [];
  const fields = flow.mode === "redirect" ? flow.redirectFields : flow.fields;
  return fields.map((f) => (f.secret ? `${f.label} (kept encrypted)` : f.label));
}

/** the real steps of the connect flow for this connector */
export function connectionSteps(c: ConnectorDirectoryItem): string[] {
  const mode = c.authFlow?.mode;
  const connect = mode === "redirect" ? "Authorize on the marketplace" : mode === "both" ? "Authorize or enter credentials" : "Enter credentials";
  return ["Review capabilities", connect, "Verify the connection", "First sync", "Start using"];
}

export const statusLabel = (c: ConnectorDirectoryItem, connectionCount: number): string => {
  if (c.status === "unavailable") return "Unavailable";
  if (c.status === "needs_attention") return "Needs attention";
  if (c.status === "connected") return connectionCount > 1 ? `Connected · ${connectionCount} accounts` : "Connected";
  return "Available";
};

const BOOKMARKS_KEY = "connector-bookmarks";
export function loadBookmarks(): string[] {
  try {
    const raw = window.localStorage.getItem(BOOKMARKS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function saveBookmarks(ids: string[]): void {
  try {
    window.localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(ids));
  } catch {
    /* private mode: bookmarks stay for this visit only */
  }
}

/** the connector capability groups the screens show as chips (same grouping as the backend's capability tags) */
const TAG_RULES: Array<{ tag: string; any: string[] }> = [
  { tag: "product_import", any: ["catalog.import"] },
  { tag: "listings", any: ["listings.create", "listings.update"] },
  { tag: "inventory", any: ["inventory.push"] },
  { tag: "orders", any: ["orders.fetch"] },
  { tag: "shipping", any: ["shipping.createShipment", "shipping.generateLabel"] },
  { tag: "returns", any: ["returns.fetch"] },
  { tag: "promotions", any: ["pricing.push"] },
];
export const tagsFromEnabled = (enabled: string[]): string[] => TAG_RULES.filter((r) => r.any.some((a) => enabled.includes(a))).map((r) => r.tag);

export type CapStatus = "supported" | "depends" | "unavailable";

/** what moves in each direction, from the connector's real capability flags */
export function dataStreams(enabled: string[]): { into: string[]; from: string[] } {
  const has = (...f: string[]) => f.some((x) => enabled.includes(x));
  const into = [
    has("orders.fetch") && "Orders",
    has("inventory.pull") && "Inventory levels",
    has("listings.fetch", "listings.statusLookup") && "Marketplace listing status",
    has("returns.fetch") && "Returns",
  ].filter(Boolean) as string[];
  const from = [
    has("listings.create", "listings.update") && "Product information and listings",
    has("inventory.push") && "Inventory availability",
    has("pricing.push") && "Prices",
    has("orders.updateStatus", "orders.acknowledge") && "Order status",
    has("shipping.createShipment", "shipping.generateLabel") && "Shipments and labels",
  ].filter(Boolean) as string[];
  return { into, from };
}
