import { ArrowRight } from "lucide-react";

interface WhatIsAtRiskBarProps {
  productsAtRisk: number;
  ordersAtRisk: number;
  listingsBlocked: number;
  onReviewAffected?: () => void;
}

export function WhatIsAtRiskBar({
  productsAtRisk,
  ordersAtRisk,
  listingsBlocked,
  onReviewAffected,
}: WhatIsAtRiskBarProps) {
  const hasRisk = productsAtRisk > 0 || ordersAtRisk > 0 || listingsBlocked > 0;

  return (
    <div className="rounded-2xl border border-[#E5E5E5] bg-[#FFFFFF] p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
          What is at risk
        </span>
        {hasRisk && onReviewAffected && (
          <button
            type="button"
            onClick={onReviewAffected}
            className="text-[12px] font-semibold text-[#111111] hover:underline flex items-center gap-1"
          >
            Review affected items <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-1">
        {/* Metric 1 */}
        <div className="flex items-baseline gap-3">
          <span className={`text-[36px] font-bold tracking-tight ${productsAtRisk > 0 ? "text-[#C2410C]" : "text-[#111111]"}`}>
            {productsAtRisk}
          </span>
          <span className="text-[12px] text-[#525252] leading-snug">
            listings whose stock change is still waiting to reach the marketplace
          </span>
        </div>

        {/* Metric 2 */}
        <div className="flex items-baseline gap-3 border-t md:border-t-0 md:border-l border-[#F0F0F0] pt-4 md:pt-0 md:pl-6">
          <span className={`text-[36px] font-bold tracking-tight ${ordersAtRisk > 0 ? "text-[#C2410C]" : "text-[#111111]"}`}>
            {ordersAtRisk}
          </span>
          <span className="text-[12px] text-[#525252] leading-snug">
            open orders on connections that need attention
          </span>
        </div>

        {/* Metric 3 */}
        <div className="flex items-baseline gap-3 border-t md:border-t-0 md:border-l border-[#F0F0F0] pt-4 md:pt-0 md:pl-6">
          <span className="text-[36px] font-bold tracking-tight text-[#111111]">
            {listingsBlocked}
          </span>
          <span className="text-[12px] text-[#525252] leading-snug">
            listings the marketplace rejected or wants corrected
          </span>
        </div>
      </div>
    </div>
  );
}
