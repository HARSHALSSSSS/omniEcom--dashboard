import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/utils/format";
import type { PromotionOverview } from "@/types/promotions";
import { formatBps, money, whenOf } from "./promoFormat";
import { Stat } from "./PromoUi";

interface Props {
  overview: PromotionOverview | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/** the tiles above the lists: everything comes from GET /promotions/overview */
export function PromoOverview({ overview: o, loading, error, onRetry }: Props) {
  if (loading) {
    return (
      <div role="status" aria-label="Loading overview" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[98px] w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (error || !o) {
    return (
      <div role="alert" className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        The campaign numbers could not be loaded.
        <button type="button" onClick={onRetry} className="font-semibold text-foreground underline-offset-2 hover:underline">
          Retry
        </button>
      </div>
    );
  }
  const lift = o.velocityLiftBps;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Active campaigns" value={formatNumber(o.activeCampaigns)} hint={`${formatNumber(o.scheduledCampaigns)} scheduled · ${formatNumber(o.draftCampaigns)} draft`} tone="text-emerald-600" />
        <Stat label="Revenue generated" value={money(o.revenueMinor, o.currency)} hint="From orders on promoted products" />
        <Stat
          label="Units moved"
          value={formatNumber(o.unitsMoved)}
          hint={lift === null ? "Velocity lift appears after a campaign has run" : `Velocity lift ${lift > 0 ? "+" : ""}${formatBps(lift)} across ${o.velocityCampaigns} campaign${o.velocityCampaigns === 1 ? "" : "s"}`}
          tone={lift !== null && lift > 0 ? "text-blue-600" : undefined}
        />
        <Stat
          label="Discount spend"
          value={money(o.spendMinor, o.currency)}
          hint={o.budgetMinor > 0 ? `${money(o.budgetMinor, o.currency)} budget · ${o.budgetUsedBps === null ? "" : formatBps(o.budgetUsedBps)} used` : "No budget limit set"}
        />
      </div>
      {o.statsUpdatedAt && <p className="text-[11px] text-muted-foreground">Results updated {whenOf(o.statsUpdatedAt)}</p>}
    </div>
  );
}
