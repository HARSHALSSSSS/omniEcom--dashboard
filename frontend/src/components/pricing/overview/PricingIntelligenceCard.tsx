import { useState } from "react";
import { TrendingUp, ArrowRight } from "lucide-react";

interface PricingIntelligenceCardProps {
  belowTargetCount?: number;
  onReviewProposals: () => void;
}

export function PricingIntelligenceCard({
  belowTargetCount = 2,
  onReviewProposals,
}: PricingIntelligenceCardProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm flex flex-col justify-between h-full text-xs text-muted-foreground">
        <p>Recommendation dismissed.</p>
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="text-foreground underline font-semibold mt-2 text-left cursor-pointer"
        >
          Undo
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-6 shadow-sm flex flex-col justify-between h-full space-y-4 text-white"
      style={{
        background: "linear-gradient(135deg, #CF7CFE 0%, #877CF8 50%, #4577F8 100%)",
      }}
    >
      <div className="space-y-3">
        {/* Top Eyebrow with Trending Icon */}
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-white/90">
          <span>RECOMMENDED ACTION</span>
          <TrendingUp className="h-5 w-5 text-white" aria-hidden="true" />
        </div>

        {/* Headline in bold black */}
        <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-black leading-snug">
          {belowTargetCount} channel prices fall below the 30% margin target.
        </h3>

        {/* Description body */}
        <p className="text-xs sm:text-[13px] text-white/95 leading-relaxed font-normal">
          Example channel fees reduce contribution on the T-Shirt and Storage Set. Review cost
          assumptions and proposed prices before making a decision.
        </p>
      </div>

      {/* Buttons */}
      <div className="space-y-2 pt-2">
        <button
          type="button"
          onClick={onReviewProposals}
          className="w-full bg-black hover:bg-neutral-900 text-white font-semibold text-xs sm:text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
        >
          <span>Review price proposals</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="w-full bg-white hover:bg-white/90 text-black font-semibold text-xs sm:text-sm py-2.5 px-4 rounded-xl flex items-center justify-center transition-colors cursor-pointer shadow-sm"
        >
          Dismiss
        </button>
      </div>

      {/* Advisory footnote */}
      <p className="text-[11px] text-white/80 pt-2 border-t border-white/20">
        Advisory only · Your review and approval are required. No automatic price changes.
      </p>
    </div>
  );
}
