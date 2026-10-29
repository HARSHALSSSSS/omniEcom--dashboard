import React from "react";
import { AlertCircle } from "lucide-react";
import { BASIS_LABELS, DASH, coveragePercent, money, missingList } from "./profitFormat";
import type { Waterfall } from "@/types/profitability";

interface RevenueWaterfallSectionProps {
  data?: Waterfall | null;
}

/**
 * Where the revenue goes, step by step from the P&L bridge: gross revenue, then every deduction hanging from where the last one ended, then the
 * contribution. A step nobody knows yet is drawn as a dashed placeholder with a dash, never as zero. (The earlier "reported contribution" bar is not
 * shown: no source records a reported figure to compare the calculation with.)
 */
export const RevenueWaterfallSection: React.FC<RevenueWaterfallSectionProps> = ({ data }) => {
  const steps = data?.steps ?? [];
  const top = Math.max(data?.grossRevenueMinor ?? 0, 1);
  let running = 0;
  const bars = steps.map((s) => {
    const amount = s.amountMinor;
    let from = 0;
    let to = 0;
    if (amount !== null) {
      if (s.type === "positive") {
        from = 0;
        to = amount;
        running = amount;
      } else if (s.type === "negative") {
        from = running + amount;
        to = running;
        running += amount;
      } else {
        from = 0;
        to = Math.max(amount, 0);
      }
    }
    return { s, bottom: Math.max(0, (from / top) * 100), height: Math.max(amount === null ? 0 : 1.5, ((to - from) / top) * 100) };
  });

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Where revenue goes</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Revenue less returns, product cost, fees, shipping and advertising leaves the contribution.</p>
        </div>
        <span className="text-xs font-medium text-muted-foreground shrink-0">{data ? `${data.range.from} to ${data.range.to}` : ""}</span>
      </div>

      <div className="flex h-56 items-end gap-2 sm:gap-3 overflow-x-auto border-b border-border pb-1 [-webkit-overflow-scrolling:touch]">
        {bars.map(({ s, bottom, height }) => (
          <div key={s.key} className="flex min-w-[76px] sm:min-w-[84px] flex-1 flex-col items-center gap-1 shrink-0" title={s.tooltip}>
            <span className="font-mono text-[11px] font-semibold text-foreground">{s.amountMinor === null ? DASH : s.type === "negative" ? `-${money(Math.abs(s.amountMinor))}` : money(s.amountMinor)}</span>
            <div className="relative h-40 w-full">
              {s.amountMinor === null ? (
                <div className="absolute inset-x-3 bottom-0 h-3 rounded border border-dashed border-muted-foreground/50" />
              ) : (
                <div
                  className={`absolute inset-x-3 rounded-t ${s.type === "positive" ? "bg-foreground" : s.type === "negative" ? "bg-rose-400" : "bg-emerald-600"} ${s.basis === "estimated" ? "opacity-70" : ""}`}
                  style={{ bottom: `${bottom}%`, height: `${height}%` }}
                />
              )}
            </div>
            <span className="text-center text-[10px] leading-tight text-muted-foreground">{s.label}</span>
            <span className="text-[10px] text-muted-foreground/70">{s.amountMinor === null ? "not known" : s.basis === "actual" && s.coverage >= 1 ? BASIS_LABELS.actual : `${BASIS_LABELS[s.basis]} · ${coveragePercent(s.coverage)}`}</span>
          </div>
        ))}
      </div>

      {data && data.missing.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">The contribution is not final yet</p>
            <p className="mt-0.5">Still missing: {missingList(data.missing)}. Steps drawn dashed have no figure yet; the known part so far is {money(data.knownPartMinor)}.</p>
          </div>
        </div>
      )}
    </div>
  );
};
