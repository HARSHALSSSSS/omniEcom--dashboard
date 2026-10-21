import { useQuery } from "@tanstack/react-query";
import { promotionsApi } from "@/api/promotions.api";

export const PROMOTIONS_KEYS = {
  all: ["promotions"] as const,
  overview: () => ["promotions", "overview"] as const,
  campaigns: () => ["promotions", "campaigns"] as const,
};

export function usePromotionsOverview() {
  return useQuery({
    queryKey: PROMOTIONS_KEYS.overview(),
    queryFn: promotionsApi.getOverview,
  });
}

export function usePromotionsCampaigns() {
  return useQuery({
    queryKey: PROMOTIONS_KEYS.campaigns(),
    queryFn: promotionsApi.getCampaigns,
  });
}
