import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productsApi } from "@/api/products";
import { ProductFilterParams, CreateProductInput, Product } from "@/types/product";

export const PRODUCT_QUERY_KEYS = {
  all: ["products"] as const,
  list: (params?: ProductFilterParams) => ["products", "list", params] as const,
  detail: (id: string) => ["products", "detail", id] as const,
};

export function useProducts(params?: ProductFilterParams) {
  return useQuery({
    queryKey: PRODUCT_QUERY_KEYS.list(params),
    queryFn: () => productsApi.getProducts(params),
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: PRODUCT_QUERY_KEYS.detail(id),
    queryFn: () => productsApi.getProduct(id),
    enabled: Boolean(id),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProductInput) => productsApi.createProduct(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCT_QUERY_KEYS.all });
    },
  });
}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<Product>) => productsApi.updateProduct(id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(PRODUCT_QUERY_KEYS.detail(id), data);
      queryClient.invalidateQueries({ queryKey: PRODUCT_QUERY_KEYS.all });
    },
  });
}

export function useBulkProducts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      productIds,
      action,
      payload,
    }: {
      productIds: string[];
      action: "archive" | "activate" | "adjust_price" | "delete";
      payload?: { percentDelta?: number; price?: number };
    }) => productsApi.bulkAction(productIds, action, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCT_QUERY_KEYS.all });
    },
  });
}

export function useProductAiSuggest() {
  return useMutation({
    mutationFn: ({ title, description }: { title: string; description: string }) =>
      productsApi.getAiSuggestions(title, description),
  });
}
