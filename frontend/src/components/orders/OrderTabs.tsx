import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { ORDER_TABS, type OrderTab, type OrdersSummary } from "@/types/orders";
import { TAB_LABELS } from "./orderParams";

const COUNT_OF: Record<OrderTab, (t: OrdersSummary["tabs"]) => number> = {
  all: (t) => t.all,
  needs_attention: (t) => t.needsAttention,
  new: (t) => t.new,
  processing: (t) => t.processing,
  shipped: (t) => t.shipped,
  delivered: (t) => t.delivered,
  returns_disputes: (t) => t.returnsDisputes,
};

interface OrderTabsProps {
  active: OrderTab;
  summary: OrdersSummary | undefined;
  onChange: (tab: OrderTab) => void;
}

/** lifecycle tabs; the counts use the same definitions as the list filter, so a tab never shows a different number than its list */
export function OrderTabs({ active, summary, onChange }: OrderTabsProps) {
  return (
    <div role="tablist" aria-label="Order lifecycle" className="flex flex-wrap gap-1 border-b border-border">
      {ORDER_TABS.map((tab) => {
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
            <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px]">{summary ? formatNumber(COUNT_OF[tab](summary.tabs)) : "—"}</span>
          </button>
        );
      })}
    </div>
  );
}
