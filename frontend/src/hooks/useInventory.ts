import { keepPreviousData, useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { inventoryApi } from "@/api/inventory.api";
import { useWorkspaceStore } from "@/store/workspace.store";
import {
  SYNC_JOB_DONE,
  type FeedQuery,
  type AdjustmentBody,
  type BulkBody,
  type InventoryFilters,
  type LedgerQuery,
  type SyncJob,
  type TransferBody,
  type TransferDraftBody,
  type TransferDraftPatch,
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
  overview: (b: string | undefined, warehouseId: string | undefined) => ["inventory", "overview", b, warehouseId] as const,
  channelState: (b: string | undefined) => ["inventory", "channel-state", b] as const,
  affected: (b: string | undefined, accountId: string, page: number) => ["inventory", "affected", b, accountId, page] as const,
  groups: (b: string | undefined) => ["inventory", "groups", b] as const,
  drafts: (b: string | undefined) => ["inventory", "transfers", "draft", b] as const,
  presets: (b: string | undefined) => ["inventory", "presets", b] as const,
  selectionCount: (b: string | undefined, f: InventoryFilters) => ["inventory", "selection-count", b, f] as const,
};

/** the stock pulse, horizon, signals, advisory, distribution and recent movements; they follow the warehouse filter */
export function useInventoryOverview(warehouseId: string | undefined) {
  const b = useBusinessId();
  return useQuery({
    queryKey: INVENTORY_KEYS.overview(b, warehouseId),
    queryFn: ({ signal }) => inventoryApi.overview(warehouseId, signal),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** master stock and the state of every marketplace account */
export function useChannelSyncState() {
  const b = useBusinessId();
  return useQuery({
    queryKey: INVENTORY_KEYS.channelState(b),
    queryFn: ({ signal }) => inventoryApi.channelSyncState(signal),
    staleTime: 30_000,
  });
}

/** the SKUs whose last push to one account was rejected or differs (numbered pages) */
export function useAffectedListings(accountId: string | null, page: number) {
  const b = useBusinessId();
  return useQuery({
    queryKey: INVENTORY_KEYS.affected(b, accountId ?? "", page),
    queryFn: ({ signal }) => inventoryApi.affectedListings(accountId ?? "", page, signal),
    enabled: accountId !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useGroups() {
  const b = useBusinessId();
  return useQuery({ queryKey: INVENTORY_KEYS.groups(b), queryFn: ({ signal }) => inventoryApi.groups(signal), staleTime: 60_000 });
}

/** "N products selected" for the whole filter ("All matching") */
export function useSelectionCount(filters: InventoryFilters, enabled: boolean) {
  const b = useBusinessId();
  return useQuery({
    queryKey: INVENTORY_KEYS.selectionCount(b, filters),
    queryFn: ({ signal }) => inventoryApi.selectionCount(filters, signal),
    enabled,
    staleTime: 30_000,
  });
}

/** the exact numbers a write would give, computed on the server inside a rolled-back savepoint */
export function useAdjustmentPreview(body: AdjustmentBody | null) {
  const b = useBusinessId();
  return useQuery({
    queryKey: ["inventory", "adjust-preview", b, body],
    queryFn: ({ signal }) => inventoryApi.previewAdjustment(body as AdjustmentBody, signal),
    enabled: body !== null,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}

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
export function useInventoryLedger(query: LedgerQuery, enabled = true) {
  const b = useBusinessId();
  return useQuery({
    queryKey: INVENTORY_KEYS.ledger(b, query),
    queryFn: ({ signal }) => inventoryApi.ledger(query, signal),
    enabled,
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

export function useAdjustStock() {
  const refresh = useRefreshAfterWrite();
  return useMutation({ mutationFn: (body: AdjustmentBody) => inventoryApi.adjust(body), onSuccess: refresh });
}

/** adjust / transfer / export / sync / group on a selection (ids, or every product the filters match) */
export function useBulkAction() {
  const refresh = useRefreshAfterWrite();
  return useMutation({ mutationFn: (body: BulkBody) => inventoryApi.bulk(body), onSuccess: refresh });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (name: string) => inventoryApi.createGroup(name), onSuccess: () => void qc.invalidateQueries({ queryKey: ["inventory", "groups"] }) });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => inventoryApi.deleteGroup(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ["inventory", "groups"] }) });
}

export function useTransferNow() {
  const refresh = useRefreshAfterWrite();
  return useMutation({ mutationFn: (body: TransferBody) => inventoryApi.transfer(body), onSuccess: refresh });
}

/** the draft stock transfers: saved, not yet submitted (nothing has moved) */
export function useDraftTransfers() {
  const b = useBusinessId();
  return useQuery({ queryKey: INVENTORY_KEYS.drafts(b), queryFn: ({ signal }) => inventoryApi.transfers("draft", signal), staleTime: 30_000 });
}

function useRefreshDrafts() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["inventory", "transfers"] });
}

export function useCreateDraftTransfer() {
  const refresh = useRefreshDrafts();
  return useMutation({ mutationFn: (body: TransferDraftBody) => inventoryApi.createDraft(body), onSuccess: refresh });
}

export function useUpdateDraftTransfer() {
  const refresh = useRefreshDrafts();
  return useMutation({ mutationFn: (v: { id: string; patch: TransferDraftPatch }) => inventoryApi.updateDraft(v.id, v.patch), onSuccess: refresh });
}

/** submitting moves the stock: the numbers of the whole screen change */
export function useSubmitDraftTransfer() {
  const refresh = useRefreshAfterWrite();
  return useMutation({ mutationFn: (id: string) => inventoryApi.submitDraft(id), onSuccess: refresh });
}

export function useDiscardDraftTransfer() {
  const refresh = useRefreshDrafts();
  return useMutation({ mutationFn: (id: string) => inventoryApi.discardDraft(id), onSuccess: refresh });
}

/** the saved filters (presets) of this screen: the person's own and the shared ones */
export function useInventoryPresets() {
  const b = useBusinessId();
  return useQuery({ queryKey: INVENTORY_KEYS.presets(b), queryFn: () => inventoryApi.presets(), staleTime: 60_000 });
}

export function useCreateInventoryPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof inventoryApi.createPreset>[0]) => inventoryApi.createPreset(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["inventory", "presets"] }),
  });
}

export function useDeleteInventoryPreset() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => inventoryApi.deletePreset(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ["inventory", "presets"] }) });
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
