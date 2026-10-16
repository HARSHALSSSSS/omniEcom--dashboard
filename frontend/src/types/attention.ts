import { z } from "zod";

export type AttentionPriority = "critical" | "high" | "medium" | "low";

export type AttentionCategory =
  | "stock"
  | "order"
  | "listing"
  | "sync"
  | "channel";

export type AttentionStatus = "open" | "in_progress" | "resolved" | "snoozed";

export interface NeedsAttentionItem {
  id: string;
  category: AttentionCategory;
  priority: AttentionPriority;
  status: AttentionStatus;
  headline: string;
  description: string;
  module: string;
  deepLink: string;
  entityId: string;
  entityName: string;
  channel?: "amazon" | "flipkart" | "meesho" | "shopify";
  detectedAt: string;
  recommendedAction: string;
  snoozedUntil?: string;
  resolvedAt?: string;
  impactMetrics?: {
    revenueAtRiskINR?: number;
    affectedOrdersCount?: number;
    hoursRemaining?: number;
  };
}

export const resolveAttentionSchema = z.object({
  id: z.string(),
  action: z.enum(["resolve", "snooze", "in_progress"]),
  snoozeHours: z.number().optional(),
});
export type ResolveAttentionInput = z.infer<typeof resolveAttentionSchema>;
