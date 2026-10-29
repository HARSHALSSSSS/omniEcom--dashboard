import { X } from "lucide-react";
import type { DecisionAction } from "@/types/pricing";
import { TOOLBAR_BUTTON } from "../PricingStates";

interface ProposalBulkBarProps {
  count: number;
  /** the API decides at most this many proposals in one call */
  max: number;
  busy: boolean;
  onAction: (action: DecisionAction) => void;
  onClear: () => void;
}

/** the toolbar over the table while proposals are selected; each action is one POST with a result per proposal */
export function ProposalBulkBar({ count, max, busy, onAction, onClear }: ProposalBulkBarProps) {
  return (
    <div role="toolbar" aria-label="Bulk actions" className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
      <span className="min-w-[150px] text-xs font-semibold" aria-live="polite">
        {count} {count === 1 ? "proposal" : "proposals"} selected
      </span>
      <button type="button" className={TOOLBAR_BUTTON} disabled={busy} onClick={() => onAction("approve")}>
        Approve selected
      </button>
      <button type="button" className={TOOLBAR_BUTTON} disabled={busy} onClick={() => onAction("reject")}>
        Reject selected
      </button>
      <span className="text-[11px] text-muted-foreground">Up to {max} at a time</span>
      <button type="button" onClick={onClear} aria-label="Clear selection" title="Clear selection" className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
