import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  ApprovalsQuery,
  AutomationApproval,
  AutomationCatalog,
  AutomationExecution,
  AutomationOverview,
  AutomationRule,
  AutomationRun,
  DryRunResult,
  PagedResult,
  RuleWrite,
  RulesQuery,
  RunsQuery,
} from "@/types/automation";

export function rulesParams(q: RulesQuery): Record<string, string> {
  const out: Record<string, string> = {};
  if (q.status) out["filter[status]"] = q.status;
  if (q.trigger) out["filter[trigger]"] = q.trigger;
  return out;
}

export function runsParams(q: RunsQuery): Record<string, string | number> {
  const out: Record<string, string | number> = { pageSize: q.pageSize };
  if (q.page > 1) out.page = q.page;
  if (q.status) out["filter[status]"] = q.status;
  if (q.ruleId) out["filter[ruleId]"] = q.ruleId;
  return out;
}

export const automationApi = {
  overview: async (signal?: AbortSignal) => unwrap<AutomationOverview>(await client.get(ENDPOINTS.AUTOMATION_OVERVIEW, { signal })),

  catalog: async (signal?: AbortSignal) => unwrap<AutomationCatalog>(await client.get(ENDPOINTS.AUTOMATION_CATALOG, { signal })),

  /** a plain array (the backend returns at most 200 rules and does not page them) */
  rules: async (query: RulesQuery, signal?: AbortSignal) => unwrap<AutomationRule[]>(await client.get(ENDPOINTS.AUTOMATION_RULES, { params: rulesParams(query), signal })),

  rule: async (id: string, signal?: AbortSignal) => unwrap<AutomationRule>(await client.get(ENDPOINTS.AUTOMATION_RULE(id), { signal })),

  create: async (body: RuleWrite) => unwrap<AutomationRule>(await client.post(ENDPOINTS.AUTOMATION_RULES, body)),

  update: async (id: string, body: Partial<RuleWrite> & { version?: number }) => unwrap<AutomationRule>(await client.patch(ENDPOINTS.AUTOMATION_RULE(id), body)),

  activate: async (id: string) => unwrap<AutomationRule>(await client.post(ENDPOINTS.AUTOMATION_RULE_ACTION(id, "activate"))),

  disable: async (id: string) => unwrap<AutomationRule>(await client.post(ENDPOINTS.AUTOMATION_RULE_ACTION(id, "disable"))),

  remove: async (id: string) => unwrap<{ id: string; deleted: true }>(await client.delete(ENDPOINTS.AUTOMATION_RULE(id))),

  /** dry run: changes nothing */
  test: async (id: string, payload: Record<string, unknown>) => unwrap<DryRunResult>(await client.post(ENDPOINTS.AUTOMATION_RULE_ACTION(id, "test"), { payload })),

  approvals: async (query: ApprovalsQuery, signal?: AbortSignal) =>
    unwrap<PagedResult<AutomationApproval>>(await client.get(ENDPOINTS.AUTOMATION_APPROVALS, { params: { pageSize: query.pageSize, ...(query.page > 1 ? { page: query.page } : {}) }, signal })),

  runs: async (query: RunsQuery, signal?: AbortSignal) => unwrap<PagedResult<AutomationRun>>(await client.get(ENDPOINTS.AUTOMATION_RUNS, { params: runsParams(query), signal })),

  execution: async (id: string, signal?: AbortSignal) => unwrap<AutomationExecution>(await client.get(ENDPOINTS.AUTOMATION_EXECUTION(id), { signal })),

  /** runs the waiting action now; the response may carry status "failed" */
  approve: async (executionId: string) => unwrap<AutomationExecution>(await client.post(ENDPOINTS.AUTOMATION_EXECUTION_ACTION(executionId, "approve"))),

  dismiss: async (executionId: string, note?: string) => unwrap<AutomationExecution>(await client.post(ENDPOINTS.AUTOMATION_APPROVAL_DISMISS(executionId), note ? { note } : {})),

  rollback: async (executionId: string) => unwrap<AutomationExecution>(await client.post(ENDPOINTS.AUTOMATION_EXECUTION_ACTION(executionId, "rollback"))),
};
