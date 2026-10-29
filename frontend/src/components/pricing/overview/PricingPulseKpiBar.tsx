import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { DASH, marginText } from "./marginText";

interface PricingPulseKpiBarProps {
  /** undefined while the numbers are loading or could not be loaded: a dash is shown, never a made-up value */
  productsInView?: number;
  productChannelPrices?: number;
  avgMarginBps?: number | null;
  belowTargetCount?: number;
  unknownCostCount?: number;
  targetMarginBps?: number | null;
  pricingOpportunitiesCount?: number;
  updatesAppliedCount?: number;
}

const num = (n: number | undefined): string => (n === undefined ? DASH : formatNumber(n));

export function PricingPulseKpiBar({
  productsInView,
  productChannelPrices,
  avgMarginBps,
  belowTargetCount,
  unknownCostCount,
  targetMarginBps,
  pricingOpportunitiesCount,
  updatesAppliedCount,
}: PricingPulseKpiBarProps) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Pricing pulse
      </div>

      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Metric 1: Products in view */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-black shrink-0 self-center" />
            <span className="text-2xl font-bold tracking-tight text-foreground">{num(productsInView)}</span>
            <span className="text-xs font-semibold text-foreground">Products in view</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">
            {num(productChannelPrices)} product-channel prices
          </p>
        </div>

        {/* Metric 2: Avg margin */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-black shrink-0 self-center" />
            <span className="text-2xl font-bold tracking-tight text-foreground">{marginText(avgMarginBps)}</span>
            <span className="text-xs font-semibold text-foreground">Avg. est. margin</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">
            {unknownCostCount !== undefined && unknownCostCount > 0
              ? `Unweighted · ${formatNumber(unknownCostCount)} without a cost price left out`
              : "Unweighted · from your costs and channel fees"}
          </p>
        </div>

        {/* Metric 3: Below margin target */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 self-center" />
            <span
              className={cn(
                "text-2xl font-bold tracking-tight",
                belowTargetCount !== undefined && belowTargetCount > 0 ? "text-amber-600" : "text-foreground"
              )}
            >
              {num(belowTargetCount)}
            </span>
            <span className="text-xs font-semibold text-foreground">Below margin target</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">
            {targetMarginBps === null || targetMarginBps === undefined
              ? "No margin target set in a strategy rule"
              : `Target ≥ ${marginText(targetMarginBps)} · Per channel`}
          </p>
        </div>

        {/* Metric 4: Pricing opportunities */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-black shrink-0 self-center" />
            <span className="text-2xl font-bold tracking-tight text-foreground">{num(pricingOpportunitiesCount)}</span>
            <span className="text-xs font-semibold text-foreground">Pricing opportunities</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">Proposed · Review required</p>
        </div>

        {/* Metric 5: Updates applied */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-black shrink-0 self-center" />
            <span className="text-2xl font-bold tracking-tight text-foreground">{num(updatesAppliedCount)}</span>
            <span className="text-xs font-semibold text-foreground">Updates applied</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">Approved or automatic · Last 30 days</p>
        </div>
      </div>
    </div>
  );
}
