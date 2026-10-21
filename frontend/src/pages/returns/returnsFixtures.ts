import type { InsightsData, LedgerPage, LedgerRow, NextAction, NextActions, ReturnDetail, ReturnOrder, ReturnsSummary, TabCounts } from "@/types/returns";

export const summary = (over: Partial<ReturnsSummary> = {}): ReturnsSummary => ({
  window: { days: 30, since: "2026-09-20T00:00:00.000Z" },
  requests: { total: 42, today: 3, open: 11 },
  pendingInspections: { count: 5, overdue: 2, overdueAfterHours: 24 },
  returnRate: { percent: 4.8, returnedOrders: 40, orders: 833, previousPercent: 5.2, deltaPoints: -0.4 },
  refundExposure: { count: 7, amountMinor: 539800, currency: "INR", actionableCount: 3, mixedCurrencies: false, byCurrency: [{ currency: "INR", count: 7, amountMinor: 539800 }] },
  stages: [
    { stage: "requested", label: "Requested", count: 4 },
    { stage: "approved", label: "Approved", count: 2 },
    { stage: "in_transit", label: "In transit", count: 1 },
    { stage: "received", label: "Received", count: 3 },
    { stage: "inspecting", label: "Inspecting", count: 2 },
    { stage: "resolution", label: "Resolution", count: 6 },
    { stage: "refunded", label: "Refunded", count: 1 },
    { stage: "closed", label: "Closed", count: 20 },
    { stage: "rejected", label: "Rejected", count: 2 },
    { stage: "cancelled", label: "Cancelled", count: 1 },
  ],
  ...over,
});

export const tabCounts = (over: Partial<TabCounts> = {}): TabCounts => ({ all: 42, needs_attention: 8, awaiting_receipt: 3, awaiting_inspection: 5, refund_pending: 6, completed: 20, ...over });

export const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  id: "r1",
  number: "RET-0001",
  orderId: "o1",
  orderNumber: "#1042",
  product: { title: "Cotton Kurta", sku: "KUR-RED-M", itemCount: 2 },
  channel: { code: "shopify", name: "Shopify" },
  reason: { code: "size_fit", label: "Size / fit issue" },
  quantity: 2,
  receivedQuantity: 0,
  status: "requested",
  displayStatus: "Requested",
  stage: "requested",
  stageLabel: "Requested",
  requestedAt: "2026-10-18T08:00:00.000Z",
  receivedAt: null,
  inspection: { status: "not_started", inspector: null },
  refund: { status: "pending", amountMinor: 299900, currency: "INR", source: null },
  disposition: "pending",
  customer: { name: "Asha Rao", email: "a***@example.com" },
  signals: [],
  ...over,
});

export const ledgerPage = (items: LedgerRow[], over: Partial<LedgerPage> = {}): LedgerPage => ({ items, page: 1, pageSize: 25, total: items.length, pages: 1, ...over });

export const insights = (over: Partial<InsightsData> = {}): InsightsData => ({
  window: { days: 30, since: "2026-09-20T00:00:00.000Z", returns: 40 },
  reasons: [
    { code: "size_fit", label: "Size / fit issue", count: 22, sharePercent: 55 },
    { code: "defective", label: "Defective / not working", count: 10, sharePercent: 25 },
  ],
  topSkus: [{ sku: "KUR-RED-M", title: "Cotton Kurta", returns: 9, unitsReturned: 12, unitsSold: 80, returnRatePercent: 15 }],
  channels: [{ code: "shopify", returns: 30, sharePercent: 75 }],
  trend: {
    granularity: "day",
    points: [
      { date: "2026-10-18", returns: 0, units: 0 },
      { date: "2026-10-19", returns: 4, units: 5 },
    ],
  },
  ...over,
});

export const detail = (over: Partial<ReturnDetail> = {}): ReturnDetail => ({
  header: { id: "r1", number: "RET-0001", status: "requested", displayStatus: "Requested", orderId: "o1", orderNumber: "#1042", channel: { code: "shopify", name: "Shopify" }, customerName: "Asha Rao", source: "customer" },
  product: { title: "Cotton Kurta", sku: "KUR-RED-M", itemCount: 1, quantity: 2, reason: "Size / fit issue", receivedAt: null },
  details: {
    orderNumber: "#1042",
    externalOrderId: "9981",
    customer: { name: "Asha Rao", email: "asha@example.com" },
    quantity: { expected: 2, received: 0 },
    reason: { code: "size_fit", label: "Size / fit issue", text: "Too small" },
    dates: { requestedAt: "2026-10-18T08:00:00.000Z", approvedAt: null, receivedAt: null, completedAt: null },
  },
  receipt: { expected: 2, received: 0, match: "matched", mismatch: null },
  currentState: { inspection: { status: "not_started", inspector: null }, refund: { status: "pending", amountMinor: 299900, currency: "INR", source: null, error: null }, disposition: "pending" },
  timeline: [
    { step: "requested", status: "complete", actor: { id: null, name: "Customer via Shopify", kind: "customer" }, at: "2026-10-18T08:00:00.000Z", note: "Too small" },
    { step: "approved", status: "pending", actor: null, at: null, note: "Awaiting approval" },
    { step: "received", status: "pending", actor: null, at: null, note: "Awaiting receipt" },
    { step: "inspection", status: "pending", actor: null, at: null, note: "Unassigned" },
    { step: "refund", status: "pending", actor: null, at: null, note: "Awaiting inspection decision" },
    { step: "disposition", status: "pending", actor: null, at: null, note: "Operator decision" },
    { step: "closed", status: "pending", actor: null, at: null, note: "Requires refund and disposition resolution" },
  ],
  ...over,
});

export const order = (over: Partial<ReturnOrder> = {}): ReturnOrder => ({
  id: "r1",
  number: "RET-0001",
  status: "requested",
  stage: "requested",
  stageLabel: "Requested",
  warehouseId: null,
  pickup: { status: "not_required", awb: null, scheduledAt: null },
  refund: { status: "pending", amountMinor: 299900, currency: "INR", source: null, error: null, reference: null, refundedAt: null },
  items: [{ id: "i1", orderItemId: "oi1", sku: "KUR-RED-M", quantity: 2, receivedQuantity: 0, dispositionedQuantity: 0, restockedQuantity: 0, condition: null, disposition: null, notes: null }],
  ...over,
});

const BASE = "/api/v1/returns/r1";
const step = (key: NextAction["key"], label: string, href: string, over: Partial<NextAction> = {}): NextAction => ({
  key,
  label,
  method: "POST",
  href: `${BASE}/${href}`,
  permission: key === "refund" ? "returns:refund" : "returns:write",
  done: false,
  enabled: false,
  disabledReason: "Not yet",
  inputs: [],
  ...over,
});

/** a return that was just requested: only approve is open */
export const nextActions = (over: Partial<NextActions> = {}, patch: Partial<Record<NextAction["key"], Partial<NextAction>>> = {}): NextActions => {
  const actions: NextAction[] = [
    step("approve", "Approve return", "approve", {
      enabled: true,
      disabledReason: null,
      inputs: [
        { name: "note", type: "string", required: false },
        { name: "warehouseId", type: "uuid", required: false, note: "warehouse that should receive the goods" },
      ],
      ...patch.approve,
    }),
    step("receive", "Receive goods", "receive", {
      disabledReason: "Approve the return first",
      inputs: [
        { name: "warehouseId", type: "uuid", required: true, default: "w1" },
        { name: "items", type: "array", required: true, default: [{ returnItemId: "i1", sku: "KUR-RED-M", quantity: 2 }] },
      ],
      ...patch.receive,
    }),
    step("inspection", "Inspect goods", "inspection", {
      disabledReason: "Receive the goods first",
      inputs: [
        { name: "result", type: "enum", required: true, options: [{ value: "pass", label: "Pass" }, { value: "fail", label: "Fail" }, { value: "needs_review", label: "Needs review" }] },
        { name: "checklist", type: "array", required: true },
        { name: "note", type: "string", required: false },
      ],
      ...patch.inspection,
    }),
    step("disposition", "Choose disposition", "disposition", {
      disabledReason: "Receive the goods first",
      inputs: [
        {
          name: "kind",
          type: "enum",
          required: true,
          default: "sellable",
          note: "Inspection passed",
          options: [
            { value: "sellable", label: "Return to sellable stock", description: "Suitable for resale" },
            { value: "damaged", label: "Damaged", description: "Keep out of sellable stock" },
            { value: "quarantine", label: "Quarantine", description: "Hold until further review" },
          ],
        },
      ],
      ...patch.disposition,
    }),
    step("refund", "Refund customer", "refund", {
      disabledReason: "Receive and inspect the return first",
      inputs: [
        { name: "mode", type: "enum", required: true, default: "manual", options: [{ value: "manual", label: "Record manually" }, { value: "connector", label: "Ask shopify to refund" }] },
        { name: "amountMinor", type: "integer", required: false, default: 299900, note: "at most the order total (350000)" },
        { name: "reference", type: "string", required: false },
      ],
      ...patch.refund,
    }),
    step("complete", "Complete return", "complete", {
      disabledReason: "Receive the goods first",
      inputs: [{ name: "acceptShort", type: "enum", required: false, options: [{ value: "true", label: "Accept missing units" }], note: "1 unit(s) never arrived" }],
      ...patch.complete,
    }),
  ];
  return { returnId: "r1", number: "RET-0001", status: "requested", stage: "requested", stageLabel: "Requested", next: "approve", actions, ...over };
};
