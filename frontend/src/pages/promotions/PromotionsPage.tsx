import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import {
  MOCK_CAMPAIGNS,
  MOCK_PROMO_PRODUCTS,
} from "@/mocks/data/phase10.data";
import type { PromotionCampaign, PromotionProductLink } from "@/types/promotions";
import { formatINR } from "@/utils/format";

export default function PromotionsPage() {
  const [activeTab, setActiveTab] = useState<"campaigns" | "products">("campaigns");
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>(MOCK_CAMPAIGNS);
  const [products] = useState<PromotionProductLink[]>(MOCK_PROMO_PRODUCTS);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New campaign form state
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignCode, setNewCampaignCode] = useState("");
  const [newCampaignType, setNewCampaignType] =
    useState<"percentage_discount" | "flat_discount">("percentage_discount");
  const [newCampaignValue, setNewCampaignValue] = useState("15");

  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim()) return;

    const created: PromotionCampaign = {
      id: `camp-${Date.now()}`,
      name: newCampaignName,
      code: newCampaignCode || "PROMO" + Math.floor(Math.random() * 900 + 100),
      type: newCampaignType,
      value: Number(newCampaignValue) || 10,
      channels: ["Amazon", "Flipkart", "Shopify"],
      startDate: "2026-10-25",
      endDate: "2026-11-05",
      status: "scheduled",
      budget: 50000,
      spendToDate: 0,
      revenueGenerated: 0,
      unitsMoved: 0,
    };

    setCampaigns([created, ...campaigns]);
    setShowCreateModal(false);
    setNewCampaignName("");
    setNewCampaignCode("");
  };

  return (
    <div className="flex flex-col gap-6 w-full select-none pb-12 font-['Inter',sans-serif]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAEAEA] pb-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold text-[#000000] tracking-tight">
              Promotions &amp; Discounts
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
              <Sparkles className="h-3 w-3" />
              Omnichannel Campaign Sync
            </span>
          </div>
          <p className="text-[13px] text-[#666666]">
            Coordinate marketing discounts, marketplace deal events, and coupon codes
            without accidental double-discounting.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center bg-neutral-100 p-1 rounded-lg border border-[#EAEAEA]">
            <button
              type="button"
              onClick={() => setActiveTab("campaigns")}
              className={`px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                activeTab === "campaigns"
                  ? "bg-white text-black shadow-xs font-semibold"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              Campaigns ({campaigns.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("products")}
              className={`px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                activeTab === "products"
                  ? "bg-white text-black shadow-xs font-semibold"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              Promoted SKUs ({products.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-black text-white text-[12px] font-semibold rounded-lg hover:bg-neutral-800 transition-colors shadow-2xs"
          >
            <Plus className="h-4 w-4" />
            Create Campaign
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-1 shadow-2xs">
          <span className="text-[11px] text-[#666666] uppercase font-medium">
            Active Campaigns
          </span>
          <span className="text-[24px] font-bold text-[#000000]">
            {campaigns.filter((c) => c.status === "active").length}
          </span>
          <span className="text-[11px] text-emerald-600 font-medium">
            Live across marketplaces
          </span>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-1 shadow-2xs">
          <span className="text-[11px] text-[#666666] uppercase font-medium">
            Revenue Generated
          </span>
          <span className="text-[24px] font-bold text-[#000000]">
            {formatINR(
              campaigns.reduce((sum, c) => sum + c.revenueGenerated, 0),
            )}
          </span>
          <span className="text-[11px] text-[#666666]">
            From promotional orders
          </span>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-1 shadow-2xs">
          <span className="text-[11px] text-[#666666] uppercase font-medium">
            Units Moved
          </span>
          <span className="text-[24px] font-bold text-[#000000]">
            {campaigns.reduce((sum, c) => sum + c.unitsMoved, 0)} units
          </span>
          <span className="text-[11px] text-blue-600 font-medium">
            Velocity lift: +18.4%
          </span>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-1 shadow-2xs">
          <span className="text-[11px] text-[#666666] uppercase font-medium">
            Discount Spend
          </span>
          <span className="text-[24px] font-bold text-[#000000]">
            {formatINR(campaigns.reduce((sum, c) => sum + c.spendToDate, 0))}
          </span>
          <span className="text-[11px] text-[#666666]">
            Within allocated budget
          </span>
        </div>
      </div>

      {/* Tab 1: Campaigns Table */}
      {activeTab === "campaigns" && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-[#EAEAEA] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#000000]">
              Campaign Ledger
            </span>
            <span className="text-[11px] text-[#666666]">
              All marketplace promotional runs
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="bg-neutral-50/75 border-b border-[#EAEAEA] text-[#666666] font-medium text-[11px]">
                  <th className="py-3 px-4">Campaign Name &amp; Code</th>
                  <th className="py-3 px-4">Type &amp; Value</th>
                  <th className="py-3 px-4">Channels</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4 text-right">Revenue</th>
                  <th className="py-3 px-4 text-right">Spend</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA]">
                {campaigns.map((camp) => (
                  <tr key={camp.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-[#000000]">
                          {camp.name}
                        </span>
                        <span className="text-[11px] text-blue-600 font-mono">
                          {camp.code}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-[#000000]">
                      {camp.type === "percentage_discount"
                        ? `${camp.value}% Off`
                        : `₹${camp.value} Flat Off`}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {camp.channels.map((ch) => (
                          <span
                            key={ch}
                            className="inline-block px-1.5 py-0.5 rounded bg-neutral-100 text-[10px] text-neutral-700 font-medium"
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-[#666666] text-[11px]">
                      {camp.startDate} → {camp.endDate}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-[#000000]">
                      {formatINR(camp.revenueGenerated)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-[#666666]">
                      {formatINR(camp.spendToDate)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          camp.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : camp.status === "scheduled"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-neutral-100 text-neutral-600 border-neutral-200"
                        }`}
                      >
                        {camp.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Promoted Products */}
      {activeTab === "products" && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-[#EAEAEA] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#000000]">
              SKU Promotion Mapping
            </span>
            <span className="text-[11px] text-[#666666]">
              Real-time discount calculation per product
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="bg-neutral-50/75 border-b border-[#EAEAEA] text-[#666666] font-medium text-[11px]">
                  <th className="py-3 px-4">Product / SKU</th>
                  <th className="py-3 px-4">Campaign</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4 text-right">Original Price</th>
                  <th className="py-3 px-4 text-right">Promotional Price</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA]">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-[#000000]">
                          {p.productName}
                        </span>
                        <span className="text-[11px] text-[#666666] font-mono">
                          {p.sku}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-[#000000]">
                      {p.campaignName}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-[#666666]">
                      {p.channel}
                    </td>
                    <td className="py-3.5 px-4 text-right text-neutral-500 line-through">
                      {formatINR(p.originalPrice)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-600">
                      {formatINR(p.promoPrice)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {p.status.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
              <h3 className="text-[16px] font-semibold text-[#000000]">
                Launch New Promotional Campaign
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-neutral-400 hover:text-black"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="flex flex-col gap-4 text-[12px]">
              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  Campaign Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Diwali Mega Fest 2026"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#666666] mb-1">
                    Discount Type
                  </label>
                  <select
                    value={newCampaignType}
                    onChange={(e) =>
                      setNewCampaignType(
                        e.target.value as "percentage_discount" | "flat_discount",
                      )
                    }
                    className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px] bg-white"
                  >
                    <option value="percentage_discount">Percentage (%)</option>
                    <option value="flat_discount">Flat INR (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#666666] mb-1">
                    Value
                  </label>
                  <input
                    type="number"
                    required
                    value={newCampaignValue}
                    onChange={(e) => setNewCampaignValue(e.target.value)}
                    className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  Coupon Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. FESTIVE20"
                  value={newCampaignCode}
                  onChange={(e) => setNewCampaignCode(e.target.value)}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px] uppercase font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#EAEAEA]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-[#EAEAEA] rounded-lg text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-black text-white font-semibold rounded-lg hover:bg-neutral-800"
                >
                  Create &amp; Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
