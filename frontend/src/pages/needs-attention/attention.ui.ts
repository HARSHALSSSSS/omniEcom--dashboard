import type { IssueArea, IssueDetail, IssuePriority, IssueStatus, SnoozePreset } from "@/types/attention";
import { formatInZone } from "@/utils/format";

export const AREA_LABEL: Record<IssueArea, string> = {
  orders: "Orders",
  inventory: "Inventory",
  listings: "Listings",
  channels: "Channels",
  returns: "Returns",
  shipping: "Shipping",
  products: "Products",
};

export const PRIORITY_LABEL: Record<IssuePriority, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

/** text/border colour and the dot next to it */
export const PRIORITY_STYLE: Record<IssuePriority, { color: string; bullet: string }> = {
  critical: { color: "#D74B61", bullet: "#000000" },
  high: { color: "#B97818", bullet: "#666666" },
  medium: { color: "#7661C8", bullet: "#BDBDBD" },
  low: { color: "#666666", bullet: "#BDBDBD" },
};

export const STATUS_FILTER_LABEL = { open: "Open", in_progress: "In progress", snoozed: "Snoozed" } as const;
export const DUE_LABEL = { today: "Today", tomorrow: "Tomorrow", this_week: "This week" } as const;

export const SNOOZE_PRESETS: Array<{ value: SnoozePreset; label: string }> = [
  { value: "later_today", label: "Later today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this_week", label: "This week" },
];

/** issues the server can try to fix by itself (`mode: "attempt"`): a failing channel sync is retried */
export const ATTEMPTABLE_KEYS: readonly string[] = ["channel_sync_failing"];

export const READ_ONLY_REASON = "Your role can view issues but not change them.";

const AFFECTED_HEADING: Record<string, string> = {
  order: "Affected orders",
  variant: "Affected SKUs",
  listing: "Affected listings",
  account: "Affected connections",
  return: "Affected returns",
  shipment: "Affected shipments",
  sync_job: "Affected sync jobs",
};

export function affectedHeading(items: IssueDetail["affected"]["items"]): string {
  const types = [...new Set(items.map((i) => i.type))];
  const only = types.length === 1 ? types[0] : undefined;
  return (only && AFFECTED_HEADING[only]) || "Affected records";
}

/** "5 min ago", "2 h ago", "3 d ago" */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

const dateTime = (iso: string) => formatInZone(iso, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** the line under the drawer title */
export function statusText(issue: Pick<IssueDetail, "status" | "statusNote" | "snoozedUntil" | "resolvedAt" | "assigneeName">): string {
  const who = issue.assigneeName ? ` · Assigned to ${issue.assigneeName}` : "";
  const s: IssueStatus = issue.status;
  if (s === "in_progress") return `In progress · ${issue.statusNote ?? "Review started"}${who}`;
  if (s === "snoozed") return `Snoozed${issue.snoozedUntil ? ` until ${dateTime(issue.snoozedUntil)}` : ""}${who}`;
  if (s === "resolved") return `Resolved${issue.resolvedAt ? ` · ${dateTime(issue.resolvedAt)}` : ""}`;
  return `Open · ${issue.statusNote ?? "Requires action"}${who}`;
}

export const EVENT_LABEL: Record<string, string> = {
  detected: "Detected",
  updated: "Updated",
  started: "Marked in progress",
  snoozed: "Snoozed",
  unsnoozed: "Back in the queue",
  resolved: "Marked resolved",
  auto_resolved: "Resolved automatically",
  reopened: "Reopened",
  assigned: "Assigned",
  resolution_failed: "Resolution failed",
};

export const eventLabel = (type: string) => EVENT_LABEL[type] ?? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
export const eventTime = dateTime;
