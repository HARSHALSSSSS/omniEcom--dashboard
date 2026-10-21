import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { INTEL_ACTIONS, INTEL_SORTS, type IntelAction, type IntelSort, type ProductIntelligenceQuery } from "@/types/intelligence";
import type { WarehouseOption } from "@/types/procurement";
import type { CategoryOption } from "@/types/promotions";
import { SELECT_CLASS } from "@/components/pricing/PricingStates";
import { ACTION_LABELS, SORT_LABELS } from "./intelFormat";

interface IntelFiltersProps {
  query: ProductIntelligenceQuery;
  counts: Record<IntelAction, number> | undefined;
  categories: CategoryOption[];
  warehouses: WarehouseOption[];
  filtered: boolean;
  onAction: (action: IntelAction | null) => void;
  onSearch: (q: string) => void;
  onCategory: (id: string | null) => void;
  onWarehouse: (id: string | null) => void;
  onSort: (sort: IntelSort) => void;
  onClear: () => void;
}

/** action pills with their counts, search, category / warehouse / sort; every change goes to the URL */
export function IntelFilters({ query, counts, categories, warehouses, filtered, onAction, onSearch, onCategory, onWarehouse, onSort, onClear }: IntelFiltersProps) {
  const q = query.q ?? "";
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, onSearch]);

  const total = counts ? INTEL_ACTIONS.reduce((sum, a) => sum + counts[a], 0) : undefined;
  const pills: Array<{ key: IntelAction | "all"; label: string; count: number | undefined }> = [
    { key: "all", label: "All", count: total },
    ...INTEL_ACTIONS.map((a) => ({ key: a, label: ACTION_LABELS[a], count: counts?.[a] })),
  ];

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Recommended action" className="flex flex-wrap gap-2">
        {pills.map((pill) => {
          const selected = (pill.key === "all" && !query.action) || pill.key === query.action;
          return (
            <button
              key={pill.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onAction(pill.key === "all" ? null : pill.key)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {pill.label}
              <span className="ml-1.5 font-mono">{pill.count === undefined ? "—" : formatNumber(pill.count)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" aria-label="Search products" placeholder="Search by SKU or product name..." value={text} onChange={(e) => setText(e.target.value)} className="pl-9 text-xs" />
        </div>
        <select aria-label="Category" className={SELECT_CLASS} value={query.categoryId ?? ""} onChange={(e) => onCategory(e.target.value || null)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select aria-label="Warehouse" className={SELECT_CLASS} value={query.warehouseId ?? ""} onChange={(e) => onWarehouse(e.target.value || null)}>
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select aria-label="Sort recommendations" className={SELECT_CLASS} value={query.sort} onChange={(e) => onSort(e.target.value as IntelSort)}>
          {INTEL_SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
        {filtered && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
