/**
 * The ONE frontend model of an issue, exactly as the API sends it (GET /issues, GET /issues/{id}).
 * There is no per-issue entity name or revenue figure on the server: the page shows title, explanation, impact,
 * count, due label, recommended action and the affected records.
 */
export const ISSUE_AREAS = ["orders", "inventory", "listings", "channels", "returns", "shipping", "products"] as const;
export type IssueArea = (typeof ISSUE_AREAS)[number];

export const ISSUE_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export type IssueStatus = "open" | "in_progress" | "snoozed" | "resolved";

export type IssueTab = "all" | "critical" | "today" | "upcoming";
export type IssueDue = "today" | "tomorrow" | "this_week";
export type IssueSort = "priority" | "due" | "updated";
export type SnoozePreset = "later_today" | "tomorrow" | "this_week";

export interface IssueAction {
  text?: string;
  label?: string;
  href?: string;
}

export interface Issue {
  id: string;
  key: string;
  area: IssueArea;
  priority: IssuePriority;
  status: IssueStatus;
  title: string;
  explanation: string;
  impact: string | null;
  count: number;
  dueAt: string | null;
  dueLabel: string | null;
  recommendedAction: IssueAction;
  assignedTo: string | null;
  assigneeName: string | null;
  snoozedUntil: string | null;
  statusNote: string | null;
  firstSeenAt: string;
  updatedAt: string;
}

export interface AffectedItem {
  type: string;
  id: string;
  label: string;
  href: string | null;
}

export interface TimelineEvent {
  type: string;
  actorType: string;
  actorId: string | null;
  note: string | null;
  at: string;
}

export interface IssueDetail extends Issue {
  whyItMatters: string;
  affected: { total: number; items: AffectedItem[] };
  deadline: { at: string | null; label: string | null };
  resolution: string | null;
  resolvedAt: string | null;
  timeline: TimelineEvent[];
}

export interface IssueFilters {
  tab: IssueTab;
  area?: IssueArea;
  priority?: IssuePriority;
  status?: "open" | "in_progress" | "snoozed";
  due?: IssueDue;
  sort?: IssueSort;
  page: number;
  pageSize: number;
}

export interface IssuePage {
  items: Issue[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface IssueCounts {
  open: number;
  tabs: Record<IssueTab, number>;
  byArea: Record<string, number>;
  updatedAt: string;
}

export type HistoryStatus = "all" | "resolved" | "snoozed";

export interface HistoryItem {
  id: string;
  title: string;
  area: IssueArea;
  status: IssueStatus;
  updatedAt: string;
  resolvedBy: string | null;
  resolution: string | null;
  returnsAt: string | null;
  returnsLabel: string | null;
  recommendedAction: IssueAction;
}

export interface IssueHistory {
  items: HistoryItem[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  counts: Record<HistoryStatus, number>;
}

export interface QueueRecommendation {
  text: string;
  evidence: Record<string, unknown>;
  action: { label: string; href: string };
}

export interface Assignee {
  id: string;
  name: string;
  email: string;
}

export interface BulkResult {
  results: Array<{ id: string; ok: boolean; error?: string; rule?: string }>;
  succeeded: number;
  failed: number;
}

export type BulkInput =
  | { ids: string[]; action: "resolve" }
  | { ids: string[]; action: "snooze"; until: SnoozePreset }
  | { ids: string[]; action: "assign"; assigneeId: string };

export interface RefreshResult {
  created: number;
  updated: number;
  reopened: number;
  autoResolved: number;
  unsnoozed: number;
  detectors: number;
  failedDetectors: string[];
  open: number;
}
