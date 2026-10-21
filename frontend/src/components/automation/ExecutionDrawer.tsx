import { ContextDrawer } from "@/components/common/ContextDrawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { useAutomationExecution } from "@/hooks/useAutomation";
import { formatDateTime } from "@/utils/format";
import { WRITE_REASON, actionLabel, triggerLabel } from "./autoFormat";
import { ExecutionBadge, KeyValues, Line } from "./AutoUi";
import type { AutomationExecution, AutomationRule } from "@/types/automation";

interface Props {
  executionId: string | null;
  rules: AutomationRule[];
  canWrite: boolean;
  busy: boolean;
  onClose: () => void;
  onOpenRule: (ruleId: string) => void;
  onApprove: (e: AutomationExecution) => void;
  onDismiss: (e: AutomationExecution) => void;
  onRollback: (e: AutomationExecution) => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** one run in full: what triggered it, what it would do or did, the facts it saw, and the buttons that apply to its state */
export function ExecutionDrawer({ executionId, rules, canWrite, busy, onClose, onOpenRule, onApprove, onDismiss, onRollback }: Props) {
  const q = useAutomationExecution(executionId);
  const e = q.data;
  const rule = e ? rules.find((r) => r.id === e.ruleId) : undefined;
  const title = e ? (rule?.name ?? "Automation run") : "Automation run";
  const off = !canWrite;

  const footer = e && (e.status === "pending_approval" || e.canRollback) && (
    <div className="flex w-full flex-wrap justify-end gap-2">
      {e.status === "pending_approval" && (
        <>
          <Button type="button" variant="outline" size="sm" disabled={off || busy} title={off ? WRITE_REASON : undefined} onClick={() => onDismiss(e)}>
            Dismiss
          </Button>
          <Button type="button" size="sm" loading={busy} disabled={off} title={off ? WRITE_REASON : undefined} onClick={() => onApprove(e)}>
            Approve and run
          </Button>
        </>
      )}
      {e.canRollback && (
        <Button type="button" variant="outline" size="sm" loading={busy} disabled={off} title={off ? WRITE_REASON : undefined} onClick={() => onRollback(e)}>
          Roll back
        </Button>
      )}
    </div>
  );

  return (
    <ContextDrawer open={executionId !== null} onClose={onClose} title={title} description={e ? `${actionLabel(e.actionType)} · ${formatDateTime(e.createdAt)}` : undefined} badge={e ? <ExecutionBadge status={e.status} /> : undefined} className="sm:w-[460px]" footer={footer || undefined}>
      {q.isLoading ? (
        <div role="status" aria-label="Loading run" className="space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : q.isError || !e ? (
        <div role="alert" className="space-y-2 text-xs">
          <p className="font-semibold text-foreground">This run could not be loaded.</p>
          <p className="text-muted-foreground">{errorMessage(q.error)}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void q.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-5 text-xs">
          {e.error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive">
              {e.error}
            </p>
          )}
          <div className="space-y-2">
            <Line label="Rule">
              {rule ? (
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => onOpenRule(e.ruleId)}>
                  {rule.name}
                </button>
              ) : (
                "Unknown rule"
              )}
            </Line>
            <Line label="Triggered by">{triggerLabel(e.eventType)}</Line>
            <Line label="Action">{actionLabel(e.actionType)}</Line>
            <Line label="Raised">{formatDateTime(e.createdAt)}</Line>
            {e.decidedAt && <Line label="Decided">{formatDateTime(e.decidedAt)}</Line>}
            {e.executedAt && <Line label="Executed">{formatDateTime(e.executedAt)}</Line>}
          </div>
          <Section title="Action parameters">
            <KeyValues values={e.actionParams} empty="No parameters" />
          </Section>
          <Section title="What it saw">
            <KeyValues values={e.facts} />
          </Section>
          {e.result && (
            <Section title="Result">
              <KeyValues values={e.result} />
            </Section>
          )}
        </div>
      )}
    </ContextDrawer>
  );
}
