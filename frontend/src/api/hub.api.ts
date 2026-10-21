import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  ConnectionTest,
  ConnectorInfo,
  HubAccountDetail,
  HubAccounts,
  HubHealth,
  HubSyncJob,
  SyncLogLine,
  SyncScope,
  SyncStart,
  SyncStatus,
} from "@/types/hub";

export const hubApi = {
  accounts: async (signal?: AbortSignal) => unwrap<HubAccounts>(await client.get(ENDPOINTS.HUB_ACCOUNTS, { signal })),

  account: async (id: string, signal?: AbortSignal) => unwrap<HubAccountDetail>(await client.get(ENDPOINTS.HUB_ACCOUNT(id), { signal })),

  health: async (signal?: AbortSignal) => unwrap<HubHealth>(await client.get(ENDPOINTS.HUB_HEALTH, { signal })),

  connector: async (code: string, signal?: AbortSignal) => unwrap<ConnectorInfo>(await client.get(ENDPOINTS.MARKETPLACE(code), { signal })),

  /** 202: queues the jobs; `created:false` marks a job that was already queued */
  startSync: async (id: string, scopes?: SyncScope[]) =>
    unwrap<SyncStart>(await client.post(ENDPOINTS.HUB_ACCOUNT_SYNC(id), scopes?.length ? { scopes } : {})),

  syncStatus: async (id: string, signal?: AbortSignal) => unwrap<SyncStatus>(await client.get(ENDPOINTS.HUB_ACCOUNT_SYNC_STATUS(id), { signal })),

  test: async (id: string) => unwrap<ConnectionTest>(await client.post(ENDPOINTS.MARKETPLACE_ACCOUNT_TEST(id))),

  disconnect: async (id: string) => unwrap<{ id: string }>(await client.post(ENDPOINTS.MARKETPLACE_ACCOUNT_DISCONNECT(id))),

  reconnect: async (id: string, credentials: Record<string, string>) =>
    unwrap<{ id: string }>(await client.post(ENDPOINTS.MARKETPLACE_ACCOUNT_RECONNECT(id), { credentials })),

  /** rename and/or pause / resume; `version` guards against a concurrent edit (409 VERSION_CONFLICT) */
  update: async (id: string, body: { displayName?: string; status?: "active" | "paused"; version: number }) =>
    unwrap<{ id: string }>(await client.patch(ENDPOINTS.MARKETPLACE_ACCOUNT(id), body)),

  /** refused with 409 while the account is connected */
  remove: async (id: string) => unwrap<{ message: string }>(await client.delete(ENDPOINTS.MARKETPLACE_ACCOUNT(id))),

  jobLogs: async (jobId: string, signal?: AbortSignal) =>
    unwrap<{ items: SyncLogLine[]; nextAfter: number | null }>(await client.get(ENDPOINTS.SYNC_JOB_LOGS(jobId), { signal })),

  retryJob: async (jobId: string) => unwrap<HubSyncJob>(await client.post(ENDPOINTS.SYNC_JOB_RETRY(jobId))),

  cancelJob: async (jobId: string) => unwrap<HubSyncJob>(await client.post(ENDPOINTS.SYNC_JOB_CANCEL(jobId))),
};
