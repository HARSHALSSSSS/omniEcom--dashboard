import React from "react";
import { FIGMA_CHANNELS } from "./figmaProfitData";
import type { ChannelContributionItem } from "@/types/profitability";

interface ChannelContributionCardProps {
  channels?: ChannelContributionItem[];
}

export const ChannelContributionCard: React.FC<ChannelContributionCardProps> = ({
  channels = FIGMA_CHANNELS,
}) => {
  const formatShortLakh = (minor: number) => {
    const rupees = minor / 100;
    if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(1)}L`;
    if (rupees >= 1_000) return `₹${Math.round(rupees / 1_000)}K`;
    return `₹${rupees.toLocaleString("en-IN")}`;
  };

  // Maximum contribution minor to scale progress bars (e.g. 3.4L is ~100% of the bar width)
  const maxContrib = Math.max(...channels.map((c) => c.contributionMinor), 1);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Which channel contributes best?</h2>
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
            + Highest contribution margin: Shopify 53%
          </p>
        </div>
        <span className="rounded-md border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          Last 30 days
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border/80 text-[11px] font-medium text-muted-foreground">
              <th className="py-2.5 px-3 font-medium">Marketplace</th>
              <th className="py-2.5 px-3 font-medium text-right">Revenue</th>
              <th className="py-2.5 px-3 font-medium">Contribution</th>
              <th className="py-2.5 px-3 font-medium text-right">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {channels.map((ch) => {
              const barWidth = Math.round((ch.contributionMinor / maxContrib) * 100);
              const isHigh = ch.marginPercent >= 50;
              const isLow = ch.marginPercent < 30;

              return (
                <tr key={ch.marketplace} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-3 font-medium text-foreground">
                    {ch.marketplace}
                  </td>
                  <td className="py-3 px-3 text-right text-muted-foreground font-medium tabular-nums">
                    {formatShortLakh(ch.revenueMinor)}
                  </td>
                  <td className="py-3 px-3 min-w-[200px]">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden max-w-[160px]">
                        <div
                          className="h-full bg-neutral-700 dark:bg-neutral-300 rounded-full transition-all duration-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-foreground tabular-nums">
                        {formatShortLakh(ch.contributionMinor)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-semibold tabular-nums">
                    <span
                      className={
                        isHigh
                          ? "text-emerald-600 dark:text-emerald-400"
                          : isLow
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-foreground"
                      }
                    >
                      {ch.marginPercent}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Caption */}
      <p className="text-[11px] text-muted-foreground pt-1">
        Bars compare reported contribution, not revenue. Percentages show contribution margin.
      </p>
    </div>
  );
};
