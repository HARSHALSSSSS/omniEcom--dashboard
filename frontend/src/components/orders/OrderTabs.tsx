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
    <div role="tablist" aria-label="Order lifecycle" className="w-full flex flex-row items-start gap-6 min-h-[34px] border-b border-[#EAEAEA] overflow-x-auto">
      {ORDER_TABS.map((tab) => {
        const selected = tab === active;
        const attention = tab === "needs_attention";
        const count = summary ? formatNumber(COUNT_OF[tab](summary.tabs)) : "—";
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab)}
            className={`flex flex-row items-center h-[34px] px-0 gap-1.5 shrink-0 transition-colors cursor-pointer ${
              selected ? (attention ? "border-b-2 border-[#D97706]" : "border-b-2 border-[#000000]") : ""
            }`}
          >
            <span
              className={`text-[12px] leading-[145%] ${
                attention ? "font-semibold text-[#D97706]" : selected ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"
              }`}
            >
              {TAB_LABELS[tab]}
            </span>
            {attention ? (
              <div className="flex flex-row items-center px-[5px] py-[1px] h-[15px] bg-[#FFFBF5] border border-[#FDE68A]/60 rounded">
                <span className="text-[10px] font-semibold leading-[12px] text-[#D97706]">{count}</span>
              </div>
            ) : (
              <div
                className={`flex flex-row items-center px-[5px] py-[1px] h-[15px] rounded ${
                  selected ? "bg-[#000000] text-white" : "bg-[#F5F5F5] text-[#666666]"
                }`}
              >
                <span className="text-[10px] font-semibold leading-[12px]">{count}</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
