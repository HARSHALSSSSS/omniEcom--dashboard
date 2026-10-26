import { ArrowRight, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface BucketData {
  label: string;
  augValue: number;
  augLabel: string;
  sepValue: number;
  sepLabel: string;
}

const DEFAULT_BUCKETS: BucketData[] = [
  { label: "01–07 Sep", augValue: 4.0, augLabel: "₹4.00L", sepValue: 4.2, sepLabel: "₹4.20L" },
  { label: "08–14 Sep", augValue: 4.2, augLabel: "₹4.20L", sepValue: 4.8, sepLabel: "₹4.80L" },
  { label: "15–21 Sep", augValue: 4.7, augLabel: "₹4.70L", sepValue: 5.4, sepLabel: "₹5.40L" },
  { label: "22–30 Sep", augValue: 5.85, augLabel: "₹5.85L", sepValue: 6.6, sepLabel: "₹6.60L" },
];

interface ReportsSalesTrendSectionProps {
  buckets?: BucketData[];
  currentPeriodLabel?: string;
  currentPeriodTotal?: string;
  previousPeriodLabel?: string;
  previousPeriodTotal?: string;
  interval?: "Weekly" | "Monthly" | "Daily";
  onIntervalChange?: (interval: "Weekly" | "Monthly" | "Daily") => void;
  headline?: string;
  narrative?: string;
  salesAfterDiscounts?: string;
  lessRefunds?: string;
  netSales?: string;
  onExploreSales?: () => void;
}

export function ReportsSalesTrendSection({
  buckets = DEFAULT_BUCKETS,
  currentPeriodLabel = "Sep 2026",
  currentPeriodTotal = "₹21.00L",
  previousPeriodLabel = "Aug 2026",
  previousPeriodTotal = "₹18.75L",
  interval = "Weekly",
  onIntervalChange,
  headline = "Sales grew 12%, with no change in average order value.",
  narrative = "Growth came from 150 more orders. Amazon contributed 45% of net sales; review the channel mix before changing spend.",
  salesAfterDiscounts = "₹22.05L",
  lessRefunds = "- ₹1.05L",
  netSales = "₹21.00L",
  onExploreSales,
}: ReportsSalesTrendSectionProps) {
  const maxBucketVal = Math.max(...buckets.map((b) => Math.max(b.augValue, b.sepValue)), 1);
  const maxVal = Math.max(8.0, Math.ceil(maxBucketVal * 1.2));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Left Column: Sales trend chart */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Sales trend</h3>
            <span className="text-xs text-muted-foreground">Net sales · INR</span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-xs bg-neutral-900 dark:bg-neutral-100" />
              <span className="font-medium text-foreground">{currentPeriodLabel} · {currentPeriodTotal}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-xs bg-neutral-300 dark:bg-neutral-600" />
              <span className="text-muted-foreground">{previousPeriodLabel} · {previousPeriodTotal}</span>
            </div>
            <select
              aria-label="Trend interval"
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground"
              value={interval}
              onChange={(e) => onIntervalChange?.(e.target.value as "Weekly" | "Monthly" | "Daily")}
            >
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
              <option value="Daily">Daily</option>
            </select>
          </div>
        </div>

        {/* Bar chart representation */}
        <div className="relative pt-6 pb-2">
          {/* Y-axis grid lines */}
          <div className="absolute inset-x-0 top-6 bottom-8 flex flex-col justify-between pointer-events-none text-[10px] text-muted-foreground/60">
            <div className="border-b border-dashed border-border/70 pb-0.5">₹8L</div>
            <div className="border-b border-dashed border-border/70 pb-0.5">₹6L</div>
            <div className="border-b border-dashed border-border/70 pb-0.5">₹4L</div>
            <div className="border-b border-dashed border-border/70 pb-0.5">₹2L</div>
            <div className="border-b border-border pb-0.5">₹0</div>
          </div>

          {/* Bars group */}
          <div className="grid grid-cols-4 gap-4 h-48 items-end pl-8 pr-2 relative z-10">
            {buckets.map((b, idx) => {
              const augHeight = `${Math.round((b.augValue / maxVal) * 100)}%`;
              const sepHeight = `${Math.round((b.sepValue / maxVal) * 100)}%`;

              return (
                <div key={idx} className="flex flex-col items-center h-full justify-end group">
                  <div className="flex items-end gap-1.5 w-full justify-center h-full pb-1">
                    {/* Aug bar */}
                    <div
                      style={{ height: augHeight }}
                      className="w-8 rounded-t bg-neutral-300 hover:bg-neutral-400 transition-all relative"
                      title={`Aug 2026: ${b.augLabel}`}
                    />
                    {/* Sep bar */}
                    <div
                      style={{ height: sepHeight }}
                      className="w-8 rounded-t bg-neutral-900 hover:bg-neutral-800 transition-all relative flex justify-center"
                      title={`Sep 2026: ${b.sepLabel}`}
                    >
                      <span className="absolute -top-5 text-[10px] font-mono font-bold text-foreground opacity-90 whitespace-nowrap">
                        {b.sepLabel}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground mt-2 border-t border-border pt-1 w-full text-center">
                    {b.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground border-t border-border pt-2.5">
          Last bucket includes 9 days; August uses the same date buckets, ending 31 Aug.
        </p>
      </div>

      {/* Right Column: Performance at a glance */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <BarChart3 className="h-4 w-4 text-foreground" />
            PERFORMANCE AT A GLANCE
          </div>

          <h3 className="text-base font-bold text-foreground leading-snug">
            {headline}
          </h3>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {narrative}
          </p>

          <div className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-2 text-xs">
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Sales after discounts</span>
              <span className="font-mono text-foreground font-semibold">{salesAfterDiscounts}</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Less refunds</span>
              <span className="font-mono text-red-600 font-semibold">{lessRefunds}</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between items-center font-bold text-foreground">
              <span>Net sales</span>
              <span className="font-mono text-base">{netSales}</span>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-between text-xs font-semibold"
            onClick={onExploreSales}
          >
            <span>Explore sales report</span>
            <ArrowRight className="h-4 w-4" />
          </Button>

          <p className="text-[11px] text-muted-foreground">
            Illustrative insight only · Net sales exclude tax and shipping.
          </p>
        </div>
      </div>
    </div>
  );
}
