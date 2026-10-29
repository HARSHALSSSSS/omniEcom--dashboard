import { ArrowRight, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/utils/format";
import type { OverviewKpis } from "@/types/reports";
import { PERIODS, type TrendPeriod } from "./overviewRange";

interface ReportsSalesTrendSectionProps {
  data: OverviewKpis;
  onPeriodChange: (period: TrendPeriod) => void;
  onExploreSales?: () => void;
}

/** the bucket starts at midnight UTC, so it is named in UTC too */
const label = (bucket: string, period: TrendPeriod) =>
  new Intl.DateTimeFormat("en-IN", period === "month" ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(bucket));

/** round an axis maximum up to a tidy value (1, 2, 5 x 10^n) */
const niceMax = (v: number): number => {
  if (v <= 0) return 100;
  const mag = 10 ** Math.floor(Math.log10(v));
  const f = v / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
};

/** sales per day, week or month for the range, with the comparison range's buckets beside them when there is one */
export function ReportsSalesTrendSection({ data, onPeriodChange, onExploreSales }: ReportsSalesTrendSectionProps) {
  const { series, previousSeries, totals, previous } = data;
  const compared = previousSeries !== null && data.previousRange !== null;
  const max = niceMax(Math.max(0, ...series.map((s) => s.grossMinor), ...(previousSeries ?? []).map((s) => s.grossMinor)));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => formatINR(Math.round(max * f), true));
  const refundsText = data.refunds.amountMinor > 0 ? `- ${formatINR(data.refunds.amountMinor)}` : formatINR(0);
  const rangeText = `${data.range.from} to ${data.range.to}`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5 lg:col-span-2">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Sales trend</h3>
            <span className="text-xs text-muted-foreground">Total of orders, by {PERIODS.find((p) => p.id === data.period)?.label.toLowerCase()} bucket</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-foreground shrink-0" />
              <span className="text-foreground">{rangeText} · {formatINR(totals.grossMinor, true)}</span>
            </div>
            {compared && previous && data.previousRange && (
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/40 shrink-0" />
                <span className="text-muted-foreground">{data.previousRange.from} to {data.previousRange.to} · {formatINR(previous.grossMinor, true)}</span>
              </div>
            )}
            <select aria-label="Trend interval" className="h-9 sm:h-7 rounded-md border border-border bg-background px-2 py-1 text-xs" value={data.period} onChange={(e) => onPeriodChange(e.target.value as TrendPeriod)}>
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {series.length === 0 ? (
          <p className="py-16 text-center text-xs text-muted-foreground">No sales in these dates.</p>
        ) : (
          <div className="relative h-56 pl-12 sm:pl-14">
            <div className="absolute inset-y-0 left-0 flex w-10 sm:w-12 flex-col justify-between pb-6 text-right text-[10px] text-muted-foreground">
              {ticks.map((t, i) => (
                <div key={i}>{t}</div>
              ))}
            </div>
            <div className="flex h-full items-end gap-2 overflow-x-auto border-b border-border pb-0">
              {series.map((b, idx) => {
                const prev = previousSeries?.[idx];
                return (
                  <div key={b.bucket} className="flex min-w-[28px] flex-1 flex-col items-center gap-1">
                    <div className="flex h-44 w-full items-end justify-center gap-0.5">
                      {compared && <div className="w-1/3 rounded-t bg-muted-foreground/30" style={{ height: `${Math.round(((prev?.grossMinor ?? 0) / max) * 100)}%` }} title={prev ? `Before: ${formatINR(prev.grossMinor)}` : "Before: none"} />}
                      <div className="w-1/2 rounded-t bg-foreground" style={{ height: `${Math.round((b.grossMinor / max) * 100)}%` }} title={`${label(b.bucket, data.period)}: ${formatINR(b.grossMinor)} · ${b.orders} orders`} />
                    </div>
                    <span className="whitespace-nowrap text-[10px] text-muted-foreground">{label(b.bucket, data.period)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {compared && <p className="text-[11px] text-muted-foreground">The lighter bars are the comparison range, bucket by bucket from its first day.</p>}
      </div>

      <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden />
            PERFORMANCE AT A GLANCE
          </div>
          <h3 className="text-sm font-semibold leading-snug text-foreground">
            {totals.orders === 0 ? "No orders in these dates." : `${totals.orders} order${totals.orders === 1 ? "" : "s"} and ${formatINR(totals.netSalesMinor, true)} net sales.`}
          </h3>
          <div className="space-y-2 border-t border-border pt-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sales after discounts</span>
              <span className="font-mono font-semibold text-foreground">{formatINR(totals.netSalesMinor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Refunds in the period</span>
              <span className="font-mono font-semibold text-foreground">{refundsText}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax and shipping charged</span>
              <span className="font-mono font-semibold text-foreground">{formatINR(totals.taxMinor + totals.shippingMinor)}</span>
            </div>
          </div>
        </div>
        <div className="space-y-2 pt-4">
          <Button size="sm" variant="outline" className="w-full h-10 sm:h-9 gap-1.5 text-xs" onClick={onExploreSales}>
            <span>Explore sales report</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <p className="text-[11px] text-muted-foreground">Net sales exclude tax and shipping. Days are counted in UTC.</p>
        </div>
      </div>
    </div>
  );
}
