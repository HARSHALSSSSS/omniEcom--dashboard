import { client } from "./client";
import { ENDPOINTS } from "./endpoints";
import {
  ChannelListingItem,
  ListingStudioData,
  ListingMatrixRow,
  CatalogReachKPIs,
  ListingIssueSummary,
  ListingFilterParams,
  CreateListingInput,
  PublishingPreparationData,
  ListingReadinessAuditData,
  ListingBlockerDetail,
  ListingSyncTelemetryDetail,
  ListingUnlistedDetail,
} from "@/types/listing";

export interface ListingsListResponse {
  data: ChannelListingItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    showingFrom: number;
    showingTo: number;
    live: number;
    syncing: number;
    needsReview: number;
    failed: number;
    blocked: number;
    notListed: number;
    ready: number;
    draft: number;
  };
}

export const listingsApi = {
  getListings: async (
    params?: ListingFilterParams,
  ): Promise<ListingsListResponse> => {
    const query = new URLSearchParams();
    if (params?.channel) query.append("channel", params.channel);
    if (params?.status) query.append("status", params.status);
    if (params?.search) query.append("search", params.search);
    if (params?.marketplace) query.append("marketplace", params.marketplace);
    if (params?.category) query.append("category", params.category);
    if (params?.readiness) query.append("readiness", params.readiness);
    if (params?.inventory) query.append("inventory", params.inventory);
    if (params?.productStatus) query.append("productStatus", params.productStatus);
    if (params?.potential) query.append("potential", params.potential);
    if (params?.issue) query.append("issue", params.issue);
    if (params?.page) query.append("page", String(params.page));
    if (params?.pageSize) query.append("pageSize", String(params.pageSize));

    const queryString = query.toString();
    const url = `${ENDPOINTS.LISTINGS}${queryString ? `?${queryString}` : ""}`;
    const res = await client.get<ListingsListResponse>(url);
    return res.data;
  },

  getListingMatrix: async (): Promise<ListingMatrixRow[]> => {
    const res = await client.get<{ data: ListingMatrixRow[] }>(
      ENDPOINTS.LISTINGS_MATRIX,
    );
    return res.data.data;
  },

  getListingReachKPIs: async (): Promise<CatalogReachKPIs> => {
    const res = await client.get<{ data: CatalogReachKPIs }>(
      ENDPOINTS.LISTINGS_REACH,
    );
    return res.data.data;
  },

  getListingIssueSummary: async (): Promise<ListingIssueSummary> => {
    const res = await client.get<{ data: ListingIssueSummary }>(
      ENDPOINTS.LISTINGS_ISSUES,
    );
    return res.data.data;
  },

  getPublishingPreparation: async (): Promise<PublishingPreparationData> => {
    const res = await client.get<{ data: PublishingPreparationData }>(
      ENDPOINTS.LISTINGS_PUBLISHING_PREPARATION,
    );
    return res.data.data;
  },

  confirmPublishCohort: async (
    acknowledgement: boolean,
  ): Promise<{ success: boolean; publishedCount: number; message: string }> => {
    const res = await client.post<{
      data: { success: boolean; publishedCount: number; message: string };
    }>(ENDPOINTS.LISTINGS_CONFIRM_PUBLISH, { acknowledgement });
    return res.data.data;
  },

  getReadinessAudit: async (): Promise<ListingReadinessAuditData> => {
    const res = await client.get<{ data: ListingReadinessAuditData }>(
      ENDPOINTS.LISTINGS_READINESS_AUDIT,
    );
    return res.data.data;
  },

  applyReadinessSuggestion: async (
    suggestionId: string,
    action: "apply" | "dismiss" = "apply",
    value?: string,
  ): Promise<{ success: boolean; message: string }> => {
    const res = await client.post<{
      data: { success: boolean; message: string };
    }>(ENDPOINTS.LISTINGS_APPLY_SUGGESTION, { suggestionId, action, value });
    return res.data.data;
  },

  getListingBlocker: async (id: string): Promise<ListingBlockerDetail> => {
    const res = await client.get<{ data: ListingBlockerDetail }>(
      ENDPOINTS.LISTING_BLOCKER(id),
    );
    return res.data.data;
  },

  resolveListingBlocker: async (
    id: string,
    value: string,
    attributeKey: string = "Material",
  ): Promise<{ success: boolean; message: string; blocker: ListingBlockerDetail }> => {
    const res = await client.post<{
      data: { success: boolean; message: string; blocker: ListingBlockerDetail };
    }>(ENDPOINTS.LISTING_RESOLVE_BLOCKER(id), { value, attributeKey });
    return res.data.data;
  },

  getListingSyncTelemetry: async (id: string): Promise<ListingSyncTelemetryDetail> => {
    const res = await client.get<{ data: ListingSyncTelemetryDetail }>(
      ENDPOINTS.LISTING_SYNC_TELEMETRY(id),
    );
    return res.data.data;
  },

  getListingUnlisted: async (id: string): Promise<ListingUnlistedDetail> => {
    const res = await client.get<{ data: ListingUnlistedDetail }>(
      ENDPOINTS.LISTING_UNLISTED(id),
    );
    return res.data.data;
  },

  prepareListing: async (
    id: string,
    channel: string = "meesho",
  ): Promise<{ success: boolean; listingId: string; message: string }> => {
    const res = await client.post<{
      data: { success: boolean; listingId: string; message: string };
    }>(ENDPOINTS.LISTING_PREPARE(id), { channel });
    return res.data.data;
  },

  getListingStudio: async (id: string): Promise<ListingStudioData> => {
    const res = await client.get<{ data: ListingStudioData }>(
      `${ENDPOINTS.LISTINGS}/${id}`,
    );
    return res.data.data;
  },

  updateListing: async (
    id: string,
    payload: Partial<ChannelListingItem>,
  ): Promise<ChannelListingItem> => {
    const res = await client.put<{ data: ChannelListingItem }>(
      `${ENDPOINTS.LISTINGS}/${id}`,
      payload,
    );
    return res.data.data;
  },

  createListing: async (
    payload: CreateListingInput,
  ): Promise<ChannelListingItem> => {
    const res = await client.post<{ data: ChannelListingItem }>(
      ENDPOINTS.LISTINGS,
      payload,
    );
    return res.data.data;
  },

  publishListing: async (
    id: string,
  ): Promise<{ success: boolean; listing: ChannelListingItem; message: string }> => {
    const res = await client.post<{
      data: { success: boolean; listing: ChannelListingItem; message: string };
    }>(`${ENDPOINTS.LISTING_PUBLISH(id)}`);
    return res.data.data;
  },

  bulkPublish: async (
    listingIds: string[],
  ): Promise<{ success: boolean; publishedCount: number }> => {
    const res = await client.post<{
      data: { success: boolean; publishedCount: number };
    }>(ENDPOINTS.LISTINGS_BULK_PUBLISH, { listingIds });
    return res.data.data;
  },
};
