/** Types of the Fulfillment screen: the shapes of GET /fulfillment/queue, /workspace/{orderId}, /exceptions and the actions. */

export const STAGES = ["awaiting_pick", "picking", "packing", "ready_to_ship"] as const;
export type Stage = (typeof STAGES)[number];

export const FULFILLMENT_TABS = ["all", ...STAGES, "exceptions"] as const;
export type FulfillmentTab = (typeof FULFILLMENT_TABS)[number];

export const PRIORITIES = ["normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type SlaBand = "safe" | "approaching" | "at_risk" | "breached" | "none";
export interface Sla {
  dueAt: string | null;
  minutesRemaining: number | null;
  band: SlaBand;
  label: string;
}

export const ACTIONS = ["start", "pick_all", "pack", "ready", "handover", "exception"] as const;
export type FulfillmentAction = (typeof ACTIONS)[number];

export type PickState = "pending" | "partial" | "picked" | "short" | string;

export interface QueueItemLine {
  sku: string;
  title: string;
  quantity: number;
  pickedQuantity: number;
  packedQuantity: number;
  pickState: PickState;
  bin: string | null;
  binSuggested: boolean;
}

export interface QueueRow {
  fulfillmentId: string;
  number: string;
  orderId: string;
  orderNumber: string;
  channel: { code: string; accountId: string | null; name: string };
  stage: Stage | null;
  stageLabel: string | null;
  status: string;
  onHold: boolean;
  priority: Priority;
  sla: Sla;
  placedAt: string;
  customerName: string | null;
  destination: { city: string | null; state: string | null; pincode: string | null };
  paymentMethod: string | null;
  warehouse: { id: string; code: string; name: string };
  assignee: { id: string; name: string | null } | null;
  pickList: { id: string; number: string } | null;
  carrier: string | null;
  awb: string | null;
  shipmentId: string | null;
  shipmentStatus: string | null;
  itemCount: number;
  unitCount: number;
  pickedUnits: number;
  packedUnits: number;
  items: QueueItemLine[];
  openExceptions: number;
  nextAction: FulfillmentAction | null;
}

export interface QueueCounts {
  awaiting_pick: number;
  picking: number;
  packing: number;
  ready_to_ship: number;
  all: number;
  onHold: number;
  exceptions: number;
  /** packed and waiting for a carrier (a status inside ready_to_ship) */
  packed: number;
  /** handed to a carrier since midnight UTC */
  dispatchedToday: number;
}

/** one status change of a fulfillment, as GET /fulfillment/activity lists them */
export interface ActivityEvent {
  id: number;
  fulfillmentId: string;
  fulfillmentNumber: string;
  orderId: string;
  orderNumber: string;
  from: string | null;
  to: string;
  note: string | null;
  at: string;
  actor: { id: string; name: string | null } | null;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export type QueuePage = Paged<QueueRow> & { counts: QueueCounts };

export interface QueueQuery {
  stage?: Stage;
  warehouse?: string;
  carrier?: string;
  priority?: Priority;
  hasException?: boolean;
  q?: string;
  page: number;
  pageSize: number;
}

export interface ActionView {
  action: FulfillmentAction;
  label: string;
  enabled: boolean;
  disabledReason: string | null;
  requires: string[];
  requiresOverride: boolean;
}

export interface WorkspaceItem {
  id: string;
  sku: string;
  title: string;
  barcode: string | null;
  quantity: number;
  pickedQuantity: number;
  packedQuantity: number;
  shortQuantity: number;
  pickState: PickState;
  bin: string | null;
  scanned: boolean | null;
  /** the pick task of this line (null until picking has started): the target of a scan */
  pickTaskId: string | null;
}

export interface WorkspaceException {
  id: string;
  kind: string;
  status: string;
  details: Record<string, unknown>;
  raisedBy: { id: string; name: string | null } | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface WorkspaceFulfillment extends Omit<QueueRow, "items"> {
  id: string;
  items: WorkspaceItem[];
  packages: Array<{ id: string; number: string; barcode: string | null; status: string; weightGrams: number | null; boxType: string | null }>;
  shipment: { id: string; number: string; status: string; carrier: string | null; awb: string | null; trackingUrl: string | null; hasLabel: boolean; manifestId: string | null; estimatedDeliveryAt: string | null } | null;
  exceptions: WorkspaceException[];
  history: Array<{ at: string; from: string | null; to: string; note: string | null; actor: { id: string; name: string | null } | null }>;
  openTasks: number;
}

export interface Workspace {
  order: {
    id: string;
    orderNumber: string;
    externalOrderId: string | null;
    status: string;
    placedAt: string;
    channel: { code: string; accountId: string | null; name: string };
    customer: { name: string | null; city: string | null; state: string | null; pincode: string | null };
    paymentMethod: string | null;
    codAmountMinor: number | null;
    totalMinor: number;
    currency: string;
    sla: Sla;
    attentionReason: string | null;
  };
  fulfillments: Array<{ id: string; number: string; status: string; stage: Stage | null; warehouse: { id: string; code: string; name: string }; units: number; focused: boolean }>;
  fulfillment: WorkspaceFulfillment | null;
  actions: ActionView[];
}

export const EXCEPTION_KINDS = ["damaged", "wrong_item", "pack_issue", "insufficient_stock", "address_issue", "other"] as const;
export type RaisableKind = (typeof EXCEPTION_KINDS)[number];

export interface ActionInput {
  orderId: string;
  action: FulfillmentAction;
  fulfillmentId?: string;
  override?: boolean;
  weightGrams?: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  boxType?: string;
  kind?: RaisableKind;
  note?: string;
}

export interface ActionResult {
  action: FulfillmentAction;
  applied: boolean;
  alreadyDone: boolean;
  fulfillmentId: string | null;
  result: Record<string, unknown>;
  workspace: Workspace;
}

export interface HandoverResult {
  orderId: string;
  orderNumber: string | null;
  shipmentId: string | null;
  ok: boolean;
  manifestId: string | null;
  error: { code: string; message: string } | null;
}

export interface BatchHandoverResponse {
  carrier: string;
  manifests: Array<{ id: string; number: string; shipmentCount: number; status: string }>;
  results: HandoverResult[];
  summary: { requested: number; handedOver: number; failed: number };
}

export const EXCEPTION_STATUSES = ["open", "resolved", "dismissed"] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

export interface ExceptionRow {
  id: string;
  kind: string;
  kindLabel: string;
  status: ExceptionStatus;
  details: Record<string, unknown>;
  resolution: { note?: string | null; action?: string } | null;
  fulfillment: { id: string; number: string; status: string };
  orderId: string;
  orderNumber: string;
  channel: string;
  warehouse: { id: string; code: string };
  raisedBy: { id: string; name: string | null } | null;
  ageMinutes: number;
  createdAt: string;
  resolvedAt: string | null;
}

export type ExceptionsPage = Paged<ExceptionRow> & { counts: Record<ExceptionStatus, number> };

export interface ExceptionsQuery {
  status: ExceptionStatus;
  warehouse?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export type ResolveAction = "none" | "hold" | "cancel_fulfillment";

export interface ResolveInput {
  id: string;
  status: "resolved" | "dismissed";
  note?: string;
  action: ResolveAction;
}

export interface PickListResult {
  id: string;
  number: string;
  tasks: unknown[];
}

export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}

export interface CarrierOption {
  providerCode: string;
  name: string;
}
