import { formatRelativeTime } from "@/utils/format";
import type { ActivityEvent } from "@/types/fulfillment";
import { titleCase } from "./fulfillmentFormat";

interface FulfillmentActivityTimelineProps {
  /** the latest real status changes; undefined while loading */
  events?: ActivityEvent[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onOpenOrder?: (orderId: string) => void;
}

const DONE = new Set(["picked", "packed", "ready_to_ship", "shipped", "delivered"]);

/** what happened last, with the real time of each change */
export function FulfillmentActivityTimeline({ events, loading, error, onRetry, onOpenOrder }: FulfillmentActivityTimelineProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
      <div className="flex items-center justify-between pb-3 text-xs">
        <span className="font-semibold text-foreground">Fulfillment Activity</span>
        <span className="text-muted-foreground">Latest status changes</span>
      </div>

      {error && !events ? (
        <div role="alert" className="flex items-center justify-between text-xs text-muted-foreground">
          <span>The activity could not be loaded. {error}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="font-semibold text-foreground hover:underline">
              Retry
            </button>
          )}
        </div>
      ) : loading && !events ? (
        <p role="status" className="text-xs text-muted-foreground">
          Loading activity...
        </p>
      ) : !events || events.length === 0 ? (
        <p className="text-xs text-muted-foreground">No fulfillment activity yet. Status changes appear here as orders are picked, packed and handed over.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 pt-1 text-xs sm:grid-cols-3 lg:grid-cols-5">
          {events.map((item) => (
            <div key={item.id} className="flex flex-col">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${DONE.has(item.to) ? "bg-emerald-500" : "bg-blue-500"}`} />
                <time dateTime={item.at} title={new Date(item.at).toLocaleString()} className="font-mono">
                  {formatRelativeTime(item.at)}
                </time>
              </div>
              <button type="button" onClick={() => onOpenOrder?.(item.orderId)} className="mt-1 text-left font-mono font-bold text-foreground hover:underline">
                {item.orderNumber}
              </button>
              <span className="text-[11px] text-muted-foreground">
                {titleCase(item.to)}
                {item.actor?.name ? ` · ${item.actor.name}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
