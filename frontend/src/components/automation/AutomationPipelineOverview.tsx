import { ArrowRight, CheckCircle2, Eye, Lightbulb, Plus, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { formatCurrency, formatDateTime, formatNumber, formatRelativeTime } from "@/utils/format";
import { LoadError, StateBox } from "./AutoUi";
import { actionLabel } from "./autoFormat";
import type { AutomationApproval, AutomationOverview, AutomationRun } from "@/types/automation";

interface AutomationPipelineOverviewProps {
  overview: AutomationOverview | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  approvals: AutomationApproval[];
  runs: AutomationRun[];
  failedRuns: AutomationRun[];
  canWrite: boolean;
  onCreateRule: () => void;
  onReviewApproval: (item: AutomationApproval) => void;
  onDismissApproval: (item: AutomationApproval) => void;
  onOpenRun: (id: string) => void;
  onViewAllApprovals: () => void;
  onViewAllRuns: () => void;
}

const count = (n: number | undefined) => (n === undefined ? "—" : formatNumber(n));

const STATUS_TEXT: Record<AutomationRun["executionStatus"], { text: string; cls: string }> = {
  success: { text: "Completed", cls: "text-emerald-700" },
  awaiting_approval: { text: "Awaiting approval", cls: "text-amber-700" },
  failed: { text: "Failed", cls: "text-red-700" },
};

export function AutomationPipelineOverview({
  overview: o,
  loading,
  error,
  onRetry,
  approvals,
  runs,
  failedRuns,
  canWrite,
  onCreateRule,
  onReviewApproval,
  onDismissApproval,
  onOpenRun,
  onViewAllApprovals,
  onViewAllRuns,
}: AutomationPipelineOverviewProps) {
  if (error && !o) return <LoadError noun="Automation overview" message={error} onRetry={onRetry} />;
  if (loading && !o) return <StateBox title="Loading the automation overview" description="One moment." />;

  const noRules = o !== undefined && o.totalRules === 0;

  return (
    <div className="space-y-6">
      {noRules && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-card p-5">
          <div>
            <h3 className="text-sm font-bold text-foreground">No automation rules yet</h3>
            <p className="mt-1 text-xs text-muted-foreground">A rule watches an event, such as stock running low, and drafts the next step for you to approve.</p>
          </div>
          <Button size="sm" className="gap-1.5 text-xs" disabled={!canWrite} title={canWrite ? undefined : "Creating rules needs the automation:write permission"} onClick={onCreateRule}>
            <Plus className="h-3.5 w-3.5" />
            Create your first rule
          </Button>
        </div>
      )}

      {/* 1. 4-step pipeline */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between border-b border-border pb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">FROM SIGNAL TO CONTROLLED ACTION</span>
          <span className="text-xs text-muted-foreground">Last 24 hours</span>
        </div>

        <div className="mt-5 grid grid-cols-2 items-center gap-4 md:grid-cols-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium uppercase text-muted-foreground">Observe</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-extrabold text-foreground">{count(o?.signalsObserved24h)}</span>
                <span className="text-xs text-muted-foreground">signals</span>
              </div>
            </div>
            <ArrowRight className="ml-auto hidden h-4 w-4 text-muted-foreground opacity-40 md:block" />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium uppercase text-muted-foreground">Recommend</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-extrabold text-foreground">{count(o?.recommendedActions24h)}</span>
                <span className="text-xs text-muted-foreground">actions</span>
              </div>
            </div>
            <ArrowRight className="ml-auto hidden h-4 w-4 text-muted-foreground opacity-40 md:block" />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium uppercase text-muted-foreground">Approve</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-extrabold text-amber-600">{count(o?.pendingApprovals)}</span>
                <span className="text-xs text-muted-foreground">awaiting approval</span>
              </div>
            </div>
            <ArrowRight className="ml-auto hidden h-4 w-4 text-muted-foreground opacity-40 md:block" />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium uppercase text-muted-foreground">Execute</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-extrabold text-emerald-600">{count(o?.completedRuns24h)}</span>
                <span className="text-xs text-muted-foreground">completed runs</span>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
          A signal is an event a rule looked at; one signal can lead to more than one run, and a run can affect more than one record.
        </p>
      </div>

      {/* 2. Two columns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">Waiting for Your Approval</h3>
                <span className="text-xs text-muted-foreground">{count(o?.pendingApprovals)} pending</span>
              </div>
              <button type="button" onClick={onViewAllApprovals} className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline">
                View queue <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">Review the exact proposal before any sensitive commercial action is executed.</p>

            {approvals.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Nothing is waiting for you.</p>
            ) : (
              <div className="mt-4 divide-y divide-border">
                {approvals.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                    <div className="min-w-[280px] space-y-1">
                      <h4 className="text-sm font-semibold text-foreground">{item.recommendedAction}</h4>
                      <p className="text-xs text-muted-foreground">
                        {item.entityName} · {item.skuOrOrder}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px]">
                        <span className="py-0.2 rounded border border-amber-200 bg-amber-50 px-1.5 font-semibold text-amber-800">
                          {item.financialImpact === null ? "Money at stake not known" : `${formatCurrency(item.financialImpact, item.currency)} at stake`}
                        </span>
                        <span className="text-muted-foreground">Raised {formatRelativeTime(item.timestamp)}</span>
                        <span className="text-muted-foreground">· {actionLabel(item.actionType)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => onReviewApproval(item)}>
                        Review
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        disabled={!canWrite}
                        title={canWrite ? undefined : "Deciding on runs needs the automation:write permission"}
                        onClick={() => onDismissApproval(item)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground">Recent activity</h3>
              <button type="button" onClick={onViewAllRuns} className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:underline">
                All runs <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {runs.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No runs yet. They appear here when a rule matches an event.</p>
            ) : (
              <div className="mt-3 divide-y divide-border">
                {runs.map((run) => {
                  const st = STATUS_TEXT[run.executionStatus];
                  return (
                    <div key={run.id} className="flex items-center justify-between py-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                          <Zap className="h-3.5 w-3.5" />
                        </div>
                        <div className="space-y-0.5">
                          <span className="font-semibold text-foreground">{run.summary}</span>
                          <p className="text-muted-foreground">
                            {run.ruleName} · {run.entityName}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <span className={cn("font-semibold", st.cls)}>● {st.text}</span>
                          <p className="text-[11px] text-muted-foreground">{formatDateTime(run.timestamp)}</p>
                        </div>
                        <button type="button" onClick={() => onOpenRun(run.id)} className="text-muted-foreground hover:text-foreground">
                          Details ↗
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-2xs">
            <h3 className="text-sm font-bold text-foreground">Automation health</h3>
            <div className="divide-y divide-border text-xs">
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Active rules</span>
                <span className="font-mono font-bold text-foreground">{count(o?.activeRules)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Successful runs (24h)</span>
                <span className="font-mono font-bold text-emerald-700">{count(o?.completedRuns24h)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Draft or disabled rules</span>
                <span className="font-mono font-bold text-amber-700">{o ? formatNumber(o.totalRules - o.activeRules) : "—"}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Failed runs (24h)</span>
                <span className="font-mono font-bold text-red-700">{count(o?.failedRuns24h)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Unresolved exceptions</h3>
              <span className="font-mono text-xs font-bold text-red-700">{count(o?.failedRuns24h)}</span>
            </div>

            {failedRuns.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">No failed runs right now.</p>
            ) : (
              <div className="space-y-3 pt-1 text-xs">
                {failedRuns.map((run) => (
                  <div key={run.id} className="space-y-1.5 rounded-lg border border-red-200 bg-red-50/50 p-3">
                    <span className="font-semibold text-red-800">● Needs attention</span>
                    <h4 className="font-bold text-foreground">{run.summary}</h4>
                    <p className="text-muted-foreground">
                      {run.ruleName} · {run.entityName}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-muted-foreground">{formatDateTime(run.timestamp)}</span>
                      <button type="button" onClick={() => onOpenRun(run.id)} className="font-semibold text-foreground hover:underline">
                        Review run →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-foreground">
              <Shield className="h-4 w-4" />
              The decision stays yours.
            </div>
            <p className="leading-relaxed text-muted-foreground">Rules in approval mode wait for your decision. Rules set to run automatically act without asking, and every run is logged.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
