import { client } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { PriceProposal, PricingRule } from "@/types/pricing";

export interface PricingOverviewResponse {
  metrics: {
    activeAutomatedRules: number;
    pendingProposals: number;
    projectedMonthlyMarginGainPaise: number;
    buyBoxWinRatePct: number;
    rulesBreached24h: number;
  };
  rules: PricingRule[];
}

export const pricingApi = {
  getOverview: async (): Promise<PricingOverviewResponse> => {
    const res = await client.get<PricingOverviewResponse>(ENDPOINTS.PRICING_OVERVIEW);
    return res.data;
  },

  getProposals: async (): Promise<{ proposals: PriceProposal[] }> => {
    const res = await client.get<{ proposals: PriceProposal[] }>(ENDPOINTS.PRICING_PROPOSALS);
    return res.data;
  },

  actionProposal: async (id: string, action: "approve" | "reject") => {
    const res = await client.post(ENDPOINTS.PRICING_PROPOSAL_ACTION(id, action));
    return res.data;
  },
};
