export interface ProfitabilityWaterfallStep {
  label: string;
  amount: number;
  type: "positive" | "negative" | "subtotal";
  tooltip?: string;
}

export interface ChannelProfitability {
  channel: string;
  grossRevenue: number;
  cogs: number;
  marketplaceFees: number;
  shippingCosts: number;
  returnsImpact: number;
  advertisingSpend: number;
  netProfit: number;
  netMarginPercent: number;
}

export interface ProductIntelligenceItem {
  id: string;
  sku: string;
  productName: string;
  category: string;
  salesVelocity: number; // units/day
  velocityTrend: "accelerating" | "stable" | "declining";
  marginPercent: number;
  inventoryRunwayDays: number;
  competitorBuyBoxPrice?: number;
  recommendedAction: "reorder" | "raise_price" | "liquidate" | "promote" | "hold";
  confidenceScore: number; // 0-100
}

export interface ScheduledReport {
  id: string;
  name: string;
  format: "csv" | "xlsx" | "pdf";
  frequency: "daily" | "weekly" | "monthly";
  recipients: string[];
  lastGenerated: string;
  nextRun: string;
  status: "active" | "paused";
}
