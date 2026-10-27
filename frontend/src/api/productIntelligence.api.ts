import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import { procurementApi } from "./procurement.api";
import { promotionsApi } from "./promotions.api";
import type { GenerateResponse } from "@/types/pricing";
import type { FromSuggestionsResult, WarehouseOption } from "@/types/procurement";
import type { CategoryOption } from "@/types/promotions";
import type { ProductIntelligencePage, ProductIntelligenceQuery } from "@/types/intelligence";

/** the list filters in the API's `filter[...]` style; empty values are left out */
export function intelligenceParams(query: ProductIntelligenceQuery): Record<string, string | number> {
  const params: Record<string, string | number> = { sort: query.sort, pageSize: query.pageSize };
  if (query.action) params["filter[action]"] = query.action;
  if (query.categoryId) params["filter[categoryId]"] = query.categoryId;
  if (query.warehouseId) params["filter[warehouseId]"] = query.warehouseId;
  if (query.q) params.q = query.q;
  if (query.variantId) params["filter[variantId]"] = query.variantId;
  if (query.sku) params["filter[sku]"] = query.sku;
  if (query.portfolio) {
    params.portfolio = "true";
    params.from = query.portfolio.from;
    params.to = query.portfolio.to;
  }
  if (query.page > 1) params.page = query.page;
  return params;
}

export const productIntelligenceApi = {
  list: async (query: ProductIntelligenceQuery, signal?: AbortSignal) =>
    unwrap<ProductIntelligencePage>(await client.get(ENDPOINTS.PRODUCT_INTELLIGENCE, { params: intelligenceParams(query), signal })),

  /** category picker options (indented path names) */
  categories: async (): Promise<CategoryOption[]> => promotionsApi.categories(),

  /** active warehouses for the stock filter */
  warehouses: async (signal?: AbortSignal): Promise<WarehouseOption[]> => procurementApi.warehouses(signal),

  /** "reorder": draft purchase orders for these variants (one per preferred supplier) */
  draftPurchaseOrders: async (variantIds: string[], warehouseId?: string) =>
    unwrap<FromSuggestionsResult>(await client.post(ENDPOINTS.PURCHASE_ORDERS_FROM_SUGGESTIONS, { variantIds, ...(warehouseId ? { warehouseId } : {}) })),

  /** "raise_price" / "liquidate": let the pricing policies propose a price for these variants (nothing goes live without approval) */
  generatePriceProposals: async (variantIds: string[]) =>
    unwrap<GenerateResponse>(await client.post(ENDPOINTS.PRICING_PROPOSALS_GENERATE, { variantIds, dryRun: false })),
};
