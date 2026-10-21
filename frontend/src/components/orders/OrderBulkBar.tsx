import { X } from "lucide-react";
import { NO_WRITE_REASON } from "./orderFormat";

interface OrderBulkBarProps {
  count: number;
  /** the API takes at most this many orders in one call */
  max: number;
  canWrite: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onAssign: () => void;
  onPriority: (priority: boolean) => void;
  onClear: () => void;
}

const BUTTON =
  "h-[30px] rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

/** the toolbar over the table while orders are selected; each action is one POST /orders/bulk */
export function OrderBulkBar({ count, max, canWrite, busy, onConfirm, onCancel, onAssign, onPriority, onClear }: OrderBulkBarProps) {
  const off = busy || !canWrite;
  const reason = canWrite ? undefined : NO_WRITE_REASON;
  return (
    <div role="toolbar" aria-label="Bulk actions" className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3">
      <span className="min-w-[130px] text-xs font-semibold" aria-live="polite">
        {count} {count === 1 ? "order" : "orders"} selected
      </span>
      <button type="button" className={BUTTON} disabled={off} title={reason} onClick={onConfirm}>
        Confirm
      </button>
      <button type="button" className={BUTTON} disabled={off} title={reason} onClick={onAssign}>
        Assign warehouse
      </button>
      <button type="button" className={BUTTON} disabled={off} title={reason} onClick={() => onPriority(true)}>
        Mark priority
      </button>
      <button type="button" className={BUTTON} disabled={off} title={reason} onClick={() => onPriority(false)}>
        Clear priority
      </button>
      <button type="button" className={`${BUTTON} text-rose-700`} disabled={off} title={reason} onClick={onCancel}>
        Cancel orders
      </button>
      <span className="text-[11px] text-muted-foreground">Up to {max} orders at a time</span>
      <button type="button" onClick={onClear} aria-label="Clear selection" title="Clear selection" className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
