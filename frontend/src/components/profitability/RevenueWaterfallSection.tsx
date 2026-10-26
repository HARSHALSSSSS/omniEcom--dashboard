import React from "react";
import { AlertCircle } from "lucide-react";
import { FIGMA_WATERFALL_STEPS } from "./figmaProfitData";
import type { Waterfall } from "@/types/profitability";

interface RevenueWaterfallSectionProps {
  data?: Waterfall | null;
}

export const RevenueWaterfallSection: React.FC<RevenueWaterfallSectionProps> = ({ data: _data }) => {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Where revenue goes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Revenue – costs = calculated contribution = reported contribution
          </p>
        </div>
        <span className="rounded-md border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          Last 30 days
        </span>
      </div>

      {/* Waterfall Graphic */}
      <div className="pt-8 pb-4 overflow-x-auto">
        <div className="min-w-[700px] h-60 flex items-end justify-between gap-3 relative px-2">
          {/* Subtle horizontal grid lines */}
          <div className="absolute inset-x-0 top-0 border-b border-border/40 pointer-events-none" />
          <div className="absolute inset-x-0 top-1/2 border-b border-border/30 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 border-b border-border pointer-events-none" />

          {/* Bar 1: Revenue */}
          <div className="flex-1 flex flex-col items-center h-full justify-end relative group">
            <span className="text-xs font-bold text-foreground mb-1.5">₹18.4L</span>
            <div className="w-full max-w-[54px] h-[92%] rounded-t bg-[#D4D4D8] dark:bg-[#52525B] transition-all hover:opacity-90" />
            <span className="text-[11px] font-medium text-muted-foreground mt-2 text-center truncate max-w-[70px]">
              Revenue
            </span>
          </div>

          {/* Bar 2: Product Cost (-6.2L) */}
          <div className="flex-1 flex flex-col items-center h-full justify-end relative group">
            <span className="text-xs font-semibold text-foreground mb-1.5">-₹6.2L</span>
            <div className="w-full max-w-[54px] h-full flex flex-col justify-end">
              {/* Floating bar hanging down from 92% to 61% */}
              <div className="w-full h-[31%] rounded bg-[#D4D4D8] dark:bg-[#52525B] mb-[61%] opacity-90 transition-all hover:opacity-100" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground mt-2 text-center truncate max-w-[70px]" title="Product Cost">
              Product Cost
            </span>
          </div>

          {/* Bar 3: Marketplace Fees (-1.6L) */}
          <div className="flex-1 flex flex-col items-center h-full justify-end relative group">
            <span className="text-xs font-semibold text-foreground mb-1.5">-₹1.6L</span>
            <div className="w-full max-w-[54px] h-full flex flex-col justify-end">
              <div className="w-full h-[8%] rounded bg-[#D4D4D8] dark:bg-[#52525B] mb-[53%] opacity-90 transition-all hover:opacity-100" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground mt-2 text-center truncate max-w-[70px]" title="Marketplace Fees">
              Marketpce Fees
            </span>
          </div>

          {/* Bar 4: Payment Fees (-0.5L) */}
          <div className="flex-1 flex flex-col items-center h-full justify-end relative group">
            <span className="text-xs font-semibold text-foreground mb-1.5">-₹0.5L</span>
            <div className="w-full max-w-[54px] h-full flex flex-col justify-end">
              <div className="w-full h-[3%] rounded bg-[#D4D4D8] dark:bg-[#52525B] mb-[50%] opacity-90 transition-all hover:opacity-100" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground mt-2 text-center truncate max-w-[70px]" title="Payment Fees">
              Payment Fees
            </span>
          </div>

          {/* Bar 5: Shipping (-1.4L) */}
          <div className="flex-1 flex flex-col items-center h-full justify-end relative group">
            <span className="text-xs font-semibold text-foreground mb-1.5">-₹1.4L</span>
            <div className="w-full max-w-[54px] h-full flex flex-col justify-end">
              <div className="w-full h-[7%] rounded bg-[#D4D4D8] dark:bg-[#52525B] mb-[43%] opacity-90 transition-all hover:opacity-100" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground mt-2 text-center truncate max-w-[70px]">
              Shipping
            </span>
          </div>

          {/* Bar 6: Discounts / Promotions (-0.4L) */}
          <div className="flex-1 flex flex-col items-center h-full justify-end relative group">
            <span className="text-xs font-semibold text-foreground mb-1.5">-₹0.4L</span>
            <div className="w-full max-w-[54px] h-full flex flex-col justify-end">
              <div className="w-full h-[2.5%] rounded bg-[#D4D4D8] dark:bg-[#52525B] mb-[40.5%] opacity-90 transition-all hover:opacity-100" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground mt-2 text-center truncate max-w-[70px]" title="Discounts / Promotions">
              Discounts / Promotns
            </span>
          </div>

          {/* Bar 7: Returns / Refunds (-0.8L) */}
          <div className="flex-1 flex flex-col items-center h-full justify-end relative group">
            <span className="text-xs font-semibold text-foreground mb-1.5">-₹0.8L</span>
            <div className="w-full max-w-[54px] h-full flex flex-col justify-end">
              <div className="w-full h-[4%] rounded bg-[#D4D4D8] dark:bg-[#52525B] mb-[36.5%] opacity-90 transition-all hover:opacity-100" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground mt-2 text-center truncate max-w-[70px]" title="Returns / Refunds">
              Returns / Refunds
            </span>
          </div>

          {/* Bar 8: Calculated contribution (₹7.5L) */}
          <div className="flex-1 flex flex-col items-center h-full justify-end relative group">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-1.5">₹7.5L</span>
            <div className="w-full max-w-[54px] h-[37.5%] rounded-t bg-blue-300 dark:bg-blue-600/70 border border-blue-400 dark:border-blue-500 transition-all hover:opacity-90" />
            <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mt-2 text-center leading-tight max-w-[76px]" title="Calculated contribution">
              Calculated contribution
            </span>
          </div>

          {/* Bar 9: Reported contribution (₹7.9L) */}
          <div className="flex-1 flex flex-col items-center h-full justify-end relative group">
            {/* Difference badge */}
            <span className="absolute -top-7 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5 whitespace-nowrap">
              +₹0.4L difference
              <span className="sr-only"> (₹40K difference)</span>
            </span>
            <span className="text-xs font-bold text-foreground mb-1.5">₹7.9L</span>
            <div className="w-full max-w-[54px] h-[39.5%] rounded-t bg-[#52525B] dark:bg-[#71717A] transition-all hover:opacity-90" />
            <span className="text-[11px] font-medium text-foreground mt-2 text-center leading-tight max-w-[76px]" title="Reported contribution">
              Reported contribution
            </span>
          </div>
        </div>
      </div>

      {/* Reconciliation Alert Box */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-300/80 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-900/60 p-3.5 text-amber-900 dark:text-amber-200">
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div className="text-xs leading-relaxed space-y-0.5">
          <p className="font-semibold text-amber-950 dark:text-amber-100">
            Reconciliation required · supplied figures retained
          </p>
          <p className="text-amber-900/90 dark:text-amber-200/90 text-[11px]">
            Costs including ₹0.4L discounts leave ₹7.5L net reported ₹7.9L: ₹40K difference. The pulse excludes discounts. Product matrices reflect: Black T-Shirt ₹21K, Running Shoes ₹26K. Business status is separate from data reviews.
          </p>
        </div>
      </div>
    </div>
  );
};
