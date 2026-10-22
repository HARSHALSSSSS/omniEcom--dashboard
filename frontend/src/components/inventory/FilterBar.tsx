import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, Trash2, X } from "lucide-react";
import { cn } from "@/utils/cn";
import type { ChannelOption } from "@/api/products";
import type { InventoryFilters, InventoryGroup, InventoryKpis, Warehouse } from "@/types/inventory";
import { HEALTH_OPTIONS, MOVEMENT_OPTIONS, SIGNAL_OPTIONS, SORT_OPTIONS, STATUS_TABS, hasActiveFilters, type Patch } from "./inventoryParams";
import { NO_WRITE_REASON } from "./inventoryLabels";
import { SavedFilters } from "./SavedFilters";

const BUTTON = "h-[36px] px-3 flex flex-row items-center gap-2 bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer shadow-2xs";

interface FilterBarProps {
  searchText: string;
  onSearch: (value: string) => void;
  filters: InventoryFilters;
  sort: string;
  warehouses: Warehouse[];
  channels: ChannelOption[];
  groups: InventoryGroup[];
  /** the partition of the SKUs by stock status (GET /inventory/kpis); shown next to the status names */
  statusCounts: InventoryKpis["health"] | undefined;
  update: (patch: Patch) => void;
  onClear: () => void;
  canWrite: boolean;
  onDeleteGroup: (group: InventoryGroup) => void;
  /** views:write: saving the current filters as a saved filter */
  canSaveViews: boolean;
  onSaveView: () => void;
}

/** a native select that looks like the design's dropdown buttons (chevron first, then the label or the picked value) */
function Dropdown({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className={cn(BUTTON, "relative p-0", value && "border-[#111111]")}>
      <ChevronDown className="pointer-events-none absolute left-3 h-3.5 w-3.5 stroke-[1.75px] text-[#888888]" aria-hidden />
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-full cursor-pointer appearance-none rounded-lg border-none bg-transparent py-0 pl-9 pr-3 text-[13px] text-[#111111] outline-none">
        {children}
      </select>
    </label>
  );
}

/** "Stock range": the two bounds open from one button; they are applied when the field loses focus or on Enter */
function StockRange({ min, max, onCommit }: { min: number | undefined; max: number | undefined; onCommit: (patch: Patch) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const bound = (label: string, key: "min" | "max", value: number | undefined) => (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-[#111111]">
      {label}
      <input
        key={value ?? "none"}
        aria-label={label}
        inputMode="numeric"
        placeholder="Any"
        defaultValue={value ?? ""}
        className="h-8 w-28 rounded-lg border border-[#E5E5E5] px-2.5 text-[12px] font-normal outline-none focus:border-black"
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== String(value ?? "")) onCommit({ [key]: /^\d{1,9}$/.test(v) ? v : null });
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </label>
  );

  const active = min !== undefined || max !== undefined;
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn(BUTTON, active && "border-[#111111]")}>
        <ChevronDown className="h-3.5 w-3.5 stroke-[1.75px] text-[#888888]" aria-hidden />
        <span className="text-[13px] text-[#111111]">{active ? `Stock range: ${min ?? "0"}–${max ?? "any"}` : "Stock range"}</span>
      </button>
      {open && (
        <div role="group" aria-label="Stock range" className="absolute left-0 top-[40px] z-30 flex gap-3 rounded-xl border border-[#EAEAEA] bg-white p-3 shadow-lg">
          {bound("Min stock", "min", min)}
          {bound("Max stock", "max", max)}
        </div>
      )}
    </div>
  );
}

export function FilterBar({ searchText, onSearch, filters, sort, warehouses, channels, groups, statusCounts, update, onClear, canWrite, onDeleteGroup, canSaveViews, onSaveView }: FilterBarProps) {
  const countOf: Record<string, number | undefined> = { healthy: statusCounts?.healthy, low_stock: statusCounts?.lowStock, out_of_stock: statusCounts?.outOfStock, excess: statusCounts?.excess };
  const group = groups.find((g) => g.id === filters.group);
  const nameOf = (kind: "warehouse" | "channel", id: string) => (kind === "warehouse" ? warehouses.find((w) => w.id === id)?.name : channels.find((c) => c.code === id)?.name) ?? id;
  return (
    <div className="flex w-full flex-row flex-wrap items-center gap-2.5">
      <div className="flex h-[36px] max-w-[380px] flex-1 basis-[240px] flex-row items-center gap-2.5 rounded-lg border border-[#EAEAEA] bg-white px-3 shadow-2xs">
        <Search className="h-3.5 w-3.5 stroke-[1.75px] text-[#888888]" aria-hidden />
        <input
          type="search"
          aria-label="Search stock"
          placeholder="Search SKU/product/barcode"
          value={searchText}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full border-none bg-transparent text-[13px] text-[#111111] outline-none placeholder:text-[#888888]"
        />
      </div>

      <Dropdown label="Warehouse" value={filters.warehouse ?? ""} onChange={(v) => update({ warehouse: v })}>
        <option value="">Warehouse</option>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </Dropdown>
      <Dropdown label="Channel" value={filters.channel ?? ""} onChange={(v) => update({ channel: v })}>
        <option value="">Channel</option>
        {channels.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </Dropdown>
      <Dropdown label="Health" value={filters.health ?? ""} onChange={(v) => update({ health: v })}>
        <option value="">Inventory health</option>
        {HEALTH_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Dropdown>
      <Dropdown label="Stock status" value={filters.stockStatus ?? ""} onChange={(v) => update({ status: v })}>
        <option value="">Stock status</option>
        {STATUS_TABS.filter((t) => t.id !== "all").map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
            {countOf[t.id] !== undefined ? ` (${countOf[t.id]})` : ""}
          </option>
        ))}
      </Dropdown>
      <Dropdown label="Signal" value={filters.signal ?? ""} onChange={(v) => update({ signal: v })}>
        <option value="">Signal</option>
        {SIGNAL_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Dropdown>
      <StockRange min={filters.stockMin} max={filters.stockMax} onCommit={update} />
      <Dropdown label="Last movement" value={filters.movement ?? ""} onChange={(v) => update({ movement: v })}>
        <option value="">Movement</option>
        {MOVEMENT_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Dropdown>
      <SavedFilters filters={filters} sort={sort} update={update} canSave={canSaveViews} onSave={onSaveView} nameOf={nameOf} />
      {groups.length > 0 && (
        <Dropdown label="Saved group" value={filters.group ?? ""} onChange={(v) => update({ group: v })}>
          <option value="">Saved groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.itemCount})
            </option>
          ))}
        </Dropdown>
      )}
      <Dropdown label="Sort by" value={sort} onChange={(v) => update({ sort: v })}>
        {SORT_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Dropdown>

      {group && (
        <button
          type="button"
          disabled={!canWrite}
          title={canWrite ? undefined : NO_WRITE_REASON}
          onClick={() => onDeleteGroup(group)}
          className="flex h-[36px] cursor-pointer flex-row items-center gap-1.5 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] text-[#111111] hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5 stroke-[1.75px] text-[#888888]" aria-hidden />
          Delete group
        </button>
      )}
      {hasActiveFilters(filters) && (
        <button type="button" onClick={onClear} className="flex h-[36px] cursor-pointer flex-row items-center gap-1 rounded-lg border-none bg-transparent px-2 text-[12px] text-[#555555] hover:text-black">
          <X className="h-3 w-3" aria-hidden />
          Clear filters
        </button>
      )}
    </div>
  );
}
