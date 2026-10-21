import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { shippingApi } from "@/api/shipping.api";
import { useToast } from "@/hooks/useToast";
import { ShippingOverviewResponse, ShippingRuleItem } from "@/types/shipping";

export const SHIPPING_KEYS = {
  all: ["shipping"] as const,
  overview: () => ["shipping", "overview"] as const,
  methods: () => ["shipping", "methods"] as const,
  rules: () => ["shipping", "rules"] as const,
  tracking: () => ["shipping", "tracking"] as const,
};

export function useShippingOverview() {
  return useQuery<ShippingOverviewResponse>({
    queryKey: SHIPPING_KEYS.overview(),
    queryFn: shippingApi.getOverview,
  });
}

export function useSyncShipping() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: shippingApi.syncShipping,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: SHIPPING_KEYS.all });
      toast({
        title: "Shipping sync complete",
        description: `${data.processed} processed · ${data.updated} updated · ${data.exceptions} require attention.`,
      });
    },
    onError: () => {
      toast({
        title: "Sync failed",
        description: "Could not synchronize shipping statuses.",
        variant: "destructive",
      });
    },
  });
}

export function useAssignShippingMethod() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ orderId, methodId }: { orderId: string; methodId: string }) =>
      shippingApi.assignShippingMethod(orderId, methodId),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: SHIPPING_KEYS.all });
      toast({
        title: "Shipping method assigned",
        description: `${order.orderNumber} updated to ${order.selectedShipping}.`,
      });
    },
  });
}

export function useCreateShippingRule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (rule: Omit<ShippingRuleItem, "id">) => shippingApi.createRule(rule),
    onSuccess: (newRule) => {
      queryClient.invalidateQueries({ queryKey: SHIPPING_KEYS.all });
      toast({
        title: "Shipping rule created",
        description: `Rule "${newRule.name}" is now active.`,
      });
    },
  });
}
