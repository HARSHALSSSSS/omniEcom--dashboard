import { useState } from "react";
import { Zap, Plus, AlertTriangle, Check } from "lucide-react";
import {
  MOCK_AUTOMATION_RULES,
  MOCK_AUTOMATION_APPROVALS,
  MOCK_AUTOMATION_RUNS,
} from "@/mocks/data/assistant.data";
import type {
  AutomationRule,
  AutomationApprovalItem,
  AutomationRunLog,
} from "@/types/automation";

export default function AutomationPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "rules" | "approvals" | "runs">(
    "overview",
  );
  const [rules, setRules] = useState<AutomationRule[]>(MOCK_AUTOMATION_RULES);
  const [approvals, setApprovals] = useState<AutomationApprovalItem[]>(
    MOCK_AUTOMATION_APPROVALS,
  );
  const [runs] = useState<AutomationRunLog[]>(MOCK_AUTOMATION_RUNS);
  const [showCreateRule, setShowCreateRule] = useState(false);

  // New Rule State
  const [ruleName, setRuleName] = useState("");
  const [ruleDesc, setRuleDesc] = useState("");
  const [ruleTrigger, setRuleTrigger] =
    useState<AutomationRule["triggerType"]>("stock_below_threshold");
  const [ruleAction, setRuleAction] =
    useState<AutomationRule["actionType"]>("draft_purchase_order");

  const pendingApprovalsCount = approvals.filter(
    (a) => a.status === "pending",
  ).length;

  const toggleRule = (ruleId: string) => {
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId
          ? { ...r, status: r.status === "active" ? "paused" : "active" }
          : r,
      ),
    );
  };

  const handleApprovalAction = (
    approvalId: string,
    action: "approved" | "rejected",
  ) => {
    setApprovals((prev) =>
      prev.map((a) => (a.id === approvalId ? { ...a, status: action } : a)),
    );
  };

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim()) return;

    const created: AutomationRule = {
      id: `rule-${Date.now()}`,
      name: ruleName,
      description: ruleDesc || "Custom configured operational rule",
      triggerType: ruleTrigger,
      actionType: ruleAction,
      requiresExplicitApproval: true,
      status: "active",
      runsCount: 0,
    };

    setRules([created, ...rules]);
    setShowCreateRule(false);
    setRuleName("");
    setRuleDesc("");
  };

  return (
    <div className="flex flex-col gap-6 w-full select-none pb-12 font-['Inter',sans-serif]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAEAEA] pb-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-semibold text-[#000000] tracking-tight">
              Automation Workspace
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200">
              <Zap className="h-3 w-3" />
              Event-Driven Workflows
            </span>
          </div>
          <p className="text-[13px] text-[#666666]">
            Configure automated operations for stock thresholds, SLA dispatches, and
            repricing. Financial &amp; supplier actions route to Approvals before execution.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center bg-neutral-100 p-1 rounded-lg border border-[#EAEAEA]">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                activeTab === "overview"
                  ? "bg-white text-black shadow-xs font-semibold"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("approvals")}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                activeTab === "approvals"
                  ? "bg-white text-black shadow-xs font-semibold"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              Approvals Queue ({pendingApprovalsCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("rules")}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                activeTab === "rules"
                  ? "bg-white text-black shadow-xs font-semibold"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              Rules ({rules.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("runs")}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                activeTab === "runs"
                  ? "bg-white text-black shadow-xs font-semibold"
                  : "text-[#666666] hover:text-black"
              }`}
            >
              Execution Runs
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateRule(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-black text-white text-[12px] font-semibold rounded-lg hover:bg-neutral-800 transition-colors shadow-2xs"
          >
            <Plus className="h-4 w-4" />
            Create Rule
          </button>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 shadow-2xs flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[#666666] uppercase">
            Active Rules
          </span>
          <span className="text-[24px] font-bold text-[#000000]">
            {rules.filter((r) => r.status === "active").length} of {rules.length}
          </span>
          <span className="text-[11px] text-emerald-600 font-medium">
            Live monitors running
          </span>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 shadow-2xs flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[#666666] uppercase">
            Pending Human Approvals
          </span>
          <span className="text-[24px] font-bold text-amber-600">
            {pendingApprovalsCount} actions
          </span>
          <span className="text-[11px] text-[#666666]">
            Requires operator sign-off
          </span>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 shadow-2xs flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[#666666] uppercase">
            Automated Executions (30d)
          </span>
          <span className="text-[24px] font-bold text-[#000000]">
            {rules.reduce((sum, r) => sum + r.runsCount, 0)} runs
          </span>
          <span className="text-[11px] text-blue-600 font-medium">
            Zero missed SLAs
          </span>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-4 shadow-2xs flex flex-col gap-1">
          <span className="text-[11px] font-medium text-[#666666] uppercase">
            Hours Saved (Est.)
          </span>
          <span className="text-[24px] font-bold text-[#000000]">
            42.5 hrs/mo
          </span>
          <span className="text-[11px] text-[#666666]">
            In manual order/stock checks
          </span>
        </div>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="flex flex-col gap-6">
          {/* Pending Approvals Alert Banner */}
          {pendingApprovalsCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0" />
                <div>
                  <h3 className="text-[13px] font-semibold text-amber-900">
                    {pendingApprovalsCount} Automated Actions Awaiting Explicit Approval
                  </h3>
                  <p className="text-[12px] text-amber-800">
                    High-impact decisions (Purchase Orders and Live Channel Repricing)
                    will not execute until you review and authorize them.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("approvals")}
                className="px-3.5 py-1.5 rounded-lg bg-black text-white text-[12px] font-semibold hover:bg-neutral-800 transition-colors shrink-0"
              >
                Review Queue →
              </button>
            </div>
          )}

          {/* Rules Summary Grid */}
          <div className="bg-white border border-[#EAEAEA] rounded-xl p-6 shadow-2xs flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-4">
              <div>
                <h2 className="text-[15px] font-semibold text-[#000000]">
                  Configured Operational Automations
                </h2>
                <p className="text-[12px] text-[#666666]">
                  Active monitors watching catalog, order SLAs, and channel syncs.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="border border-[#EAEAEA] rounded-xl p-5 flex flex-col justify-between gap-4 bg-neutral-50/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-[13px] font-semibold text-[#000000]">
                        {rule.name}
                      </h3>
                      <span className="text-[11px] text-[#666666]">
                        Trigger: {rule.triggerType.replace(/_/g, " ")}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleRule(rule.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${
                        rule.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-neutral-100 text-neutral-600 border-neutral-200"
                      }`}
                    >
                      {rule.status}
                    </button>
                  </div>

                  <p className="text-[11px] text-[#444444] leading-relaxed">
                    {rule.description}
                  </p>

                  <div className="pt-2 border-t border-[#EAEAEA] flex items-center justify-between text-[11px]">
                    <span className="text-[#666666]">
                      {rule.runsCount} executions
                    </span>
                    {rule.requiresExplicitApproval && (
                      <span className="text-amber-700 font-medium">
                        Advisory Guarded
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Approvals Queue */}
      {activeTab === "approvals" && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-[#EAEAEA] flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-[#000000]">
                Operator Approvals Queue
              </h2>
              <p className="text-[11px] text-[#666666]">
                Explicit human confirmation step for financial or inventory commitments.
              </p>
            </div>
            <span className="text-[11px] text-amber-700 font-medium">
              {pendingApprovalsCount} pending
            </span>
          </div>

          <div className="divide-y divide-[#EAEAEA]">
            {approvals.map((appr) => {
              const isPending = appr.status === "pending";

              return (
                <div
                  key={appr.id}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-neutral-50/50 transition-colors"
                >
                  <div className="flex flex-col gap-1 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-[#000000]">
                        {appr.proposedAction}
                      </span>
                      <span className="text-[10px] font-mono bg-neutral-100 px-2 py-0.5 rounded text-neutral-700">
                        {appr.skuOrOrder}
                      </span>
                    </div>
                    <span className="text-[12px] text-[#666666]">
                      Triggered by: {appr.triggerEvent} ({appr.timestamp})
                    </span>
                    <span className="text-[11px] font-medium text-blue-600">
                      Impact: {appr.financialImpact}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isPending ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApprovalAction(appr.id, "approved")}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-[12px] font-semibold rounded-lg hover:bg-neutral-800 transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve Action
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprovalAction(appr.id, "rejected")}
                          className="px-3 py-1.5 bg-white border border-[#EAEAEA] text-[12px] font-medium text-neutral-600 rounded-lg hover:bg-neutral-100 transition-colors"
                        >
                          Dismiss
                        </button>
                      </>
                    ) : (
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                          appr.status === "approved"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                        }`}
                      >
                        {appr.status === "approved" ? "Authorized" : "Dismissed"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Rules Config */}
      {activeTab === "rules" && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-[#EAEAEA] flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#000000]">
              Rule Registry &amp; Policies
            </h2>
            <button
              type="button"
              onClick={() => setShowCreateRule(true)}
              className="text-[12px] font-semibold text-blue-600 hover:underline"
            >
              + Add Rule
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="bg-neutral-50 border-b border-[#EAEAEA] text-[#666666] font-medium text-[11px]">
                  <th className="py-3 px-4">Rule Name</th>
                  <th className="py-3 px-4">Trigger Event</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4 text-center">Guardrail</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA]">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-[#000000]">
                      {r.name}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-[#000000]">
                      {r.triggerType.replace(/_/g, " ")}
                    </td>
                    <td className="py-3.5 px-4 text-[#666666]">
                      {r.actionType.replace(/_/g, " ")}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                        Requires Approval
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          r.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-neutral-100 text-neutral-600 border-neutral-200"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => toggleRule(r.id)}
                        className="text-[11px] font-semibold text-blue-600 hover:underline"
                      >
                        {r.status === "active" ? "Pause" : "Resume"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Execution Runs */}
      {activeTab === "runs" && (
        <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-[#EAEAEA]">
            <h2 className="text-[14px] font-semibold text-[#000000]">
              Automated Execution Audit Log
            </h2>
            <p className="text-[11px] text-[#666666]">
              Real-time trace of triggered events and actions taken.
            </p>
          </div>

          <div className="divide-y divide-[#EAEAEA]">
            {runs.map((run) => (
              <div
                key={run.id}
                className="p-4 flex items-center justify-between text-[12px] hover:bg-neutral-50 transition-colors"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#000000]">
                      {run.ruleName}
                    </span>
                    <span className="text-[10px] text-[#888888]">
                      ({run.durationMs}ms)
                    </span>
                  </div>
                  <span className="text-[#666666]">{run.summary}</span>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-[11px] text-[#888888] font-mono">
                    {run.timestamp}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                      run.executionStatus === "success"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}
                  >
                    {run.executionStatus.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Rule Modal */}
      {showCreateRule && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[#EAEAEA] pb-3">
              <h3 className="text-[16px] font-semibold text-[#000000]">
                Configure Operational Rule
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateRule(false)}
                className="text-neutral-400 hover:text-black"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="flex flex-col gap-4 text-[12px]">
              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  Rule Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Meesho Return Surge Escalation"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  Trigger Event
                </label>
                <select
                  value={ruleTrigger}
                  onChange={(e) =>
                    setRuleTrigger(
                      e.target.value as AutomationRule["triggerType"],
                    )
                  }
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px] bg-white"
                >
                  <option value="stock_below_threshold">
                    When stock runway is under 10 days
                  </option>
                  <option value="order_sla_risk">
                    When dispatch SLA has under 45 minutes remaining
                  </option>
                  <option value="buybox_price_drop">
                    When competitor undercuts Buy Box price
                  </option>
                  <option value="listing_sync_failure">
                    When marketplace listing sync errors
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#666666] mb-1">
                  Automated Action
                </label>
                <select
                  value={ruleAction}
                  onChange={(e) =>
                    setRuleAction(e.target.value as AutomationRule["actionType"])
                  }
                  className="w-full px-3 py-2 border border-[#EAEAEA] rounded-lg text-[13px] bg-white"
                >
                  <option value="draft_purchase_order">
                    Draft Purchase Order for review
                  </option>
                  <option value="adjust_channel_price">
                    Draft channel price adjustment proposal
                  </option>
                  <option value="notify_channel_slack">
                    Send urgent dispatch notification
                  </option>
                </select>
              </div>

              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-[11px] text-amber-800">
                Rule adheres to commerce safety guardrails: financial and supplier
                actions will require one-click approval before execution.
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#EAEAEA]">
                <button
                  type="button"
                  onClick={() => setShowCreateRule(false)}
                  className="px-4 py-2 border border-[#EAEAEA] rounded-lg text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-black text-white font-semibold rounded-lg hover:bg-neutral-800"
                >
                  Save &amp; Activate Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
