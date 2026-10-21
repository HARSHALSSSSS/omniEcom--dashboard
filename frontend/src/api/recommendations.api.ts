import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { Recommendations, SyncJob } from "@/types/recommendations";

/** the API gives its own paths (`/api/v1/...`); the shared client already carries that base */
const apiPath = (href: string) => href.replace(/^\/api\/v1(?=\/)/, "");

export const recommendationsApi = {
  get: async () => unwrap<Recommendations>(await client.get(ENDPOINTS.WORKSPACE_RECOMMENDATIONS)),

  /** the channel card's own `retry_sync` action; answers 202 with the queued job */
  retrySync: async (href: string) => unwrap<{ job: SyncJob; alreadyQueued: boolean }>(await client.post(apiPath(href), {})),

  syncJob: async (id: string) => unwrap<SyncJob>(await client.get(ENDPOINTS.SYNC_JOB(id))),
};
