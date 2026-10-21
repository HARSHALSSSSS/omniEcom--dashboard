import { useQuery } from "@tanstack/react-query";
import { intelligenceApi } from "@/api/intelligence.api";

export const INTELLIGENCE_KEYS = {
  all: ["intelligence"] as const,
  profitability: () => ["intelligence", "profitability"] as const,
  products: () => ["intelligence", "products"] as const,
  reports: () => ["intelligence", "reports"] as const,
};

export function useProfitability() {
  return useQuery({
    queryKey: INTELLIGENCE_KEYS.profitability(),
    queryFn: intelligenceApi.getProfitability,
  });
}

export function useProductIntelligence() {
  return useQuery({
    queryKey: INTELLIGENCE_KEYS.products(),
    queryFn: intelligenceApi.getProductIntelligence,
  });
}

export function useReports() {
  return useQuery({
    queryKey: INTELLIGENCE_KEYS.reports(),
    queryFn: intelligenceApi.getReports,
  });
}
