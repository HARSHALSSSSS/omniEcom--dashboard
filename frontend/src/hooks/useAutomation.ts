import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { automationApi } from "@/api/automation.api";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { ApprovalsQuery, RuleWrite, RulesQuery, RunsQuery } from "@/types/automation";

export const automationKeys = {
  all: ["automation"] as const,
  overview: (b: string | undefined) => ["automation", "overview", b] as const,
  catalog: (b: string | undefined) => ["automation", "catalog", b] as const,
  rules: (b: string | undefined, q: RulesQuery) => ["automation", "rules", b, q] as const,
  approvals: (b: string | undefined, q: ApprovalsQuery) => ["automation", "approvals", b, q] as const,
  runs: (b: string | undefined, q: RunsQuery) => ["automation", "runs", b, q] as const,
  execution: (b: string | undefined, id: string) => ["automation", "execution", b, id] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

export function useAutomationOverview(enabled = true) {
  const b = useBusinessId();
  return useQuery({ queryKey: automationKeys.overview(b), queryFn: ({ signal }) => automationApi.overview(signal), staleTime: 15_000, enabled });
}

export function useAutomationCatalog(enabled = true) {
  const b = useBusinessId();
  return useQuery({ queryKey: automationKeys.catalog(b), queryFn: ({ signal }) => automationApi.catalog(signal), staleTime: 10 * 60_000, enabled });
}

export function useAutomationRules(query: RulesQuery, enabled = true) {
  const b = useBusinessId();
  return useQuery({ queryKey: automationKeys.rules(b, query), queryFn: ({ signal }) => automationApi.rules(query, signal), staleTime: 10_000, placeholderData: keepPreviousData, enabled });
}

export function useAutomationApprovals(query: ApprovalsQuery, enabled = true) {
  const b = useBusinessId();
  return useQuery({ queryKey: automationKeys.approvals(b, query), queryFn: ({ signal }) => automationApi.approvals(query, signal), staleTime: 10_000, placeholderData: keepPreviousData, enabled });
}

export function useAutomationRuns(query: RunsQuery, enabled = true) {
  const b = useBusinessId();
  return useQuery({ queryKey: automationKeys.runs(b, query), queryFn: ({ signal }) => automationApi.runs(query, signal), staleTime: 10_000, placeholderData: keepPreviousData, enabled });
}

export function useAutomationExecution(id: string | null) {
  const b = useBusinessId();
  return useQuery({ queryKey: automationKeys.execution(b, id ?? ""), queryFn: ({ signal }) => automationApi.execution(id as string, signal), enabled: Boolean(id), staleTime: 5_000 });
}

/** a rule changed: rules, tiles, the queue and the log refresh */
function useAfterRuleWrite() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: automationKeys.all });
  };
}

/** approving or rolling back runs a real action (purchase order, price proposal, fulfillment, reorder level): the screens it touches refresh too */
function useAfterActionRun() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: automationKeys.all });
    for (const key of ["procurement", "pricing", "inventory", "orders", "fulfillment", "listings", "recommendations", "dashboard", "needs-attention", "attention"]) void qc.invalidateQueries({ queryKey: [key] });
  };
}

export function useCreateRule() {
  const after = useAfterRuleWrite();
  return useGuardedMutation({ mutationFn: (body: RuleWrite) => automationApi.create(body), onSuccess: after });
}

export function useUpdateRule() {
  const after = useAfterRuleWrite();
  return useGuardedMutation({ mutationFn: (input: { id: string; body: Partial<RuleWrite> & { version?: number } }) => automationApi.update(input.id, input.body), onSuccess: after });
}

export function useSetRuleActive() {
  const after = useAfterRuleWrite();
  return useGuardedMutation({
    mutationFn: (input: { id: string; active: boolean }) => (input.active ? automationApi.activate(input.id) : automationApi.disable(input.id)),
    onSettled: after,
  });
}

export function useDeleteRule() {
  const after = useAfterRuleWrite();
  return useGuardedMutation({ mutationFn: (id: string) => automationApi.remove(id), onSettled: after });
}

export function useTestRule() {
  return useGuardedMutation({ mutationFn: (input: { id: string; payload: Record<string, unknown> }) => automationApi.test(input.id, input.payload) });
}

export function useApproveExecution() {
  const after = useAfterActionRun();
  return useGuardedMutation({ mutationFn: (id: string) => automationApi.approve(id), onSettled: after });
}

export function useDismissExecution() {
  const after = useAfterRuleWrite();
  return useGuardedMutation({ mutationFn: (input: { id: string; note?: string }) => automationApi.dismiss(input.id, input.note), onSettled: after });
}

export function useRollbackExecution() {
  const after = useAfterActionRun();
  return useGuardedMutation({ mutationFn: (id: string) => automationApi.rollback(id), onSettled: after });
}
