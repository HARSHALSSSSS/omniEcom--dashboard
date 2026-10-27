import { CheckCircle2 } from "lucide-react";

export interface ExceptionSummaryItem {
  id: string;
  count: number;
  label: string;
}

interface FulfillmentExceptionsStripProps {
  categories?: ExceptionSummaryItem[];
  onSelectException?: (type: string) => void;
}

export function FulfillmentExceptionsStrip({
  categories,
  onSelectException,
}: FulfillmentExceptionsStripProps) {
  // nothing is shown until the queue has loaded: no invented exceptions
  if (!categories) return null;
  const displayItems = categories;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 text-xs shadow-2xs">
      <span className="font-bold text-foreground shrink-0">Exceptions</span>

      {displayItems.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {displayItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectException?.(item.id)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <span className="h-3 w-1 rounded-full bg-rose-600" />
              <span className="font-bold text-rose-600 dark:text-rose-400">
                {item.count} {item.count === 1 ? "order" : "orders"}
              </span>
              <span>{item.label}</span>
              <span className="text-[10px] opacity-60 ml-0.5">&gt;</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>No open exceptions across fulfillment stages.</span>
        </div>
      )}
    </div>
  );
}
