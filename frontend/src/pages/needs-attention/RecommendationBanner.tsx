import type { QueueRecommendation } from "@/types/attention";

/** the dark "Recommended action" banner under the queue; its text and link come from GET /issues/recommendation (hidden when null) */
export function RecommendationBanner({ recommendation, onAction }: { recommendation: QueueRecommendation; onAction: (href: string) => void }) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-[18px_20px] gap-4 sm:gap-6 bg-[#242D48] border border-[#384463] rounded-[14px] shadow-[0px_3px_10px_rgba(36,50,75,0.055)] mt-2">
      <div className="flex flex-col gap-1 flex-1">
        <span className="text-[12px] font-semibold leading-[145%] text-[#C8BDFF]">Recommended action</span>
        <p className="text-[12px] font-normal leading-[145%] text-white">{recommendation.text}</p>
      </div>
      <button
        type="button"
        onClick={() => onAction(recommendation.action.href)}
        className="w-full sm:w-auto h-10 sm:h-9 min-h-[44px] sm:min-h-0 px-4 rounded-[8px] bg-white border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-100 transition-colors flex items-center justify-center shrink-0 min-w-0 sm:min-w-[190px]"
      >
        {recommendation.action.label}
      </button>
    </div>
  );
}
