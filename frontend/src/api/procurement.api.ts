import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  CancelResult,
  FromSuggestionsResult,
  PoFilters,
  PoPage,
  PoQuery,
  PoUpdate,
  PoWrite,
  ProcurementOverview,
  PurchaseOrder,
  ReceiptResult,
  ReceiveInput,
  ReorderSuggestion,
  Supplier,
  SupplierDetail,
  SupplierPage,
  SupplierProduct,
  SupplierProductInput,
  SupplierQuery,
  SupplierUpdate,
  SupplierWrite,
  VariantOfferPage,
  WarehouseOption,
} from "@/types/procurement";

/** the PO list filters in the API's `filter[...]` style; empty values are left out */
export function poFilterParams(f: PoFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (f.status) out["filter[status]"] = f.status;
  if (f.supplierId) out["filter[supplierId]"] = f.supplierId;
  if (f.warehouseId) out["filter[warehouseId]"] = f.warehouseId;
  if (f.from) out["filter[orderDateFrom]"] = f.from;
  if (f.to) out["filter[orderDateTo]"] = f.to;
  return out;
}

export function poParams(query: PoQuery): Record<string, string | number> {
  const params: Record<string, string | number> = poFilterParams(query);
  if (query.page > 1) params.page = query.page;
  params.pageSize = query.pageSize;
  params.sort = query.sort;
  return params;
}

export function supplierParams(query: SupplierQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (query.q) params.q = query.q;
  if (query.status) params["filter[status]"] = query.status;
  if (query.page > 1) params.page = query.page;
  params.pageSize = query.pageSize;
  params.sort = query.sort;
  return params;
}

const idempotent = (key: string) => ({ headers: { "Idempotency-Key": key } });

export const procurementApi = {
  overview: async (signal?: AbortSignal) => unwrap<ProcurementOverview>(await client.get(ENDPOINTS.PROCUREMENT_OVERVIEW, { signal })),

  // ---- purchase orders
  listOrders: async (query: PoQuery, signal?: AbortSignal) => unwrap<PoPage>(await client.get(ENDPOINTS.PURCHASE_ORDERS, { params: poParams(query), signal })),

  /** every order matching the filters, page by page (for the CSV export) */
  allOrders: async (filters: PoFilters & { sort: PoQuery["sort"] }, maxPages = 50) => {
    const out: PoPage["items"] = [];
    for (let page = 1; page <= maxPages; page++) {
      const res = unwrap<PoPage>(await client.get(ENDPOINTS.PURCHASE_ORDERS, { params: poParams({ ...filters, page, pageSize: 100 }) }));
      out.push(...res.items);
      if (page >= res.pages) break;
    }
    return out;
  },

  getOrder: async (id: string, signal?: AbortSignal) => unwrap<PurchaseOrder>(await client.get(ENDPOINTS.PURCHASE_ORDER(id), { signal })),

  /** one Idempotency-Key per submit attempt: a retry after a network blip returns the first purchase order */
  createOrder: async (body: PoWrite, idempotencyKey: string) => unwrap<PurchaseOrder>(await client.post(ENDPOINTS.PURCHASE_ORDERS, body, idempotent(idempotencyKey))),

  updateOrder: async (id: string, body: PoUpdate) => unwrap<PurchaseOrder>(await client.patch(ENDPOINTS.PURCHASE_ORDER(id), body)),

  deleteOrder: async (id: string) => {
    await client.delete(ENDPOINTS.PURCHASE_ORDER(id));
  },

  /** administrators only: draft to submitted, the ordered units become incoming stock */
  approveOrder: async (id: string, body: { version?: number; expectedAt?: string }) => unwrap<PurchaseOrder>(await client.post(ENDPOINTS.PURCHASE_ORDER_ACTION(id, "approve"), body)),

  acknowledgeOrder: async (id: string, body: { version?: number; expectedAt?: string }) => unwrap<PurchaseOrder>(await client.post(ENDPOINTS.PURCHASE_ORDER_ACTION(id, "acknowledge"), body)),

  /** a repeated key returns the first receipt (`duplicate`) and moves no stock */
  receiveOrder: async (id: string, body: ReceiveInput, receiptKey: string) =>
    unwrap<ReceiptResult>(await client.post(ENDPOINTS.PURCHASE_ORDER_ACTION(id, "receive"), { ...body, receiptKey }, idempotent(receiptKey))),

  cancelOrder: async (id: string, body: { reason: string; version?: number }) => unwrap<CancelResult>(await client.post(ENDPOINTS.PURCHASE_ORDER_ACTION(id, "cancel"), body)),

  duplicateOrder: async (id: string) => unwrap<PurchaseOrder>(await client.post(ENDPOINTS.PURCHASE_ORDER_ACTION(id, "duplicate"), {})),

  // ---- reorder suggestions
  suggestions: async (signal?: AbortSignal) => unwrap<{ items: ReorderSuggestion[] }>(await client.get(ENDPOINTS.PROCUREMENT_REORDER_SUGGESTIONS, { signal })).items,

  fromSuggestions: async (body: { warehouseId?: string; variantIds?: string[]; dryRun?: boolean }) =>
    unwrap<FromSuggestionsResult>(await client.post(ENDPOINTS.PURCHASE_ORDERS_FROM_SUGGESTIONS, body)),

  // ---- suppliers
  listSuppliers: async (query: SupplierQuery, signal?: AbortSignal) => unwrap<SupplierPage>(await client.get(ENDPOINTS.SUPPLIERS, { params: supplierParams(query), signal })),

  /** active suppliers for the "supplier" pickers (the first 100) */
  activeSuppliers: async (signal?: AbortSignal) =>
    unwrap<SupplierPage>(await client.get(ENDPOINTS.SUPPLIERS, { params: { "filter[status]": "active", pageSize: 100, sort: "name" }, signal })).items,

  getSupplier: async (id: string, signal?: AbortSignal) => unwrap<SupplierDetail>(await client.get(ENDPOINTS.SUPPLIER(id), { signal })),

  createSupplier: async (body: SupplierWrite) => unwrap<Supplier>(await client.post(ENDPOINTS.SUPPLIERS, body)),

  updateSupplier: async (id: string, body: SupplierUpdate) => unwrap<SupplierDetail>(await client.patch(ENDPOINTS.SUPPLIER(id), body)),

  deleteSupplier: async (id: string) => {
    await client.delete(ENDPOINTS.SUPPLIER(id));
  },

  supplierProducts: async (id: string, params: { q?: string; page?: number; pageSize?: number }, signal?: AbortSignal) => {
    const query: Record<string, string | number> = { pageSize: params.pageSize ?? 100 };
    if (params.q) query.q = params.q;
    if (params.page && params.page > 1) query.page = params.page;
    return unwrap<{ items: SupplierProduct[]; page: number; pageSize: number; total: number; pages: number }>(await client.get(ENDPOINTS.SUPPLIER_PRODUCTS(id), { params: query, signal }));
  },

  putSupplierProducts: async (id: string, items: SupplierProductInput[]) =>
    unwrap<{ items: SupplierProduct[]; total: number }>(await client.put(ENDPOINTS.SUPPLIER_PRODUCTS(id), { items })),

  removeSupplierProduct: async (id: string, variantId: string) => {
    await client.delete(ENDPOINTS.SUPPLIER_PRODUCT(id, variantId));
  },

  // ---- pickers
  /** products a PO line can be picked from; with a supplier it carries that supplier's price, MOQ and lead time */
  searchVariants: async (params: { q?: string; supplierId?: string; suppliedOnly?: boolean; page?: number; pageSize?: number }, signal?: AbortSignal) => {
    const query: Record<string, string | number> = { pageSize: params.pageSize ?? 20 };
    if (params.q) query.q = params.q;
    if (params.supplierId) query["filter[supplierId]"] = params.supplierId;
    if (params.suppliedOnly && params.supplierId) query["filter[supplied]"] = "true";
    if (params.page && params.page > 1) query.page = params.page;
    return unwrap<VariantOfferPage>(await client.get(ENDPOINTS.PROCUREMENT_VARIANTS, { params: query, signal }));
  },

  warehouses: async (signal?: AbortSignal): Promise<WarehouseOption[]> => {
    const res = await client.get<{ data: Array<{ id: string; code: string; name: string; address?: { city?: string } | null; isDefault: boolean }> }>(ENDPOINTS.WAREHOUSES, {
      params: { limit: 100, "filter[status]": "active" },
      signal,
    });
    return res.data.data.map((w) => ({ id: w.id, code: w.code, name: w.name, city: w.address?.city ?? null, isDefault: w.isDefault }));
  },
};
