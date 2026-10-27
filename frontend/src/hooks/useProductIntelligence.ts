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

/** one product by id, for a drawer opened by a link to a variant that is not on the page */
export function useIntelItem(variantId: string | undefined, enabled: boolean) {
  const businessId = useBusinessId();
  const query: ProductIntelligenceQuery = { action: undefined, categoryId: undefined, warehouseId: undefined, q: undefined, sort: "priority", page: 1, pageSize: 1, variantId };
  return useQuery({ queryKey: ["product-intelligence", "item", businessId, variantId], queryFn: ({ signal }) => productIntelligenceApi.list(query, signal), enabled: enabled && Boolean(variantId), staleTime: 30_000 });
}

/** one product by exact SKU (the AI Assistant rail) */
export function useIntelBySku(sku: string | undefined, enabled: boolean) {
  const businessId = useBusinessId();
  const query: ProductIntelligenceQuery = { action: undefined, categoryId: undefined, warehouseId: undefined, q: undefined, sort: "priority", page: 1, pageSize: 1, sku };
  return useQuery({ queryKey: ["product-intelligence", "sku", businessId, sku], queryFn: ({ signal }) => productIntelligenceApi.list(query, signal), enabled: enabled && Boolean(sku), staleTime: 30_000 });
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
