/** Shapes of the Returns API (GET /returns/summary|ledger|counts|insights|{id}/detail|{id}/next-actions, POST /returns/{id}/...). Money is minor units. */

export const RETURN_TABS = ["all", "needs_attention", "awaiting_receipt", "awaiting_inspection", "refund_pending", "completed"] as const;
export type ReturnTab = (typeof RETURN_TABS)[number];

export const RETURN_STAGES = ["requested", "approved", "in_transit", "received", "inspecting", "resolution", "refunded", "closed", "rejected", "cancelled"] as const;
export type ReturnStage = (typeof RETURN_STAGES)[number];

export const RETURN_SIGNALS = ["awaiting_inspection", "refunds_pending", "inventory_discrepancy", "high_value_review"] as const;
export type ReturnSignal = (typeof RETURN_SIGNALS)[number];

export const INSPECTION_STATUSES = ["not_started", "in_progress", "passed", "failed", "requires_review"] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const REFUND_STATUSES = ["not_applicable", "pending", "ready", "processing", "processed", "failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const DISPOSITION_FILTERS = ["pending", "sellable", "damaged", "rejected", "quarantine", "repair", "write_off", "return_to_vendor"] as const;
export type DispositionFilter = (typeof DISPOSITION_FILTERS)[number];

export const RETURN_SORTS = ["-requestedAt", "requestedAt", "-refundAmount", "refundAmount"] as const;
export type ReturnSort = (typeof RETURN_SORTS)[number];

export const SUMMARY_WINDOWS = [7, 30, 90] as const;

export interface ReturnFilters {
  q?: string;
  tab?: ReturnTab;
  stage?: ReturnStage;
  marketplace?: string;
  signal?: ReturnSignal;
  inspectionStatus?: InspectionStatus;
  refundStatus?: RefundStatus;
  disposition?: DispositionFilter;
}

export interface LedgerQuery extends ReturnFilters {
  sort?: ReturnSort;
  page?: number;
  pageSize?: number;
}

export interface ReturnsSummary {
  window: { days: number; since: string };
  requests: { total: number; today: number; open: number };
  pendingInspections: { count: number; overdue: number; overdueAfterHours: number };
  returnRate: { percent: number | null; returnedOrders: number; orders: number; previousPercent: number | null; deltaPoints: number | null };
  refundExposure: {
    count: number;
    amountMinor: number;
    currency: string;
    actionableCount: number;
    mixedCurrencies: boolean;
    byCurrency: Array<{ currency: string; count: number; amountMinor: number }>;
  };
  stages: Array<{ stage: ReturnStage; label: string; count: number }>;
}

export interface ReturnsOverview {
  createReturn: { available: boolean; reason: string | null; allowedChannels: string[] };
}

export type TabCounts = Record<ReturnTab, number>;

export interface LedgerRow {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  product: { title: string | null; sku: string | null; itemCount: number };
  channel: { code: string; name: string };
  reason: { code: string; label: string };
  quantity: number;
  receivedQuantity: number;
  status: string;
  displayStatus: string;
  stage: ReturnStage;
  stageLabel: string;
  requestedAt: string;
  receivedAt: string | null;
  inspection: { status: InspectionStatus; inspector: { id: string; name: string | null } | null };
  refund: { status: RefundStatus; amountMinor: number | null; currency: string | null; source: "connector" | "manual" | null };
  disposition: string;
  customer: { name: string | null; email: string | null } | null;
  signals: string[];
}

export interface LedgerPage {
  items: LedgerRow[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface MarketplaceOption {
  code: string;
  name: string;
}

export interface InsightsData {
  window: { days: number; since: string; returns: number };
  reasons: Array<{ code: string; label: string; count: number; sharePercent: number | null }>;
  topSkus: Array<{ sku: string; title: string; returns: number; unitsReturned: number; unitsSold: number; returnRatePercent: number | null }>;
  channels: Array<{ code: string; returns: number; sharePercent: number | null }>;
  trend: { granularity: "day" | "week"; points: Array<{ date: string; returns: number; units: number }> };
}

export interface TimelineStep {
  step: "requested" | "approved" | "received" | "inspection" | "refund" | "disposition" | "closed";
  status: "complete" | "pending";
  actor: { id: string | null; name: string | null; kind: "user" | "system" | "customer" } | null;
  at: string | null;
  note: string | null;
}

export interface ReturnDetail {
  header: { id: string; number: string; status: string; displayStatus: string; orderId: string; orderNumber: string | null; channel: { code: string; name: string }; customerName: string | null; source: string };
  product: { title: string | null; sku: string | null; itemCount: number; quantity: number; reason: string; receivedAt: string | null };
  details: {
    orderNumber: string | null;
    externalOrderId: string | null;
    customer: { name: string | null; email: string | null; phone?: string | null } | null;
    quantity: { expected: number; received: number };
    reason: { code: string; label: string; text: string | null };
    dates: { requestedAt: string | null; approvedAt: string | null; receivedAt: string | null; completedAt: string | null };
  };
  receipt: { expected: number; received: number; match: "matched" | "quantity_mismatch"; mismatch: { expected: number; received: number } | null };
  currentState: {
    inspection: { status: InspectionStatus; inspector: { id: string; name: string | null } | null };
    refund: { status: RefundStatus; amountMinor: number | null; currency: string | null; source: string | null; error: string | null };
    disposition: string;
  };
  timeline: TimelineStep[];
}

export interface ReturnItem {
  id: string;
  orderItemId: string;
  sku: string | null;
  quantity: number;
  receivedQuantity: number;
  dispositionedQuantity: number;
  restockedQuantity: number;
  condition: string | null;
  disposition: string | null;
  notes: string | null;
}

/** GET /returns/{id}: the aggregate (items, pickup) that the drawer detail does not carry */
export interface ReturnOrder {
  id: string;
  number: string;
  status: string;
  stage: ReturnStage;
  stageLabel: string;
  warehouseId: string | null;
  pickup: { status: string; awb: string | null; scheduledAt: string | null };
  refund: { status: RefundStatus; amountMinor: number | null; currency: string | null; source: "connector" | "manual" | null; error: string | null; reference: string | null; refundedAt: string | null };
  items: ReturnItem[];
}

export type ActionKey = "approve" | "receive" | "inspection" | "disposition" | "refund" | "complete";

export interface ActionInput {
  name: string;
  type: "uuid" | "string" | "integer" | "enum" | "array";
  required: boolean;
  default?: unknown;
  options?: Array<{ value: string; label: string; description?: string }>;
  note?: string;
}

export interface NextAction {
  key: ActionKey;
  label: string;
  method: "POST";
  href: string;
  permission: string;
  done: boolean;
  enabled: boolean;
  disabledReason: string | null;
  inputs: ActionInput[];
}

export interface NextActions {
  returnId: string;
  number: string;
  status: string;
  stage: ReturnStage;
  stageLabel: string;
  next: ActionKey | null;
  actions: NextAction[];
}

export interface ReceiveItem {
  returnItemId: string;
  quantity: number;
}

export interface RunActionInput {
  id: string;
  /** path after /returns/{id}/ : approve, receive, inspection, disposition, refund, refund/retry, complete, reject, cancel */
  action: string;
  body: Record<string, unknown>;
}

export interface ReturnReason {
  code: string;
  label: string;
  sources: string[];
}

export interface EligibilityItem {
  orderItemId: string;
  title: string;
  variant: string | null;
  sku: string | null;
  fulfilledQty: number;
  alreadyReturnedQty: number;
  availableQty: number;
  unitPriceMinor: number;
}

export interface Eligibility {
  order: { id: string; number: string; channel: { code: string; name: string }; status: string; totalMinor: number; currency: string; customer: { name: string | null } | null };
  items: EligibilityItem[];
  note: string;
}

export interface CreateReturnInput {
  orderId: string;
  reasonCode: string;
  reasonText?: string;
  items: Array<{ orderItemId: string; quantity: number }>;
}

export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
}

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}
