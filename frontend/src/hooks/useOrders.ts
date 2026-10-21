import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ordersApi } from "@/api/orders.api";
import { refreshShell } from "@/lib/session";
import { useWorkspaceStore } from "@/store/workspace.store";
import type {
  BulkOrderAction,
  BulkOrderParams,
  CancelInput,
  LedgerQuery,
  OrderFilters,
  OrderAccount,
  OrderSort,
  SyncJob,
  TransitionInput,
} from "@/types/orders";

export const ORDER_KEYS = {
  all: ["orders"] as const,
  summary: (businessId: string | undefined) => ["orders", "summary", businessId] as const,
  workspace: (businessId: string | undefined) => ["orders", "workspace", businessId] as const,
  ledger: (businessId: string | undefined, query: LedgerQuery) => ["orders", "ledger", businessId, query] as const,
  drawer: (id: string) => ["orders", "drawer", id] as const,
  detail: (id: string) => ["orders", "detail", id] as const,
  timeline: (id: string) => ["orders", "timeline", id] as const,
  nextActions: (id: string) => ["orders", "next-actions", id] as const,
  channels: (businessId: string | undefined) => ["orders", "channels", businessId] as const,
  warehouses: (businessId: string | undefined) => ["orders", "warehouses", businessId] as const,
  reasons: ["orders", "cancellation-reasons"] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

/** tiles, tab counts and the SLA bands */
export function useOrdersSummary() {
  const businessId = useBusinessId();
  return useQuery({ queryKey: ORDER_KEYS.summary(businessId), queryFn: ({ signal }) => ordersApi.summary(signal), staleTime: 30_000 });
}

/** the SLA pressure text of the banner */
export function useOrdersWorkspace() {
  const businessId = useBusinessId();
  return useQuery({ queryKey: ORDER_KEYS.workspace(businessId), queryFn: ({ signal }) => ordersApi.workspace(signal), staleTime: 30_000 });
}

/** one numbered page; the previous page stays on screen while the next one loads */
export function useOrdersLedger(query: LedgerQuery) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: ORDER_KEYS.ledger(businessId, query),
    queryFn: ({ signal }) => ordersApi.ledger(query, signal),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function useOrderDrawer(id: string | null) {
  return useQuery({ queryKey: ORDER_KEYS.drawer(id ?? ""), queryFn: ({ signal }) => ordersApi.drawer(id as string, signal), enabled: Boolean(id) });
}

export function useOrderDetail(id: string | null) {
  return useQuery({ queryKey: ORDER_KEYS.detail(id ?? ""), queryFn: ({ signal }) => ordersApi.detail(id as string, signal), enabled: Boolean(id) });
}

export function useOrderTimeline(id: string | null) {
  return useQuery({ queryKey: ORDER_KEYS.timeline(id ?? ""), queryFn: ({ signal }) => ordersApi.timeline(id as string, signal), enabled: Boolean(id) });
}

export function useNextActions(id: string | null) {
  return useQuery({ queryKey: ORDER_KEYS.nextActions(id ?? ""), queryFn: ({ signal }) => ordersApi.nextActions(id as string, signal), enabled: Boolean(id) });
}

/** connected accounts and the marketplaces' names (tabs, chips, sync) */
export function useOrderChannels() {
  const businessId = useBusinessId();
  return useQuery({ queryKey: ORDER_KEYS.channels(businessId), queryFn: ordersApi.channels, staleTime: 5 * 60_000, retry: false });
}

export function useWarehouseOptions(enabled: boolean) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: ORDER_KEYS.warehouses(businessId), queryFn: ordersApi.warehouses, enabled, staleTime: 5 * 60_000 });
}

export function useCancellationReasons(enabled: boolean) {
  return useQuery({ queryKey: ORDER_KEYS.reasons, queryFn: ordersApi.cancellationReasons, enabled, staleTime: 10 * 60_000 });
}

/** every write changes the counts on the screen and the Orders badge in the sidebar */
function useAfterWrite() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ORDER_KEYS.all });
    refreshShell().catch(() => undefined);
  };
}

export function useTransitionOrder() {
  const afterWrite = useAfterWrite();
  return useMutation({ mutationFn: (input: TransitionInput) => ordersApi.transition(input), onSuccess: afterWrite, onError: afterWrite });
}

export function useCancelOrder() {
  const afterWrite = useAfterWrite();
  return useMutation({ mutationFn: (input: CancelInput) => ordersApi.cancel(input), onSuccess: afterWrite });
}

export function useAllocateOrder() {
  const afterWrite = useAfterWrite();
  return useMutation({ mutationFn: (id: string) => ordersApi.allocate(id), onSuccess: afterWrite });
}

export function useBulkOrders() {
  const afterWrite = useAfterWrite();
  return useMutation({
    mutationFn: (input: { action: BulkOrderAction; ids: string[]; params?: BulkOrderParams }) => ordersApi.bulk(input.action, input.ids, input.params),
    onSuccess: afterWrite,
  });
}

export function useExportOrders() {
  return useMutation({ mutationFn: (input: { filters: OrderFilters; sort?: OrderSort }) => ordersApi.exportCsv(input.filters, input.sort) });
}

const TERMINAL: ReadonlyArray<SyncJob["status"]> = ["succeeded", "partially_failed", "failed", "dead_lettered", "cancelled"];
export const SYNC_POLL_MS = 1500;
const SYNC_MAX_POLLS = 60;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface SyncOutcome {
  accountName: string;
  status: SyncJob["status"] | "running";
  alreadyQueued: boolean;
  error: string | null;
}

/** queues the order import of each account (202), follows every job until it ends, then refreshes the screen */
export function useSyncOrders() {
  const afterWrite = useAfterWrite();
  return useMutation({
    mutationFn: async (accounts: OrderAccount[]): Promise<SyncOutcome[]> =>
      Promise.all(
        accounts.map(async (account): Promise<SyncOutcome> => {
          const started = await ordersApi.syncOrders(account.id);
          let job = started.job;
          for (let polls = 0; !TERMINAL.includes(job.status) && polls < SYNC_MAX_POLLS; polls++) {
            await wait(SYNC_POLL_MS);
            job = await ordersApi.syncJob(job.id);
          }
          return {
            accountName: account.displayName,
            status: TERMINAL.includes(job.status) ? job.status : "running",
            alreadyQueued: started.alreadyQueued,
            error: job.error?.message ?? null,
          };
        }),
      ),
    onSettled: afterWrite,
  });
}
