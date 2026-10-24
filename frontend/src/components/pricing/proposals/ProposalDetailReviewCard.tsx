import { useState } from "react";
import { ChevronRight, Target, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/utils/format";
import { NO_APPROVE_REASON, STATUS_LABELS, STATUS_TONE, bpsText, isDecidable } from "../pricingFormat";
import type { PriceProposal } from "@/types/pricing";

interface ProposalDetailReviewCardProps {
  proposal: PriceProposal;
  currentIndex?: number;
  totalCount?: number;
  /** pricing:approve; a viewer sees the buttons disabled with the reason */
  canApprove: boolean;
  isSubmitting?: boolean;
  onNextProposal?: () => void;
  onRejectProposal?: () => void;
  onApproveProposal?: () => void;
}

const DASH = "—";
const money = (minor: number | null): string => (minor === null ? DASH : formatINR(minor));
const signedMoney = (minor: number | null): string => (minor === null ? DASH : `${minor > 0 ? "+" : minor < 0 ? "-" : ""}${formatINR(Math.abs(minor))}`);
const margin = (bps: number | null): string => (bps === null ? DASH : bpsText(bps));

/** the real review of one proposal: every number is a backend field, an unknown one is a dash and says why */
export function ProposalDetailReviewCard({
  proposal: p,
  currentIndex = 1,
  totalCount = 1,
  canApprove,
  isSubmitting = false,
  onNextProposal,
  onRejectProposal,
  onApproveProposal,
}: ProposalDetailReviewCardProps) {
  // a review aid only: the approval itself is confirmed in the decision dialog
  const [checkedUnitCost, setCheckedUnitCost] = useState(false);
  const [checkedFees, setCheckedFees] = useState(false);
  const [checkedPrice, setCheckedPrice] = useState(false);

  const costKnown = p.unitCostMinor !== null;
  const feesKnown = p.feesMinor !== null;
  const priceDiff = p.proposedPriceMinor - p.currentPriceMinor;
  // contribution per unit needs the cost; a channel without a fee profile is shown before fees (as the margin is)
  const contribution = (price: number, fees: number | null): number | null => (p.unitCostMinor === null ? null : price - p.unitCostMinor - (fees ?? 0));
  const currentContribution = contribution(p.currentPriceMinor, p.feesMinor);
  const proposedContribution = contribution(p.proposedPriceMinor, p.proposedFeesMinor);
  const contributionDiff = currentContribution !== null && proposedContribution !== null ? proposedContribution - currentContribution : null;
  const marginDiffBps = p.currentMarginBps !== null && p.proposedMarginBps !== null ? p.proposedMarginBps - p.currentMarginBps : null;
  const targetGapBps = p.proposedMarginBps !== null && p.targetMarginBps !== null ? p.proposedMarginBps - p.targetMarginBps : null;
  const decidable = isDecidable(p);
  const approveBlocked = !canApprove || !decidable;
  const blockReason = !canApprove ? NO_APPROVE_REASON : !decidable ? `This proposal is ${STATUS_LABELS[p.status].toLowerCase()}` : undefined;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6">
      {/* 1. Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-neutral-100">
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">PROPOSAL REVIEW</span>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {p.productTitle} · {p.sku}
          </h2>
          <p className="text-xs text-muted-foreground">
            {p.sku} · {p.channelName}
            {p.policyName ? ` · ${p.policyName}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[p.status]}`}>{STATUS_LABELS[p.status]}</span>

          {totalCount > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground font-medium">
                {currentIndex} of {totalCount}
              </span>
              {onNextProposal && (
                <Button variant="outline" size="sm" onClick={onNextProposal} className="h-8 px-2.5 text-xs font-semibold gap-1">
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
            <h3 className="text-sm font-bold text-foreground">Price & margin comparison</h3>
            <span className="text-[11px] text-muted-foreground font-medium">
              {p.targetMarginBps === null ? "No margin target on this proposal" : `Margin target ≥ ${margin(p.targetMarginBps)}`}
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
                  <td className="py-2.5 text-foreground font-semibold">{formatINR(p.currentPriceMinor)}</td>
                  <td className="py-2.5 text-foreground font-semibold">{formatINR(p.proposedPriceMinor)}</td>
                  <td className={`py-2.5 text-right font-semibold ${priceDiff >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{signedMoney(priceDiff)}</td>
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-foreground">Unit cost</td>
                  <td className="py-2.5 text-muted-foreground">{costKnown ? money(p.unitCostMinor) : "Cost not set"}</td>
                  <td className="py-2.5 text-muted-foreground">{costKnown ? money(p.unitCostMinor) : "Cost not set"}</td>
                  <td className="py-2.5 text-right text-muted-foreground">{costKnown ? "Unchanged" : DASH}</td>
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-foreground">Channel fees</td>
                  <td className="py-2.5 text-muted-foreground">{feesKnown ? money(p.feesMinor) : "Not configured"}</td>
                  <td className="py-2.5 text-muted-foreground">{feesKnown ? money(p.proposedFeesMinor) : "Not configured"}</td>
                  <td className="py-2.5 text-right text-muted-foreground">
                    {feesKnown && p.feesMinor !== null && p.proposedFeesMinor !== null ? signedMoney(p.proposedFeesMinor - p.feesMinor) : DASH}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 font-medium text-foreground">Est. contribution / unit</td>
                  <td className="py-2.5 text-foreground font-semibold">{money(currentContribution)}</td>
                  <td className="py-2.5 text-foreground font-semibold">{money(proposedContribution)}</td>
                  <td className={`py-2.5 text-right font-semibold ${contributionDiff !== null && contributionDiff < 0 ? "text-rose-700" : "text-emerald-700"}`}>{signedMoney(contributionDiff)}</td>
                </tr>
                <tr className="border-t border-neutral-300">
                  <td className="py-2.5 font-bold text-foreground">Est. contribution margin</td>
                  <td className={`py-2.5 font-bold ${p.currentMarginBps !== null && p.targetMarginBps !== null && p.currentMarginBps < p.targetMarginBps ? "text-amber-600" : "text-foreground"}`}>
                    {margin(p.currentMarginBps)}
                  </td>
                  <td className="py-2.5 font-bold text-foreground">{margin(p.proposedMarginBps)}</td>
                  <td className="py-2.5 text-right font-bold text-foreground">
                    {marginDiffBps === null ? DASH : `${marginDiffBps > 0 ? "+" : ""}${(marginDiffBps / 100).toFixed(1)} pp`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Est. contribution margin = (price - unit cost - channel fees) / price.
            {!costKnown && " The cost price is not set, so margins are unknown: add it on the product's variants."}
            {costKnown && !feesKnown && " Channel fees are not configured, so margins are shown before fees."}
          </p>

          <div className="flex items-center gap-2 rounded-lg bg-neutral-100 p-2.5 text-xs text-foreground font-medium">
            <Target className="h-4 w-4 text-neutral-700 shrink-0" />
            <span>
              {targetGapBps === null
                ? p.targetMarginBps === null
                  ? "No margin target is set on this proposal's policy."
                  : "The proposed margin cannot be compared with the target: the cost price is not set."
                : targetGapBps === 0
                  ? `The proposed ${margin(p.proposedMarginBps)} margin is exactly at the target.`
                  : `The proposed ${margin(p.proposedMarginBps)} margin is ${(Math.abs(targetGapBps) / 100).toFixed(1)} percentage points ${targetGapBps > 0 ? "above" : "below"} the target.`}
            </span>
          </div>
        </div>

        {/* Right Column: Reason & Checklist */}
        <div className="lg:col-span-5 rounded-xl border border-neutral-200 bg-neutral-50/40 p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">REASON</span>
              <h4 className="text-sm font-bold text-foreground mt-0.5">{REASON_TITLES[p.reasonCode] ?? "Price proposal"}</h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{p.reasonText}</p>
            </div>

            {/* Checklist (a review aid) */}
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
                  <span>{costKnown ? `Confirm the ${money(p.unitCostMinor)} unit cost.` : "Unit cost is not set: the margin is unknown."}</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                  <input
                    type="checkbox"
                    checked={checkedFees}
                    onChange={(e) => setCheckedFees(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-neutral-300 text-black focus:ring-black accent-black"
                  />
                  <span>{feesKnown ? `Confirm ${money(p.feesMinor)} in channel fees.` : "Channel fees are not configured for this channel."}</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                  <input
                    type="checkbox"
                    checked={checkedPrice}
                    onChange={(e) => setCheckedPrice(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-neutral-300 text-black focus:ring-black accent-black"
                  />
                  <span>
                    Review the {formatINR(p.proposedPriceMinor)} proposed {p.channelName} price.
                  </span>
                </label>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground pt-2 border-t border-neutral-200">
            Your review and approval are required before any price is applied. The checklist is a reminder; approving asks for a final confirmation.
          </p>
        </div>
      </div>

      {/* 3. Bottom Decision Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-neutral-100">
        <div className="text-xs">
          <p className="font-bold text-foreground">{decidable ? "No decision recorded" : STATUS_LABELS[p.status]}</p>
          <p className="text-muted-foreground mt-0.5">
            {p.status === "approved" || p.status === "auto_applied"
              ? `The price was set to ${formatINR(p.proposedPriceMinor)}`
              : `Current price remains ${formatINR(p.currentPriceMinor)} · Nothing has been applied`}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" disabled title="Proposals cannot be edited: reject it and generate a new one" className="text-xs h-9 px-4 font-semibold">
            Edit proposal
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRejectProposal}
            disabled={isSubmitting || approveBlocked}
            title={blockReason}
            className="text-xs h-9 px-4 font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          >
            Reject proposal
          </Button>
          <Button
            size="sm"
            onClick={onApproveProposal}
            disabled={isSubmitting || approveBlocked}
            title={blockReason}
            className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold"
          >
            Approve proposal
          </Button>
        </div>
      </div>

      {/* Advisory footnote */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-2">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        <span>Based on your cost prices and channel fee settings; excludes shipping, discounts, returns and overhead. No prices change until a proposal is approved.</span>
      </div>
    </div>
  );
}

const REASON_TITLES: Record<string, string> = {
  below_margin_target: "Below margin target",
  competitor_undercut: "Competitor undercut",
  competitor_above: "Room to raise the price",
  competitor_match: "Match the competitor",
  slow_velocity: "Slow sales",
  target_margin: "Target margin price",
};
