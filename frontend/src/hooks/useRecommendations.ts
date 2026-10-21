import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { recommendationsApi } from "@/api/recommendations.api";
import { errorMessage } from "@/api/errors";
import { SYNC_JOB_DONE, type SyncJob } from "@/types/recommendations";

export const RECOMMENDATION_KEYS = { all: ["recommendations"] as const };

export function useRecommendations() {
  return useQuery({ queryKey: RECOMMENDATION_KEYS.all, queryFn: recommendationsApi.get });
}

export type RetrySyncState =
  | { phase: "idle" }
  | { phase: "running"; job: SyncJob | null }
  | { phase: "done"; job: SyncJob }
  | { phase: "error"; message: string };

/**
 * Starts the channel's own retry-sync action and follows the queued job until it ends (GET /sync/jobs/{id}).
 * When it ends the cards are read again, so the channel's health reflects what the sync really did.
 */
export function useRetrySync(intervalMs = 1500, maxPolls = 80) {
  const qc = useQueryClient();
  const [state, setState] = useState<RetrySyncState>({ phase: "idle" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    async (href: string) => {
      setState({ phase: "running", job: null });
      try {
        const { job: queued } = await recommendationsApi.retrySync(href);
        let job = queued;
        if (alive.current) setState({ phase: "running", job });
        for (let n = 0; n < maxPolls && !SYNC_JOB_DONE.includes(job.status); n++) {
          await new Promise((r) => setTimeout(r, intervalMs));
          if (!alive.current) return;
          job = await recommendationsApi.syncJob(job.id);
          setState({ phase: "running", job });
        }
        if (!alive.current) return;
        if (!SYNC_JOB_DONE.includes(job.status)) {
          setState({ phase: "error", message: "The sync is still running. Check the connection again in a moment." });
        } else {
          setState({ phase: "done", job });
        }
        await qc.invalidateQueries({ queryKey: RECOMMENDATION_KEYS.all });
      } catch (e) {
        if (alive.current) setState({ phase: "error", message: errorMessage(e, "Couldn't start the sync.") });
      }
    },
    [qc, intervalMs, maxPolls],
  );

  return { state, run, reset: () => setState({ phase: "idle" }) };
}
