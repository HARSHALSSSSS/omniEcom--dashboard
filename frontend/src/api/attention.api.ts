import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  Assignee,
  BulkInput,
  BulkResult,
  HistoryStatus,
  Issue,
  IssueCounts,
  IssueDetail,
  IssueFilters,
  IssueHistory,
  IssuePage,
  QueueRecommendation,
  RefreshResult,
  SnoozePreset,
} from "@/types/attention";

/** the filters as the API names them (`filter[area]`, ...); unset ones are left out */
export function issueQuery(f: IssueFilters): Record<string, string | number> {
  const q: Record<string, string | number> = { tab: f.tab, page: f.page, pageSize: f.pageSize };
  if (f.area) q["filter[area]"] = f.area;
  if (f.priority) q["filter[priority]"] = f.priority;
  if (f.status) q["filter[status]"] = f.status;
  if (f.due) q["filter[due]"] = f.due;
  if (f.sort) q.sort = f.sort;
  return q;
}

export const attentionApi = {
  list: async (filters: IssueFilters) => unwrap<IssuePage>(await client.get(ENDPOINTS.ISSUES, { params: issueQuery(filters) })),
  counts: async () => unwrap<IssueCounts>(await client.get(ENDPOINTS.ISSUES_COUNTS)),
  history: async (status: HistoryStatus, page: number, pageSize: number) =>
    unwrap<IssueHistory>(await client.get(ENDPOINTS.ISSUES_HISTORY, { params: { status, page, pageSize } })),
  recommendation: async () => unwrap<QueueRecommendation | null>(await client.get(ENDPOINTS.ISSUES_RECOMMENDATION)),
  assignees: async () => unwrap<Assignee[]>(await client.get(ENDPOINTS.ISSUES_ASSIGNEES)),
  detail: async (id: string) => unwrap<IssueDetail>(await client.get(ENDPOINTS.ISSUE(id))),

  start: async (id: string, note?: string) => unwrap<Issue>(await client.post(ENDPOINTS.ISSUE_ACTION(id, "start"), note ? { note } : {})),
  resolve: async (id: string, mode: "manual" | "attempt" = "manual", note?: string) =>
    unwrap<Issue>(await client.post(ENDPOINTS.ISSUE_ACTION(id, "resolve"), { mode, ...(note ? { note } : {}) })),
  snooze: async (id: string, until: SnoozePreset | string) => unwrap<Issue>(await client.post(ENDPOINTS.ISSUE_ACTION(id, "snooze"), { until })),
  unsnooze: async (id: string) => unwrap<Issue>(await client.post(ENDPOINTS.ISSUE_ACTION(id, "unsnooze"), {})),
  assign: async (id: string, userId: string) => unwrap<Issue>(await client.post(ENDPOINTS.ISSUE_ACTION(id, "assign"), { userId })),
  bulk: async (input: BulkInput) => unwrap<BulkResult>(await client.post(ENDPOINTS.ISSUES_BULK, input)),
  refresh: async () => unwrap<RefreshResult>(await client.post(ENDPOINTS.ISSUES_REFRESH, {})),
};
