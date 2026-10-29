import { useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { PO_STATUSES, type PoFilters as Filters, type PoSort, type Supplier, type WarehouseOption } from "@/types/procurement";
import { PO_TAB_LABEL } from "./procurementFormat";
import { PO_SORT_OPTIONS } from "./procurementParams";
import { SELECT } from "./procurementUi";

const TONE: Record<string, string> = {
  all: "border-[#1D4ED8] bg-[#E6F4FF]/30",
  draft: "border-neutral-400 bg-neutral-50",
  submitted: "border-blue-500 bg-blue-50/50",
  acknowledged: "border-indigo-500 bg-indigo-50/50",
  partially_received: "border-amber-500 bg-amber-50/50",
  received: "border-emerald-500 bg-emerald-50/50",
  cancelled: "border-rose-500 bg-rose-50/50",
};

interface StatusTabsProps {
  active: Filters["status"];
  counts: Record<string, number> | undefined;
  onChange: (status: Filters["status"]) => void;
}

/** the status chips above the table; the number on each is the size of its list for the other filters */
export function PoStatusTabs({ active, counts, onChange }: StatusTabsProps) {
  const tabs = [undefined, ...PO_STATUSES] as const;
  return (
    <div role="tablist" aria-label="Purchase order status" className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {tabs.map((status) => {
        const key = status ?? "all";
        const selected = status === active;
        const n = counts?.[key];
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(status)}
            className={cn("rounded-xl border p-2.5 sm:p-3.5 text-left transition-all", selected ? `${TONE[key]} shadow-sm` : "border-border bg-card hover:bg-muted/30")}
          >
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{PO_TAB_LABEL[key]}</span>
            <span className="mt-1 block font-mono text-xl font-bold text-foreground">{n === undefined ? "—" : formatNumber(n)}</span>
          </button>
        );
      })}
    </div>
  );
}

interface SearchBoxProps {
  value: string;
  label: string;
  placeholder: string;
  onSearch: (q: string) => void;
}

/** a debounced search box: typing waits a moment before it reaches the URL */
export function SearchBox({ value, label, placeholder, onSearch }: SearchBoxProps) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, value, onSearch]);
  return (
    <div className="relative w-full sm:max-w-sm flex-1">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" aria-label={label} placeholder={placeholder} value={text} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)} className="pl-9 text-xs" />
    </div>
  );
}

interface PoFiltersProps {
  filters: Filters;
  sort: PoSort;
  suppliers: Supplier[];
  warehouses: WarehouseOption[];
  filtered: boolean;
  exporting: boolean;
  total: number;
  onSearch: (q: string) => void;
  onSupplier: (id: string | null) => void;
  onWarehouse: (id: string | null) => void;
  onFrom: (day: string | null) => void;
  onTo: (day: string | null) => void;
  onSort: (sort: PoSort) => void;
  onClear: () => void;
  onExport: () => void;
}

export function PoFilters({ filters, sort, suppliers, warehouses, filtered, exporting, total, onSearch, onSupplier, onWarehouse, onFrom, onTo, onSort, onClear, onExport }: PoFiltersProps) {
  // a supplier from a deep link that is not in the first page of suppliers still shows (and can be cleared)
  const knownSupplier = !filters.supplierId || suppliers.some((s) => s.id === filters.supplierId);
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBox value={filters.q ?? ""} label="Search purchase orders" placeholder="Search by PO number, supplier, reference or SKU..." onSearch={onSearch} />
        <Button variant="outline" size="sm" className="gap-2 text-xs w-full sm:w-auto" disabled={exporting || total === 0} onClick={onExport}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          {exporting ? "Preparing CSV..." : "Export CSV"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Supplier" className={cn(SELECT, "max-w-full")} value={filters.supplierId ?? ""} onChange={(e) => onSupplier(e.target.value || null)}>
          <option value="">All suppliers</option>
          {!knownSupplier && filters.supplierId && <option value={filters.supplierId}>Selected supplier</option>}
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {warehouses.length > 1 && (
          <select aria-label="Warehouse" className={cn(SELECT, "max-w-full")} value={filters.warehouseId ?? ""} onChange={(e) => onWarehouse(e.target.value || null)}>
            <option value="">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
        <label className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Ordered from
          <input type="date" aria-label="Ordered from" className={SELECT} value={filters.from ?? ""} max={filters.to || undefined} onChange={(e) => onFrom(e.target.value || null)} />
        </label>
        <label className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          to
          <input type="date" aria-label="Ordered to" className={SELECT} value={filters.to ?? ""} min={filters.from || undefined} onChange={(e) => onTo(e.target.value || null)} />
        </label>
        <select aria-label="Sort purchase orders" className={cn(SELECT, "max-w-full")} value={sort} onChange={(e) => onSort(e.target.value as PoSort)}>
          {PO_SORT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {filtered && (
          <button type="button" onClick={onClear} className="h-9 rounded-lg px-2.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
