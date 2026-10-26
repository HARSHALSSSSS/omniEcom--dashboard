import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import { ApiError, isApiError } from "./errors";
import { hubApi } from "./hub.api";
import { procurementApi } from "./procurement.api";
import { productCreationApi } from "./productCreation.api";
import type { CategoryNode } from "@/types/productCreation";
import type {
  Catalog,
  DownloadedFile,
  ExportRequest,
  MarketplacesReportResponse,
  Paged,
  ReportRun,
  ReportSchedule,
  ReportsOverview,
  ReturnsReportResponse,
  RunQuery,
  SalesReportResponse,
  SchedulePatch,
  ScheduleQuery,
  ScheduleWrite,
} from "@/types/reports";

export function runParams(q: RunQuery): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (q.type) out["filter[type]"] = q.type;
  if (q.status) out["filter[status]"] = q.status;
  if (q.trigger) out["filter[trigger]"] = q.trigger;
  if (q.page > 1) out.page = q.page;
  out.pageSize = q.pageSize;
  return out;
}

export function scheduleParams(q: ScheduleQuery): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (q.status) out["filter[status]"] = q.status;
  if (q.page > 1) out.page = q.page;
  out.pageSize = q.pageSize;
  return out;
}

/** the file name the server sent in `Content-Disposition`, if any */
export function fileNameFrom(header: string | undefined | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? null;
}

/** A failed blob request carries its JSON error as a Blob the client cannot read, so the status decides the sentence. */
function downloadError(e: unknown): unknown {
  if (!isApiError(e)) return e;
  if (e.status === 404) return new ApiError({ code: "NOT_FOUND", message: "This file has expired or is no longer stored. Generate the report again.", status: 404, details: { rule: "file_expired" }, requestId: e.requestId });
  if (e.status === 409 || e.status === 422) return new ApiError({ code: "INVALID_STATE", message: "This report has no file yet. Wait until it has finished.", status: e.status, details: { rule: "run_not_ready" }, requestId: e.requestId });
  return e;
}

export interface ParamChoice {
  value: string;
  label: string;
}

const flattenCategories = (nodes: CategoryNode[]): ParamChoice[] => nodes.flatMap((n) => [{ value: n.id, label: n.path || n.name }, ...flattenCategories(n.children ?? [])]);

export const reportsApi = {
  /** the lists behind the warehouse, marketplace, account and category parameters */
  choices: {
    warehouses: async (signal?: AbortSignal): Promise<ParamChoice[]> => (await procurementApi.warehouses(signal)).map((w) => ({ value: w.id, label: `${w.name} (${w.code})` })),
    accounts: async (signal?: AbortSignal): Promise<Array<ParamChoice & { marketplace: string }>> =>
      (await hubApi.accounts(signal)).items.map((a) => ({ value: a.id, label: `${a.name}${a.accountIdentifier ? ` (${a.accountIdentifier})` : ""}`, marketplace: a.marketplace })),
    categories: async (): Promise<ParamChoice[]> => flattenCategories(await productCreationApi.categoryTree()),
  },

  overview: async (signal?: AbortSignal) => unwrap<ReportsOverview>(await client.get(ENDPOINTS.REPORTS_OVERVIEW, { signal })),

  catalog: async (signal?: AbortSignal) => unwrap<Catalog>(await client.get(ENDPOINTS.REPORTS_CATALOG, { signal })),

  sales: async (params?: { from?: string; to?: string; period?: "day" | "week" | "month"; marketplace?: string }, signal?: AbortSignal) =>
    unwrap<SalesReportResponse>(await client.get(ENDPOINTS.REPORTS_SALES, { params, signal })),

  marketplaces: async (params?: { from?: string; to?: string }, signal?: AbortSignal) =>
    unwrap<MarketplacesReportResponse>(await client.get(ENDPOINTS.REPORTS_MARKETPLACES, { params, signal })),

  returns: async (params?: { from?: string; to?: string }, signal?: AbortSignal) =>
    unwrap<ReturnsReportResponse>(await client.get(ENDPOINTS.REPORTS_RETURNS, { params, signal })),

  /** 201 with a finished run, or 202 with a queued one (poll `getRun`). One Idempotency-Key is not offered by this endpoint, so callers lock the button while it runs. */
  exportReport: async (body: ExportRequest) => unwrap<ReportRun>(await client.post(ENDPOINTS.REPORT_EXPORTS, { ...body, background: body.background ?? false })),

  listRuns: async (query: RunQuery, signal?: AbortSignal) => unwrap<Paged<ReportRun>>(await client.get(ENDPOINTS.REPORT_RUNS, { params: runParams(query), signal })),

  getRun: async (id: string, signal?: AbortSignal) => unwrap<ReportRun>(await client.get(ENDPOINTS.REPORT_RUN(id), { signal })),

  /** the binary file, fetched with the bearer token (a plain link would carry none) */
  downloadRun: async (run: Pick<ReportRun, "id" | "fileName" | "format">): Promise<DownloadedFile> => {
    try {
      const res = await client.get<Blob>(ENDPOINTS.REPORT_RUN_DOWNLOAD(run.id), { responseType: "blob" });
      const header = (res.headers as Record<string, string | undefined> | undefined)?.["content-disposition"];
      return { blob: res.data, fileName: fileNameFrom(header) ?? run.fileName ?? `report-${run.id}.${run.format}` };
    } catch (e) {
      throw downloadError(e);
    }
  },

  listSchedules: async (query: ScheduleQuery, signal?: AbortSignal) => unwrap<Paged<ReportSchedule>>(await client.get(ENDPOINTS.REPORTS_SCHEDULES, { params: scheduleParams(query), signal })),

  getSchedule: async (id: string, signal?: AbortSignal) => unwrap<ReportSchedule>(await client.get(ENDPOINTS.REPORT_SCHEDULE(id), { signal })),

  createSchedule: async (body: ScheduleWrite) => unwrap<ReportSchedule>(await client.post(ENDPOINTS.REPORTS_SCHEDULES, body)),

  /** needs the `version` the schedule was read at; a stale one answers 409 VERSION_CONFLICT */
  updateSchedule: async (id: string, body: SchedulePatch) => unwrap<ReportSchedule>(await client.patch(ENDPOINTS.REPORT_SCHEDULE(id), body)),

  deleteSchedule: async (id: string) => unwrap<{ deleted: true; id: string }>(await client.delete(ENDPOINTS.REPORT_SCHEDULE(id))),

  pauseSchedule: async (id: string) => unwrap<ReportSchedule>(await client.post(ENDPOINTS.REPORT_SCHEDULE_ACTION(id, "pause"), {})),

  resumeSchedule: async (id: string) => unwrap<ReportSchedule>(await client.post(ENDPOINTS.REPORT_SCHEDULE_ACTION(id, "resume"), {})),

  /** always queued (202): poll the returned run */
  runScheduleNow: async (id: string) => unwrap<ReportRun>(await client.post(ENDPOINTS.REPORT_SCHEDULE_ACTION(id, "run-now"), {})),
};
