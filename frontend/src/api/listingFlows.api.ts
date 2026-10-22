import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { BulkContentRequest, BulkContentResult, ListingChannelsView, ListingFixSuggestions, ListingFlowDetails, ListingSelection, UnlistedContext } from "@/types/listingFlows";

/** Read models of the listing flow screens. Writes go through listingStudioApi (PATCH, validate, publish-flow) and listingsApi (bulk). */
export const listingFlowsApi = {
  channels: async (listingId: string): Promise<ListingChannelsView> => unwrap(await client.get(`${ENDPOINTS.LISTING(listingId)}/channels`)),

  unlistedContext: async (variantId: string, accountId: string): Promise<UnlistedContext> =>
    unwrap(await client.get(`${ENDPOINTS.LISTINGS}/unlisted-context`, { params: { variantId, accountId } })),

  selection: async (ids: string[]): Promise<ListingSelection> => unwrap(await client.get(`${ENDPOINTS.LISTINGS}/selection`, { params: { ids: ids.join(",") } })),

  /** full category paths and the fixed completeness rows (Title, Images, SKU, Category, Weight) */
  details: async (listingId: string): Promise<ListingFlowDetails> => unwrap(await client.get(`${ENDPOINTS.LISTING(listingId)}/flow-details`)),

  /** "Fix with AI": proposed values for the failing attributes; nothing is saved */
  fixSuggestions: async (listingId: string): Promise<ListingFixSuggestions> => unwrap(await client.get(`${ENDPOINTS.LISTING(listingId)}/fix-suggestions`)),

  /** edits the channel content of many listings; dryRun only answers what would change */
  bulkContent: async (body: BulkContentRequest): Promise<BulkContentResult> => unwrap(await client.post(`${ENDPOINTS.LISTINGS}/bulk-content`, body)),

  /** starts the listing (a draft) of a variant on an account; the Studio takes it from there */
  prepare: async (variantId: string, accountId: string): Promise<{ id: string }> =>
    unwrap(await client.post(ENDPOINTS.LISTINGS, { marketplaceAccountId: accountId, variantId })),
};
