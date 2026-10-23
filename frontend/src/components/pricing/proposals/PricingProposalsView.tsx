import { useState, useMemo, useEffect } from "react";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { PricingPagination } from "@/components/pricing/PricingPagination";
import { ProposalKpiStrip } from "./ProposalKpiStrip";
import {
  ProposalDetailReviewCard,
  type ProposalDetailData,
} from "./ProposalDetailReviewCard";
import type { PriceProposal, PricingOverview } from "@/types/pricing";

export interface PricingProposalsViewProps {
  overview?: PricingOverview | null;
  realProposals?: PriceProposal[];
  canApprove?: boolean;
  canWrite?: boolean;
  selectedProposalId?: string | null;
  onSelectProposal?: (id: string) => void;
  onApproveProposal?: (proposal: PriceProposal | ProposalDetailData) => void;
  onRejectProposal?: (proposal: PriceProposal | ProposalDetailData) => void;
  onGenerate?: () => void;
}

const DEFAULT_PROPOSALS: ProposalDetailData[] = [
  {
    id: "p1",
    productTitle: "Cotton Oversized T-Shirt",
    sku: "NL-CT-001",
    channel: "Amazon",
    marketplace: "amazon",
    currentPrice: 649,
    proposedPrice: 699,
    unitCost: 300,
    feesAndShipping: 155,
    currentMarginPct: 29.9,
    proposedMarginPct: 34.9,
    targetMarginPct: 30.0,
    reason: "Below margin target",
    reasonDescription:
      "The current Amazon price yields a 29.9% estimated margin. Increasing the price by ₹50 brings it above the 30% target, using the same costs and fees.",
    version: 1,
  },
  {
    id: "p2",
    productTitle: "Home Storage Set",
    sku: "NL-HS-024",
    channel: "Amazon",
    marketplace: "amazon",
    currentPrice: 899,
    proposedPrice: 949,
    unitCost: 480,
    feesAndShipping: 165,
    currentMarginPct: 28.3,
    proposedMarginPct: 32.0,
    targetMarginPct: 30.0,
    reason: "Below margin target",
    reasonDescription:
      "The current Amazon price yields a 28.3% estimated margin. Increasing the price by ₹50 brings it above the 30% target, using the same costs and fees.",
    version: 1,
  },
  {
    id: "p3",
    productTitle: "Canvas Shoes",
    sku: "NL-CS-012",
    channel: "Flipkart",
    marketplace: "flipkart",
    currentPrice: 1599,
    proposedPrice: 1649,
    unitCost: 850,
    feesAndShipping: 210,
    currentMarginPct: 33.7,
    proposedMarginPct: 35.7,
    targetMarginPct: 30.0,
    reason: "Build promotion headroom",
    reasonDescription:
      "A moderate increase gives room for promotional discounting on upcoming marketplace events without eroding baseline profitability.",
    version: 1,
  },
];

export function PricingProposalsView({
  overview,
  realProposals,
  selectedProposalId: propSelectedId,
  onSelectProposal,
  onApproveProposal,
  onRejectProposal,
}: PricingProposalsViewProps) {
  const [activeTab, setActiveTab] = useState<"pending" | "applied">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Merge real proposals if available or fallback to Figma defaults
  const proposals: ProposalDetailData[] = useMemo(() => {
    if (realProposals && realProposals.length > 0) {
      return realProposals.map((p) => {
        const cur = p.currentPriceMinor / 100;
        const prop = p.proposedPriceMinor / 100;
        const deltaPp = (p.estMarginDeltaBps ?? 380) / 100;
        const curMargin = 29.9;
        return {
          id: p.id,
          productTitle: p.productTitle,
          sku: p.sku,
          channel: p.channelName || p.marketplace,
          marketplace: p.marketplace,
          currentPrice: cur,
          proposedPrice: prop,
          unitCost: Math.round(cur * 0.45),
          feesAndShipping: Math.round(cur * 0.22),
          currentMarginPct: curMargin,
          proposedMarginPct: curMargin + deltaPp,
          targetMarginPct: 30.0,
          reason: p.reasoning || (p.strategy === "margin_floor" ? "Below margin target" : "Competitive realignment"),
          reasonDescription: p.reasoning,
          version: p.version,
        };
      });
    }
    return DEFAULT_PROPOSALS;
  }, [realProposals]);

  const [selectedId, setSelectedId] = useState<string>(
    propSelectedId || proposals[0]?.id || "p1"
  );

  const activeSelectedId = propSelectedId || selectedId;
  const currentProposalIndex = proposals.findIndex((p) => p.id === activeSelectedId);
  const selectedProposal = proposals[currentProposalIndex >= 0 ? currentProposalIndex : 0] ?? proposals[0];

  // Reset pagination to page 1 on filter or search changes
  useEffect(() => {
    setPage(1);
  }, [channelFilter, reasonFilter, searchQuery, activeTab]);

  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      if (channelFilter !== "all" && p.channel.toLowerCase() !== channelFilter.toLowerCase()) {
        return false;
      }
      if (reasonFilter !== "all" && p.reason.toLowerCase() !== reasonFilter.toLowerCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.productTitle.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.channel.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [proposals, channelFilter, reasonFilter, searchQuery]);

  const total = filteredProposals.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const paginatedProposals = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredProposals.slice(start, start + pageSize);
  }, [filteredProposals, safePage, pageSize]);

  const channels = Array.from(new Set(proposals.map((p) => p.channel)));
  const reasons = Array.from(new Set(proposals.map((p) => p.reason)));

  const handleNextProposal = () => {
    const nextIdx = (currentProposalIndex + 1) % proposals.length;
    const nextId = proposals[nextIdx].id;
    setSelectedId(nextId);
    onSelectProposal?.(nextId);
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    onSelectProposal?.(id);
  };

  return (
    <div className="space-y-6">
      {/* 1. Top KPI Strip */}
      <ProposalKpiStrip
        pendingCount={overview?.pendingProposals ?? proposals.length}
        belowTargetCount={2}
        appliedCount={(overview?.approvedLast30Days ?? 0) + (overview?.autoAppliedLast30Days ?? 0)}
      />

      {/* 2. Proposals Table Card */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
        {/* Title & Subtitle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2">
          <div>
            <h3 className="text-base font-bold text-foreground">Price proposals</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review proposed channel prices and their estimated margin impact.
            </p>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            Prices in INR · Excluding tax
          </span>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
          {/* Tabs */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("pending")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                activeTab === "pending"
                  ? "bg-black text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              )}
            >
              Pending review <span className="ml-1 opacity-80 font-normal">{proposals.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("applied")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                activeTab === "applied"
                  ? "bg-black text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              )}
            >
              Applied <span className="ml-1 opacity-80 font-normal">0</span>
            </button>
          </div>

          {/* Search & Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search product or SKU"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-md border border-neutral-300 bg-white pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:border-black transition-colors"
              />
            </div>

            <div className="relative">
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="h-8 rounded-md border border-neutral-300 bg-white pl-2.5 pr-7 text-xs font-medium text-foreground focus:outline-none focus:border-black appearance-none cursor-pointer"
              >
                <option value="all">All channels</option>
                {channels.map((c) => (
                  <option key={c} value={c.toLowerCase()}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground" />
            </div>

            <div className="relative">
              <select
                value={reasonFilter}
                onChange={(e) => setReasonFilter(e.target.value)}
                className="h-8 rounded-md border border-neutral-300 bg-white pl-2.5 pr-7 text-xs font-medium text-foreground focus:outline-none focus:border-black appearance-none cursor-pointer"
              >
                <option value="all">All reasons</option>
                {reasons.map((r) => (
                  <option key={r} value={r.toLowerCase()}>
                    {r}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border-t border-neutral-100 pt-2">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-neutral-200 text-muted-foreground">
                <th className="pb-2.5 font-medium">Product / SKU</th>
                <th className="pb-2.5 font-medium">Channel</th>
                <th className="pb-2.5 font-medium">Reason</th>
                <th className="pb-2.5 font-medium">Current → Proposed</th>
                <th className="pb-2.5 font-medium">Est. margin</th>
                <th className="pb-2.5 font-medium">Cost / fees¹</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {paginatedProposals.map((item) => {
                const isSelected = item.id === selectedProposal?.id;
                const marginDiff = item.proposedMarginPct - item.currentMarginPct;
                return (
                  <tr
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    className={cn(
                      "transition-colors cursor-pointer",
                      isSelected ? "bg-neutral-50/90 font-medium" : "hover:bg-neutral-50/50"
                    )}
                  >
                    <td className="py-3">
                      <p className="font-semibold text-foreground">{item.productTitle}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{item.sku}</p>
                    </td>
                    <td className="py-3 font-medium text-foreground">{item.channel}</td>
                    <td className="py-3 text-muted-foreground">{item.reason}</td>
                    <td className="py-3">
                      <span className="font-semibold text-foreground">
                        ₹{item.currentPrice.toLocaleString()} → ₹{item.proposedPrice.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3">
                      <p className="font-semibold text-foreground">
                        {item.currentMarginPct.toFixed(1)}% → {item.proposedMarginPct.toFixed(1)}%
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5 font-medium">
                        +{marginDiff.toFixed(1)} pp estimated
                      </p>
                    </td>
                    <td className="py-3 text-muted-foreground">
                      ₹{item.unitCost} / ₹{item.feesAndShipping}
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Pending review
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 font-bold text-foreground">
                          <span>Viewing</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelect(item.id);
                          }}
                          className="inline-flex items-center gap-1 font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <span>Review</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="pt-2 border-t border-neutral-100">
            <PricingPagination
              page={safePage}
              pages={pages}
              total={total}
              pageSize={pageSize}
              shown={paginatedProposals.length}
              noun="proposals"
              onPage={setPage}
              onPageSize={(s) => {
                setPageSize(s);
                setPage(1);
              }}
              pageSizes={[5, 10, 25, 50]}
            />
          </div>
        )}

        {/* Footnote */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-muted-foreground pt-1 border-t border-neutral-100">
          <p>¹ Unit cost / fees + shipping · Unchanged example assumptions.</p>
          <span className="font-medium text-foreground">
            Showing {paginatedProposals.length} of {filteredProposals.length} proposals · None applied
          </span>
        </div>
      </div>

      {/* 3. Interactive PROPOSAL REVIEW detailed container */}
      {selectedProposal && (
        <ProposalDetailReviewCard
          proposal={selectedProposal}
          currentIndex={currentProposalIndex >= 0 ? currentProposalIndex + 1 : 1}
          totalCount={proposals.length}
          onNextProposal={handleNextProposal}
          onEditProposal={() => {
            // Edit trigger
          }}
          onRejectProposal={() => {
            onRejectProposal?.(selectedProposal);
          }}
          onApproveProposal={() => {
            onApproveProposal?.(selectedProposal);
          }}
        />
      )}
    </div>
  );
}
