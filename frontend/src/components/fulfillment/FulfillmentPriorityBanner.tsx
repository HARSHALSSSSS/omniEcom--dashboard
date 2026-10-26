import { ArrowRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PriorityOrderSummary {
  orderNumber: string;
  marketplace: string;
  minutesRemaining: number;
  subtext: string;
  orderId?: string;
}

interface FulfillmentPriorityBannerProps {
  orders?: PriorityOrderSummary[];
  onOpenOrder?: (orderId: string) => void;
  onWorkOnPriority?: () => void;
}

const DEFAULT_PRIORITY_ORDERS: PriorityOrderSummary[] = [
  {
    orderNumber: "ORD-10291",
    marketplace: "Amazon",
    minutesRemaining: 42,
    subtext: "Picking in progress · 1 item left",
    orderId: "ORD-10291",
  },
  {
    orderNumber: "ORD-10287",
    marketplace: "Flipkart",
    minutesRemaining: 58,
    subtext: "2 items awaiting verification",
    orderId: "ORD-10287",
  },
];

export function FulfillmentPriorityBanner({
  orders,
  onOpenOrder,
  onWorkOnPriority,
}: FulfillmentPriorityBannerProps) {
  const displayOrders = orders ?? DEFAULT_PRIORITY_ORDERS;
  const breachCount = displayOrders.length;

  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-xs font-bold text-foreground">Fulfillment Priority</span>
          <span className="text-xs text-muted-foreground">
            {breachCount > 0
              ? `${breachCount} ${breachCount === 1 ? "order" : "orders"} may breach dispatch SLA within 90 minutes.`
              : "All active orders are currently meeting dispatch SLAs."}
          </span>
        </div>

        {breachCount > 0 && (
          <Button
            size="sm"
            onClick={onWorkOnPriority}
            className="h-8 gap-1.5 bg-neutral-900 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 self-start sm:self-auto shrink-0"
          >
            Work on priority orders
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {breachCount > 0 && (
        <div className="mt-3.5 flex flex-wrap items-center gap-4 border-t border-amber-200/60 pt-3 dark:border-amber-900/40 text-xs">
          {displayOrders.slice(0, 2).map((item, idx) => (
            <div key={item.orderNumber} className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => onOpenOrder?.(item.orderId || item.orderNumber)}
                className="group flex flex-col text-left hover:opacity-90"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-foreground group-hover:underline">
                    {item.orderNumber}
                  </span>
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    {item.minutesRemaining} min remaining
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  <span>{item.marketplace}</span>
                  <span className="mx-1.5">·</span>
                  <span>{item.subtext}</span>
                </div>
              </button>

              {idx === 0 && displayOrders.length > 1 && (
                <div className="h-8 w-px bg-amber-200 dark:bg-amber-800 hidden sm:block" />
              )}
            </div>
          ))}

          {displayOrders.length > 2 && (
            <button
              type="button"
              onClick={onWorkOnPriority}
              className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              +{displayOrders.length - 2} more order{displayOrders.length - 2 > 1 ? "s" : ""} &gt;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
