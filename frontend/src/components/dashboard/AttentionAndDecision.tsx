
import { Link } from "react-router-dom";
import { Package, Clock, ListFilter, RefreshCw, Sparkles } from "lucide-react";
import type { NeedsAttentionItem } from "@/types/dashboard";

interface AttentionAndDecisionProps {
  items: NeedsAttentionItem[];
  onReviewRecommendation?: () => void;
  onDismissRecommendation?: () => void;
}

export const AttentionAndDecision: React.FC<AttentionAndDecisionProps> = ({
  items,
  onReviewRecommendation,
  onDismissRecommendation,
}) => {
  const getIcon = (type: NeedsAttentionItem["type"]) => {
    switch (type) {
      case "low_stock":
        return <Package className="h-4 w-4 text-[#D97706]" />;
      case "orders_at_risk":
        return <Clock className="h-4 w-4 text-[#1D4ED8]" />;
      case "listing_issue":
        return <ListFilter className="h-4 w-4 text-[#1D4ED8]" />;
      case "sync_issue":
        return <RefreshCw className="h-4 w-4 text-[#D97706]" />;
      default:
        return <Package className="h-4 w-4 text-[#666666]" />;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row items-stretch gap-6 w-full">
      {/* Needs Attention Left Card */}
      <div className="flex-1 lg:w-[744px] bg-white border border-[#EAEAEA] rounded-xl p-6 flex flex-col justify-between">
        {/* Section Introduction */}
        <div className="flex flex-col gap-1 pb-3 border-b border-[#EAEAEA]">
          <h2 className="text-[18px] font-semibold text-[#000000] leading-[26px]">
            Needs attention
          </h2>
          <p className="text-[12px] text-[#666666]">
            Issues that may affect orders, inventory or sales.
          </p>
        </div>

        {/* Priority Rows */}
        <div className="divide-y divide-[#EAEAEA] flex-1 flex flex-col justify-around">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between py-3 gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100/80">
                  {getIcon(item.type)}
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold text-[#000000]">
                    {item.title}
                  </span>
                  <span className="text-[12px] text-[#666666]">
                    {item.description}
                  </span>
                </div>
              </div>
              <Link
                to={item.actionHref}
                className={
                  item.type === "low_stock" || item.type === "sync_issue"
                    ? "text-[12px] font-medium text-[#D97706] hover:underline shrink-0"
                    : "text-[12px] font-medium text-[#1D4ED8] hover:underline shrink-0"
                }
              >
                {item.actionText}
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Action Right Card */}
      <div
        style={{
          background:
            "linear-gradient(107.52deg, rgba(228, 160, 255, 0.49) 0.96%, rgba(37, 99, 235, 0.49) 121.91%)",
        }}
        className="w-full lg:w-[368px] rounded-xl p-6 flex flex-col justify-between shrink-0 shadow-xs"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium tracking-wider uppercase text-[#707070]">
            Recommended action
          </span>
          <Sparkles className="h-4 w-4 text-[#4A4A4A]" />
        </div>

        {/* Rationale Content */}
        <div className="flex flex-col gap-3 my-4">
          <h3 className="text-[22px] font-semibold text-[#000000] leading-[135%]">
            18 products are approaching their stock threshold.
          </h3>
          <p className="text-[13px] text-[#333333] leading-[145%]">
            Based on recent sales velocity, replenishing 6 products this week
            could reduce potential stockouts.
          </p>
        </div>

        {/* Decision Actions */}
        <div className="flex flex-col gap-2.5 pt-2">
          <button
            type="button"
            onClick={onReviewRecommendation}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-[#000000] text-[12px] font-semibold text-white hover:bg-neutral-800 transition-colors shadow-2xs"
          >
            Review recommendation
          </button>
          <button
            type="button"
            onClick={onDismissRecommendation}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-white text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors shadow-2xs"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
