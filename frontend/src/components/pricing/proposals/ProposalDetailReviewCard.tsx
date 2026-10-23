import { useState } from "react";
import { ChevronRight, Target, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ProposalDetailData {
  id: string;
  productTitle: string;
  sku: string;
  channel: string;
  marketplace: string;
  currentPrice: number;
  proposedPrice: number;
  unitCost: number;
  feesAndShipping: number;
  currentMarginPct: number;
  proposedMarginPct: number;
  targetMarginPct?: number;
  reason: string;
  reasonDescription?: string;
  decisionState?: "none" | "approved" | "rejected";
  version?: number;
}

interface ProposalDetailReviewCardProps {
  proposal: ProposalDetailData;
  currentIndex?: number;
  totalCount?: number;
  onNextProposal?: () => void;
  onEditProposal?: () => void;
  onRejectProposal?: () => void;
  onApproveProposal?: () => void;
  isSubmitting?: boolean;
}

export function ProposalDetailReviewCard({
  proposal,
  currentIndex = 1,
  totalCount = 3,
  onNextProposal,
  onEditProposal,
  onRejectProposal,
  onApproveProposal,
  isSubmitting = false,
}: ProposalDetailReviewCardProps) {
  // Checkbox states for checklist before approving
  const [checkedUnitCost, setCheckedUnitCost] = useState(false);
  const [checkedFees, setCheckedFees] = useState(false);
  const [checkedPrice, setCheckedPrice] = useState(false);

  const priceDiff = proposal.proposedPrice - proposal.currentPrice;
  const currentContribution = proposal.currentPrice - proposal.unitCost - proposal.feesAndShipping;
  const proposedContribution = proposal.proposedPrice - proposal.unitCost - proposal.feesAndShipping;
  const contributionDiff = proposedContribution - currentContribution;
  const marginDiffPp = proposal.proposedMarginPct - proposal.currentMarginPct;

  const targetMargin = proposal.targetMarginPct ?? 30.0;
  const pointsAboveTarget = (proposal.proposedMarginPct - targetMargin).toFixed(1);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6">
      {/* 1. Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-neutral-100">
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            PROPOSAL REVIEW
          </span>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {proposal.productTitle} · {proposal.sku}
          </h2>
          <p className="text-xs text-muted-foreground">
            {proposal.sku} · {proposal.channel} · Illustrative proposal
          </p>
        </div>

        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Pending review
          </span>

          {totalCount > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground font-medium">
                {currentIndex} of {totalCount}
              </span>
              {onNextProposal && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNextProposal}
                  className="h-8 px-2.5 text-xs font-semibold gap-1"
                >
                  <span>Next proposal</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Main Two-Column Analysis Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Price & margin comparison */}
        <div className="lg:col-span-7 rounded-xl border border-neutral-200 bg-neutral-50/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">
              Price & margin comparison
            </h3>
            <span className="text-[11px] text-muted-foreground font-medium">
              Margin target ≥ {targetMargin}%
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-neutral-200 text-muted-foreground font-medium">
                  <th className="pb-2 font-medium">Per unit · INR, excluding tax</th>
                  <th className="pb-2 font-medium">Current</th>
                  <th className="pb-2 font-medium">Proposed</th>
                  <th className="pb-2 font-medium text-right">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/70">
                <tr>
                  <td className="py-2.5 font-medium text-foreground">Channel price</td>
                  <td className="py-2.5 text-foreground font-semibold">
                    ₹{proposal.currentPrice.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-foreground font-semibold">
                    ₹{proposal.proposedPrice.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right font-semibold text-emerald-700">
                    +{priceDiff >= 0 ? `₹${priceDiff.toLocaleString()}` : `-₹${Math.abs(priceDiff).toLocaleString()}`}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-foreground">Unit cost</td>
                  <td className="py-2.5 text-muted-foreground">₹{proposal.unitCost.toLocaleString()}</td>
                  <td className="py-2.5 text-muted-foreground">₹{proposal.unitCost.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-muted-foreground">Unchanged</td>
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-foreground">Fees + shipping</td>
                  <td className="py-2.5 text-muted-foreground">₹{proposal.feesAndShipping.toLocaleString()}</td>
                  <td className="py-2.5 text-muted-foreground">₹{proposal.feesAndShipping.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-muted-foreground">Unchanged</td>
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-foreground">Est. contribution / unit</td>
                  <td className="py-2.5 text-foreground font-semibold">
                    ₹{currentContribution.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-foreground font-semibold">
                    ₹{proposedContribution.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right font-semibold text-emerald-700">
                    +{contributionDiff >= 0 ? `₹${contributionDiff.toLocaleString()}` : `-₹${Math.abs(contributionDiff).toLocaleString()}`}
                  </td>
                </tr>
                <tr className="border-t border-neutral-300">
                  <td className="py-2.5 font-bold text-foreground">Est. contribution margin</td>
                  <td className="py-2.5 font-bold text-amber-600">
                    {proposal.currentMarginPct.toFixed(1)}%
                  </td>
                  <td className="py-2.5 font-bold text-foreground">
                    {proposal.proposedMarginPct.toFixed(1)}%
                  </td>
                  <td className="py-2.5 text-right font-bold text-emerald-700">
                    +{marginDiffPp.toFixed(1)} pp
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Est. contribution margin = (price - unit cost - fees & shipping) / price.
          </p>

          <div className="flex items-center gap-2 rounded-lg bg-neutral-100 p-2.5 text-xs text-foreground font-medium">
            <Target className="h-4 w-4 text-neutral-700 shrink-0" />
            <span>
              The proposed {proposal.proposedMarginPct.toFixed(1)}% margin is {pointsAboveTarget} percentage points above the target.
            </span>
          </div>
        </div>

        {/* Right Column: Reason & Checklist */}
        <div className="lg:col-span-5 rounded-xl border border-neutral-200 bg-neutral-50/40 p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                REASON
              </span>
              <h4 className="text-sm font-bold text-foreground mt-0.5">
                {proposal.reason}
              </h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {proposal.reasonDescription ||
                  `The current ${proposal.channel} price yields a ${proposal.currentMarginPct.toFixed(1)}% estimated margin. Increasing the price by ₹${priceDiff} brings it above the ${targetMargin}% target, using the same costs and fees.`}
              </p>
            </div>

            {/* Checklist */}
            <div className="pt-2 space-y-2">
              <p className="text-xs font-bold text-foreground">Before approving:</p>
              <div className="space-y-2 text-xs">
                <label className="flex items-center gap-2.5 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                  <input
                    type="checkbox"
                    checked={checkedUnitCost}
                    onChange={(e) => setCheckedUnitCost(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-neutral-300 text-black focus:ring-black accent-black"
                  />
                  <span>Confirm the ₹{proposal.unitCost.toLocaleString()} unit cost.</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                  <input
                    type="checkbox"
                    checked={checkedFees}
                    onChange={(e) => setCheckedFees(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-neutral-300 text-black focus:ring-black accent-black"
                  />
                  <span>Confirm ₹{proposal.feesAndShipping.toLocaleString()} in fees + shipping.</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                  <input
                    type="checkbox"
                    checked={checkedPrice}
                    onChange={(e) => setCheckedPrice(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-neutral-300 text-black focus:ring-black accent-black"
                  />
                  <span>Review the ₹{proposal.proposedPrice.toLocaleString()} proposed {proposal.channel} price.</span>
                </label>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground pt-2 border-t border-neutral-200">
            Your review and approval are required before any price is applied. This proposal remains pending and unapplied.
          </p>
        </div>
      </div>

      {/* 3. Bottom Decision Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-neutral-100">
        <div className="text-xs">
          <p className="font-bold text-foreground">No decision recorded</p>
          <p className="text-muted-foreground mt-0.5">
            Current price remains ₹{proposal.currentPrice.toLocaleString()} · Nothing has been applied
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onEditProposal}
            disabled={isSubmitting}
            className="text-xs h-9 px-4 font-semibold"
          >
            Edit proposal
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRejectProposal}
            disabled={isSubmitting}
            className="text-xs h-9 px-4 font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          >
            Reject proposal
          </Button>
          <Button
            size="sm"
            onClick={onApproveProposal}
            disabled={isSubmitting}
            className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold"
          >
            Approve proposal
          </Button>
        </div>
      </div>

      {/* Advisory footnote */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-2">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        <span>
          All records are illustrative, not synced or verified. Estimates use unchanged example costs and fees; excludes discounts, returns and overhead. No prices changed automatically.
        </span>
      </div>
    </div>
  );
}
