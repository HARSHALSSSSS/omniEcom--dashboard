import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { assistantApi } from "@/api/assistant.api";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { ConversationDetail, ConversationsQuery, ConversationStatus, SendMessageResult } from "@/types/assistant";

export const assistantKeys = {
  all: ["assistant"] as const,
  settings: (b: string | undefined) => ["assistant", "settings", b] as const,
  insights: (b: string | undefined) => ["assistant", "insights", b] as const,
  conversations: (b: string | undefined, q: Omit<ConversationsQuery, "page">) => ["assistant", "conversations", b, q] as const,
  conversationsAll: (b: string | undefined) => ["assistant", "conversations", b] as const,
  conversation: (b: string | undefined, id: string) => ["assistant", "conversation", b, id] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

export const INSIGHTS_LIMIT = 6;
export const CONVERSATIONS_PAGE_SIZE = 30;

/** GET /ai/settings is not behind the AI switch, so it can tell "switched off" apart from "no access" */
export function useAssistantSettings(enabled: boolean) {
  const b = useBusinessId();
  return useQuery({ queryKey: assistantKeys.settings(b), queryFn: ({ signal }) => assistantApi.settings(signal), staleTime: 30_000, enabled });
}

export function useEnableAssistant() {
  const qc = useQueryClient();
  return useGuardedMutation({
    mutationFn: assistantApi.enable,
    onSuccess: () => void qc.invalidateQueries({ queryKey: assistantKeys.all }),
  });
}

export function useAssistantInsights(enabled: boolean) {
  const b = useBusinessId();
  return useQuery({
    queryKey: assistantKeys.insights(b),
    queryFn: ({ signal }) => assistantApi.insights(INSIGHTS_LIMIT, signal),
    staleTime: 60_000,
    enabled,
    retry: false,
  });
}

/** the user's own conversations, newest activity first; "show more" follows the page number */
export function useConversationList(query: Omit<ConversationsQuery, "page" | "pageSize">, enabled: boolean) {
  const b = useBusinessId();
  const q = { ...query, pageSize: CONVERSATIONS_PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: assistantKeys.conversations(b, q),
    queryFn: ({ pageParam, signal }) => assistantApi.conversations({ ...q, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    staleTime: 10_000,
    enabled,
  });
}

export function useConversationDetail(id: string | null) {
  const b = useBusinessId();
  return useQuery({
    queryKey: assistantKeys.conversation(b, id ?? ""),
    queryFn: ({ signal }) => assistantApi.conversation(id as string, signal),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

/** after any change to the set of conversations */
function useRefreshLists() {
  const qc = useQueryClient();
  const b = useBusinessId();
  return () => void qc.invalidateQueries({ queryKey: assistantKeys.conversationsAll(b) });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  const b = useBusinessId();
  const refresh = useRefreshLists();
  return useGuardedMutation({
    mutationFn: (title?: string) => assistantApi.create(title),
    onSuccess: (conv) => {
      // seed the detail so opening it does not race the first answer with an empty read
      qc.setQueryData<ConversationDetail>(assistantKeys.conversation(b, conv.id), { ...conv, messages: [] });
      refresh();
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  const b = useBusinessId();
  const refresh = useRefreshLists();
  return useGuardedMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => assistantApi.send(id, text),
    onSuccess: (res: SendMessageResult, { id }) => {
      const key = assistantKeys.conversation(b, id);
      qc.setQueryData<ConversationDetail>(key, (old) => ({
        ...res.conversation,
        messages: [...(old?.messages ?? []), res.userMessage, res.assistantMessage],
      }));
      refresh();
    },
    onError: (_e, { id }) => {
      // a failed send may still have changed the conversation (archived, full): read it again
      void qc.invalidateQueries({ queryKey: assistantKeys.conversation(b, id) });
    },
  });
}

export function useRenameConversation() {
  const qc = useQueryClient();
  const b = useBusinessId();
  const refresh = useRefreshLists();
  return useGuardedMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => assistantApi.rename(id, title),
    onSuccess: (conv) => {
      qc.setQueryData<ConversationDetail>(assistantKeys.conversation(b, conv.id), (old) => (old ? { ...old, ...conv } : old));
      refresh();
    },
  });
}

export function useSetConversationStatus() {
  const qc = useQueryClient();
  const b = useBusinessId();
  const refresh = useRefreshLists();
  return useGuardedMutation({
    mutationFn: ({ id, status }: { id: string; status: ConversationStatus }) => assistantApi.setStatus(id, status),
    onSuccess: (conv) => {
      qc.setQueryData<ConversationDetail>(assistantKeys.conversation(b, conv.id), (old) => (old ? { ...old, ...conv } : old));
      refresh();
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  const b = useBusinessId();
  const refresh = useRefreshLists();
  return useGuardedMutation({
    mutationFn: (id: string) => assistantApi.remove(id),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: assistantKeys.conversation(b, id) });
      refresh();
    },
  });
}
