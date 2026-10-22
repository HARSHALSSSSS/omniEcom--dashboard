/** The Orders contract: shapes of GET /orders/{summary,workspace,ledger,{id},{id}/drawer,{id}/next-actions,...}. Money is integer minor units (paise). */

export const ORDER_STATUSES = [
  "new",
  "confirmed",
  "picking",
  "packed",
  "ready_to_dispatch",
  "dispatched",
  "in_transit",
  "delivered",
  "cancelled",
  "returned",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SLA_STATES = ["safe", "approaching", "at_risk", "breached", "none"] as const;
export type SlaState = (typeof SLA_STATES)[number];

export const ORDER_TABS = ["all", "needs_attention", "new", "processing", "shipped", "delivered", "returns_disputes"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

/** a payment method (prepaid, cod) or a payment status (paid, pending, failed): the API takes either under `filter[payment]` */
export const PAYMENT_FILTERS = ["prepaid", "cod", "paid", "pending", "failed"] as const;
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number];

/** the "needs attention" chips; each is one SQL predicate shared by the ledger filter and the workspace counters */
export const ATTENTION_KEYS = ["sla_risk", "unprocessed", "inventory_issue", "payment_issue", "cancellation_risk", "delayed", "returns", "disputes"] as const;
export type AttentionKey = (typeof ATTENTION_KEYS)[number];

/** the latest fulfillment status of an order, or `none` before a fulfillment exists */
export const FULFILLMENT_FILTERS = [
  "none",
  "confirmed",
  "picking",
  "picked",
  "packing",
  "packed",
  "ready_to_ship",
  "on_hold",
  "shipped",
  "in_transit",
  "delivered",
  "delivery_failed",
  "cancelled",
] as const;
export type FulfillmentFilter = (typeof FULFILLMENT_FILTERS)[number];

/** a day in the business time zone */
export const DATE_FILTERS = ["today", "yesterday"] as const;
export type DateFilter = (typeof DATE_FILTERS)[number];

/** `-placedAt` is the API default */
export const ORDER_SORTS = ["-placedAt", "placedAt", "-value", "value", "sla", "-sla"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

export interface MarketplaceRef {
  code: string;
  name: string;
}

export interface OrdersSummary {
  asOf: string;
  statusCounts: Record<OrderStatus, number>;
  tabs: { all: number; needsAttention: number; new: number; processing: number; shipped: number; delivered: number; returnsDisputes: number };
  sla: { safe: number; approaching: number; atRisk: number; breached: number; atRiskMinutes: number; approachingMinutes: number };
  today: { orders: number; newOrders: number; revenueMinor: number; currency: string };
  pendingDispatchCount: number;
  avgFulfillmentHours: number | null;
  cancellationRatePct: number | null;
  windowDays: number;
}

export const PIPELINE_STAGES = ["new", "confirmed", "picking", "packed", "ready_to_dispatch", "dispatched", "in_transit"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface SlaBand {
  orders: number;
  hintKey: string;
  hint: string;
}

/** GET /orders/workspace: the top of the screen in one call */
export interface OrdersWorkspace {
  asOf: string;
  /** orders placed on `asOf` (business time zone) by their current status */
  pulse: { today: number; stages: Array<{ key: PipelineStage; count: number }> };
  needsAttention: { slaRisk: number; unprocessed: number; inventoryIssue: number; paymentIssue: number; cancellationRisk: number; returns: number };
  /** orders placed in the last `windowHours` hours, per marketplace */
  sources: { total: number; windowHours: number; items: Array<{ channel: MarketplaceRef; orders: number; sharePct: number }> };
  slaPressure: {
    summary: string;
    reviewHref: string;
    thresholds: { atRiskMinutes: number; approachingMinutes: number };
    safe: SlaBand;
    approaching: SlaBand;
    atRisk: SlaBand;
    breached: SlaBand;
  };
}

export type OrderActivityEvent = "payment_confirmed" | "ready_to_dispatch" | "picking_started" | "sla_risk" | "return_requested";

/** GET /orders/activity */
export interface OrderActivityItem {
  at: string;
  orderId: string;
  orderNumber: string;
  channel: MarketplaceRef;
  event: OrderActivityEvent;
  text: string;
}

/** a saved view of the Orders screen (GET/POST /views, screen "orders") */
export interface OrderSavedView {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  sort: string | null;
  shared: boolean;
  mine: boolean;
  canEdit: boolean;
}

export interface LedgerSla {
  state: SlaState;
  dueAt: string | null;
  minutesRemaining: number | null;
  label: string | null;
}

export interface LedgerOrder {
  id: string;
  number: string;
  marketplace: MarketplaceRef;
  customerName: string | null;
  /** units on the order */
  itemCount: number;
  /** order lines */
  lineCount: number;
  valueMinor: number;
  currency: string;
  payment: { status: string; method: string };
  paymentLabel: string;
  fulfillmentStatus: string | null;
  sla: LedgerSla;
  status: OrderStatus;
  statusLabel: string;
  placedAt: string;
  rowTone: "red" | "amber" | "green" | "none";
  inventoryIssue: { productTitle: string; sku: string; required: number; available: number; action: "allocate" | "restock" | "map_sku" } | null;
  destination: { city: string | null; state: string | null; pincode: string | null };
  firstItem: { title: string; sku: string; imageUrl: string | null } | null;
  carrier: { name: string | null; trackingNumber: string | null } | null;
  warehouse: { id: string; name: string } | null;
  priority: boolean;
}

export interface LedgerPage {
  items: LedgerOrder[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

/** what the ledger and the export are filtered by (the API's `filter[...]` parameters) */
export interface OrderFilters {
  q?: string;
  tab?: OrderTab;
  marketplace?: string[];
  status?: OrderStatus[];
  slaState?: SlaState[];
  payment?: PaymentFilter;
  fulfillment?: FulfillmentFilter[];
  attention?: AttentionKey[];
  date?: DateFilter;
}

export interface LedgerQuery extends OrderFilters {
  sort?: OrderSort;
  page?: number;
  pageSize?: number;
}

export interface OrderLine {
  id: string;
  sku: string;
  title: string;
  quantity: number;
  reservedQuantity: number;
  unitPriceMinor: number;
  taxMinor: number;
  discountMinor: number;
  status: string;
  variantId: string | null;
}

/** GET /orders/{id} */
export interface OrderDetail {
  id: string;
  orderNumber: string;
  marketplace: string;
  externalOrderId: string;
  status: OrderStatus;
  marketplaceStatus: string | null;
  placedAt: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  shippingMinor: number;
  discountMinor: number;
  totalMinor: number;
  customer: Record<string, unknown>;
  shippingAddress: Record<string, unknown>;
  payment: { method: "prepaid" | "cod" | "unknown"; status: string; codAmountMinor: number | null };
  inventoryStatus: string;
  attentionReason: string | null;
  warehouseId: string | null;
  tracking: { number: string | null; carrier: string | null };
  dispatchedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  items: OrderLine[];
  version: number;
}

export interface OrderTimelineEntry {
  id: number;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  marketplaceStatus: string | null;
  source: string;
  applied: boolean;
  note: string | null;
  createdAt: string;
}

/** GET /orders/{id}/drawer */
export interface OrderDrawerData {
  id: string;
  number: string;
  status: OrderStatus;
  channel: MarketplaceRef;
  placedAt: string;
  sla: LedgerSla & { progressPct: number | null; stageLabel: string };
  customer: { name: string | null; city: string | null; state: string | null };
  value: { totalMinor: number; currency: string; paymentStatus: string; paymentMethod: string };
  items: { units: number; lines: Array<{ title: string; sku: string; qty: number }> };
  fulfillment: { warehouse: string | null; picking: "pending" | "in_progress" | "done" | null; fulfillmentId: string | null; status: string | null };
  marketplaceStatus: string | null;
  activity: Array<{ at: string; text: string }>;
}

export type NextActionKind = "transition" | "cancel" | "allocate" | "fulfillment";

export interface NextAction {
  key: string;
  label: string;
  kind: NextActionKind;
  method: "GET" | "POST";
  href: string;
  body: Record<string, unknown> | null;
  enabled: boolean;
  disabledReason: string | null;
  message: string | null;
  useInstead: { key: string; href: string } | null;
}

export interface NextActions {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  version: number;
  managedByFulfillment: boolean;
  fulfillment: { id: string; number: string; status: string } | null;
  primaryAction: string | null;
  actions: NextAction[];
}

export interface StatusUpdate {
  id: string;
  requestedStatus: OrderStatus;
  status: "requested" | "sent" | "successful" | "failed" | "retrying" | "skipped";
  errorMessage: string | null;
}

export interface TransitionResult {
  order: OrderDetail;
  statusUpdate: StatusUpdate;
}

export interface TransitionInput {
  id: string;
  status: OrderStatus;
  /** the version the caller saw: a stale one is a 409 VERSION_CONFLICT */
  version: number;
  tracking?: { number?: string; carrier?: string };
}

export interface CancelInput {
  id: string;
  reason: string;
  reasonCode: string;
}

export interface CancellationReason {
  code: string;
  label: string;
  initiators: string[];
}

export type BulkOrderAction = "confirm" | "cancel" | "assign_warehouse" | "mark_priority";

export interface BulkOrderParams {
  reason?: string;
  reasonCode?: string;
  warehouseId?: string;
  priority?: boolean;
}

export interface BulkOrderResult {
  orderId: string;
  orderNumber: string | null;
  ok: boolean;
  changed: boolean;
  status: string | null;
  error?: { code: string; message: string; rule?: string };
}

export interface BulkOrdersResponse {
  action: BulkOrderAction;
  total: number;
  succeeded: number;
  failed: number;
  results: BulkOrderResult[];
}

/** a connected marketplace account (an order-sync target) */
export interface OrderAccount {
  id: string;
  marketplace: string;
  displayName: string;
  status: string;
}

export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
}

export interface SyncJob {
  id: string;
  status: "queued" | "running" | "retrying" | "succeeded" | "partially_failed" | "failed" | "dead_lettered" | "cancelled";
  error: { code: string; message: string } | null;
}

export interface SyncOrdersResult {
  job: SyncJob;
  alreadyQueued: boolean;
}

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}
