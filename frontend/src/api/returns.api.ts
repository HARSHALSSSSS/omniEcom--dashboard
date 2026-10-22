import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  AssignResult,
  AttentionList,
  CreateReturnInput,
  DispositionOptions,
  DownloadedFile,
  Eligibility,
  InsightsData,
  InspectionResult,
  InspectionView,
  LedgerPage,
  LedgerQuery,
  LedgerRow,
  MarkResult,
  MarketplaceOption,
  MemberOption,
  NextActions,
  RefundQuery,
  RefundQueue,
  RefundView,
  ReturnDetail,
  ReturnFilters,
  ReturnOrder,
  ReturnReason,
  ReturnsAnalytics,
  ReturnsOverview,
  ReturnsSummary,
  RunActionInput,
  SaveInspectionInput,
  SyncJob,
  SyncResult,
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

function refundParams(query: RefundQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (query.q) params.q = query.q;
  if (query.status) params["filter[status]"] = query.status;
  if (query.marketplace) params["filter[marketplace]"] = query.marketplace;
  if (query.page && query.page > 1) params.page = query.page;
  if (query.pageSize) params.pageSize = query.pageSize;
  return params;
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

  /** why products come back: reason shares of the last returns, concentration and the recommendation-only notes */
  analytics: async (days: number, signal?: AbortSignal) => unwrap<ReturnsAnalytics>(await client.get(ENDPOINTS.RETURNS_ANALYTICS, { params: { days }, signal })),

  /** one row per return that needs attention (computed live) */
  attention: async (signal?: AbortSignal) => unwrap<AttentionList>(await client.get(ENDPOINTS.RETURNS_ATTENTION, { signal })),

  exportAttention: async (): Promise<DownloadedFile> => {
    const res = await client.get<Blob>(ENDPOINTS.RETURNS_ATTENTION_EXPORT, { responseType: "blob" });
    return { blob: res.data, fileName: fileNameOf(res.headers["content-disposition"], "returns-attention.csv") };
  },

  /** the refund queue: actionable refunds plus processed ones, with the footer counts */
  refunds: async (query: RefundQuery, signal?: AbortSignal) => unwrap<RefundQueue>(await client.get(ENDPOINTS.RETURNS_REFUNDS, { params: refundParams(query), signal })),

  refundView: async (id: string, signal?: AbortSignal) => unwrap<RefundView>(await client.get(ENDPOINTS.RETURN_REFUND(id), { signal })),

  inspection: async (id: string, signal?: AbortSignal) => unwrap<InspectionView>(await client.get(ENDPOINTS.RETURN_INSPECTION(id), { signal })),

  /** saves the checklist and result; it never approves a refund or picks a disposition */
  saveInspection: async ({ id, ...body }: SaveInspectionInput) => unwrap<InspectionView>(await client.post(ENDPOINTS.RETURN_INSPECTION(id), body)),

  dispositionOptions: async (id: string, signal?: AbortSignal) => unwrap<DispositionOptions>(await client.get(ENDPOINTS.RETURN_DISPOSITION_OPTIONS(id), { signal })),

  /** names the inspector (an active member) and starts the inspection; several returns at once through the bulk path */
  assignInspection: async (ids: string[], userId: string) => unwrap<AssignResult>(await client.post(`${ENDPOINTS.RETURNS}/inspection/assign`, { ids, userId })),

  /** queues one returns sync job per connected account that can fetch returns (202), or says why nothing was queued */
  sync: async (body: { accountId?: string; since?: string } = {}) => unwrap<SyncResult>(await client.post(ENDPOINTS.RETURNS_SYNC, body)),

  /** one sync job: status, progress, stats and the per-item failures */
  syncJob: async (jobId: string, signal?: AbortSignal) => unwrap<SyncJob>(await client.get(ENDPOINTS.SYNC_JOB(jobId), { signal })),

  /** every return of a ledger query, page by page (for "Select all"); stops at `max` rows and says whether there were more */
  ledgerAll: async (query: LedgerQuery, max = 1000, signal?: AbortSignal): Promise<{ rows: LedgerRow[]; truncated: boolean }> => {
    const rows: LedgerRow[] = [];
    let page = 1;
    for (;;) {
      const res = await returnsApi.ledger({ ...query, page, pageSize: 100 }, signal);
      rows.push(...res.items);
      if (page >= res.pages || rows.length >= max) return { rows: rows.slice(0, max), truncated: res.total > max };
      page++;
    }
  },

  /** sets pass / fail / needs review on several returns without a checklist; never approves a refund or picks a disposition */
  markInspection: async (ids: string[], result: InspectionResult, note?: string) =>
    unwrap<MarkResult>(await client.post(`${ENDPOINTS.RETURNS}/inspection/mark`, { ids, result, ...(note ? { note } : {}) })),

  /** active members, to pick an inspector (needs users:read) */
  members: async (): Promise<MemberOption[]> => {
    const res = await client.get<{ data: Array<{ id: string; fullName: string }> }>(ENDPOINTS.USERS, { params: { limit: 100, "filter[status]": "active" } });
    return res.data.data.map((m) => ({ id: m.id, name: m.fullName }));
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
