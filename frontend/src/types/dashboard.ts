export interface NeedsAttentionItem {
  id: string;
  type: "low_stock" | "orders_at_risk" | "listing_issue" | "sync_issue";
  title: string;
  description: string;
  actionText: string;
  actionHref: string;
  severity: "critical" | "warning" | "info";
  count: number;
}

export interface BusinessMetric {
  id: string;
  label: string;
  value: string;
  change: string;
  trend?: "up" | "down" | "neutral";
}

export interface SalesHistoryPoint {
  date: string;
  revenue: number;
  previousRevenue: number;
}

export interface ChannelContributionItem {
  id: string;
  channel: string;
  revenue: string;
  percentage: number;
}

export interface OrderPipelineStage {
  id: string;
  label: string;
  count: number;
  indicatorColor: "blue" | "green";
}

export interface AffectedProduct {
  id: string;
  name: string;
  sku: string;
  available: number;
  status: "Low stock" | "Out of stock";
}

export interface ChannelHealthStatus {
  id: string;
  channel: string;
  status: "Healthy" | "Attention";
  connected: boolean;
  lastSync: string;
  issuesCount?: number;
  actionHref: string;
}
