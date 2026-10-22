import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { ListingTab } from "@/types/listing";
import { STATUS_COLOR } from "./listingFormat";
import { TAB_LABELS, TAB_ORDER } from "./listingParams";

interface ListingTabsProps {
  active: ListingTab;
  /** the number on each tab; a missing one shows nothing */
  counts: Partial<Record<ListingTab, number>> | undefined;
  /** "Not listed" lists variants and cannot be narrowed to one product */
  hideNotListed: boolean;
  onChange: (tab: ListingTab) => void;
}

/** the status line under the channel tabs: every pill is a tab, and the number on it is the size of its list */
export function ListingTabs({ active, counts, hideNotListed, onChange }: ListingTabsProps) {
  const tabs = TAB_ORDER.filter((t) => !(hideNotListed && t === "not_listed"));
  return (
    <div role="tablist" aria-label="Listing status" className="flex h-7 w-full flex-row items-center gap-5 overflow-x-auto text-[12px]">
      {tabs.map((tab) => {
        const selected = tab === active;
        const count = counts?.[tab];
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab)}
            className={cn("flex shrink-0 cursor-pointer items-center gap-1 transition-colors", selected ? "font-semibold text-[#000000]" : "font-normal text-[#666666] hover:text-[#000000]")}
          >
            {tab !== "all" && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[tab] }} aria-hidden />}
            <span>{TAB_LABELS[tab]}</span>
            {count !== undefined && <span className="font-normal text-[#666666]">{formatNumber(count)}</span>}
          </button>
        );
      })}
    </div>
  );
}
