import { cn } from "@/utils/cn";

interface PricingPulseKpiBarProps {
  productsInView?: number;
  productChannelPrices?: number;
  avgEstMarginPct?: number;
  belowTargetCount?: number;
  pricingOpportunitiesCount?: number;
  updatesAppliedCount?: number;
}

export function PricingPulseKpiBar({
  productsInView = 4,
  productChannelPrices = 6,
  avgEstMarginPct = 37.6,
  belowTargetCount = 2,
  pricingOpportunitiesCount = 3,
  updatesAppliedCount = 0,
}: PricingPulseKpiBarProps) {
  return (
    <div className="space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Pricing pulse
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Metric 1: Products in view */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-black shrink-0" />
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {productsInView}
            </span>
            <span className="text-xs font-semibold text-foreground">Products in view</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">
            {productChannelPrices} product-channel prices
          </p>
        </div>

        {/* Metric 2: Avg est margin */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-black shrink-0" />
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {avgEstMarginPct.toFixed(1)}%
            </span>
            <span className="text-xs font-semibold text-foreground">Avg. est. margin</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">
            Unweighted · Example costs
          </p>
        </div>

        {/* Metric 3: Below margin target */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
            <span className={cn(
              "text-2xl font-bold tracking-tight",
              belowTargetCount > 0 ? "text-amber-600" : "text-foreground"
            )}>
              {belowTargetCount}
            </span>
            <span className="text-xs font-semibold text-foreground">Below margin target</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">
            Target ≥ 30% · Per channel
          </p>
        </div>

        {/* Metric 4: Pricing opportunities */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-black shrink-0" />
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {pricingOpportunitiesCount}
            </span>
            <span className="text-xs font-semibold text-foreground">Pricing opportunities</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">
            Proposed · Review required
          </p>
        </div>

        {/* Metric 5: Updates applied */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-black shrink-0" />
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {updatesAppliedCount}
            </span>
            <span className="text-xs font-semibold text-foreground">Updates applied</span>
          </div>
          <p className="text-[11px] text-muted-foreground pl-3.5">
            No live price changes
          </p>
        </div>
      </div>
    </div>
  );
}
