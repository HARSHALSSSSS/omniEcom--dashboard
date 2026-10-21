import { Lightbulb } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { SEVERITY_CLASS } from "./assistantFormat";
import type { AssistantInsight } from "@/types/assistant";

interface InsightsPanelProps {
  insights: AssistantInsight[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onAsk: (prompt: string) => void;
  /** asking is off while an answer is on its way or the conversation cannot take more */
  disabled: boolean;
}

export function InsightsPanel({ insights, loading, error, onRetry, onAsk, disabled }: InsightsPanelProps) {
  return (
    <section aria-label="Proactive insights" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground">
          <Lightbulb className="h-3.5 w-3.5 text-amber-500" aria-hidden />
          Proactive insights
        </h2>
        {insights && <span className="text-[11px] text-muted-foreground">{insights.length}</span>}
      </div>

      {loading && (
        <div role="status" aria-label="Loading insights" className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {!loading && error != null && (
        <div role="alert" className="space-y-2 text-xs text-muted-foreground">
          <p>Insights could not be loaded. {errorMessage(error)}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}

      {!loading && error == null && insights && insights.length === 0 && (
        <p className="text-xs text-muted-foreground">Nothing needs a closer look right now. Insights appear here when your data shows a stock, price, channel or advertising issue.</p>
      )}

      {!loading && error == null && insights && insights.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {insights.map((ins) => (
            <li key={ins.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAsk(ins.suggestedPrompt)}
                aria-label={`Ask: ${ins.suggestedPrompt}`}
                className="flex w-full flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold leading-snug text-foreground">{ins.headline}</span>
                  <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize", SEVERITY_CLASS[ins.severity])}>{ins.severity}</span>
                </span>
                <span className="line-clamp-3 text-[11px] text-muted-foreground">{ins.summary}</span>
                {ins.metricImpact && <span className="text-[11px] font-medium text-emerald-700">{ins.metricImpact}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
