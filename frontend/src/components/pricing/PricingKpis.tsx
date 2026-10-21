import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { formatINR, formatNumber } from "@/utils/format";
import type { PricingOverview } from "@/types/pricing";

interface PricingKpisProps {
  overview: PricingOverview | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onOpenPending: () => void;
  onOpenPolicies: () => void;
}

const TILE = "flex flex-col gap-1 rounded-xl border border-border bg-card p-4 text-left shadow-sm";
const LABEL = "text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

/** the four tiles over the queue: pending proposals, estimated margin gain, policies and channels covered */
export function PricingKpis({ overview, loading, error, onRetry, onOpenPending, onOpenPolicies }: PricingKpisProps) {
  if (loading && !overview) {
    return (
      <div role="status" aria-label="Loading pricing summary" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[98px] rounded-xl" />
        ))}
      </div>
    );
  }
  if (!overview) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-xs">
        <span className="text-muted-foreground">The pricing summary could not be loaded: {errorMessage(error)}</span>
        <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  const gain = overview.potentialMarginGainMinor;
  const channelNames = overview.channels.map((c) => c.name);
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <button type="button" onClick={onOpenPending} className={`${TILE} transition-colors hover:bg-muted/30`}>
        <span className={LABEL}>Pending proposals</span>
        <span className="font-mono text-2xl font-bold text-foreground">{formatNumber(overview.pendingProposals)}</span>
        <span className="text-[11px] font-medium text-amber-600">{overview.pendingProposals > 0 ? "Waiting for your review" : "Nothing waiting"}</span>
      </button>

      <div className={TILE}>
        <span className={LABEL}>Potential margin gain</span>
        <span className={`font-mono text-2xl font-bold ${gain > 0 ? "text-emerald-600" : "text-foreground"}`}>
          {gain > 0 ? "+" : ""}
          {formatINR(gain)}
        </span>
        <span className="text-[11px] text-muted-foreground">
          Estimated per month
          {overview.proposalsWithoutEstimate > 0 && ` · ${formatNumber(overview.proposalsWithoutEstimate)} without a cost price not counted`}
        </span>
      </div>

      <button type="button" onClick={onOpenPolicies} className={`${TILE} transition-colors hover:bg-muted/30`}>
        <span className={LABEL}>Active policies</span>
        <span className="font-mono text-2xl font-bold text-foreground">{formatNumber(overview.activePolicies)}</span>
        <span className="text-[11px] text-muted-foreground">
          {overview.pausedPolicies > 0 ? `${formatNumber(overview.pausedPolicies)} paused · ` : ""}
          {formatNumber(overview.autoAppliedLast30Days)} auto-applied in 30 days
        </span>
      </button>

      <div className={TILE}>
        <span className={LABEL}>Channel coverage</span>
        <span className="font-mono text-2xl font-bold text-foreground">
          {formatNumber(overview.channelsCovered)} {overview.channelsCovered === 1 ? "channel" : "channels"}
        </span>
        <span className="truncate text-[11px] text-muted-foreground" title={channelNames.join(", ")}>
          {channelNames.length > 0 ? channelNames.join(" · ") : "Connect a marketplace to price it"}
        </span>
      </div>
    </div>
  );
}
