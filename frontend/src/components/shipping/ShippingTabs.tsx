import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { SHIPMENT_TABS, type ShipmentCounts, type ShipmentTab } from "@/types/shipping";
import { TAB_LABELS } from "./shippingParams";

interface ShippingTabsProps {
  active: ShipmentTab;
  counts: ShipmentCounts | undefined;
  onChange: (tab: ShipmentTab) => void;
}

/** the groups of the shipments table; counts come from the API with the same filters as the list (except the group) */
export function ShippingTabs({ active, counts, onChange }: ShippingTabsProps) {
  return (
    <div role="tablist" aria-label="Shipment groups" className="flex flex-wrap gap-1 border-b border-border">
      {SHIPMENT_TABS.map((tab) => {
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
