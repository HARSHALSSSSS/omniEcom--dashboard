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

// ---- product profitability (GET /analytics/profitability?groupBy=product) ----

export const MARGIN_STATUSES = ["healthy", "below_target", "low"] as const;
export type MarginStatus = (typeof MARGIN_STATUSES)[number];
export type StatusFilter = MarginStatus | "unknown";
export const PRODUCT_SORTS = ["revenue", "contribution", "margin", "units"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export interface ProductChannelFigures {
  marketplace: string;
  orders: number;
  units: number;
  revenueMinor: number;
  contributionMinor: number | null;
  marginPercent: number | null;
}

/** one product of the range: what it earned and what is known about its costs */
export interface ProductProfit {
  key: string;
  label: string;
  title: string | null;
  orders: number;
  unitsSold: number;
  revenue: Component;
  productCost: Component;
  shipping: Component;
  marketplaceFees: Component;
  penalties: Component;
  refunds: Component;
  /** null while any cost is missing: never a guess */
  contributionMinor: number | null;
  knownPartMinor: number;
  marginPercent: number | null;
  marginStatus: MarginStatus | null;
  missing: string[];
  completeness: Completeness;
  channels: ProductChannelFigures[];
}

export interface ProductProfitPage {
  range: DateRange;
  ordersAnalysed: number;
  ordersInRange: number;
  truncated: boolean;
  /** the strictest margin target of the active pricing policies (basis points); null = none set */
  marginTargetBps: number | null;
  statusCounts: { healthy: number; belowTarget: number; low: number; unknown: number };
  groupsTotal: number;
  page: number;
  pageSize: number;
  pages: number;
  groups: ProductProfit[];
}

export interface ProductQuery extends DateRange {
  marketplace?: string;
  q?: string;
  status?: StatusFilter;
  sort: ProductSort;
  page: number;
  pageSize: number;
}
