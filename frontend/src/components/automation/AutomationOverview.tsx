import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatNumber, formatPercent, formatRelativeTime } from "@/utils/format";
import { Stat } from "./AutoUi";
import type { AutomationOverview as Overview } from "@/types/automation";

interface Props {
  overview: Overview | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/** the tiles above the tabs: everything comes from GET /automation/overview */
export function AutomationOverview({ overview: o, loading, error, onRetry }: Props) {
  if (loading) {
    return (
      <div role="status" aria-label="Loading overview" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[98px] w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (error || !o) {
    return (
      <div role="alert" className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        The automation numbers could not be loaded.
        <button type="button" onClick={onRetry} className="font-semibold text-foreground underline-offset-2 hover:underline">
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      <Stat label="Active rules" value={formatNumber(o.activeRules)} hint={`of ${formatNumber(o.totalRules)} rule${o.totalRules === 1 ? "" : "s"}`} tone={o.activeRules > 0 ? "text-emerald-600" : undefined} />
      <Stat label="Awaiting approval" value={formatNumber(o.pendingApprovals)} hint={o.pendingApprovals > 0 ? "Proposed actions need a decision" : "Nothing waiting"} tone={o.pendingApprovals > 0 ? "text-amber-600" : undefined} />
      <Stat label="Runs, last 24 hours" value={formatNumber(o.runs24h)} hint={o.lastRunAt ? `Last run ${formatRelativeTime(o.lastRunAt)}${o.lastRunRule ? `: ${o.lastRunRule}` : ""}` : "No run yet"} />
      <Stat label="Success rate" value={o.successRate === null ? "—" : formatPercent(o.successRate)} hint={o.successRate === null ? "Appears once a run has completed" : "Of the runs attempted in the last 24 hours"} tone={o.successRate !== null && o.successRate < 90 ? "text-rose-600" : undefined} />
      {o.lastRunAt && <span className="sr-only">Last run at {formatDateTime(o.lastRunAt)}</span>}
    </div>
  );
}
