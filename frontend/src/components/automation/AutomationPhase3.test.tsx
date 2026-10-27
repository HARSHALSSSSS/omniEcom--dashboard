import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutomationPipelineOverview } from "./AutomationPipelineOverview";
import { RuleFilterRail } from "./RuleFilterRail";
import { RuleInspectorDrawer } from "./RuleInspectorDrawer";
import type { AutomationApproval, AutomationOverview, AutomationRule, AutomationRun } from "@/types/automation";

afterEach(() => cleanup());

const OVERVIEW: AutomationOverview = {
  activeRules: 2,
  totalRules: 3,
  pendingApprovals: 1,
  runs24h: 4,
  signalsObserved24h: 9,
  recommendedActions24h: 4,
  completedRuns24h: 2,
  failedRuns24h: 1,
  successRate: 66.7,
  lastRunAt: null,
  lastRunRule: null,
};

const APPROVAL: AutomationApproval = {
  id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
  ruleId: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
  ruleName: "Auto-draft PO",
  triggerEvent: "inventory.low_stock",
  triggerType: "stock_below_threshold",
  actionType: "draft_purchase_order",
  entityName: "Travel duffel",
  skuOrOrder: "TRV-1042",
  proposedAction: "Draft a purchase order for 35 unit(s) of TRV-1042",
  recommendedAction: "Draft a purchase order for 35 unit(s) of TRV-1042",
  financialImpact: 1_050_000,
  currency: "INR",
  timestamp: new Date().toISOString(),
  status: "pending",
  facts: {},
};

const RUN: AutomationRun = {
  id: "cccccccc-3333-4333-8333-cccccccccccc",
  ruleId: APPROVAL.ruleId,
  ruleName: "Auto-draft PO",
  executionStatus: "failed",
  status: "failed",
  triggeredAt: new Date().toISOString(),
  timestamp: new Date().toISOString(),
  summary: "Could not draft the purchase order",
  durationMs: 12,
  entityName: "Travel duffel",
  skuOrOrder: "TRV-1042",
};

const RULE = (over: Partial<AutomationRule> = {}): AutomationRule => ({
  id: APPROVAL.ruleId,
  name: "Auto-draft PO",
  description: "Drafts a PO when stock runs low",
  triggerEvent: "inventory.low_stock",
  conditions: { combinator: "all", conditions: [{ field: "available", op: "lt", value: 5 }] },
  action: { type: "draft_purchase_order", params: {} },
  mode: "approval",
  status: "active",
  version: 1,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  triggerType: "stock_below_threshold",
  actionType: "draft_purchase_order",
  requiresExplicitApproval: true,
  runsCount: 2,
  lastRunAt: null,
  channelFilter: null,
  schedule: null,
  ...over,
});

const pipelineProps = () => ({
  overview: OVERVIEW,
  loading: false,
  error: null,
  onRetry: vi.fn(),
  approvals: [APPROVAL],
  runs: [RUN],
  failedRuns: [RUN],
  canWrite: true,
  onCreateRule: vi.fn(),
  onReviewApproval: vi.fn(),
  onDismissApproval: vi.fn(),
  onOpenRun: vi.fn(),
  onViewAllApprovals: vi.fn(),
  onViewAllRuns: vi.fn(),
});

describe("AutomationPipelineOverview", () => {
  it("shows the real counts, the real waiting proposal and the real runs", async () => {
    const props = pipelineProps();
    const user = userEvent.setup();
    render(<AutomationPipelineOverview {...props} />);

    expect(screen.getByText("FROM SIGNAL TO CONTROLLED ACTION")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getAllByText("4").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Draft a purchase order for 35 unit(s) of TRV-1042")).toHaveLength(1);
    expect(screen.getAllByText("Could not draft the purchase order").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Demo|illustrative/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Update prices for 12 products")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(props.onReviewApproval).toHaveBeenCalledWith(APPROVAL);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(props.onDismissApproval).toHaveBeenCalledWith(APPROVAL);
    await user.click(screen.getByRole("button", { name: /View queue/i }));
    expect(props.onViewAllApprovals).toHaveBeenCalled();
  });

  it("is honest for a business with nothing yet: dashes while loading, empty states and a way to create the first rule", async () => {
    const props = pipelineProps();
    const user = userEvent.setup();
    render(<AutomationPipelineOverview {...props} overview={{ ...OVERVIEW, totalRules: 0, activeRules: 0, pendingApprovals: 0, signalsObserved24h: 0, recommendedActions24h: 0, completedRuns24h: 0, failedRuns24h: 0 }} approvals={[]} runs={[]} failedRuns={[]} />);

    expect(screen.getByText("No automation rules yet")).toBeInTheDocument();
    expect(screen.getByText("Nothing is waiting for you.")).toBeInTheDocument();
    expect(screen.getByText(/No runs yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Create your first rule/ }));
    expect(props.onCreateRule).toHaveBeenCalled();
  });

  it("shows an error with retry when the overview cannot be loaded, and a viewer cannot create a rule", async () => {
    const props = pipelineProps();
    const user = userEvent.setup();
    const { rerender } = render(<AutomationPipelineOverview {...props} overview={undefined} error="Network down" />);
    expect(screen.getByText("Network down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(props.onRetry).toHaveBeenCalled();

    rerender(<AutomationPipelineOverview {...props} canWrite={false} overview={{ ...OVERVIEW, totalRules: 0 }} />);
    expect(screen.getByRole("button", { name: /Create your first rule/ })).toBeDisabled();
  });
});

describe("RuleFilterRail", () => {
  it("counts come from the rules and a click filters", async () => {
    const onSelectMode = vi.fn();
    const onSelectStatus = vi.fn();
    const user = userEvent.setup();
    const rules = [RULE(), RULE({ id: "2", mode: "auto", status: "draft", channelFilter: "amazon" })];

    render(<RuleFilterRail rules={rules} catalog={undefined} selectedMode="All Modes" selectedStatus={undefined} selectedTrigger={undefined} onSelectMode={onSelectMode} onSelectStatus={onSelectStatus} onSelectTrigger={vi.fn()} onReset={vi.fn()} />);

    expect(screen.getByRole("button", { name: /All Modes\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Automatic\s*1/ })).toBeInTheDocument();
    expect(screen.getByText("amazon")).toBeInTheDocument();
    expect(screen.queryByText("Flipkart")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Automatic/ }));
    expect(onSelectMode).toHaveBeenCalledWith("Automatic");
    await user.click(screen.getByRole("checkbox", { name: /Draft/ }));
    expect(onSelectStatus).toHaveBeenCalledWith("draft");
  });
});

describe("RuleInspectorDrawer", () => {
  const props = () => ({
    approval: APPROVAL,
    rule: RULE(),
    catalog: undefined,
    runs: [RUN],
    canWrite: true,
    busy: false,
    onClose: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onTestPayload: vi.fn(),
    onEditLogic: vi.fn(),
    onPauseExecution: vi.fn(),
  });

  it("describes the real proposal and hands the decision to the caller", async () => {
    const p = props();
    const user = userEvent.setup();
    render(<RuleInspectorDrawer {...p} />);

    expect(screen.getByRole("dialog", { name: "Rule Inspector & Audit" })).toBeInTheDocument();
    expect(screen.getByText("Auto-draft PO")).toBeInTheDocument();
    expect(screen.getByText("TRV-1042")).toBeInTheDocument();
    expect(screen.getByText("available lt 5")).toBeInTheDocument();
    expect(screen.queryByText(/Price War|ASIN/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(p.onApprove).toHaveBeenCalledWith(APPROVAL);
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(p.onReject).toHaveBeenCalledWith(APPROVAL);
  });

  it("is read only for a viewer", () => {
    render(<RuleInspectorDrawer {...props()} canWrite={false} />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  it("renders nothing without a proposal", () => {
    render(<RuleInspectorDrawer {...props()} approval={null} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
