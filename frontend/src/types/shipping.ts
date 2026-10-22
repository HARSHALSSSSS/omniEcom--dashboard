/** Shapes of the shipping endpoints (GET /shipping/summary, /shipping/shipments, /shipping/carriers, labels, tracking, manifests, NDR). */

export const SHIPMENT_GROUPS = ["pre_dispatch", "in_transit", "delivered", "ndr", "rto", "cancelled"] as const;
export type ShipmentGroup = (typeof SHIPMENT_GROUPS)[number];
export type ShipmentTab = "all" | ShipmentGroup;
export const SHIPMENT_TABS: readonly ShipmentTab[] = ["all", ...SHIPMENT_GROUPS];

export const SHIPMENT_STATUSES = [
  "created", "label_ready", "manifested", "dispatched", "in_transit", "out_for_delivery", "delivered",
  "delivery_failed", "rto_initiated", "rto_in_transit", "rto_delivered", "cancelled",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const PAYMENT_FILTERS = ["cod", "prepaid"] as const;
export type ShipmentPayment = (typeof PAYMENT_FILTERS)[number];

export const SUMMARY_DAYS = [7, 30, 90] as const;

export interface CarrierSummary {
  code: string;
  name: string;
  awbCount: number;
  preDispatch: number;
  inTransit: number;
  delivered: number;
  ndr: number;
  rto: number;
  /** null: no delivered shipment with an ETA yet */
  onTimePercent: number | null;
  onTimeSample: number;
  /** null: nothing delivered yet */
  avgDeliveryDays: number | null;
}

export interface ShippingSummary {
  window: { days: number; since: string };
  carriers: CarrierSummary[];
  totals: Omit<CarrierSummary, "code" | "name">;
  exceptions: { shipments: number; ndr: number; rto: number };
}

export interface ShipmentFilters {
  q?: string;
  carrier?: string;
  status?: ShipmentStatus;
  group?: ShipmentGroup;
  warehouseId?: string;
  payment?: ShipmentPayment;
  labelAvailable?: boolean;
  /** YYYY-MM-DD */
  from?: string;
  to?: string;
}

export interface ShipmentsQuery extends ShipmentFilters {
  page: number;
  pageSize: number;
}

export interface ShipmentRow {
  id: string;
  number: string;
  awb: string | null;
  carrier: string;
  providerCode: string;
  service: string | null;
  orderId: string;
  orderNumber: string;
  channel: string;
  customerName: string | null;
  destination: { city: string | null; state: string | null; pincode: string | null };
  paymentMethod: string;
  codAmountMinor: number | null;
  status: ShipmentStatus;
  statusLabel: string;
  lastEvent: { status: string; rawStatus: string | null; location: string | null; note: string | null; occurredAt: string } | null;
  estimatedDeliveryAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  attempts: number;
  isRto: boolean;
  labelAvailable: boolean;
  trackingUrl: string | null;
  manifestId: string | null;
  createdAt: string;
}

export interface ShipmentCounts {
  all: number;
  pre_dispatch: number;
  in_transit: number;
  delivered: number;
  ndr: number;
  rto: number;
  cancelled: number;
}

export interface ShipmentsPage {
  items: ShipmentRow[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  counts: ShipmentCounts;
}

export type CarrierStatus = "active" | "needs_configuration" | "disabled";

export interface CarrierMethod {
  id: string;
  kind: "marketplace" | "seller" | "third_party";
  name: string;
  providerCode: string;
  status: CarrierStatus;
  isDefault: boolean;
  verification: { state: "verified" | "unverified"; verifiedAt: string | null };
  shipmentsLast30d: number;
  inTransit: number;
  lastShipmentAt: string | null;
}

export interface AvailableProvider {
  code: string;
  name: string;
  description: string;
}

export interface CarriersOverview {
  items: CarrierMethod[];
  activeCount: number;
  availableProviders: AvailableProvider[];
}

export interface ProviderCatalogEntry extends AvailableProvider {
  capabilities?: { labels: boolean; polling: boolean; cancel: boolean; reattempt: boolean; rto: boolean; manifest: boolean };
  configFields: Array<{ key: string; description: string; required: boolean; /** a credential: stored, never shown again */ secret?: boolean }>;
}

export interface AddCarrierInput {
  providerCode: string;
  label?: string;
  config: Record<string, string>;
}

export interface VerifyResult {
  ok: boolean;
  checks: Array<{ key: string; ok: boolean; message: string }>;
}

export interface LabelResult {
  shipmentId: string;
  ok: boolean;
  awb: string | null;
  number: string | null;
  format: "text" | "pdf_base64" | null;
  url: string | null;
  includedInCombined: boolean;
  error: { code: "not_found" | "shipment_cancelled" | "label_unavailable"; message: string } | null;
}

export interface BulkLabelsResponse {
  results: LabelResult[];
  summary: { requested: number; ok: number; failed: number };
  combined: { available: boolean; format: "pdf_base64" | null; fileName: string | null; pages: number; shipmentIds: string[]; content: string | null };
}

export interface ShipmentLabel {
  shipmentId: string;
  awb: string | null;
  format: "text" | "pdf_base64";
  content: string;
}

export interface TrackingEvent {
  id: number;
  status: ShipmentStatus;
  rawStatus: string | null;
  location: string | null;
  note: string | null;
  source: string;
  occurredAt: string;
}

export type NdrAction = "reattempt" | "rto" | "update_address" | "contact_customer";

export interface NdrCase {
  id: string;
  shipmentId: string;
  orderId: string;
  attemptNo: number;
  reasonCode: string;
  reasonText: string | null;
  status: string;
  action: NdrAction | null;
  nextAttemptAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface Manifest {
  id: string;
  number: string;
  warehouseId: string;
  providerCode: string;
  status: string;
  closedAt: string | null;
  dispatchedAt: string | null;
  shipmentCount: number;
  createdAt: string;
}

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

// ---------------------------------------------------------------------------------------------
// The shipping workspace: methods, orders to ship, overview, tracking, exceptions, rules
// ---------------------------------------------------------------------------------------------

export const SHIPPING_VIEWS = ["overview", "orders", "methods", "rules", "tracking", "shipments"] as const;
export type ShippingView = (typeof SHIPPING_VIEWS)[number];

/** what an order's shipping decision is about */
export type MethodKind = "marketplace" | "seller" | "third_party";
/** what a configured method is: "custom" is a logistics provider the seller configured (it is chosen as a third-party method for an order) */
export type ProviderKind = MethodKind | "custom";
export type CapValue = "supported" | "requires_configuration" | "not_supported";
export interface CapSet {
  label: CapValue;
  tracking: CapValue;
  dispatchUpdate: CapValue;
  statusSync: CapValue;
}

export interface ShippingMethod {
  id: string;
  kind: ProviderKind;
  name: string;
  label: string;
  providerCode: string;
  channel: { code: string | null; name: string; accountId: string | null; availability: "live" | "coming_soon" } | null;
  provider: { code: string; label: string } | null;
  state: "configured" | "requires_configuration" | "disabled";
  active: boolean;
  isDefault: boolean;
  preferredFor: string[];
  lastSyncAt: string | null;
  supportedOrderTypes: string[];
  capabilities: CapSet;
  verification: { state: "verified" | "unverified"; verifiedAt: string | null };
  config: Record<string, unknown>;
  version: number;
  createdAt: string;
}

export interface CapabilityMatrixRow extends CapSet {
  methodId: string | null;
  method: MethodKind | "unverified_connector";
  name: string;
}

export interface MethodsOverview {
  items: ShippingMethod[];
  capabilityMatrix: CapabilityMatrixRow[];
  summary: string;
  activeMethods: number;
}

export interface CapabilityDetail {
  methodId: string;
  kind: ProviderKind;
  name: string;
  verified: boolean;
  verifiedAt: string | null;
  source: string;
  capabilities: Array<{ key: string; value: CapValue; declared: boolean; note: string }>;
}

export interface AddMethodInput {
  kind: ProviderKind;
  providerCode?: string;
  channelCode?: string;
  label?: string;
  config?: Record<string, string>;
}

export interface MethodPatch {
  isDefault?: boolean;
  active?: boolean;
  label?: string;
  config?: Record<string, string>;
  supportedOrderTypes?: string[];
}

export interface AddMethodResult {
  method: { id: string; name: string };
  verify: VerifyResult;
}

export const DECISION_STATUSES = ["needs_decision", "selected", "label_pending", "ready_to_dispatch", "exception", "dispatched"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];
export const SLA_BANDS = ["safe", "approaching", "at_risk", "breached", "none"] as const;
export type SlaBand = (typeof SLA_BANDS)[number];
export const METHOD_FILTERS = ["marketplace", "seller", "third_party", "unassigned"] as const;
export type MethodFilter = (typeof METHOD_FILTERS)[number];

export interface DecisionFilters {
  q?: string;
  marketplace?: string;
  warehouse?: string;
  method?: MethodFilter;
  sla?: SlaBand;
  status?: DecisionStatus;
}

export interface DecisionQuery extends DecisionFilters {
  page: number;
  pageSize: number;
}

export interface DecisionItem {
  fulfillmentId: string;
  fulfillmentNumber: string;
  orderId: string;
  number: string;
  channel: { code: string; name: string };
  warehouse: { id: string; code: string; name: string };
  destination: { city: string | null; state: string | null };
  valueMinor: number;
  currency: string;
  weightGrams: number | null;
  itemCount: number;
  availableMethods: Array<{ kind: MethodKind; name: string; available: boolean; reason?: string }>;
  selectedMethod: { kind: MethodKind; name: string; providerId: string | null } | null;
  selectionConfirmed: boolean;
  selectedBy: "rule" | "preference" | "manual" | null;
  recommendedMethod: { kind: MethodKind; name: string; why: string; source: string } | null;
  sla: { dueAt: string | null; minutesRemaining: number | null; band: SlaBand };
  status: DecisionStatus;
  shipmentId: string | null;
  action: RowAction;
  /** a confirmed carrier-collected method awaits a pickup slot until one is booked ("Awaiting slot booking" / "Book slot") */
  pickup: { state: "not_applicable" | "awaiting" | "booked"; methodId: string | null; warehouseId: string; slot: { id: string; date: string; windowStart: string; windowEnd: string; status: string } | null };
  /** print_label (labelled), generate_label / enter_awb (method confirmed, no label yet) */
  secondaryActions: RowAction[];
}

export interface PickupSlot {
  id: string;
  warehouse: { id: string; code: string; name: string };
  method: { id: string; name: string; kind: string; providerCode: string };
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  windowStart: string;
  windowEnd: string;
  parcelCount: number;
  /** confirmed: the provider scheduled it; manual: recorded here, arranged with the carrier; failed: the provider refused */
  status: "requested" | "confirmed" | "manual" | "cancelled" | "failed";
  mode: "provider" | "manual";
  reference: string | null;
  note: string | null;
  cancellable: boolean;
  cancelledAt: string | null;
  createdAt: string;
}

export interface PickupSlotInput {
  warehouseId: string;
  methodId: string;
  date: string;
  windowStart: string;
  windowEnd: string;
  parcelCount: number;
  note?: string;
}

export interface RowAction {
  key: string;
  label: string;
  method: "GET" | "POST";
  href: string;
  enabled?: boolean;
}

export interface DecisionPage {
  items: DecisionItem[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  counts: Record<string, number>;
}

export interface ShippingOption {
  kind: MethodKind;
  name: string;
  recommended: boolean;
  available: boolean;
  managedBy: "marketplace" | "merchant" | "provider";
  providerId: string | null;
  providers: Array<{ id: string; name: string }>;
  selected: boolean;
  reason?: string;
}

export interface ShippingOptions {
  fulfillmentId: string;
  orderId: string;
  status: DecisionStatus;
  order: {
    number: string;
    marketplace: { code: string; name: string };
    destination: { city: string | null; state: string | null; pincode: string | null };
    warehouse: { id: string; code: string; name: string };
    product: string | null;
    sku: string | null;
    skus: string[];
    itemCount: number;
    weightGrams: number | null;
    valueMinor: number;
    currency: string;
  };
  options: ShippingOption[];
  recommendation: { kind: MethodKind; providerId: string | null; name: string; why: string; source: string; ruleId: string | null } | null;
  selection: { kind: MethodKind; providerId: string | null; confirmed: boolean; selectedBy: "rule" | "preference" | "manual" | null; confirmedAt: string | null } | null;
}

export interface SelectionInput {
  kind: MethodKind;
  providerId?: string | null;
  source: "recommended" | "manual_override";
}

export type BulkOrderAction = "assign_method" | "generate_labels" | "recalculate";

export interface BulkOrdersResult {
  action: string;
  requested: number;
  succeeded: number;
  failed: number;
  results: Array<{ fulfillmentId: string; number: string | null; ok: boolean; code?: string; message?: string; shipmentId?: string; awb?: string | null }>;
}

export interface PulseStage {
  count: number;
  /** change against the comparison moment (a stored snapshot, else the status history) */
  sinceLastSync: number;
}

export interface ShippingOverview {
  asOf: string;
  generatedAt: string;
  baseline: string;
  comparison: { source: "snapshot" | "history"; at: string; windowHours: number };
  statusLine: { connectedChannels: number; activeMethods: number; ordersNeedAttention: number };
  pulse: {
    readyToShip: PulseStage & { needDecision: number };
    shippingSelected: PulseStage & { note: string | null };
    labelReady: PulseStage & { labelUnavailable: number };
    dispatched: PulseStage;
    inTransit: PulseStage & { trackingIssues: number };
  };
  decisionField: Array<{
    fulfillmentId: string;
    order: { id: string; number: string };
    channel: { code: string; name: string };
    warehouse: { id: string; code: string; name: string };
    itemCount: number;
    weightGrams: number | null;
    availableMethods: Array<{ kind: MethodKind; name: string; available: boolean; reason?: string }>;
    merchantPreference: { kind: MethodKind; name: string; why: string; whyText: string } | null;
    selected: { kind: MethodKind; name: string; confirmed: boolean } | null;
  }>;
  availabilityComparison: Array<{
    channel: { code: string; name: string };
    method: MethodKind | "label_generation";
    provider: string;
    methodId: string | null;
    availability: "ready" | "requires_configuration" | "unavailable" | "unsupported";
    default: "preferred" | "order_specific" | "not_set" | "unavailable";
    override: "where_supported" | "verify_capability" | "unavailable";
  }>;
  attention: { total: number; parts: { undecided: number; label: number; tracking: number; sync: number; slaRisk: number; capability: number } };
}

export interface SyncResult {
  orders: number;
  statuses: number;
  processed: number;
  updated: number;
  requireAttention: number;
  methods: { checked: number; verified: number; notVerified: number };
  tracking: { processed: number; updated: number; failed: number; failures: Array<{ shipmentId: string; message: string }> };
  completedAt: string;
}

/** Sync Shipping runs as a background job (the shared sync engine): this is the part of it the screen uses */
export interface SyncJob {
  id: string;
  status: "queued" | "running" | "retrying" | "succeeded" | "partially_failed" | "failed" | "dead_lettered" | "cancelled";
  progress: { total: number; done: number; failed: number };
  /** orders, statuses, processed, updated, requireAttention, methodsChecked, ... once it is over */
  stats: Record<string, number>;
  error: { code: string; message: string } | null;
  failureDetails: Array<{ ref: string; code?: string; message: string }>;
  payload: { orders?: number } & Record<string, unknown>;
  startedAt: string | null;
  finishedAt: string | null;
}

export const SYNC_RUNNING: ReadonlyArray<SyncJob["status"]> = ["queued", "running", "retrying"];
export const SYNC_FAILED: ReadonlyArray<SyncJob["status"]> = ["failed", "dead_lettered", "cancelled"];

export const TRACKING_STATUSES = ["tracking_active", "awaiting_first_scan", "in_transit", "delivery_delayed", "tracking_sync_failed", "delivered"] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

export interface TrackingFilters {
  q?: string;
  marketplace?: string;
  method?: string;
  status?: TrackingStatus;
}

export interface TrackingQuery extends TrackingFilters {
  page: number;
  pageSize: number;
}

export interface TrackingItem {
  shipmentId: string;
  orderId: string;
  number: string;
  channel: { code: string; name: string };
  method: { kind: MethodKind; name: string; providerCode: string };
  awb: string | null;
  carrier: string | null;
  dispatchedAt: string | null;
  status: TrackingStatus;
  shipmentStatus: string;
  lastUpdateAt: string | null;
  estimatedDeliveryAt: string | null;
  attention: "none" | "check_first_scan" | "review_update" | "retry_required" | "completed";
}

export interface TrackingPage {
  items: TrackingItem[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  counters: { stages: { dispatched: number; inTransit: number; delivered: number }; byStatus: Record<string, number> };
}

export interface TrackingFailure {
  shipmentId: string;
  orderId: string;
  orderNumber: string;
  awb: string | null;
  failedAt: string | null;
  whatFailed: string;
  possibleReason: string;
  action: { key: "retry"; label: string; method: "POST"; href: string };
}

export const EXCEPTION_KEYS = ["no_method_selected", "label_unavailable", "tracking_not_received", "shipping_sync_failed", "sla_risk", "connector_capability_limit"] as const;
export type ExceptionKey = (typeof EXCEPTION_KEYS)[number];

export interface ExceptionAction {
  key: string;
  label: string;
  method: "GET" | "POST";
  href: string;
}

export interface ExceptionCategory {
  key: ExceptionKey;
  title: string;
  count: number;
  orders: Array<{ orderId: string; number: string; fulfillmentId: string | null; shipmentId: string | null; channel: { code: string; name: string }; detail: string | null; action: ExceptionAction }>;
  whatHappened: string;
  why: string;
  whatCanIDoNow: string;
  action: ExceptionAction;
}

export interface ExceptionsReport {
  categories: ExceptionCategory[];
  totalOrders: number;
  categoryCount: number;
  total: number;
}

export interface RuleCondition {
  combinator: "if" | "and";
  field: string;
  op: string;
  value: unknown;
}

export interface ShippingRule {
  id: string;
  name: string;
  description: string | null;
  status: "enabled" | "disabled";
  priority: number;
  lastUpdatedAt: string;
  ordersAffected: number | null;
  conditions: RuleCondition[];
  then: { prefer: { kind: MethodKind; providerId: string | null; label: string } };
  version: number;
}

export interface RulesList {
  items: ShippingRule[];
  total: number;
  max: number;
  fields: string[];
  operators: string[];
}

export interface RuleInput {
  name: string;
  description?: string | null;
  enabled?: boolean;
  conditions: Array<{ field: string; op: string; value: unknown }>;
  then: { prefer: { kind: MethodKind; providerId?: string | null } };
}
