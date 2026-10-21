import { Link } from "react-router-dom";
import { Lightbulb } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { errorMessage } from "@/api/errors";
import { toAppPath } from "@/lib/links";
import { useInsightDecision, useInsightList } from "@/hooks/useProductEdit";
import type { EditorView, Insight, InsightKey } from "@/types/productEdit";

interface Props {
  productId: string;
  editor: EditorView;
  canWrite: boolean;
  /** "Review suggestion" of the description insight opens the AI panel in benefits mode */
  onReviewSuggestion: () => void;
}

const DISMISSED_LABEL: Record<InsightKey, string> = {
  description_short: "Description is shorter than the category average",
  few_images: "Add more product images",
};

/** Suggested improvements with Dismiss / Restore (dismissals are remembered by the server) */
export function InsightsPanel({ productId, editor, canWrite, onReviewSuggestion }: Props) {
  const list = useInsightList(productId);
  const decide = useInsightDecision(productId);
  const items: Insight[] = list.data?.items ?? editor.insights;
  const dismissed = list.data?.dismissed ?? editor.dismissedInsights.map((d) => ({ key: d.key, message: DISMISSED_LABEL[d.key], dismissedAt: d.dismissedAt, until: d.until }));
  if (items.length === 0 && dismissed.length === 0) return null;

  return (
    <section aria-labelledby="suggested-improvement" className="space-y-3 rounded-xl border border-border bg-card p-5 text-xs shadow-xs">
      <h2 id="suggested-improvement" className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Lightbulb className="h-4 w-4 text-amber-600" aria-hidden="true" />
        Suggested improvement
      </h2>
      {decide.isError && (
        <p role="alert" className="font-medium text-destructive">
          {errorMessage(decide.error)}
        </p>
      )}
      {items.map((insight) => (
        <div key={insight.key} className="space-y-2" data-insight={insight.key}>
          <p className="text-foreground">
            {insight.message} {insight.detail}
          </p>
          <div className="flex flex-wrap gap-2">
            {insight.actions
              .filter((a) => a.key !== "dismiss")
              .map((a) =>
                a.key === "review_suggestion" ? (
                  <Button key={a.key} type="button" size="sm" variant="outline" disabled={!canWrite} onClick={onReviewSuggestion}>
                    {a.label}
                  </Button>
                ) : (
                  <Link key={a.key} to={toAppPath(a.href)} className={buttonVariants({ size: "sm", variant: "outline" })}>
                    {a.label}
                  </Link>
                ),
              )}
            {canWrite && (
              <Button type="button" size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate({ key: insight.key, action: "dismiss" })}>
                Dismiss
              </Button>
            )}
          </div>
        </div>
      ))}
      {dismissed.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-2" aria-label="Dismissed suggestions">
          {dismissed.map((d) => (
            <li key={d.key} className="flex items-center justify-between gap-2 text-muted-foreground">
              <span>{DISMISSED_LABEL[d.key]} (dismissed)</span>
              {canWrite && (
                <button type="button" className="font-medium text-primary hover:underline" disabled={decide.isPending} onClick={() => decide.mutate({ key: d.key, action: "restore" })}>
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
