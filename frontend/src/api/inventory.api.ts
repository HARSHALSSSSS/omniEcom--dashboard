import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  CatalogVariant,
  AdjustmentBody,
  AdjustmentPreview,
  AdjustmentResult,
  AffectedPage,
  BulkBody,
  BulkResult,
  ChannelSyncState,
  InventoryGroup,
  InventoryOverview,
  InventoryPreset,
  StockTransfer,
  TransferDraftBody,
  TransferDraftPatch,
  FeedPage,
  FeedQuery,
  InventoryFilters,
  InventoryKpis,
  LedgerPage,
  LedgerQuery,
  SyncJob,
  SyncStartResult,
  TransferBody,
  TransferResult,
  VariantAllocation,
  VariantPanel,
  VariantStock,
  Warehouse,
} from "@/types/inventory";
import { filterBody } from "@/types/inventory";

/** `{stockStatus:"low_stock"}` to the API's `filter[stockStatus]=low_stock` style; empty values are left out */
export function filterParams(f: InventoryFilters): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (f.q) out.q = f.q;
  if (f.stockStatus) out["filter[stockStatus]"] = f.stockStatus;
  if (f.warehouse) out["filter[warehouse]"] = f.warehouse;
  if (f.channel) out["filter[channel]"] = f.channel;
  if (f.health) out["filter[health]"] = f.health;
  if (f.signal) out["filter[signal]"] = f.signal;
  if (f.movement) out["filter[movement]"] = f.movement;
  if (f.stockMin !== undefined) out["filter[stockMin]"] = f.stockMin;
  if (f.stockMax !== undefined) out["filter[stockMax]"] = f.stockMax;
  if (f.group) out["filter[group]"] = f.group;
  return out;
}

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

function fileNameOf(disposition: unknown, fallback: string): string {
  const match = typeof disposition === "string" ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition) : null;
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

interface RawWarehouse {
  id: string;
  code: string;
  name: string;
  address?: { city?: string } | null;
  isDefault: boolean;
}

export const inventoryApi = {
  kpis: async (warehouseId: string | undefined, signal?: AbortSignal) =>
    unwrap<InventoryKpis>(await client.get(ENDPOINTS.INVENTORY_KPIS, { params: warehouseId ? { warehouseId } : {}, signal })),

  ledger: async (query: LedgerQuery, signal?: AbortSignal) => {
    const params = filterParams(query);
    if (query.page && query.page > 1) params.page = query.page;
    if (query.pageSize) params.pageSize = query.pageSize;
    if (query.sort) params.sort = query.sort;
    return unwrap<LedgerPage>(await client.get(ENDPOINTS.INVENTORY_LEDGER, { params, signal }));
  },

  /** variants of the catalog by SKU / barcode / name; `unstocked` keeps only those that have no stock row yet */
  catalogVariants: async (query: { q?: string; unstocked?: boolean; limit?: number }, signal?: AbortSignal) =>
    unwrap<CatalogVariant[]>(await client.get(ENDPOINTS.INVENTORY_CATALOG_VARIANTS, { params: { ...(query.q ? { q: query.q } : {}), ...(query.unstocked ? { unstocked: "true" } : {}), ...(query.limit ? { limit: query.limit } : {}) }, signal })),

  /** the whole filtered ledger as CSV (413 when too many rows match) */
  exportCsv: async (filters: InventoryFilters): Promise<DownloadedFile> => {
    const res = await client.get<Blob>(ENDPOINTS.INVENTORY_EXPORT, { params: filterParams(filters), responseType: "blob" });
    return { blob: res.data, fileName: fileNameOf(res.headers["content-disposition"], "inventory.csv") };
  },

  panel: async (variantId: string, signal?: AbortSignal) => unwrap<VariantPanel>(await client.get(ENDPOINTS.INVENTORY_VARIANT_PANEL(variantId), { signal })),

  variantStock: async (variantId: string, signal?: AbortSignal) => unwrap<VariantStock>(await client.get(ENDPOINTS.INVENTORY_VARIANT(variantId), { signal })),

  allocations: async (variantIds: string[], signal?: AbortSignal) =>
    unwrap<VariantAllocation[]>(await client.get(ENDPOINTS.INVENTORY_ALLOCATIONS, { params: { variantIds: variantIds.join(",") }, signal })),

  movementsFeed: async (query: FeedQuery, cursor: string | undefined, signal?: AbortSignal): Promise<FeedPage> => {
    const params: Record<string, string | number> = { limit: 10 };
    if (cursor) params.cursor = cursor;
    if (query.type) params["filter[type]"] = query.type;
    if (query.warehouseId) params["filter[warehouseId]"] = query.warehouseId;
    const res = await client.get<{ data: FeedPage["items"]; meta: { nextCursor: string | null; hasMore: boolean } }>(ENDPOINTS.INVENTORY_MOVEMENTS_FEED, { params, signal });
    return { items: res.data.data, nextCursor: res.data.meta.nextCursor, hasMore: res.data.meta.hasMore };
  },

  warehouses: async (signal?: AbortSignal): Promise<Warehouse[]> => {
    const res = await client.get<{ data: RawWarehouse[] }>(ENDPOINTS.WAREHOUSES, { params: { limit: 100, "filter[status]": "active" }, signal });
    return res.data.data.map((w) => ({ id: w.id, code: w.code, name: w.name, city: w.address?.city ?? null, isDefault: w.isDefault }));
  },

  /** the top of the page in one call: stock pulse, horizon, signals, advisory, distribution, recent movements */
  overview: async (warehouseId: string | undefined, signal?: AbortSignal) =>
    unwrap<InventoryOverview>(await client.get(ENDPOINTS.INVENTORY_OVERVIEW, { params: { movements: 5, limit: 5, ...(warehouseId ? { warehouseId } : {}) }, signal })),

  /** master stock, one state per marketplace account, incidents, the four operational counters */
  channelSyncState: async (signal?: AbortSignal) => unwrap<ChannelSyncState>(await client.get(ENDPOINTS.INVENTORY_CHANNEL_SYNC_STATE, { signal })),

  affectedListings: async (accountId: string, page: number, signal?: AbortSignal) =>
    unwrap<AffectedPage>(await client.get(ENDPOINTS.INVENTORY_CHANNEL_SYNC_AFFECTED(accountId), { params: { page, pageSize: 10 }, signal })),

  /** one ledger movement by type; the dry run answers with the numbers (or the exact error the write would give) */
  adjust: async (body: AdjustmentBody) => unwrap<AdjustmentResult>(await client.post(ENDPOINTS.INVENTORY_ADJUSTMENTS, body)),

  previewAdjustment: async (body: AdjustmentBody, signal?: AbortSignal) => unwrap<AdjustmentPreview>(await client.post(ENDPOINTS.INVENTORY_ADJUSTMENTS_PREVIEW, body, { signal })),

  bulk: async (body: BulkBody) => unwrap<BulkResult>(await client.post(ENDPOINTS.INVENTORY_BULK, body)),

  selectionCount: async (filters: InventoryFilters, signal?: AbortSignal) =>
    unwrap<{ total: number }>(await client.post(ENDPOINTS.INVENTORY_SELECTION_COUNT, { filters: filterBody(filters) }, { signal })),

  groups: async (signal?: AbortSignal) => unwrap<InventoryGroup[]>(await client.get(ENDPOINTS.INVENTORY_GROUPS, { signal })),

  createGroup: async (name: string) => unwrap<InventoryGroup>(await client.post(ENDPOINTS.INVENTORY_GROUPS, { name })),

  deleteGroup: async (id: string) => {
    await client.delete(ENDPOINTS.INVENTORY_GROUP(id));
  },

  transfer: async (body: TransferBody) => unwrap<TransferResult>(await client.post(ENDPOINTS.INVENTORY_TRANSFER_NOW, body)),

  /** the transfers in one state (the Draft transfers section asks for `draft`), newest first */
  transfers: async (status: "draft", signal?: AbortSignal): Promise<StockTransfer[]> => {
    const res = await client.get<{ data: StockTransfer[] }>(ENDPOINTS.INVENTORY_TRANSFERS, { params: { limit: 100, "filter[status]": status }, signal });
    return res.data.data;
  },

  /** saves a transfer as a draft: nothing moves until it is submitted */
  createDraft: async (body: TransferDraftBody) => unwrap<StockTransfer>(await client.post(ENDPOINTS.INVENTORY_TRANSFERS, body)),

  updateDraft: async (id: string, body: TransferDraftPatch) => unwrap<StockTransfer>(await client.patch(ENDPOINTS.INVENTORY_TRANSFER(id), body)),

  /** the stock moves now (409 INSUFFICIENT_STOCK when the source cannot cover a line); repeating it changes nothing */
  submitDraft: async (id: string) => unwrap<{ duplicate: boolean; transfer: StockTransfer }>(await client.post(ENDPOINTS.INVENTORY_TRANSFER_SUBMIT(id), {})),

  discardDraft: async (id: string) => unwrap<StockTransfer>(await client.post(ENDPOINTS.INVENTORY_TRANSFER_CANCEL(id), {})),

  presets: async () => unwrap<InventoryPreset[]>(await client.get(ENDPOINTS.VIEWS, { params: { screen: "inventory" } })),

  createPreset: async (input: { name: string; filters: Record<string, unknown>; sort: string | null; shared: boolean }) =>
    unwrap<InventoryPreset>(await client.post(ENDPOINTS.VIEWS, { screen: "inventory", ...input })),

  deletePreset: async (id: string) => {
    await client.delete(ENDPOINTS.VIEW(id));
  },

  setReorderLevel: async (body: { variantId: string; warehouseId: string; reorderLevel: number | null }) => {
    await client.put(ENDPOINTS.INVENTORY_REORDER_LEVEL, body);
  },

  /** queues one inventory push per connected account (202) */
  startChannelSync: async (accountId?: string) => unwrap<SyncStartResult>(await client.post(ENDPOINTS.INVENTORY_CHANNEL_SYNC, accountId ? { accountId } : {})),

  syncJob: async (jobId: string, signal?: AbortSignal) => unwrap<SyncJob>(await client.get(ENDPOINTS.SYNC_JOB(jobId), { signal })),
};
