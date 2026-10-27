import { ArrowUpRight } from "lucide-react";

export interface ReportKpiData {
  netSales: string;
  netSalesDelta: string;
  netSalesCompare: string;
  orders: string;
  ordersDelta: string;
  ordersCompare: string;
  aov: string;
  aovNote: string;
  refundsRate: string;
  refundsDelta: string;
  refundsValue: string;
  grossMargin: string;
  grossMarginDelta: string;
  grossMarginProfit: string;
}

const DEFAULT_KPIS: ReportKpiData = {
  netSales: "₹21.00L",
  netSalesDelta: "12.0%",
  netSalesCompare: "vs ₹18.75L previous period",
  orders: "1,400",
  ordersDelta: "12.0%",
  ordersCompare: "vs 1,250 previous period",
  aov: "₹1,500",
  aovNote: "Net sales ÷ orders",
  refundsRate: "4.76%",
  refundsDelta: "0.26 pp",
  refundsValue: "₹1.05L refunded",
  grossMargin: "32.0%",
  grossMarginDelta: "2.0 pp",
  grossMarginProfit: "₹6.72L gross profit",
};

interface ReportsOverviewKpiStripProps {
  data?: ReportKpiData;
}

export function ReportsOverviewKpiStrip({ data = DEFAULT_KPIS }: ReportsOverviewKpiStripProps) {
  return (
    <div className="space-y-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        COMMERCE PERFORMANCE
      </span>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {/* 1. Net Sales */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <span className="text-xs text-muted-foreground">Net sales</span>
          <div className="font-mono text-2xl font-extrabold text-foreground">{data.netSales}</div>
          <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>{data.netSalesDelta}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{data.netSalesCompare}</p>
        </div>

        {/* 2. Orders */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <span className="text-xs text-muted-foreground">Orders</span>
          <div className="font-mono text-2xl font-extrabold text-foreground">{data.orders}</div>
          <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>{data.ordersDelta}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{data.ordersCompare}</p>
        </div>

        {/* 3. Average Order Value */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <span className="text-xs text-muted-foreground">Average order value</span>
          <div className="font-mono text-2xl font-extrabold text-foreground">{data.aov}</div>
          <div className="text-xs font-medium text-muted-foreground">No change</div>
          <p className="text-[11px] text-muted-foreground">{data.aovNote}</p>
        </div>

        {/* 4. Refunds / Gross Sales */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <span className="text-xs text-muted-foreground">Refunds / gross sales</span>
          <div className="font-mono text-2xl font-extrabold text-foreground">{data.refundsRate}</div>
          <div className="flex items-center gap-1 text-xs font-semibold text-amber-600">
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>{data.refundsDelta}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{data.refundsValue}</p>
        </div>

        {/* 5. Gross Margin */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <span className="text-xs text-muted-foreground">Gross margin</span>
          <div className="font-mono text-2xl font-extrabold text-foreground">{data.grossMargin}</div>
          <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>{data.grossMarginDelta}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{data.grossMarginProfit}</p>
        </div>
      </div>
    </div>
  );
}
