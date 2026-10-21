import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import type { AccountFilters, HubAccountCard, HubCategory } from "@/types/hub";
import { applyFilters } from "./hubFilters";
import { CATEGORY_LABEL } from "./hubFormat";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "healthy", label: "Healthy" },
  { value: "warning", label: "Attention" },
  { value: "error", label: "Error" },
  { value: "paused", label: "Paused" },
] as const;

const SELECT = "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground";

interface HubToolbarProps {
  items: HubAccountCard[];
  filters: AccountFilters;
  onChange: (patch: Partial<AccountFilters>) => void;
}

/** Tabs with counts computed from the loaded accounts, plus search, marketplace and status filters. */
export function HubToolbar({ items, filters, onChange }: HubToolbarProps) {
  const scoped = applyFilters(items, filters, "category");
  const categories = (Object.keys(CATEGORY_LABEL) as HubCategory[]).filter((c) => items.some((a) => a.category === c) || filters.category === c);
  const tabs: Array<{ id: AccountFilters["category"]; label: string; count: number }> = [
    { id: "all", label: "All Connections", count: scoped.length },
    ...categories.map((c) => ({ id: c, label: CATEGORY_LABEL[c], count: scoped.filter((a) => a.category === c).length })),
  ];
  const marketplaces = [...new Map(items.map((a) => [a.marketplace, a.connectorName])).entries()];

  return (
    <div className="space-y-3 border-b border-border pb-3">
      <div role="tablist" aria-label="Connection type" className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filters.category === tab.id}
            onClick={() => onChange({ category: tab.id })}
            className={cn("rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors", filters.category === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input aria-label="Search connections" placeholder="Search by name or seller id" className="h-8 pl-8 text-xs" value={filters.q} onChange={(e) => onChange({ q: e.target.value })} />
        </div>
        <select aria-label="Filter by marketplace" className={SELECT} value={filters.marketplace} onChange={(e) => onChange({ marketplace: e.target.value })}>
          <option value="">All marketplaces</option>
          {marketplaces.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" className={SELECT} value={filters.status} onChange={(e) => onChange({ status: e.target.value as AccountFilters["status"] })}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
