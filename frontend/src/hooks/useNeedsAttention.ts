import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { attentionApi } from "@/api/attention.api";
import { errorMessage, isApiError } from "@/api/errors";
import { refreshShell } from "@/lib/session";
import { useToast } from "@/hooks/useToast";
import type { BulkInput, BulkResult, HistoryStatus, Issue, IssueFilters, SnoozePreset } from "@/types/attention";

export const ATTENTION_KEYS = {
  all: ["attention"] as const,
  list: (f: IssueFilters) => ["attention", "list", f] as const,
  counts: () => ["attention", "counts"] as const,
  history: (status: HistoryStatus, page: number, pageSize: number) => ["attention", "history", status, page, pageSize] as const,
  recommendation: () => ["attention", "recommendation"] as const,
  assignees: () => ["attention", "assignees"] as const,
  detail: (id: string) => ["attention", "detail", id] as const,
};

export const SNOOZE_LABEL: Record<SnoozePreset, string> = {
  later_today: "later today",
  tomorrow: "tomorrow",
  this_week: "this week",
};

export function useIssues(filters: IssueFilters) {
  return useQuery({ queryKey: ATTENTION_KEYS.list(filters), queryFn: () => attentionApi.list(filters), placeholderData: keepPreviousData });
}

export function useIssueCounts() {
  return useQuery({ queryKey: ATTENTION_KEYS.counts(), queryFn: attentionApi.counts });
}

export function useIssueHistory(status: HistoryStatus, page: number, pageSize: number, enabled = true) {
  return useQuery({
    queryKey: ATTENTION_KEYS.history(status, page, pageSize),
    queryFn: () => attentionApi.history(status, page, pageSize),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** the "Recommended action" banner; null when the server has nothing to say */
export function useQueueRecommendation() {
  return useQuery({ queryKey: ATTENTION_KEYS.recommendation(), queryFn: attentionApi.recommendation });
}

/** members an issue can be assigned to (needs issues:write); an error simply hides assigning */
export function useAssignees(enabled: boolean) {
  return useQuery({ queryKey: ATTENTION_KEYS.assignees(), queryFn: attentionApi.assignees, enabled, retry: false });
}

export function useIssueDetail(id: string | null) {
  return useQuery({ queryKey: ATTENTION_KEYS.detail(id ?? ""), queryFn: () => attentionApi.detail(id as string), enabled: Boolean(id) });
}

/** what the person is told when a write fails (the server's own rule names win over the generic text) */
export function attentionError(e: unknown): { title: string; description: string } {
  if (isApiError(e)) {
    switch (e.rule) {
      case "resolution_failed":
        return { title: "Couldn't resolve the issue", description: typeof e.details?.banner === "string" ? e.details.banner : e.message };
      case "not_attemptable":
        return { title: "No automatic fix", description: "This issue has no automatic fix. Resolve it manually once the cause is fixed." };
      case "snooze_too_long":
        return { title: "Snooze is too long", description: e.message };
      case "already_resolved":
        return { title: "Already resolved", description: "This issue was resolved in the meantime." };
      default:
        break;
    }
    if (e.status === 403) return { title: "Not allowed", description: "Your role can view issues but not change them." };
    if (e.status === 404) return { title: "Issue not found", description: "It may have been removed. The list was refreshed." };
  }
  return { title: "Couldn't update the issue", description: errorMessage(e) };
}

/** after any change the lists, the counts, the drawer and the sidebar badge are read again */
function useAfterChange() {
  const qc = useQueryClient();
  return async () => {
    await qc.invalidateQueries({ queryKey: ATTENTION_KEYS.all });
    refreshShell().catch(() => undefined);
  };
}

/** the mutation set of the screen; each one toasts its result (success or the server's reason) */
export function useIssueActions() {
  const { toast } = useToast();
  const after = useAfterChange();
  const fail = (e: unknown) => {
    const { title, description } = attentionError(e);
    toast({ title, description, variant: "destructive", duration: 7000 });
  };

  const start = useGuardedMutation({
    mutationFn: (id: string) => attentionApi.start(id),
    onSuccess: (i: Issue) => toast({ title: "Marked in progress", description: i.title, variant: "success" }),
    onError: fail,
    onSettled: after,
  });

  const resolve = useGuardedMutation({
    mutationFn: ({ id, mode }: { id: string; mode: "manual" | "attempt" }) => attentionApi.resolve(id, mode),
    onSuccess: (i: Issue, v) =>
      toast({
        title: v.mode === "attempt" ? "Sync retried, issue resolved" : "Issue marked resolved",
        description: `${i.title} has been removed from the active queue. It's available in history.`,
        variant: "success",
      }),
    onError: fail,
    onSettled: after,
  });

  const snooze = useGuardedMutation({
    mutationFn: ({ id, until }: { id: string; until: SnoozePreset }) => attentionApi.snooze(id, until),
    onSuccess: (i: Issue, v) =>
      toast({ title: `Issue snoozed until ${SNOOZE_LABEL[v.until]}`, description: `${i.title} left the active queue. It returns ${SNOOZE_LABEL[v.until]}.`, variant: "success" }),
    onError: fail,
    onSettled: after,
  });

  const unsnooze = useGuardedMutation({
    mutationFn: (id: string) => attentionApi.unsnooze(id),
    onSuccess: (i: Issue) => toast({ title: "Back in the queue", description: i.title, variant: "success" }),
    onError: fail,
    onSettled: after,
  });

  const assign = useGuardedMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) => attentionApi.assign(id, userId),
    onSuccess: (i: Issue) =>
      toast({ title: "Issue assigned", description: i.assigneeName ? `${i.title} is now assigned to ${i.assigneeName}.` : i.title, variant: "success" }),
    onError: fail,
    onSettled: after,
  });

  const bulk = useGuardedMutation({
    mutationFn: (input: BulkInput) => attentionApi.bulk(input),
    onSuccess: (r: BulkResult, input) => {
      const verb = input.action === "resolve" ? "resolved" : input.action === "snooze" ? "snoozed" : "assigned";
      if (r.failed === 0) toast({ title: `${r.succeeded} ${r.succeeded === 1 ? "issue" : "issues"} ${verb}`, variant: "success" });
      else
        toast({
          title: `${r.succeeded} ${verb}, ${r.failed} failed`,
          description: "The ones that failed are still selected.",
          variant: r.succeeded ? "warning" : "destructive",
          duration: 7000,
        });
    },
    onError: fail,
    onSettled: after,
  });

  const refresh = useGuardedMutation({
    mutationFn: () => attentionApi.refresh(),
    onSuccess: (r) => toast({ title: "Queue checked", description: `${r.open} open ${r.open === 1 ? "issue" : "issues"} right now.`, variant: "success" }),
    onError: fail,
    onSettled: after,
  });

  return { start, resolve, snooze, unsnooze, assign, bulk, refresh };
}
