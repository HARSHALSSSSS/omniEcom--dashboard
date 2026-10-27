import { useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export interface ProductContextData {
  sku: string;
  name: string;
  category: string;
  riskBadge?: string;
  daysOfCover: number;
  leadTimeDays: number;
  onHand: number;
  unitsSold: number;
  dailyDemand: number;
  netSales: string;
  grossProfit: string;
  grossMargin: string;
  month?: string;
}

const DEFAULT_PRODUCT_CONTEXT: ProductContextData = {
  sku: "NL-THR-002",
  name: "Cotton throw",
  category: "Textiles",
  riskBadge: "P1 · Stock risk",
  daysOfCover: 5,
  leadTimeDays: 12,
  onHand: 50,
  unitsSold: 300,
  dailyDemand: 10,
  netSales: "₹4,50,000",
  grossProfit: "₹1,53,000",
  grossMargin: "34.0%",
  month: "September 2026",
};

interface ProductContextRailProps {
  data?: ProductContextData | null;
  onClose?: () => void;
  className?: string;
}

export function ProductContextRail({ data = DEFAULT_PRODUCT_CONTEXT, className }: ProductContextRailProps) {
  const [collapsed, setCollapsed] = useState(false);
  const info = data || DEFAULT_PRODUCT_CONTEXT;

  if (collapsed) {
    return (
      <div className="flex h-full w-10 flex-col items-center border-l border-border bg-card py-4">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title="Expand Product Context"
          onClick={() => setCollapsed(false)}
        >
          <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
        </Button>
        <span className="mt-8 -rotate-90 whitespace-nowrap text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Product Context
        </span>
      </div>
    );
  }

  const coverPercent = Math.min(100, Math.round((info.daysOfCover / Math.max(1, info.leadTimeDays)) * 100));
  const coverGapDays = info.leadTimeDays - info.daysOfCover;

  return (
    <aside
      className={cn(
        "flex h-full w-[340px] shrink-0 flex-col overflow-y-auto border-l border-border bg-card p-5 text-sm",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border pb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product context</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Collapse Panel"
          onClick={() => setCollapsed(true)}
        >
          <PanelRightClose className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        {info.riskBadge && (
          <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
            {info.riskBadge}
          </span>
        )}

        <div>
          <h3 className="text-base font-semibold text-foreground">{info.name}</h3>
          <p className="text-xs text-muted-foreground">
            {info.sku} · {info.category}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            From Product Intelligence · {info.month || "September 2026"}
          </p>
        </div>

        {/* Stock and Demand */}
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Stock and demand</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-foreground">{info.daysOfCover} days of cover</span>
              <span className="text-muted-foreground">{info.leadTimeDays}-day lead time</span>
            </div>
            {/* Visual cover progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", coverGapDays > 0 ? "bg-amber-600" : "bg-emerald-600")}
                style={{ width: `${coverPercent}%` }}
              />
            </div>
            {coverGapDays > 0 && (
              <p className="text-[11px] font-medium text-amber-700">
                {coverGapDays} days below the stated lead time
              </p>
            )}
          </div>

          <div className="divide-y divide-border pt-1 text-xs">
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">On hand · {info.month || "30 Sep 2026"}</span>
              <span className="font-semibold text-foreground">{info.onHand} units</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Sold in {info.month?.split(" ")[0] || "September"}</span>
              <span className="font-semibold text-foreground">{info.unitsSold} units</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Average daily demand</span>
              <span className="font-semibold text-foreground">{info.dailyDemand} units/day</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Stated lead time</span>
              <span className="font-semibold text-foreground">{info.leadTimeDays} days</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Cover = on hand ÷ September daily sales. Assumes the same demand continues; incoming stock is excluded.
          </p>
        </div>

        {/* September performance */}
        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3.5">
          <span className="text-xs font-semibold text-foreground">{info.month?.split(" ")[0] || "September"} performance</span>
          <div className="divide-y divide-border text-xs">
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Net sales</span>
              <span className="font-semibold text-foreground">{info.netSales}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Gross profit</span>
              <span className="font-semibold text-foreground">{info.grossProfit}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Gross margin</span>
              <span className="font-semibold text-foreground">{info.grossMargin}</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            01–30 Sep 2026 · INR (₹) · Asia/Kolkata
          </p>
        </div>
      </div>
    </aside>
  );
}
