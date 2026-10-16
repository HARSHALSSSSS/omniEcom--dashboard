
import { Link } from "react-router-dom";
import { AlertCircle, Clock, ListFilter, RefreshCw, Sparkles } from "lucide-react";
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
        return <AlertCircle className="h-4 w-4 text-[#666666]" />;
      case "orders_at_risk":
        return <Clock className="h-4 w-4 text-[#666666]" />;
      case "listing_issue":
        return <ListFilter className="h-4 w-4 text-[#666666]" />;
      case "sync_issue":
        return <RefreshCw className="h-4 w-4 text-[#666666]" />;
      default:
        return <AlertCircle className="h-4 w-4 text-[#666666]" />;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row items-stretch gap-6 w-full">
      {/* Needs Attention Left Card */}
      <div className="flex-1 bg-white border border-[#EAEAEA] rounded-[12px] px-6 pt-5 pb-2 flex flex-col justify-between">
        {/* Section Introduction */}
        <div className="flex flex-col gap-1 pb-4">
          <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">
            Needs attention
          </h2>
          <p className="text-[13px] font-normal text-[#666666] leading-[145%]">
            Issues that may affect orders, inventory or sales.
          </p>
        </div>

        {/* Priority Rows */}
        <div className="flex flex-col">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between h-[66px] border-t border-[#EAEAEA] gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-[#F5F5F5]">
                  {getIcon(item.type)}
                </div>
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">
                    {item.title}
                  </span>
                  <span className="text-[12px] font-normal text-[#666666] leading-[145%]">
                    {item.description}
                  </span>
                </div>
              </div>
              <Link
                to={item.actionHref}
                className={
                  item.type === "low_stock" || item.type === "sync_issue"
                    ? "text-[12px] font-medium text-[#F59E0B] hover:underline shrink-0 leading-[145%]"
                    : "text-[12px] font-medium text-[#1D4ED8] hover:underline shrink-0 leading-[145%]"
                }
              >
                {item.actionText}
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Action Right Card: width 368px */}
      <div
        style={{
          background: "linear-gradient(107.52deg, #E4A0FF 0.96%, #2563EB 121.91%)",
        }}
        className="w-full lg:w-[368px] rounded-[12px] p-6 flex flex-col justify-between shrink-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-normal text-white">
            Recommended action
          </span>
          <Sparkles className="h-[22px] w-[22px] text-white" />
        </div>

        {/* Rationale Content */}
        <div className="flex flex-col gap-3 my-3">
          <h3 className="text-[22px] font-semibold text-[#000000] leading-[135%]">
            18 products are approaching their stock threshold.
          </h3>
          <p className="text-[13px] font-normal text-white leading-[145%]">
            Based on recent sales velocity, replenishing 6 products this week
            could reduce potential stockouts.
          </p>
        </div>

        {/* Decision Actions */}
        <div className="flex flex-col gap-5 pt-1">
          <button
            type="button"
            onClick={onReviewRecommendation}
            className="flex h-10 w-full items-center justify-center rounded-[8px] bg-[#000000] text-[12px] font-semibold text-white hover:bg-neutral-800 transition-colors"
          >
            Review recommendation
          </button>
          <button
            type="button"
            onClick={onDismissRecommendation}
            className="flex h-10 w-full items-center justify-center rounded-[8px] bg-white text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

