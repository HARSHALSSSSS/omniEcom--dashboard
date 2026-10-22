import { Activity, AlertTriangle, CheckCircle2, TrendingUp, XCircle, type LucideIcon } from "lucide-react";
import type { InventorySignal, RowChannelSync, StockHealth, Tone } from "@/types/inventory";

export const NO_WRITE_REASON = "Your role can view stock but not change it (inventory:write is required).";

export const NO_VIEWS_REASON = "Your role cannot save views.";
export const ONE_WAREHOUSE_REASON = "Transfers need two or more warehouses.";

export const HEALTH_LABEL: Record<StockHealth, string> = {
  stockout: "Stockout",
  critical: "Critical",
  attention: "Attention",
  healthy: "Healthy",
};

export const TONE_OF_HEALTH: Record<StockHealth, Tone> = { stockout: "bad", critical: "bad", attention: "warn", healthy: "good" };

/** the colours of the design (green / amber / red / grey / blue) */
export const TONE_HEX: Record<Tone, string> = { good: "#16A34A", warn: "#D97706", bad: "#DC2626", neutral: "#737373", info: "#2563EB" };

export const HEALTH_ICON: Record<StockHealth, LucideIcon> = { stockout: XCircle, critical: XCircle, attention: AlertTriangle, healthy: CheckCircle2 };

export const SYNC_LABEL: Record<RowChannelSync, { label: string; tone: Tone; icon: LucideIcon }> = {
  healthy: { label: "Healthy", tone: "good", icon: CheckCircle2 },
  attention: { label: "Attention", tone: "warn", icon: AlertTriangle },
  failed: { label: "Failed", tone: "bad", icon: XCircle },
  not_listed: { label: "Not listed", tone: "neutral", icon: Activity },
};

export const SIGNAL_LABEL: Record<InventorySignal, string> = {
  low_stock: "Low stock",
  stockout_risk: "Stockout risk",
  inventory_mismatch: "Inventory mismatches",
  slow_moving: "Slow-moving",
  high_velocity: "High velocity",
  aging_inventory: "Aging inventory",
  warehouse_imbalance: "Warehouse imbalance",
};

export const SIGNAL_ICON: Record<InventorySignal, LucideIcon> = {
  low_stock: Activity,
  stockout_risk: AlertTriangle,
  inventory_mismatch: Activity,
  slow_moving: Activity,
  high_velocity: TrendingUp,
  aging_inventory: Activity,
  warehouse_imbalance: Activity,
};

/** "7d" under the ledger, "—" where nothing was sold yet (there is nothing to divide by) */
export const coverShort = (coverDays: number | null, available: number): string => {
  if (available === 0) return "0d";
  if (coverDays === null) return "—";
  return `${Math.round(coverDays)}d`;
};

/** 7 daily points to the small waveform of the design (28 x 14) */
export function sparkPath(trend: number[]): string {
  if (trend.length < 2) return "";
  const min = Math.min(...trend);
  const max = Math.max(...trend);
  const span = max - min;
  return trend
    .map((v, i) => {
      const x = Math.round((i * 28 * 10) / (trend.length - 1)) / 10;
      const y = span === 0 ? 7 : Math.round((12.5 - ((v - min) / span) * 11) * 10) / 10;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}
