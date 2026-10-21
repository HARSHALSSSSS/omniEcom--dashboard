import { ROUTES } from "@/constants/routes";

/**
 * The API gives deep links in its own vocabulary (hrefs on search hits, notifications, issues). This turns them into
 * routes that exist in the app. Pages read ?drawer=<type>:<id> to open a detail drawer.
 */
export function toAppPath(href: string | null | undefined): string {
  if (!href) return ROUTES.DASHBOARD;
  const [path = "", query = ""] = href.split("?");
  const suffix = query ? `?${query}` : "";
  const seg = path.split("/").filter(Boolean);

  const detail = (route: string, kind: string) => `${route}?drawer=${kind}:${seg[1]}`;
  switch (seg[0]) {
    case "orders":
      return seg[1] ? detail(ROUTES.ORDERS, "order") : `${ROUTES.ORDERS}${suffix}`;
    case "returns":
      return seg[1] ? detail(ROUTES.RETURNS, "return") : `${ROUTES.RETURNS}${suffix}`;
    case "inventory":
      return seg[1] === "variants" && seg[2] ? `${ROUTES.INVENTORY}?drawer=variant:${seg[2]}` : `${ROUTES.INVENTORY}${suffix}`;
    case "channels":
      return ROUTES.MARKETPLACE_HUB;
    case "sync":
      return ROUTES.MARKETPLACE_HUB_HEALTH;
    case "products":
    case "listings":
    case "shipping":
    case "fulfillment":
    case "procurement":
    case "pricing":
    case "promotions":
    case "reports":
    case "settings":
    case "marketplace-hub":
    case "needs-attention":
    case "recommendations":
    case "automation":
    case "ai-assistant":
    case "profitability":
    case "product-intelligence":
      return `${path}${suffix}`;
    default:
      return ROUTES.DASHBOARD;
  }
}
