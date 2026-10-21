import { useState } from "react";
import { Download, ArrowDownRight, ArrowUpRight, RotateCw } from "lucide-react";
import {
  MOCK_PROFITABILITY_WATERFALL,
  MOCK_CHANNEL_PROFITABILITY,
} from "@/mocks/data/phase10.data";
import { formatINR } from "@/utils/format";
import { useProfitability } from "@/hooks/useIntelligence";

export default function ProfitabilityPage() {
  const { data: profitData, refetch, isFetching } = useProfitability();
  const [selectedRange, setSelectedRange] = useState<"30d" | "mtd" | "ytd">(
    "30d",
  );

  const waterfallData = profitData?.waterfall ?? MOCK_PROFITABILITY_WATERFALL;
  const channelData = profitData?.channels ?? MOCK_CHANNEL_PROFITABILITY;

  const totalGMV = 2840000;
  const netContribution = 630480;
  const netMargin = ((netContribution / totalGMV) * 100).toFixed(1);

  return (
    <div className="flex flex-col gap-6 w-full select-none pb-12 font-['Inter',sans-serif]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAEAEA] pb-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold text-[#000000] tracking-tight">
              Profitability &amp; Unit Economics
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
              Screen 32 Spec
            </span>
          </div>
          <p className="text-[13px] text-[#666666]">
            Transparent breakdown from Gross Merchandise Value (GMV) to true net
            cash contribution after channel commissions, logistics, and returns.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => refetch()}
            className="box-border flex flex-row items-center px-[10px] gap-[6px] h-[34px] bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            <RotateCw className={`w-[14px] h-[14px] text-[#666666] stroke-[1.5px] ${isFetching ? "animate-spin" : ""}`} />
            <span className="text-[12px] font-normal leading-[145%] text-[#666666]">
              Refresh
            </span>
          </button>
          <div className="inline-flex items-center bg-neutral-100 p-1 rounded-lg border border-[#EAEAEA]">
            <button
              type="button"
              onClick={() => setSelectedRange("mtd")}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                selectedRange === "mtd"
                  ? "bg-white text-black shadow-xs font-semibold"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              MTD
            </button>
            <button
              type="button"
              onClick={() => setSelectedRange("30d")}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                selectedRange === "30d"
                  ? "bg-white text-black shadow-xs font-semibold"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              onClick={() => setSelectedRange("ytd")}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                selectedRange === "ytd"
                  ? "bg-white text-black shadow-xs font-semibold"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              YTD
            </button>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-[#EAEAEA] text-[#000000] text-[12px] font-medium rounded-lg hover:bg-neutral-50 transition-colors shadow-2xs"
          >
            <Download className="h-4 w-4 text-[#666666]" />
            Export Waterfall
          </button>
        </div>
      </div>

      {/* Snapshot Pulse */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 shadow-2xs">
          <span className="text-[11px] font-medium text-[#666666] uppercase">
            Gross Merchandise Value (GMV)
          </span>
          <div className="text-[28px] font-bold text-[#000000] mt-1">
            {formatINR(totalGMV)}
          </div>
          <span className="text-[11px] text-emerald-600 font-medium">
            +12.4% vs previous period
          </span>
        </div>

        <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 shadow-2xs">
          <span className="text-[11px] font-medium text-[#666666] uppercase">
            Net Realized Contribution
          </span>
          <div className="text-[28px] font-bold text-emerald-600 mt-1">
            {formatINR(netContribution)}
          </div>
          <span className="text-[11px] text-[#666666]">
            After all take-rates &amp; fulfillment
          </span>
        </div>

        <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 shadow-2xs">
          <span className="text-[11px] font-medium text-[#666666] uppercase">
            Net Margin Realization
          </span>
          <div className="text-[28px] font-bold text-[#000000] mt-1">
            {netMargin}%
          </div>
          <span className="text-[11px] text-emerald-600 font-medium">
            +1.8% margin efficiency lift
          </span>
        </div>
      </div>

      {/* Screen 32 Waterfall Breakdown */}
      <div className="bg-white border border-[#EAEAEA] rounded-xl p-6 shadow-2xs flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#000000]">
              P&amp;L Margin Waterfall (Step-Down Reconciliation)
            </h2>
            <p className="text-[12px] text-[#666666]">
              Detailed accounting bridge from gross channel billings down to net operating income.
            </p>
          </div>
          <span className="text-[11px] text-[#666666]">All amounts in INR</span>
        </div>

        <div className="flex flex-col divide-y divide-[#EAEAEA]">
          {waterfallData.map((step, idx) => {
            const isSubtotal = step.type === "subtotal";
            const isNegative = step.type === "negative";

            return (
              <div
                key={step.label}
                className={`py-3.5 flex items-center justify-between text-[13px] ${
                  isSubtotal ? "bg-neutral-50/75 font-semibold px-3 rounded-lg" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-[#888888] font-mono text-[11px]">
                    0{idx + 1}
                  </span>
                  <span
                    className={
                      isSubtotal
                        ? "text-[#000000] font-bold"
                        : "text-[#333333] font-normal"
                    }
                  >
                    {step.label}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono font-semibold ${
                      isSubtotal
                        ? "text-[#000000]"
                        : isNegative
                          ? "text-red-600"
                          : "text-emerald-600"
                    }`}
                  >
                    {isNegative ? "-" : isSubtotal ? "" : "+"}
                    {formatINR(Math.abs(step.amount))}
                  </span>
                  {isNegative ? (
                    <ArrowDownRight className="h-4 w-4 text-red-500" />
                  ) : isSubtotal ? null : (
                    <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Channel Profitability Contribution Map */}
      <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-[#EAEAEA]">
          <h2 className="text-[14px] font-semibold text-[#000000]">
            Channel Net Margin Contribution Table
          </h2>
          <p className="text-[11px] text-[#666666]">
            Compare take rates and logistics overhead by marketplace partner.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="bg-neutral-50 border-b border-[#EAEAEA] text-[#666666] font-medium text-[11px]">
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4 text-right">Gross GMV</th>
                <th className="py-3 px-4 text-right">COGS</th>
                <th className="py-3 px-4 text-right">Marketplace Fees</th>
                <th className="py-3 px-4 text-right">Shipping</th>
                <th className="py-3 px-4 text-right">Returns Loss</th>
                <th className="py-3 px-4 text-right">Net Profit</th>
                <th className="py-3 px-4 text-right">Net Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA]">
              {channelData.map((c) => (
                <tr key={c.channel} className="hover:bg-neutral-50 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-[#000000]">
                    {c.channel}
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-[#000000]">
                    {formatINR(c.grossRevenue)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-neutral-600">
                    {formatINR(c.cogs)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-red-600">
                    {formatINR(c.marketplaceFees)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-neutral-600">
                    {formatINR(c.shippingCosts)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-red-600">
                    {formatINR(c.returnsImpact)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-emerald-600">
                    {formatINR(c.netProfit)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-semibold text-[#000000]">
                    {c.netMarginPercent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
