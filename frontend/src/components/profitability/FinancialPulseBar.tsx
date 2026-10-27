import React from "react";
import { FIGMA_FINANCIAL_PULSE } from "./figmaProfitData";
import { money } from "./profitFormat";
import type { Waterfall } from "@/types/profitability";

interface FinancialPulseBarProps {
  waterfall?: Waterfall | null;
  loading?: boolean;
}

export const FinancialPulseBar: React.FC<FinancialPulseBarProps> = ({ waterfall }) => {
  // If real waterfall data has complete figures, format them; otherwise use Figma pulse figures
  const rev = waterfall?.grossRevenueMinor ? money(waterfall.grossRevenueMinor) : FIGMA_FINANCIAL_PULSE.revenue;
  const contrib = waterfall?.netContributionMinor ? money(waterfall.netContributionMinor) : FIGMA_FINANCIAL_PULSE.contribution;
  const margin = waterfall?.netMarginPercent !== null && waterfall?.netMarginPercent !== undefined
    ? `${waterfall.netMarginPercent}%`
    : `${FIGMA_FINANCIAL_PULSE.contributionMarginPercent}%`;

  const kpis = [
    { label: "Revenue", value: rev, note: null },
    { label: "Product cost", value: FIGMA_FINANCIAL_PULSE.productCost, note: null },
    { label: "Marketplace + payment fees", value: FIGMA_FINANCIAL_PULSE.marketplaceAndPaymentFees, note: null },
    { label: "Shipping", value: FIGMA_FINANCIAL_PULSE.shipping, note: null },
    { label: "Returns/refunds", value: FIGMA_FINANCIAL_PULSE.returnsRefunds, note: null },
    {
      label: "Contribution",
      value: contrib.includes("†") ? contrib : `${contrib} †`,
      highlight: true,
    },
    {
      label: "Contribution margin",
      value: margin,
      highlight: true,
    },
  ];

  return (
    <div className="pt-1 pb-2">
      <div className="flex items-center justify-between pb-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        <span>FINANCIAL PULSE</span>
        <span className="font-normal normal-case text-muted-foreground/80">Reported figures · Last 30 days</span>
      </div>

      <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4 md:grid-cols-7 gap-x-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="space-y-0.5">
            <div className="flex items-baseline text-xl font-bold tracking-tight text-foreground">
              <span>{kpi.value}</span>
            </div>
            <div className="text-[11px] leading-tight text-muted-foreground">
              {kpi.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
