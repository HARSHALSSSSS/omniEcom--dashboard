import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { reportsApi } from "@/api/reports.api";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { ExportRequest, ReportRun, ReportSchedule, RunQuery, SchedulePatch, ScheduleQuery, ScheduleWrite } from "@/types/reports";

export const reportKeys = {
  all: ["reports"] as const,
  overview: (b: string | undefined) => ["reports", "overview", b] as const,
  catalog: (b: string | undefined) => ["reports", "catalog", b] as const,
  runs: (b: string | undefined, q: RunQuery) => ["reports", "runs", b, q] as const,
  run: (b: string | undefined, id: string) => ["reports", "run", b, id] as const,
  schedules: (b: string | undefined, q: ScheduleQuery) => ["reports", "schedules", b, q] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

/** how often a list re-reads itself while one of its runs is still being generated */
export const RUN_POLL_MS = 2500;
export const isActiveRun = (r: Pick<ReportRun, "status">): boolean => r.status === "queued" || r.status === "running";

export function useReportsOverview() {
  const b = useBusinessId();
  return useQuery({
    queryKey: reportKeys.overview(b),
    queryFn: ({ signal }) => reportsApi.overview(signal),
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.recentRuns.some(isActiveRun) ? RUN_POLL_MS : false),
  });
}

export function useReportCatalog() {
  const b = useBusinessId();
  return useQuery({ queryKey: reportKeys.catalog(b), queryFn: ({ signal }) => reportsApi.catalog(signal), staleTime: 10 * 60_000 });
}

/** one numbered page of the run history; re-reads itself while something is generating */
export function useReportRuns(query: RunQuery, enabled = true) {
  const b = useBusinessId();
  return useQuery({
    queryKey: reportKeys.runs(b, query),
    queryFn: ({ signal }) => reportsApi.listRuns(query, signal),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval: (q) => (q.state.data?.items.some(isActiveRun) ? RUN_POLL_MS : false),
  });
}

/** polls one run until it has finished (succeeded or failed) */
export function useReportRun(id: string | null) {
  const b = useBusinessId();
  return useQuery({
    queryKey: reportKeys.run(b, id ?? ""),
    queryFn: ({ signal }) => reportsApi.getRun(id as string, signal),
    enabled: Boolean(id),
    staleTime: 0,
    refetchInterval: (q) => (q.state.data && !isActiveRun(q.state.data) ? false : RUN_POLL_MS),
  });
}

export function useReportSchedules(query: ScheduleQuery, enabled = true) {
  const b = useBusinessId();
  return useQuery({
    queryKey: reportKeys.schedules(b, query),
    queryFn: ({ signal }) => reportsApi.listSchedules(query, signal),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** every list on the screen shows runs or schedules, so any change refreshes the whole family */
function useRefreshReports() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: reportKeys.all });
}

export function useExportReport() {
  const refresh = useRefreshReports();
  return useGuardedMutation({ mutationFn: (body: ExportRequest) => reportsApi.exportReport(body), onSuccess: refresh });
}

export function useCreateSchedule() {
  const refresh = useRefreshReports();
  return useGuardedMutation({ mutationFn: (body: ScheduleWrite) => reportsApi.createSchedule(body), onSuccess: refresh });
}

export function useUpdateSchedule() {
  const refresh = useRefreshReports();
  return useGuardedMutation({ mutationFn: ({ id, body }: { id: string; body: SchedulePatch }) => reportsApi.updateSchedule(id, body), onSuccess: refresh });
}

export function useDeleteSchedule() {
  const refresh = useRefreshReports();
  return useGuardedMutation({ mutationFn: (id: string) => reportsApi.deleteSchedule(id), onSuccess: refresh });
}

export function useScheduleAction() {
  const refresh = useRefreshReports();
  return useGuardedMutation({
    mutationFn: ({ id, action }: { id: string; action: "pause" | "resume" | "run-now" }): Promise<ReportSchedule | ReportRun> =>
      action === "pause" ? reportsApi.pauseSchedule(id) : action === "resume" ? reportsApi.resumeSchedule(id) : reportsApi.runScheduleNow(id),
    onSuccess: refresh,
  });
}

const CHOICE = { staleTime: 5 * 60_000, retry: false } as const;

/** pick-lists of the warehouse / marketplace / category parameters; loaded only when a form shows one */
export function useWarehouseChoices(enabled: boolean) {
  const b = useBusinessId();
  return useQuery({ queryKey: ["reports", "choices", "warehouses", b] as const, queryFn: ({ signal }) => reportsApi.choices.warehouses(signal), enabled, ...CHOICE });
}

export function useAccountChoices(enabled: boolean) {
  const b = useBusinessId();
  return useQuery({ queryKey: ["reports", "choices", "accounts", b] as const, queryFn: ({ signal }) => reportsApi.choices.accounts(signal), enabled, ...CHOICE });
}

export function useCategoryChoices(enabled: boolean) {
  const b = useBusinessId();
  return useQuery({ queryKey: ["reports", "choices", "categories", b] as const, queryFn: () => reportsApi.choices.categories(), enabled, ...CHOICE });
}
