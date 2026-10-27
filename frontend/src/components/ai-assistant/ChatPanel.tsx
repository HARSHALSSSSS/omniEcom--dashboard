import { useEffect, useRef } from "react";
import { Bot, Sparkles } from "lucide-react";
import { errorMessage, isApiError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Composer } from "./Composer";
import { MessageBubble } from "./MessageBubble";
import type { AssistantMessage, ConversationDetail } from "@/types/assistant";

/** questions the assistant is built to answer (stock, sales, returns, profit, issues) */
const STARTERS = [
  "Which products are likely to run out this week?",
  "How are my sales doing this month?",
  "What is stuck in operations?",
];

export interface SendFailure {
  text: string;
  fromDraft: boolean;
  message: string;
}

interface ChatPanelProps {
  detail: ConversationDetail | undefined;
  selected: boolean;
  loading: boolean;
  error: unknown;
  onRetryLoad: () => void;
  onNew: () => void;
  /** the question on its way, shown under the thread until the server answers */
  pendingText: string | null;
  failure: SendFailure | null;
  onRetrySend: () => void;
  onDismissFailure: () => void;
  draft: string;
  onDraft: (v: string) => void;
  onSend: () => void;
  onAsk: (text: string) => void;
  lockedReason: string | null;
  onRestore: (() => void) | null;
  restoring: boolean;
  breadcrumb?: string;
  /** the period and the business settings the figures are in, e.g. "2026-09-27 to 2026-10-27 · INR · Asia/Kolkata" */
  contextNote?: string;
  onBack?: () => void;
  followUps?: string[];
}

export function ChatPanel(p: ChatPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const messages: AssistantMessage[] = p.detail?.messages ?? [];
  const count = messages.length;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [count, p.pendingText, p.failure]);

  const notFound = isApiError(p.error) && p.error.status === 404;
  const empty = !p.loading && p.error == null && count === 0 && p.pendingText === null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Top Breadcrumb Context bar if active */}
      {p.breadcrumb && (
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-2 text-xs">
          <div className="flex items-center gap-2">
            {p.onBack && (
              <button
                type="button"
                onClick={p.onBack}
                className="font-medium text-muted-foreground hover:text-foreground"
              >
                ← Back
              </button>
            )}
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground">{p.breadcrumb}</span>
          </div>
          {p.contextNote && <span className="text-[11px] text-muted-foreground">{p.contextNote}</span>}
        </div>
      )}

      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black text-white" aria-hidden>
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-foreground">{p.detail?.title ?? "New conversation"}</h2>
              <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-semibold text-muted-foreground">
                Review only
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">Advisory assistant: answers from your orders, stock, returns and pricing data</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {p.onRestore && (
            <Button size="sm" variant="outline" loading={p.restoring} onClick={p.onRestore}>
              Restore conversation
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs" onClick={p.onNew}>
            + New conversation
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-muted/20 p-5" aria-live="polite" aria-busy={p.pendingText !== null}>
        {p.loading && (
          <div role="status" aria-label="Loading conversation" className="space-y-3">
            <Skeleton className="h-16 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
            <Skeleton className="h-24 w-3/4" />
          </div>
        )}

        {p.error != null && (
          <div role="alert" className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm font-semibold text-foreground">{notFound ? "This conversation no longer exists." : "The conversation could not be loaded."}</p>
            {!notFound && <p className="max-w-md text-xs text-muted-foreground">{errorMessage(p.error)}</p>}
            {notFound ? (
              <Button size="sm" variant="outline" onClick={p.onNew}>
                Start a new conversation
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={p.onRetryLoad}>
                Retry
              </Button>
            )}
          </div>
        )}

        {empty && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Bot className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold text-foreground">{p.selected ? "No messages yet" : "Ask the assistant"}</p>
            <p className="max-w-md text-xs text-muted-foreground">Ask in plain language, or pick a question to start.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <Button key={s} size="sm" variant="outline" className="h-auto py-1.5 text-xs" disabled={!!p.lockedReason} onClick={() => p.onAsk(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {p.pendingText !== null && (
          <>
            <div className="ml-auto flex max-w-[88%] flex-col items-end gap-1">
              <div className="rounded-xl bg-black p-4 text-[13px] leading-relaxed text-white opacity-70">
                <p className="whitespace-pre-wrap break-words">{p.pendingText}</p>
              </div>
              <span className="px-1 text-[11px] text-muted-foreground">Sending</span>
            </div>
            <div role="status" className="mr-auto flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
              <span className="h-2 w-2 animate-ping rounded-full bg-foreground" aria-hidden />
              Looking through your data
            </div>
          </>
        )}

        {p.failure && (
          <div role="alert" className="mx-auto flex max-w-[88%] flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <p className="font-semibold text-destructive">Your message was not sent.</p>
            <p className="text-muted-foreground">{p.failure.message}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={p.onRetrySend}>
                Try again
              </Button>
              <Button size="sm" variant="ghost" onClick={p.onDismissFailure}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {messages.length > 0 && (
          <div className="space-y-2 pt-2">
            <span className="text-[11px] font-medium text-muted-foreground">Suggested follow-up questions</span>
            <div className="flex flex-wrap gap-2">
              {(p.followUps || [
                "Check incoming stock and expected arrival dates",
                "Compare sales against previous month",
                "Draft replenishment purchase order",
              ]).map((fu) => (
                <button
                  key={fu}
                  type="button"
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground hover:bg-muted"
                  onClick={() => p.onAsk(fu)}
                >
                  {fu}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="pt-2 text-center text-[10px] text-muted-foreground">
          Answers are built from your own records. Check the source records before acting on them. Nothing is changed by asking.
        </p>

        <div ref={endRef} />
      </div>

      <Composer value={p.draft} onChange={p.onDraft} onSend={p.onSend} sending={p.pendingText !== null} lockedReason={p.lockedReason} />
    </div>
  );
}
