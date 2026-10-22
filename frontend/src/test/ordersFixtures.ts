import type {
  LedgerOrder,
  LedgerPage,
  NextAction,
  NextActions,
  OrderDetail,
  OrderActivityItem,
  OrderDrawerData,
  OrderTimelineEntry,
  OrdersSummary,
  OrdersWorkspace,
} from "@/types/orders";

export const summary = (over: Partial<OrdersSummary> = {}): OrdersSummary => ({
  asOf: "2026-10-20",
  statusCounts: { new: 7, confirmed: 5, picking: 3, packed: 2, ready_to_dispatch: 1, dispatched: 4, in_transit: 6, delivered: 40, cancelled: 2, returned: 1 },
  tabs: { all: 71, needsAttention: 9, new: 7, processing: 11, shipped: 10, delivered: 40, returnsDisputes: 3 },
  sla: { safe: 20, approaching: 4, atRisk: 2, breached: 1, atRiskMinutes: 60, approachingMinutes: 180 },
  today: { orders: 12, newOrders: 4, revenueMinor: 12345600, currency: "INR" },
  pendingDispatchCount: 18,
  avgFulfillmentHours: 20.5,
  cancellationRatePct: 2.8,
  windowDays: 30,
  ...over,
});

export const workspace = (over: Partial<OrdersWorkspace> = {}): OrdersWorkspace => ({
  asOf: "2026-10-20",
  pulse: {
    today: 12,
    stages: [
      { key: "new", count: 4 },
      { key: "confirmed", count: 3 },
      { key: "picking", count: 2 },
      { key: "packed", count: 1 },
      { key: "ready_to_dispatch", count: 1 },
      { key: "dispatched", count: 1 },
      { key: "in_transit", count: 0 },
    ],
  },
  needsAttention: { slaRisk: 2, unprocessed: 7, inventoryIssue: 1, paymentIssue: 0, cancellationRisk: 0, returns: 3 },
  sources: {
    total: 10,
    windowHours: 24,
    items: [
      { channel: { code: "amazon_in", name: "Amazon India" }, orders: 6, sharePct: 60 },
      { channel: { code: "flipkart", name: "Flipkart" }, orders: 4, sharePct: 40 },
    ],
  },
  slaPressure: {
    summary: "2 orders may breach dispatch SLA within the next 60 minutes.",
    reviewHref: "/orders?filter[slaState]=at_risk",
    thresholds: { atRiskMinutes: 60, approachingMinutes: 180 },
    safe: { orders: 20, hintKey: "sla.safe", hint: "more than 3 h" },
    approaching: { orders: 4, hintKey: "sla.approaching", hint: "60 min to 3 h" },
    atRisk: { orders: 2, hintKey: "sla.at_risk", hint: "less than 60 min" },
    breached: { orders: 1, hintKey: "sla.breached", hint: "past the deadline" },
  },
  ...over,
});

export const activity = (): OrderActivityItem[] => [
  { at: "2026-10-20T09:40:00.000Z", orderId: "o1", orderNumber: "ORD-1001", channel: { code: "amazon_in", name: "Amazon India" }, event: "payment_confirmed", text: "Payment confirmed" },
  { at: "2026-10-20T09:30:00.000Z", orderId: "o2", orderNumber: "ORD-1002", channel: { code: "flipkart", name: "Flipkart" }, event: "sla_risk", text: "SLA risk detected" },
];

export const row = (over: Partial<LedgerOrder> = {}): LedgerOrder => ({
  id: "o1",
  number: "ORD-1001",
  marketplace: { code: "amazon_in", name: "Amazon India" },
  customerName: "Asha Rao",
  itemCount: 3,
  lineCount: 2,
  valueMinor: 249950,
  currency: "INR",
  payment: { status: "paid", method: "prepaid" },
  paymentLabel: "Prepaid - Paid",
  fulfillmentStatus: null,
  sla: { state: "safe", dueAt: "2026-10-21T10:00:00.000Z", minutesRemaining: 600, label: "Healthy" },
  status: "new",
  statusLabel: "New",
  placedAt: new Date(Date.now() - 3_600_000).toISOString(),
  rowTone: "none",
  inventoryIssue: null,
  destination: { city: "Pune", state: "MH", pincode: "411001" },
  firstItem: { title: "Cotton Tote Bag", sku: "TOTE-1", imageUrl: null },
  carrier: null,
  warehouse: { id: "w1", name: "Pune Hub" },
  priority: false,
  ...over,
});

export const ledgerPage = (items: LedgerOrder[], over: Partial<LedgerPage> = {}): LedgerPage => ({ items, page: 1, pageSize: 25, total: items.length, pages: 1, ...over });

export const drawer = (over: Partial<OrderDrawerData> = {}): OrderDrawerData => ({
  id: "o1",
  number: "ORD-1001",
  status: "new",
  channel: { code: "amazon_in", name: "Amazon India" },
  placedAt: "2026-10-20T08:00:00.000Z",
  sla: { state: "approaching", dueAt: "2026-10-20T12:00:00.000Z", minutesRemaining: 95, label: "Due in 1 h 35 min", progressPct: 60, stageLabel: "Dispatch is approaching" },
  customer: { name: "Asha Rao", city: "Pune", state: "MH" },
  value: { totalMinor: 249950, currency: "INR", paymentStatus: "paid", paymentMethod: "prepaid" },
  items: { units: 3, lines: [{ title: "Cotton Tote Bag", sku: "TOTE-1", qty: 2 }, { title: "Canvas Pouch", sku: "POUCH-9", qty: 1 }] },
  fulfillment: { warehouse: "Pune Hub", picking: null, fulfillmentId: null, status: null },
  marketplaceStatus: "Amazon India: Unshipped",
  activity: [{ at: "2026-10-20T08:00:00.000Z", text: "Order received" }],
  ...over,
});

export const detail = (over: Partial<OrderDetail> = {}): OrderDetail => ({
  id: "o1",
  orderNumber: "ORD-1001",
  marketplace: "amazon_in",
  externalOrderId: "402-1234567",
  status: "new",
  marketplaceStatus: "Unshipped",
  placedAt: "2026-10-20T08:00:00.000Z",
  currency: "INR",
  subtotalMinor: 230000,
  taxMinor: 11500,
  shippingMinor: 10000,
  discountMinor: 1550,
  totalMinor: 249950,
  customer: { name: "Asha Rao", email: "asha@example.test", phone: "+91 90000 11111" },
  shippingAddress: { line1: "12 Park Street", city: "Pune", state: "MH", pincode: "411001", country: "IN" },
  payment: { method: "prepaid", status: "paid", codAmountMinor: null },
  inventoryStatus: "reserved",
  attentionReason: null,
  warehouseId: "w1",
  tracking: { number: null, carrier: null },
  dispatchedAt: null,
  deliveredAt: null,
  cancelledAt: null,
  cancelReason: null,
  items: [
    { id: "i1", sku: "TOTE-1", title: "Cotton Tote Bag", quantity: 2, reservedQuantity: 2, unitPriceMinor: 100000, taxMinor: 5000, discountMinor: 0, status: "open", variantId: "v1" },
    { id: "i2", sku: "POUCH-9", title: "Canvas Pouch", quantity: 1, reservedQuantity: 0, unitPriceMinor: 30000, taxMinor: 1500, discountMinor: 0, status: "open", variantId: null },
  ],
  version: 4,
  ...over,
});

export const timeline = (): OrderTimelineEntry[] => [
  { id: 1, fromStatus: null, toStatus: "new", marketplaceStatus: "Unshipped", source: "marketplace", applied: true, note: null, createdAt: "2026-10-20T08:00:00.000Z" },
  { id: 2, fromStatus: "new", toStatus: "dispatched", marketplaceStatus: "Shipped", source: "marketplace", applied: false, note: null, createdAt: "2026-10-20T08:30:00.000Z" },
];

const action = (over: Partial<NextAction>): NextAction => ({
  key: "to_confirmed",
  label: "Confirm order",
  kind: "transition",
  method: "POST",
  href: "/api/v1/orders/o1/transition",
  body: { status: "confirmed", version: 4 },
  enabled: true,
  disabledReason: null,
  message: null,
  useInstead: null,
  ...over,
});

export const nextActions = (over: Partial<NextActions> = {}): NextActions => ({
  orderId: "o1",
  orderNumber: "ORD-1001",
  status: "new",
  version: 4,
  managedByFulfillment: false,
  fulfillment: null,
  primaryAction: "to_confirmed",
  actions: [action({}), action({ key: "cancel", label: "Cancel order", kind: "cancel", href: "/api/v1/orders/o1/cancel", body: { reason: "" } })],
  ...over,
});

/** a picking order that follows the warehouse work: the manual steps are refused */
export const managedActions = (): NextActions =>
  nextActions({
    status: "picking",
    managedByFulfillment: true,
    fulfillment: { id: "f1", number: "FUL-1", status: "picking" },
    primaryAction: "open_fulfillment",
    actions: [
      action({
        key: "to_packed",
        label: "Mark as packed",
        body: { status: "packed", version: 4 },
        enabled: false,
        disabledReason: "managed_by_fulfillment",
        message: "This order is being fulfilled: its status follows the warehouse work (pick, pack, ship). Use the fulfillment actions instead.",
        useInstead: { key: "open_fulfillment", href: "/api/v1/fulfillments/f1" },
      }),
      action({ key: "cancel", label: "Cancel order", kind: "cancel", href: "/api/v1/orders/o1/cancel", body: { reason: "" } }),
      action({ key: "open_fulfillment", label: "Open fulfillment", kind: "fulfillment", method: "GET", href: "/api/v1/fulfillments/f1", body: null }),
    ],
  });
