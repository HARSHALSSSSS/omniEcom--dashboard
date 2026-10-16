import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ordersApi, OrdersListResponse } from "@/api/orders.api";
import { Order, OrdersSummaryKPIs, OrderStatus } from "@/types/orders";
import { useToast } from "@/hooks/useToast";

export const ORDER_KEYS = {
  all: ["orders"] as const,
  summary: () => ["orders", "summary"] as const,
  list: (params?: { status?: string; channel?: string; search?: string }) =>
    ["orders", "list", params] as const,
  detail: (id: string) => ["orders", "detail", id] as const,
  fulfillment: () => ["orders", "fulfillment"] as const,
  returns: () => ["orders", "returns"] as const,
};

export function useOrdersSummary() {
  return useQuery<OrdersSummaryKPIs>({
    queryKey: ORDER_KEYS.summary(),
    queryFn: ordersApi.getSummary,
  });
}

export function useOrders(params?: {
  status?: string;
  channel?: string;
  search?: string;
}) {
  return useQuery<OrdersListResponse>({
    queryKey: ORDER_KEYS.list(params),
    queryFn: () => ordersApi.getOrders(params),
  });
}

export function useOrder(id: string | null) {
  return useQuery<Order>({
    queryKey: ORDER_KEYS.detail(id ?? ""),
    queryFn: () => (id ? ordersApi.getOrder(id) : Promise.reject(new Error("No id"))),
    enabled: Boolean(id),
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: OrderStatus }) =>
      ordersApi.updateOrderStatus(id, nextStatus),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ORDER_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast({
        title: "Order status updated",
        description: `${updated.orderNumber} is now ${updated.status}.`,
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Could not update order status.",
        variant: "destructive",
      });
    },
  });
}

export function useFulfillmentQueue() {
  return useQuery({
    queryKey: ORDER_KEYS.fulfillment(),
    queryFn: ordersApi.getFulfillmentQueue,
  });
}

export function useReturns() {
  return useQuery({
    queryKey: ORDER_KEYS.returns(),
    queryFn: ordersApi.getReturns,
  });
}
