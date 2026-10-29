import { Check, Edit, Pause, Shield, TestTube, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/utils/format";
import { WRITE_REASON, actionLabel, triggerLabel } from "./autoFormat";
import type { AutomationApproval, AutomationCatalog, AutomationRule, AutomationRun } from "@/types/automation";

interface RuleInspectorDrawerProps {
  /** the run waiting for a decision */
  approval: AutomationApproval | null;
  /** the rule that raised it (when the rules list has it) */
  rule: AutomationRule | null;
  catalog: AutomationCatalog | undefined;
  /** the latest runs of that rule: the audit trail */
  runs: AutomationRun[];
  canWrite: boolean;
  busy: boolean;
  onClose: () => void;
  onApprove: (approval: AutomationApproval) => void;
  onReject: (approval: AutomationApproval) => void;
  onTestPayload: (rule: AutomationRule) => void;
  onEditLogic: (rule: AutomationRule) => void;
  onPauseExecution: (rule: AutomationRule) => void;
}

function conditionText(rule: AutomationRule): string {
  const list = rule.conditions.conditions;
  if (list.length === 0) return "No extra conditions: every matching event qualifies";
  return list.map((c) => `${c.field} ${c.op} ${c.value === undefined ? "" : String(c.value)}`.trim()).join(rule.conditions.combinator === "all" ? " AND " : " OR ");
}

/** the proposal waiting for a person, the rule behind it and that rule's recent runs; Approve and Reject call the real execution endpoints (through the page's confirm step) */
export function RuleInspectorDrawer({ approval, rule, catalog, runs, canWrite, busy, onClose, onApprove, onReject, onTestPayload, onEditLogic, onPauseExecution }: RuleInspectorDrawerProps) {
  if (!approval) return null;
  const title = rule?.name ?? approval.ruleName;
  const disabledReason = canWrite ? undefined : WRITE_REASON;

  return (
    <div role="dialog" aria-label="Rule Inspector & Audit" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border p-4">
        <span className="rounded bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">Rule Inspector &amp; Audit</span>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose} aria-label="Close drawer">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">APPROVAL REQUIRED</span>
            <span className="font-mono text-[11px] text-muted-foreground">Run {approval.id.slice(0, 8)}</span>
          </div>
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          {rule?.description && <p className="leading-relaxed text-muted-foreground">{rule.description}</p>}
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <span className="font-bold uppercase tracking-wider text-muted-foreground">EXECUTION PIPELINE</span>
          <div className="space-y-3 pt-1">
            <div className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">1</span>
              <div className="space-y-0.5">
                <span className="font-semibold text-foreground">Trigger: {triggerLabel(approval.triggerEvent, catalog)}</span>
                <p className="leading-relaxed text-muted-foreground">{approval.triggerEvent}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">2</span>
              <div className="space-y-1">
                <span className="font-semibold text-foreground">Condition Guard</span>
                <div className="block rounded bg-amber-100/80 px-2 py-0.5 font-mono text-[11px] font-medium text-amber-900">{rule ? conditionText(rule) : "Not available"}</div>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">3</span>
              <div className="space-y-0.5">
                <span className="font-semibold text-foreground">Target Action</span>
                <p className="leading-relaxed text-muted-foreground">{actionLabel(approval.actionType)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-amber-900">
          <div className="flex items-center gap-1.5 font-bold">
            <Shield className="h-4 w-4" />
            Waiting for your decision
          </div>
          <p className="text-[11px] leading-relaxed">This rule is set to ask first. Nothing runs until you approve; rejecting records your decision and runs nothing.</p>
        </div>

        <div className="space-y-3 rounded-xl border-2 border-amber-300 bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-muted-foreground">AWAITING MERCHANT SIGN-OFF</span>
            <span className="font-bold text-amber-700">Raised {formatDateTime(approval.timestamp)}</span>
          </div>
          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-foreground">{approval.skuOrOrder}</span>
              <span className="rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">{approval.financialImpact === null ? "IMPACT NOT KNOWN" : `${formatCurrency(approval.financialImpact, approval.currency)} AT STAKE`}</span>
            </div>
            <h4 className="font-semibold text-foreground">{approval.entityName}</h4>
            <p className="text-muted-foreground">{approval.recommendedAction}</p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="h-10 sm:h-9 flex-1 gap-1.5 bg-black text-xs text-white hover:bg-neutral-800 cursor-pointer" disabled={!canWrite || busy} title={disabledReason} onClick={() => onApprove(approval)}>
              <Check className="h-3.5 w-3.5" />
              Approve
            </Button>
            <Button size="sm" variant="outline" className="h-10 sm:h-9 text-xs cursor-pointer" disabled={!canWrite || busy} title={disabledReason} onClick={() => onReject(approval)}>
              Reject
            </Button>
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-3">
          <span className="font-bold uppercase tracking-wider text-muted-foreground">EXECUTION AUDIT LOG</span>
          {runs.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No earlier runs of this rule.</p>
          ) : (
            <div className="space-y-2.5">
              {runs.map((run) => (
                <div key={run.id} className="flex items-start justify-between text-[11px]">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-foreground">{run.summary}</span>
                    <p className="text-muted-foreground">{run.entityName}</p>
                  </div>
                  <span className="shrink-0 pl-2 text-right font-mono text-muted-foreground">{formatDateTime(run.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 border-t border-border p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button size="sm" variant="outline" className="h-10 sm:h-9 gap-1.5 text-xs cursor-pointer" disabled={!rule} onClick={() => rule && onTestPayload(rule)}>
            <TestTube className="h-3.5 w-3.5" />
            Test with Payload
          </Button>
          <Button size="sm" variant="outline" className="h-10 sm:h-9 gap-1.5 text-xs cursor-pointer" disabled={!rule || !canWrite} title={disabledReason} onClick={() => rule && onEditLogic(rule)}>
            <Edit className="h-3.5 w-3.5" />
            Edit Logic
          </Button>
        </div>
        <button
          type="button"
          disabled={!rule || !canWrite || rule.status !== "active"}
          title={disabledReason}
          onClick={() => rule && onPauseExecution(rule)}
          className="min-h-[36px] flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline cursor-pointer"
        >
          <Pause className="h-3.5 w-3.5" />
          Pause Rule Execution
        </button>
      </div>
    </div>
  );
}
