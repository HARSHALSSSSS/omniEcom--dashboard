import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  AccountChoice,
  BulkResolveInput,
  BulkResult,
  CommitMode,
  CommitPreview,
  CommitStart,
  DownloadedFile,
  HistoryQuery,
  ImportIssue,
  ImportOptions,
  ImportRow,
  ImportSession,
  ImportSource,
  ImportSummary,
  ImportUiStatus,
  IssuesQuery,
  MappingChange,
  MappingView,
  Paged,
  ResolveInput,
  ResolveResult,
  RevalidationResult,
  RowsQuery,
  SettingsPatch,
  UploadResult,
  WarehouseChoice,
} from "@/types/import";

/** the small status record `useJobPolling` (generic job poller) reads; the wizard itself follows `GET /imports/{id}` */
export interface JobStatusResponse {
  id: string;
  status: ImportUiStatus;
  progress: number;
  total: number;
  processed: number;
  valid: number;
  errors: number;
}

/** `Content-Disposition: attachment; filename="x.csv"` -> `x.csv` */
export function fileNameFromDisposition(header: unknown, fallback: string): string {
  if (typeof header !== "string") return fallback;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}

/**
 * Binary download through the shared client (a plain link would carry no Authorization header). The body is read as
 * bytes; an error body is turned back into JSON so the client's error mapper still sees the API's message.
 */
async function download(url: string, fallbackName: string, params?: Record<string, string>): Promise<DownloadedFile> {
  const res = await client.get<ArrayBuffer>(url, {
    params,
    responseType: "arraybuffer",
    transformResponse: [
      (data: unknown, _headers: unknown, status?: number) => {
        if (status !== undefined && status >= 400 && data instanceof ArrayBuffer) {
          try {
            return JSON.parse(new TextDecoder().decode(data));
          } catch {
            return undefined;
          }
        }
        return data;
      },
    ],
  });
  const type = String(res.headers["content-type"] ?? "application/octet-stream");
  return { blob: new Blob([res.data], { type }), fileName: fileNameFromDisposition(res.headers["content-disposition"], fallbackName) };
}

const numbered = (q: { page: number; pageSize: number; q?: string }): Record<string, string | number> => {
  const params: Record<string, string | number> = { pageSize: q.pageSize };
  if (q.page > 1) params.page = q.page;
  if (q.q) params.q = q.q;
  return params;
};

export const importApi = {
  options: async (signal?: AbortSignal) => unwrap<ImportOptions>(await client.get(ENDPOINTS.IMPORT_OPTIONS, { signal })),

  template: (format: "csv" | "xlsx") => download(ENDPOINTS.IMPORT_TEMPLATE, `product-import-template.${format}`, { format }),

  /** step 1: declares the file; its bytes go to `upload` next */
  create: async (input: { source: ImportSource; fileName: string; fileSizeBytes: number }) =>
    unwrap<ImportSession>(await client.post(ENDPOINTS.IMPORTS, input)),

  history: async (query: HistoryQuery, signal?: AbortSignal) => {
    const params = numbered(query);
    if (query.status) params["filter[status]"] = query.status;
    return unwrap<Paged<ImportSession>>(await client.get(ENDPOINTS.IMPORTS, { params, signal }));
  },

  get: async (id: string, signal?: AbortSignal) => unwrap<ImportSession>(await client.get(ENDPOINTS.IMPORT(id), { signal })),

  /** raw file body (csv, tsv or xlsx); `onProgress` gets 0..100 while the bytes leave the browser */
  upload: async (id: string, file: Blob, opts: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {}) =>
    unwrap<UploadResult>(
      await client.post(ENDPOINTS.IMPORT_FILE(id), file, {
        headers: { "Content-Type": "application/octet-stream" },
        transformRequest: [(data: unknown) => data],
        signal: opts.signal,
        onUploadProgress: (e) => {
          if (opts.onProgress && e.total) opts.onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
        },
      }),
    ),

  mapping: async (id: string, signal?: AbortSignal) => unwrap<MappingView>(await client.get(ENDPOINTS.IMPORT_MAPPING(id), { signal })),

  /** one column at a time; `targetField: null` is "do not import this column" */
  updateMapping: async (id: string, change: MappingChange) => unwrap<MappingView>(await client.put(ENDPOINTS.IMPORT_MAPPING(id), change)),

  updateSettings: async (id: string, patch: SettingsPatch) => unwrap<ImportSession>(await client.put(ENDPOINTS.IMPORT_SETTINGS(id), patch)),

  /** 202: the validation runs as a job, follow `get` */
  validate: async (id: string) => unwrap<ImportSession>(await client.post(ENDPOINTS.IMPORT_VALIDATE(id))),

  /** 200 (re-checked inside the request) or 202 (`queued: true`, follow `get`) */
  revalidate: async (id: string) => unwrap<RevalidationResult>(await client.post(ENDPOINTS.IMPORT_REVALIDATE(id))),

  summary: async (id: string, signal?: AbortSignal) => unwrap<ImportSummary>(await client.get(ENDPOINTS.IMPORT_SUMMARY(id), { signal })),

  issues: async (id: string, query: IssuesQuery, signal?: AbortSignal) => {
    const params = numbered(query);
    if (query.code) params["filter[code]"] = query.code;
    if (query.severity) params["filter[severity]"] = query.severity;
    if (query.status) params["filter[status]"] = query.status;
    return unwrap<Paged<ImportIssue>>(await client.get(ENDPOINTS.IMPORT_ISSUES(id), { params, signal }));
  },

  rows: async (id: string, query: RowsQuery, signal?: AbortSignal) => {
    const params = numbered(query);
    if (query.status) params["filter[status]"] = query.status;
    return unwrap<Paged<ImportRow>>(await client.get(ENDPOINTS.IMPORT_ROWS(id), { params, signal }));
  },

  resolve: async (id: string, input: ResolveInput) =>
    unwrap<ResolveResult>(await client.post(ENDPOINTS.IMPORT_ISSUE(id, input.issueId), { action: input.action, customValue: input.customValue })),

  bulkResolve: async (id: string, input: BulkResolveInput) => unwrap<BulkResult>(await client.post(ENDPOINTS.IMPORT_ISSUES_BULK(id), input)),

  commitPreview: async (id: string) => unwrap<CommitPreview>(await client.get(ENDPOINTS.IMPORT_COMMIT_PREVIEW(id))),

  /** 202: the commit runs as a job, follow `get` */
  commit: async (id: string, mode: CommitMode) => unwrap<CommitStart>(await client.post(ENDPOINTS.IMPORT_COMMIT(id), { mode })),

  cancel: async (id: string) => unwrap<ImportSession>(await client.post(ENDPOINTS.IMPORT_CANCEL(id))),

  /** the unresolved issues as a CSV file */
  errorsCsv: (id: string) => download(ENDPOINTS.IMPORT_ERRORS_CSV(id), `import-${id.slice(0, 8)}-issues.csv`),

  /** active warehouses (where the stock column lands) */
  warehouses: async (): Promise<WarehouseChoice[]> => {
    const res = await client.get<{ data: WarehouseChoice[] }>(ENDPOINTS.WAREHOUSES, { params: { limit: 100, "filter[status]": "active" } });
    return res.data.data;
  },

  /** connected marketplace accounts (where draft listings are created) */
  accounts: async (): Promise<AccountChoice[]> => {
    const res = await client.get<{ data: AccountChoice[] }>(ENDPOINTS.MARKETPLACE_ACCOUNTS, { params: { limit: 100 } });
    return res.data.data.map((a) => ({ id: a.id, marketplace: a.marketplace, displayName: a.displayName, status: a.status }));
  },

  /** generic job record, only for `useJobPolling` */
  getJobStatus: async (jobId: string): Promise<JobStatusResponse> => unwrap<JobStatusResponse>(await client.get(ENDPOINTS.JOB(jobId))),
};
