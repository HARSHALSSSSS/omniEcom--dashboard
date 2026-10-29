import { Check, Clock, Minus } from "lucide-react";
import type { Issue } from "@/types/attention";
import { AREA_LABEL, PRIORITY_LABEL, PRIORITY_STYLE, READ_ONLY_REASON } from "./attention.ui";
import { formatInZone } from "@/utils/format";

interface Props {
  issues: Issue[];
  selected: string[];
  canWrite: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
}

const when = (iso: string | null) => (iso ? formatInZone(iso, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

/** the checkbox, drawn like the design; disabled (with the reason) for a read-only role */
function Box({ checked, partial, disabled, label, onClick }: { checked: boolean; partial?: boolean; disabled: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={partial ? "mixed" : checked}
      aria-label={label}
      disabled={disabled}
      title={disabled ? READ_ONLY_REASON : undefined}
      onClick={onClick}
      className={`relative w-4 h-4 rounded-[3px] border flex items-center justify-center shrink-0 transition-colors before:content-[''] before:absolute before:-inset-2.5 before:sm:inset-0 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${
        checked || partial ? "bg-[#000000] border-[#000000]" : "bg-white border-[#BDBDBD]"
      }`}
    >
      {checked ? <Check className="w-3 h-3 text-white stroke-[2.5]" /> : partial ? <Minus className="w-3 h-3 text-white stroke-[2.5]" /> : null}
    </button>
  );
}

/** column heading + one row per issue (priority, title and explanation, area, impact, due, recommended action) */
export function IssueList({ issues, selected, canWrite, onToggle, onToggleAll, onOpen }: Props) {
  const all = issues.length > 0 && issues.every((i) => selected.includes(i.id));
  const some = selected.length > 0 && !all;

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-row items-center px-4 h-10 gap-3 text-[11px] font-medium leading-[145%] text-[#666666]">
        <Box checked={all} partial={some} disabled={!canWrite} label="Select all issues on this page" onClick={onToggleAll} />
        <span className="lg:hidden text-[12px] font-medium text-[#666666]">Select all</span>
        <span className="hidden lg:inline-block w-[66px] shrink-0">Priority</span>
        <span className="hidden lg:inline-block flex-1 min-w-[280px]">Issue</span>
        <span className="hidden lg:inline-block w-[76px] shrink-0">Area</span>
        <span className="hidden lg:inline-block w-[138px] shrink-0">Impact</span>
        <span className="hidden lg:inline-block w-[102px] shrink-0">Due</span>
        <span className="hidden lg:inline-block w-[142px] shrink-0 text-right">Action</span>
      </div>

      <div className="flex flex-col gap-2">
        {issues.map((item) => {
          const checked = selected.includes(item.id);
          const style = PRIORITY_STYLE[item.priority];
          const urgent = item.dueLabel === "Overdue" || item.dueLabel?.startsWith("Today");
          return (
            <div
              key={item.id}
              data-testid="issue-row"
              style={{ borderColor: style.color, backgroundColor: checked ? "#F3F0FF" : "#FFFFFF" }}
              className="grid grid-cols-[auto_auto_1fr_auto] lg:flex lg:flex-row items-center lg:items-center px-4 py-3.5 lg:py-[18px] gap-x-2.5 sm:gap-x-3 gap-y-2 lg:gap-3 border rounded-[12px] shadow-[0px_3px_10px_rgba(36,50,75,0.055)] min-h-[88px] transition-all w-full"
            >
              <div className="order-1 lg:order-none self-center shrink-0">
                <Box checked={checked} disabled={!canWrite} label={`Select ${item.title}`} onClick={() => onToggle(item.id)} />
              </div>

              <div className="flex items-center gap-1.5 order-2 lg:order-none w-auto lg:w-[66px] shrink-0">
                <span className="h-1 w-1 rounded-full shrink-0" style={{ backgroundColor: style.bullet }} />
                <span className="text-[12px] font-semibold leading-[145%]" style={{ color: style.color }}>
                  {PRIORITY_LABEL[item.priority]}
                </span>
              </div>

              <div className="order-5 lg:order-none col-span-full lg:col-span-1 flex flex-col gap-1 w-full lg:flex-1 lg:min-w-[280px] lg:pr-2">
                <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">{item.title}</span>
                <span className="text-[12px] font-normal text-[#666666] leading-[145%]">{item.explanation}</span>
                {(item.status === "in_progress" || item.statusNote) && (
                  <div className="flex flex-row items-center gap-1.5 pt-0.5">
                    <Clock className="w-3 h-3 text-[#666666] shrink-0" />
                    <span className="text-[11px] font-medium text-[#666666] leading-[145%]">
                      {item.status === "in_progress" ? `In progress · ${item.statusNote ?? "Review started"}` : item.statusNote}
                      {item.assigneeName ? ` · ${item.assigneeName}` : ""}
                    </span>
                  </div>
                )}
                {!item.statusNote && item.status !== "in_progress" && item.assigneeName && (
                  <span className="text-[11px] font-medium text-[#666666] leading-[145%]">Assigned to {item.assigneeName}</span>
                )}
              </div>

              <span className="order-3 lg:order-none w-auto lg:w-[76px] shrink-0 text-[12px] font-normal text-[#666666] leading-[145%]">
                <span className="lg:hidden text-[#BDBDBD] mr-1.5">·</span>
                {AREA_LABEL[item.area] ?? item.area}
              </span>

              <span className="order-6 lg:order-none col-span-2 lg:col-span-1 w-auto lg:w-[138px] shrink-0 text-[12px] font-normal text-[#666666] leading-[145%] truncate">
                {item.impact ? (
                  <>
                    <span className="lg:hidden font-medium text-[#666666] mr-1">Impact:</span>
                    {item.impact}
                  </>
                ) : (
                  "–"
                )}
              </span>

              <span className={`order-4 lg:order-none justify-self-end text-right lg:text-left w-auto lg:w-[102px] shrink-0 text-[12px] leading-[145%] ${urgent ? "font-medium text-[#000000]" : "font-normal text-[#666666]"}`}>
                {item.status === "snoozed" && item.snoozedUntil ? `Returns ${when(item.snoozedUntil)}` : (item.dueLabel ?? "No deadline")}
              </span>

              <div className="order-7 lg:order-none col-span-2 lg:col-span-1 justify-self-end text-right w-auto lg:w-[142px] shrink-0">
                <button type="button" onClick={() => onOpen(item.id)} className="text-[12px] font-medium text-[#000000] hover:underline cursor-pointer min-h-[44px] sm:min-h-0 inline-flex items-center justify-end">
                  {item.recommendedAction.label ?? "Review"} →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
