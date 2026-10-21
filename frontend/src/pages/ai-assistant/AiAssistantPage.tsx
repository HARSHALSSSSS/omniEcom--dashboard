import { useEffect, useState } from "react";
import { errorMessage } from "@/api/errors";
import { PageHeader } from "@/components/common/PageHeader";
import { NoAccess, NotEnabled, SwitchedOff } from "@/components/ai-assistant/AssistantGate";
import { blockReason, isFull, type BlockReason } from "@/components/ai-assistant/assistantFormat";
import { ChatPanel, type SendFailure } from "@/components/ai-assistant/ChatPanel";
import { ConversationList } from "@/components/ai-assistant/ConversationList";
import { InsightsPanel } from "@/components/ai-assistant/InsightsPanel";
import { LoadError, ListSkeleton } from "@/components/pricing/PricingStates";
import { useCan, useFeature } from "@/hooks/useCan";
import {
  useAssistantInsights,
  useAssistantSettings,
  useConversationDetail,
  useCreateConversation,
  useEnableAssistant,
  useSendMessage,
  useSetConversationStatus,
} from "@/hooks/useAssistant";
import { toast } from "@/hooks/useToast";

const HEADER = <PageHeader eyebrow="INTELLIGENCE" title="AI Assistant" description="Ask questions about your stock, sales, returns and profitability. Answers are built from your own data." />;

function Workspace({ onBlocked }: { onBlocked: (r: BlockReason) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [failure, setFailure] = useState<SendFailure | null>(null);

  const insights = useAssistantInsights(true);
  const detail = useConversationDetail(selectedId);
  const create = useCreateConversation();
  const send = useSendMessage();
  const setStatus = useSetConversationStatus();

  useEffect(() => {
    const r = blockReason(insights.error);
    if (r) onBlocked(r);
  }, [insights.error, onBlocked]);
  useEffect(() => {
    const r = blockReason(detail.error);
    if (r) onBlocked(r);
  }, [detail.error, onBlocked]);

  const conversation = detail.data;
  const archived = conversation?.status === "archived";
  const full = isFull(conversation);
  const lockedReason = archived
    ? "This conversation is archived. Restore it to continue."
    : full
      ? "This conversation has reached its message limit. Start a new one to keep asking."
      : null;
  const sending = pendingText !== null;

  const run = async (text: string, fromDraft: boolean) => {
    if (sending) return;
    setFailure(null);
    setPendingText(text);
    try {
      let id = selectedId;
      if (!id) {
        const created = await create.mutateAsync(undefined);
        id = created.id;
        setSelectedId(id);
      }
      await send.mutateAsync({ id, text });
      if (fromDraft) setDraft("");
    } catch (e) {
      const reason = blockReason(e);
      if (reason) onBlocked(reason);
      setFailure({ text, fromDraft, message: errorMessage(e) });
    } finally {
      setPendingText(null);
    }
  };

  const newConversation = () => {
    setSelectedId(null);
    setFailure(null);
  };

  const restore = () => {
    if (!conversation) return;
    setStatus.mutate(
      { id: conversation.id, status: "active" },
      {
        onSuccess: () => toast({ title: "Conversation restored", variant: "success" }),
        onError: (e) => toast({ title: "Could not restore the conversation", description: errorMessage(e), variant: "destructive" }),
      },
    );
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-h-[560px] flex-col lg:h-[calc(100vh-260px)]">
        <ChatPanel
          detail={selectedId ? conversation : undefined}
          selected={selectedId !== null}
          loading={selectedId !== null && detail.isLoading}
          error={selectedId !== null ? detail.error : null}
          onRetryLoad={() => void detail.refetch()}
          onNew={newConversation}
          pendingText={pendingText}
          failure={failure}
          onRetrySend={() => failure && void run(failure.text, failure.fromDraft)}
          onDismissFailure={() => setFailure(null)}
          draft={draft}
          onDraft={setDraft}
          onSend={() => void run(draft.trim(), true)}
          onAsk={(t) => void run(t, false)}
          lockedReason={lockedReason}
          onRestore={archived ? restore : null}
          restoring={setStatus.isPending}
        />
      </div>

      <div className="flex min-h-0 flex-col gap-5 lg:h-[calc(100vh-260px)]">
        <InsightsPanel
          insights={insights.data}
          loading={insights.isLoading}
          error={insights.error}
          onRetry={() => void insights.refetch()}
          onAsk={(t) => void run(t, false)}
          disabled={sending || !!lockedReason}
        />
        <ConversationList
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setFailure(null);
          }}
          onNew={newConversation}
          onGone={(id) => id === selectedId && newConversation()}
          disabled={sending}
        />
      </div>
    </div>
  );
}

export default function AiAssistantPage() {
  const canUse = useCan("ai:use");
  const flag = useFeature("ai.enabled");
  const [blocked, setBlocked] = useState<BlockReason | null>(null);
  const settings = useAssistantSettings(canUse && flag);
  const enable = useEnableAssistant();

  useEffect(() => {
    const r = blockReason(settings.error);
    if (r) setBlocked(r);
  }, [settings.error]);

  let body;
  if (!canUse) body = <NoAccess />;
  else if (!flag || blocked === "feature_disabled") body = <NotEnabled />;
  else if (settings.isLoading) body = <ListSkeleton label="Loading the AI Assistant" rows={4} />;
  else if (settings.isError && !blocked) body = <LoadError what="The AI Assistant" message={errorMessage(settings.error)} onRetry={() => void settings.refetch()} />;
  else if (blocked === "ai_disabled" || settings.data?.enabled === false) {
    body = (
      <SwitchedOff
        enabling={enable.isPending}
        onEnable={() =>
          enable.mutate(undefined, {
            onSuccess: () => setBlocked(null),
            onError: (e) => toast({ title: "Could not turn AI on", description: errorMessage(e), variant: "destructive" }),
          })
        }
      />
    );
  } else body = <Workspace onBlocked={setBlocked} />;

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      {HEADER}
      {body}
    </div>
  );
}
