/** AI Assistant: the shapes the /ai endpoints return (GET /ai/conversations, /ai/insights, /ai/settings, ...). */

export type ConversationStatus = "active" | "archived";
export type ConversationFilter = ConversationStatus | "all";

export const CONTEXT_SOURCES = ["product_intelligence", "reports", "profitability", "inventory", "orders", "procurement", "other"] as const;
export type ContextSource = (typeof CONTEXT_SOURCES)[number];

/** where a conversation started: the product and the screen */
export interface ConversationContext {
  sku?: string;
  source?: ContextSource;
}

export interface AssistantConversation {
  id: string;
  title: string;
  status: ConversationStatus;
  messagesCount: number;
  context: ConversationContext | null;
  /** ISO timestamp of the last message (or of the creation) */
  lastActive: string;
  createdAt: string;
}

export interface ConversationsQuery {
  status: ConversationFilter;
  q: string;
  /** only conversations that began on this screen */
  source?: ContextSource;
  page: number;
  pageSize: number;
}

export interface ConversationsPage {
  items: AssistantConversation[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export type SuggestedActionType = "navigate" | "apply_rule" | "draft_po" | "dismiss";

export interface SuggestedAction {
  label: string;
  actionType: SuggestedActionType;
  targetUrl?: string;
}

export interface DataVisual {
  type: "kpi" | "table" | "warning";
  title: string;
  details: Array<{ label: string; value: string }>;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  /** Markdown */
  content: string;
  /** ISO timestamp from the server */
  timestamp: string;
  intent: string | null;
  confidence: "data" | "none" | null;
  generatedBy: "rules" | "llm" | null;
  dataVisual: DataVisual | null;
  suggestedActions: SuggestedAction[];
  sources: string[];
}

export interface ConversationDetail extends AssistantConversation {
  /** oldest first */
  messages: AssistantMessage[];
}

export interface SendMessageResult {
  conversation: AssistantConversation;
  userMessage: AssistantMessage;
  assistantMessage: AssistantMessage;
  followUp: "period" | "detail" | "topic" | null;
}

export interface AssistantInsight {
  id: string;
  category: "pricing" | "stock" | "channel" | "campaign";
  severity: "info" | "warning" | "critical";
  headline: string;
  summary: string;
  metricImpact: string | null;
  metric: { key: string; valueMinor?: number; value?: number } | null;
  suggestedPrompt: string;
  source: string;
}

export interface AssistantAiSettings {
  enabled: boolean;
  mode: string;
  automatedActions: string[];
  isDefault: boolean;
}
