import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { listingAuditApi } from "@/api/listingAudit.api";
import { listingStudioApi } from "@/api/listingStudio.api";
import { errorMessage } from "@/api/errors";
import type { BulkPublishSummary, ListingSync, Suggestion } from "@/types/listingAudit";

export const AUDIT_KEYS = {
  all: ["listing-audit"] as const,
  readiness: ["listing-audit", "readiness"] as const,
  publishing: ["listing-audit", "publishing"] as const,
  sync: (id: string) => ["listing-audit", "sync", id] as const,
  channels: (id: string) => ["listing-audit", "channels", id] as const,
};

/** a screen that shows a sync in progress refreshes itself this often */
export const SYNC_POLL_MS = 4000;

export const useReadinessAudit = () => useQuery({ queryKey: AUDIT_KEYS.readiness, queryFn: listingAuditApi.getReadiness, staleTime: 0, refetchOnMount: "always" });

export const usePublishingPreparation = () => useQuery({ queryKey: AUDIT_KEYS.publishing, queryFn: listingAuditApi.getPublishing, staleTime: 0, refetchOnMount: "always" });

/** the sync telemetry of a listing; polls while a step is in progress */
export const useListingSync = (id: string) =>
  useQuery({
    queryKey: AUDIT_KEYS.sync(id),
    queryFn: () => listingAuditApi.getSync(id),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: (q) => ((q.state.data as ListingSync | undefined)?.state === "syncing" ? SYNC_POLL_MS : false),
  });

export const useListingChannels = (id: string) => useQuery({ queryKey: AUDIT_KEYS.channels(id), queryFn: () => listingAuditApi.getChannels(id), enabled: !!id, staleTime: 15_000 });

const refreshListings = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: AUDIT_KEYS.all });
  void qc.invalidateQueries({ queryKey: ["listings"] });
};

export interface ApplyOutcome {
  done: number;
  failed: Array<{ id: string; message: string }>;
}

/** confirm a suggestion: the existing PATCH per listing (attribute override); one failure never stops the rest */
export function useApplySuggestion() {
  const qc = useQueryClient();
  return useGuardedMutation({
    mutationFn: async ({ suggestion, value }: { suggestion: Suggestion; value: string }): Promise<ApplyOutcome> => {
      const out: ApplyOutcome = { done: 0, failed: [] };
      for (const id of suggestion.listingIds) {
        try {
          await listingAuditApi.setAttribute(id, suggestion.attribute, value);
          out.done += 1;
        } catch (e) {
          out.failed.push({ id, message: errorMessage(e, "Could not update the listing") });
        }
      }
      return out;
    },
    onSettled: () => refreshListings(qc),
  });
}

/** confirm and publish the ready cohort through POST /listings/bulk-publish */
export function usePublishCohort() {
  const qc = useQueryClient();
  return useGuardedMutation<BulkPublishSummary, Error, string[]>({
    mutationFn: (ids) => listingAuditApi.bulkPublish(ids),
    onSettled: () => refreshListings(qc),
  });
}

/** refresh the marketplace status / send the latest content: the existing listing endpoints, then re-read the telemetry */
export function useSyncActions(id: string) {
  const qc = useQueryClient();
  const settle = () => void qc.invalidateQueries({ queryKey: AUDIT_KEYS.sync(id) });
  const refresh = useGuardedMutation({ mutationFn: () => listingStudioApi.refreshStatus(id), onSettled: settle });
  const content = useGuardedMutation({ mutationFn: () => listingStudioApi.contentSync(id), onSettled: settle });
  return { refresh, content };
}
