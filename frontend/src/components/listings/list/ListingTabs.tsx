import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { LISTING_TABS, type ListingTab } from "@/types/listing";
import { TAB_LABELS } from "./listingParams";

const TONE: Record<ListingTab, { active: string; label: string; value: string }> = {
  all: { active: "border-[#1D4ED8] bg-[#E6F4FF]/30", label: "text-muted-foreground", value: "text-foreground" },
  live: { active: "border-emerald-500 bg-emerald-50/50", label: "text-emerald-700", value: "text-emerald-600" },
  ready: { active: "border-sky-500 bg-sky-50/50", label: "text-sky-700", value: "text-sky-600" },
  needs_review: { active: "border-amber-500 bg-amber-50/50", label: "text-amber-700", value: "text-amber-600" },
  syncing: { active: "border-blue-500 bg-blue-50/50", label: "text-[#1D4ED8]", value: "text-[#1D4ED8]" },
  failed: { active: "border-rose-500 bg-rose-50/50", label: "text-destructive", value: "text-destructive" },
  blocked: { active: "border-orange-500 bg-orange-50/50", label: "text-orange-700", value: "text-orange-600" },
  not_listed: { active: "border-border bg-muted", label: "text-muted-foreground", value: "text-muted-foreground" },
};

interface ListingTabsProps {
  active: ListingTab;
  /** the number on each tab; a missing one shows a dash */
  counts: Partial<Record<ListingTab, number>> | undefined;
  /** "Not listed" lists variants and cannot be narrowed to one product */
  hideNotListed: boolean;
  onChange: (tab: ListingTab) => void;
}

/** the status strip: every tile is a tab, and the number on it is the size of its list */
export function ListingTabs({ active, counts, hideNotListed, onChange }: ListingTabsProps) {
  const tabs = LISTING_TABS.filter((t) => !(hideNotListed && t === "not_listed"));
  return (
    <div role="tablist" aria-label="Listing status" className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      {tabs.map((tab) => {
        const selected = tab === active;
        const tone = TONE[tab];
        const count = counts?.[tab];
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab)}
            className={cn("rounded-xl border p-3.5 text-left transition-all", selected ? `${tone.active} shadow-sm` : "border-border bg-card hover:bg-muted/30")}
          >
            <span className={cn("block text-[10px] font-semibold uppercase tracking-wider", tone.label)}>{TAB_LABELS[tab]}</span>
            <span className={cn("mt-1 block font-mono text-xl font-bold", tone.value)}>{count === undefined ? "—" : formatNumber(count)}</span>
          </button>
        );
      })}
    </div>
  );
}
