import { keepPreviousData, useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { inventoryApi } from "@/api/inventory.api";
import { useWorkspaceStore } from "@/store/workspace.store";
import {
  SYNC_JOB_DONE,
  type FeedQuery,
  type InventoryFilters,
  type LedgerQuery,
  type QuickAdjustBody,
  type SyncJob,
  type TransferBody,
} from "@/types/inventory";

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

export const INVENTORY_KEYS = {
  all: ["inventory"] as const,
  kpis: (b: string | undefined, warehouseId: string | undefined) => ["inventory", "kpis", b, warehouseId] as const,
  ledger: (b: string | undefined, q: LedgerQuery) => ["inventory", "ledger", b, q] as const,
  allocations: (b: string | undefined, ids: string[]) => ["inventory", "allocations", b, ids] as const,
  panel: (b: string | undefined, id: string) => ["inventory", "panel", b, id] as const,
  variantStock: (b: string | undefined, id: string) => ["inventory", "variant", b, id] as const,
  feed: (b: string | undefined, q: FeedQuery) => ["inventory", "feed", b, q] as const,
  warehouses: (b: string | undefined) => ["inventory", "warehouses", b] as const,
  syncJob: (id: string) => ["inventory", "sync-job", id] as const,
};

/** the tiles and the reorder banner; they follow the warehouse filter */
export function useInventoryKpis(warehouseId: string | undefined) {
  const b = useBusinessId();
  return useQuery({
    queryKey: INVENTORY_KEYS.kpis(b, warehouseId),
    queryFn: ({ signal }) => inventoryApi.kpis(warehouseId, signal),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** one numbered page; the previous page stays on screen while the next one loads */
export function useInventoryLedger(query: LedgerQuery) {
  const b = useBusinessId();
  return useQuery({
    queryKey: INVENTORY_KEYS.ledger(b, query),
    queryFn: ({ signal }) => inventoryApi.ledger(query, signal),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** what each marketplace account may sell for the variants on screen (at most 100 per call) */
export function useAllocations(variantIds: string[]) {
  const b = useBusinessId();
  return useQuery({
    queryKey: INVENTORY_KEYS.allocations(b, variantIds),
    queryFn: ({ signal }) => inventoryApi.allocations(variantIds, signal),
    enabled: variantIds.length > 0,
    staleTime: 30_000,
  });
}

export function useVariantPanel(variantId: string | null) {
  const b = useBusinessId();
  return useQuery({
    queryKey: INVENTORY_KEYS.panel(b, variantId ?? ""),
    queryFn: ({ signal }) => inventoryApi.panel(variantId ?? "", signal),
    enabled: variantId !== null,
    retry: false,
  });
}

export function useVariantStock(variantId: string | null) {
  const b = useBusinessId();
  return useQuery({
    queryKey: INVENTORY_KEYS.variantStock(b, variantId ?? ""),
    queryFn: ({ signal }) => inventoryApi.variantStock(variantId ?? "", signal),
    enabled: variantId !== null,
    retry: false,
  });
}

/** the "recent stock movements" feed: keyset paging, newest first */
export function useMovementsFeed(query: FeedQuery) {
  const b = useBusinessId();
  return useInfiniteQuery({
    queryKey: INVENTORY_KEYS.feed(b, query),
    queryFn: ({ pageParam, signal }) => inventoryApi.movementsFeed(query, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? (last.nextCursor ?? undefined) : undefined),
    staleTime: 30_000,
  });
}

export function useWarehouses() {
  const b = useBusinessId();
  return useQuery({
    queryKey: INVENTORY_KEYS.warehouses(b),
    queryFn: ({ signal }) => inventoryApi.warehouses(signal),
    staleTime: 5 * 60_000,
  });
}

/** stock changes move the numbers of this screen, the product pages and the dashboard */
function useRefreshAfterWrite() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: INVENTORY_KEYS.all });
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useQuickAdjust() {
  const refresh = useRefreshAfterWrite();
  return useMutation({ mutationFn: (body: QuickAdjustBody) => inventoryApi.quickAdjust(body), onSuccess: refresh });
}

export function useTransferNow() {
  const refresh = useRefreshAfterWrite();
  return useMutation({ mutationFn: (body: TransferBody) => inventoryApi.transfer(body), onSuccess: refresh });
}

export function useSetReorderLevel() {
  const refresh = useRefreshAfterWrite();
  return useMutation({ mutationFn: (body: { variantId: string; warehouseId: string; reorderLevel: number | null }) => inventoryApi.setReorderLevel(body), onSuccess: refresh });
}

export function useExportInventory() {
  return useMutation({ mutationFn: (filters: InventoryFilters) => inventoryApi.exportCsv(filters) });
}

const SYNC_POLL_MS = 1500;

/**
 * "Sync all channels": POST /inventory/channel-sync answers 202 with one job per connected account; the jobs are then
 * polled until each one finished (or the status cannot be read), and the screen's numbers are refreshed once.
 */
export function useChannelSync() {
  const qc = useQueryClient();
  const start = useMutation({ mutationFn: (accountId?: string) => inventoryApi.startChannelSync(accountId) });
  const jobIds = start.data?.results.flatMap((r) => (r.jobId ? [r.jobId] : [])) ?? [];
  const jobs = useQueries({
    queries: jobIds.map((id) => ({
      queryKey: INVENTORY_KEYS.syncJob(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => inventoryApi.syncJob(id, signal),
      refetchInterval: (q: { state: { data: SyncJob | undefined } }) => (q.state.data && SYNC_JOB_DONE.includes(q.state.data.status) ? false : SYNC_POLL_MS),
      retry: false,
      gcTime: 0,
    })),
  });
  const byId = new Map<string, { job?: SyncJob; unreadable: boolean }>(jobIds.map((id, i) => [id, { job: jobs[i]?.data, unreadable: jobs[i]?.isError === true }]));
  const settled = start.isSuccess && jobIds.every((id) => {
    const j = byId.get(id);
    return j?.unreadable || (j?.job && SYNC_JOB_DONE.includes(j.job.status));
  });

  const refreshed = useRef<unknown>(null);
  useEffect(() => {
    if (settled && refreshed.current !== start.data) {
      refreshed.current = start.data;
      void qc.invalidateQueries({ queryKey: INVENTORY_KEYS.all });
    }
  }, [settled, start.data, qc]);

  return { start, byId, settled, reset: start.reset };
}
