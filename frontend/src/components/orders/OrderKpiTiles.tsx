import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { formatINR, formatNumber } from "@/utils/format";
import type { OrderStatus, OrdersSummary } from "@/types/orders";

interface OrderKpiTilesProps {
  summary: OrdersSummary | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** the statuses the list is filtered to (a tile is active when it matches exactly) */
  activeStatuses: readonly OrderStatus[];
  onPick: (statuses: OrderStatus[]) => void;
}

interface Tile {
  key: string;
  label: string;
  statuses: OrderStatus[];
  tone: string;
  active: string;
  caption: string;
  count: (s: OrdersSummary) => number;
}

const PIPELINE: Tile[] = [
  { key: "all", label: "Total orders", statuses: [], tone: "text-foreground", active: "border-[#1D4ED8] bg-[#E6F4FF]/30", caption: "All statuses", count: (s) => s.tabs.all },
  { key: "new", label: "New", statuses: ["new"], tone: "text-[#1D4ED8]", active: "border-blue-500 bg-blue-50/50", caption: "Awaiting confirmation", count: (s) => s.statusCounts.new },
  { key: "confirmed", label: "Confirmed", statuses: ["confirmed"], tone: "text-indigo-600", active: "border-indigo-500 bg-indigo-50/50", caption: "Ready for the warehouse", count: (s) => s.statusCounts.confirmed },
  { key: "picking", label: "Picking", statuses: ["picking"], tone: "text-amber-600", active: "border-amber-500 bg-amber-50/50", caption: "Being picked", count: (s) => s.statusCounts.picking },
  {
    key: "packed",
    label: "Packed / ready",
    statuses: ["packed", "ready_to_dispatch"],
    tone: "text-purple-600",
    active: "border-purple-500 bg-purple-50/50",
    caption: "Waiting for the carrier",
    count: (s) => s.statusCounts.packed + s.statusCounts.ready_to_dispatch,
  },
  {
    key: "transit",
    label: "Dispatched / in transit",
    statuses: ["dispatched", "in_transit"],
    tone: "text-emerald-600",
    active: "border-emerald-500 bg-emerald-50/50",
    caption: "With the carrier",
    count: (s) => s.statusCounts.dispatched + s.statusCounts.in_transit,
  },
];

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

function Stat({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold text-foreground">{value}</p>
      <span className="text-[11px] text-muted-foreground">{caption}</span>
    </div>
  );
}

/** the numbers at the top: how the day is going, then how many orders sit in each stage (a stage tile filters the list) */
export function OrderKpiTiles({ summary, loading, error, onRetry, activeStatuses, onPick }: OrderKpiTilesProps) {
  if (error && !summary) {
    return (
      <div role="alert" className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-xs">
        <span className="text-muted-foreground">Order numbers could not be loaded. {error}</span>
        <button type="button" onClick={onRetry} className="rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-muted">
          Retry
        </button>
      </div>
    );
  }
  if (loading && !summary) {
    return (
      <div role="status" aria-label="Loading order numbers" className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[78px] rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[86px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (!summary) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Today at a glance">
        <Stat label="Orders today" value={formatNumber(summary.today.orders)} caption={`${formatNumber(summary.today.newOrders)} still new`} />
        <Stat label="Revenue today" value={formatINR(summary.today.revenueMinor)} caption="Excludes cancelled and returned" />
        <Stat label="Pending dispatch" value={formatNumber(summary.pendingDispatchCount)} caption="Not yet handed to a carrier" />
        <Stat
          label="Avg fulfilment time"
          value={summary.avgFulfillmentHours === null ? "—" : `${summary.avgFulfillmentHours} h`}
          caption={summary.avgFulfillmentHours === null ? "No dispatches yet" : `Order to dispatch, last ${summary.windowDays} days`}
        />
        <Stat
          label="Cancellation rate"
          value={summary.cancellationRatePct === null ? "—" : `${summary.cancellationRatePct}%`}
          caption={summary.cancellationRatePct === null ? "No orders yet" : `Last ${summary.windowDays} days`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="Orders by stage">
        {PIPELINE.map((tile) => {
          const active = sameSet(activeStatuses, tile.statuses);
          return (
            <button
              key={tile.key}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(tile.statuses)}
              className={cn(
                "rounded-xl border p-3.5 text-left transition-all",
                active ? `${tile.active} shadow-sm` : "border-border bg-card hover:bg-muted/30",
              )}
            >
              <p className={cn("text-[10px] font-semibold uppercase tracking-wider", tile.key === "all" ? "text-muted-foreground" : tile.tone)}>{tile.label}</p>
              <p className={cn("mt-1 font-mono text-xl font-bold", tile.tone)}>{formatNumber(tile.count(summary))}</p>
              <span className="text-[11px] text-muted-foreground">{tile.caption}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
