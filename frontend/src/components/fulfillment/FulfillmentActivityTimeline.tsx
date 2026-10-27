export interface ActivityEvent {
  time: string;
  orderNumber: string;
  action: string;
  color: "green" | "blue";
  orderId?: string;
}

const DEFAULT_ACTIVITIES: ActivityEvent[] = [
  { time: "12:42", orderNumber: "ORD-10288", action: "packed", color: "green" },
  { time: "12:39", orderNumber: "ORD-10291", action: "picking started", color: "blue" },
  { time: "12:35", orderNumber: "ORD-10281", action: "quantity verified", color: "green" },
  { time: "12:31", orderNumber: "ORD-10276", action: "shipping label generated", color: "blue" },
  { time: "12:26", orderNumber: "ORD-10274", action: "dispatch evidence recorded", color: "green" },
];

interface FulfillmentActivityTimelineProps {
  events?: ActivityEvent[];
  onOpenOrder?: (orderIdOrNumber: string) => void;
}

export function FulfillmentActivityTimeline({
  events,
  onOpenOrder,
}: FulfillmentActivityTimelineProps) {
  const displayActivities = events ?? DEFAULT_ACTIVITIES;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
      <div className="flex items-center justify-between pb-3 text-xs">
        <span className="font-semibold text-foreground">Fulfillment Activity</span>
        <span className="text-muted-foreground">Today · IST</span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 pt-1 text-xs">
        {displayActivities.map((item) => (
          <div key={item.orderNumber + item.time} className="flex flex-col">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className={`h-2 w-2 rounded-full ${
                  item.color === "green" ? "bg-emerald-500" : "bg-blue-500"
                }`}
              />
              <span className="font-mono">{item.time}</span>
            </div>
            <button
              type="button"
              onClick={() => onOpenOrder?.(item.orderId || item.orderNumber)}
              className="mt-1 text-left font-mono font-bold text-foreground hover:underline"
            >
              {item.orderNumber}
            </button>
            <span className="text-[11px] text-muted-foreground">{item.action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
