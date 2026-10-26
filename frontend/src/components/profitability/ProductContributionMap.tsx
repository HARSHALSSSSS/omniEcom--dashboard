import React from "react";
import { FIGMA_PRODUCTS } from "./figmaProfitData";
import type { ProductProfitItem } from "@/types/profitability";

interface ProductContributionMapProps {
  products?: ProductProfitItem[];
  selectedProduct?: ProductProfitItem | null;
  onSelectProduct?: (product: ProductProfitItem) => void;
}

export const ProductContributionMap: React.FC<ProductContributionMapProps> = ({
  products = FIGMA_PRODUCTS,
  selectedProduct: _selectedProduct,
  onSelectProduct,
}) => {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-foreground">Product contribution map</h2>
        <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
          Illustrative positioning only · Demand axis not supplied; no numeric demand scale.
        </p>
      </div>

      {/* Axis indicator Top-Left */}
      <div className="text-[11px] font-medium text-muted-foreground">
        Contribution margin ↑
      </div>

      {/* 2x2 Matrix Grid */}
      <div className="relative min-h-[340px] rounded-lg border border-border/70 bg-background/50 grid grid-cols-2 grid-rows-2 divide-x divide-y divide-border/60 overflow-hidden">
        {/* Quadrant 1: Top-Left - Marketing opportunity */}
        <div className="p-4 relative">
          <div className="text-xs font-semibold text-foreground">Marketing opportunity</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Low demand + High margin</div>
        </div>

        {/* Quadrant 2: Top-Right - Scale opportunity */}
        <div className="p-4 relative">
          <div className="text-xs font-semibold text-foreground">Scale opportunity</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">High demand + High margin</div>

          {/* Placed dot: Running Shoes (green dot) */}
          <button
            type="button"
            onClick={() => {
              const p = products.find((x) => x.name.includes("Shoes"));
              if (p && onSelectProduct) onSelectProduct(p);
            }}
            className="absolute top-1/2 left-1/4 -translate-y-1/2 flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-blue-600 transition-all cursor-pointer group"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-950 group-hover:scale-125 transition-transform" />
            <span className="text-[11px] font-semibold whitespace-nowrap">Running Shoes</span>
          </button>

          {/* Placed dot: Black T-Shirt (dark dot in Scale opportunity, slightly lower) */}
          <button
            type="button"
            onClick={() => {
              const p = products.find((x) => x.name.includes("T-Shirt"));
              if (p && onSelectProduct) onSelectProduct(p);
            }}
            className="absolute bottom-6 right-1/3 flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-blue-600 transition-all cursor-pointer group"
          >
            <span className="h-2 w-2 rounded-full bg-amber-700 dark:bg-amber-400 ring-2 ring-amber-200 dark:ring-amber-950 group-hover:scale-125 transition-transform" />
            <span className="text-[11px] font-semibold whitespace-nowrap">Black T-Shirt</span>
          </button>
        </div>

        {/* Quadrant 3: Bottom-Left - Review candidate */}
        <div className="p-4 relative">
          <div className="text-xs font-semibold text-foreground">Review candidate</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Low demand + Low margin</div>

          {/* Placed dot: Travel Duffel (orange dot) */}
          <button
            type="button"
            onClick={() => {
              const p = products.find((x) => x.name.includes("Duffel"));
              if (p && onSelectProduct) onSelectProduct(p);
            }}
            className="absolute bottom-6 right-8 flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-blue-600 transition-all cursor-pointer group"
          >
            <span className="h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-200 dark:ring-amber-950 group-hover:scale-125 transition-transform" />
            <span className="text-[11px] font-semibold whitespace-nowrap">Travel Duffel</span>
          </button>
        </div>

        {/* Quadrant 4: Bottom-Right - Optimize pricing / cost */}
        <div className="p-4 relative">
          <div className="text-xs font-semibold text-foreground">Optimize pricing / cost</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">High demand + Low margin</div>
        </div>
      </div>

      {/* Axis indicator Bottom-Right */}
      <div className="flex justify-end text-[11px] font-medium text-muted-foreground">
        Demand →
      </div>
    </div>
  );
};
