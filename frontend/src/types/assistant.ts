export type AssistantRole = "user" | "assistant" | "system";

export interface CopilotInsight {
  id: string;
  category: "pricing" | "stock" | "channel" | "campaign";
  headline: string;
  summary: string;
  metricImpact: string;
  suggestedPrompt: string;
}

export interface CopilotMessage {
  id: string;
  role: AssistantRole;
  content: string;
  timestamp: string;
  suggestedActions?: {
    label: string;
    actionType: "navigate" | "apply_rule" | "draft_po" | "dismiss";
    targetUrl?: string;
  }[];
  dataVisual?: {
    type: "kpi" | "table" | "warning";
    title: string;
    details: { label: string; value: string }[];
  };
}

export interface CopilotSession {
  id: string;
  title: string;
  lastActive: string;
  messagesCount: number;
}
