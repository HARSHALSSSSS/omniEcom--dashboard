import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { productIntelligenceApi } from "@/api/productIntelligence.api";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { ProductIntelligenceQuery } from "@/types/intelligence";
import { pricingKeys } from "./usePricing";
import { procurementKeys } from "./useProcurement";

export const intelligenceKeys = {
  all: ["product-intelligence"] as const,
  list: (b: string | undefined, q: ProductIntelligenceQuery) => ["product-intelligence", "list", b, q] as const,
  categories: (b: string | undefined) => ["product-intelligence", "categories", b] as const,
  warehouses: (b: string | undefined) => ["product-intelligence", "warehouses", b] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

/** one numbered page of recommendations; the previous page stays on screen while the next one loads */
export function useProductIntelligence(query: ProductIntelligenceQuery, enabled = true) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: intelligenceKeys.list(businessId, query),
    queryFn: ({ signal }) => productIntelligenceApi.list(query, signal),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useIntelCategories(enabled = true) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: intelligenceKeys.categories(businessId), queryFn: productIntelligenceApi.categories, staleTime: 5 * 60_000, retry: false, enabled });
}

export function useIntelWarehouses(enabled = true) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: intelligenceKeys.warehouses(businessId), queryFn: ({ signal }) => productIntelligenceApi.warehouses(signal), staleTime: 5 * 60_000, retry: false, enabled });
}

/** reorder: draft purchase orders for one variant; the procurement screens and these recommendations change with it */
export function useDraftPurchaseOrders() {
  const queryClient = useQueryClient();
  return useGuardedMutation({
    mutationFn: (input: { variantIds: string[]; warehouseId?: string }) => productIntelligenceApi.draftPurchaseOrders(input.variantIds, input.warehouseId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: procurementKeys.all });
      void queryClient.invalidateQueries({ queryKey: intelligenceKeys.all });
    },
  });
}

/** raise_price / liquidate: ask the pricing policies for a proposal */
export function useGeneratePriceProposals() {
  const queryClient = useQueryClient();
  return useGuardedMutation({
    mutationFn: (variantIds: string[]) => productIntelligenceApi.generatePriceProposals(variantIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pricingKeys.all });
      void queryClient.invalidateQueries({ queryKey: intelligenceKeys.all });
    },
  });
}
