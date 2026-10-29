import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Bot, User } from "lucide-react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { ACTION_CONFIRM, actionTarget, formatMessageTime, safeTarget } from "./assistantFormat";
import { Markdown } from "./Markdown";
import type { AssistantMessage, DataVisual, SuggestedAction } from "@/types/assistant";

const VISUAL_TONE: Record<DataVisual["type"], string> = {
  kpi: "border-border",
  table: "border-border",
  warning: "border-amber-300 bg-amber-50/50",
};

function Visual({ visual }: { visual: DataVisual }) {
  return (
    <section aria-label={visual.title} className={cn("rounded-lg border bg-card p-3.5", VISUAL_TONE[visual.type])}>
      <h3 className="mb-2 text-xs font-semibold text-foreground">{visual.title}</h3>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visual.details.map((d, i) => (
          <div key={`${d.label}-${i}`} className="rounded border border-border bg-muted/40 p-2">
            <dt className="text-[11px] text-muted-foreground">{d.label}</dt>
            <dd className="text-[13px] font-semibold text-foreground">{d.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Actions({ message }: { message: AssistantMessage }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState<SuggestedAction | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const actions = message.suggestedActions.filter((a) => !dismissed.includes(a.label));
  if (actions.length === 0) return null;

  const confirm = () => {
    if (!pending) return;
    if (pending.actionType === "dismiss") setDismissed((d) => [...d, pending.label]);
    else {
      const to = actionTarget(pending);
      if (to) navigate(to);
    }
    setPending(null);
  };

  const cls = cn(buttonVariants({ variant: "outline", size: "sm" }), "h-auto min-h-[36px] sm:min-h-0 gap-1.5 py-1.5 text-xs text-left whitespace-normal");
  const meta = pending ? ACTION_CONFIRM[pending.actionType] : ACTION_CONFIRM.navigate;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {actions.map((a) => {
        const plain = a.actionType === "navigate" ? safeTarget(a.targetUrl) : null;
        if (plain) {
          return (
            <Link key={a.label} to={plain} className={cls}>
              {a.label}
              <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
            </Link>
          );
        }
        const usable = a.actionType === "dismiss" || actionTarget(a) !== null;
        return (
          <button key={a.label} type="button" disabled={!usable} className={cls} onClick={() => setPending(a)}>
            {a.label}
            <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
          </button>
        );
      })}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={meta.title}
        description={pending ? `${pending.label}. ${pending.actionType === "dismiss" ? "It is only hidden from this conversation." : "Nothing is changed until you confirm the next step on that page."}` : ""}
        confirmText={meta.confirm}
        onConfirm={confirm}
      />
    </div>
  );
}

export function MessageBubble({ message }: { message: AssistantMessage }) {
  const bot = message.role === "assistant";
  return (
    <article aria-label={bot ? "Assistant message" : "Your message"} className={cn("flex max-w-[95%] sm:max-w-[88%] gap-2 sm:gap-3", bot ? "mr-auto" : "ml-auto flex-row-reverse")}>
      <div className={cn("flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full text-white", bot ? "bg-black" : "bg-blue-600")} aria-hidden>
        {bot ? <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className={cn("rounded-xl p-3 sm:p-4 text-[13px] leading-relaxed break-words overflow-hidden", bot ? "border border-border bg-card text-foreground" : "bg-black text-white")}>
          {bot ? <Markdown text={message.content} /> : <p className="whitespace-pre-wrap break-words">{message.content}</p>}
        </div>
        {bot && message.dataVisual && <Visual visual={message.dataVisual} />}
        {bot && <Actions message={message} />}
        <div className={cn("flex flex-wrap items-center gap-2 px-1 text-[11px] text-muted-foreground", !bot && "justify-end")}>
          <time dateTime={message.timestamp}>{formatMessageTime(message.timestamp)}</time>
          {bot && message.confidence === "none" && <span>No matching data</span>}
          {bot && message.sources.length > 0 && <span>Source: {message.sources.join(", ")}</span>}
          {bot && (
            <div className="ml-auto flex items-center gap-1 opacity-70 hover:opacity-100">
              <button
                type="button"
                className="min-h-[32px] sm:min-h-0 rounded p-1 hover:bg-muted"
                title="Copy response"
                onClick={() => navigator.clipboard.writeText(message.content)}
              >
                <span className="text-[10px]">Copy</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
