import { client } from "./client";
import { Product, ProductFilterParams, ProductsKpiSummary, CreateProductInput } from "@/types/product";

export interface ProductsResponse {
  data: Product[];
  meta: {
    total: number;
    kpis: ProductsKpiSummary;
    categories: string[];
  };
}

export interface AiSuggestResponse {
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedBullets: string[];
  seoKeywords: string[];
}

export const productsApi = {
  getProducts: async (params?: ProductFilterParams): Promise<ProductsResponse> => {
    const query = new URLSearchParams();
    if (params?.search) query.append("search", params.search);
    if (params?.status) query.append("status", params.status);
    if (params?.category) query.append("category", params.category);
    if (params?.channel) query.append("channel", params.channel);
    if (params?.stockFilter) query.append("stockFilter", params.stockFilter);
    if (params?.readiness) query.append("readiness", params.readiness);
    if (params?.sortBy) query.append("sortBy", params.sortBy);
    if (params?.sortOrder) query.append("sortOrder", params.sortOrder);

    const queryString = query.toString();
    const url = `/products${queryString ? `?${queryString}` : ""}`;
    const response = await client.get<ProductsResponse>(url);
    return response.data;
  },

  getProduct: async (id: string): Promise<Product> => {
    const response = await client.get<{ data: Product }>(`/products/${id}`);
    return response.data.data;
  },

  createProduct: async (input: CreateProductInput): Promise<Product> => {
    const response = await client.post<{ data: Product }>("/products", input);
    return response.data.data;
  },

  updateProduct: async (id: string, input: Partial<Product>): Promise<Product> => {
    const response = await client.put<{ data: Product }>(`/products/${id}`, input);
    return response.data.data;
  },

  bulkAction: async (
    productIds: string[],
    action: "archive" | "activate" | "adjust_price" | "delete",
    payload?: { percentDelta?: number; price?: number }
  ): Promise<{ success: boolean; count: number }> => {
    const response = await client.post<{ success: boolean; count: number }>(
      "/products/bulk",
      { productIds, action, payload }
    );
    return response.data;
  },

  getAiSuggestions: async (title: string, description: string): Promise<AiSuggestResponse> => {
    const response = await client.post<AiSuggestResponse>("/products/ai-suggest", {
      title,
      description,
    });
    return response.data;
  },
};
