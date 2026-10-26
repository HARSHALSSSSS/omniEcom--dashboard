import { formatINR, formatNumber } from "@/utils/format";

export interface IntelOverviewKpis {
  netSalesMinor: number;
  ordersCount: number;
  aovMinor: number;
  grossMarginPercent: number;
  grossProfitMinor: number;
  prioritizedCount: number;
  totalProductsCount: number;
}

const DEFAULT_KPIS: IntelOverviewKpis = {
  netSalesMinor: 210000000, // ₹21.00L
  ordersCount: 1400,
  aovMinor: 150000, // ₹1,500
  grossMarginPercent: 32.0,
  grossProfitMinor: 67200000, // ₹6.72L
  prioritizedCount: 3,
  totalProductsCount: 6,
};

interface ProductKpiStripProps {
  kpis?: Partial<IntelOverviewKpis>;
}

export function ProductKpiStrip({ kpis }: ProductKpiStripProps) {
  const data = { ...DEFAULT_KPIS, ...kpis };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Commerce performance · {data.totalProductsCount} illustrative products
        </span>
        <span>INR (₹) · Asia/Kolkata</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* 1. Net sales */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Net sales
          </span>
          <div className="mt-1 text-2xl font-extrabold tracking-tight text-foreground font-mono">
            {formatINR(data.netSalesMinor, true)}
          </div>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">After discounts and refunds</span>
        </div>

        {/* 2. Orders */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Orders
          </span>
          <div className="mt-1 text-2xl font-extrabold tracking-tight text-foreground font-mono">
            {formatNumber(data.ordersCount)}
          </div>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">All channels</span>
        </div>

        {/* 3. Average order value */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Average order value
          </span>
          <div className="mt-1 text-2xl font-extrabold tracking-tight text-foreground font-mono">
            {formatINR(data.aovMinor)}
          </div>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">Net sales ÷ orders</span>
        </div>

        {/* 4. Gross margin */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Gross margin
          </span>
          <div className="mt-1 text-2xl font-extrabold tracking-tight text-foreground font-mono">
            {data.grossMarginPercent.toFixed(1)}%
          </div>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {formatINR(data.grossProfitMinor, true)} gross profit
          </span>
        </div>

        {/* 5. Prioritized products */}
        <div className="col-span-2 rounded-xl border border-border bg-card p-4 shadow-2xs sm:col-span-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Prioritized products
          </span>
          <div className="mt-1 text-2xl font-extrabold tracking-tight text-foreground font-mono">
            {data.prioritizedCount} of {data.totalProductsCount}
          </div>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            1 stock · 1 margin · 1 slow mover
          </span>
        </div>
      </div>
    </div>
  );
}
