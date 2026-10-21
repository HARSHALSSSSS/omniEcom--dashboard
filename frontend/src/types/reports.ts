/** Reports screen: catalog, exports (runs) and schedules. Mirrors backend/modules/reports. */

export const REPORT_TYPES = ["gst_register", "settlement_audit", "inventory_valuation", "sales", "orders", "inventory", "products", "returns"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const RUN_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_TRIGGERS = ["manual", "schedule"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const FREQUENCIES = ["daily", "weekly", "monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const SCHEDULE_STATUSES = ["active", "paused"] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const REPORT_TABS = ["reports", "history", "schedules"] as const;
export type ReportsTab = (typeof REPORT_TABS)[number];

export type ParamType = "range" | "month" | "date" | "enum" | "uuid" | "integer" | "string";

export interface ReportParamSpec {
  key: string;
  type: ParamType;
  label: string;
  description: string;
  options: string[] | null;
  default: string | number | null;
  min: number | null;
  max: number | null;
  /** a relative parameter may be used by a schedule (every run covers its own period) */
  relative: boolean;
}

export interface CatalogEntry {
  type: ReportType;
  title: string;
  description: string;
  category: string;
  formats: ReportFormat[];
  defaultFormat: ReportFormat;
  schedulable: boolean;
  sheets: string[];
  csvSheet: string;
  params: ReportParamSpec[];
}

export interface PeriodShortcut {
  key: string;
  label: string;
}

export interface Catalog {
  types: CatalogEntry[];
  periods: PeriodShortcut[];
  formats: ReportFormat[];
}

export interface ReportRun {
  id: string;
  reportType: string;
  reportTitle: string;
  format: ReportFormat;
  params: Record<string, unknown>;
  status: RunStatus;
  trigger: RunTrigger;
  scheduleId: string | null;
  scheduleName: string | null;
  period: { fromDay: string; toDay: string; label: string } | null;
  fileName: string | null;
  sizeBytes: number | null;
  rowCount: number | null;
  warnings: number | null;
  notes: string[];
  settlementDataAvailable: boolean | null;
  error: string | null;
  requestedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string | null;
  downloadable: boolean;
  downloadUrl: string | null;
  createdAt: string;
}

export interface ReportSchedule {
  id: string;
  name: string;
  reportType: string;
  reportTitle: string;
  format: ReportFormat;
  frequency: Frequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  timezone: string;
  cadence: string;
  params: Record<string, unknown>;
  recipients: string[];
  status: ScheduleStatus;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  nextRunAt: string | null;
  lastRun: { id: string; status: string; finishedAt: string | null; downloadUrl: string | null } | null;
  createdBy: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeaturedReport {
  type: ReportType;
  title: string;
  description: string;
  formats: ReportFormat[];
  defaultFormat: ReportFormat;
  buttonLabel: string;
  suggestedParams: Record<string, unknown>;
  lastRun: ReportRun | null;
}

export interface OverviewPeriod {
  key: string;
  label: string;
  from: string;
  to: string;
  fromDay: string;
  toDay: string;
}

export interface ReportsOverview {
  timezone: string;
  /** YYYY-MM-DD in the business time zone */
  today: string;
  periods: OverviewPeriod[];
  featured: FeaturedReport[];
  recentRuns: ReportRun[];
  schedules: { total: number; active: number; paused: number; nextRunAt: string | null; next: ReportSchedule | null };
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface ExportRequest {
  type: ReportType;
  format: ReportFormat;
  params: Record<string, unknown>;
  background?: boolean;
}

export interface RunQuery {
  type?: ReportType;
  status?: RunStatus;
  trigger?: RunTrigger;
  page: number;
  pageSize: number;
}

export interface ScheduleQuery {
  status?: ScheduleStatus;
  page: number;
  pageSize: number;
}

export interface ScheduleWrite {
  name: string;
  reportType: ReportType;
  format: ReportFormat;
  frequency: Frequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timeOfDay?: string;
  timezone?: string;
  params: Record<string, unknown>;
  recipients: string[];
  status?: ScheduleStatus;
}

export type SchedulePatch = Partial<ScheduleWrite> & { version: number };

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
}
