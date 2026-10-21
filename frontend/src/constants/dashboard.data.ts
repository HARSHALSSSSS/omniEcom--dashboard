import type { OrderStage, SalesPeriod } from "@/types/dashboard";

/** Static labels only: every number on the dashboard comes from GET /dashboard. */
export const PERIOD_OPTIONS: ReadonlyArray<{ value: SalesPeriod; label: string; days: number }> = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
];

export const DEFAULT_PERIOD: SalesPeriod = "30d";

export const STAGE_LABELS: Record<OrderStage, string> = {
  new: "New",
  confirmed: "Confirmed",
  picking: "Picking",
  packing: "Packing",
  dispatched: "Dispatched",
  delivered: "Delivered",
};

/** stages that are already out of the warehouse get the green indicator */
export const DONE_STAGES: ReadonlySet<OrderStage> = new Set<OrderStage>(["dispatched", "delivered"]);

export const METRIC_LABELS: Record<string, string> = {
  orders: "Orders",
  revenueMinor: "Revenue",
  units: "Units sold",
  returnRatePct: "Return rate",
  lowStockProducts: "Low-stock products",
};
