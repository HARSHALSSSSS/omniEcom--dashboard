import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProposalKpiStrip } from "./ProposalKpiStrip";
import { ProposalDetailReviewCard } from "./ProposalDetailReviewCard";
import type { PriceProposal } from "@/types/pricing";

const proposal = (over: Partial<PriceProposal> = {}): PriceProposal => ({
  id: "p1", status: "pending_review", strategy: "margin_floor", variantId: "v1", sku: "KURTA-M", productTitle: "Cotton Kurta", accountId: "a1", channelName: "Main Store", marketplace: "shopify",
  policyId: "pol", policyName: "Floor", currentPriceMinor: 49900, proposedPriceMinor: 54600, currency: "INR", priceChangeBps: 942, competitorPriceMinor: null, estMarginDeltaBps: 512,
  projectedSalesDeltaBps: null, reasoning: "Floor", unitCostMinor: 30000, feesMinor: 4990, proposedFeesMinor: 5460, currentMarginBps: 2988, proposedMarginBps: 3500, targetMarginBps: 3500,
  reasonCode: "below_margin_target", reasonText: "Current margin is 29.88%, below the 35% target.", expiresAt: null, createdAt: "2026-10-01T00:00:00.000Z", decidedBy: null, decidedByName: null,
  decidedAt: null, decisionNote: null, appliedAt: null, failureMessage: null, pushSkipped: false, version: 3, ...over,
});

describe("ProposalKpiStrip", () => {
  it("shows the real counts and the real target", () => {
    render(<ProposalKpiStrip pendingCount={7} belowTargetCount={2} targetMarginBps={3500} appliedCount={4} />);
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Target ≥ 35% · Per channel")).toBeInTheDocument();
  });

  it("shows dashes while loading and says when there is no target", () => {
    const { rerender } = render(<ProposalKpiStrip />);
    expect(screen.getAllByText("—")).toHaveLength(3);
    rerender(<ProposalKpiStrip pendingCount={0} belowTargetCount={0} targetMarginBps={null} appliedCount={0} />);
    expect(screen.getByText("No margin target on pending proposals")).toBeInTheDocument();
  });
});

describe("ProposalDetailReviewCard", () => {
  it("compares real cost, fees, contribution and margins", () => {
    render(<ProposalDetailReviewCard proposal={proposal()} canApprove />);
    expect(screen.getByText("Cotton Kurta · KURTA-M")).toBeInTheDocument();
    expect(screen.getByText("₹499")).toBeInTheDocument();
    expect(screen.getByText("₹546")).toBeInTheDocument();
    expect(screen.getByText("+₹47")).toBeInTheDocument();
    expect(screen.getByText("29.88%")).toBeInTheDocument();
    expect(screen.getAllByText("35%").length).toBeGreaterThan(0);
    expect(screen.getByText("+5.1 pp")).toBeInTheDocument();
    expect(screen.getByText("Below margin target")).toBeInTheDocument();
    expect(screen.getByText("Current margin is 29.88%, below the 35% target.")).toBeInTheDocument();
    expect(screen.getByText(/exactly at the target/)).toBeInTheDocument();
    expect(screen.getByText("Confirm the ₹300 unit cost.")).toBeInTheDocument();
    expect(screen.queryByText(/illustrative/i)).not.toBeInTheDocument();
  });

  it("shows an unknown cost honestly: dashes, 'cost not set', and the checklist still works", async () => {
    const user = userEvent.setup();
    render(<ProposalDetailReviewCard proposal={proposal({ unitCostMinor: null, currentMarginBps: null, proposedMarginBps: null, targetMarginBps: null })} canApprove />);
    expect(screen.getAllByText("Cost not set")).toHaveLength(2);
    expect(screen.getByText(/cost price is not set, so margins are unknown/)).toBeInTheDocument();
    expect(screen.getByText(/No margin target is set/)).toBeInTheDocument();
    expect(screen.getByText("Unit cost is not set: the margin is unknown.")).toBeInTheDocument();
    const box = screen.getByLabelText("Unit cost is not set: the margin is unknown.");
    await user.click(box);
    expect(box).toBeChecked();
  });

  it("says when channel fees are not configured", () => {
    render(<ProposalDetailReviewCard proposal={proposal({ feesMinor: null, proposedFeesMinor: null })} canApprove />);
    expect(screen.getAllByText("Not configured")).toHaveLength(2);
    expect(screen.getByText("Channel fees are not configured for this channel.")).toBeInTheDocument();
    expect(screen.getByText(/margins are shown before fees/)).toBeInTheDocument();
  });

  it("approve and reject use the real handlers; a viewer is disabled with the reason; a decided proposal cannot be decided", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const { rerender } = render(<ProposalDetailReviewCard proposal={proposal()} canApprove onApproveProposal={onApprove} onRejectProposal={onReject} />);
    await user.click(screen.getByRole("button", { name: "Approve proposal" }));
    await user.click(screen.getByRole("button", { name: "Reject proposal" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);

    rerender(<ProposalDetailReviewCard proposal={proposal()} canApprove={false} onApproveProposal={onApprove} />);
    const approve = screen.getByRole("button", { name: "Approve proposal" });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAttribute("title", "Only admins can approve or reject price proposals");

    rerender(<ProposalDetailReviewCard proposal={proposal({ status: "approved" })} canApprove onApproveProposal={onApprove} />);
    expect(screen.getByRole("button", { name: "Approve proposal" })).toBeDisabled();
    expect(screen.getByText("The price was set to ₹546")).toBeInTheDocument();
  });

  it("walks to the next proposal", async () => {
    const user = userEvent.setup();
    const next = vi.fn();
    render(<ProposalDetailReviewCard proposal={proposal()} canApprove currentIndex={1} totalCount={3} onNextProposal={next} />);
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Next proposal/ }));
    expect(next).toHaveBeenCalled();
  });
});
