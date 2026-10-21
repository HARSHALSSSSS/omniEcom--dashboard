import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { returnsApi } from "@/api/returns.api";
import { refreshShell } from "@/lib/session";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { CreateReturnInput, LedgerQuery, ReturnFilters, RunActionInput } from "@/types/returns";

export const RETURN_KEYS = {
  all: ["returns"] as const,
  summary: (businessId: string | undefined, days: number) => ["returns", "summary", businessId, days] as const,
  overview: (businessId: string | undefined) => ["returns", "overview", businessId] as const,
  insights: (businessId: string | undefined, days: number) => ["returns", "insights", businessId, days] as const,
  ledger: (businessId: string | undefined, query: LedgerQuery) => ["returns", "ledger", businessId, query] as const,
  counts: (businessId: string | undefined, filters: ReturnFilters) => ["returns", "counts", businessId, filters] as const,
  detail: (id: string) => ["returns", "detail", id] as const,
  order: (id: string) => ["returns", "order", id] as const,
  nextActions: (id: string) => ["returns", "next-actions", id] as const,
  reasons: ["returns", "reasons"] as const,
  warehouses: (businessId: string | undefined) => ["returns", "warehouses", businessId] as const,
  marketplaces: ["returns", "marketplaces"] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

/** KPI tiles and stage counts for the last `days` days */
export function useReturnsSummary(days: number) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: RETURN_KEYS.summary(businessId, days), queryFn: ({ signal }) => returnsApi.summary(days, signal), staleTime: 30_000, placeholderData: keepPreviousData });
}

/** whether a return can be created from here (a connected store that allows it) */
export function useReturnsOverview() {
  const businessId = useBusinessId();
  return useQuery({ queryKey: RETURN_KEYS.overview(businessId), queryFn: ({ signal }) => returnsApi.overview(signal), staleTime: 60_000 });
}

export function useReturnsInsights(days: number) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: RETURN_KEYS.insights(businessId, days), queryFn: ({ signal }) => returnsApi.insights(days, signal), staleTime: 60_000, placeholderData: keepPreviousData });
}

/** one numbered page; the previous page stays on screen while the next one loads */
export function useReturnsLedger(query: LedgerQuery) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: RETURN_KEYS.ledger(businessId, query), queryFn: ({ signal }) => returnsApi.ledger(query, signal), staleTime: 15_000, placeholderData: keepPreviousData });
}

/** tab counts under the current search and filters (the tab itself is not part of the key) */
export function useReturnCounts(filters: ReturnFilters) {
  const businessId = useBusinessId();
  const rest: ReturnFilters = { ...filters, tab: undefined };
  return useQuery({ queryKey: RETURN_KEYS.counts(businessId, rest), queryFn: ({ signal }) => returnsApi.counts(rest, signal), staleTime: 15_000, placeholderData: keepPreviousData });
}

export function useReturnDetail(id: string | null) {
  return useQuery({ queryKey: RETURN_KEYS.detail(id ?? ""), queryFn: ({ signal }) => returnsApi.detail(id as string, signal), enabled: Boolean(id) });
}

export function useReturnOrder(id: string | null) {
  return useQuery({ queryKey: RETURN_KEYS.order(id ?? ""), queryFn: ({ signal }) => returnsApi.order(id as string, signal), enabled: Boolean(id) });
}

export function useReturnNextActions(id: string | null) {
  return useQuery({ queryKey: RETURN_KEYS.nextActions(id ?? ""), queryFn: ({ signal }) => returnsApi.nextActions(id as string, signal), enabled: Boolean(id) });
}

export function useReturnReasons(enabled: boolean) {
  return useQuery({ queryKey: RETURN_KEYS.reasons, queryFn: returnsApi.reasons, enabled, staleTime: 10 * 60_000 });
}

export function useReturnWarehouses(enabled: boolean) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: RETURN_KEYS.warehouses(businessId), queryFn: returnsApi.warehouses, enabled, staleTime: 5 * 60_000 });
}

/** marketplace names for the channel filter; the codes on the rows are used when this cannot be loaded */
export function useReturnMarketplaces() {
  return useQuery({ queryKey: RETURN_KEYS.marketplaces, queryFn: returnsApi.marketplaces, staleTime: 10 * 60_000, retry: false });
}

/** a write changes the counts here, the Returns badge in the sidebar, and (stock, order status) the inventory and orders screens */
function useAfterWrite() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: RETURN_KEYS.all });
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    refreshShell().catch(() => undefined);
  };
}

/** approve, receive, inspection, disposition, refund, complete, reject, cancel; a failed write also refreshes (the state may have moved) */
export function useRunReturnAction() {
  const afterWrite = useAfterWrite();
  return useMutation({ mutationFn: (input: RunActionInput) => returnsApi.run(input), onSuccess: afterWrite, onError: afterWrite });
}

export function useCreateReturn() {
  const afterWrite = useAfterWrite();
  return useMutation({ mutationFn: (input: CreateReturnInput) => returnsApi.create(input), onSuccess: afterWrite });
}

export function useExportReturns() {
  return useMutation({ mutationFn: (query: LedgerQuery) => returnsApi.exportCsv(query) });
}

/** looks an order up by number and says which units can still come back */
export function useFindEligibleOrder() {
  return useMutation({ mutationFn: (order: string) => returnsApi.eligibility(order) });
}
