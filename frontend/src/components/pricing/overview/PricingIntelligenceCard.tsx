import { useState } from "react";
import { TrendingUp, ArrowRight } from "lucide-react";
import { marginText } from "./marginText";

interface PricingIntelligenceCardProps {
  /** real totals of the margin overview; undefined while loading */
  belowTargetCount?: number;
  unknownCostCount?: number;
  targetMarginBps?: number | null;
  productChannelPrices?: number;
  onReviewProposals: () => void;
}

const DISMISS_KEY = "pricing.intelligence.dismissed";

/** the dismissal is only a per-browser convenience, tied to the message so a changed situation shows again */
function readDismissed(message: string): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === message;
  } catch {
    return false;
  }
}

/** the headline and body, written from the real totals only */
function intelligenceText(p: Pick<PricingIntelligenceCardProps, "belowTargetCount" | "unknownCostCount" | "targetMarginBps" | "productChannelPrices">): { headline: string; body: string } {
  const below = p.belowTargetCount ?? 0;
  const unknown = p.unknownCostCount ?? 0;
  const prices = p.productChannelPrices ?? 0;
  if (prices === 0) {
    return { headline: "No priced listings to review yet.", body: "Once your listings have prices, margin insights based on your costs and channel fees appear here." };
  }
  const target = p.targetMarginBps ? `${marginText(p.targetMarginBps)} margin target` : null;
  const costNote =
    unknown > 0 ? ` ${unknown} ${unknown === 1 ? "price has" : "prices have"} no cost price, so the margin is unknown: add costs to see it.` : "";
  if (target && below > 0) {
    return {
      headline: `${below} channel ${below === 1 ? "price falls" : "prices fall"} below the ${target}.`,
      body: `Margins use your unit costs and channel fee settings. Review the proposed prices before making a decision.${costNote}`,
    };
  }
  if (target) {
    return {
      headline: unknown > 0 ? "No known price falls below your margin target." : `All channel prices meet the ${target}.`,
      body: `Margins use your unit costs and channel fee settings.${costNote}`,
    };
  }
  return {
    headline: unknown > 0 ? `${unknown} ${unknown === 1 ? "price has" : "prices have"} no cost price.` : "No margin target is set.",
    body:
      unknown > 0
        ? "Add unit costs to see real margins. A strategy rule with a margin floor also lets the dashboard flag prices below target."
        : "Add a strategy rule with a margin floor to flag prices that fall below your target.",
  };
}

export function PricingIntelligenceCard({
  belowTargetCount,
  unknownCostCount,
  targetMarginBps,
  productChannelPrices,
  onReviewProposals,
}: PricingIntelligenceCardProps) {
  const text = intelligenceText({ belowTargetCount, unknownCostCount, targetMarginBps, productChannelPrices });
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);
  const dismissed = dismissedMessage === text.headline || readDismissed(text.headline);
  const setDismissed = (value: boolean) => {
    setDismissedMessage(value ? text.headline : null);
    try {
      if (value) window.localStorage.setItem(DISMISS_KEY, text.headline);
      else window.localStorage.removeItem(DISMISS_KEY);
    } catch {
      /* private mode: the dismissal then only lasts for this visit */
    }
  };

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
        <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-black leading-snug">{text.headline}</h3>

        {/* Description body */}
        <p className="text-xs sm:text-[13px] text-white/95 leading-relaxed font-normal">{text.body}</p>
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
