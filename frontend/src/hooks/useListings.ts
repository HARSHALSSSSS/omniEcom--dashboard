import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listingsApi,
  ListingsListResponse,
} from "@/api/listings.api";
import {
  ChannelListingItem,
  ListingStudioData,
  ListingMatrixRow,
  CatalogReachKPIs,
  ListingIssueSummary,
  ListingFilterParams,
  CreateListingInput,
} from "@/types/listing";
import { useToast } from "@/hooks/useToast";

export const LISTING_KEYS = {
  all: ["listings"] as const,
  list: (params?: ListingFilterParams) =>
    ["listings", "list", params] as const,
  matrix: ["listings", "matrix"] as const,
  reach: ["listings", "reach"] as const,
  issues: ["listings", "issues"] as const,
  publishingPreparation: ["listings", "publishing-preparation"] as const,
  readinessAudit: ["listings", "readiness-audit"] as const,
  blocker: (id: string) => ["listings", "blocker", id] as const,
  syncTelemetry: (id: string) => ["listings", "sync-telemetry", id] as const,
  unlisted: (id: string) => ["listings", "unlisted", id] as const,
  detail: (id: string) => ["listings", "detail", id] as const,
};

export function useListingUnlisted(id: string) {
  return useQuery({
    queryKey: LISTING_KEYS.unlisted(id),
    queryFn: () => listingsApi.getListingUnlisted(id),
    enabled: Boolean(id),
  });
}

export function usePrepareListing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, channel }: { id: string; channel?: string }) =>
      listingsApi.prepareListing(id, channel),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: LISTING_KEYS.all });
      toast({
        title: "Listing prepared!",
        description: res.message,
      });
    },
    onError: () => {
      toast({
        title: "Failed to prepare listing",
        description: "Please check channel connector status.",
        variant: "destructive",
      });
    },
  });
}

export function useListingSyncTelemetry(id: string) {
  return useQuery({
    queryKey: LISTING_KEYS.syncTelemetry(id),
    queryFn: () => listingsApi.getListingSyncTelemetry(id),
    enabled: Boolean(id),
    refetchInterval: 4000,
  });
}

export function usePublishingPreparation() {
  return useQuery({
    queryKey: LISTING_KEYS.publishingPreparation,
    queryFn: () => listingsApi.getPublishingPreparation(),
  });
}

export function useListingReadinessAudit() {
  return useQuery({
    queryKey: LISTING_KEYS.readinessAudit,
    queryFn: () => listingsApi.getReadinessAudit(),
  });
}

export function useApplyReadinessSuggestion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      suggestionId,
      action = "apply",
      value,
    }: {
      suggestionId: string;
      action?: "apply" | "dismiss";
      value?: string;
    }) => listingsApi.applyReadinessSuggestion(suggestionId, action, value),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: LISTING_KEYS.all });
      queryClient.invalidateQueries({ queryKey: LISTING_KEYS.readinessAudit });
      toast({
        title: "Suggestion applied!",
        description: res.message,
      });
    },
    onError: () => {
      toast({
        title: "Failed to apply suggestion",
        description: "Please review the taxonomy fields manually in studio.",
        variant: "destructive",
      });
    },
  });
}

export function useListingBlocker(id: string) {
  return useQuery({
    queryKey: LISTING_KEYS.blocker(id),
    queryFn: () => listingsApi.getListingBlocker(id),
    enabled: Boolean(id),
  });
}

export function useResolveListingBlocker(id: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ value, attributeKey }: { value: string; attributeKey?: string }) =>
      listingsApi.resolveListingBlocker(id, value, attributeKey),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: LISTING_KEYS.all });
      queryClient.invalidateQueries({ queryKey: LISTING_KEYS.blocker(id) });
      queryClient.invalidateQueries({ queryKey: LISTING_KEYS.detail(id) });
      toast({
        title: "Listing unblocked",
        description: res.message,
      });
    },
    onError: () => {
      toast({
        title: "Failed to resolve blocker",
        description: "Please check attribute requirements.",
        variant: "destructive",
      });
    },
  });
}

export function useConfirmPublishCohort() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (acknowledgement: boolean) =>
      listingsApi.confirmPublishCohort(acknowledgement),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: LISTING_KEYS.all });
      toast({
        title: "Catalog publishing initiated!",
        description: res.message,
      });
    },
    onError: () => {
      toast({
        title: "Publishing failed",
        description: "Could not trigger cohort publish.",
        variant: "destructive",
      });
    },
  });
}

export function useListings(params?: ListingFilterParams) {
  return useQuery<ListingsListResponse>({
    queryKey: LISTING_KEYS.list(params),
    queryFn: () => listingsApi.getListings(params),
  });
}

export function useListingMatrix() {
  return useQuery<ListingMatrixRow[]>({
    queryKey: LISTING_KEYS.matrix,
    queryFn: () => listingsApi.getListingMatrix(),
  });
}

export function useListingReachKPIs() {
  return useQuery<CatalogReachKPIs>({
    queryKey: LISTING_KEYS.reach,
    queryFn: () => listingsApi.getListingReachKPIs(),
  });
}

export function useListingIssueSummary() {
  return useQuery<ListingIssueSummary>({
    queryKey: LISTING_KEYS.issues,
    queryFn: () => listingsApi.getListingIssueSummary(),
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
    onError: () => {
      toast({
        title: "Bulk publish failed",
        description: "Could not trigger bulk publish.",
        variant: "destructive",
      });
    },
  });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: CreateListingInput) =>
      listingsApi.createListing(payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: LISTING_KEYS.all });
      toast({
        title: "Listing created",
        description: `Created new listing for ${created.productTitle}`,
      });
    },
    onError: () => {
      toast({
        title: "Creation failed",
        description: "Could not create listing.",
        variant: "destructive",
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
