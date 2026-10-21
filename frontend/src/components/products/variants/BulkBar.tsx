import { X } from "lucide-react";
import type { VariantBulkAction } from "@/types/variants";
import { formatNumber } from "@/utils/format";
import { Menu } from "./Menu";

const btn =
  "box-border flex flex-row justify-center items-center px-4 h-9 bg-[#FFFFFF] border border-[#666666] hover:bg-[#F5F5F5] rounded-[8px] text-[12px] font-semibold leading-[17px] text-[#000000] transition-colors cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed";

interface Props {
  count: number;
  busy: boolean;
  onAction: (action: VariantBulkAction) => void;
  onClear: () => void;
}

/** the "Bulk actions" control of the search row: archive / activate / delete the selected variants (<= 200 per call) */
export function BulkBar({ count, busy, onAction, onClear }: Props) {
  return (
    <div className="flex flex-row items-center gap-2 shrink-0">
      {count > 0 && (
        <span className="flex items-center gap-1 text-[12px] text-[#666666]" role="status">
          {formatNumber(count)} selected
          <button type="button" onClick={onClear} aria-label="Clear selection" className="p-0.5 rounded hover:bg-[#F5F5F5] cursor-pointer">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      )}
      <Menu
        label="Bulk actions"
        className={btn}
        disabled={count === 0 || busy}
        title={count === 0 ? "Select one or more variants first" : undefined}
        items={[
          { key: "activate", label: `Activate ${count} variant${count === 1 ? "" : "s"}`, onSelect: () => onAction("activate") },
          { key: "archive", label: `Archive ${count} variant${count === 1 ? "" : "s"}`, onSelect: () => onAction("archive") },
          { key: "delete", label: `Delete ${count} variant${count === 1 ? "" : "s"}`, danger: true, onSelect: () => onAction("delete") },
        ]}
      >
        Bulk actions
      </Menu>
    </div>
  );
}
