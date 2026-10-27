import React from "react";
import { DASH, money, percent } from "./profitFormat";
import type { Waterfall } from "@/types/profitability";

interface ChannelContributionCardProps {
  data?: Waterfall | null;
}

/** which marketplace earns most: the channel rows of the P&L bridge; contribution and margin are dashes until every cost of that channel is known */
export const ChannelContributionCard: React.FC<ChannelContributionCardProps> = ({ data }) => {
  const channels = data?.channels ?? [];
  const known = channels.filter((c) => c.netProfitMinor !== null && c.netMarginPercent !== null);
  const best = known.length > 1 ? [...known].sort((a, b) => (b.netMarginPercent ?? 0) - (a.netMarginPercent ?? 0))[0] : undefined;
  const maxContribution = Math.max(...channels.map((c) => Math.max(c.netProfitMinor ?? 0, 0)), 1);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-xs">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Which channel contributes best?</h2>
          <p className="mt-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{best ? `Highest contribution margin: ${best.label} ${percent(best.netMarginPercent)}` : "Compare channels once more than one has all its costs known"}</p>
        </div>
        <span className="rounded-md border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{data ? `${data.range.from} to ${data.range.to}` : ""}</span>
      </div>

      {channels.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No channel has sales in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/80 text-[11px] font-medium text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Marketplace</th>
                <th className="px-3 py-2.5 text-right font-medium">Revenue</th>
                <th className="px-3 py-2.5 font-medium">Contribution</th>
                <th className="px-3 py-2.5 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {channels.map((ch) => {
                const contribution = ch.netProfitMinor;
                const width = contribution === null ? 0 : Math.round((Math.max(contribution, 0) / maxContribution) * 100);
                const margin = ch.netMarginPercent;
                return (
                  <tr key={ch.channel} className="transition-colors hover:bg-muted/30">
                    <td className="px-3 py-3 font-medium text-foreground">{ch.label}</td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums text-muted-foreground">{money(ch.grossRevenue.amountMinor)}</td>
                    <td className="min-w-[200px] px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-3 max-w-[160px] flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-neutral-700 transition-all duration-500 dark:bg-neutral-300" style={{ width: `${width}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums text-foreground" title={contribution === null ? `Known part so far: ${money(ch.knownPartMinor)}` : undefined}>
                          {contribution === null ? DASH : money(contribution)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">
                      <span className={margin === null ? "text-muted-foreground" : margin < 0 ? "text-rose-600" : "text-foreground"}>{percent(margin)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="pt-1 text-[11px] text-muted-foreground">Bars compare contribution, not revenue. A dash means a cost of that channel (shipping, fees or product cost) is not recorded yet.</p>
    </div>
  );
};
