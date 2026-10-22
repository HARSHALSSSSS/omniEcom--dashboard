import type {
  CopilotInsight,
  CopilotMessage,
  CopilotSession,
} from "@/types/assistant";
import type {
  AutomationRule,
  AutomationApprovalItem,
  AutomationRunLog,
} from "@/types/automation";

export const MOCK_COPILOT_INSIGHTS: CopilotInsight[] = [
  {
    id: "ins-1",
    category: "stock",
    headline: "Stockout Risk on Top Revenue SKU",
    summary:
      "Premium Travel Bag (TRV-1042-BLK) has 8 days of cover remaining at current velocity of 14.2 units/day across Amazon and Flipkart.",
    metricImpact: "Est. ₹1.24L revenue at risk next week",
    suggestedPrompt:
      "Show me recommended replenishment quantities and lead times for TRV-1042-BLK",
  },
  {
    id: "ins-2",
    category: "pricing",
    headline: "Flipkart Buy Box Undercut Opportunity",
    summary:
      "Competitor raised price on Cotton Overshirt to ₹1,699. You can raise price by ₹150 while maintaining 95% Buy Box share.",
    metricImpact: "+₹22,500 monthly net profit",
    suggestedPrompt:
      "Draft a price adjustment proposal for Cotton Overshirt on Flipkart",
  },
  {
    id: "ins-3",
    category: "campaign",
    headline: "Festive Flash Sale Budget Under-utilization",
    summary:
      "Weekend Luggage Sale has spent only 53% of budget with high ROAS (5.07x). Recommended to expand daily caps on Shopify.",
    metricImpact: "Potential 22 additional orders/day",
    suggestedPrompt:
      "How can I scale the Weekend Luggage campaign without hurting margins?",
  },
];

export const MOCK_COPILOT_HISTORY: CopilotSession[] = [
  {
    id: "sess-1",
    title: "Stock Replenishment Strategy & Vendor Timelines",
    lastActive: "Today · 11:30 AM",
    messagesCount: 6,
  },
  {
    id: "sess-2",
    title: "Diwali 2026 Channel Margin Breakdown",
    lastActive: "Yesterday",
    messagesCount: 12,
  },
  {
    id: "sess-3",
    title: "Meesho Return Rate & Regional Logistics Variance",
    lastActive: "Oct 14, 2026",
    messagesCount: 4,
  },
];

export const MOCK_INITIAL_MESSAGES: CopilotMessage[] = [
  {
    id: "msg-1",
    role: "assistant",
    content:
      "Hello Abhishek! I am your Commerce Copilot. I analyze your sales, multi-channel inventory, marketplace listing health, and unit economics in real time. How can I assist your operations today?",
    timestamp: "11:28 AM",
    suggestedActions: [
      {
        label: "Review stockout risks (TRV-1042)",
        actionType: "navigate",
        targetUrl: "/inventory",
      },
      {
        label: "Inspect today's P&L contribution",
        actionType: "navigate",
        targetUrl: "/profitability",
      },
      {
        label: "Check pending price proposals",
        actionType: "navigate",
        targetUrl: "/pricing",
      },
    ],
  },
];

export const MOCK_AUTOMATION_RULES: AutomationRule[] = [
  {
    id: "rule-auto-1",
    name: "Auto-Draft PO When Stock Runway < 10 Days",
    description:
      "Automatically constructs a drafted Purchase Order for qualified suppliers when aggregate inventory cover drops below 10 days.",
    triggerType: "stock_below_threshold",
    actionType: "draft_purchase_order",
    requiresExplicitApproval: true,
    status: "active",
    runsCount: 18,
    lastRunTime: "25 min ago",
  },
  {
    id: "rule-auto-2",
    name: "Flipkart SLA At-Risk Dispatch Notification",
    description:
      "Triggers high-priority alert and wave-batch escalation when dispatch SLA remaining is under 45 minutes.",
    triggerType: "order_sla_risk",
    actionType: "notify_channel_slack",
    requiresExplicitApproval: false,
    status: "active",
    runsCount: 64,
    lastRunTime: "12 min ago",
  },
  {
    id: "rule-auto-3",
    name: "Amazon Buy Box Margin Floor Defense",
    description:
      "Drafts a repricing proposal to match Buy Box competitor down to minimum 20% margin threshold.",
    triggerType: "buybox_price_drop",
    actionType: "adjust_channel_price",
    requiresExplicitApproval: true,
    status: "active",
    runsCount: 31,
    lastRunTime: "2 hours ago",
    channelFilter: "Amazon",
  },
];

export const MOCK_AUTOMATION_APPROVALS: AutomationApprovalItem[] = [
  {
    id: "appr-01",
    ruleId: "rule-auto-1",
    ruleName: "Auto-Draft PO When Stock Runway < 10 Days",
    triggerEvent: "Stock runway reached 8 days (TRV-1042-BLK)",
    proposedAction: "Generate Purchase Order for 150 units with Vanguard Luggage Components",
    entityName: "Premium Travel Bag (Midnight Black)",
    skuOrOrder: "TRV-1042-BLK",
    financialImpact: "₹1,85,000 committed capital",
    timestamp: "10:15 AM",
    status: "pending",
  },
  {
    id: "appr-02",
    ruleId: "rule-auto-3",
    ruleName: "Amazon Buy Box Margin Floor Defense",
    triggerEvent: "Competitor Buy Box lowered to ₹1,499",
    proposedAction: "Lower Flipkart price from ₹1,599 to ₹1,449 to capture sales velocity",
    entityName: "Cotton Overshirt (Sand)",
    skuOrOrder: "OS-2048-SND",
    financialImpact: "-2.1% margin for +18.5% volume lift",
    timestamp: "09:40 AM",
    status: "pending",
  },
];

export const MOCK_AUTOMATION_RUNS: AutomationRunLog[] = [
  {
    id: "run-01",
    ruleName: "Flipkart SLA At-Risk Dispatch Notification",
    executionStatus: "success",
    timestamp: "Today · 11:45 AM",
    summary: "Escalated order ORD-IN-90804 to picking wave #14. Carrier dispatch scheduled.",
    durationMs: 240,
  },
  {
    id: "run-02",
    ruleName: "Auto-Draft PO When Stock Runway < 10 Days",
    executionStatus: "awaiting_approval",
    timestamp: "Today · 10:15 AM",
    summary: "Drafted PO-2026-0048 for TRV-1042-BLK; routed to Approvals Queue.",
    durationMs: 380,
  },
  {
    id: "run-03",
    ruleName: "Amazon Buy Box Margin Floor Defense",
    executionStatus: "awaiting_approval",
    timestamp: "Today · 09:40 AM",
    summary: "Drafted repricing recommendation for OS-2048-SND; routed to Approvals Queue.",
    durationMs: 310,
  },
];
