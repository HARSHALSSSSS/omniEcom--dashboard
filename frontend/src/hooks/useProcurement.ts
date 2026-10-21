import { useQuery } from "@tanstack/react-query";
import { procurementApi } from "@/api/procurement.api";

export const PROCUREMENT_KEYS = {
  all: ["procurement"] as const,
  overview: () => ["procurement", "overview"] as const,
  suppliers: () => ["procurement", "suppliers"] as const,
  orders: () => ["procurement", "orders"] as const,
};

export function useProcurementOverview() {
  return useQuery({
    queryKey: PROCUREMENT_KEYS.overview(),
    queryFn: procurementApi.getOverview,
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: PROCUREMENT_KEYS.suppliers(),
    queryFn: procurementApi.getSuppliers,
  });
}

export function usePurchaseOrders() {
  return useQuery({
    queryKey: PROCUREMENT_KEYS.orders(),
    queryFn: procurementApi.getPurchaseOrders,
  });
}
