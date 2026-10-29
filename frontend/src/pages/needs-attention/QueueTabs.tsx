import { History } from "lucide-react";
import type { IssueCounts, IssueTab } from "@/types/attention";

const TABS: Array<{ value: IssueTab; label: string }> = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
];

interface Props {
  view: "queue" | "history";
  tab: IssueTab;
  counts: IssueCounts | undefined;
  historyTotal: number | undefined;
  onTab: (tab: IssueTab) => void;
  onView: (view: "queue" | "history") => void;
}

/** the tab bar: All / Critical / Today / Upcoming with the server's counts, or the history navigation */
export function QueueTabs({ view, tab, counts, historyTotal, onTab, onView }: Props) {
  if (view === "history") {
    return (
      <div className="flex flex-row items-center justify-between border-b border-[#EAEAEA] h-[42px] w-full overflow-x-auto scrollbar-none">
        <div className="flex flex-row items-center gap-4 sm:gap-7 h-full shrink-0">
          <button
            type="button"
            onClick={() => onView("queue")}
            className="flex items-center gap-1.5 h-full px-0.5 border-b-2 border-transparent text-[12px] font-normal text-[#666666] hover:text-[#000000] cursor-pointer shrink-0 min-h-[44px] sm:min-h-0"
          >
            <span>Open queue{counts ? ` · ${counts.open}` : ""}</span>
          </button>
          <div className="flex items-center gap-1.5 h-full px-0.5 border-b-2 border-[#000000] text-[12px] font-semibold text-[#000000] shrink-0 min-h-[44px] sm:min-h-0">
            <span>History{historyTotal !== undefined ? ` · ${historyTotal}` : ""}</span>
          </div>
        </div>
        <div className="flex justify-end shrink-0 ml-4">
          <button type="button" onClick={() => onView("queue")} className="text-[12px] font-medium text-[#000000] hover:underline cursor-pointer flex items-center gap-1.5 min-h-[44px] sm:min-h-0">
            <span>← Back to open queue</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-row justify-between items-center border-b border-[#EAEAEA] h-[42px] w-full overflow-x-auto scrollbar-none">
      <div role="tablist" className="flex flex-row items-center gap-4 sm:gap-7 h-full shrink-0">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => onTab(t.value)}
            className={`flex items-center gap-2 h-full px-0.5 border-b-2 transition-colors shrink-0 min-h-[44px] sm:min-h-0 ${
              tab === t.value ? "border-[#000000] font-semibold text-[#000000]" : "border-transparent font-normal text-[#666666] hover:text-[#000000]"
            }`}
          >
            <span className="text-[12px] leading-[145%]">{t.label}</span>
            <span className="text-[11px] font-normal text-[#666666] leading-[145%]" data-testid={`tab-count-${t.value}`}>
              {counts ? counts.tabs[t.value] : "–"}
            </span>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onView("history")} className="flex items-center gap-1.5 text-[12px] font-medium text-[#000000] hover:underline cursor-pointer shrink-0 ml-4 min-h-[44px] sm:min-h-0">
        <History className="h-3.5 w-3.5 text-[#666666]" />
        <span>View history</span>
      </button>
    </div>
  );
}
