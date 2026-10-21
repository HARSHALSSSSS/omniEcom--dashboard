import { isApiError } from "@/api/errors";
import type { Catalog, CatalogEntry, Frequency, ReportFormat, ReportRun, ReportType, RunStatus, ScheduleStatus } from "@/types/reports";

export const FORMAT_LABEL: Record<ReportFormat, string> = { csv: "CSV", xlsx: "Excel (XLSX)", pdf: "PDF" };
export const FORMAT_SHORT: Record<ReportFormat, string> = { csv: "CSV", xlsx: "XLSX", pdf: "PDF" };

export const TYPE_LABEL: Record<ReportType, string> = {
  gst_register: "GST register",
  settlement_audit: "Settlement audit",
  inventory_valuation: "Inventory valuation",
  sales: "Sales",
  orders: "Orders",
  inventory: "Inventory",
  products: "Product performance",
  returns: "Returns",
};

export const CATEGORY_LABEL: Record<string, string> = { compliance: "Compliance", finance: "Finance", inventory: "Inventory", sales: "Sales", operations: "Operations" };

export const RUN_STATUS_LABEL: Record<RunStatus, string> = { queued: "Queued", running: "Generating", succeeded: "Ready", failed: "Failed" };
export const RUN_STATUS_CLASS: Record<RunStatus, string> = {
  queued: "border-slate-200 bg-slate-50 text-slate-700",
  running: "border-sky-200 bg-sky-50 text-sky-700",
  succeeded: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
};

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = { active: "Active", paused: "Paused" };
export const SCHEDULE_STATUS_CLASS: Record<ScheduleStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  paused: "border-amber-200 bg-amber-50 text-amber-700",
};

export const FREQUENCY_LABEL: Record<Frequency, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** the catalog entry of a type (the schedule and run rows only carry the type key) */
export const entryOf = (catalog: Catalog | undefined, type: string): CatalogEntry | undefined => catalog?.types.find((t) => t.type === type);

export const typeLabel = (type: string, title?: string): string => title ?? (TYPE_LABEL as Record<string, string>)[type] ?? type;

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const RANGE_FALLBACK: Record<string, string> = {
  today: "Today", yesterday: "Yesterday", last_7_days: "Last 7 days", last_30_days: "Last 30 days", this_week: "This week", previous_week: "Previous week",
  this_month: "This month", previous_month: "Previous month", this_financial_year: "This financial year", previous_financial_year: "Previous financial year",
};

/** one line describing the parameters of a run or schedule, using the catalog's labels */
export function paramSummary(params: Record<string, unknown>, entry?: CatalogEntry, periods: Catalog["periods"] = []): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(params)) {
    if (raw === null || raw === undefined || raw === "") continue;
    const value = String(raw);
    if (key === "range") {
      parts.push(periods.find((p) => p.key === value)?.label ?? RANGE_FALLBACK[value] ?? value);
      continue;
    }
    if (key === "to" && "from" in params) continue;
    if (key === "from" && "to" in params) {
      parts.push(`${value} to ${String(params.to)}`);
      continue;
    }
    const spec = entry?.params.find((p) => p.key === key);
    parts.push(`${spec?.label ?? key}: ${value}`);
  }
  return parts.join(" · ");
}

/** the sentence for a run that could not be built or downloaded */
export function runFailure(run: Pick<ReportRun, "error">): string {
  return run.error ?? "The report could not be generated.";
}

/** what to tell the person when exporting or scheduling fails */
export function reportErrorMessage(e: unknown, fallback: string): string {
  if (!isApiError(e)) return e instanceof Error && e.message ? e.message : fallback;
  switch (e.rule) {
    case "gst_registration_required":
      return "Add your GSTIN in Settings before generating the GST register.";
    case "report_too_large":
      return "This report is too large. Choose a shorter period or another format.";
    case "schedule_limit":
      return "You have reached the limit of 50 schedules. Delete one to add another.";
    case "file_expired":
      return "This file has expired. Generate the report again.";
    case "run_not_ready":
      return "This report has no file yet. Wait until it has finished.";
    case "schedule_params_must_be_relative":
      return "A schedule needs a relative period, such as Previous month, so every run covers its own period.";
    default:
      break;
  }
  if (e.code === "FORBIDDEN") return "You need report permission to do this.";
  return e.message || fallback;
}
