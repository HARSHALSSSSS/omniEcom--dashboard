import { useEffect, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { promotionsApi } from "@/api/promotions.api";
import { refreshAfterPromotionChange } from "@/lib/channelRefresh";
import { useWorkspaceStore } from "@/store/workspace.store";
import type {
  CampaignsQuery,
  CandidatesQuery,
  PreviewRequest,
  CampaignWrite,
  ProductSelection,
  ProductsQuery,
  PromotionLifecycleAction,
} from "@/types/promotions";

export const promotionKeys = {
  all: ["promotions"] as const,
  overview: (b: string | undefined) => ["promotions", "overview", b] as const,
  campaigns: (b: string | undefined, q: CampaignsQuery) => ["promotions", "campaigns", b, q] as const,
  campaign: (b: string | undefined, id: string) => ["promotions", "campaign", b, id] as const,
  campaignProducts: (b: string | undefined, id: string, q: object) => ["promotions", "campaign-products", b, id, q] as const,
  accounts: (b: string | undefined) => ["promotions", "accounts", b] as const,
  preview: (b: string | undefined, body: PreviewRequest) => ["promotions", "preview", b, body] as const,
  candidates: (b: string | undefined, q: CandidatesQuery) => ["promotions", "candidates", b, q] as const,
  categories: (b: string | undefined) => ["promotions", "categories", b] as const,
  variants: (b: string | undefined, q: string) => ["promotions", "variants", b, q] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

export function usePromotionOverview() {
  const b = useBusinessId();
  return useQuery({ queryKey: promotionKeys.overview(b), queryFn: ({ signal }) => promotionsApi.overview(signal), staleTime: 15_000 });
}

export function usePromotionCampaigns(query: CampaignsQuery, enabled = true) {
  const b = useBusinessId();
  return useQuery({
    queryKey: promotionKeys.campaigns(b, query),
    queryFn: ({ signal }) => promotionsApi.campaigns(query, signal),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePromotionCampaign(id: string | null) {
  const b = useBusinessId();
  return useQuery({
    queryKey: promotionKeys.campaign(b, id ?? ""),
    queryFn: ({ signal }) => promotionsApi.campaign(id as string, signal),
    enabled: Boolean(id),
    staleTime: 5_000,
  });
}

export function useCampaignProducts(id: string | null, query: Pick<ProductsQuery, "status" | "q" | "page" | "pageSize">) {
  const b = useBusinessId();
  return useQuery({
    queryKey: promotionKeys.campaignProducts(b, id ?? "", query),
    queryFn: ({ signal }) => promotionsApi.campaignProducts(id as string, query, signal),
    enabled: Boolean(id),
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });
}

export function usePromotionAccounts() {
  const b = useBusinessId();
  return useQuery({ queryKey: promotionKeys.accounts(b), queryFn: promotionsApi.accounts, staleTime: 5 * 60_000 });
}

/** the dialog's live preview: asked a moment after the seller stops typing, a stale request is cancelled, nothing is saved */
export function usePromotionPreview(body: PreviewRequest | null) {
  const b = useBusinessId();
  const key = body ? JSON.stringify(body) : null;
  const [settled, setSettled] = useState<string | null>(key);
  useEffect(() => {
    if (key === null) return setSettled(null);
    const t = setTimeout(() => setSettled(key), 400);
    return () => clearTimeout(t);
  }, [key]);
  const request = settled ? (JSON.parse(settled) as PreviewRequest) : null;
  const query = useQuery({
    queryKey: request ? promotionKeys.preview(b, request) : ["promotions", "preview", b, null],
    queryFn: ({ signal }) => promotionsApi.preview(request as PreviewRequest, signal),
    enabled: request !== null,
    staleTime: 0,
    gcTime: 0,
    placeholderData: keepPreviousData,
  });
  return { ...query, waiting: key !== settled };
}

/** products that can be promoted, one row per product and channel (the opportunities of the Overview, the Products tab) */
export function usePromotionCandidates(query: CandidatesQuery, enabled = true) {
  const b = useBusinessId();
  return useQuery({
    queryKey: promotionKeys.candidates(b, query),
    queryFn: ({ signal }) => promotionsApi.candidates(query, signal),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePromotionCategories(enabled: boolean) {
  const b = useBusinessId();
  return useQuery({ queryKey: promotionKeys.categories(b), queryFn: promotionsApi.categories, staleTime: 5 * 60_000, enabled });
}

/** the variant picker: search text goes to the API, "load more" follows its cursor */
export function usePickerVariants(q: string, enabled: boolean) {
  const b = useBusinessId();
  return useInfiniteQuery({
    queryKey: promotionKeys.variants(b, q),
    queryFn: ({ pageParam, signal }) => promotionsApi.variants(q, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    staleTime: 30_000,
    enabled,
  });
}

/** every write moves campaign numbers and the sale prices shown on Pricing, Listings, the Hub, Inventory, Needs attention, the dashboard and the badges */
function useAfterWrite() {
  const queryClient = useQueryClient();
  return () => refreshAfterPromotionChange(queryClient);
}

export function useCreateCampaign() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({ mutationFn: (body: CampaignWrite & { selection?: ProductSelection }) => promotionsApi.create(body), onSuccess: afterWrite });
}

export function useUpdateCampaign() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({
    mutationFn: (input: { id: string; body: Partial<CampaignWrite> & { version: number } }) => promotionsApi.update(input.id, input.body),
    onSuccess: afterWrite,
  });
}

export function useDeleteCampaign() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({ mutationFn: (input: { id: string; version?: number }) => promotionsApi.remove(input.id, input.version), onSuccess: afterWrite });
}

export function useCampaignLifecycle() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({
    mutationFn: (input: { id: string; action: PromotionLifecycleAction; version?: number }) => promotionsApi.lifecycle(input.id, input.action, input.version),
    // a refused action (stale version, wrong state) still means the screen is out of date
    onSettled: afterWrite,
  });
}

export function useDuplicateCampaign() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({ mutationFn: (id: string) => promotionsApi.duplicate(id), onSuccess: afterWrite });
}

export function useEvaluateCampaign() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({ mutationFn: (id: string) => promotionsApi.evaluate(id), onSuccess: afterWrite });
}

export function useSetCampaignProducts() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({
    mutationFn: (input: { id: string; selection: ProductSelection; mode: "replace" | "add" }) => promotionsApi.setProducts(input.id, input.selection, input.mode),
    onSuccess: afterWrite,
  });
}

export function useRemoveCampaignProducts() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({ mutationFn: (input: { id: string; variantIds: string[] }) => promotionsApi.removeProducts(input.id, input.variantIds), onSuccess: afterWrite });
}

export function useProcessPromotions() {
  const afterWrite = useAfterWrite();
  return useGuardedMutation({ mutationFn: promotionsApi.process, onSuccess: afterWrite });
}
