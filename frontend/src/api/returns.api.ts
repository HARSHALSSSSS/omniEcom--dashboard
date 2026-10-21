import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  CreateReturnInput,
  DownloadedFile,
  Eligibility,
  InsightsData,
  LedgerPage,
  LedgerQuery,
  MarketplaceOption,
  NextActions,
  ReturnDetail,
  ReturnFilters,
  ReturnOrder,
  ReturnReason,
  ReturnsOverview,
  ReturnsSummary,
  RunActionInput,
  TabCounts,
  WarehouseOption,
} from "@/types/returns";

/** the filters in the API's `filter[...]` style; empty values are left out (the tab is a plain `tab` param) */
export function filterParams(f: ReturnFilters, withTab = true): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (withTab && f.tab && f.tab !== "all") out.tab = f.tab;
  if (f.stage) out["filter[stage]"] = f.stage;
  if (f.marketplace) out["filter[marketplace]"] = f.marketplace;
  if (f.signal) out["filter[signal]"] = f.signal;
  if (f.inspectionStatus) out["filter[inspectionStatus]"] = f.inspectionStatus;
  if (f.refundStatus) out["filter[refundStatus]"] = f.refundStatus;
  if (f.disposition) out["filter[disposition]"] = f.disposition;
  return out;
}

function ledgerParams(query: LedgerQuery): Record<string, string | number> {
  const params: Record<string, string | number> = filterParams(query);
  if (query.page && query.page > 1) params.page = query.page;
  if (query.pageSize) params.pageSize = query.pageSize;
  if (query.sort) params.sort = query.sort;
  return params;
}

function fileNameOf(disposition: unknown, fallback: string): string {
  const match = typeof disposition === "string" ? /filename="?([^";]+)"?/i.exec(disposition) : null;
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

export const returnsApi = {
  summary: async (days: number, signal?: AbortSignal) => unwrap<ReturnsSummary>(await client.get(ENDPOINTS.RETURNS_SUMMARY, { params: { days }, signal })),

  overview: async (signal?: AbortSignal) => unwrap<ReturnsOverview>(await client.get(ENDPOINTS.RETURNS_OVERVIEW, { signal })),

  insights: async (days: number, signal?: AbortSignal) => unwrap<InsightsData>(await client.get(ENDPOINTS.RETURNS_INSIGHTS, { params: { days }, signal })),

  ledger: async (query: LedgerQuery, signal?: AbortSignal) => unwrap<LedgerPage>(await client.get(ENDPOINTS.RETURNS_LEDGER, { params: ledgerParams(query), signal })),

  /** counts of the tabs under the current search and filters (the tab itself does not narrow them) */
  counts: async (filters: ReturnFilters, signal?: AbortSignal) => unwrap<TabCounts>(await client.get(ENDPOINTS.RETURNS_COUNTS, { params: filterParams(filters, false), signal })),

  /** the same tab, filters and sort as the ledger, as a CSV file the browser can save */
  exportCsv: async (query: LedgerQuery): Promise<DownloadedFile> => {
    const params: Record<string, string> = filterParams(query);
    if (query.sort) params.sort = query.sort;
    const res = await client.get<Blob>(ENDPOINTS.RETURNS_EXPORT, { params, responseType: "blob" });
    return { blob: res.data, fileName: fileNameOf(res.headers["content-disposition"], "returns.csv") };
  },

  detail: async (id: string, signal?: AbortSignal) => unwrap<ReturnDetail>(await client.get(ENDPOINTS.RETURN_DETAIL(id), { signal })),

  order: async (id: string, signal?: AbortSignal) => unwrap<ReturnOrder>(await client.get(ENDPOINTS.RETURN(id), { signal })),

  nextActions: async (id: string, signal?: AbortSignal) => unwrap<NextActions>(await client.get(ENDPOINTS.RETURN_NEXT_ACTIONS(id), { signal })),

  /** approve, receive, inspection, disposition, refund, refund/retry, complete, reject, cancel */
  run: async ({ id, action, body }: RunActionInput) => unwrap<ReturnOrder>(await client.post(ENDPOINTS.RETURN_ACTION(id, action), body)),

  reasons: async () => unwrap<ReturnReason[]>(await client.get(ENDPOINTS.RETURNS_REASONS)),

  /** the order and the units that can still come back (404 unknown order, 409 not fulfilled or channel not supported) */
  eligibility: async (order: string) => unwrap<Eligibility>(await client.get(ENDPOINTS.RETURNS_ELIGIBILITY, { params: { order } })),

  create: async (input: CreateReturnInput) => unwrap<ReturnOrder>(await client.post(ENDPOINTS.RETURNS, { source: "seller", ...input })),

  warehouses: async (): Promise<WarehouseOption[]> => {
    const res = await client.get<{ data: WarehouseOption[] }>(ENDPOINTS.WAREHOUSES, { params: { limit: 100, "filter[status]": "active" } });
    return res.data.data.map((w) => ({ id: w.id, code: w.code, name: w.name, isDefault: w.isDefault }));
  },

  /** marketplace names for the channel filter */
  marketplaces: async (): Promise<MarketplaceOption[]> => {
    const res = await client.get<{ data: Array<{ code: string; displayName: string }> }>(ENDPOINTS.MARKETPLACES);
    return res.data.data.map((m) => ({ code: m.code, name: m.displayName }));
  },
};
