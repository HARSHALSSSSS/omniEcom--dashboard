import { client, toApiError, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import { catalogApi } from "./products";
import type {
  BulkCreateInput,
  BulkCreateResponse,
  BulkListingsResponse,
  ChannelSummary,
  CreateOutcome,
  CreateTarget,
  ListingAccount,
  ListingBulkAction,
  ListingChannels,
  ListingFilterOptions,
  ListingFilters,
  ListingsInsights,
  ListingsMatrix,
  ListingRow,
  ListingsOverview,
  ListingsQuery,
  ListingsTablePage,
  NotListedPage,
  ProductChoice,
  SyncJobView,
  TabCounts,
} from "@/types/listing";
import { SCREEN_STATUSES } from "@/types/listing";

const ATTENTION = ["needs_review", "failed", "blocked"];

/** the filters both the table and the product view send, in the API's `filter[...]` style; empty values are left out */
function commonParams(f: Pick<ListingFilters, "q" | "marketplace" | "accountId">): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (f.marketplace) out["filter[marketplace]"] = f.marketplace;
  if (f.accountId) out["filter[accountId]"] = f.accountId;
  return out;
}

export function tableParams(query: ListingsQuery): Record<string, string | number> {
  const params: Record<string, string | number> = commonParams(query);
  // Draft is a lifecycle status, not a screen status: its tab is the lifecycle filter
  if (query.tab === "draft") params["filter[status]"] = "draft";
  else if (query.tab !== "all" && query.tab !== "not_listed") params["filter[screenStatus]"] = query.tab;
  if (query.status && query.tab !== "draft") params["filter[status]"] = query.status;
  if (query.issue) params["filter[issue]"] = query.issue;
  if (query.categoryId) params["filter[categoryId]"] = query.categoryId;
  if (query.productStatus) params["filter[productStatus]"] = query.productStatus;
  if (query.readiness) params["filter[readiness]"] = query.readiness;
  if (query.inventory) params["filter[inventory]"] = query.inventory;
  if (query.potential) params["filter[potential]"] = query.potential;
  if (query.contentState) params["filter[contentState]"] = query.contentState;
  if (query.source) params["filter[source]"] = query.source;
  if (query.attention) params["filter[attention]"] = "true";
  if (query.page > 1) params.page = query.page;
  params.pageSize = query.pageSize;
  params.sort = query.sort;
  return params;
}

function countsOf(items: ListingRow[]): TabCounts & { draft: number } {
  const counts = { all: items.length, draft: items.filter((i) => i.status === "draft").length } as TabCounts & { draft: number };
  for (const s of SCREEN_STATUSES) counts[s] = items.filter((i) => i.table.screenStatus === s).length;
  return counts;
}

export const listingsApi = {
  overview: async (filters: Pick<ListingFilters, "marketplace" | "accountId">, signal?: AbortSignal) => {
    const params: Record<string, string> = {};
    if (filters.marketplace) params["filter[marketplace]"] = filters.marketplace;
    if (filters.accountId) params["filter[accountId]"] = filters.accountId;
    return unwrap<ListingsOverview>(await client.get(ENDPOINTS.LISTINGS_OVERVIEW, { params, signal }));
  },

  table: async (query: ListingsQuery, signal?: AbortSignal) =>
    unwrap<ListingsTablePage>(await client.get(ENDPOINTS.LISTINGS_TABLE, { params: tableParams(query), signal })),

  /** active variants x connected accounts that have no listing yet (rows are variants, not listings) */
  notListed: async (query: Pick<ListingsQuery, "q" | "marketplace" | "accountId" | "categoryId" | "page" | "pageSize">, signal?: AbortSignal) => {
    const params: Record<string, string | number> = commonParams(query);
    if (query.categoryId) params["filter[categoryId]"] = query.categoryId;
    if (query.page > 1) params.page = query.page;
    params.pageSize = query.pageSize;
    return unwrap<NotListedPage>(await client.get(ENDPOINTS.LISTINGS_NOT_LISTED, { params, signal }));
  },

  /**
   * The listings of one product. The numbered table has no product filter, so this reads the cursor list
   * (`filter[productId]`, with the table block) and applies the tab on the client; a product has few listings.
   */
  productListings: async (query: ListingsQuery, signal?: AbortSignal): Promise<ListingsTablePage> => {
    const params: Record<string, string | number> = { ...commonParams(query), include: "table", limit: 100, "filter[productId]": query.productId ?? "" };
    if (query.status) params["filter[status]"] = query.status;
    if (query.contentState) params["filter[contentState]"] = query.contentState;
    if (query.source) params["filter[source]"] = query.source;
    const res = await client.get<{ data: ListingRow[] }>(ENDPOINTS.LISTINGS, { params, signal });
    const all = res.data.data;
    const inTab = (i: ListingRow) => (query.tab === "draft" ? i.status === "draft" : query.tab === "all" || query.tab === "not_listed" || i.table.screenStatus === query.tab);
    const items = all.filter((i) => inTab(i) && (!query.attention || ATTENTION.includes(i.table.screenStatus)));
    return { items, page: 1, pageSize: Math.max(items.length, 1), total: items.length, pages: 1, counts: countsOf(all) };
  },

  /** master products x marketplaces (the matrix on top of the screen) */
  matrix: async (limit: number, signal?: AbortSignal) => unwrap<ListingsMatrix>(await client.get(ENDPOINTS.LISTINGS_MATRIX, { params: { limit }, signal })),

  /** catalogue reach and the reasons listings are not ready */
  insights: async (signal?: AbortSignal) => unwrap<ListingsInsights>(await client.get(ENDPOINTS.LISTINGS_INSIGHTS, { signal })),

  /** a 200 with a result per listing, even when some failed; publish and retry answer with a sync job id per listing */
  bulk: async (action: ListingBulkAction, ids: string[]) =>
    unwrap<BulkListingsResponse>(await client.post(ENDPOINTS.LISTINGS_BULK_ACTIONS, { action, ids })),

  /** starts a draft listing for a variant on a connected account */
  create: async (target: CreateTarget): Promise<CreateOutcome> => {
    const key = `${target.variantId}:${target.accountId}`;
    try {
      const listing = unwrap<{ id: string }>(await client.post(ENDPOINTS.LISTINGS, { marketplaceAccountId: target.accountId, variantId: target.variantId }));
      return { key, label: target.label, ok: true, message: "Draft listing created", listingId: listing.id };
    } catch (e) {
      return { key, label: target.label, ok: false, message: toApiError(e).message, listingId: null };
    }
  },

  /** every marketplace of the registry with its accounts and listing counts (the channel tabs) */
  channelSummary: async (signal?: AbortSignal) => unwrap<ChannelSummary>(await client.get(ENDPOINTS.LISTINGS_CHANNEL_SUMMARY, { signal })),

  /** the categories that have listings (the category filter) */
  filterOptions: async (signal?: AbortSignal) => unwrap<ListingFilterOptions>(await client.get(ENDPOINTS.LISTINGS_FILTER_OPTIONS, { signal })),

  /** master products x marketplace accounts: a draft listing for every pair that has none (200 with a result per pair) */
  bulkCreate: async (input: BulkCreateInput) => unwrap<BulkCreateResponse>(await client.post(ENDPOINTS.LISTINGS_BULK_CREATE, input)),

  /** active master products matching a text (the create dialog's search) */
  searchProducts: async (q: string, signal?: AbortSignal): Promise<ProductChoice[]> => {
    const page = await catalogApi.list({ q: q || undefined, status: "active", page: 1, pageSize: 12, sort: "title" }, signal);
    return page.items.map((p) => ({ id: p.id, title: p.title, sku: p.productCode, variantCount: p.variantCount, thumbnailUrl: p.summary.thumbnailUrl }));
  },

  syncJob: async (jobId: string) => unwrap<SyncJobView>(await client.get(ENDPOINTS.SYNC_JOB(jobId))),

  /** connected accounts and the marketplaces' own names (filters, create-listing targets) */
  channels: async (signal?: AbortSignal): Promise<ListingChannels> => {
    const [accounts, marketplaces] = await Promise.all([
      client.get<{ data: ListingAccount[] }>(ENDPOINTS.MARKETPLACE_ACCOUNTS, { params: { limit: 100 }, signal }),
      client.get<{ data: Array<{ code: string; displayName: string }> }>(ENDPOINTS.MARKETPLACES, { signal }).catch(() => null),
    ]);
    const names = new Map((marketplaces?.data.data ?? []).map((m) => [m.code, m.displayName]));
    const seen = new Map<string, { code: string; name: string }>();
    for (const a of accounts.data.data) {
      if (!seen.has(a.marketplace)) seen.set(a.marketplace, { code: a.marketplace, name: names.get(a.marketplace) ?? a.displayName });
    }
    return {
      accounts: accounts.data.data.map((a) => ({ id: a.id, marketplace: a.marketplace, displayName: a.displayName, status: a.status })),
      marketplaces: [...seen.values()].sort((x, y) => x.name.localeCompare(y.name)),
    };
  },
};
