/**
 * All route path strings in one place.
 * Import from here; never hard-code paths in components.
 */
export const ROUTES = {
  SIGN_UP: "/signup",
  SIGN_IN: "/signin",
  ONBOARDING: "/onboarding",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  VERIFY_EMAIL: "/verify-email",

  // Workspace
  DASHBOARD: "/",
  RECOMMENDATIONS: "/recommendations",
  NEEDS_ATTENTION: "/needs-attention",
  PRODUCTS: "/products",
  PRODUCTS_NEW: "/products/new",
  PRODUCTS_IMPORT: "/products/import",
  INVENTORY: "/inventory",
  ORDERS: "/orders",
  FULFILLMENT: "/fulfillment",
  SHIPPING: "/shipping",
  RETURNS: "/returns",

  // Commerce
  LISTINGS: "/listings",
  // listing workflow screens (static paths win over /listings/:id)
  LISTINGS_BULK: "/listings/bulk",
  LISTINGS_PUBLISH: "/listings/publish",
  LISTINGS_READINESS: "/listings/readiness",
  LISTING_BLOCKED: "/listings/:id/blocked",
  LISTING_SYNC: "/listings/:id/sync",
  LISTING_UNLISTED: "/listings/:id/unlisted",
  MARKETPLACE_HUB: "/marketplace-hub",
  MARKETPLACE_HUB_CONNECTORS: "/marketplace-hub/connectors",
  MARKETPLACE_HUB_HEALTH: "/marketplace-hub/health",
  MARKETPLACE_HUB_OAUTH_CALLBACK: "/marketplace-hub/oauth/callback",
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
