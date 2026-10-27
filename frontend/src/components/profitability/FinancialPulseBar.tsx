import React from "react";
import { DASH, money, percent, signed } from "./profitFormat";
import type { Waterfall, WaterfallStep } from "@/types/profitability";

interface FinancialPulseBarProps {
  waterfall?: Waterfall | null;
  loading?: boolean;
}

const step = (w: Waterfall, key: string): WaterfallStep | undefined => w.steps.find((s) => s.key === key);
/** a cost step is stored as a negative amount; the pulse shows it as the amount spent, or a dash while nothing is known */
const spent = (s: WaterfallStep | undefined): string => (!s || s.amountMinor === null ? DASH : money(Math.abs(s.amountMinor)));
const tag = (s: WaterfallStep | undefined): string | null => (s && s.amountMinor !== null && s.basis === "estimated" ? "estimated" : s && s.amountMinor !== null && s.coverage < 1 ? "partly known" : null);

/** the numbers of the period, straight from the P&L bridge; nothing is shown that the bridge does not say */
export const FinancialPulseBar: React.FC<FinancialPulseBarProps> = ({ waterfall: w, loading }) => {
  const dash = loading && !w;
  const cell = (label: string, value: string, note: string | null, highlight = false) => ({ label, value: dash ? DASH : value, note, highlight });
  const cmp = w?.comparison ?? null;

  const kpis = w
    ? [
        cell("Revenue", money(w.grossRevenueMinor), cmp ? `${signed(cmp.grossRevenue.changePercent, "%")} vs previous` : null),
        cell("Product cost", spent(step(w, "product_cost")), tag(step(w, "product_cost"))),
        cell("Marketplace + payment fees", spent(step(w, "marketplace_fees")), tag(step(w, "marketplace_fees"))),
        cell("Shipping", spent(step(w, "shipping")), tag(step(w, "shipping"))),
        cell("Returns/refunds", spent(step(w, "returns_refunds")), tag(step(w, "returns_refunds"))),
        cell("Advertising", spent(step(w, "advertising")), step(w, "advertising")?.amountMinor === null ? "no spend recorded" : null),
        cell("Contribution", money(w.netContributionMinor), w.netContributionMinor === null ? `known part ${money(w.knownPartMinor)}` : cmp ? `${signed(cmp.netContribution.changePercent, "%")} vs previous` : null, true),
        cell("Contribution margin", percent(w.netMarginPercent), cmp?.netMarginPoints !== null && cmp?.netMarginPoints !== undefined ? `${signed(cmp.netMarginPoints, " pts")} vs previous` : null, true),
      ]
    : ["Revenue", "Product cost", "Marketplace + payment fees", "Shipping", "Returns/refunds", "Advertising", "Contribution", "Contribution margin"].map((l) => cell(l, DASH, null));

  return (
    <div className="pt-1 pb-2">
      <div className="flex items-center justify-between pb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>FINANCIAL PULSE</span>
        <span className="font-normal normal-case text-muted-foreground/80">{w ? `${w.range.from} to ${w.range.to} · ${w.ordersAnalysed} orders` : "Loading..."}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 md:grid-cols-8">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="space-y-0.5">
            <div className={`text-xl font-bold tracking-tight ${kpi.highlight ? "text-foreground" : "text-foreground"}`}>{kpi.value}</div>
            <div className="text-[11px] leading-tight text-muted-foreground">{kpi.label}</div>
            {kpi.note && <div className="text-[10px] leading-tight text-muted-foreground/80">{kpi.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};
