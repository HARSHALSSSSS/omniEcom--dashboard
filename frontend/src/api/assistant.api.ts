import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  AssistantAiSettings,
  AssistantConversation,
  AssistantInsight,
  ConversationDetail,
  ConversationStatus,
  ConversationsPage,
  ConversationsQuery,
  SendMessageResult,
} from "@/types/assistant";

export function conversationParams(q: ConversationsQuery): Record<string, string | number> {
  const out: Record<string, string | number> = { pageSize: q.pageSize, "filter[status]": q.status };
  if (q.page > 1) out.page = q.page;
  if (q.q) out.q = q.q;
  return out;
}

export const assistantApi = {
  settings: async (signal?: AbortSignal) => unwrap<AssistantAiSettings>(await client.get(ENDPOINTS.AI_SETTINGS, { signal })),

  /** turns the business AI switch on (the same switch as Settings > Operations) */
  enable: async () => unwrap<AssistantAiSettings>(await client.put(ENDPOINTS.AI_SETTINGS, { enabled: true })),

  insights: async (limit: number, signal?: AbortSignal) =>
    unwrap<AssistantInsight[]>(await client.get(ENDPOINTS.AI_INSIGHTS, { params: { limit }, signal })),

  conversations: async (query: ConversationsQuery, signal?: AbortSignal) =>
    unwrap<ConversationsPage>(await client.get(ENDPOINTS.AI_CONVERSATIONS, { params: conversationParams(query), signal })),

  conversation: async (id: string, signal?: AbortSignal) =>
    unwrap<ConversationDetail>(await client.get(ENDPOINTS.AI_CONVERSATION(id), { signal })),

  /** without a title the server names it after the first question */
  create: async (title?: string) => unwrap<AssistantConversation>(await client.post(ENDPOINTS.AI_CONVERSATIONS, title ? { title } : {})),

  /** the answer comes back in the same response: the server does not stream */
  send: async (id: string, text: string) =>
    unwrap<SendMessageResult>(await client.post(ENDPOINTS.AI_CONVERSATION_MESSAGES(id), { text })),

  rename: async (id: string, title: string) => unwrap<AssistantConversation>(await client.patch(ENDPOINTS.AI_CONVERSATION(id), { title })),

  setStatus: async (id: string, status: ConversationStatus) =>
    unwrap<AssistantConversation>(await client.patch(ENDPOINTS.AI_CONVERSATION(id), { status })),

  remove: async (id: string) => unwrap<{ id: string; deleted: true }>(await client.delete(ENDPOINTS.AI_CONVERSATION(id))),
};
