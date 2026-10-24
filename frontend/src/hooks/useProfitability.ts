import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { profitabilityApi } from "@/api/profitability.api";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { DateRange, ImportUnit, SpendQuery, SpendWrite, WaterfallQuery } from "@/types/profitability";

export const profitKeys = {
  all: ["profitability"] as const,
  waterfall: (b: string | undefined, q: WaterfallQuery | null) => ["profitability", "waterfall", b, q] as const,
  spend: (b: string | undefined, q: SpendQuery | null) => ["profitability", "spend", b, q] as const,
  summary: (b: string | undefined, r: DateRange | null) => ["profitability", "spend-summary", b, r] as const,
  accounts: (b: string | undefined) => ["profitability", "accounts", b] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

/** the P&L bridge and channel table for a real from/to; `query` is null while the custom range is not valid */
export function useWaterfall(query: WaterfallQuery | null) {
  const b = useBusinessId();
  return useQuery({
    queryKey: profitKeys.waterfall(b, query),
    queryFn: ({ signal }) => profitabilityApi.waterfall(query as WaterfallQuery, signal),
    enabled: query !== null,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useSpendRows(query: SpendQuery | null, enabled = true) {
  const b = useBusinessId();
  return useQuery({
    queryKey: profitKeys.spend(b, query),
    queryFn: ({ signal }) => profitabilityApi.spend(query as SpendQuery, signal),
    enabled: enabled && query !== null,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useSpendSummary(range: DateRange | null, enabled = true) {
  const b = useBusinessId();
  return useQuery({
    queryKey: profitKeys.summary(b, range),
    queryFn: ({ signal }) => profitabilityApi.spendSummary(range as DateRange, signal),
    enabled: enabled && range !== null,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useSpendAccounts() {
  const b = useBusinessId();
  return useQuery({ queryKey: profitKeys.accounts(b), queryFn: profitabilityApi.accounts, staleTime: 5 * 60_000 });
}

/** every spend write changes the advertising line of the waterfall, so everything on the screen is refreshed */
function useAfterWrite() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: profitKeys.all });
  };
}

export function useCreateSpend() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({ mutationFn: (body: SpendWrite) => profitabilityApi.createSpend(body), onSuccess: afterWrite });
}

export function useUpdateSpend() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({ mutationFn: (input: { id: string; body: Partial<SpendWrite> }) => profitabilityApi.updateSpend(input.id, input.body), onSuccess: afterWrite });
}

export function useDeleteSpend() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({ mutationFn: (id: string) => profitabilityApi.deleteSpend(id), onSuccess: afterWrite });
}

/** a dry run saves nothing, so only a real import refreshes the screen */
export function useImportSpend() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({
    mutationFn: (input: { csv: string; unit: ImportUnit; dryRun: boolean }) => profitabilityApi.importSpend(input.csv, { unit: input.unit, dryRun: input.dryRun }),
    onSuccess: (res) => {
      if (!res.dryRun) afterWrite();
    },
  });
}
