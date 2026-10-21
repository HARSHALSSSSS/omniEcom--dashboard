import { useState, useEffect } from "react";
import {
  ShieldAlert,
  XCircle,
  Check,
  RotateCw,
} from "lucide-react";
import {
  MOCK_PRICING_METRICS,
  MOCK_PRICING_PROPOSALS,
  MOCK_PRICING_RULES,
} from "@/mocks/data/phase10.data";
import type { PriceProposal, PricingRule } from "@/types/pricing";
import { formatINR } from "@/utils/format";
import { usePricingOverview, usePriceProposals, useActionProposal } from "@/hooks/usePricing";

export default function PricingPage() {
  const { data: overviewData, refetch, isFetching } = usePricingOverview();
  const { data: proposalsData } = usePriceProposals();
  const actionMutation = useActionProposal();

  const [activeTab, setActiveTab] = useState<"proposals" | "rules" | "history">(
    "proposals",
  );
  const [proposals, setProposals] = useState<PriceProposal[]>(
    MOCK_PRICING_PROPOSALS,
  );
  const [rules, setRules] = useState<PricingRule[]>(MOCK_PRICING_RULES);
  const [selectedProposal, setSelectedProposal] =
    useState<PriceProposal | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    proposal: PriceProposal;
    action: "approve" | "reject";
  } | null>(null);

  useEffect(() => {
    if (proposalsData?.proposals && proposalsData.proposals.length > 0) {
      setProposals(proposalsData.proposals);
    }
  }, [proposalsData?.proposals]);

  useEffect(() => {
    if (overviewData?.rules && overviewData.rules.length > 0) {
      setRules(overviewData.rules);
    }
  }, [overviewData?.rules]);

  const metrics = overviewData?.metrics ?? MOCK_PRICING_METRICS;

  const pendingCount = proposals.filter(
    (p) => p.status === "pending_review",
  ).length;

  const handleAction = (proposalId: string, action: "approve" | "reject") => {
    actionMutation.mutate({ id: proposalId, action });
    setProposals((prev) =>
      prev.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              status: action === "approve" ? "approved" : "rejected",
            }
          : p,
      ),
    );
    setConfirmModal(null);
    if (selectedProposal?.id === proposalId) {
      setSelectedProposal(null);
    }
  };

  const toggleRuleStatus = (ruleId: string) => {
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId
          ? { ...r, status: r.status === "active" ? "paused" : "active" }
          : r,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-6 w-full select-none pb-12 font-['Inter',sans-serif]">
      {/* Header & Advisory Notice */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAEAEA] pb-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold text-[#000000] tracking-tight">
              Pricing Control Center
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
              <ShieldAlert className="h-3 w-3" />
              Advisory Mode · Explicit Confirmation Required
            </span>
          </div>
          <p className="text-[13px] text-[#666666]">
            Review dynamic price proposals across sales channels. No price updates
            occur on marketplaces without your explicit approval.
          </p>
        </div>

        {/* Global tab selector & actions */}
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
          <div className="inline-flex items-center bg-neutral-100 p-1 rounded-lg border border-[#EAEAEA] shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("proposals")}
              className={`px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                activeTab === "proposals"
                  ? "bg-white text-black shadow-xs font-semibold"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              Price Proposals ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("rules")}
              className={`px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                activeTab === "rules"
                  ? "bg-white text-black shadow-xs font-semibold"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              Strategy Rules ({rules.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                activeTab === "history"
                  ? "bg-white text-black shadow-xs font-semibold"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              Audit Log
            </button>
          </div>
        </div>
      </div>

      {/* Metric Pulse Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-1 shadow-2xs">
          <span className="text-[11px] font-medium text-[#666666] uppercase tracking-wider">
            Pending Proposals
          </span>
          <span className="text-[24px] font-bold text-[#000000]">
            {pendingCount}
          </span>
          <span className="text-[11px] text-amber-600 font-medium">
            Requires seller review
          </span>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-1 shadow-2xs">
          <span className="text-[11px] font-medium text-[#666666] uppercase tracking-wider">
            Potential Margin Gain
          </span>
          <span className="text-[24px] font-bold text-[#16A34A]">
            +{formatINR((metrics as { potentialMarginGain?: number }).potentialMarginGain ?? 128400)}
          </span>
          <span className="text-[11px] text-[#666666]">
            Forecasted net increase
          </span>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-1 shadow-2xs">
          <span className="text-[11px] font-medium text-[#666666] uppercase tracking-wider">
            Active Guardrails
          </span>
          <span className="text-[24px] font-bold text-[#000000]">
            {rules.filter((r) => r.status === "active").length} rules
          </span>
          <span className="text-[11px] text-[#666666]">
            Protecting minimum margins
          </span>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex flex-col gap-1 shadow-2xs">
          <span className="text-[11px] font-medium text-[#666666] uppercase tracking-wider">
            Channel Coverage
          </span>
          <span className="text-[24px] font-bold text-[#000000]">
            4 Marketplaces
          </span>
          <span className="text-[11px] text-blue-600 font-medium">
            Amazon · Flipkart · Shopify · Meesho
          </span>
        </div>
      </div>

      {/* Tab 1: Proposals Table */}
      {activeTab === "proposals" && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 w-full bg-white border border-[#EAEAEA] rounded-xl overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-[#EAEAEA] flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#000000]">
                Proposals Ready for Action
              </span>
              <span className="text-[11px] text-[#666666]">
                Sorted by highest margin impact
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="bg-neutral-50/75 border-b border-[#EAEAEA] text-[#666666] font-medium text-[11px]">
                    <th className="py-3 px-4">Product / SKU</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4 text-right">Current Price</th>
                    <th className="py-3 px-4 text-right">Proposed Price</th>
                    <th className="py-3 px-4 text-right">Margin Δ</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAEA]">
                  {proposals.map((item) => {
                    const isPending = item.status === "pending_review";
                    const isSelected = selectedProposal?.id === item.id;

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedProposal(item)}
                        className={`hover:bg-neutral-50 cursor-pointer transition-colors ${
                          isSelected ? "bg-blue-50/50" : ""
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-[#000000] truncate max-w-[240px]">
                              {item.productName}
                            </span>
                            <span className="text-[11px] text-[#666666] font-mono">
                              {item.sku}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-[#000000]">
                          {item.channel}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-[#000000]">
                          {formatINR(item.currentPrice)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-blue-600">
                          {formatINR(item.proposedPrice)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span
                            className={`font-semibold ${
                              item.estimatedMarginDelta >= 0
                                ? "text-emerald-600"
                                : "text-amber-600"
                            }`}
                          >
                            {item.estimatedMarginDelta >= 0 ? "+" : ""}
                            {item.estimatedMarginDelta}%
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                              item.status === "approved"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : item.status === "rejected"
                                  ? "bg-neutral-100 text-neutral-600 border-neutral-300"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            {item.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {isPending ? (
                            <div
                              className="inline-flex items-center gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmModal({
                                    proposal: item,
                                    action: "approve",
                                  })
                                }
                                className="px-2.5 py-1 bg-black text-white rounded text-[11px] font-semibold hover:bg-neutral-800 transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmModal({
                                    proposal: item,
                                    action: "reject",
                                  })
                                }
                                className="px-2 py-1 bg-white border border-[#EAEAEA] text-neutral-600 rounded text-[11px] hover:bg-neutral-100 transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#888888]">
                              Decided
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Context Drawer / Detail for Selected Proposal */}
          {selectedProposal && (
            <div className="w-full lg:w-[380px] bg-white border border-[#EAEAEA] rounded-xl p-5 shadow-sm shrink-0 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-[#666666]">
                  Proposal Rationale & Analysis
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedProposal(null)}
                  className="text-neutral-400 hover:text-black"
                >
                  ✕
                </button>
              </div>

              <div>
                <h3 className="text-[14px] font-semibold text-[#000000]">
                  {selectedProposal.productName}
                </h3>
                <span className="text-[11px] text-[#666666] font-mono">
                  {selectedProposal.sku} · {selectedProposal.channel}
                </span>
              </div>

              <div className="bg-neutral-50 rounded-lg p-3.5 flex flex-col gap-2 border border-[#EAEAEA]">
                <span className="text-[11px] font-semibold text-[#000000]">
                  Recommendation Rationale
                </span>
                <p className="text-[12px] text-[#444444] leading-relaxed">
                  {selectedProposal.reasoning}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div className="p-3 border border-[#EAEAEA] rounded-lg">
                  <span className="text-[10px] text-[#666666] block">
                    Competitor Price
                  </span>
                  <span className="text-[14px] font-semibold text-[#000000]">
                    {selectedProposal.competitorPrice
                      ? formatINR(selectedProposal.competitorPrice)
                      : "N/A"}
                  </span>
                </div>
                <div className="p-3 border border-[#EAEAEA] rounded-lg">
                  <span className="text-[10px] text-[#666666] block">
                    Sales Velocity Δ
                  </span>
                  <span className="text-[14px] font-semibold text-blue-600">
                    {selectedProposal.projectedSalesDelta >= 0 ? "+" : ""}
                    {selectedProposal.projectedSalesDelta}%
                  </span>
                </div>
              </div>

              {selectedProposal.status === "pending_review" && (
                <div className="flex gap-2 pt-2 border-t border-[#EAEAEA]">
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmModal({
                        proposal: selectedProposal,
                        action: "approve",
                      })
                    }
                    className="flex-1 py-2 rounded-lg bg-black text-white text-[12px] font-semibold hover:bg-neutral-800 transition-colors"
                  >
                    Approve & Push Price
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmModal({
                        proposal: selectedProposal,
                        action: "reject",
                      })
                    }
                    className="px-4 py-2 rounded-lg bg-white border border-[#EAEAEA] text-[12px] text-[#444444] hover:bg-neutral-50 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Strategy Rules */}
      {activeTab === "rules" && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6 shadow-2xs flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-4">
            <div>
              <h2 className="text-[16px] font-semibold text-[#000000]">
                Channel Repricing Rules & Margin Floors
              </h2>
              <p className="text-[12px] text-[#666666]">
                Configure boundaries that prevent automated algorithms from reducing
                margins below sustainable thresholds.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="border border-[#EAEAEA] rounded-xl p-5 flex flex-col justify-between gap-4 bg-neutral-50/50"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#000000]">
                      {rule.name}
                    </h3>
                    <span className="text-[11px] text-blue-600 font-medium">
                      Target: {rule.channel}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleRuleStatus(rule.id)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                      rule.status === "active"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-neutral-100 text-neutral-500 border-neutral-200"
                    }`}
                  >
                    {rule.status === "active" ? "Active" : "Paused"}
                  </button>
                </div>

                <div className="space-y-2 text-[12px] pt-2 border-t border-[#EAEAEA]">
                  <div className="flex justify-between">
                    <span className="text-[#666666]">Min Margin Floor:</span>
                    <span className="font-semibold text-[#000000]">
                      {rule.targetMarginMin}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#666666]">Max Permitted Drop:</span>
                    <span className="font-semibold text-[#000000]">
                      {rule.maxDiscountPercent}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#666666]">Auto-apply Threshold:</span>
                    <span className="font-semibold text-[#000000]">
                      &lt; {rule.autoApproveUnderPercent}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: History */}
      {activeTab === "history" && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6 shadow-2xs">
          <h2 className="text-[16px] font-semibold text-[#000000] mb-2">
            Historical Price Adjustments
          </h2>
          <p className="text-[12px] text-[#666666] mb-4">
            Immutable log of all prices pushed to connected marketplaces.
          </p>
          <div className="divide-y divide-[#EAEAEA]">
            {proposals
              .filter((p) => p.status !== "pending_review")
              .map((p) => (
                <div key={p.id} className="py-3 flex items-center justify-between text-[12px]">
                  <div>
                    <span className="font-semibold text-[#000000]">
                      {p.productName}
                    </span>
                    <span className="text-[#666666] ml-2 font-mono">
                      ({p.sku}) on {p.channel}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-[#000000]">
                      {formatINR(p.currentPrice)} → {formatINR(p.proposedPrice)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        p.status === "approved"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Explicit Confirmation Dialog (Phase requirement: never change data without confirm) */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              {confirmModal.action === "approve" ? (
                <div className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Check className="h-5 w-5 stroke-[2.5]" />
                </div>
              ) : (
                <div className="h-9 w-9 rounded-full bg-neutral-100 text-neutral-700 flex items-center justify-center shrink-0">
                  <XCircle className="h-5 w-5" />
                </div>
              )}
              <div>
                <h3 className="text-[16px] font-semibold text-[#000000]">
                  {confirmModal.action === "approve"
                    ? "Confirm Live Price Push"
                    : "Reject Price Recommendation"}
                </h3>
                <span className="text-[12px] text-[#666666]">
                  Advisory confirmation step
                </span>
              </div>
            </div>

            <p className="text-[13px] text-[#444444] leading-relaxed">
              {confirmModal.action === "approve"
                ? `You are approving an update to ${confirmModal.proposal.productName} on ${confirmModal.proposal.channel}. The new price of ${formatINR(confirmModal.proposal.proposedPrice)} will be synchronized directly to the marketplace.`
                : `You are dismissing the price proposal for ${confirmModal.proposal.productName}. The current price of ${formatINR(confirmModal.proposal.currentPrice)} will remain unchanged.`}
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#EAEAEA]">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-lg border border-[#EAEAEA] text-[12px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  handleAction(confirmModal.proposal.id, confirmModal.action)
                }
                className={`px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition-colors ${
                  confirmModal.action === "approve"
                    ? "bg-black hover:bg-neutral-800"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {confirmModal.action === "approve"
                  ? "Confirm & Push Live"
                  : "Confirm Dismissal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
