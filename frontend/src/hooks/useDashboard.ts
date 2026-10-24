import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { dashboardApi } from "@/api/dashboard.api";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { Dashboard, SalesPeriod } from "@/types/dashboard";

export const DASHBOARD_KEYS = {
  all: ["dashboard"] as const,
  period: (businessId: string | undefined, period: SalesPeriod) => ["dashboard", businessId, period] as const,
};

/** The home aggregate. A period change refetches while the previous period stays on screen (no skeleton flash). */
export function useDashboard(period: SalesPeriod) {
  const businessId = useWorkspaceStore((s) => s.shell?.business.id);
  return useQuery<Dashboard>({
    queryKey: DASHBOARD_KEYS.period(businessId, period),
    queryFn: ({ signal }) => dashboardApi.get(period, signal),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Dismiss = reject the open recommendation; the card disappears from every cached period at once. */
export function useDismissRecommendation() {
  const queryClient = useQueryClient();
  return useGuardedMutation({
    mutationFn: (id: string) => dashboardApi.rejectRecommendation(id),
    onSuccess: () => {
      queryClient.setQueriesData<Dashboard>({ queryKey: DASHBOARD_KEYS.all }, (old) =>
        old ? { ...old, recommendation: null } : old,
      );
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all });
    },
  });
}
