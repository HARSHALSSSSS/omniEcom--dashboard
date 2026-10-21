import type {
  ConnectorCategory,
  DirectoryItem,
  DirectoryStatus,
} from "@/types/directory";

export const MAX_COMPARE = 3;

export const CATEGORY_LABEL: Record<ConnectorCategory, string> = {
  marketplace: "Marketplace",
  storefront: "Storefront",
  shipping: "Shipping",
};

export const STATUS_LABEL: Record<DirectoryStatus, string> = {
  available: "Available",
  connected: "Connected",
  needs_attention: "Needs attention",
  unavailable: "Unavailable",
};

/** "product_import" -> "product import" */
export const tagLabel = (tag: string) => tag.replace(/_/g, " ");
/** "orders.fetch" -> "orders: fetch" */
export const capabilityLabel = (cap: string) =>
  cap.replace(/_/g, " ").replace(".", ": ");

export function matchesSearch(item: DirectoryItem, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return `${item.name} ${item.id} ${item.description}`
    .toLowerCase()
    .includes(q);
}

/** category tabs come from the connectors the API returned, with how many each holds */
export function categoryTabs(
  items: DirectoryItem[],
): Array<{ key: "all" | ConnectorCategory; label: string; count: number }> {
  const counts = new Map<ConnectorCategory, number>();
  for (const i of items)
    counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  return [
    { key: "all", label: "All connectors", count: items.length },
    ...[...counts.entries()].map(([key, count]) => ({
      key,
      label: CATEGORY_LABEL[key],
      count,
    })),
  ];
}

export const authModeLabel = (mode: DirectoryItem["authFlow"]["mode"]) =>
  mode === "redirect"
    ? "Approve on the marketplace"
    : mode === "credentials"
      ? "API credentials"
      : "Approve on the marketplace or API credentials";
