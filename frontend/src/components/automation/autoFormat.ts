import { formatCurrency, formatNumber } from "@/utils/format";
import type { AutomationCatalog, AutomationRule, ExecutionStatus, RuleCondition, RuleConditions, RuleMode, RuleStatus, RunStatus } from "@/types/automation";

export const WRITE_REASON = "Changing automation rules needs the automation:write permission";
export const FLAG = "automation.enabled";

export const STATUS_LABELS: Record<RuleStatus, string> = { active: "Active", draft: "Draft", disabled: "Disabled" };
export const STATUS_TONE: Record<RuleStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  draft: "border-border bg-muted text-muted-foreground",
  disabled: "border-amber-200 bg-amber-50 text-amber-800",
};

export const MODE_LABELS: Record<RuleMode, string> = { approval: "Needs approval", auto: "Runs automatically" };
export const MODE_HINTS: Record<RuleMode, string> = {
  approval: "A person approves every run before anything happens. Recommended while you are testing a rule.",
  auto: "The action runs by itself the moment the rule matches. Every run is still logged and, where possible, can be rolled back.",
};

export const RUN_LABELS: Record<RunStatus, string> = { success: "Succeeded", awaiting_approval: "Awaiting approval", failed: "Failed" };
export const RUN_TONE: Record<RunStatus, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  awaiting_approval: "border-amber-200 bg-amber-50 text-amber-800",
  failed: "border-red-200 bg-red-50 text-red-700",
};

export const EXECUTION_LABELS: Record<ExecutionStatus, string> = {
  executed: "Executed",
  pending_approval: "Awaiting approval",
  rejected: "Dismissed",
  failed: "Failed",
  skipped: "Skipped",
  rolled_back: "Rolled back",
};
export const EXECUTION_TONE: Record<ExecutionStatus, string> = {
  executed: RUN_TONE.success,
  rolled_back: "border-sky-200 bg-sky-50 text-sky-700",
  pending_approval: RUN_TONE.awaiting_approval,
  failed: RUN_TONE.failed,
  skipped: "border-border bg-muted text-muted-foreground",
  rejected: "border-border bg-muted text-muted-foreground",
};

/** names of the events and actions the backend knows today; anything new falls back to its catalog description or its own name */
export const TRIGGER_LABELS: Record<string, string> = {
  "order.created": "A new order arrives",
  "order.needs_attention": "An order needs a person",
  "order.cancellation_requested": "A cancellation is requested",
  "order.sla_at_risk": "An order is close to its dispatch deadline",
  "inventory.low_stock": "Stock falls to the reorder level",
  "price.competitor_lower": "A competitor undercuts our price",
  "schedule.cadence": "On a schedule",
  "sync.failed": "A marketplace sync fails",
  "sync.dead_lettered": "A sync job gives up",
  "listing.failed": "A marketplace rejects a listing",
  "return.received": "A return arrives at a warehouse",
  "marketplace_account.disconnected": "A marketplace account is disconnected",
  "marketplace_account.authorization_expired": "A marketplace authorisation expires",
  "fulfillment.exception_raised": "A warehouse exception is raised",
  "shipment.ndr_raised": "A delivery attempt fails",
  "shipment.rto_started": "A shipment starts returning to origin",
};

export const ACTION_LABELS: Record<string, string> = {
  notify: "Notify the team",
  create_recommendation: "Create a recommendation",
  retry_sync_job: "Retry the sync job",
  start_fulfillment: "Start fulfillment",
  set_reorder_level: "Set the reorder level",
  draft_purchase_order: "Draft a purchase order",
  adjust_channel_price: "Propose a channel price",
  snooze_listing: "Recommend snoozing the listing",
};

export const OP_LABELS: Record<string, string> = {
  eq: "is",
  ne: "is not",
  in: "is one of",
  nin: "is none of",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  contains: "contains",
  startsWith: "starts with",
  between: "is between",
  exists: "exists",
};

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export const triggerLabel = (event: string, catalog?: AutomationCatalog): string =>
  TRIGGER_LABELS[event] ?? catalog?.triggers.find((t) => t.event === event)?.description ?? event;

export const actionLabel = (type: string): string => ACTION_LABELS[type] ?? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** two-digit hour label: 0 -> "00:00" */
export const hourLabel = (hour: number): string => `${String(hour).padStart(2, "0")}:00`;

export function scheduleText(rule: Pick<AutomationRule, "schedule">): string | null {
  const s = rule.schedule;
  if (!s) return null;
  return s.cadence === "weekly" && s.weekday !== null ? `Every ${WEEKDAYS[s.weekday - 1] ?? "week"} at ${hourLabel(s.hour)}` : `Every day at ${hourLabel(s.hour)}`;
}

const show = (v: unknown): string => (Array.isArray(v) ? v.map(String).join(", ") : typeof v === "string" ? `"${v}"` : String(v));

export function conditionText(c: RuleCondition): string {
  const op = OP_LABELS[c.op] ?? c.op;
  if (c.op === "exists") return `${c.field} ${c.value === false ? "does not exist" : "exists"}`;
  if (c.op === "between" && Array.isArray(c.value)) return `${c.field} ${op} ${c.value.join(" and ")}`;
  return `${c.field} ${op} ${show(c.value)}`;
}

/** the conditions of a rule in words, without the cadence slots (they are shown as a schedule) */
export function conditionLines(rule: Pick<AutomationRule, "conditions" | "triggerEvent">): string[] {
  const list = (rule.conditions as RuleConditions).conditions.filter((c) => !(rule.triggerEvent === "schedule.cadence" && (c.field === "hour" || c.field === "weekday") && c.op === "eq"));
  return list.map(conditionText);
}

export function paramLines(params: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(params).map(([k, v]) => [k, typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)]);
}

export const APPROVE_REASON = "Deciding on automation runs needs the automation:write permission";

/** the money at stake of an approval: a total, or the price change per unit of a price proposal */
export function impactText(a: { financialImpact: number | null; currency: string; actionType: string }): string {
  if (a.financialImpact === null) return "Not known";
  const text = formatCurrency(Math.abs(a.financialImpact), a.currency);
  if (a.actionType === "adjust_channel_price") return `${a.financialImpact < 0 ? "-" : "+"}${text} per unit`;
  return text;
}

export const durationText = (ms: number): string => (ms <= 0 ? "—" : ms < 1000 ? `${formatNumber(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
