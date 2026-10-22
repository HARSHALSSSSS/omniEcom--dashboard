import { useEffect, useRef } from "react";
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { importApi } from "@/api/import.api";
import { isBusy, isNotFound } from "@/components/import/importFormat";
import { saveBlob } from "@/components/products/list/saveBlob";
import { useWorkspaceStore } from "@/store/workspace.store";
import type {
  BulkResolveInput,
  CommitMode,
  HistoryQuery,
  ImportIssueTotals,
  ImportCounters,
  ImportSession,
  ImportSource,
  IssuesQuery,
  MappingChange,
  ResolveInput,
  RowsQuery,
  SettingsPatch,
} from "@/types/import";

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

export const importKeys = {
  all: ["imports"] as const,
  options: (b: string | undefined) => ["imports", "options", b] as const,
  history: (b: string | undefined, q: HistoryQuery) => ["imports", "history", b, q] as const,
  session: (b: string | undefined, id: string) => ["imports", "session", b, id] as const,
  mapping: (b: string | undefined, id: string) => ["imports", "mapping", b, id] as const,
  summary: (b: string | undefined, id: string) => ["imports", "summary", b, id] as const,
  issues: (b: string | undefined, id: string, q: IssuesQuery) => ["imports", "issues", b, id, q] as const,
  rows: (b: string | undefined, id: string, q: RowsQuery) => ["imports", "rows", b, id, q] as const,
  commitPreview: (b: string | undefined, id: string) => ["imports", "commit-preview", b, id] as const,
  warehouses: (b: string | undefined) => ["imports", "warehouses", b] as const,
  accounts: (b: string | undefined) => ["imports", "accounts", b] as const,
  marketplaceSources: (b: string | undefined) => ["imports", "marketplace-sources", b] as const,
};

/** how often a running validation or commit is asked for its progress */
export const IMPORT_POLL_MS = 1500;

/** wizard options: limits, target fields, duplicate strategies, presets, commit modes */
export function useImportOptions(enabled = true) {
  const b = useBusinessId();
  return useQuery({ queryKey: importKeys.options(b), queryFn: ({ signal }) => importApi.options(signal), staleTime: 30 * 60_000, enabled });
}

/** "Recent imports": numbered, newest first */
export function useImportHistory(query: HistoryQuery, enabled = true) {
  const b = useBusinessId();
  return useQuery({
    queryKey: importKeys.history(b, query),
    queryFn: ({ signal }) => importApi.history(query, signal),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    enabled,
  });
}

/** a marketplace import whose rows are still being pulled: it has no columns yet and is neither failed nor cancelled */
export const isPulling = (s: Pick<ImportSession, "source" | "headers" | "status">): boolean =>
  s.source === "marketplace" && s.headers.length === 0 && (s.status === "created" || s.status === "uploaded");

/** things a finished import changes elsewhere in the app */
const AFFECTED = new Set(["products", "productDetail", "listings", "inventory", "variants", "needs-attention", "dashboard"]);
function refreshCatalogue(qc: QueryClient) {
  void qc.invalidateQueries({ predicate: (q) => AFFECTED.has(String(q.queryKey[0])) });
}

/**
 * One import. While it is validating or committing the query asks the server again every 1.5 s and stops by itself
 * when the status settles (validated, committed, partially_committed, failed, cancelled). Whatever the run changed (issues,
 * rows, the catalogue) is refreshed when it ends.
 */
export function useImportSession(id: string | null) {
  const b = useBusinessId();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: importKeys.session(b, id ?? ""),
    queryFn: ({ signal }) => importApi.get(id as string, signal),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data && (isBusy(q.state.data.status) || isPulling(q.state.data)) ? IMPORT_POLL_MS : false),
    retry: (count, e) => !isNotFound(e) && count < 2,
  });

  const status = query.data?.status;
  const previous = useRef<{ id: string | null; status: ImportSession["status"] | undefined }>({ id, status });
  useEffect(() => {
    const was = previous.current;
    previous.current = { id, status };
    if (!id || !status || was.id !== id || !was.status || !isBusy(was.status) || isBusy(status)) return;
    void qc.invalidateQueries({ queryKey: ["imports", "issues"] });
    void qc.invalidateQueries({ queryKey: ["imports", "summary"] });
    void qc.invalidateQueries({ queryKey: ["imports", "rows"] });
    void qc.invalidateQueries({ queryKey: ["imports", "history"] });
    if (was.status === "committing") refreshCatalogue(qc);
  }, [id, status, qc]);

  return query;
}

export function useImportMapping(id: string | null, enabled = true) {
  const b = useBusinessId();
  return useQuery({
    queryKey: importKeys.mapping(b, id ?? ""),
    queryFn: ({ signal }) => importApi.mapping(id as string, signal),
    enabled: Boolean(id) && enabled,
    retry: (count, e) => !isNotFound(e) && count < 2,
  });
}

export function useImportSummary(id: string | null, enabled = true) {
  const b = useBusinessId();
  return useQuery({
    queryKey: importKeys.summary(b, id ?? ""),
    queryFn: ({ signal }) => importApi.summary(id as string, signal),
    enabled: Boolean(id) && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useImportIssues(id: string | null, query: IssuesQuery, enabled = true) {
  const b = useBusinessId();
  return useQuery({
    queryKey: importKeys.issues(b, id ?? "", query),
    queryFn: ({ signal }) => importApi.issues(id as string, query, signal),
    enabled: Boolean(id) && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useImportRows(id: string | null, query: RowsQuery, enabled = true) {
  const b = useBusinessId();
  return useQuery({
    queryKey: importKeys.rows(b, id ?? "", query),
    queryFn: ({ signal }) => importApi.rows(id as string, query, signal),
    enabled: Boolean(id) && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useWarehouseChoices(enabled = true) {
  const b = useBusinessId();
  return useQuery({ queryKey: importKeys.warehouses(b), queryFn: importApi.warehouses, staleTime: 5 * 60_000, retry: false, enabled });
}

export function useAccountChoices(enabled = true) {
  const b = useBusinessId();
  return useQuery({ queryKey: importKeys.accounts(b), queryFn: importApi.accounts, staleTime: 5 * 60_000, retry: false, enabled });
}

/** connected marketplaces the catalogue can be pulled from (empty list when none, or when the API has no such source) */
export function useMarketplaceSources(enabled = true) {
  const b = useBusinessId();
  return useQuery({ queryKey: importKeys.marketplaceSources(b), queryFn: ({ signal }) => importApi.marketplaceSources(signal), staleTime: 60_000, retry: false, enabled });
}

/**
 * The open issues of several kinds at once (the wizard groups issue codes into a few kinds): one request per code, merged by row.
 * `limit` is the page size of each request.
 */
export function useImportIssuesByCodes(id: string | null, codes: string[], limit: number, enabled = true) {
  const b = useBusinessId();
  const results = useQueries({
    queries: codes.map((code) => {
      const query: IssuesQuery = { code, status: "open", page: 1, pageSize: limit };
      return {
        queryKey: importKeys.issues(b, id ?? "", query),
        queryFn: ({ signal }: { signal: AbortSignal }) => importApi.issues(id as string, query, signal),
        enabled: Boolean(id) && enabled,
        placeholderData: keepPreviousData,
      };
    }),
  });
  const items = results.flatMap((r) => r.data?.items ?? []).sort((a, z) => a.rowNumber - z.rowNumber);
  const total = results.reduce((n, r) => n + (r.data?.total ?? 0), 0);
  return {
    items,
    total,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
    error: results.find((r) => r.error)?.error ?? null,
    refetch: () => results.forEach((r) => void r.refetch()),
  };
}

// ---------------------------------------------------------------- writes

/** keeps the cached session in step with what a write returned, so counters move without waiting for a refetch */
function useSessionCache() {
  const b = useBusinessId();
  const qc = useQueryClient();
  return {
    put: (session: ImportSession) => qc.setQueryData(importKeys.session(b, session.id), session),
    patch: (id: string, patch: { issues?: ImportIssueTotals; counters?: ImportCounters }) =>
      qc.setQueryData<ImportSession>(importKeys.session(b, id), (old) => (old ? { ...old, ...patch } : old)),
    refreshHistory: () => void qc.invalidateQueries({ queryKey: ["imports", "history"] }),
    refreshIssues: () => {
      void qc.invalidateQueries({ queryKey: ["imports", "issues"] });
      void qc.invalidateQueries({ queryKey: ["imports", "summary"] });
      void qc.invalidateQueries({ queryKey: ["imports", "rows"] });
      void qc.invalidateQueries({ queryKey: ["imports", "commit-preview"] });
    },
  };
}

export function useCreateImport() {
  const cache = useSessionCache();
  return useMutation({
    mutationFn: (input: { source: ImportSource; fileName: string; fileSizeBytes: number }) => importApi.create(input),
    onSuccess: (session) => {
      cache.put(session);
      cache.refreshHistory();
    },
  });
}

/** starts an import from a connected marketplace account (the rows are pulled by the server) */
export function useImportFromMarketplace() {
  const cache = useSessionCache();
  return useMutation({
    mutationFn: (accountId: string) => importApi.fromMarketplace(accountId),
    onSuccess: (session) => {
      cache.put(session);
      cache.refreshHistory();
    },
  });
}

export function useUploadImportFile() {
  const b = useBusinessId();
  const qc = useQueryClient();
  const cache = useSessionCache();
  return useMutation({
    mutationFn: ({ id, file, onProgress, signal }: { id: string; file: Blob; onProgress?: (percent: number) => void; signal?: AbortSignal }) =>
      importApi.upload(id, file, { onProgress, signal }),
    onSuccess: ({ session }) => {
      cache.put(session);
      void qc.invalidateQueries({ queryKey: importKeys.mapping(b, session.id) });
      cache.refreshIssues();
      cache.refreshHistory();
    },
  });
}

export function useUpdateMapping(id: string) {
  const b = useBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (change: MappingChange) => importApi.updateMapping(id, change),
    onSuccess: (view) => {
      qc.setQueryData(importKeys.mapping(b, id), view);
      // a validated import goes back to "analyzed" when its mapping changes
      void qc.invalidateQueries({ queryKey: importKeys.session(b, id) });
    },
    // a failed change leaves the select showing the old value: re-read what the server holds
    onError: () => void qc.invalidateQueries({ queryKey: importKeys.mapping(b, id) }),
  });
}

export function useUpdateSettings(id: string) {
  const cache = useSessionCache();
  return useMutation({ mutationFn: (patch: SettingsPatch) => importApi.updateSettings(id, patch), onSuccess: cache.put });
}

/** saves settings of an import that may have only just been created (the id comes with the call) */
export function useSaveSettings() {
  const cache = useSessionCache();
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: SettingsPatch }) => importApi.updateSettings(id, patch), onSuccess: cache.put });
}

export function useValidateImport(id: string) {
  const cache = useSessionCache();
  return useMutation({
    mutationFn: () => importApi.validate(id),
    onSuccess: (session) => {
      cache.put(session);
      cache.refreshHistory();
    },
  });
}

export function useRevalidateImport(id: string) {
  const cache = useSessionCache();
  return useMutation({
    mutationFn: () => importApi.revalidate(id),
    onSuccess: (res) => {
      cache.put(res.session);
      cache.refreshIssues();
      cache.refreshHistory();
    },
  });
}

/** exact row counts for each commit choice (refetched whenever issues change) */
export function useCommitPreview(id: string | undefined, enabled = true) {
  const b = useBusinessId();
  return useQuery({
    queryKey: importKeys.commitPreview(b, id ?? ""),
    queryFn: () => importApi.commitPreview(id as string),
    enabled: !!id && enabled,
    staleTime: 0,
    retry: false,
  });
}

export function useCommitImport(id: string) {
  const cache = useSessionCache();
  return useMutation({
    mutationFn: (mode: CommitMode) => importApi.commit(id, mode),
    onSuccess: (res) => {
      cache.put(res.session);
      cache.refreshHistory();
    },
  });
}

export function useCancelImport(id: string) {
  const cache = useSessionCache();
  return useMutation({
    mutationFn: () => importApi.cancel(id),
    onSuccess: (session) => {
      cache.put(session);
      cache.refreshHistory();
    },
  });
}

export function useResolveIssue(id: string) {
  const cache = useSessionCache();
  return useMutation({
    mutationFn: (input: ResolveInput) => importApi.resolve(id, input),
    onSuccess: (res) => {
      cache.patch(id, { issues: res.issues, counters: res.counters });
      cache.refreshIssues();
    },
  });
}

export function useBulkResolve(id: string) {
  const cache = useSessionCache();
  return useMutation({
    mutationFn: (input: BulkResolveInput) => importApi.bulkResolve(id, input),
    onSuccess: (res) => {
      cache.patch(id, { issues: res.issues, counters: res.counters });
      cache.refreshIssues();
    },
  });
}

// ---------------------------------------------------------------- downloads

export function useDownloadTemplate() {
  return useMutation({
    mutationFn: async (format: "csv" | "xlsx") => {
      const file = await importApi.template(format);
      saveBlob(file.blob, file.fileName);
    },
  });
}

export function useDownloadErrors(id: string) {
  return useMutation({
    mutationFn: async () => {
      const file = await importApi.errorsCsv(id);
      saveBlob(file.blob, file.fileName);
    },
  });
}
