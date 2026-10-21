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
  configFields: Array<{ key: string; description: string; required: boolean }>;
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
