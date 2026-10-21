import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pricingApi } from "@/api/pricing.api";
import { useToast } from "@/hooks/useToast";

export const PRICING_KEYS = {
  all: ["pricing"] as const,
  overview: () => ["pricing", "overview"] as const,
  proposals: () => ["pricing", "proposals"] as const,
};

export function usePricingOverview() {
  return useQuery({
    queryKey: PRICING_KEYS.overview(),
    queryFn: pricingApi.getOverview,
  });
}

export function usePriceProposals() {
  return useQuery({
    queryKey: PRICING_KEYS.proposals(),
    queryFn: pricingApi.getProposals,
  });
}

export function useActionProposal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      pricingApi.actionProposal(id, action),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: PRICING_KEYS.all });
      toast({
        title: vars.action === "approve" ? "Proposal approved" : "Proposal rejected",
        description: `Price update for proposal ${vars.id} has been processed.`,
      });
    },
  });
}
