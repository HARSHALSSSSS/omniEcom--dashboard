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

export const REPORT_TABS = ["overview", "reports", "history", "schedules"] as const;
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

export interface SalesReportTotals {
  orders: number;
  units: number;
  subtotalMinor: number;
  taxMinor: number;
  shippingMinor: number;
  discountMinor: number;
  grossMinor: number;
  averageOrderValueMinor: number;
}

export interface SalesReportSeriesItem {
  bucket: string;
  orders: number;
  grossMinor: number;
}

export interface SalesReportByMarketplaceItem {
  marketplace: string;
  orders: number;
  grossMinor: number;
}

export interface SalesReportResponse {
  window: { from: string; to: string };
  period: string;
  totals: SalesReportTotals;
  series: SalesReportSeriesItem[];
  byMarketplace: SalesReportByMarketplaceItem[];
  byPaymentMethod: Array<{ method: string; orders: number; grossMinor: number }>;
}

export interface MarketplaceReportAccount {
  accountId: string;
  marketplace: string;
  displayName: string | null;
  status: string;
  orders: number;
  revenueMinor: number;
  cancelled: number;
  cancellationRate: number;
  returns: number;
  returnRate: number;
  listings: Record<string, number>;
  syncJobs: number;
  syncFailures: number;
  syncFailureRate: number;
}

export interface MarketplacesReportResponse {
  window: { from: string; to: string };
  accounts: MarketplaceReportAccount[];
}

export interface ReturnsReportTotals {
  returns: number;
  unitsRequested: number;
  unitsReceived: number;
  unitsRestocked: number;
  unitsDecided: number;
  unitReturnRate: number;
  avgDaysToReceive: number | null;
  avgDaysToComplete: number | null;
}

export interface ReturnsReportResponse {
  window: { from: string; to: string };
  totals: ReturnsReportTotals;
  byStatus: Array<{ status: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  byReason: Array<{ reasonCode: string; count: number }>;
  dispositions: Array<{ disposition: string; units: number }>;
  refunds: Array<{ status: string; count: number; amountMinor: number }>;
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

// ---------------------------------------------------------------- GET /reports/overview-kpis
export const OVERVIEW_COMPARES = ["previous", "previous_year", "none"] as const;
export type OverviewCompare = (typeof OVERVIEW_COMPARES)[number];

export interface OverviewTotals {
  orders: number;
  units: number;
  grossMinor: number;
  taxMinor: number;
  shippingMinor: number;
  discountMinor: number;
  /** order subtotal less discounts, before tax and shipping */
  netSalesMinor: number;
  averageOrderValueMinor: number;
}

export interface OverviewRefunds {
  amountMinor: number;
  /** refunds over gross sales in basis points; null without sales */
  rateBps: number | null;
  returns: number;
}

export interface OverviewMargin {
  /** null while a product cost is missing */
  marginBps: number | null;
  contributionMinor: number | null;
  /** the share of revenue whose product cost is known (0 to 1) */
  coverage: number;
  completeness: "complete" | "estimated" | "incomplete";
  missing: string[];
}

export interface OverviewSeriesPoint {
  bucket: string;
  orders: number;
  grossMinor: number;
}

export interface OverviewChannel {
  marketplace: string;
  orders: number;
  grossMinor: number;
  shareBps: number;
  averageOrderValueMinor: number;
  marginBps: number | null;
  previousGrossMinor: number | null;
  changeBps: number | null;
}

export interface OverviewKpis {
  range: { from: string; to: string };
  previousRange: { from: string; to: string } | null;
  compare: OverviewCompare;
  period: "day" | "week" | "month";
  totals: OverviewTotals;
  previous: OverviewTotals | null;
  refunds: OverviewRefunds;
  previousRefunds: OverviewRefunds | null;
  margin: OverviewMargin;
  previousMargin: OverviewMargin | null;
  series: OverviewSeriesPoint[];
  previousSeries: OverviewSeriesPoint[] | null;
  channels: OverviewChannel[];
  connectedAccounts: number;
  totalAccounts: number;
}

export interface OverviewKpisQuery {
  from: string;
  to: string;
  compare: OverviewCompare;
  period?: "day" | "week" | "month";
}
