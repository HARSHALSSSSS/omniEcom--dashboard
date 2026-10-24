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

/** GET /returns/overview: the status line, whether a return can be created here, the eight stage queues and the attention signals */
export interface ReturnsOverview {
  statusLine?: { open: number; awaitingInspection: number; refundsPending: number };
  createReturn: { available: boolean; reason: string | null; allowedChannels: string[] };
  stages?: Record<string, { count: number; needReview?: number; refundPending?: number; hint?: string; window?: string }>;
  stagesNote?: string;
  /** only the signals with a count above zero are listed */
  attention?: Array<{ key: ReturnSignal; count: number }>;
}

/** the fixed stages of the lifecycle rail, in order, with the key the overview uses and the ledger stage filter it opens */
export const LIFECYCLE_STAGES = [
  { key: "requested", stage: "requested", label: "Requested", hint: "To review" },
  { key: "approved", stage: "approved", label: "Approved", hint: "Authorized" },
  { key: "inTransit", stage: "in_transit", label: "In Transit", hint: "Await receipt" },
  { key: "received", stage: "received", label: "Received", hint: "Verify stock" },
  { key: "inspecting", stage: "inspecting", label: "Inspecting", hint: "" },
  { key: "resolution", stage: "resolution", label: "Resolution", hint: "" },
  { key: "refunded", stage: "refunded", label: "Refunded", hint: "Disposition" },
  { key: "closed", stage: "closed", label: "Closed", hint: "Complete" },
] as const satisfies ReadonlyArray<{ key: string; stage: ReturnStage; label: string; hint: string }>;

/** what the latest saved inspection checklist says about the goods */
export type PhysicalCondition = "usable" | "damaged" | "wrong_product" | "incomplete";

export type LedgerActionKey = "inspect" | "review" | "view" | "track" | "refund";

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
  inspection: { status: InspectionStatus; inspector: { id: string; name: string | null } | null; physical?: PhysicalCondition | null };
  refund: { status: RefundStatus; amountMinor: number | null; currency: string | null; source: "connector" | "manual" | null };
  disposition: string;
  customer: { name: string | null; email: string | null } | null;
  signals: string[];
  /** the next thing to do with this return (the label of the row's action button) */
  action?: { key: LedgerActionKey; href: string };
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
  receipt: { expected: number; received: number; match: "matched" | "quantity_mismatch" | "awaiting_receipt"; mismatch: { expected: number; received: number } | null };
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
  order: { id: string; number: string; channel: { code: string; name: string }; status: string; totalMinor: number; currency: string; customer: { name: string | null; email?: string | null } | null; placedAt?: string; itemCount?: number };
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

/** GET /returns/analytics: reason shares of the last returns, concentration and the recommendation-only notes */
export interface ReturnsAnalytics {
  window: { returns: number; days: number; sample: number };
  reasons: Array<{ code: string; label: string; count: number; sharePct: number }>;
  concentration: { products: number; text: string };
  intelligence: Array<{ kind: "reason_spike" | "sku_baseline"; text: string; evidence: string; action: { key: string; label: string; href: string } }>;
  recommendationOnly: true;
  note: string;
}

export type AttentionIssue = "inspection_overdue" | "refund_pending" | "quantity_mismatch" | "disposition_missing";

/** GET /returns/attention: one row per affected return */
export interface AttentionList {
  total: number;
  items: Array<{ returnId: string; number: string; orderNumber: string; issue: AttentionIssue; signals: string[]; impact: string; recommendedAction: { text: string; href: string } }>;
}

export interface RefundQueueRow {
  returnId: string;
  number: string;
  orderNumber: string;
  channel: { code: string; name: string };
  product: { title: string | null; sku: string | null };
  refund: { status: RefundStatus; amountMinor: number | null; currency: string | null; source: "connector" | "manual" | null; error: string | null };
  returnStatus: string;
  inspectionStatus: InspectionStatus;
  lastUpdateAt: string;
  action: { key: "review_failure" | "view" | "review_refund"; href: string };
}

export interface RefundQueue {
  items: RefundQueueRow[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  counts: { pending: number; ready: number; processing: number; failed: number };
}

export interface RefundQuery {
  q?: string;
  status?: RefundStatus;
  marketplace?: string;
  page?: number;
  pageSize?: number;
}

/** GET /returns/{id}/refund */
export interface RefundView {
  returnId: string;
  number: string;
  orderId: string;
  orderNumber: string | null;
  channel: { code: string; name: string };
  product: { title: string | null; sku: string | null };
  quantity: number;
  refund: { status: RefundStatus; amountMinor: number | null; currency: string | null; source: string | null; reference: string | null; error: string | null; refundedAt: string | null; lastUpdateAt: string; amountFrom: string };
  returnStatus: string;
  inspectionStatus: InspectionStatus;
  actionable: boolean;
  timeline: Array<{ step: "requested" | "approved" | "processing" | "completed"; status: "complete" | "pending"; actor: { id: string | null; name: string | null } | null; at: string | null; note: string | null }>;
  note: string;
}

export const INSPECTION_RESULTS = ["pass", "fail", "needs_review"] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export interface InspectionChecklist {
  packagingIntact: boolean;
  productUsable: boolean;
  accessoriesPresent: boolean;
  visibleDamage: boolean;
  productMismatch: boolean;
  missingQuantity: boolean;
  custom?: Array<{ label: string; ok: boolean }>;
}

export interface InspectionRecord {
  id: string;
  checklist: InspectionChecklist;
  result: InspectionResult;
  systemCondition: string;
  note: string | null;
  inspector: { id: string; name: string | null } | null;
  at: string;
}

/** GET /returns/{id}/inspection: the latest inspection and its history */
export interface InspectionView {
  returnId: string;
  number: string;
  status: InspectionStatus;
  inspector: { id: string; name: string | null } | null;
  startedAt: string | null;
  systemCondition: "receipt_matched" | "quantity_mismatch";
  quantity: { expected: number; received: number };
  latest: InspectionRecord | null;
  history: InspectionRecord[];
  note: string;
}

export type DispositionKind = "sellable" | "damaged" | "rejected" | "quarantine" | "repair" | "write_off";

/** GET /returns/{id}/disposition-options: the suggestion (never applied) and the six choices */
export interface DispositionOptions {
  returnId: string;
  number: string;
  inspectionStatus: InspectionStatus;
  recommendation: { kind: DispositionKind | null; reason: string; suggestedOnly: true };
  options: Array<{ kind: DispositionKind; label: string; description: string }>;
  undecidedUnits: number;
  decided: string[];
  canConfirm: boolean;
  blockedReason: string | null;
  note: string;
}

/** one queued `returns` sync job (one per connected account that can fetch returns) */
export interface SyncJobInfo {
  accountId: string;
  accountName: string;
  marketplace: string;
  jobId: string;
  status: string;
  alreadyQueued: boolean;
}

export type SyncSkipReason = "returns_fetch_not_supported" | "connector_not_ready" | "connector_unavailable";

export interface SyncSkipped {
  accountId: string;
  accountName: string;
  marketplace: string;
  reason: SyncSkipReason;
}

/** POST /returns/sync: the jobs queued, and the accounts whose connector cannot fetch returns */
export interface SyncResult {
  enqueued: boolean;
  reason: "no_eligible_accounts" | null;
  eligibleAccounts: number;
  jobs: SyncJobInfo[];
  skipped: SyncSkipped[];
}

export type SyncJobStatus = "queued" | "running" | "retrying" | "succeeded" | "partially_failed" | "failed" | "dead_lettered" | "cancelled";
export const SYNC_JOB_DONE: ReadonlyArray<SyncJobStatus> = ["succeeded", "partially_failed", "failed", "dead_lettered", "cancelled"];

/** GET /sync/jobs/{id}: the live state of one sync run */
export interface SyncJob {
  id: string;
  status: SyncJobStatus;
  marketplaceAccountId: string | null;
  progress: { total: number; done: number; failed: number };
  /** fetched, created, duplicates, cancelled, rejected, unmatched, failed */
  stats: Record<string, number>;
  error: { code?: string; message?: string } | null;
  failureDetails: Array<{ ref: string; code?: string; message: string }>;
}

export interface SyncAccountReport {
  accountId: string;
  accountName: string;
  marketplace: string;
  alreadyQueued: boolean;
  /** null until the first poll answered */
  job: SyncJob | null;
}

/** what the sync panel shows: per account, from the real jobs, while they run and after */
export interface SyncReport {
  startedAt: number;
  accounts: SyncAccountReport[];
  skipped: SyncSkipped[];
  /** every job reached an end state */
  finished: boolean;
  /** the jobs kept running longer than we waited; they continue in the background */
  stillRunning: boolean;
  /** nothing could be queued (no connected account can fetch returns) */
  nothingToSync: boolean;
}

export interface MarkResult {
  marked: string[];
  skipped: Array<{ id: string; reason: string }>;
}

export interface MemberOption {
  id: string;
  name: string;
}

export interface AssignResult {
  assigned: string[];
  skipped: Array<{ id: string; reason: string }>;
}

export interface SaveInspectionInput {
  id: string;
  checklist: InspectionChecklist;
  result: InspectionResult;
  note?: string;
}
