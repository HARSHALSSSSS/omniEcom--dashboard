/** Types of the Automation screen: they mirror the backend contract of /automation/* (rules, catalog, approvals, runs, executions). */

export const RULE_STATUSES = ["active", "draft", "disabled"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const RULE_MODES = ["approval", "auto"] as const;
export type RuleMode = (typeof RULE_MODES)[number];

export const EXECUTION_STATUSES = ["executed", "pending_approval", "rejected", "failed", "skipped", "rolled_back"] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const RUN_STATUSES = ["success", "awaiting_approval", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export type AutomationTab = "overview" | "rules" | "approvals" | "runs";

export const OPERATORS = ["eq", "ne", "in", "nin", "gt", "gte", "lt", "lte", "contains", "startsWith", "between", "exists"] as const;
export type Operator = (typeof OPERATORS)[number];

export type Combinator = "all" | "any";

export interface RuleCondition {
  field: string;
  op: string;
  value?: unknown;
}

export interface RuleConditions {
  combinator: Combinator;
  conditions: RuleCondition[];
}

export interface RuleAction {
  type: string;
  params: Record<string, unknown>;
}

export interface RuleSchedule {
  cadence: "daily" | "weekly";
  hour: number;
  weekday: number | null;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  triggerEvent: string;
  conditions: RuleConditions;
  action: RuleAction;
  mode: RuleMode;
  status: RuleStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  triggerType: string;
  actionType: string;
  requiresExplicitApproval: boolean;
  runsCount: number;
  lastRunAt: string | null;
  channelFilter: string | null;
  schedule: RuleSchedule | null;
}

/** body of POST /automation/rules (and, partially, PATCH) */
export interface RuleWrite {
  name: string;
  description?: string | null;
  triggerEvent: string;
  conditions: RuleConditions;
  action: RuleAction;
  mode: RuleMode;
  status: RuleStatus;
}

export interface CatalogTrigger {
  event: string;
  description: string;
  facts: string[];
}

export interface CatalogAction {
  type: string;
  description: string;
  /** "*" = every trigger, else the events it fits */
  triggers: "*" | string[];
  reversible: boolean;
}

export interface AutomationCatalog {
  triggers: CatalogTrigger[];
  actions: CatalogAction[];
  operators: string[];
}

export interface AutomationOverview {
  activeRules: number;
  totalRules: number;
  pendingApprovals: number;
  runs24h: number;
  /** percent of the attempted runs of the last 24 hours; null while nothing ran */
  successRate: number | null;
  lastRunAt: string | null;
  lastRunRule: string | null;
}

export interface AutomationApproval {
  id: string;
  ruleId: string;
  ruleName: string;
  triggerEvent: string;
  triggerType: string;
  actionType: string;
  entityName: string;
  skuOrOrder: string;
  proposedAction: string;
  recommendedAction: string;
  /** minor units; null when it cannot be known */
  financialImpact: number | null;
  currency: string;
  timestamp: string;
  status: "pending";
  facts: Record<string, unknown>;
}

export interface AutomationRun {
  id: string;
  ruleId: string;
  ruleName: string;
  executionStatus: RunStatus;
  status: ExecutionStatus;
  triggeredAt: string;
  timestamp: string;
  summary: string;
  durationMs: number;
  entityName: string;
  skuOrOrder: string;
}

export interface AutomationExecution {
  id: string;
  ruleId: string;
  eventId: string;
  eventType: string;
  status: ExecutionStatus;
  actionType: string;
  actionParams: Record<string, unknown>;
  facts: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  canRollback: boolean;
  decidedBy: string | null;
  decidedAt: string | null;
  executedAt: string | null;
  createdAt: string;
}

export interface DryRunResult {
  matched: boolean;
  facts: Record<string, unknown>;
  wouldDo: { action: string; params: Record<string, unknown>; needsApproval: boolean } | null;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface RulesQuery {
  status?: RuleStatus;
  trigger?: string;
}

export interface RunsQuery {
  status?: RunStatus;
  ruleId?: string;
  page: number;
  pageSize: number;
}

export interface ApprovalsQuery {
  page: number;
  pageSize: number;
}
