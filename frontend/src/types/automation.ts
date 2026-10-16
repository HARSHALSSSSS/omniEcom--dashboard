export type TriggerType =
  | "stock_below_threshold"
  | "order_sla_risk"
  | "buybox_price_drop"
  | "listing_sync_failure"
  | "scheduled_cadence";

export type ActionType =
  | "draft_purchase_order"
  | "adjust_channel_price"
  | "reassign_warehouse"
  | "notify_channel_slack"
  | "snooze_listing";

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  triggerType: TriggerType;
  actionType: ActionType;
  requiresExplicitApproval: boolean; // Must be true for advisory/financial actions
  status: "active" | "paused";
  runsCount: number;
  lastRunTime?: string;
  channelFilter?: string;
}

export interface AutomationApprovalItem {
  id: string;
  ruleId: string;
  ruleName: string;
  triggerEvent: string;
  proposedAction: string;
  entityName: string;
  skuOrOrder: string;
  financialImpact: string;
  timestamp: string;
  status: "pending" | "approved" | "rejected";
}

export interface AutomationRunLog {
  id: string;
  ruleName: string;
  executionStatus: "success" | "awaiting_approval" | "failed";
  timestamp: string;
  summary: string;
  durationMs: number;
}
