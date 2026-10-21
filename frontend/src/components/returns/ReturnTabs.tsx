import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { RETURN_TABS, type ReturnTab, type TabCounts } from "@/types/returns";
import { TAB_LABELS } from "./returnParams";

interface ReturnTabsProps {
  active: ReturnTab;
  counts: TabCounts | undefined;
  onChange: (tab: ReturnTab) => void;
}

/** ledger tabs; the counts come from the same predicates as the list, so a tab never shows a different number than its list */
export function ReturnTabs({ active, counts, onChange }: ReturnTabsProps) {
  return (
    <div role="tablist" aria-label="Return queues" className="flex flex-wrap gap-1 border-b border-border">
      {RETURN_TABS.map((tab) => {
        const selected = tab === active;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              selected ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABELS[tab]}
            <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px]">{counts ? formatNumber(counts[tab]) : "—"}</span>
          </button>
        );
      })}
    </div>
  );
}
