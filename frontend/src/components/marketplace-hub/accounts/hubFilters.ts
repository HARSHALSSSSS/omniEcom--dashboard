import type { AccountFilters, HubAccountCard, HubCategory, HubStatus } from "@/types/hub";

const CATEGORIES: HubCategory[] = ["marketplace", "storefront", "shipping"];
const STATUSES: HubStatus[] = ["healthy", "warning", "error", "paused"];

/** the filters live in the URL: ?tab=storefront&marketplace=shopify&status=warning&q=acme */
export function filtersFromParams(p: URLSearchParams): AccountFilters {
  const tab = p.get("tab");
  const status = p.get("status");
  return {
    category: CATEGORIES.includes(tab as HubCategory) ? (tab as HubCategory) : "all",
    marketplace: p.get("marketplace") ?? "",
    status: STATUSES.includes(status as HubStatus) ? (status as HubStatus) : "all",
    q: p.get("q") ?? "",
  };
}

export function paramsFromFilters(f: AccountFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.category !== "all") p.set("tab", f.category);
  if (f.marketplace) p.set("marketplace", f.marketplace);
  if (f.status !== "all") p.set("status", f.status);
  if (f.q) p.set("q", f.q);
  return p;
}

export const hasFilters = (f: AccountFilters): boolean => f.category !== "all" || Boolean(f.marketplace) || f.status !== "all" || Boolean(f.q);

/** applies every filter except `skip` (the tab counts ignore the tab itself) */
export function applyFilters(items: HubAccountCard[], f: AccountFilters, skip?: "category"): HubAccountCard[] {
  const q = f.q.trim().toLowerCase();
  return items.filter(
    (a) =>
      (skip === "category" || f.category === "all" || a.category === f.category) &&
      (!f.marketplace || a.marketplace === f.marketplace) &&
      (f.status === "all" || a.status === f.status) &&
      (!q || [a.name, a.connectorName, a.accountIdentifier ?? ""].some((s) => s.toLowerCase().includes(q))),
  );
}
