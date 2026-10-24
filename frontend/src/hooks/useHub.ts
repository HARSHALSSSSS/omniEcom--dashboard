import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { hubApi } from "@/api/hub.api";
import { refreshAfterChannelChange } from "@/lib/channelRefresh";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { HubSyncJob, SyncScope, SyncStart } from "@/types/hub";

export const HUB_KEYS = {
  all: ["hub"] as const,
  accounts: (businessId: string | undefined) => ["hub", "accounts", businessId] as const,
  account: (id: string) => ["hub", "account", id] as const,
  health: (businessId: string | undefined) => ["hub", "health", businessId] as const,
  connector: (code: string) => ["hub", "connector", code] as const,
  syncStatus: (id: string) => ["hub", "sync-status", id] as const,
  logs: (jobId: string) => ["hub", "job-logs", jobId] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

/** every connected account; polls while a sync is running so the progress bars move */
export function useHubAccounts() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: HUB_KEYS.accounts(businessId),
    queryFn: ({ signal }) => hubApi.accounts(signal),
    staleTime: 15_000,
    refetchInterval: (q) => (q.state.data?.items.some((a) => a.syncState === "syncing") ? 4000 : false),
  });
}

export function useHubAccount(id: string | null) {
  return useQuery({
    queryKey: HUB_KEYS.account(id ?? ""),
    queryFn: ({ signal }) => hubApi.account(id as string, signal),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: (q) => (q.state.data?.syncState === "syncing" ? 4000 : false),
  });
}

export function useHubHealth() {
  const businessId = useBusinessId();
  return useQuery({ queryKey: HUB_KEYS.health(businessId), queryFn: ({ signal }) => hubApi.health(signal), staleTime: 15_000 });
}

export function useConnector(code: string | null) {
  return useQuery({
    queryKey: HUB_KEYS.connector(code ?? ""),
    queryFn: ({ signal }) => hubApi.connector(code as string, signal),
    enabled: Boolean(code),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useJobLogs(jobId: string | null) {
  return useQuery({ queryKey: HUB_KEYS.logs(jobId ?? ""), queryFn: ({ signal }) => hubApi.jobLogs(jobId as string, signal), enabled: Boolean(jobId) });
}

/** after a write: the hub queries and the shell badges are stale */
function useRefreshHub() {
  const qc = useQueryClient();
  return useCallback(() => refreshAfterChannelChange(qc), [qc]);
}

const TERMINAL = ["succeeded", "partially_failed", "failed", "dead_lettered", "cancelled"];

/**
 * "Sync now": POST .../sync queues the jobs (202, nothing has run yet), then GET .../sync-status is polled until none
 * of the started jobs is active any more. `jobs` is the live view of the jobs that were started.
 */
export function useAccountSync(accountId: string) {
  const refresh = useRefreshHub();
  const [started, setStarted] = useState<SyncStart | null>(null);

  const start = useGuardedMutation({
    mutationFn: (scopes?: SyncScope[]) => hubApi.startSync(accountId, scopes),
    onSuccess: (data) => {
      setStarted(data);
      refresh();
    },
  });

  const ids = started?.jobs.map((j) => j.job.id) ?? [];
  const status = useQuery({
    queryKey: HUB_KEYS.syncStatus(accountId),
    queryFn: ({ signal }) => hubApi.syncStatus(accountId, signal),
    enabled: ids.length > 0,
    gcTime: 0,
    refetchInterval: (q) => {
      const s = q.state.data;
      if (!s) return 1500;
      return s.active.some((j) => ids.includes(j.id)) ? 1500 : false;
    },
  });

  const live = new Map([...(status.data?.latest ?? []), ...(status.data?.active ?? [])].map((j) => [j.id, j]));
  const jobs = (started?.jobs ?? []).map((j) => ({ ...j, job: live.get(j.job.id) ?? j.job }));
  const settled = ids.length > 0 && status.isSuccess && jobs.every((j) => TERMINAL.includes(j.job.status));

  const reset = () => {
    setStarted(null);
    start.reset();
  };
  return { start, started, jobs, settled, progress: status.data?.progress ?? null, statusError: status.isError, reset, refresh };
}

export function useTestConnection() {
  const refresh = useRefreshHub();
  return useGuardedMutation({ mutationFn: (id: string) => hubApi.test(id), onSettled: refresh });
}

export function useDisconnectAccount() {
  const refresh = useRefreshHub();
  return useGuardedMutation({ mutationFn: (id: string) => hubApi.disconnect(id), onSuccess: refresh });
}

export function useReconnectAccount() {
  const refresh = useRefreshHub();
  return useGuardedMutation({ mutationFn: (v: { id: string; credentials: Record<string, string> }) => hubApi.reconnect(v.id, v.credentials), onSuccess: refresh });
}

export function useUpdateAccount() {
  const refresh = useRefreshHub();
  return useGuardedMutation({
    mutationFn: (v: { id: string; displayName?: string; status?: "active" | "paused"; version: number }) => {
      const { id, ...body } = v;
      return hubApi.update(id, body);
    },
    onSettled: refresh,
  });
}

export function useDeleteAccount() {
  const refresh = useRefreshHub();
  return useGuardedMutation({ mutationFn: (id: string) => hubApi.remove(id), onSuccess: refresh });
}

export function useJobAction() {
  const refresh = useRefreshHub();
  return useGuardedMutation({
    mutationFn: (v: { id: string; action: "retry" | "cancel" }) => (v.action === "retry" ? hubApi.retryJob(v.id) : hubApi.cancelJob(v.id)),
    onSettled: refresh,
  });
}

/**
 * The first sync of the setup flow. POST /marketplace-hub/connect may already have queued jobs (`seed`: their ids); "Start initial sync" (or a
 * retry) queues new ones that take over. Either way the only truth is GET .../sync-status, polled until none of these jobs is active any more: `settled` is true only then.
 */
export function useSetupSync(accountId: string | null, seed: string[]) {
  const refresh = useRefreshHub();
  const [started, setStarted] = useState<SyncStart | null>(null);

  const start = useGuardedMutation({
    mutationFn: (scopes?: SyncScope[]) => hubApi.startSync(accountId as string, scopes),
    onSuccess: (data) => {
      setStarted(data);
      refresh();
    },
  });

  // a sync started here replaces the one the connect call queued (a retry after a failure must not be judged by the old jobs)
  const ids = started ? [...new Set(started.jobs.map((j) => j.job.id))] : seed;
  const status = useQuery({
    queryKey: HUB_KEYS.syncStatus(accountId ?? ""),
    queryFn: ({ signal }) => hubApi.syncStatus(accountId as string, signal),
    enabled: Boolean(accountId) && ids.length > 0,
    gcTime: 0,
    // the setup step must notice the end of the jobs even while the tab is in the background
    refetchIntervalInBackground: true,
    refetchInterval: (q) => {
      const s = q.state.data;
      if (!s) return 1500;
      return s.active.some((j) => ids.includes(j.id)) ? 1500 : false;
    },
  });

  const live = new Map([...(status.data?.latest ?? []), ...(status.data?.active ?? [])].map((j) => [j.id, j]));
  const jobs = ids.map((id) => live.get(id) ?? started?.jobs.find((j) => j.job.id === id)?.job).filter((j): j is HubSyncJob => Boolean(j));
  const running = ids.length > 0 && !(status.isSuccess && !status.data.active.some((j) => ids.includes(j.id)));
  const settled = ids.length > 0 && !running && jobs.length > 0 && jobs.every((j) => TERMINAL.includes(j.status));
  const reset = () => {
    setStarted(null);
    start.reset();
  };
  return {
    start,
    started,
    ids,
    jobs,
    running,
    settled,
    progress: status.data?.progress ?? null,
    lastSyncedAt: status.data?.lastSyncedAt ?? null,
    statusError: status.isError,
    refetchStatus: status.refetch,
    reset,
  };
}
