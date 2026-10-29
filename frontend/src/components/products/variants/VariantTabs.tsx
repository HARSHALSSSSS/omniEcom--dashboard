import type { VariantCounts, VariantTab } from "@/types/variants";
import { formatNumber } from "@/utils/format";
import { TAB_LABELS } from "./variantUtils";

const COUNT_KEY: Record<VariantTab, keyof VariantCounts> = {
  all: "all",
  active: "active",
  low_stock: "lowStock",
  out_of_stock: "outOfStock",
  draft: "draft",
  archived: "archived",
};

interface Props {
  active: VariantTab;
  counts: VariantCounts | undefined;
  onChange: (tab: VariantTab) => void;
}

/** the real tab counts from GET /products/{id}/variant-grid/counts (blank until they load) */
export function VariantTabs({ active, counts, onChange }: Props) {
  return (
    <div role="tablist" aria-label="Variant lifecycle" className="w-full flex flex-row items-start gap-7 border-b border-[#EAEAEA] h-[42px] overflow-x-auto scrollbar-none shrink-0">
      {TAB_LABELS.map((tab) => {
        const isActive = active === tab.id;
        const count = counts?.[COUNT_KEY[tab.id]];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`flex flex-row items-center gap-1.5 px-0.5 h-[42px] transition-all text-[12px] cursor-pointer whitespace-nowrap shrink-0 ${
              isActive ? "border-b-2 border-[#000000] font-semibold text-[#000000]" : "border-b-0 text-[#666666] hover:text-[#000000] font-normal"
            }`}
          >
            <span>{tab.label}</span>
            {count !== undefined && <span className="text-[11px] text-[#666666]">{formatNumber(count)}</span>}
          </button>
        );
      })}
    </div>
  );
}
