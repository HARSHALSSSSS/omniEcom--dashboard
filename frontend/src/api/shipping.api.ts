import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  AddMethodInput,
  AddMethodResult,
  BulkLabelsResponse,
  BulkOrderAction,
  BulkOrdersResult,
  CapabilityDetail,
  CarriersOverview,
  DecisionFilters,
  DecisionPage,
  DecisionQuery,
  DownloadedFile,
  ExceptionKey,
  ExceptionsReport,
  Manifest,
  MethodKind,
  MethodPatch,
  MethodsOverview,
  NdrAction,
  NdrCase,
  PickupSlot,
  PickupSlotInput,
  ProviderCatalogEntry,
  RuleInput,
  RulesList,
  SelectionInput,
  ShipmentFilters,
  ShipmentLabel,
  ShipmentRow,
  ShipmentsPage,
  ShipmentsQuery,
  ShippingMethod,
  ShippingOptions,
  ShippingOverview,
  ShippingRule,
  ShippingSummary,
  SyncJob,
  SyncResult,
  TrackingEvent,
  TrackingFailure,
  TrackingFilters,
  TrackingPage,
  TrackingQuery,
  VerifyResult,
} from "@/types/shipping";

export interface WarehouseOption {
  id: string;
  /** the short code shipping rules compare against */
  code: string;
  name: string;
}

/** `{carrier:"Delhivery"}` to the API's `filter[carrier]=Delhivery` style; empty values are left out */
export function filterParams(f: ShipmentFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (f.carrier) out["filter[carrier]"] = f.carrier;
  if (f.status) out["filter[status]"] = f.status;
  if (f.group) out["filter[group]"] = f.group;
  if (f.warehouseId) out["filter[warehouseId]"] = f.warehouseId;
  if (f.payment) out["filter[payment]"] = f.payment;
  if (f.labelAvailable !== undefined) out["filter[labelAvailable]"] = String(f.labelAvailable);
  if (f.from) out["filter[from]"] = f.from;
  // the API compares the instant: a plain end date means the end of that day
  if (f.to) out["filter[to]"] = `${f.to}T23:59:59.999Z`;
  return out;
}

export function shipmentsParams(query: ShipmentsQuery): Record<string, string | number> {
  const params: Record<string, string | number> = filterParams(query);
  if (query.page > 1) params.page = query.page;
  params.pageSize = query.pageSize;
  return params;
}

/** orders to ship: `filter[...]` names of the API, empty values left out */
export function decisionFilterParams(f: DecisionFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (f.marketplace) out["filter[marketplace]"] = f.marketplace;
  if (f.warehouse) out["filter[warehouse]"] = f.warehouse;
  if (f.method) out["filter[method]"] = f.method;
  if (f.sla) out["filter[sla]"] = f.sla;
  if (f.status) out["filter[status]"] = f.status;
  return out;
}

export function decisionParams(query: DecisionQuery): Record<string, string | number> {
  const params: Record<string, string | number> = decisionFilterParams(query);
  if (query.page > 1) params.page = query.page;
  params.pageSize = query.pageSize;
  return params;
}

export function trackingFilterParams(f: TrackingFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (f.marketplace) out["filter[marketplace]"] = f.marketplace;
  if (f.method) out["filter[method]"] = f.method;
  if (f.status) out["filter[status]"] = f.status;
  return out;
}

export function trackingParams(query: TrackingQuery): Record<string, string | number> {
  const params: Record<string, string | number> = trackingFilterParams(query);
  if (query.page > 1) params.page = query.page;
  params.pageSize = query.pageSize;
  return params;
}

/** a base64 string to a file the browser can save or open */
export function base64ToBlob(content: string, type: string): Blob {
  const raw = atob(content);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type });
}

function fileNameOf(disposition: unknown, fallback: string): string {
  const match = typeof disposition === "string" ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition) : null;
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

export const shippingApi = {
  summary: async (days: number, signal?: AbortSignal) => unwrap<ShippingSummary>(await client.get(ENDPOINTS.SHIPPING_SUMMARY, { params: { days }, signal })),

  shipments: async (query: ShipmentsQuery, signal?: AbortSignal) =>
    unwrap<ShipmentsPage>(await client.get(ENDPOINTS.SHIPPING_SHIPMENTS, { params: shipmentsParams(query), signal })),

  carriers: async (signal?: AbortSignal) => unwrap<CarriersOverview>(await client.get(ENDPOINTS.SHIPPING_CARRIERS, { signal })),

  providerCatalog: async () => unwrap<ProviderCatalogEntry[]>(await client.get(ENDPOINTS.SHIPPING_PROVIDER_CATALOG)),

  // ---- methods
  methods: async (signal?: AbortSignal) => unwrap<MethodsOverview>(await client.get(ENDPOINTS.SHIPPING_METHODS, { signal })),

  /** creates the method unverified, then runs the safe capability check; a failed check leaves it in "requires configuration" */
  addMethod: async (input: AddMethodInput): Promise<AddMethodResult> => {
    const body = {
      kind: input.kind,
      ...(input.providerCode ? { providerCode: input.providerCode } : {}),
      ...(input.channelCode ? { channelCode: input.channelCode } : {}),
      ...(input.label ? { label: input.label } : {}),
      config: input.config ?? {},
    };
    const created = unwrap<ShippingMethod>(await client.post(ENDPOINTS.SHIPPING_METHODS, body));
    const verify = unwrap<VerifyResult>(await client.post(ENDPOINTS.SHIPPING_METHOD_VERIFY(created.id), {}));
    return { method: { id: created.id, name: created.name }, verify };
  },

  patchMethod: async (id: string, patch: MethodPatch) => unwrap<ShippingMethod>(await client.patch(ENDPOINTS.SHIPPING_METHOD(id), patch)),

  verifyCarrier: async (methodId: string) => unwrap<VerifyResult>(await client.post(ENDPOINTS.SHIPPING_METHOD_VERIFY(methodId), {})),

  capability: async (methodId: string, signal?: AbortSignal) => unwrap<CapabilityDetail>(await client.get(ENDPOINTS.SHIPPING_METHOD_CAPABILITIES(methodId), { signal })),

  warehouses: async (): Promise<WarehouseOption[]> => {
    const res = await client.get<{ data: WarehouseOption[] }>(ENDPOINTS.WAREHOUSES, { params: { limit: 100, "filter[status]": "active" } });
    return res.data.data.map((w) => ({ id: w.id, code: w.code, name: w.name }));
  },

  // ---- orders to ship
  decisions: async (query: DecisionQuery, signal?: AbortSignal) => unwrap<DecisionPage>(await client.get(ENDPOINTS.SHIPPING_ORDERS, { params: decisionParams(query), signal })),

  options: async (fulfillmentId: string, signal?: AbortSignal) => unwrap<ShippingOptions>(await client.get(ENDPOINTS.SHIPPING_ORDER_OPTIONS(fulfillmentId), { signal })),

  select: async (fulfillmentId: string, input: SelectionInput) =>
    unwrap<ShippingOptions & { unchanged: boolean }>(await client.post(ENDPOINTS.SHIPPING_ORDER_SELECTION(fulfillmentId), input)),

  /** a 200 with a result per order, even when some of them failed */
  bulkOrders: async (fulfillmentIds: string[], action: BulkOrderAction, params: { kind?: MethodKind; providerId?: string | null } = {}) =>
    unwrap<BulkOrdersResult>(await client.post(ENDPOINTS.SHIPPING_ORDERS_BULK, { fulfillmentIds, action, params })),

  exportOrders: async (filters: DecisionFilters): Promise<DownloadedFile> => {
    const res = await client.get<Blob>(ENDPOINTS.SHIPPING_ORDERS_EXPORT, { params: decisionFilterParams(filters), responseType: "blob" });
    return { blob: res.data, fileName: fileNameOf(res.headers["content-disposition"], "orders-to-ship.csv") };
  },

  // ---- overview, sync, exceptions
  overview: async (signal?: AbortSignal) => unwrap<ShippingOverview>(await client.get(ENDPOINTS.SHIPPING_OVERVIEW, { signal })),

  /** starts Sync Shipping as a background job (202) and returns it; follow it with syncJob */
  sync: async () => unwrap<SyncJob>(await client.post(ENDPOINTS.SHIPPING_SYNC, {})),

  syncJob: async (id: string, signal?: AbortSignal) => unwrap<SyncJob>(await client.get(ENDPOINTS.SHIPPING_SYNC_JOB(id), { signal })),

  /** the latest Sync Shipping job, so a reloaded page can pick a running one up again (null: none yet) */
  latestSync: async (signal?: AbortSignal) => unwrap<SyncJob | null>(await client.get(ENDPOINTS.SHIPPING_SYNC_LATEST, { signal })),

  /** one shipment as a row of the shipments table, by id */
  shipmentRow: async (id: string, signal?: AbortSignal) => unwrap<ShipmentRow>(await client.get(ENDPOINTS.SHIPPING_SHIPMENT_ROW(id), { signal })),

  /** books the label of a packed order; a configured logistics provider needs the AWB it issued */
  createShipment: async (v: { fulfillmentId: string; providerCode: string; awb?: string }) =>
    unwrap<{ id: string; awb: string | null }>(await client.post(ENDPOINTS.SHIPMENTS, { fulfillmentId: v.fulfillmentId, providerCode: v.providerCode, ...(v.awb ? { manual: { awb: v.awb } } : {}) })),

  /** pickup slots: the upcoming ones (or all of them) */
  pickupSlots: async (scope: "upcoming" | "all", signal?: AbortSignal) => unwrap<{ items: PickupSlot[]; today: string }>(await client.get(ENDPOINTS.SHIPPING_PICKUP_SLOTS, { params: { scope }, signal })),

  bookPickupSlot: async (input: PickupSlotInput) => unwrap<PickupSlot>(await client.post(ENDPOINTS.SHIPPING_PICKUP_SLOTS, input)),

  cancelPickupSlot: async (id: string) => unwrap<PickupSlot>(await client.post(ENDPOINTS.SHIPPING_PICKUP_SLOT_CANCEL(id), {})),

  dispatchShipment: async (id: string) => unwrap<{ id: string }>(await client.post(ENDPOINTS.SHIPMENT_DISPATCH(id), {})),

  exceptions: async (signal?: AbortSignal) => unwrap<ExceptionsReport>(await client.get(ENDPOINTS.SHIPPING_EXCEPTIONS, { signal })),

  /** every affected order of one category */
  exceptionOrders: async (category: ExceptionKey, signal?: AbortSignal) =>
    unwrap<ExceptionsReport>(await client.get(ENDPOINTS.SHIPPING_EXCEPTIONS, { params: { category, pageSize: 100 }, signal })),

  exportExceptions: async (): Promise<DownloadedFile> => {
    const res = await client.get<Blob>(ENDPOINTS.SHIPPING_EXCEPTIONS_EXPORT, { responseType: "blob" });
    return { blob: res.data, fileName: fileNameOf(res.headers["content-disposition"], "shipping-exceptions.csv") };
  },

  // ---- tracking
  trackingList: async (query: TrackingQuery, signal?: AbortSignal) => unwrap<TrackingPage>(await client.get(ENDPOINTS.SHIPPING_TRACKING, { params: trackingParams(query), signal })),

  trackingFailures: async (signal?: AbortSignal) => unwrap<TrackingFailure[]>(await client.get(ENDPOINTS.SHIPPING_TRACKING_FAILURES, { signal })),

  /** asks the providers for news on open shipments (all of them, or the given ones) */
  syncTracking: async (shipmentIds?: string[]) =>
    unwrap<SyncResult["tracking"]>(await client.post(ENDPOINTS.SHIPPING_TRACKING_SYNC, shipmentIds ? { shipmentIds } : {})),

  // ---- rules
  rules: async (signal?: AbortSignal) => unwrap<RulesList>(await client.get(ENDPOINTS.SHIPPING_RULES, { signal })),

  createRule: async (input: RuleInput) => unwrap<ShippingRule>(await client.post(ENDPOINTS.SHIPPING_RULES, input)),

  updateRule: async (id: string, input: Partial<RuleInput>) => unwrap<ShippingRule>(await client.patch(ENDPOINTS.SHIPPING_RULE(id), input)),

  deleteRule: async (id: string) => unwrap<{ id: string; deleted: true }>(await client.delete(ENDPOINTS.SHIPPING_RULE(id))),

  ruleAction: async (id: string, action: "enable" | "disable" | "duplicate") => unwrap<ShippingRule>(await client.post(ENDPOINTS.SHIPPING_RULE_ACTION(id, action), {})),

  reorderRules: async (ids: string[]) => unwrap<RulesList>(await client.put(ENDPOINTS.SHIPPING_RULES_ORDER, { ids })),

  // ---- labels, shipments
  /** a 200 with a result per shipment, even when some of them failed */
  bulkLabels: async (shipmentIds: string[]) => unwrap<BulkLabelsResponse>(await client.post(ENDPOINTS.SHIPPING_LABELS_BULK, { shipmentIds, combine: true })),

  /** the label of one shipment as a file (the request carries the Authorization header, a plain link would not) */
  label: async (shipmentId: string): Promise<DownloadedFile> => {
    const label = unwrap<ShipmentLabel>(await client.get(ENDPOINTS.SHIPMENT_LABEL(shipmentId)));
    const name = label.awb ?? shipmentId;
    return label.format === "pdf_base64"
      ? { blob: base64ToBlob(label.content, "application/pdf"), fileName: `label-${name}.pdf` }
      : { blob: new Blob([label.content], { type: "text/plain" }), fileName: `label-${name}.txt` };
  },

  tracking: async (shipmentId: string, signal?: AbortSignal) => unwrap<TrackingEvent[]>(await client.get(ENDPOINTS.SHIPMENT_TRACKING(shipmentId), { signal })),

  refreshTracking: async (shipmentId: string) => unwrap<{ applied: number; recorded: number }>(await client.post(ENDPOINTS.SHIPMENT_REFRESH_TRACKING(shipmentId), {})),

  cancelShipment: async (shipmentId: string, reason?: string) => unwrap<{ id: string }>(await client.post(ENDPOINTS.SHIPMENT_CANCEL(shipmentId), reason ? { reason } : {})),

  /** the failed-delivery cases of one shipment */
  ndrCases: async (shipmentId: string, signal?: AbortSignal) =>
    (await client.get<{ data: NdrCase[] }>(ENDPOINTS.NDR_CASES, { params: { "filter[shipmentId]": shipmentId, limit: 20 }, signal })).data.data,

  ndrAction: async (id: string, action: NdrAction, note?: string) => unwrap<{ ndr: NdrCase }>(await client.post(ENDPOINTS.NDR_CASE_ACTION(id), { action, ...(note ? { note } : {}) })),

  manifests: async (signal?: AbortSignal) => (await client.get<{ data: Manifest[] }>(ENDPOINTS.MANIFESTS, { params: { limit: 20 }, signal })).data.data,
};
