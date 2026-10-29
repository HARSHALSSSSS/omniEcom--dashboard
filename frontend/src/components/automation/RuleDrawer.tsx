import { ContextDrawer } from "@/components/common/ContextDrawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { useAutomationRuns } from "@/hooks/useAutomation";
import { formatDateTime, formatNumber, formatRelativeTime } from "@/utils/format";
import { WRITE_REASON, actionLabel, conditionLines, paramLines, scheduleText, triggerLabel } from "./autoFormat";
import { KeyValues, Line, ModeBadge, RuleBadge, RunBadge } from "./AutoUi";
import type { AutomationCatalog, AutomationRule } from "@/types/automation";

interface Props {
  rule: AutomationRule | null;
  /** the id in the URL while the rules are still loading (or the rule is gone) */
  ruleId: string | null;
  rulesLoading: boolean;
  catalog: AutomationCatalog | undefined;
  canWrite: boolean;
  busy: boolean;
  onClose: () => void;
  onEdit: (r: AutomationRule) => void;
  onTest: (r: AutomationRule) => void;
  onToggle: (r: AutomationRule) => void;
  onDelete: (r: AutomationRule) => void;
  onOpenRun: (runId: string) => void;
  onAllRuns: (ruleId: string) => void;
}

function RecentRuns({ ruleId, onOpenRun, onAllRuns }: { ruleId: string; onOpenRun: (id: string) => void; onAllRuns: (ruleId: string) => void }) {
  const runs = useAutomationRuns({ ruleId, page: 1, pageSize: 8 });
  if (runs.isLoading) return <Skeleton role="status" aria-label="Loading runs" className="h-20 w-full" />;
  if (runs.isError) {
    return (
      <div role="alert" className="space-y-2 text-[11px]">
        <p className="text-muted-foreground">{errorMessage(runs.error)}</p>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => void runs.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  const items = runs.data?.items ?? [];
  if (items.length === 0) return <p className="text-[11px] text-muted-foreground">This rule has not run yet.</p>;
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onOpenRun(r.id)} className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-muted/40" aria-label={`Open run: ${r.summary}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">{formatDateTime(r.timestamp)}</span>
                <RunBadge status={r.executionStatus} />
              </span>
              <span className="text-[11px] text-foreground/90">{r.summary}</span>
            </button>
          </li>
        ))}
      </ul>
      {(runs.data?.total ?? 0) > items.length && (
        <button type="button" onClick={() => onAllRuns(ruleId)} className="text-[11px] font-semibold text-foreground underline-offset-2 hover:underline">
          See all {formatNumber(runs.data?.total ?? 0)} runs
        </button>
      )}
    </div>
  );
}

/** a rule in full: when, only if, then, how it is approved, and its recent runs */
export function RuleDrawer({ rule, ruleId, rulesLoading, catalog, canWrite, busy, onClose, onEdit, onTest, onToggle, onDelete, onOpenRun, onAllRuns }: Props) {
  const off = !canWrite;
  const title = rule?.name ?? "Rule";
  const lines = rule ? conditionLines(rule) : [];
  const schedule = rule ? scheduleText(rule) : null;

  const footer = rule && (
    <div className="flex w-full flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" size="sm" className="h-9 sm:h-8 text-xs cursor-pointer" onClick={() => onTest(rule)}>
        Test
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-9 sm:h-8 text-xs cursor-pointer" disabled={off || busy} title={off ? WRITE_REASON : undefined} onClick={() => onEdit(rule)}>
        Edit
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-9 sm:h-8 text-xs cursor-pointer" loading={busy} disabled={off} title={off ? WRITE_REASON : undefined} onClick={() => onToggle(rule)}>
        {rule.status === "active" ? "Disable" : "Enable"}
      </Button>
      <Button type="button" variant="destructive" size="sm" className="h-9 sm:h-8 text-xs cursor-pointer" disabled={off || busy} title={off ? WRITE_REASON : undefined} onClick={() => onDelete(rule)}>
        Delete
      </Button>
    </div>
  );

  return (
    <ContextDrawer open={ruleId !== null} onClose={onClose} title={title} description={rule?.description ?? undefined} badge={rule ? <RuleBadge status={rule.status} /> : undefined} className="w-full sm:w-[460px]" footer={footer || undefined}>
      {!rule ? (
        rulesLoading ? (
          <div role="status" aria-label="Loading rule" className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <p role="alert" className="text-xs text-muted-foreground">
            This rule no longer exists.
          </p>
        )
      ) : (
        <div className="space-y-5 text-xs">
          <section className="space-y-2">
            <Line label="When">{triggerLabel(rule.triggerEvent, catalog)}</Line>
            {schedule && <Line label="Schedule">{schedule}</Line>}
            <Line label="Then">{actionLabel(rule.action.type)}</Line>
            <Line label="Each run">
              <ModeBadge mode={rule.mode} />
            </Line>
            <Line label="Runs so far">{formatNumber(rule.runsCount)}</Line>
            <Line label="Last run">{rule.lastRunAt ? formatRelativeTime(rule.lastRunAt) : "Never"}</Line>
            <Line label="Updated">{formatDateTime(rule.updatedAt)}</Line>
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Only when {rule.conditions.combinator === "any" ? "any of these is true" : "all of these are true"}</h3>
            {lines.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No conditions: every event of this trigger matches.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-4 text-[11px] text-foreground">
                {lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Action parameters</h3>
            <KeyValues values={Object.fromEntries(paramLines(rule.action.params))} empty="No parameters" />
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent runs</h3>
            <RecentRuns ruleId={rule.id} onOpenRun={onOpenRun} onAllRuns={onAllRuns} />
          </section>
        </div>
      )}
    </ContextDrawer>
  );
}
