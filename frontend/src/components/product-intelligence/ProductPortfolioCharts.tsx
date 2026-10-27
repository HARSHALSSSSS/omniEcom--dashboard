import { ArrowRight, BarChart3, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SalesShareItem {
  name: string;
  amount: string;
  sharePercent: number;
}

const DEFAULT_SALES_SHARE: SalesShareItem[] = [
  { name: "Arc table lamp", amount: "₹6.00L", sharePercent: 28.6 },
  { name: "Cotton throw", amount: "₹4.50L", sharePercent: 21.4 },
  { name: "Ceramic vase", amount: "₹3.50L", sharePercent: 16.7 },
  { name: "Stoneware dinner set", amount: "₹3.00L", sharePercent: 14.3 },
  { name: "Linen cushion", amount: "₹2.50L", sharePercent: 11.9 },
  { name: "Bamboo organizer", amount: "₹1.50L", sharePercent: 7.1 },
];

interface ProductPortfolioChartsProps {
  salesShare?: SalesShareItem[];
  onInspectTopRisk?: () => void;
}

export function ProductPortfolioCharts({
  salesShare = DEFAULT_SALES_SHARE,
  onInspectTopRisk,
}: ProductPortfolioChartsProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 1. Where sales come from */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-bold text-foreground">Where sales come from</h3>
            <span className="text-xs text-muted-foreground">Net sales · Share of ₹21.00L</span>
          </div>

          <div className="mt-4 space-y-3">
            {salesShare.map((item) => (
              <div key={item.name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-foreground">{item.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-foreground">{item.amount}</span>
                    <span className="w-12 text-right font-mono text-muted-foreground">
                      {item.sharePercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-neutral-800 transition-all"
                    style={{ width: `${Math.min(100, item.sharePercent * 3.2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Portfolio at a glance */}
        <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-2xs">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              <span>Portfolio at a glance</span>
            </div>

            <h3 className="mt-3 text-2xl font-bold tracking-tight text-foreground leading-snug">
              Two products contribute 50% of net sales.
            </h3>

            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              Arc table lamp and Cotton throw generated ₹10.50L in sales and ₹3.69L in gross profit. Review the throw&apos;s stock risk before expanding demand.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            <Button
              size="sm"
              className="gap-2 bg-black text-xs text-white hover:bg-neutral-800"
              onClick={onInspectTopRisk}
            >
              <span>Inspect Cotton throw</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Illustrative insight only · Review source records first.
            </p>
          </div>
        </div>
      </div>

      {/* Methodology note */}
      <div className="space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <h4 className="font-semibold text-foreground">How to read these signals</h4>
        <p className="leading-relaxed">
          Stock as of 30 Sep 2026 · Cover = on-hand units ÷ average daily units sold in September; assumes the same demand continues, excludes incoming stock. Gross margin = gross profit ÷ net sales; portfolio margin is sales-weighted. Validate costs, lead times and channel demand before taking action.
        </p>
        <div className="flex items-start gap-1.5 pt-1 text-[11px]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            All product figures and opportunities are illustrative, not synced or verified. No recommendations have been applied; validate source records before making business decisions.
          </span>
        </div>
      </div>
    </div>
  );
}
