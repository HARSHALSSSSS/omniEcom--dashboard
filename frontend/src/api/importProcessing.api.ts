import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { ImportCounters, ImportIssueTotals } from "@/types/import";
import type { ActivityPage, ActivityQuery, IssueX, IssuesListQuery, IssuesPage } from "@/types/importProcessing";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface ImageUploadResult {
  issue: IssueX;
  issues: ImportIssueTotals;
  counters: ImportCounters;
}

export const importProcessingApi = {
  /** the activity feed of one import, newest first; `before` is the `nextBefore` of the previous page */
  activity: async (id: string, query: ActivityQuery = {}, signal?: AbortSignal) => {
    const params: Record<string, string | number> = { limit: query.limit ?? 50 };
    if (query.before) params.before = query.before;
    return unwrap<ActivityPage>(await client.get(ENDPOINTS.IMPORT_ACTIVITY(id), { params, signal }));
  },

  /** one numbered page of issues with the server-side `field` filter and `sort` */
  issues: async (id: string, query: IssuesListQuery, signal?: AbortSignal) => {
    const params: Record<string, string | number> = { pageSize: query.pageSize };
    if (query.page > 1) params.page = query.page;
    if (query.q) params.q = query.q;
    if (query.code) params["filter[code]"] = query.code;
    if (query.severity) params["filter[severity]"] = query.severity;
    if (query.status) params["filter[status]"] = query.status;
    if (query.field) params["filter[field]"] = query.field;
    if (query.sort) params.sort = query.sort;
    return unwrap<IssuesPage>(await client.get(ENDPOINTS.IMPORT_ISSUES(id), { params, signal }));
  },

  /** replaces the image of an `invalid_image` issue with an uploaded file (raw body, png, jpeg or webp, at most 5 MB) */
  uploadImage: async (id: string, issueId: string, file: Blob, opts: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {}) =>
    unwrap<ImageUploadResult>(
      await client.post(`${ENDPOINTS.IMPORT_ISSUE(id, issueId)}/image`, file, {
        headers: { "Content-Type": file.type },
        transformRequest: [(data: unknown) => data],
        signal: opts.signal,
        onUploadProgress: (e) => {
          if (opts.onProgress && e.total) opts.onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
        },
      }),
    ),
};
