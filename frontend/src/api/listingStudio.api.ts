import { client, unwrap, API_BASE } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  ActivityPageResult,
  JobResult,
  ListingPatch,
  ListingStudio,
  MarketplaceCategory,
  PublishFlowResult,
  ReviewResolution,
  StudioListing,
  SyncJob,
  ValidateResult,
} from "@/types/listingStudio";

const listing = (id: string) => ENDPOINTS.LISTING(id);

/** The Listing Studio: one read model, the single save, and the listing flow steps. Money is minor units. */
export const listingStudioApi = {
  getStudio: async (id: string): Promise<ListingStudio> => unwrap(await client.get(`${listing(id)}/studio`)),
  getActivity: async (id: string, page: number): Promise<ActivityPageResult> => unwrap(await client.get(`${listing(id)}/activity`, { params: { page, pageSize: 20 } })),
  save: async (id: string, patch: ListingPatch): Promise<StudioListing> => unwrap(await client.patch(listing(id), patch)),
  validate: async (id: string): Promise<ValidateResult> => unwrap(await client.post(`${listing(id)}/validate`, {})),
  /** 202 (queued, with the job) or 200 (blocked / failed / not_applicable, with the steps) */
  publishFlow: async (id: string): Promise<PublishFlowResult> => unwrap(await client.post(`${listing(id)}/publish-flow`, {})),
  unpublish: async (id: string): Promise<JobResult> => unwrap(await client.post(`${listing(id)}/unpublish`, {})),
  refreshStatus: async (id: string): Promise<JobResult> => unwrap(await client.post(`${listing(id)}/refresh-status`, {})),
  contentSync: async (id: string): Promise<JobResult> => unwrap(await client.post(`${listing(id)}/content-sync`, {})),
  resolveReview: async (id: string, body: ReviewResolution): Promise<{ syncQueued: boolean }> => unwrap(await client.post(`${listing(id)}/content-review/resolve`, body)),
  getJob: async (jobId: string): Promise<SyncJob> => unwrap(await client.get(ENDPOINTS.SYNC_JOB(jobId))),
  searchCategories: async (accountId: string, query: string, signal?: AbortSignal): Promise<MarketplaceCategory[]> =>
    unwrap(await client.get(`${API_BASE}/marketplace-accounts/${accountId}/categories`, { params: query ? { query } : {}, signal })),
};
