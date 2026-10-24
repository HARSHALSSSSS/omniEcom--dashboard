import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { variantsApi } from "@/api/variants.api";
import type {
  QuickAdjustPayload,
  VariantBulkAction,
  VariantGridParams,
  VariantWritePayload,
} from "@/types/variants";

export const VARIANT_KEYS = {
  all: ["variants"] as const,
  product: (productId: string) => ["variants", productId] as const,
  header: (productId: string) => ["variants", productId, "header"] as const,
  grid: (productId: string, params: VariantGridParams) => ["variants", productId, "grid", params] as const,
  counts: (productId: string) => ["variants", productId, "counts"] as const,
  detail: (variantId: string) => ["variants", "detail", variantId] as const,
  warehouses: ["variants", "warehouses"] as const,
};

/** product title / image / counters / option names (GET /products/{id}/overview) */
export function useVariantsHeader(productId: string) {
  return useQuery({
    queryKey: VARIANT_KEYS.header(productId),
    queryFn: ({ signal }) => variantsApi.header(productId, signal),
    enabled: Boolean(productId),
    staleTime: 30_000,
  });
}

/** the numbered grid page; a filter / page change keeps the previous rows on screen while it loads */
export function useVariantGrid(productId: string, params: VariantGridParams) {
  return useQuery({
    queryKey: VARIANT_KEYS.grid(productId, params),
    queryFn: ({ signal }) => variantsApi.grid(productId, params, signal),
    enabled: Boolean(productId),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useVariantCounts(productId: string) {
  return useQuery({
    queryKey: VARIANT_KEYS.counts(productId),
    queryFn: ({ signal }) => variantsApi.counts(productId, signal),
    enabled: Boolean(productId),
    staleTime: 15_000,
  });
}

/** the full variant (cost, tax, weight, dimensions, version) for the edit drawer; always fresh */
export function useVariantDetail(variantId: string | null) {
  return useQuery({
    queryKey: VARIANT_KEYS.detail(variantId ?? ""),
    queryFn: ({ signal }) => variantsApi.get(variantId ?? "", signal),
    enabled: Boolean(variantId),
    staleTime: 0,
    gcTime: 0,
  });
}

export function useWarehouses(enabled: boolean) {
  return useQuery({
    queryKey: VARIANT_KEYS.warehouses,
    queryFn: ({ signal }) => variantsApi.warehouses(signal),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** whatever a variant write changes: this screen, the product screens, the inventory ledger and the home aggregate */
function useRefresh(productId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: VARIANT_KEYS.product(productId) });
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["inventory"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useCreateVariant(productId: string) {
  const refresh = useRefresh(productId);
  return useGuardedMutation({
    mutationFn: (body: VariantWritePayload) => variantsApi.create(productId, body),
    onSuccess: refresh,
  });
}

export interface UpdateVariantInput {
  variantId: string;
  version: number;
  /** only the changed fields; empty = nothing to PATCH */
  patch: VariantWritePayload;
  /** undefined = untouched, null = back to the business default */
  leadTimeDays?: number | null;
}

/** PATCH the changed fields with the version lock, then PUT the lead time when it changed */
export function useUpdateVariant(productId: string) {
  const refresh = useRefresh(productId);
  return useGuardedMutation({
    mutationFn: async ({ variantId, version, patch, leadTimeDays }: UpdateVariantInput) => {
      if (Object.keys(patch).length) await variantsApi.update(variantId, { ...patch, version });
      if (leadTimeDays !== undefined) await variantsApi.setLeadTime(variantId, leadTimeDays);
    },
    // a conflict still means the grid is stale
    onSettled: refresh,
  });
}

export function useDeleteVariant(productId: string) {
  const refresh = useRefresh(productId);
  return useGuardedMutation({
    mutationFn: (variantId: string) => variantsApi.remove(variantId),
    onSuccess: refresh,
  });
}

export function useBulkVariants(productId: string) {
  const refresh = useRefresh(productId);
  return useGuardedMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: VariantBulkAction }) => variantsApi.bulk(productId, ids, action),
    onSettled: refresh,
  });
}

export function useQuickAdjust(productId: string) {
  const refresh = useRefresh(productId);
  return useGuardedMutation({
    mutationFn: (body: QuickAdjustPayload) => variantsApi.quickAdjust(body),
    onSuccess: refresh,
  });
}
