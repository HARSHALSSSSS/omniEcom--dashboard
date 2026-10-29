import React from "react";
import type { ProductProfit } from "@/types/profitability";

interface ProductContributionMapProps {
  products: ProductProfit[];
  /** the margin that separates high from low: the policy target, else the middle of the margins on the map */
  marginTargetBps: number | null;
  onSelect: (p: ProductProfit) => void;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Margin against demand for the products on screen. Demand is the units sold in the period; a product is "high demand" at or above the middle
 * of the units shown. A product whose margin is not known yet (a cost is missing) cannot be placed and is counted below the map.
 */
export const ProductContributionMap: React.FC<ProductContributionMapProps> = ({ products, marginTargetBps, onSelect }) => {
  const placed = products.filter((p) => p.marginPercent !== null);
  const unplaced = products.length - placed.length;
  const demandSplit = placed.length ? median(placed.map((p) => p.unitsSold)) : 0;
  const marginSplit = marginTargetBps !== null ? marginTargetBps / 100 : placed.length ? median(placed.map((p) => p.marginPercent as number)) : 0;
  const maxUnits = Math.max(...placed.map((p) => p.unitsSold), 1);

  const quadrant = (p: ProductProfit) => {
    const highDemand = p.unitsSold >= demandSplit && p.unitsSold > 0;
    const highMargin = (p.marginPercent as number) >= marginSplit;
    return highMargin ? (highDemand ? "scale" : "marketing") : highDemand ? "optimize" : "review";
  };

  const cell = (key: string, title: string, sub: string) => (
    <div className="relative p-4">
      <div className="text-xs font-semibold text-foreground">{title}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {placed
          .filter((p) => quadrant(p) === key)
          .map((p) => (
            <button key={p.key} type="button" onClick={() => onSelect(p)} className="flex items-center gap-1.5 rounded-full border border-border/70 px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:border-blue-400 hover:text-blue-600" title={`${p.unitsSold} units · ${p.marginPercent}% margin`}>
              <span className="h-2 w-2 rounded-full bg-neutral-700 dark:bg-neutral-300" style={{ opacity: 0.4 + 0.6 * (p.unitsSold / maxUnits) }} />
              {p.title ?? p.label}
            </button>
          ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6 shadow-xs">
      <div>
        <h2 className="text-base font-semibold text-foreground">Product contribution map</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Margin against units sold in the period. The margin line is {marginTargetBps !== null ? `your target of ${marginTargetBps / 100}%` : `the middle margin of these products (${marginSplit.toFixed(1)}%)`}; the demand line is {demandSplit} units.
        </p>
      </div>

      {placed.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">{products.length === 0 ? "No products sold in this period." : "No product has a complete cost picture yet, so none can be placed."}</p>
      ) : (
        <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
          <div className="min-w-[460px]">
            <div className="text-[11px] font-medium text-muted-foreground">Contribution margin ↑</div>
            <div className="grid min-h-[260px] grid-cols-2 grid-rows-2 divide-x divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70 bg-background/50">
              {cell("marketing", "Marketing opportunity", "Low demand + High margin")}
              {cell("scale", "Scale opportunity", "High demand + High margin")}
              {cell("review", "Review candidate", "Low demand + Low margin")}
              {cell("optimize", "Optimize pricing / cost", "High demand + Low margin")}
            </div>
            <div className="flex justify-end text-[11px] font-medium text-muted-foreground">Demand →</div>
          </div>
        </div>
      )}
      {unplaced > 0 && placed.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {unplaced} {unplaced === 1 ? "product is" : "products are"} not on the map: a cost is missing, so the margin is not known.
        </p>
      )}
    </div>
  );
};
