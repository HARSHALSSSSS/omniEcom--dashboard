import type { KeyboardEvent } from "react";
import { PRODUCT_TABS, type ProductTab } from "@/types/productDetail";
import { panelId, tabId } from "./format";

const LABELS: Record<ProductTab, string> = {
  overview: "Overview",
  variants: "Variants",
  inventory: "Inventory",
  listings: "Listings",
  content: "Content",
  activity: "Activity",
  media: "Media",
};

/** Sub tabs. The selected tab lives in the URL (?tab=); arrow keys move between tabs. */
export function DetailTabs({ active, onChange }: { active: ProductTab; onChange: (tab: ProductTab) => void }) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % PRODUCT_TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + PRODUCT_TABS.length) % PRODUCT_TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = PRODUCT_TABS.length - 1;
    else return;
    e.preventDefault();
    const tab = PRODUCT_TABS[next];
    if (!tab) return;
    onChange(tab);
    document.getElementById(tabId(tab))?.focus();
  };

  return (
    <div role="tablist" aria-label="Product sections" className="w-full flex flex-row items-start gap-7 border-b border-[#EAEAEA] h-[42px] overflow-x-auto">
      {PRODUCT_TABS.map((tab, i) => {
        const selected = active === tab;
        return (
          <button
            key={tab}
            id={tabId(tab)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(tab)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab)}
            onKeyDown={(e) => onKey(e, i)}
            className={`flex flex-row items-center px-0.5 h-[42px] transition-all text-[12px] cursor-pointer shrink-0 ${
              selected ? "border-b-2 border-[#000000] font-semibold text-[#000000]" : "border-b-0 text-[#666666] hover:text-[#000000] font-normal"
            }`}
          >
            {LABELS[tab]}
          </button>
        );
      })}
    </div>
  );
}
