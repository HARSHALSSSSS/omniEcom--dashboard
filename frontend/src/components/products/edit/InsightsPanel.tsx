import { Link } from "react-router-dom";
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
    <section aria-labelledby="suggested-improvement" className="flex flex-col gap-2 w-full">
      <h2 id="suggested-improvement" className="text-[12px] font-semibold text-[#000000] leading-[145%]">
        Suggested improvement
      </h2>
      {decide.isError && (
        <p role="alert" className="text-[11px] font-medium text-[#B42318]">
          {errorMessage(decide.error)}
        </p>
      )}
      {items.map((insight) => (
        <div key={insight.key} className="flex flex-col gap-2" data-insight={insight.key}>
          <p className="text-[12px] font-normal text-[#000000] leading-[145%]">{insight.message}</p>
          {insight.detail && <p className="text-[11px] font-normal text-[#666666] leading-[145%]">{insight.detail}</p>}
          <div className="flex flex-row flex-wrap items-center gap-4 pt-1">
            {insight.actions
              .filter((a) => a.key !== "dismiss")
              .map((a) =>
                a.key === "review_suggestion" ? (
                  <button key={a.key} type="button" disabled={!canWrite} onClick={onReviewSuggestion} className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline">
                    {a.label}
                  </button>
                ) : (
                  <Link key={a.key} to={toAppPath(a.href)} className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer">
                    {a.label}
                  </Link>
                ),
              )}
            {canWrite && (
              <button type="button" disabled={decide.isPending} onClick={() => decide.mutate({ key: insight.key, action: "dismiss" })} className="text-[12px] font-normal text-[#666666] hover:text-[#000000] cursor-pointer disabled:opacity-50">
                Dismiss
              </button>
            )}
          </div>
        </div>
      ))}
      {dismissed.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-[#EAEAEA] pt-2" aria-label="Dismissed suggestions">
          {dismissed.map((d) => (
            <li key={d.key} className="flex items-center justify-between gap-2 text-[11px] text-[#666666]">
              <span>{DISMISSED_LABEL[d.key]} (dismissed)</span>
              {canWrite && (
                <button type="button" className="font-semibold text-[#000000] hover:underline cursor-pointer" disabled={decide.isPending} onClick={() => decide.mutate({ key: d.key, action: "restore" })}>
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
