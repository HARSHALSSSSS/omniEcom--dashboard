import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  AddCarrierInput,
  BulkLabelsResponse,
  CarriersOverview,
  DownloadedFile,
  Manifest,
  NdrAction,
  NdrCase,
  ProviderCatalogEntry,
  ShipmentFilters,
  ShipmentLabel,
  ShipmentsPage,
  ShipmentsQuery,
  ShippingSummary,
  TrackingEvent,
  VerifyResult,
} from "@/types/shipping";

export interface WarehouseOption {
  id: string;
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

/** a base64 string to a file the browser can save or open */
export function base64ToBlob(content: string, type: string): Blob {
  const raw = atob(content);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type });
}

export const shippingApi = {
  summary: async (days: number, signal?: AbortSignal) => unwrap<ShippingSummary>(await client.get(ENDPOINTS.SHIPPING_SUMMARY, { params: { days }, signal })),

  shipments: async (query: ShipmentsQuery, signal?: AbortSignal) =>
    unwrap<ShipmentsPage>(await client.get(ENDPOINTS.SHIPPING_SHIPMENTS, { params: shipmentsParams(query), signal })),

  carriers: async (signal?: AbortSignal) => unwrap<CarriersOverview>(await client.get(ENDPOINTS.SHIPPING_CARRIERS, { signal })),

  providerCatalog: async () => unwrap<ProviderCatalogEntry[]>(await client.get(ENDPOINTS.SHIPPING_PROVIDER_CATALOG)),

  /** creates the carrier unverified, then runs the safe capability check; a failed check leaves it in "needs configuration" */
  addCarrier: async (input: AddCarrierInput): Promise<VerifyResult> => {
    const created = unwrap<{ id: string }>(
      await client.post(ENDPOINTS.SHIPPING_METHODS, { kind: "third_party", providerCode: input.providerCode, ...(input.label ? { label: input.label } : {}), config: input.config }),
    );
    return unwrap<VerifyResult>(await client.post(ENDPOINTS.SHIPPING_METHOD_VERIFY(created.id), {}));
  },

  verifyCarrier: async (methodId: string) => unwrap<VerifyResult>(await client.post(ENDPOINTS.SHIPPING_METHOD_VERIFY(methodId), {})),

  warehouses: async (): Promise<WarehouseOption[]> => {
    const res = await client.get<{ data: WarehouseOption[] }>(ENDPOINTS.WAREHOUSES, { params: { limit: 100, "filter[status]": "active" } });
    return res.data.data.map((w) => ({ id: w.id, name: w.name }));
  },

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
