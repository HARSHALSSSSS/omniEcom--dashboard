import type { RowChannelSync, StockHealth, Tone } from "@/types/inventory";

export const NO_WRITE_REASON = "Your role can view stock but not change it (inventory:write is required).";

export const HEALTH_LABEL: Record<StockHealth, string> = {
  stockout: "Out of stock",
  critical: "Critical",
  attention: "Needs attention",
  healthy: "Healthy",
};

export const TONE_OF_HEALTH: Record<StockHealth, Tone> = { stockout: "bad", critical: "bad", attention: "warn", healthy: "good" };

export const SYNC_LABEL: Record<RowChannelSync, { label: string; tone: Tone }> = {
  healthy: { label: "Synced", tone: "good" },
  attention: { label: "Sync needs review", tone: "warn" },
  failed: { label: "Sync failed", tone: "bad" },
  not_listed: { label: "Not listed", tone: "neutral" },
};

export const REASON_LABEL: Record<string, string> = {
  audit_correction: "Physical audit correction",
  damaged: "Damaged in transit / inspection",
  shrinkage: "Inventory shrinkage",
  manual_addition: "Manual inward stock addition",
};
