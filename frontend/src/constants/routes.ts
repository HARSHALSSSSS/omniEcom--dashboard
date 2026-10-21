/**
 * All route path strings in one place.
 * Import from here; never hard-code paths in components.
 */
export const ROUTES = {
  SIGN_UP: "/signup",
  SIGN_IN: "/signin",
  ONBOARDING: "/onboarding",

  // Workspace
  DASHBOARD: "/",
  RECOMMENDATIONS: "/recommendations",
  NEEDS_ATTENTION: "/needs-attention",
  PRODUCTS: "/products",
  PRODUCTS_NEW: "/products/new",
  PRODUCTS_IMPORT: "/products/import",
  INVENTORY: "/inventory",
  ORDERS: "/orders",
  SHIPPING: "/shipping",
  RETURNS: "/returns",

  // Commerce
  LISTINGS: "/listings",
  LISTINGS_BULK: "/listings/bulk",
  LISTINGS_SELECTED: "/listings/selected",
  LISTINGS_PUBLISH: "/listings/publish",
  LISTINGS_READINESS: "/listings/readiness",
  LISTINGS_BLOCKER: "/listings/:id/blocked",
  LISTINGS_BLOCKED: "/listings/blocked",
  LISTINGS_SYNC: "/listings/:id/sync",
  LISTINGS_UNLISTED: "/listings/:id/unlisted",
  MARKETPLACE_HUB: "/marketplace-hub",
  MARKETPLACE_HUB_CONNECTORS: "/marketplace-hub/connectors",
  MARKETPLACE_HUB_HEALTH: "/marketplace-hub/health",
  PRICING: "/pricing",
  PROMOTIONS: "/promotions",
  PROCUREMENT: "/procurement",

  // Intelligence
  REPORTS: "/reports",
  PROFITABILITY: "/profitability",
  PRODUCT_INTELLIGENCE: "/product-intelligence",
  AI_ASSISTANT: "/ai-assistant",
  AUTOMATION: "/automation",

  // Settings
  SETTINGS: "/settings",

  // Dev
  DEV_COMPONENTS: "/dev/components",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];
