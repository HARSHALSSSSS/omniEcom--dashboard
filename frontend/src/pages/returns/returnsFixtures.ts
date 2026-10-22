import type { AttentionList, DispositionOptions, InsightsData, InspectionView, LedgerPage, LedgerRow, NextAction, NextActions, RefundQueue, RefundView, ReturnDetail, ReturnOrder, ReturnsAnalytics, ReturnsOverview, ReturnsSummary, TabCounts } from "@/types/returns";

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
  action: { key: "view", href: "/api/v1/returns/r1/detail" },
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

export const overview = (over: Partial<ReturnsOverview> = {}): ReturnsOverview => ({
  statusLine: { open: 11, awaitingInspection: 5, refundsPending: 3 },
  createReturn: { available: true, reason: null, allowedChannels: ["shopify"] },
  stages: {
    requested: { count: 4, hint: "to_review" },
    approved: { count: 2, hint: "authorized" },
    inTransit: { count: 1, hint: "await_receipt" },
    received: { count: 3, hint: "verify_stock" },
    inspecting: { count: 2, needReview: 1 },
    resolution: { count: 6, refundPending: 4 },
    refunded: { count: 1, hint: "disposition" },
    closed: { count: 20, window: "30d" },
  },
  stagesNote: "Stage counts are independent operational queues; closed totals cover the last 30 days.",
  attention: [
    { key: "awaiting_inspection", count: 5 },
    { key: "refunds_pending", count: 3 },
    { key: "inventory_discrepancy", count: 1 },
  ],
  ...over,
});

export const analytics = (over: Partial<ReturnsAnalytics> = {}): ReturnsAnalytics => ({
  window: { returns: 40, days: 30, sample: 100 },
  reasons: [
    { code: "size_fit", label: "Size / fit issue", count: 22, sharePct: 55 },
    { code: "defective", label: "Defective / not working", count: 10, sharePct: 25 },
  ],
  concentration: { products: 2, text: "Return activity is concentrated around 2 products." },
  intelligence: [
    { kind: "reason_spike", text: "55% of recent returns mention a sizing issue.", evidence: "22 of the last 40 returns. Cotton Kurta KUR-RED-M accounts for 12 of those mentions.", action: { key: "review_size_chart", label: "Review size chart", href: "/products?sku=KUR-RED-M" } },
  ],
  recommendationOnly: true,
  note: "Recommendations only. This never changes listings, inventory, or refund decisions.",
  ...over,
});

export const attention = (over: Partial<AttentionList> = {}): AttentionList => ({
  total: 2,
  items: [
    { returnId: "r2", number: "RET-0002", orderNumber: "#1043", issue: "refund_pending", signals: ["refund_pending"], impact: "Refund failed, 1500.00 INR", recommendedAction: { text: "Review connector failure", href: "/api/v1/returns/r2/refund" } },
    { returnId: "r1", number: "RET-0001", orderNumber: "#1042", issue: "inspection_overdue", signals: ["inspection_overdue"], impact: "Received 2026-10-17, inspection not started", recommendedAction: { text: "Start inspection", href: "/api/v1/returns/r1/inspection" } },
  ],
  ...over,
});

export const refundQueue = (over: Partial<RefundQueue> = {}): RefundQueue => ({
  items: [
    {
      returnId: "r2",
      number: "RET-0002",
      orderNumber: "#1043",
      channel: { code: "mock", name: "Sandbox" },
      product: { title: "Scarf", sku: "SCF-1" },
      refund: { status: "failed", amountMinor: 150000, currency: "INR", source: "connector", error: "Gateway declined" },
      returnStatus: "inspecting",
      inspectionStatus: "passed",
      lastUpdateAt: "2026-10-19T09:30:00.000Z",
      action: { key: "review_failure", href: "/api/v1/returns/r2/refund" },
    },
    {
      returnId: "r1",
      number: "RET-0001",
      orderNumber: "#1042",
      channel: { code: "shopify", name: "Shopify" },
      product: { title: "Cotton Kurta", sku: "KUR-RED-M" },
      refund: { status: "ready", amountMinor: 299900, currency: "INR", source: null, error: null },
      returnStatus: "inspecting",
      inspectionStatus: "failed",
      lastUpdateAt: "2026-10-19T08:00:00.000Z",
      action: { key: "review_refund", href: "/api/v1/returns/r1/refund" },
    },
  ],
  page: 1,
  pageSize: 25,
  total: 2,
  pages: 1,
  counts: { pending: 0, ready: 1, processing: 0, failed: 1 },
  ...over,
});

export const refundView = (over: Partial<RefundView> = {}): RefundView => ({
  returnId: "r1",
  number: "RET-0001",
  orderId: "o1",
  orderNumber: "#1042",
  channel: { code: "shopify", name: "Shopify" },
  product: { title: "Cotton Kurta", sku: "KUR-RED-M" },
  quantity: 2,
  refund: { status: "ready", amountMinor: 299900, currency: "INR", source: null, reference: null, error: null, refundedAt: null, lastUpdateAt: "2026-10-19T08:00:00.000Z", amountFrom: "order" },
  returnStatus: "inspecting",
  inspectionStatus: "passed",
  actionable: true,
  timeline: [
    { step: "requested", status: "complete", actor: { id: null, name: "Customer via Shopify" }, at: "2026-10-18T08:00:00.000Z", note: null },
    { step: "approved", status: "complete", actor: { id: "u1", name: "Ravi" }, at: "2026-10-19T08:00:00.000Z", note: null },
    { step: "processing", status: "pending", actor: null, at: null, note: null },
    { step: "completed", status: "pending", actor: null, at: null, note: "No connector completion received" },
  ],
  note: "Return approval is not refund approval. Inspect and decide before proceeding with a supported refund action.",
  ...over,
});

export const inspectionView = (over: Partial<InspectionView> = {}): InspectionView => ({
  returnId: "r1",
  number: "RET-0001",
  status: "not_started",
  inspector: null,
  startedAt: null,
  systemCondition: "receipt_matched",
  quantity: { expected: 2, received: 2 },
  latest: null,
  history: [],
  note: "Inspection does not approve a refund or select a disposition.",
  ...over,
});

export const dispositionOptions = (over: Partial<DispositionOptions> = {}): DispositionOptions => ({
  returnId: "r1",
  number: "RET-0001",
  inspectionStatus: "passed",
  recommendation: { kind: "sellable", reason: "Inspection passed", suggestedOnly: true },
  options: [
    { kind: "sellable", label: "Return to sellable stock", description: "Suitable for resale" },
    { kind: "damaged", label: "Damaged", description: "Keep out of sellable stock" },
    { kind: "rejected", label: "Rejected", description: "Do not accept into stock" },
    { kind: "quarantine", label: "Quarantine", description: "Hold until further review" },
    { kind: "repair", label: "Repair", description: "Repair before resale" },
    { kind: "write_off", label: "Write-off", description: "Should not return to inventory" },
  ],
  undecidedUnits: 2,
  decided: [],
  canConfirm: true,
  blockedReason: null,
  note: "No option is selected. The operator must explicitly confirm the disposition before stock can move.",
  ...over,
});
