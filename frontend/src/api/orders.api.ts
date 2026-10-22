import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  BulkOrderAction,
  BulkOrderParams,
  BulkOrdersResponse,
  CancelInput,
  CancellationReason,
  DownloadedFile,
  LedgerPage,
  LedgerQuery,
  MarketplaceRef,
  NextActions,
  OrderAccount,
  OrderActivityItem,
  OrderSavedView,
  OrderDetail,
  OrderDrawerData,
  OrderFilters,
  OrderSort,
  OrderTimelineEntry,
  OrdersSummary,
  OrdersWorkspace,
  SyncJob,
  SyncOrdersResult,
  TransitionInput,
  TransitionResult,
  WarehouseOption,
} from "@/types/orders";

/** `{marketplace:["amazon_in"]}` to the API's `filter[marketplace]=amazon_in` style; empty values are left out */
export function filterParams(f: OrderFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (f.tab && f.tab !== "all") out["filter[tab]"] = f.tab;
  if (f.marketplace?.length) out["filter[marketplace]"] = f.marketplace.join(",");
  if (f.status?.length) out["filter[status]"] = f.status.join(",");
  if (f.slaState?.length) out["filter[slaState]"] = f.slaState.join(",");
  if (f.payment) out["filter[payment]"] = f.payment;
  if (f.fulfillment?.length) out["filter[fulfillmentStatus]"] = f.fulfillment.join(",");
  if (f.attention?.length) out["filter[attention]"] = f.attention.join(",");
  if (f.date) out["filter[date]"] = f.date;
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
  const match = typeof disposition === "string" ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition) : null;
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

export const ordersApi = {
  summary: async (signal?: AbortSignal) => unwrap<OrdersSummary>(await client.get(ENDPOINTS.ORDERS_SUMMARY, { signal })),

  workspace: async (signal?: AbortSignal) => unwrap<OrdersWorkspace>(await client.get(ENDPOINTS.ORDERS_WORKSPACE, { signal })),

  ledger: async (query: LedgerQuery, signal?: AbortSignal) =>
    unwrap<LedgerPage>(await client.get(ENDPOINTS.ORDERS_LEDGER, { params: ledgerParams(query), signal })),

  /** the same filters and sort as the ledger, as a CSV file the browser can save */
  exportCsv: async (filters: OrderFilters, sort?: OrderSort): Promise<DownloadedFile> => {
    const params: Record<string, string> = filterParams(filters);
    if (sort) params.sort = sort;
    const res = await client.get<Blob>(ENDPOINTS.ORDERS_EXPORT, { params, responseType: "blob" });
    return { blob: res.data, fileName: fileNameOf(res.headers["content-disposition"], "orders.csv") };
  },

  /** newest first, across every marketplace */
  activity: async (limit = 5, signal?: AbortSignal) =>
    unwrap<OrderActivityItem[]>(await client.get(ENDPOINTS.ORDERS_ACTIVITY, { params: { limit }, signal })),

  views: async () => unwrap<OrderSavedView[]>(await client.get(ENDPOINTS.VIEWS, { params: { screen: "orders" } })),

  createView: async (input: { name: string; filters: Record<string, unknown>; sort: string | null; shared: boolean }) =>
    unwrap<OrderSavedView>(await client.post(ENDPOINTS.VIEWS, { screen: "orders", ...input })),

  deleteView: async (id: string) => {
    await client.delete(ENDPOINTS.VIEW(id));
  },

  drawer: async (id: string, signal?: AbortSignal) => unwrap<OrderDrawerData>(await client.get(ENDPOINTS.ORDER_DRAWER(id), { signal })),

  detail: async (id: string, signal?: AbortSignal) => unwrap<OrderDetail>(await client.get(ENDPOINTS.ORDER(id), { signal })),

  timeline: async (id: string, signal?: AbortSignal) => unwrap<OrderTimelineEntry[]>(await client.get(ENDPOINTS.ORDER_TIMELINE(id), { signal })),

  nextActions: async (id: string, signal?: AbortSignal) => unwrap<NextActions>(await client.get(ENDPOINTS.ORDER_NEXT_ACTIONS(id), { signal })),

  transition: async ({ id, status, version, tracking }: TransitionInput) =>
    unwrap<TransitionResult>(await client.post(ENDPOINTS.ORDER_TRANSITION(id), { status, version, ...(tracking ? { tracking } : {}) })),

  cancel: async ({ id, reason, reasonCode }: CancelInput) =>
    unwrap<TransitionResult>(await client.post(ENDPOINTS.ORDER_CANCEL(id), { reason, reasonCode })),

  /** holds stock for the lines that are still short */
  allocate: async (id: string) => unwrap<{ order: OrderDetail; reserved: number; wanted: number }>(await client.post(`${ENDPOINTS.ORDER(id)}/allocate`, {})),

  cancellationReasons: async () => unwrap<CancellationReason[]>(await client.get(ENDPOINTS.ORDERS_CANCELLATION_REASONS)),

  /** a 200 with a result per order, even when some of them failed */
  bulk: async (action: BulkOrderAction, ids: string[], params: BulkOrderParams = {}) =>
    unwrap<BulkOrdersResponse>(await client.post(ENDPOINTS.ORDERS_BULK, { action, ids, params })),

  /** connected accounts (sync targets) and the marketplaces' own names */
  channels: async (): Promise<{ accounts: OrderAccount[]; options: MarketplaceRef[] }> => {
    const [accounts, marketplaces] = await Promise.all([
      client.get<{ data: OrderAccount[] }>(ENDPOINTS.MARKETPLACE_ACCOUNTS, { params: { limit: 100 } }),
      client.get<{ data: Array<{ code: string; displayName: string }> }>(ENDPOINTS.MARKETPLACES).catch(() => null),
    ]);
    const names = new Map((marketplaces?.data.data ?? []).map((m) => [m.code, m.displayName]));
    const seen = new Map<string, MarketplaceRef>();
    for (const a of accounts.data.data) {
      if (!seen.has(a.marketplace)) seen.set(a.marketplace, { code: a.marketplace, name: names.get(a.marketplace) ?? a.displayName });
    }
    return {
      accounts: accounts.data.data.map((a) => ({ id: a.id, marketplace: a.marketplace, displayName: a.displayName, status: a.status })),
      options: [...seen.values()].sort((x, y) => x.name.localeCompare(y.name)),
    };
  },

  warehouses: async (): Promise<WarehouseOption[]> => {
    const res = await client.get<{ data: WarehouseOption[] }>(ENDPOINTS.WAREHOUSES, { params: { limit: 100, "filter[status]": "active" } });
    return res.data.data.map((w) => ({ id: w.id, code: w.code, name: w.name, isDefault: w.isDefault }));
  },

  /** 202: the import runs as a job */
  syncOrders: async (accountId: string) => unwrap<SyncOrdersResult>(await client.post(ENDPOINTS.ORDER_ACCOUNT_SYNC(accountId), {})),

  syncJob: async (jobId: string) => unwrap<SyncJob>(await client.get(ENDPOINTS.SYNC_JOB(jobId))),
};
