import { client } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  ProfitabilityWaterfallStep,
  ChannelProfitability,
  ProductIntelligenceItem,
} from "@/types/intelligence";

export interface ProfitabilityResponse {
  waterfall: ProfitabilityWaterfallStep[];
  channels: ChannelProfitability[];
}

export const intelligenceApi = {
  getProfitability: async (): Promise<ProfitabilityResponse> => {
    const res = await client.get<ProfitabilityResponse>(ENDPOINTS.PROFITABILITY);
    return res.data;
  },

  getProductIntelligence: async (): Promise<{ items: ProductIntelligenceItem[] }> => {
    const res = await client.get<{ items: ProductIntelligenceItem[] }>(ENDPOINTS.PRODUCT_INTELLIGENCE);
    return res.data;
  },

  getReports: async () => {
    const res = await client.get(ENDPOINTS.REPORTS);
    return res.data;
  },
};
