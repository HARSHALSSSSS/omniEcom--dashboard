/** GET /dashboard: the home aggregate. Sections the caller may not read are absent (undefined). */
export type SalesPeriod = "7d" | "30d" | "90d";

export type IssueKey = "low_stock" | "orders_at_risk" | "listing_issue" | "sync_issue";

export interface DashboardAction {
  label: string;
  href: string;
}

export interface DashboardChannelRef {
  code: string;
  name: string;
  accountId?: string | null;
  availability?: "live" | "coming_soon";
}

export interface DashboardAttentionItem {
  issueKey: IssueKey | (string & {});
  area: string;
  title: string;
  summary: string;
  count: number;
  action: DashboardAction;
}

export interface DashboardRecommendation {
  id: string;
  kind: string;
  severity: string;
  title: string;
  rationale: string;
  status: string;
  actions: string[];
  recommendationOnly: boolean;
}

export type SnapshotMetricKey = "orders" | "revenueMinor" | "units" | "returnRatePct" | "lowStockProducts";

export interface DashboardMetric {
  key: SnapshotMetricKey | (string & {});
  value: number;
  previous: number | null;
  changePct: number | null;
  note?: string;
}

export interface DashboardSeriesPoint {
  day: string;
  revenueMinor: number;
  previousRevenueMinor: number;
  orders: number;
}

export interface DashboardChannelContribution {
  channel: DashboardChannelRef;
  revenueMinor: number;
  orders: number;
  sharePct: number;
}

export type OrderStage = "new" | "confirmed" | "picking" | "packing" | "dispatched" | "delivered";

export interface DashboardAffectedProduct {
  productId: string;
  title: string;
  sku: string;
  available: number;
  status: "low" | "out";
}

export interface DashboardChannelHealth {
  channel: DashboardChannelRef;
  health: "healthy" | "attention";
  connection: "connected" | "needs_attention" | "not_connected";
  lastSyncAt: string | null;
  openIssues: number;
  action: { key: string; href: string };
}

export interface Dashboard {
  asOf: string;
  generatedAt: string;
  greeting: { firstName: string | null };
  needsAttention?: { items: DashboardAttentionItem[] };
  recommendation?: DashboardRecommendation | null;
  snapshot: { period: "today"; day: string; currency: string; metrics: DashboardMetric[] };
  sales: {
    period: string;
    currency: string;
    series: DashboardSeriesPoint[];
    channelContribution: DashboardChannelContribution[];
  };
  orderFlow?: Array<{ stage: OrderStage; count: number }>;
  inventoryHealth?: {
    healthy: number;
    low: number;
    out: number;
    mostAffected: DashboardAffectedProduct[];
  };
  channelHealth?: DashboardChannelHealth[];
  sync?: { lastSyncedAt: string | null; systemStatus: "operational" | "degraded" };
}
