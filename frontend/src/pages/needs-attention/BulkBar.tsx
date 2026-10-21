import { X } from "lucide-react";
import type { Assignee, SnoozePreset } from "@/types/attention";
import { AssignMenu, SnoozeMenu } from "./SnoozeMenu";

interface Props {
  count: number;
  busy: boolean;
  members: Assignee[] | undefined;
  onResolve: () => void;
  onSnooze: (until: SnoozePreset) => void;
  onAssign: (userId: string) => void;
  onClear: () => void;
}

const BTN = "h-[30px] px-3.5 rounded-[8px] bg-white border border-[#666666] text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed";

/** appears when rows are selected; resolve / snooze / assign go to POST /issues/bulk (one result per id) */
export function BulkBar({ count, busy, members, onResolve, onSnooze, onAssign, onClear }: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="relative flex flex-row items-center px-3 h-11 gap-2 bg-[#EDE8FB] border border-[#DAD1F5] rounded-[12px] shadow-[0px_3px_10px_rgba(36,50,75,0.055)] animate-in fade-in duration-150 z-20"
    >
      <span className="text-[12px] font-semibold leading-[145%] text-[#000000] shrink-0 mr-1">{count} selected</span>

      <button type="button" onClick={onResolve} disabled={busy} className={`${BTN} px-4 justify-center shrink-0`}>
        Mark resolved
      </button>

      <SnoozeMenu disabled={busy} buttonClassName={BTN} onPick={onSnooze} />

      {members && members.length > 0 && <AssignMenu members={members} disabled={busy} buttonClassName={BTN} onPick={onAssign} />}

      <div className="flex-1 flex justify-end">
        <button type="button" onClick={onClear} aria-label="Clear selection" className="w-5 h-5 flex items-center justify-center text-[#666666] hover:text-[#000000] transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
