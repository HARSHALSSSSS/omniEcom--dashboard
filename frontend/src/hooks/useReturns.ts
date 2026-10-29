import { useRef } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { returnsApi } from "@/api/returns.api";
import { refreshShell } from "@/lib/session";
import { useWorkspaceStore } from "@/store/workspace.store";
import { SYNC_JOB_DONE, type CreateReturnInput, type InspectionResult, type LedgerQuery, type RefundQuery, type ReturnFilters, type RunActionInput, type SaveInspectionInput, type SyncAccountReport, type SyncReport } from "@/types/returns";

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
  analytics: (businessId: string | undefined, days: number) => ["returns", "analytics", businessId, days] as const,
  attention: (businessId: string | undefined) => ["returns", "attention", businessId] as const,
  refunds: (businessId: string | undefined, query: RefundQuery) => ["returns", "refunds", businessId, query] as const,
  refundView: (id: string) => ["returns", "refund-view", id] as const,
  inspection: (id: string) => ["returns", "inspection", id] as const,
  dispositionOptions: (id: string) => ["returns", "disposition-options", id] as const,
  members: (businessId: string | undefined) => ["returns", "members", businessId] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

/** KPI tiles and stage counts for the last `days` days */
export function useReturnsSummary(days: number, enabled = true) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: RETURN_KEYS.summary(businessId, days), queryFn: ({ signal }) => returnsApi.summary(days, signal), staleTime: 30_000, placeholderData: keepPreviousData, enabled });
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
  return useGuardedMutation({ mutationFn: (input: RunActionInput) => returnsApi.run(input), onSuccess: afterWrite, onError: afterWrite });
}

export function useCreateReturn() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({ mutationFn: (input: CreateReturnInput) => returnsApi.create(input), onSuccess: afterWrite });
}

export function useExportReturns() {
  return useGuardedMutation({ mutationFn: (query: LedgerQuery) => returnsApi.exportCsv(query) });
}

/** looks an order up by number and says which units can still come back */
export function useFindEligibleOrder() {
  return useGuardedMutation({ mutationFn: (order: string) => returnsApi.eligibility(order) });
}

/** why products come back (reason shares, concentration, recommendation-only notes) */
export function useReturnsAnalytics(days: number) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: RETURN_KEYS.analytics(businessId, days), queryFn: ({ signal }) => returnsApi.analytics(days, signal), staleTime: 60_000, placeholderData: keepPreviousData });
}

/** the returns that need attention, one row each */
export function useReturnsAttention() {
  const businessId = useBusinessId();
  return useQuery({ queryKey: RETURN_KEYS.attention(businessId), queryFn: ({ signal }) => returnsApi.attention(signal), staleTime: 15_000, placeholderData: keepPreviousData });
}

export function useReturnsRefunds(query: RefundQuery, enabled = true) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: RETURN_KEYS.refunds(businessId, query), queryFn: ({ signal }) => returnsApi.refunds(query, signal), enabled, staleTime: 15_000, placeholderData: keepPreviousData });
}

export function useRefundView(id: string | null) {
  return useQuery({ queryKey: RETURN_KEYS.refundView(id ?? ""), queryFn: ({ signal }) => returnsApi.refundView(id as string, signal), enabled: Boolean(id) });
}

export function useReturnInspection(id: string | null) {
  return useQuery({ queryKey: RETURN_KEYS.inspection(id ?? ""), queryFn: ({ signal }) => returnsApi.inspection(id as string, signal), enabled: Boolean(id) });
}

export function useDispositionOptions(id: string | null) {
  return useQuery({ queryKey: RETURN_KEYS.dispositionOptions(id ?? ""), queryFn: ({ signal }) => returnsApi.dispositionOptions(id as string, signal), enabled: Boolean(id) });
}

/** active members as inspector choices; only asked for when the role may list members */
export function useReturnMembers(enabled: boolean) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: RETURN_KEYS.members(businessId), queryFn: returnsApi.members, enabled, staleTime: 5 * 60_000, retry: false });
}

/** saves an inspection (checklist + result) */
export function useSaveInspection() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({ mutationFn: (input: SaveInspectionInput) => returnsApi.saveInspection(input), onSuccess: afterWrite, onError: afterWrite });
}

export function useAssignInspection() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({ mutationFn: ({ ids, userId }: { ids: string[]; userId: string }) => returnsApi.assignInspection(ids, userId), onSuccess: afterWrite });
}

/** how often the running sync jobs are looked at, and how long we wait before leaving them to finish in the background */
export const SYNC_POLL_MS = 2000;
const SYNC_MAX_POLLS = 90;
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) { resolve(); return; }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

export interface SyncReturnsInput {
  /** called with the report after the jobs were queued and after every poll */
  onUpdate?: (report: SyncReport) => void;
  /** re-import everything the marketplace changed after this ISO moment */
  since?: string;
}

/**
 * Starts the returns sync (one job per connected account that can fetch returns), follows every job through /sync/jobs/{id} until it
 * ends (progress and stats are real), then refreshes the screen. The report is handed to `onUpdate` all along.
 */
export function useSyncReturns() {
  const afterWrite = useAfterWrite();
  const controllerRef = useRef<AbortController | null>(null);

  return useGuardedMutation({
    mutationFn: async ({ onUpdate, since }: SyncReturnsInput = {}): Promise<SyncReport> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const { signal } = controller;

      try {
        const startedAt = Date.now();
        const started = await returnsApi.sync(since ? { since } : {});
        const accounts: SyncAccountReport[] = started.jobs.map((j) => ({ accountId: j.accountId, accountName: j.accountName, marketplace: j.marketplace, alreadyQueued: j.alreadyQueued, job: null }));
        const report = (finished: boolean, stillRunning = false): SyncReport => ({ startedAt, accounts: accounts.map((a) => ({ ...a })), skipped: started.skipped, finished, stillRunning, nothingToSync: started.jobs.length === 0 });
        onUpdate?.(report(started.jobs.length === 0));
        if (started.jobs.length === 0) return report(true);
        let polls = 0;
        for (;;) {
          if (signal.aborted) return report(false, true);
          await Promise.all(
            started.jobs.map(async (j, i) => {
              const account = accounts[i];
              if (!account || (account.job && SYNC_JOB_DONE.includes(account.job.status))) return;
              account.job = await returnsApi.syncJob(j.jobId);
            }),
          );
          if (signal.aborted) return report(false, true);
          const finished = accounts.every((a) => a.job !== null && SYNC_JOB_DONE.includes(a.job.status));
          const out = report(finished, !finished && polls + 1 >= SYNC_MAX_POLLS);
          onUpdate?.(out);
          if (finished || out.stillRunning) return out;
          polls++;
          await wait(SYNC_POLL_MS, signal);
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    onSettled: afterWrite,
  });
}

/** every row of the current filters, for "Select all (N)" */
export function useSelectAllReturns() {
  return useGuardedMutation({ mutationFn: (query: LedgerQuery) => returnsApi.ledgerAll(query) });
}

/** pass / fail / needs review on several returns at once (no checklist; never a refund or a disposition) */
export function useMarkInspection() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({ mutationFn: ({ ids, result, note }: { ids: string[]; result: InspectionResult; note?: string }) => returnsApi.markInspection(ids, result, note), onSuccess: afterWrite });
}

export function useExportAttention() {
  return useGuardedMutation({ mutationFn: () => returnsApi.exportAttention() });
}
