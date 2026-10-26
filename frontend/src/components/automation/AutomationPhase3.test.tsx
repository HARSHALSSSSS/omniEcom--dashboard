import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutomationPipelineOverview } from "./AutomationPipelineOverview";
import { RuleFilterRail } from "./RuleFilterRail";
import { RuleInspectorDrawer } from "./RuleInspectorDrawer";

describe("AutomationPhase3 Components", () => {
  it("renders AutomationPipelineOverview with 4 stages and approval items", async () => {
    const onReview = vi.fn();
    const onDismiss = vi.fn();
    const onViewAllApprovals = vi.fn();
    const user = userEvent.setup();

    render(
      <AutomationPipelineOverview
        pipeline={{
          observedSignals: 24,
          recommendedActions: 8,
          awaitingApproval: 3,
          completedRuns: 42,
        }}
        onReviewApproval={onReview}
        onDismissApproval={onDismiss}
        onViewAllApprovals={onViewAllApprovals}
      />
    );

    expect(screen.getByText("FROM SIGNAL TO CONTROLLED ACTION")).toBeInTheDocument();
    expect(screen.getByText("Observe")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("Recommend")).toBeInTheDocument();
    expect(screen.getAllByText("8").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Execute")).toBeInTheDocument();
    expect(screen.getAllByText("42").length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText("Waiting for Your Approval")).toBeInTheDocument();
    expect(screen.getByText("Update prices for 12 products")).toBeInTheDocument();

    const reviewButtons = screen.getAllByRole("button", { name: "Review" });
    await user.click(reviewButtons[0]);
    expect(onReview).toHaveBeenCalled();

    const viewQueueBtn = screen.getByRole("button", { name: /View queue/i });
    await user.click(viewQueueBtn);
    expect(onViewAllApprovals).toHaveBeenCalled();
  });

  it("renders RuleFilterRail and supports mode selection", async () => {
    const onSelectMode = vi.fn();
    const user = userEvent.setup();

    render(<RuleFilterRail selectedMode="All Modes" onSelectMode={onSelectMode} />);

    expect(screen.getByText("Execution Mode")).toBeInTheDocument();
    expect(screen.getByText("Automatic")).toBeInTheDocument();
    expect(screen.getByText("Approval Required")).toBeInTheDocument();
    expect(screen.getByText("SAFEGUARD POLICY")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Automatic/i }));
    expect(onSelectMode).toHaveBeenCalledWith("Automatic");
  });

  it("renders RuleInspectorDrawer with commercial safeguard and actions", async () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <RuleInspectorDrawer
        open={true}
        onClose={onClose}
        onApprove={onApprove}
        onReject={onReject}
      />
    );

    expect(screen.getByRole("dialog", { name: "Rule Inspector & Audit" })).toBeInTheDocument();
    expect(screen.getByText("Automated Price War Margin Guard")).toBeInTheDocument();
    expect(screen.getByText("Commercial Safeguard Active")).toBeInTheDocument();
    expect(screen.getByText("AWAITING MERCHANT SIGN-OFF")).toBeInTheDocument();

    const approveBtn = screen.getByRole("button", { name: /Approve Price Match/i });
    await user.click(approveBtn);
    expect(onApprove).toHaveBeenCalled();

    const rejectBtn = screen.getByRole("button", { name: "Reject" });
    await user.click(rejectBtn);
    expect(onReject).toHaveBeenCalled();
  });
});
