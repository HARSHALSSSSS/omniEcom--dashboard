import { ArrowRight } from "lucide-react";
import { formatINR, formatNumber } from "@/utils/format";
import type { OverviewKpis } from "@/types/reports";

export interface ChannelInfo {
  /** what the channel is called (the marketplace's own name) */
  name: string;
  /** Marketplaces, Storefronts, Logistics...: from the connector of the connected account */
  type: string | null;
}

interface ReportsChannelBreakdownProps {
  data: OverviewKpis;
  /** by marketplace code: the real connected accounts' names and categories */
  info: Map<string, ChannelInfo>;
  onViewChannelReport?: () => void;
}

const pct = (bps: number | null) => (bps === null ? "—" : `${(bps / 100).toFixed(1)}%`);
const change = (bps: number | null): string => (bps === null ? "—" : `${bps > 0 ? "+" : ""}${(bps / 100).toFixed(1)}%`);

/** one row per marketplace with sales: total of orders, orders, average order value, share, change against the comparison range and margin when costs are known */
export function ReportsChannelBreakdown({ data, info, onViewChannelReport }: ReportsChannelBreakdownProps) {
  const { channels, totals, margin } = data;
  const compared = data.compare !== "none";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Channel breakdown</h3>
        <span className="text-xs text-muted-foreground">
          {channels.length} {channels.length === 1 ? "channel" : "channels"} with sales · {data.range.from} to {data.range.to}
        </span>
      </div>

      {channels.length === 0 ? (
        <div className="space-y-1 py-8 text-center">
          <p className="text-sm font-semibold text-foreground">{data.totalAccounts === 0 ? "No channel is connected yet" : "No sales in this period"}</p>
          <p className="text-xs text-muted-foreground">{data.totalAccounts === 0 ? "Connect a marketplace or storefront to see sales by channel." : "Pick a longer date range to see sales by channel."}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[11px] font-medium text-muted-foreground">
                <th className="py-2 pr-3">Channel</th>
                <th className="px-3 py-2 text-right">Sales</th>
                <th className="px-3 py-2 text-right">Orders</th>
                <th className="px-3 py-2 text-right">Average order value</th>
                <th className="px-3 py-2">Sales share</th>
                <th className="px-3 py-2 text-right">{compared ? (data.compare === "previous_year" ? "vs last year" : "vs previous period") : "Change"}</th>
                <th className="py-2 pl-3 text-right">Gross margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {channels.map((c) => {
                const meta = info.get(c.marketplace);
                return (
                  <tr key={c.marketplace}>
                    <td className="py-3 pr-3">
                      <span className="font-semibold text-foreground">{meta?.name ?? c.marketplace}</span>
                      {meta?.type && <p className="text-[11px] text-muted-foreground">{meta.type}</p>}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-foreground">{formatINR(c.grossMinor)}</td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">{formatNumber(c.orders)}</td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">{formatINR(c.averageOrderValueMinor)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-12 font-mono text-foreground">{pct(c.shareBps)}</span>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.min(100, c.shareBps / 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">{compared ? change(c.changeBps) : "—"}</td>
                    <td className="py-3 pl-3 text-right font-mono text-foreground">{pct(c.marginBps)}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold text-foreground">
                <td className="py-3 pr-3">All channels</td>
                <td className="px-3 py-3 text-right font-mono">{formatINR(totals.grossMinor)}</td>
                <td className="px-3 py-3 text-right font-mono">{formatNumber(totals.orders)}</td>
                <td className="px-3 py-3 text-right font-mono">{formatINR(totals.averageOrderValueMinor)}</td>
                <td className="px-3 py-3 font-mono">100%</td>
                <td className="px-3 py-3 text-right font-mono">{compared && data.previous ? change(data.previous.grossMinor > 0 ? Math.round(((totals.grossMinor - data.previous.grossMinor) / data.previous.grossMinor) * 10_000) : null) : "—"}</td>
                <td className="py-3 pl-3 text-right font-mono">{pct(margin.marginBps)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
        <span>Sales are the total of orders, tax and shipping included. Margin shows a dash until product costs are known.</span>
        <button type="button" onClick={onViewChannelReport} className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
          View channel report <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
