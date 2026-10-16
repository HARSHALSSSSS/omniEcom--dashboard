import { useState } from "react";
import { Sparkles, Lightbulb } from "lucide-react";
import { MOCK_PRODUCT_INTELLIGENCE } from "@/mocks/data/phase10.data";
import type { ProductIntelligenceItem } from "@/types/intelligence";
import { formatINR } from "@/utils/format";

export default function ProductIntelligencePage() {
  const [items] = useState<ProductIntelligenceItem[]>(
    MOCK_PRODUCT_INTELLIGENCE,
  );
  const [selectedFilter, setSelectedFilter] = useState<
    "all" | "reorder" | "raise_price" | "liquidate"
  >("all");

  const filteredItems =
    selectedFilter === "all"
      ? items
      : items.filter((i) => i.recommendedAction === selectedFilter);

  const getActionBadge = (action: ProductIntelligenceItem["recommendedAction"]) => {
    switch (action) {
      case "reorder":
        return "bg-amber-50 text-amber-800 border-amber-200";
      case "raise_price":
        return "bg-blue-50 text-blue-800 border-blue-200";
      case "liquidate":
        return "bg-red-50 text-red-800 border-red-200";
      case "promote":
        return "bg-purple-50 text-purple-800 border-purple-200";
      default:
        return "bg-neutral-100 text-neutral-800 border-neutral-200";
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full select-none pb-12 font-['Inter',sans-serif]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAEAEA] pb-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold text-[#000000] tracking-tight">
              Product Intelligence &amp; Velocity
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-800 border border-purple-200">
              <Sparkles className="h-3 w-3" />
              Prescriptive Stock &amp; Pricing Insights
            </span>
          </div>
          <p className="text-[13px] text-[#666666]">
            Algorithmic inventory runway analysis, competitor buy-box price
            intelligence, and automated action signals.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="inline-flex items-center bg-neutral-100 p-1 rounded-lg border border-[#EAEAEA]">
          <button
            type="button"
            onClick={() => setSelectedFilter("all")}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
              selectedFilter === "all"
                ? "bg-white text-black shadow-xs font-semibold"
                : "text-[#666666] hover:text-black"
            }`}
          >
            All Insights ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter("reorder")}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
              selectedFilter === "reorder"
                ? "bg-white text-black shadow-xs font-semibold"
                : "text-[#666666] hover:text-black"
            }`}
          >
            Reorder Urgently
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter("raise_price")}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
              selectedFilter === "raise_price"
                ? "bg-white text-black shadow-xs font-semibold"
                : "text-[#666666] hover:text-black"
            }`}
          >
            Pricing Upside
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter("liquidate")}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
              selectedFilter === "liquidate"
                ? "bg-white text-black shadow-xs font-semibold"
                : "text-[#666666] hover:text-black"
            }`}
          >
            Slow Movers
          </button>
        </div>
      </div>

      {/* Intelligence Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredItems.map((prod) => (
          <div
            key={prod.id}
            className="bg-white border border-[#EAEAEA] rounded-xl p-5 flex flex-col justify-between gap-4 shadow-2xs hover:border-neutral-300 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[11px] font-medium text-[#666666] uppercase">
                  {prod.category}
                </span>
                <h3 className="text-[15px] font-semibold text-[#000000] mt-0.5">
                  {prod.productName}
                </h3>
                <span className="text-[11px] text-[#666666] font-mono">
                  {prod.sku}
                </span>
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${getActionBadge(
                  prod.recommendedAction,
                )}`}
              >
                {prod.recommendedAction.replace("_", " ")}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 bg-neutral-50/75 p-3.5 rounded-lg border border-[#EAEAEA] text-[12px]">
              <div>
                <span className="text-[10px] text-[#666666] block">
                  Daily Velocity
                </span>
                <span className="text-[14px] font-semibold text-[#000000]">
                  {prod.salesVelocity} units/day
                </span>
                <span className="text-[10px] text-emerald-600 block">
                  Trend: {prod.velocityTrend}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#666666] block">
                  Stock Runway
                </span>
                <span
                  className={`text-[14px] font-semibold ${
                    prod.inventoryRunwayDays <= 10
                      ? "text-red-600 font-bold"
                      : "text-[#000000]"
                  }`}
                >
                  {prod.inventoryRunwayDays} days left
                </span>
                <span className="text-[10px] text-[#666666] block">
                  Margin: {prod.marginPercent}%
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#666666] block">
                  Competitor Benchmark
                </span>
                <span className="text-[14px] font-semibold text-[#000000]">
                  {prod.competitorBuyBoxPrice
                    ? formatINR(prod.competitorBuyBoxPrice)
                    : "Exclusive SKU"}
                </span>
                <span className="text-[10px] text-blue-600 block">
                  Confidence: {prod.confidenceScore}%
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-[#666666] flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                {prod.recommendedAction === "reorder"
                  ? "Stockout probability 89% within 9 days without purchase order."
                  : prod.recommendedAction === "raise_price"
                    ? "Competitors out of stock; raise price by ₹100 without losing Buy Box."
                    : prod.recommendedAction === "liquidate"
                      ? "Aging stock holding capital; discount 20% to free up warehouse slot."
                      : "Promotional campaign can stimulate dormant marketplace ranking."}
              </span>

              <button
                type="button"
                onClick={() =>
                  alert(`Executing action: ${prod.recommendedAction} on ${prod.sku}`)
                }
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#000000] hover:underline shrink-0 ml-3"
              >
                Apply Action →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
