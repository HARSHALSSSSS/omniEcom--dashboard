import { ArrowRight, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/utils/format";
import type { IntelPortfolio, IntelSalesShare } from "@/types/intelligence";

interface ProductPortfolioChartsProps {
  portfolio: IntelPortfolio | undefined;
  loading: boolean;
  onInspect: (share: IntelSalesShare) => void;
}

const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;

/** where the sales come from (the top products of the dates chosen) and how much stock stands behind each: every figure from the portfolio block */
export function ProductPortfolioCharts({ portfolio: p, loading, onInspect }: ProductPortfolioChartsProps) {
  const share = p?.salesShare ?? [];
  const topTwo = share.slice(0, 2);
  const topTwoBps = topTwo.reduce((n, s) => n + s.shareBps, 0);
  const atRisk = share.filter((s) => s.runwayDays !== null && s.runwayDays < 14).sort((a, b) => (a.runwayDays ?? 0) - (b.runwayDays ?? 0))[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-2xs lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Where sales come from</h3>
            <span className="text-xs text-muted-foreground">Net sales · Share of {p ? formatINR(p.netSalesMinor, true) : "—"}</span>
          </div>

          {share.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">{loading && !p ? "Loading..." : "No sales in these dates."}</p>
          ) : (
            <div className="space-y-3">
              {share.map((item) => (
                <div key={item.sku} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{item.title ?? item.sku}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-muted-foreground">{formatINR(item.revenueMinor, true)}</span>
                      <span className="w-12 text-right font-mono font-semibold text-foreground">{pct(item.shareBps)}</span>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-neutral-800 dark:bg-neutral-200" style={{ width: `${Math.min(100, item.shareBps / 100)}%` }} />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {item.unitsSold} units sold · {item.available === null ? "stock not tracked" : `${item.available} in stock`}
                    {item.runwayDays !== null ? ` · ${Math.round(item.runwayDays)} days of cover` : ""}
                  </div>
                </div>
              ))}
              {p && p.otherShareBps > 0 && (
                <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                  <span>All other products</span>
                  <span className="font-mono">{pct(p.otherShareBps)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-2xs">
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" aria-hidden />
              <span>Portfolio at a glance</span>
            </div>
            {topTwo.length === 0 ? (
              <h3 className="text-sm font-semibold text-foreground">No sales to summarise in these dates.</h3>
            ) : (
              <>
                <h3 className="text-sm font-semibold leading-snug text-foreground">
                  {topTwo.length === 1 ? `${topTwo[0]!.title ?? topTwo[0]!.sku} brings in ${pct(topTwoBps)} of net sales.` : `Two products bring in ${pct(topTwoBps)} of net sales.`}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {topTwo.map((s) => s.title ?? s.sku).join(" and ")} sold {formatINR(topTwo.reduce((n, s) => n + s.revenueMinor, 0), true)}.
                  {atRisk ? ` ${atRisk.title ?? atRisk.sku} has ${Math.round(atRisk.runwayDays ?? 0)} days of stock at its current pace: check it before it runs out.` : ""}
                </p>
              </>
            )}
          </div>
          {(atRisk ?? topTwo[0]) && (
            <div className="space-y-2 pt-4">
              <Button size="sm" className="w-full gap-1.5 text-xs" onClick={() => onInspect((atRisk ?? topTwo[0])!)}>
                <span>Inspect {(atRisk ?? topTwo[0])!.title ?? (atRisk ?? topTwo[0])!.sku}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1 rounded-xl border border-border bg-muted/20 p-4 text-[11px] text-muted-foreground">
        <h4 className="text-xs font-semibold text-foreground">How to read these signals</h4>
        <p>Cover is the stock on hand divided by the average units sold per day in the last 30 days, and assumes the same pace continues; stock already on order is not counted. Gross margin is net sales less product cost and shows a dash until every sold item has a cost price.</p>
      </div>
    </div>
  );
}
