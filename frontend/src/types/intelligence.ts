// ---------------------------------------------------------------- product intelligence (GET /product-intelligence)
export const INTEL_ACTIONS = ["reorder", "raise_price", "liquidate", "promote", "hold"] as const;
export type IntelAction = (typeof INTEL_ACTIONS)[number];
export const INTEL_SORTS = ["priority", "velocity", "runway", "margin"] as const;
export type IntelSort = (typeof INTEL_SORTS)[number];
export type VelocityTrend = "accelerating" | "stable" | "declining";

export interface IntelReason {
  key: string;
  text: string;
  values: Record<string, number | string | null>;
}

export interface IntelConfidence {
  score: number;
  level: "low" | "medium" | "high";
  factors: Array<{ key: string; weight: number; met: boolean; text: string }>;
}

export type IntelItem = ProductIntelligenceItem;

export interface ProductIntelligenceItem {
  id: string;
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  categoryId: string | null;
  category: string | null;
  /** units per day over the last 30 days */
  salesVelocity: number;
  unitsSold30d: number;
  velocityTrend: VelocityTrend | null;
  trendChangePercent: number | null;
  marginPercent: number | null;
  sellingPriceMinor: number | null;
  costPriceMinor: number | null;
  inventory: {
    available: number;
    onHand: number;
    runwayDays: number | null;
    ageDays: number | null;
    leadTimeDays: number;
    suggestedReorderUnits: number | null;
  };
  competitor: { priceMinor: number; observedAt: string; sellerName: string | null; gapPercent: number | null } | null;
  recommendedAction: IntelAction;
  confidence: IntelConfidence;
  reasons: IntelReason[];
}

export interface ProductIntelligencePage {
  items: ProductIntelligenceItem[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  /** counts per action, inside the other filters */
  summary: Record<IntelAction, number>;
  variantsAnalysed: number;
  /** only when asked for (`portfolio` in the query) */
  portfolio: IntelPortfolio | null;
}

export interface IntelSalesShare {
  variantId: string | null;
  sku: string;
  title: string | null;
  category: string | null;
  revenueMinor: number;
  unitsSold: number;
  shareBps: number;
  available: number | null;
  runwayDays: number | null;
}

/** the portfolio of a date range: what sold, the gross margin (null until every sold line has a cost), what needs a decision, the top sellers */
export interface IntelPortfolio {
  range: { from: string; to: string };
  netSalesMinor: number;
  orders: number;
  averageOrderValueMinor: number;
  grossProfitMinor: number | null;
  grossMarginBps: number | null;
  /** share of revenue whose product cost is known (0 to 1) */
  costCoverage: number;
  unitsSold: number;
  prioritizedCount: number;
  totalProducts: number;
  salesShare: IntelSalesShare[];
  otherShareBps: number;
  truncated: boolean;
}

export interface ProductIntelligenceQuery {
  action: IntelAction | undefined;
  categoryId: string | undefined;
  warehouseId: string | undefined;
  q: string | undefined;
  sort: IntelSort;
  page: number;
  pageSize: number;
  /** ask for the portfolio block of this range (YYYY-MM-DD, inclusive) */
  portfolio?: { from: string; to: string };
  /** exact lookup of one product */
  variantId?: string;
  /** exact SKU lookup */
  sku?: string;
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
