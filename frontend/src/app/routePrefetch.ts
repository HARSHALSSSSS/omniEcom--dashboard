import { ROUTES } from "@/constants/routes";

const LOADERS: Record<string, () => Promise<unknown>> = {
  [ROUTES.DASHBOARD]: () => import("@/pages/dashboard/DashboardPage"),
  [ROUTES.RECOMMENDATIONS]: () => import("@/pages/recommendations/RecommendationsPage"),
  [ROUTES.NEEDS_ATTENTION]: () => import("@/pages/needs-attention/NeedsAttentionPage"),
  [ROUTES.PRODUCTS]: () => import("@/pages/products/ProductsPage"),
  [ROUTES.INVENTORY]: () => import("@/pages/inventory/InventoryPage"),
  [ROUTES.ORDERS]: () => import("@/pages/orders/OrdersPage"),
  [ROUTES.FULFILLMENT]: () => import("@/pages/fulfillment/FulfillmentPage"),
  [ROUTES.SHIPPING]: () => import("@/pages/shipping/ShippingPage"),
  [ROUTES.RETURNS]: () => import("@/pages/returns/ReturnsPage"),
  [ROUTES.LISTINGS]: () => import("@/pages/listings/ListingsPage"),
  [ROUTES.MARKETPLACE_HUB]: () => import("@/pages/marketplace-hub/MarketplaceHubPage"),
  [ROUTES.PRICING]: () => import("@/pages/pricing/PricingPage"),
  [ROUTES.PROMOTIONS]: () => import("@/pages/promotions/PromotionsPage"),
  [ROUTES.PROCUREMENT]: () => import("@/pages/procurement/ProcurementPage"),
  [ROUTES.REPORTS]: () => import("@/pages/reports/ReportsPage"),
  [ROUTES.PROFITABILITY]: () => import("@/pages/profitability/ProfitabilityPage"),
  [ROUTES.PRODUCT_INTELLIGENCE]: () => import("@/pages/product-intelligence/ProductIntelligencePage"),
  [ROUTES.AI_ASSISTANT]: () => import("@/pages/ai-assistant/AiAssistantPage"),
  [ROUTES.AUTOMATION]: () => import("@/pages/automation/AutomationPage"),
  [ROUTES.SETTINGS]: () => import("@/pages/settings/SettingsPage"),
  [ROUTES.SETTINGS_PROFILE]: () => import("@/pages/settings/SettingsPage"),
};

const prefetched = new Set<string>();

/**
 * Prefetches the code chunk for a route on user intent (e.g. hovering a nav link).
 * Prevents `<PageLoader />` from displaying by ensuring the bundle is already cached.
 */
export function prefetchRoute(href: string): void {
  if (prefetched.has(href)) return;
  const loader = LOADERS[href];
  if (!loader) return;
  prefetched.add(href);
  loader().catch(() => {
    // If prefetch fails (e.g. offline), remove from set so retry is possible on next interaction
    prefetched.delete(href);
  });
}
