import React from "react";
import { money, percent } from "./profitFormat";
import type { ProductProfit, ProductProfitPage, StatusFilter } from "@/types/profitability";

interface MarginPressureCardProps {
  page: ProductProfitPage | undefined;
  /** the products furthest from healthy (low first, then below target), to name a few */
  worst: ProductProfit[];
  onFilter: (status: StatusFilter) => void;
  onSelect: (p: ProductProfit) => void;
}

/**
 * How many products sit in each margin bucket. Healthy is at or above the margin target of the active pricing policy (the strictest one),
 * below target is from zero up to it, low is a negative contribution. Without a target there are just two buckets by sign.
 */
export const MarginPressureCard: React.FC<MarginPressureCardProps> = ({ page, worst, onFilter, onSelect }) => {
  const target = page?.marginTargetBps ?? null;
  const c = page?.statusCounts;
  const n = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString("en-IN"));

  const tile = (label: string, value: number | undefined, status: StatusFilter, tone: string, hint: string) => (
    <button type="button" onClick={() => onFilter(status)} disabled={!value} title={hint} className="rounded-lg border border-border/70 p-3 text-left transition-colors hover:bg-muted/40 disabled:cursor-default disabled:opacity-70 disabled:hover:bg-transparent min-w-0 min-h-[44px]">
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{n(value)}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </button>
  );

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6 shadow-xs">
      <div>
        <h2 className="text-base font-semibold text-foreground">Margin pressure</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{target === null ? "No margin target set: products are split by whether they earn anything. Set one in Pricing policies." : `Margin target ${percent(target / 100)} (the strictest active pricing policy)`}</p>
      </div>

      <div className={`grid gap-3 ${target === null ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
        {tile(target === null ? "Earning (0% or more)" : `Healthy (at or above ${percent(target / 100, 0)})`, c?.healthy, "healthy", "text-emerald-600", "Show the healthy products")}
        {target !== null && tile("Below target", c?.belowTarget, "below_target", "text-amber-600", "Show the products below the target")}
        {tile("Low contribution (negative)", c?.low, "low", "text-rose-600", "Show the products that lose money")}
      </div>
      {c && c.unknown > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {c.unknown} {c.unknown === 1 ? "product has" : "products have"} no complete cost picture yet and {c.unknown === 1 ? "is" : "are"} not counted.{" "}
          <button type="button" className="font-medium text-foreground underline" onClick={() => onFilter("unknown")}>
            Show them
          </button>
        </p>
      )}

      {worst.length > 0 && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Needs a look first</div>
          {worst.map((p) => (
            <button key={p.key} type="button" onClick={() => onSelect(p)} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 w-full rounded-md p-2 text-left text-xs hover:bg-muted/40 min-h-[40px]">
              <span className="font-medium text-foreground truncate">{p.title ?? p.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground text-[11px] sm:text-xs">
                {money(p.revenue.amountMinor)} · {percent(p.marginPercent)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
