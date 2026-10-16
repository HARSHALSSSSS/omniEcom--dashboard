import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listingsApi,
  ListingsListResponse,
} from "@/api/listings.api";
import { ChannelListingItem, ListingStudioData } from "@/types/listing";
import { useToast } from "@/hooks/useToast";

export const LISTING_KEYS = {
  all: ["listings"] as const,
  list: (params?: { channel?: string; status?: string; search?: string }) =>
    ["listings", "list", params] as const,
  detail: (id: string) => ["listings", "detail", id] as const,
};

export function useListings(params?: {
  channel?: string;
  status?: string;
  search?: string;
}) {
  return useQuery<ListingsListResponse>({
    queryKey: LISTING_KEYS.list(params),
    queryFn: () => listingsApi.getListings(params),
  });
}

export function useListingStudio(id: string | null) {
  return useQuery<ListingStudioData>({
    queryKey: LISTING_KEYS.detail(id ?? ""),
    queryFn: () => (id ? listingsApi.getListingStudio(id) : Promise.reject(new Error("No id"))),
    enabled: Boolean(id),
  });
}

export function usePublishListing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => listingsApi.publishListing(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: LISTING_KEYS.all });
      toast({
        title: "Listing published!",
        description: res.message,
      });
    },
    onError: () => {
      toast({
        title: "Publish failed",
        description: "Marketplace rejected listing payload. Check studio blockers.",
        variant: "destructive",
      });
    },
  });
}

export function useBulkPublishListings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (listingIds: string[]) =>
      listingsApi.bulkPublish(listingIds),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: LISTING_KEYS.all });
      toast({
        title: "Bulk publish triggered",
        description: `Queued ${res.publishedCount} listings for channel publishing.`,
      });
    },
  });
}

export function useUpdateListing(id: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: Partial<ChannelListingItem>) =>
      listingsApi.updateListing(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LISTING_KEYS.detail(id) });
      queryClient.invalidateQueries({ queryKey: LISTING_KEYS.all });
      toast({
        title: "Listing updated",
        description: "Studio changes saved.",
      });
    },
  });
}
