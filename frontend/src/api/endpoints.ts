/**
 * Every API URL in one place.
 * Never hard-code URLs in api functions or components.
 */
const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export const ENDPOINTS = {
  // Auth
  AUTH_SIGNUP: `${BASE}/auth/signup`,
  AUTH_SIGNIN: `${BASE}/auth/signin`,
  AUTH_REFRESH: `${BASE}/auth/refresh`,
  AUTH_SIGNOUT: `${BASE}/auth/signout`,
  ME: `${BASE}/me`,

  // Onboarding
  ONBOARDING: `${BASE}/onboarding`,

  // Dashboard / workspace
  DASHBOARD_SUMMARY: `${BASE}/dashboard/summary`,
  DASHBOARD_SALES: `${BASE}/dashboard/sales`,
  NEEDS_ATTENTION: `${BASE}/needs-attention`,
  SEARCH: `${BASE}/search`,

  // Products
  PRODUCTS: `${BASE}/products`,
  PRODUCT: (id: string) => `${BASE}/products/${id}`,
  PRODUCT_VARIANTS: (id: string) => `${BASE}/products/${id}/variants`,
  PRODUCT_ACTIVITY: (id: string) => `${BASE}/products/${id}/activity`,
  PRODUCT_AI_REWRITE: (id: string) => `${BASE}/products/${id}/ai-rewrite`,
  VARIANTS: `${BASE}/variants`,
  VARIANT: (id: string) => `${BASE}/variants/${id}`,
  PRODUCTS_BULK: `${BASE}/products/bulk`,

  // Import
  IMPORTS: `${BASE}/imports`,
  IMPORT: (id: string) => `${BASE}/imports/${id}`,
  IMPORT_MAPPING: (id: string) => `${BASE}/imports/${id}/mapping`,
  IMPORT_ISSUES: (id: string) => `${BASE}/imports/${id}/issues`,
  IMPORT_ISSUE: (id: string, issueId: string) =>
    `${BASE}/imports/${id}/issues/${issueId}`,
  IMPORT_REVALIDATE: (id: string) => `${BASE}/imports/${id}/revalidate`,
  IMPORT_COMMIT: (id: string) => `${BASE}/imports/${id}/commit`,

  // Connectors / Connections
  CONNECTORS: `${BASE}/connectors`,
  CONNECTOR: (id: string) => `${BASE}/connectors/${id}`,
  CONNECTOR_CAPABILITIES: (id: string) =>
    `${BASE}/connectors/${id}/capabilities`,
  CONNECTIONS: `${BASE}/connections`,
  CONNECTION: (id: string) => `${BASE}/connections/${id}`,
  CONNECTION_AUTHORIZE: (id: string) => `${BASE}/connections/${id}/authorize`,
  CONNECTION_TEST: (id: string) => `${BASE}/connections/${id}/test`,
  CONNECTION_SYNC: (id: string) => `${BASE}/connections/${id}/sync`,
  CONNECTIONS_HEALTH: `${BASE}/connections/health`,

  // Listings
  LISTINGS: `${BASE}/listings`,
  LISTING: (id: string) => `${BASE}/listings/${id}`,
  LISTINGS_MATRIX: `${BASE}/listings/matrix`,
  LISTINGS_REACH: `${BASE}/listings/reach`,
  LISTINGS_ISSUES: `${BASE}/listings/issues`,
  LISTINGS_PUBLISHING_PREPARATION: `${BASE}/listings/publishing-preparation`,
  LISTINGS_CONFIRM_PUBLISH: `${BASE}/listings/confirm-publish`,
  LISTINGS_READINESS_AUDIT: `${BASE}/listings/readiness-audit`,
  LISTINGS_APPLY_SUGGESTION: `${BASE}/listings/apply-suggestion`,
  LISTING_READINESS: (id: string) => `${BASE}/listings/${id}/readiness`,
  LISTING_PUBLISH: (id: string) => `${BASE}/listings/${id}/publish`,
  LISTING_BLOCKER: (id: string) => `${BASE}/listings/${id}/blocker`,
  LISTING_RESOLVE_BLOCKER: (id: string) => `${BASE}/listings/${id}/resolve-blocker`,
  LISTING_SYNC_TELEMETRY: (id: string) => `${BASE}/listings/${id}/sync-telemetry`,
  LISTING_UNLISTED: (id: string) => `${BASE}/listings/${id}/unlisted`,
  LISTING_PREPARE: (id: string) => `${BASE}/listings/${id}/prepare`,
  LISTINGS_BULK_PUBLISH: `${BASE}/listings/bulk-publish`,
  LISTING_ACTIVITY: (id: string) => `${BASE}/listings/${id}/activity`,

  // Inventory
  INVENTORY_SUMMARY: `${BASE}/inventory/summary`,
  INVENTORY_LEDGER: `${BASE}/inventory/ledger`,
  INVENTORY_ADJUST: `${BASE}/inventory/adjust`,
  INVENTORY_TRANSFER: `${BASE}/inventory/transfer`,
  INVENTORY_SYNC: `${BASE}/inventory/sync`,
  INVENTORY_MOVEMENTS: `${BASE}/inventory/movements`,
  WAREHOUSES: `${BASE}/warehouses`,

  // Orders
  ORDERS: `${BASE}/orders`,
  ORDER: (id: string) => `${BASE}/orders/${id}`,
  ORDERS_SUMMARY: `${BASE}/orders/summary`,
  ORDERS_BULK: `${BASE}/orders/bulk`,
  ORDERS_EXPORT: `${BASE}/orders/export`,

  // Fulfillment
  FULFILLMENT_QUEUE: `${BASE}/fulfillment/queue`,
  FULFILLMENT_EXCEPTIONS: `${BASE}/fulfillment/exceptions`,
  FULFILLMENT_ACTION: (orderId: string, action: string) =>
    `${BASE}/fulfillment/${orderId}/${action}`,

  // Shipping
  SHIPPING_SUMMARY: `${BASE}/shipping/summary`,
  SHIPPING_METHODS: `${BASE}/shipping/methods`,
  SHIPPING_RULES: `${BASE}/shipping/rules`,
  SHIPPING_TRACKING: `${BASE}/shipping/tracking`,
  SHIPPING_LABELS: `${BASE}/shipping/labels`,

  // Returns
  RETURNS: `${BASE}/returns`,
  RETURN: (id: string) => `${BASE}/returns/${id}`,
  RETURN_ACTION: (id: string, action: string) =>
    `${BASE}/returns/${id}/${action}`,
  RETURNS_INSIGHTS: `${BASE}/returns/insights`,

  // Pricing
  PRICING_OVERVIEW: `${BASE}/pricing/overview`,
  PRICING_PROPOSALS: `${BASE}/pricing/proposals`,
  PRICING_PROPOSAL: (id: string) => `${BASE}/pricing/proposals/${id}`,
  PRICING_PROPOSAL_ACTION: (id: string, action: "approve" | "reject") =>
    `${BASE}/pricing/proposals/${id}/${action}`,
  PRICING_HISTORY: `${BASE}/pricing/history`,

  // Promotions
  PROMOTIONS_OVERVIEW: `${BASE}/promotions/overview`,
  PROMOTIONS_CAMPAIGNS: `${BASE}/promotions/campaigns`,
  PROMOTIONS_PRODUCTS: `${BASE}/promotions/products`,

  // Procurement
  PROCUREMENT_OVERVIEW: `${BASE}/procurement/overview`,
  PURCHASE_ORDERS: `${BASE}/purchase-orders`,
  PURCHASE_ORDER: (id: string) => `${BASE}/purchase-orders/${id}`,
  PURCHASE_ORDER_ACTION: (id: string, action: "approve" | "receive") =>
    `${BASE}/purchase-orders/${id}/${action}`,
  SUPPLIERS: `${BASE}/suppliers`,

  // Intelligence
  REPORTS_OVERVIEW: `${BASE}/reports/overview`,
  REPORTS: `${BASE}/reports`,
  REPORT_EXPORT: (id: string) => `${BASE}/reports/${id}/export`,
  REPORTS_SCHEDULES: `${BASE}/reports/schedules`,
  PROFITABILITY: `${BASE}/profitability`,
  PRODUCT_INTELLIGENCE: `${BASE}/product-intelligence`,

  // AI
  AI_CONVERSATIONS: `${BASE}/ai/conversations`,
  AI_CONVERSATION: (id: string) => `${BASE}/ai/conversations/${id}`,
  AI_CONVERSATION_MESSAGES: (id: string) =>
    `${BASE}/ai/conversations/${id}/messages`,
  AI_INSIGHTS: `${BASE}/ai/insights`,

  // Automation
  AUTOMATION_OVERVIEW: `${BASE}/automation/overview`,
  AUTOMATION_RULES: `${BASE}/automation/rules`,
  AUTOMATION_RULE: (id: string) => `${BASE}/automation/rules/${id}`,
  AUTOMATION_RUNS: `${BASE}/automation/runs`,
  AUTOMATION_APPROVAL_ACTION: (id: string, action: "approve" | "dismiss") =>
    `${BASE}/automation/approvals/${id}/${action}`,

  // Settings
  SETTINGS: (module: string) => `${BASE}/settings/${module}`,
  SETTINGS_GSTIN: `${BASE}/settings/gstin`,

  // Shared
  JOB: (id: string) => `${BASE}/jobs/${id}`,
  NOTIFICATIONS: `${BASE}/notifications`,
  NOTIFICATION_READ: (id: string) => `${BASE}/notifications/${id}/read`,
} as const;
