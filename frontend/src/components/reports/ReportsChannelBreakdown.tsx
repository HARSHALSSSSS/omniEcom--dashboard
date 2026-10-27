import { ArrowRight } from "lucide-react";

export interface ChannelRow {
  channel: string;
  type: string;
  netSales: string;
  orders: string;
  aov: string;
  sharePercent: number;
  shareLabel: string;
  vsPrevMonth: string;
  grossMargin: string;
}

const DEFAULT_CHANNELS: ChannelRow[] = [
  {
    channel: "Amazon",
    type: "Marketplace",
    netSales: "₹9,45,000",
    orders: "630",
    aov: "₹1,500",
    sharePercent: 45,
    shareLabel: "45%",
    vsPrevMonth: "+ 12.5%",
    grossMargin: "30.0%",
  },
  {
    channel: "Flipkart",
    type: "Marketplace",
    netSales: "₹6,30,000",
    orders: "420",
    aov: "₹1,500",
    sharePercent: 30,
    shareLabel: "30%",
    vsPrevMonth: "+ 5.0%",
    grossMargin: "30.0%",
  },
  {
    channel: "Shopify",
    type: "Direct-to-consumer",
    netSales: "₹4,20,000",
    orders: "280",
    aov: "₹1,500",
    sharePercent: 20,
    shareLabel: "20%",
    vsPrevMonth: "+ 27.3%",
    grossMargin: "37.0%",
  },
  {
    channel: "Offline",
    type: "Retail",
    netSales: "₹1,05,000",
    orders: "70",
    aov: "₹1,500",
    sharePercent: 5,
    shareLabel: "5%",
    vsPrevMonth: "+ 0.0%",
    grossMargin: "42.0%",
  },
];

interface ReportsChannelBreakdownProps {
  channels?: ChannelRow[];
  summaryRow?: {
    channel: string;
    netSales: string;
    orders: string;
    aov: string;
    shareLabel: string;
    vsPrevMonth: string;
    grossMargin: string;
  };
  periodLabel?: string;
  onViewChannelReport?: () => void;
}

export function ReportsChannelBreakdown({
  channels = DEFAULT_CHANNELS,
  summaryRow = {
    channel: "All channels",
    netSales: "₹21,00,000",
    orders: "1,400",
    aov: "₹1,500",
    shareLabel: "100%",
    vsPrevMonth: "+ 12.0%",
    grossMargin: "32.0%",
  },
  periodLabel = "01–30 Sep 2026",
  onViewChannelReport,
}: ReportsChannelBreakdownProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between border-b border-border pb-3">
        <h3 className="text-sm font-bold text-foreground">Channel breakdown</h3>
        <span className="text-xs text-muted-foreground">{channels.length} channels · {periodLabel}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="pb-2.5 font-semibold">Channel</th>
              <th className="pb-2.5 font-semibold">Net sales</th>
              <th className="pb-2.5 font-semibold">Orders</th>
              <th className="pb-2.5 font-semibold">Average order value</th>
              <th className="pb-2.5 font-semibold">Sales share</th>
              <th className="pb-2.5 font-semibold">vs previous month</th>
              <th className="pb-2.5 font-semibold text-right">Gross margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {channels.map((row) => (
              <tr key={row.channel} className="hover:bg-muted/20">
                <td className="py-3">
                  <span className="font-semibold text-foreground">{row.channel}</span>
                  <p className="text-[11px] text-muted-foreground">{row.type}</p>
                </td>
                <td className="py-3 font-mono font-medium text-foreground">{row.netSales}</td>
                <td className="py-3 font-mono text-muted-foreground">{row.orders}</td>
                <td className="py-3 font-mono text-muted-foreground">{row.aov}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold w-8">{row.shareLabel}</span>
                    <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-foreground rounded-full"
                        style={{ width: `${row.sharePercent}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="py-3 font-mono font-medium text-emerald-600">{row.vsPrevMonth}</td>
                <td className="py-3 font-mono text-right font-medium text-foreground">{row.grossMargin}</td>
              </tr>
            ))}

            {/* Summary Row */}
            <tr className="bg-muted/10 font-bold text-foreground border-t-2 border-border">
              <td className="py-3.5">{summaryRow.channel}</td>
              <td className="py-3.5 font-mono">{summaryRow.netSales}</td>
              <td className="py-3.5 font-mono">{summaryRow.orders}</td>
              <td className="py-3.5 font-mono">{summaryRow.aov}</td>
              <td className="py-3.5 font-mono">{summaryRow.shareLabel}</td>
              <td className="py-3.5 font-mono text-emerald-600">{summaryRow.vsPrevMonth}</td>
              <td className="py-3.5 font-mono text-right">{summaryRow.grossMargin}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
        <span>Net sales after discounts and refunds · Gross margin weighted by net sales</span>
        <button
          type="button"
          onClick={onViewChannelReport}
          className="inline-flex items-center gap-1 font-semibold text-foreground hover:underline"
        >
          View channel report <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
