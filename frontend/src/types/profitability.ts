/** Profitability screen: the P&L bridge (GET /analytics/profitability/waterfall) and marketing spend (/analytics/marketing-spend). Money is integer minor units (paise). */

export type Basis = "actual" | "estimated" | "missing";
export type Completeness = "complete" | "estimated" | "incomplete";
export type StepType = "positive" | "negative" | "subtotal";

export interface Delta {
  changeMinor: number | null;
  changePercent: number | null;
}

export interface Component {
  amountMinor: number | null;
  basis: Basis;
  /** 0..1 share of revenue / orders the amount is known for */
  coverage: number;
}

export interface WaterfallStep {
  key: string;
  label: string;
  type: StepType;
  /** signed: revenue positive, every deduction negative, null when nothing is known */
  amountMinor: number | null;
  basis: Basis;
  coverage: number;
  shareOfRevenuePercent: number | null;
  tooltip: string;
  previousAmountMinor?: number | null;
  change?: Delta;
}

export interface ChannelRow {
  channel: string;
  label: string;
  orders: number;
  grossRevenue: Component;
  cogs: Component;
  marketplaceFees: Component;
  shippingCosts: Component;
  returnsImpact: Component;
  advertisingSpend: Component;
  netProfitMinor: number | null;
  knownPartMinor: number;
  netMarginPercent: number | null;
  missing: string[];
}

export interface DateRange {
  from: string;
  to: string;
}

export interface WaterfallComparison {
  range: DateRange;
  ordersAnalysed: number;
  truncated: boolean;
  grossRevenue: Delta;
  netContribution: Delta;
  netMarginPoints: number | null;
  previousNetContributionMinor: number | null;
  previousGrossRevenueMinor: number | null;
}

export interface Waterfall {
  range: DateRange;
  ordersAnalysed: number;
  ordersInRange: number;
  windows: number;
  truncated: boolean;
  steps: WaterfallStep[];
  grossRevenueMinor: number;
  netContributionMinor: number | null;
  knownPartMinor: number;
  netMarginPercent: number | null;
  missing: string[];
  completeness: Completeness;
  unallocatedAdvertisingMinor: number;
  channels: ChannelRow[];
  comparison: WaterfallComparison | null;
}

export const RANGE_PRESETS = ["30d", "mtd", "last_month", "90d", "ytd", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export interface WaterfallQuery extends DateRange {
  compare: boolean;
}

export type ProfitView = "waterfall" | "spend";

// ---- marketing spend ----

export interface SpendRow {
  id: string;
  spendDate: string;
  accountId: string | null;
  accountName: string | null;
  marketplace: string | null;
  amountMinor: number;
  currency: string;
  campaign: string | null;
  source: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpendPage {
  items: SpendRow[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface SpendQuery {
  from?: string;
  to?: string;
  /** an account id, or "none" for spend that is not tied to an account */
  account?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export interface SpendSummary {
  range: DateRange;
  rows: number;
  totalMinor: number;
  byAccount: Array<{ accountId: string | null; accountName: string | null; marketplace: string | null; rows: number; amountMinor: number }>;
  byCampaign: Array<{ campaign: string; rows: number; amountMinor: number }>;
  byDay: Array<{ day: string; amountMinor: number }>;
}

export interface SpendWrite {
  spendDate: string;
  accountId: string | null;
  amountMinor: number;
  campaign: string | null;
  notes: string | null;
}

export interface SpendAccount {
  id: string;
  marketplace: string;
  displayName: string;
  status: string;
}

export type ImportUnit = "rupees" | "paise";

export interface SpendImportResult {
  rows: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  dryRun: boolean;
  errors: Array<{ row: number; field: string | null; message: string }>;
}

// ---- product profitability & review drawer ----

export interface ProductCostBreakdown {
  productCostMinor: number;
  marketplaceCommissionMinor: number;
  paymentFeesMinor: number;
  shippingMinor: number;
  discountsMinor: number;
  returnsMinor: number;
}

export interface ProductChannelComparison {
  marketplace: string;
  sellingPriceMinor: number;
  marginPercent: number;
  isBest?: boolean;
}

export interface ProductProfitSignal {
  summary: string;
  bullets: string[];
  recommendation: string;
}

export interface ProductProfitItem {
  id: string;
  name: string;
  sku: string;
  revenueMinor: number;
  units: number;
  productCostMinor: number;
  feesMinor: number;
  shippingMinor: number;
  returnsMinor: number;
  contributionMinor: number;
  marginPercent: number;
  status: "Healthy" | "Review" | "Below target";
  calculatedContributionMinor?: number;
  differenceMinor?: number;
  reconciles?: boolean;
  costBreakdown: ProductCostBreakdown;
  channelComparison: ProductChannelComparison[];
  signal: ProductProfitSignal;
  quadrant: {
    demand: "low" | "high";
    margin: "low" | "high";
    category: "marketing" | "scale" | "review" | "optimize";
    x: number; // percentage (0 - 100)
    y: number; // percentage (0 - 100)
  };
}

export interface ChannelContributionItem {
  marketplace: string;
  revenueMinor: number;
  contributionMinor: number;
  marginPercent: number;
  isBest?: boolean;
}

export interface MarginPressureMetrics {
  healthyCount: number;
  belowTargetCount: number;
  lowContributionCount: number;
}

