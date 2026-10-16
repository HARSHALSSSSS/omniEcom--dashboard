import { client } from "./client";
import { ENDPOINTS } from "./endpoints";
import {
  ChannelListingItem,
  ListingStudioData,
} from "@/types/listing";

export interface ListingsListResponse {
  data: ChannelListingItem[];
  meta: {
    total: number;
    live: number;
    syncing: number;
    needsReview: number;
    failed: number;
    blocked: number;
    notListed: number;
  };
}

export const listingsApi = {
  getListings: async (params?: {
    channel?: string;
    status?: string;
    search?: string;
  }): Promise<ListingsListResponse> => {
    const query = new URLSearchParams();
    if (params?.channel) query.append("channel", params.channel);
    if (params?.status) query.append("status", params.status);
    if (params?.search) query.append("search", params.search);

    const queryString = query.toString();
    const url = `${ENDPOINTS.LISTINGS}${queryString ? `?${queryString}` : ""}`;
    const res = await client.get<ListingsListResponse>(url);
    return res.data;
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
