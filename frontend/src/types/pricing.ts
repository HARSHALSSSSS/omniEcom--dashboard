export type PriceStrategy = "automated_match" | "margin_floor" | "velocity_boost" | "custom";
export type ProposalStatus = "pending_review" | "approved" | "rejected" | "auto_applied";

export interface PriceProposal {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  channel: "Amazon" | "Flipkart" | "Shopify" | "Meesho";
  currentPrice: number;
  proposedPrice: number;
  currency: string;
  estimatedMarginDelta: number; // e.g. +3.4%
  projectedSalesDelta: number; // e.g. +14%
  reasoning: string;
  strategy: PriceStrategy;
  competitorPrice?: number;
  status: ProposalStatus;
  createdAt: string;
  expiresAt: string;
}

export interface PricingRule {
  id: string;
  name: string;
  channel: string;
  targetMarginMin: number;
  maxDiscountPercent: number;
  autoApproveUnderPercent: number;
  status: "active" | "paused";
}

export interface PricingMetrics {
  totalProposals: number;
  pendingReviewCount: number;
  potentialMarginGain: number; // in INR
  activeRulesCount: number;
}
