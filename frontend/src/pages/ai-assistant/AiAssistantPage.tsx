import { useEffect, useState } from "react";
import { errorMessage } from "@/api/errors";
import { PageHeader } from "@/components/common/PageHeader";
import { NoAccess, NotEnabled, SwitchedOff } from "@/components/ai-assistant/AssistantGate";
import { SOURCE_LABELS, blockReason, isFull, type BlockReason } from "@/components/ai-assistant/assistantFormat";
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

import { useSearchParams } from "react-router-dom";
import { ProductContextRail } from "@/components/ai-assistant/ProductContextRail";
import { ConversationHistoryView } from "@/components/ai-assistant/ConversationHistoryView";
import { useConversationList } from "@/hooks/useAssistant";
import { useIntelBySku } from "@/hooks/useProductIntelligence";
import { dateKeyInZone } from "@/components/reports/overviewRange";
import { useWorkspaceStore } from "@/store/workspace.store";
import { CONTEXT_SOURCES, type ContextSource } from "@/types/assistant";
import { cn } from "@/utils/cn";

function Workspace({ onBlocked }: { onBlocked: (r: BlockReason) => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "history" ? "history" : "current";
  const skuParam = searchParams.get("sku");
  const productParam = searchParams.get("product");
  const sourceParam = searchParams.get("source");
  const shell = useWorkspaceStore((s) => s.shell);
  const timezone = shell?.business.timezone ?? "Asia/Kolkata";
  const currency = shell?.business.currency ?? "INR";
  const [historySource, setHistorySource] = useState<ContextSource | "all">("all");

  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("id"));
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [failure, setFailure] = useState<SendFailure | null>(null);
  const [activeRightTab, setActiveRightTab] = useState<"product" | "insights">(skuParam ? "product" : "insights");

  const insights = useAssistantInsights(true);
  // the one source of the history: the Conversation history tab reads it, nothing else fetches it
  const conversationsList = useConversationList({ status: "active", q: "", source: historySource === "all" ? undefined : historySource }, activeTab === "history");
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
  // the rail follows the link's product, or the product the open conversation started from
  const railSku = skuParam ?? conversation?.context?.sku ?? undefined;
  const skuLookup = useIntelBySku(railSku, Boolean(railSku));
  const skuItem = railSku ? (skuLookup.data ? (skuLookup.data.items[0] ?? null) : undefined) : undefined;
  const today = dateKeyInZone(new Date(), timezone);
  const periodFrom = dateKeyInZone(new Date(Date.now() - 29 * 86_400_000), timezone);
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
        // a chat opened from a product remembers the product and the screen it started on
        const source: ContextSource = (CONTEXT_SOURCES as readonly string[]).includes(sourceParam ?? "") ? (sourceParam as ContextSource) : "product_intelligence";
        const created = await create.mutateAsync(skuParam ? { context: { sku: skuParam, source } } : undefined);
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

  const openConversationFromHistory = (id: string) => {
    setSelectedId(id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "current");
      next.set("id", id);
      return next;
    });
  };

  const setTab = (t: "current" | "history") => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", t);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top Tab Switcher */}
      <div className="flex items-center justify-between">
        <div role="tablist" aria-label="AI Assistant Views" className="inline-flex w-full sm:w-auto items-center gap-1 rounded-lg border border-border bg-muted p-1">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "current"}
            onClick={() => setTab("current")}
            className={cn(
              "flex-1 sm:flex-initial text-center justify-center min-h-[36px] sm:min-h-0 rounded-md px-3.5 py-1.5 text-xs font-medium transition-all",
              activeTab === "current"
                ? "bg-background font-semibold text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Current conversation
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "history"}
            onClick={() => setTab("history")}
            className={cn(
              "flex-1 sm:flex-initial text-center justify-center min-h-[36px] sm:min-h-0 rounded-md px-3.5 py-1.5 text-xs font-medium transition-all",
              activeTab === "history"
                ? "bg-background font-semibold text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Conversation history
          </button>
        </div>
      </div>

      {activeTab === "history" ? (
        <ConversationHistoryView
          conversations={conversationsList.data?.pages.flatMap((p) => p.items) ?? []}
          loading={conversationsList.isLoading}
          error={conversationsList.error}
          onRetry={() => void conversationsList.refetch()}
          hasMore={Boolean(conversationsList.hasNextPage)}
          loadingMore={conversationsList.isFetchingNextPage}
          onLoadMore={() => void conversationsList.fetchNextPage()}
          source={historySource}
          onSourceChange={setHistorySource}
          timezone={timezone}
          onOpenConversation={openConversationFromHistory}
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-h-[480px] sm:min-h-[560px] flex-col lg:h-[calc(100vh-300px)]">
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
              breadcrumb={
                railSku
                  ? `${conversation?.context?.source && !skuParam ? SOURCE_LABELS[conversation.context.source] : "Product Intelligence"} / ${skuItem?.productName ?? productParam ?? railSku}`
                  : undefined
              }
              contextNote={railSku ? `${periodFrom} to ${today} · ${currency} · ${timezone}` : undefined}
              onBack={() => newConversation()}
            />
          </div>

          <div className="flex min-h-0 flex-col gap-4 lg:h-[calc(100vh-300px)]">
            {/* Side Rail Tabs if in active conversation with a product context */}
            {selectedId || railSku ? (
              <div className="flex flex-col h-full rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex border-b border-border bg-muted/20 p-1">
                  <button
                    type="button"
                    onClick={() => setActiveRightTab("product")}
                    className={cn(
                      "flex-1 rounded py-1 min-h-[36px] sm:min-h-0 text-xs font-medium transition-colors",
                      activeRightTab === "product"
                        ? "bg-card font-semibold text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Product Context
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveRightTab("insights")}
                    className={cn(
                      "flex-1 rounded py-1 min-h-[36px] sm:min-h-0 text-xs font-medium transition-colors",
                      activeRightTab === "insights"
                        ? "bg-card font-semibold text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Insights & List
                  </button>
                </div>

                {activeRightTab === "product" ? (
                  <ProductContextRail
                    className="border-0 w-full"
                    sku={railSku}
                    item={skuItem}
                    loading={skuLookup.isLoading}
                    error={skuLookup.isError ? errorMessage(skuLookup.error) : null}
                    onRetry={() => void skuLookup.refetch()}
                  />
                ) : (
                  <div className="flex flex-col gap-4 p-3 overflow-y-auto">
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
                )}
              </div>
            ) : (
              <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
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
            )}
          </div>
        </div>
      )}
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
