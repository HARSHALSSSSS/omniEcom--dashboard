import { Link } from "react-router-dom";
import { AlertCircle, Clock, ListFilter, RefreshCw, Sparkles } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { toAppPath } from "@/lib/links";
import type { DashboardAttentionItem, DashboardRecommendation } from "@/types/dashboard";

interface AttentionAndDecisionProps {
  /** undefined: the caller may not read issues, so the card is not rendered */
  items?: DashboardAttentionItem[];
  /** undefined / null: nothing to recommend, or not allowed: the card is not rendered */
  recommendation?: DashboardRecommendation | null;
  dismissing?: boolean;
  dismissError?: string | null;
  onDismissRecommendation?: (id: string) => void;
}

const ICON_CLASS = "h-4 w-4 text-[#666666]";

function iconFor(issueKey: string) {
  switch (issueKey) {
    case "orders_at_risk":
      return <Clock className={ICON_CLASS} aria-hidden="true" />;
    case "listing_issue":
      return <ListFilter className={ICON_CLASS} aria-hidden="true" />;
    case "sync_issue":
      return <RefreshCw className={ICON_CLASS} aria-hidden="true" />;
    default:
      return <AlertCircle className={ICON_CLASS} aria-hidden="true" />;
  }
}

const AMBER_KEYS = new Set(["low_stock", "sync_issue"]);

export const AttentionAndDecision: React.FC<AttentionAndDecisionProps> = ({
  items,
  recommendation,
  dismissing = false,
  dismissError,
  onDismissRecommendation,
}) => {
  if (!items && !recommendation) return null;

  return (
    <div className="flex flex-col lg:flex-row items-stretch gap-6 w-full">
      {items && (
        <section
          aria-labelledby="attention-title"
          className="flex-1 min-w-0 bg-white border border-[#EAEAEA] rounded-[12px] px-6 pt-5 pb-2 flex flex-col justify-between"
        >
          <div className="flex flex-col gap-1 pb-4">
            <h2 id="attention-title" className="text-[18px] font-semibold text-[#000000] leading-[145%]">
              Needs attention
            </h2>
            <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
              Issues that may affect orders, inventory or sales.
            </p>
          </div>

          {items.length === 0 ? (
            <p className="border-t border-[#EAEAEA] py-6 text-[13px] text-[#666666] leading-[145%]">
              Nothing needs your attention right now.
            </p>
          ) : (
            <ul className="flex flex-col">
              {items.map((item) => (
                <li
                  key={item.issueKey}
                  className="flex items-center justify-between h-[66px] border-t border-[#EAEAEA] gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-[#F5F5F5]">
                      {iconFor(item.issueKey)}
                    </div>
                    <div className="flex flex-col gap-[3px] min-w-0">
                      <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">{item.title}</span>
                      <span className="text-[12px] font-normal text-[#666666] leading-[145%] truncate">
                        {item.summary}
                      </span>
                    </div>
                  </div>
                  <Link
                    to={toAppPath(item.action.href)}
                    className={`text-[12px] font-medium hover:underline shrink-0 leading-[145%] ${
                      AMBER_KEYS.has(item.issueKey) ? "text-[#F59E0B]" : "text-[#1D4ED8]"
                    }`}
                  >
                    {item.action.label} →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {recommendation && (
        <section
          aria-labelledby="recommendation-title"
          style={{ background: "linear-gradient(107.52deg, #E4A0FF 0.96%, #2563EB 121.91%)" }}
          className={`w-full ${items ? "lg:w-[368px]" : ""} rounded-[12px] p-6 flex flex-col justify-between shrink-0`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-normal text-white">Recommended action</span>
            <Sparkles className="h-[22px] w-[22px] text-white" aria-hidden="true" />
          </div>

          <div className="flex flex-col gap-3 my-3">
            <h3 id="recommendation-title" className="text-[22px] font-semibold text-[#000000] leading-[135%]">
              {recommendation.title}
            </h3>
            <p className="text-[13px] font-normal text-white leading-[145%]">{recommendation.rationale}</p>
          </div>

          <div className="flex flex-col gap-5 pt-1">
            {dismissError && (
              <p role="alert" className="text-[12px] font-medium text-white leading-[145%]">
                {dismissError}
              </p>
            )}
            <Link
              to={ROUTES.RECOMMENDATIONS}
              className="flex h-10 w-full items-center justify-center rounded-[8px] bg-[#000000] text-[12px] font-semibold text-white hover:bg-neutral-800 transition-colors"
            >
              Review recommendation
            </Link>
            <button
              type="button"
              disabled={dismissing}
              onClick={() => onDismissRecommendation?.(recommendation.id)}
              className="flex h-10 w-full items-center justify-center rounded-[8px] bg-white text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors disabled:opacity-60"
            >
              {dismissing ? "Dismissing…" : "Dismiss"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
