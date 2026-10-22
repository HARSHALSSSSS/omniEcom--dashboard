import type {
  DecisionItem,
  DecisionPage,
  ExceptionsReport,
  MethodsOverview,
  ShippingMethod,
  ShippingOptions,
  ShippingOverview,
  ShippingRule,
  TrackingItem,
  TrackingPage,
} from "@/types/shipping";

export const method = (over: Partial<ShippingMethod> = {}): ShippingMethod => ({
  id: "m1",
  kind: "third_party",
  name: "Delhivery",
  label: "Delhivery",
  providerCode: "delhivery",
  channel: null,
  provider: { code: "delhivery", label: "Delhivery" },
  state: "configured",
  active: true,
  isDefault: true,
  preferredFor: ["*"],
  lastSyncAt: "2026-10-20T08:00:00.000Z",
  supportedOrderTypes: ["prepaid", "cod"],
  capabilities: { label: "supported", tracking: "supported", dispatchUpdate: "supported", statusSync: "supported" },
  verification: { state: "verified", verifiedAt: "2026-10-20T08:00:00.000Z" },
  config: {},
  version: 1,
  createdAt: "2026-10-01T08:00:00.000Z",
  ...over,
});

export const SELLER = method({
  id: "m2",
  kind: "seller",
  name: "Seller Shipping",
  label: "Seller Shipping",
  providerCode: "seller",
  provider: null,
  state: "requires_configuration",
  isDefault: false,
  preferredFor: [],
  verification: { state: "unverified", verifiedAt: null },
  capabilities: { label: "requires_configuration", tracking: "requires_configuration", dispatchUpdate: "requires_configuration", statusSync: "requires_configuration" },
});

export const methodsOverview = (over: Partial<MethodsOverview> = {}): MethodsOverview => ({
  items: [method(), SELLER],
  capabilityMatrix: [
    { methodId: "m1", method: "third_party", name: "Delhivery", label: "supported", tracking: "supported", dispatchUpdate: "supported", statusSync: "supported" },
    { methodId: "m2", method: "seller", name: "Seller Shipping", label: "requires_configuration", tracking: "requires_configuration", dispatchUpdate: "requires_configuration", statusSync: "not_supported" },
  ],
  summary: "1 active method",
  activeMethods: 2,
  ...over,
});

export const overview = (over: Partial<ShippingOverview> = {}): ShippingOverview => ({
  asOf: "2026-10-21T10:00:00.000Z",
  generatedAt: "2026-10-21T10:00:00.000Z",
  baseline: "2026-10-21T08:00:00.000Z",
  comparison: { source: "snapshot", at: "2026-10-21T08:00:00.000Z", windowHours: 2 },
  statusLine: { connectedChannels: 2, activeMethods: 2, ordersNeedAttention: 3 },
  pulse: {
    readyToShip: { count: 12, sinceLastSync: 4, needDecision: 2 },
    shippingSelected: { count: 7, sinceLastSync: 0, note: "preference_confirmed" },
    labelReady: { count: 5, sinceLastSync: 1, labelUnavailable: 1 },
    dispatched: { count: 3, sinceLastSync: 0 },
    inTransit: { count: 21, sinceLastSync: -2, trackingIssues: 1 },
  },
  decisionField: [
    {
      fulfillmentId: "f1",
      order: { id: "o1", number: "ORD-2001" },
      channel: { code: "amazon_in", name: "Amazon India" },
      warehouse: { id: "w1", code: "PUN", name: "Pune WH" },
      itemCount: 2,
      weightGrams: 1200,
      availableMethods: [
        { kind: "marketplace", name: "Amazon India Shipping", available: true },
        { kind: "seller", name: "Seller Shipping", available: false, reason: "not_configured" },
      ],
      merchantPreference: { kind: "marketplace", name: "Amazon India Shipping", why: "default_for_channel", whyText: "Default for the channel" },
      selected: { kind: "marketplace", name: "Amazon India Shipping", confirmed: true },
    },
  ],
  availabilityComparison: [
    { channel: { code: "amazon_in", name: "Amazon India" }, method: "marketplace", provider: "Amazon India Shipping", methodId: "m9", availability: "ready", default: "preferred", override: "where_supported" },
    { channel: { code: "amazon_in", name: "Amazon India" }, method: "seller", provider: "Seller Shipping", methodId: "m2", availability: "requires_configuration", default: "not_set", override: "verify_capability" },
    { channel: { code: "flipkart", name: "Flipkart" }, method: "third_party", provider: "Third-party provider", methodId: null, availability: "unavailable", default: "not_set", override: "unavailable" },
  ],
  attention: { total: 3, parts: { undecided: 2, label: 1, tracking: 0, sync: 1, slaRisk: 0, capability: 0 } },
  ...over,
});

export const decision = (over: Partial<DecisionItem> = {}): DecisionItem => ({
  fulfillmentId: "f1",
  fulfillmentNumber: "FUL-1",
  orderId: "o1",
  number: "ORD-2001",
  channel: { code: "amazon_in", name: "Amazon India" },
  warehouse: { id: "w1", code: "PUN", name: "Pune WH" },
  destination: { city: "Pune", state: "Maharashtra" },
  valueMinor: 189900,
  currency: "INR",
  weightGrams: 650,
  itemCount: 1,
  availableMethods: [
    { kind: "marketplace", name: "Amazon India Shipping", available: true },
    { kind: "seller", name: "Seller Shipping", available: true },
  ],
  selectedMethod: null,
  selectionConfirmed: false,
  selectedBy: null,
  recommendedMethod: { kind: "marketplace", name: "Amazon India Shipping", why: "Default", source: "default_preference" },
  sla: { dueAt: "2026-10-21T12:00:00.000Z", minutesRemaining: 130, band: "approaching" },
  status: "needs_decision",
  shipmentId: null,
  action: { key: "choose", label: "Choose shipping", method: "GET", href: "/api/v1/shipping/orders/f1/options", enabled: true },
  pickup: { state: "not_applicable", methodId: null, warehouseId: "w1", slot: null },
  secondaryActions: [],
  ...over,
});

export const decisionPage = (items: DecisionItem[], over: Partial<DecisionPage> = {}): DecisionPage => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  pages: 1,
  counts: { readyToShip: items.length, needs_decision: items.length, selected: 0, label_pending: 0, ready_to_dispatch: 0, exception: 0 },
  ...over,
});

export const options = (over: Partial<ShippingOptions> = {}): ShippingOptions => ({
  fulfillmentId: "f1",
  orderId: "o1",
  status: "needs_decision",
  order: {
    number: "ORD-2001",
    marketplace: { code: "amazon_in", name: "Amazon India" },
    destination: { city: "Pune", state: "Maharashtra", pincode: "411001" },
    warehouse: { id: "w1", code: "PUN", name: "Pune WH" },
    product: "Cotton cushion",
    sku: "CUS-014",
    skus: ["CUS-014"],
    itemCount: 1,
    weightGrams: 650,
    valueMinor: 189900,
    currency: "INR",
  },
  options: [
    { kind: "marketplace", name: "Amazon India Shipping", recommended: true, available: true, managedBy: "marketplace", providerId: null, providers: [], selected: false },
    { kind: "seller", name: "Seller Shipping", recommended: false, available: true, managedBy: "merchant", providerId: null, providers: [], selected: false },
    { kind: "third_party", name: "Third-party provider", recommended: false, available: false, managedBy: "provider", providerId: null, providers: [], selected: false, reason: "not_configured" },
  ],
  recommendation: { kind: "marketplace", providerId: null, name: "Amazon India Shipping", why: "Matches your default preference for Amazon India orders.", source: "channel_override", ruleId: null },
  selection: null,
  ...over,
});

export const trackingItem = (over: Partial<TrackingItem> = {}): TrackingItem => ({
  shipmentId: "s1",
  orderId: "o1",
  number: "ORD-1001",
  channel: { code: "amazon_in", name: "Amazon India" },
  method: { kind: "third_party", name: "Delhivery", providerCode: "delhivery" },
  awb: "DL100001",
  carrier: "Delhivery",
  dispatchedAt: "2026-10-19T08:00:00.000Z",
  status: "in_transit",
  shipmentStatus: "in_transit",
  lastUpdateAt: "2026-10-20T08:00:00.000Z",
  estimatedDeliveryAt: "2026-10-23T12:00:00.000Z",
  attention: "none",
  ...over,
});

export const trackingPage = (items: TrackingItem[], over: Partial<TrackingPage> = {}): TrackingPage => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  pages: 1,
  counters: { stages: { dispatched: 1, inTransit: 2, delivered: 3 }, byStatus: {} },
  ...over,
});

export const exceptionsReport = (over: Partial<ExceptionsReport> = {}): ExceptionsReport => ({
  categories: [
    {
      key: "no_method_selected",
      title: "No shipping method selected",
      count: 2,
      orders: [
        { orderId: "o1", number: "ORD-2001", fulfillmentId: "f1", shipmentId: null, channel: { code: "amazon_in", name: "Amazon India" }, detail: null, action: { key: "choose_shipping", label: "Choose shipping", method: "GET", href: "/x" } },
        { orderId: "o2", number: "ORD-2002", fulfillmentId: "f2", shipmentId: null, channel: { code: "amazon_in", name: "Amazon India" }, detail: null, action: { key: "choose_shipping", label: "Choose shipping", method: "GET", href: "/x" } },
      ],
      whatHappened: "These orders are packed but no shipping method has been confirmed.",
      why: "A method has to be confirmed before a label can be created.",
      whatCanIDoNow: "Open the order and confirm the recommended method.",
      action: { key: "choose_shipping", label: "Choose shipping", method: "GET", href: "/x" },
    },
    {
      key: "shipping_sync_failed",
      title: "Shipping sync failed",
      count: 1,
      orders: [{ orderId: "o3", number: "ORD-2003", fulfillmentId: null, shipmentId: "s3", channel: { code: "amazon_in", name: "Amazon India" }, detail: "timeout", action: { key: "retry_sync", label: "Retry sync", method: "POST", href: "/y" } }],
      whatHappened: "The latest tracking status could not be fetched for these shipments.",
      why: "Possible connector timeout.",
      whatCanIDoNow: "Retry the sync.",
      action: { key: "retry_sync", label: "Retry sync", method: "POST", href: "/y" },
    },
  ],
  totalOrders: 3,
  categoryCount: 2,
  total: 3,
  ...over,
});

export const rule = (over: Partial<ShippingRule> = {}): ShippingRule => ({
  id: "r1",
  name: "Amazon · Pune preference",
  description: null,
  status: "enabled",
  priority: 1,
  lastUpdatedAt: "2026-10-20T08:00:00.000Z",
  ordersAffected: 18,
  conditions: [
    { combinator: "if", field: "marketplace", op: "eq", value: "amazon_in" },
    { combinator: "and", field: "orderValueMinor", op: "gt", value: 100000 },
  ],
  then: { prefer: { kind: "third_party", providerId: "m1", label: "Delhivery" } },
  version: 1,
  ...over,
});
