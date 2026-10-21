import { X } from "lucide-react";
import { BULK_ACTIONS, type ListingBulkAction } from "@/types/listing";
import { ACTION_LABELS, NO_WRITE_REASON } from "./listingFormat";

interface ListingBulkBarProps {
  count: number;
  /** the API takes at most this many listings in one call */
  max: number;
  /** the "Not listed" tab selects variants: its one action creates draft listings */
  mode: "listings" | "variants";
  canWrite: boolean;
  busy: boolean;
  onAction: (action: ListingBulkAction) => void;
  onCreate: () => void;
  onClear: () => void;
}

const BUTTON =
  "h-[30px] rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

/** the toolbar over the table while rows are selected; each action is one POST */
export function ListingBulkBar({ count, max, mode, canWrite, busy, onAction, onCreate, onClear }: ListingBulkBarProps) {
  const off = busy || !canWrite;
  const reason = canWrite ? undefined : NO_WRITE_REASON;
  const noun = mode === "variants" ? (count === 1 ? "product" : "products") : count === 1 ? "listing" : "listings";
  return (
    <div role="toolbar" aria-label="Bulk actions" className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3">
      <span className="min-w-[130px] text-xs font-semibold" aria-live="polite">
        {count} {noun} selected
      </span>
      {mode === "variants" ? (
        <button type="button" className={BUTTON} disabled={off} title={reason} onClick={onCreate}>
          Create listings
        </button>
      ) : (
        BULK_ACTIONS.map((action) => (
          <button key={action} type="button" className={BUTTON} disabled={off} title={reason} onClick={() => onAction(action)}>
            {ACTION_LABELS[action]}
          </button>
        ))
      )}
      <span className="text-[11px] text-muted-foreground">Up to {max} at a time</span>
      <button type="button" onClick={onClear} aria-label="Clear selection" title="Clear selection" className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
