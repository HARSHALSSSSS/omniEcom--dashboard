import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { importProcessingApi } from "@/api/importProcessing.api";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { ImportSession } from "@/types/import";
import type { ActivityItem, IssuesListQuery } from "@/types/importProcessing";

/** how often the activity feed of a running import is asked for what is new */
export const ACTIVITY_POLL_MS = 2500;
const PAGE = 50;

export const importActivityKey = (business: string | undefined, id: string) => ["imports", "activity", business, id] as const;

/** newest first; ISO timestamps compare as text, equal ones keep the order the server gave */
function merge(known: Map<string, ActivityItem>, incoming: ActivityItem[]): Map<string, ActivityItem> {
  let next: Map<string, ActivityItem> | null = null;
  for (const item of incoming) {
    if (known.has(item.id)) continue;
    next ??= new Map(known);
    next.set(item.id, item);
  }
  return next ?? known;
}

/**
 * The activity feed of an import. The newest page is asked again every 2.5 s while the import runs; whatever was
 * seen stays in the list, and "Load older" walks back through the cursor (`nextBefore`).
 */
export function useImportActivity(id: string | null, running: boolean, enabled = true) {
  const business = useWorkspaceStore((s) => s.shell?.business.id);
  const head = useQuery({
    queryKey: importActivityKey(business, id ?? ""),
    queryFn: ({ signal }) => importProcessingApi.activity(id as string, { limit: PAGE }, signal),
    enabled: Boolean(id) && enabled,
    refetchInterval: running ? ACTIVITY_POLL_MS : false,
    retry: false,
  });

  const [known, setKnown] = useState<Map<string, ActivityItem>>(() => new Map());
  const [olderCursor, setOlderCursor] = useState<string | null | undefined>(undefined);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<unknown>(null);
  const [firstCursor, setFirstCursor] = useState<string | null | undefined>(undefined);
  const owner = useRef(id);

  // another import: start the list again
  useEffect(() => {
    if (owner.current === id) return;
    owner.current = id;
    setFirstCursor(undefined);
    setKnown(new Map());
    setOlderCursor(undefined);
    setOlderError(null);
  }, [id]);

  useEffect(() => {
    const page = head.data;
    if (!page) return;
    setFirstCursor((c) => (c === undefined ? page.nextBefore : c));
    setKnown((k) => merge(k, page.items));
  }, [head.data]);

  const items = useMemo(() => {
    const all = [...known.values()];
    return all
      .map((item, index) => ({ item, index }))
      .sort((a, b) => (a.item.at === b.item.at ? a.index - b.index : a.item.at < b.item.at ? 1 : -1))
      .map((x) => x.item);
  }, [known]);

  const cursor = olderCursor === undefined ? (firstCursor ?? null) : olderCursor;

  const loadOlder = useCallback(async () => {
    if (!id || !cursor || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const page = await importProcessingApi.activity(id, { limit: PAGE, before: cursor });
      setKnown((k) => merge(k, page.items));
      setOlderCursor(page.nextBefore);
    } catch (e) {
      setOlderError(e);
    } finally {
      setLoadingOlder(false);
    }
  }, [id, cursor, loadingOlder]);

  return { items, isLoading: head.isLoading, isError: head.isError && items.length === 0, error: head.error, refetch: head.refetch, hasOlder: Boolean(cursor), loadOlder, loadingOlder, olderError };
}

/** one page of issues, with the server-side Field filter and sort (same cache family as the other issue queries) */
export function useIssuesList(id: string | null, query: IssuesListQuery, enabled = true) {
  const business = useWorkspaceStore((s) => s.shell?.business.id);
  return useQuery({
    queryKey: ["imports", "issues", business, id ?? "", query] as const,
    queryFn: ({ signal }) => importProcessingApi.issues(id as string, query, signal),
    enabled: Boolean(id) && enabled,
    placeholderData: keepPreviousData,
  });
}

/** uploads the replacement image of an `invalid_image` issue; the counters move with the answer */
export function useUploadIssueImage(id: string) {
  const business = useWorkspaceStore((s) => s.shell?.business.id);
  const qc = useQueryClient();
  return useGuardedMutation({
    mutationFn: ({ issueId, file, onProgress }: { issueId: string; file: File; onProgress?: (percent: number) => void }) => importProcessingApi.uploadImage(id, issueId, file, { onProgress }),
    onSuccess: (res) => {
      qc.setQueryData<ImportSession>(["imports", "session", business, id], (old) => (old ? { ...old, issues: res.issues, counters: res.counters } : old));
      for (const key of ["issues", "summary", "rows", "commit-preview"]) void qc.invalidateQueries({ queryKey: ["imports", key] });
    },
  });
}
