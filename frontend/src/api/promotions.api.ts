import { client } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { PromotionCampaign, PromotionProductLink } from "@/types/promotions";

export interface PromotionsOverviewResponse {
  campaigns: PromotionCampaign[];
  products: PromotionProductLink[];
}

export const promotionsApi = {
  getOverview: async (): Promise<PromotionsOverviewResponse> => {
    const res = await client.get<PromotionsOverviewResponse>(ENDPOINTS.PROMOTIONS_OVERVIEW);
    return res.data;
  },

  getCampaigns: async (): Promise<{ campaigns: PromotionCampaign[] }> => {
    const res = await client.get<{ campaigns: PromotionCampaign[] }>(ENDPOINTS.PROMOTIONS_CAMPAIGNS);
    return res.data;
  },
};
