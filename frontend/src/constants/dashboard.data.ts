import type {
  NeedsAttentionItem,
  BusinessMetric,
  SalesHistoryPoint,
  ChannelContributionItem,
  OrderPipelineStage,
  AffectedProduct,
  ChannelHealthStatus,
} from "@/types/dashboard";

export const NEEDS_ATTENTION_ITEMS: NeedsAttentionItem[] = [
  {
    id: "low_stock",
    type: "low_stock",
    title: "Low stock",
    description: "18 products are running low on inventory",
    actionText: "Review inventory →",
    actionHref: "/inventory",
    severity: "warning",
    count: 18,
  },
  {
    id: "orders_at_risk",
    type: "orders_at_risk",
    title: "Orders at risk",
    description: "7 orders need action before dispatch",
    actionText: "View orders →",
    actionHref: "/orders",
    severity: "critical",
    count: 7,
  },
  {
    id: "listing_issue",
    type: "listing_issue",
    title: "Listing issue",
    description: "4 marketplace listings need attention",
    actionText: "Review listings →",
    actionHref: "/listings",
    severity: "warning",
    count: 4,
  },
  {
    id: "sync_issue",
    type: "sync_issue",
    title: "Sync issue",
    description: "2 channel connections need attention",
    actionText: "Check connections →",
    actionHref: "/marketplace-hub",
    severity: "warning",
    count: 2,
  },
];

export const BUSINESS_METRICS: BusinessMetric[] = [
  {
    id: "orders",
    label: "Orders",
    value: "126",
    change: "+12% vs previous period",
    trend: "up",
  },
  {
    id: "revenue",
    label: "Revenue",
    value: "₹2.84L",
    change: "+8.4%",
    trend: "up",
  },
  {
    id: "units_sold",
    label: "Units sold",
    value: "318",
    change: "+6.2%",
    trend: "up",
  },
  {
    id: "return_rate",
    label: "Return rate",
    value: "4.8%",
    change: "-0.7%",
    trend: "down",
  },
  {
    id: "low_stock_products",
    label: "Low-stock products",
    value: "18",
    change: "Needs review",
    trend: "neutral",
  },
];

export const SALES_HISTORY_DATA: SalesHistoryPoint[] = [
  { date: "Sep 6", revenue: 24000, previousRevenue: 28000 },
  { date: "Sep 9", revenue: 29000, previousRevenue: 31000 },
  { date: "Sep 12", revenue: 34000, previousRevenue: 26000 },
  { date: "Sep 15", revenue: 28000, previousRevenue: 33000 },
  { date: "Sep 18", revenue: 39234, previousRevenue: 19865 },
  { date: "Sep 21", revenue: 45000, previousRevenue: 27000 },
  { date: "Sep 24", revenue: 48000, previousRevenue: 34000 },
  { date: "Sep 27", revenue: 42000, previousRevenue: 39000 },
  { date: "Sep 30", revenue: 53000, previousRevenue: 41000 },
  { date: "Oct 3", revenue: 49000, previousRevenue: 38000 },
  { date: "Oct 5", revenue: 56000, previousRevenue: 42000 },
];

export const CHANNEL_CONTRIBUTION_DATA: ChannelContributionItem[] = [
  { id: "amazon", channel: "Amazon", revenue: "₹1.24L", percentage: 95 },
  { id: "flipkart", channel: "Flipkart", revenue: "₹68K", percentage: 55 },
  { id: "shopify", channel: "Shopify", revenue: "₹50K", percentage: 40 },
  { id: "meesho", channel: "Meesho", revenue: "₹42K", percentage: 34 },
];

export const ORDER_PIPELINE_STAGES: OrderPipelineStage[] = [
  { id: "new", label: "New", count: 24, indicatorColor: "blue" },
  { id: "confirmed", label: "Confirmed", count: 31, indicatorColor: "blue" },
  { id: "picking", label: "Picking", count: 12, indicatorColor: "blue" },
  { id: "packing", label: "Packing", count: 18, indicatorColor: "blue" },
  { id: "dispatched", label: "Dispatched", count: 41, indicatorColor: "green" },
  { id: "delivered", label: "Delivered", count: 96, indicatorColor: "green" },
];

export const AFFECTED_PRODUCTS: AffectedProduct[] = [
  {
    id: "1",
    name: "Premium Travel Bag",
    sku: "TRV-1042",
    available: 4,
    status: "Low stock",
  },
  {
    id: "2",
    name: "Cotton Overshirt",
    sku: "OS-2048",
    available: 0,
    status: "Out of stock",
  },
  {
    id: "3",
    name: "Classic Backpack",
    sku: "BP-1021",
    available: 8,
    status: "Low stock",
  },
];

export const CHANNEL_HEALTH_ITEMS: ChannelHealthStatus[] = [
  {
    id: "amazon",
    channel: "Amazon",
    status: "Healthy",
    connected: true,
    lastSync: "2 min ago",
    actionHref: "/marketplace-hub",
  },
  {
    id: "flipkart",
    channel: "Flipkart",
    status: "Healthy",
    connected: true,
    lastSync: "2 min ago",
    actionHref: "/marketplace-hub",
  },
  {
    id: "meesho",
    channel: "Meesho",
    status: "Attention",
    connected: true,
    lastSync: "18 min ago",
    issuesCount: 2,
    actionHref: "/marketplace-hub",
  },
  {
    id: "shopify",
    channel: "Shopify",
    status: "Healthy",
    connected: true,
    lastSync: "2 min ago",
    actionHref: "/marketplace-hub",
  },
];
