import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  BulkProductAction,
  BulkResponse,
  CatalogFilters,
  CatalogPage,
  CatalogQuery,
  CatalogStats,
  CategoryNode,
  CreateProductInput,
  DataJob,
  Product,
  SavedView,
} from "@/types/product";

export interface AiSuggestResponse {
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedBullets: string[];
  seoKeywords: string[];
}

/** a connected marketplace the catalog can be filtered by */
export interface ChannelOption {
  code: string;
  name: string;
}

/** `{status:"draft"}` to the API's `filter[status]=draft` style; empty values are left out */
export function filterParams(f: CatalogFilters, withStatus: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (withStatus && f.status) out["filter[status]"] = f.status;
  if (f.categoryId) out["filter[categoryId]"] = f.categoryId;
  if (f.channel) out["filter[channel]"] = f.channel;
  if (f.inventory) out["filter[inventory]"] = f.inventory;
  if (f.productType) out["filter[productType]"] = f.productType;
  if (withStatus && f.needsAttention) out["filter[needsAttention]"] = "true";
  return out;
}

function catalogParams(query: CatalogQuery): Record<string, string | number> {
  const params: Record<string, string | number> = filterParams(query, true);
  if (query.page && query.page > 1) params.page = query.page;
  if (query.pageSize) params.pageSize = query.pageSize;
  if (query.sort) params.sort = query.sort;
  return params;
}

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}

function fileNameOf(disposition: unknown, fallback: string): string {
  const match = typeof disposition === "string" ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition) : null;
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

export const catalogApi = {
  /** tab counts + the KPI strip; status and needsAttention are what the tabs split on, so they are never sent */
  stats: async (filters: CatalogFilters, signal?: AbortSignal) =>
    unwrap<CatalogStats>(await client.get(ENDPOINTS.PRODUCTS_STATS, { params: filterParams(filters, false), signal })),

  list: async (query: CatalogQuery, signal?: AbortSignal) =>
    unwrap<CatalogPage>(await client.get(ENDPOINTS.PRODUCTS_CATALOG, { params: catalogParams(query), signal })),

  bulk: async (ids: string[], action: BulkProductAction) =>
    unwrap<BulkResponse>(await client.post(ENDPOINTS.PRODUCTS_BULK_ACTIONS, { ids, action })),

  duplicate: async (id: string) => unwrap<{ id: string; productCode: string }>(await client.post(ENDPOINTS.PRODUCT_DUPLICATE(id), {})),

  remove: async (id: string) => {
    await client.delete(ENDPOINTS.PRODUCT(id));
  },

  /** the whole filtered catalogue as CSV (one row per variant, 50,000 rows at most: 413 beyond that) */
  exportCsv: async (query: CatalogQuery): Promise<DownloadedFile> => {
    const params = filterParams(query, true);
    if (query.sort) params.sort = query.sort;
    const res = await client.get<Blob>(ENDPOINTS.PRODUCTS_EXPORT, { params, responseType: "blob" });
    return { blob: res.data, fileName: fileNameOf(res.headers["content-disposition"], "products.csv") };
  },

  /** queues the asynchronous export; the endpoint filters by status, category and text only */
  queueExport: async (filters: CatalogFilters) => {
    const body: Record<string, string> = {};
    if (filters.status) body.status = filters.status;
    if (filters.categoryId) body.categoryId = filters.categoryId;
    if (filters.q) body.q = filters.q;
    return unwrap<DataJob>(await client.post(ENDPOINTS.PRODUCTS_EXPORTS, body));
  },

  dataJob: async (id: string) => unwrap<DataJob>(await client.get(ENDPOINTS.DATA_JOB(id))),

  downloadDataJob: async (id: string): Promise<DownloadedFile> => {
    const res = await client.get<Blob>(ENDPOINTS.DATA_JOB_DOWNLOAD(id), { responseType: "blob" });
    return { blob: res.data, fileName: fileNameOf(res.headers["content-disposition"], "products.csv") };
  },

  views: async () => unwrap<SavedView[]>(await client.get(ENDPOINTS.VIEWS, { params: { screen: "products" } })),

  createView: async (input: { name: string; filters: Record<string, unknown>; sort: string | null; shared: boolean }) =>
    unwrap<SavedView>(await client.post(ENDPOINTS.VIEWS, { screen: "products", ...input })),

  deleteView: async (id: string) => {
    await client.delete(ENDPOINTS.VIEW(id));
  },

  categoryTree: async () => unwrap<CategoryNode[]>(await client.get(ENDPOINTS.CATEGORIES_TREE)),

  /** the marketplaces the business has connected, by marketplace code, with the marketplace's own name */
  channels: async (): Promise<ChannelOption[]> => {
    const [accounts, marketplaces] = await Promise.all([
      client.get<{ data: Array<{ marketplace: string; displayName: string }> }>(ENDPOINTS.MARKETPLACE_ACCOUNTS, { params: { limit: 100 } }),
      client.get<{ data: Array<{ code: string; displayName: string }> }>(ENDPOINTS.MARKETPLACES).catch(() => null),
    ]);
    const names = new Map((marketplaces?.data.data ?? []).map((m) => [m.code, m.displayName]));
    const seen = new Map<string, ChannelOption>();
    for (const a of accounts.data.data) {
      if (!seen.has(a.marketplace)) seen.set(a.marketplace, { code: a.marketplace, name: names.get(a.marketplace) ?? a.displayName });
    }
    return [...seen.values()].sort((x, y) => x.name.localeCompare(y.name));
  },
};

/** the product endpoints the create / edit / detail screens still use (each of those sections replaces its part) */
export const productsApi = {
  getProduct: async (id: string): Promise<Product> => {
    const response = await client.get<{ data: Product }>(`/products/${id}`);
    return response.data.data;
  },

  createProduct: async (input: CreateProductInput): Promise<Product> => {
    const response = await client.post<{ data: Product }>("/products", input);
    return response.data.data;
  },

  updateProduct: async (id: string, input: Partial<Product>): Promise<Product> => {
    const response = await client.put<{ data: Product }>(`/products/${id}`, input);
    return response.data.data;
  },

  getAiSuggestions: async (title: string, description: string): Promise<AiSuggestResponse> => {
    const response = await client.post<AiSuggestResponse>("/products/ai-suggest", {
      title,
      description,
    });
    return response.data;
  },
};
