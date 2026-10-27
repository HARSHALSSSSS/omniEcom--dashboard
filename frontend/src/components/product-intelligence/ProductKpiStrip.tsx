import { formatINR, formatNumber } from "@/utils/format";
import type { IntelPortfolio } from "@/types/intelligence";

interface ProductKpiStripProps {
  portfolio: IntelPortfolio | undefined;
  loading: boolean;
  currency: string;
  timezone: string;
}

const pct = (bps: number | null) => (bps === null ? "—" : `${(bps / 100).toFixed(1)}%`);

/** the numbers of the chosen dates, from the portfolio block of GET /product-intelligence; a figure that cannot be known yet (no costs) is a dash */
export function ProductKpiStrip({ portfolio: p, loading, currency, timezone }: ProductKpiStripProps) {
  const dash = (v: string) => (loading && !p ? "—" : v);

  const tile = (label: string, value: string, note: string, tone = "text-foreground") => (
    <div className="rounded-xl border border-border bg-card p-4 shadow-2xs" key={label}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className={`mt-1 font-mono text-2xl font-extrabold tracking-tight ${tone}`}>{dash(value)}</div>
      <span className="mt-0.5 block text-[11px] text-muted-foreground">{note}</span>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Commerce performance{p ? ` · ${formatNumber(p.totalProducts)} ${p.totalProducts === 1 ? "product" : "products"}` : ""}</span>
        <span>
          {currency} · {timezone}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tile("Net sales", p ? formatINR(p.netSalesMinor, true) : "—", "After discounts, before tax and shipping")}
        {tile("Orders", p ? formatNumber(p.orders) : "—", p ? `${formatNumber(p.unitsSold)} units sold` : "")}
        {tile("Average order value", p && p.orders > 0 ? formatINR(p.averageOrderValueMinor) : "—", "Net sales ÷ orders")}
        {tile("Gross margin", p ? pct(p.grossMarginBps) : "—", p && p.grossMarginBps === null ? (p.netSalesMinor > 0 ? `Costs known for ${Math.round(p.costCoverage * 100)}% of sales` : "No sales yet") : p?.grossProfitMinor !== null && p ? `${formatINR(p.grossProfitMinor ?? 0, true)} gross profit` : "")}
        {tile("Prioritized", p ? formatNumber(p.prioritizedCount) : "—", p ? `of ${formatNumber(p.totalProducts)} products need a decision` : "", "text-amber-600")}
      </div>
    </div>
  );
}
