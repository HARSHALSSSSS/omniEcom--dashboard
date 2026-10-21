import { X } from "lucide-react";
import type { BulkProductAction } from "@/types/product";
import { NO_EDIT_REASON } from "./listModel";

interface BulkBarProps {
  count: number;
  canWrite: boolean;
  busy: boolean;
  onAction: (action: BulkProductAction) => void;
  onEdit: () => void;
  onClear: () => void;
}

const BUTTON =
  "box-border flex flex-row justify-center items-center px-4 h-[30px] bg-[#FFFFFF] rounded-[8px] text-[12px] font-semibold text-[#000000] hover:bg-[#EAEAEA] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#FFFFFF]";

/** The toolbar over the grid while products are selected. Every action is one POST /products/bulk-actions. */
export function BulkBar({ count, canWrite, busy, onAction, onEdit, onClear }: BulkBarProps) {
  const reason = canWrite ? undefined : NO_EDIT_REASON;
  const off = busy || !canWrite;
  return (
    <div className="w-full flex flex-col items-start gap-1">
      <div role="toolbar" aria-label="Bulk actions" className="w-full box-border flex flex-row flex-wrap items-center px-3 min-h-[44px] bg-[#F5F5F5] rounded-[8px] gap-2 transition-all">
        <span className="text-[12px] font-semibold text-[#000000] min-w-[140px]" aria-live="polite">
          {count} {count === 1 ? "product" : "products"} selected
        </span>

        <button
          type="button"
          onClick={onEdit}
          disabled={count !== 1 || !canWrite}
          title={!canWrite ? reason : count !== 1 ? "Select a single product to edit it" : undefined}
          className={`${BUTTON} border border-[#666666]`}
        >
          Edit
        </button>
        <button type="button" onClick={() => onAction("check_publish_readiness")} disabled={busy} className={BUTTON}>
          Check readiness
        </button>
        <button type="button" onClick={() => onAction("duplicate")} disabled={off} title={reason} className={BUTTON}>
          Duplicate
        </button>
        <button type="button" onClick={() => onAction("archive")} disabled={off} title={reason} className={BUTTON}>
          Archive
        </button>
        <button type="button" onClick={() => onAction("unarchive")} disabled={off} title={reason} className={BUTTON}>
          Unarchive
        </button>

        <div className="flex-1 flex justify-end">
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selection"
            title="Clear selection"
            className="p-1 hover:bg-[#EAEAEA] rounded text-[#666666] hover:text-[#000000] transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <div className="w-full text-right text-[11px] font-normal leading-[16px] text-[#666666] pr-1">Actions apply to the products selected on this page</div>
    </div>
  );
}
