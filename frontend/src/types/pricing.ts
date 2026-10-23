/** Shapes of the pricing API (`/pricing/*`). Money is always integer minor units (paise); rates are basis points (100 = 1%). */

export const PRICING_STRATEGIES = ["automated_match", "margin_floor", "velocity_boost", "custom"] as const;
export type PriceStrategy = (typeof PRICING_STRATEGIES)[number];

export const PROPOSAL_STATUSES = ["pending_review", "approved", "rejected", "auto_applied", "expired", "superseded", "failed"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** the review queue tabs: every status, plus "all" */
export type ProposalTab = ProposalStatus | "all";
export const PROPOSAL_TABS: readonly ProposalTab[] = ["pending_review", "approved", "auto_applied", "rejected", "failed", "expired", "superseded", "all"];

export const PROPOSAL_SORTS = ["impact", "newest", "oldest"] as const;
export type ProposalSort = (typeof PROPOSAL_SORTS)[number];

export const PRICING_VIEWS = ["overview", "proposals", "policies", "competitors", "history"] as const;
export type PricingView = (typeof PRICING_VIEWS)[number];

export interface ProductChannelPriceItem {
  id: string;
  productTitle: string;
  sku: string;
  channel: string;
  marketplace: string;
  currentPrice: number;
  unitCost: number;
  feesAndShipping: number;
  estMarginPct: number;
  proposalState: "none" | "proposed";
  proposedPrice?: number;
}

export interface MarginContextItem {
  channel: string;
  marketplace: string;
  priceCount: number;
  avgEstMarginPct: number;
  belowTargetCount: number;
  feeAssumptions: string;
  nextActionType: "costs" | "proposals";
}

export interface PricingChannel {
  accountId: string;
  name: string;
  marketplace: string;
}

export interface PricingOverview {
  pendingProposals: number;
  potentialMarginGainMinor: number;
  proposalsWithoutEstimate: number;
  autoAppliedLast30Days: number;
  approvedLast30Days: number;
  rejectedLast30Days: number;
  activePolicies: number;
  pausedPolicies: number;
  channelsCovered: number;
  channels: PricingChannel[];
  proposalCounts: Partial<Record<ProposalStatus, number>>;
  basis: "estimated";
}

export interface PriceProposal {
  id: string;
  status: ProposalStatus;
  strategy: PriceStrategy;
  variantId: string;
  sku: string;
  productTitle: string;
  accountId: string;
  channelName: string;
  marketplace: string;
  policyId: string | null;
  policyName: string | null;
  currentPriceMinor: number;
  proposedPriceMinor: number;
  currency: string;
  priceChangeBps: number;
  competitorPriceMinor: number | null;
  estMarginDeltaBps: number | null;
  projectedSalesDeltaBps: number | null;
  reasoning: string;
  expiresAt: string | null;
  createdAt: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  appliedAt: string | null;
  failureMessage: string | null;
  pushSkipped: boolean;
  version: number;
}

export interface ProposalsQuery {
  tab: ProposalTab;
  q?: string;
  accountId?: string;
  strategy?: PriceStrategy;
  sort: ProposalSort;
  page: number;
  pageSize: number;
}

export interface ProposalsPage {
  items: PriceProposal[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  counts: Record<string, number>;
}

export type DecisionAction = "approve" | "reject";

export interface PushInfo {
  accountId: string;
  skipped?: string;
}

export interface DecisionResult {
  outcome: "applied" | "rejected" | "unchanged";
  proposal: PriceProposal;
  pushed: PushInfo[];
}

export type BulkOutcome = "applied" | "rejected" | "unchanged" | "failed" | "expired" | "error";
export interface BulkDecisionResult {
  action: DecisionAction;
  total: number;
  succeeded: number;
  failed: number;
  items: Array<{ id: string; outcome: BulkOutcome; code?: string; message?: string }>;
  pushed: PushInfo[];
}

// ---------------------------------------------------------------- generate
export interface GenerateInput {
  accountId?: string;
  policyId?: string;
  dryRun: boolean;
}
export interface GenerateItem {
  variantId: string;
  sku: string;
  accountId: string;
  status: "proposed" | "auto_applied" | "unchanged" | "skipped" | "failed";
  currentPriceMinor: number;
  proposedPriceMinor: number | null;
  policyId: string | null;
  proposalId?: string;
  reason?: string;
}
export interface GenerateSummary {
  dryRun: boolean;
  evaluated: number;
  proposed: number;
  autoApplied: number;
  unchanged: number;
  skipped: number;
  failed: number;
  items: GenerateItem[];
}
export type GenerateResponse =
  | { queued: false; truncated: boolean; result: GenerateSummary; pushed: PushInfo[] }
  | { queued: true; pairs: number };

// ---------------------------------------------------------------- policies
export interface PolicyParams {
  undercutBps?: number;
  allowIncrease?: boolean;
  slowUnits?: number;
  minStock?: number;
  stepBps?: number;
  targetMarginBps?: number;
  maxIncreaseBps?: number;
  minChangeBps?: number;
  elasticity?: number;
  expiresInDays?: number;
}

export type PolicyStatus = "active" | "paused";

export interface PricingPolicy {
  id: string;
  name: string;
  accountId: string | null;
  channel: string;
  strategy: PriceStrategy;
  targetMarginMinBps: number;
  maxDiscountBps: number;
  autoApproveUnderBps: number;
  params: PolicyParams & Record<string, unknown>;
  status: PolicyStatus;
  affectedVariants: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyWrite {
  name: string;
  accountId: string | null;
  strategy: PriceStrategy;
  targetMarginMinBps: number;
  maxDiscountBps: number;
  autoApproveUnderBps: number;
  params: PolicyParams;
  status: PolicyStatus;
}

// ---------------------------------------------------------------- competitor prices
export interface CompetitorPrice {
  id: string;
  variantId: string;
  sku: string | null;
  productTitle: string | null;
  accountId: string | null;
  accountName: string | null;
  priceMinor: number;
  currency: string;
  sellerName: string | null;
  source: "manual" | "import" | "api";
  observedAt: string;
  createdAt: string;
}

export interface CompetitorsQuery {
  q?: string;
  accountId?: string;
  latest: boolean;
  page: number;
  pageSize: number;
}

export interface CompetitorsPage {
  items: CompetitorPrice[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface CompetitorWrite {
  variantId: string;
  accountId: string | null;
  priceMinor: number;
  sellerName: string | null;
  observedAt: string | null;
}

export interface CompetitorImportResult {
  total: number;
  imported: number;
  skipped: number;
  rows: Array<{ line: number; sku: string; status: "imported" | "skipped"; reason?: string }>;
}

/** a variant found by the SKU / title search of the competitor form */
export interface VariantOption {
  id: string;
  sku: string;
  productTitle: string;
}

// ---------------------------------------------------------------- history
export const PRICE_FIELDS = ["base", "mrp", "marketplace", "sale"] as const;
export type PriceField = (typeof PRICE_FIELDS)[number];

export interface PriceHistoryRow {
  id: number;
  variantId: string;
  sku?: string | null;
  productTitle?: string | null;
  accountName?: string | null;
  actorName?: string | null;
  marketplaceAccountId: string | null;
  field: PriceField;
  oldPriceMinor: number | null;
  newPriceMinor: number | null;
  source: "manual" | "rule" | "bulk" | "catalog" | "schedule" | "import";
  ruleId: string | null;
  batchId: string | null;
  reason: string | null;
  actorId: string | null;
  createdAt: string;
}

export interface HistoryQuery {
  accountId?: string;
  field?: PriceField;
}

export interface HistoryPage {
  items: PriceHistoryRow[];
  nextBefore: number | null;
}
