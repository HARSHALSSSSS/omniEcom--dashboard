import { Download, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import type { ChannelOption } from "@/api/products";
import type { InventoryFilters, Warehouse } from "@/types/inventory";
import { HEALTH_OPTIONS, MOVEMENT_OPTIONS, SIGNAL_OPTIONS, SORT_OPTIONS, STATUS_TABS, hasActiveFilters, type Patch } from "./inventoryParams";

const SELECT = "h-8 rounded-md border border-input bg-background px-2 text-xs";

interface FilterBarProps {
  searchText: string;
  onSearch: (value: string) => void;
  filters: InventoryFilters;
  sort: string;
  warehouses: Warehouse[];
  channels: ChannelOption[];
  update: (patch: Patch) => void;
  onClear: () => void;
  onExport: () => void;
  exporting: boolean;
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn(SELECT, value && "border-foreground/60 font-medium")}>
      {children}
    </select>
  );
}

function Bound({ label, value, onCommit }: { label: string; value: number | undefined; onCommit: (v: string | null) => void }) {
  return (
    <Input
      key={value ?? "none"}
      aria-label={label}
      placeholder={label}
      inputMode="numeric"
      defaultValue={value ?? ""}
      className="h-8 w-24 text-xs"
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== String(value ?? "")) onCommit(/^\d{1,9}$/.test(v) ? v : null);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

export function FilterBar({ searchText, onSearch, filters, sort, warehouses, channels, update, onClear, onExport, exporting }: FilterBarProps) {
  const status = filters.stockStatus ?? "all";
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search stock"
            placeholder="Search by SKU, Barcode, or Product Name..."
            value={searchText}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Stock status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={status === tab.id}
              onClick={() => update({ status: tab.id })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                status === tab.id ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {warehouses.length > 1 && (
          <Select label="Warehouse" value={filters.warehouse ?? ""} onChange={(v) => update({ warehouse: v })}>
            <option value="">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        )}
        <Select label="Channel" value={filters.channel ?? ""} onChange={(v) => update({ channel: v })}>
          <option value="">All channels</option>
          {channels.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select label="Health" value={filters.health ?? ""} onChange={(v) => update({ health: v })}>
          <option value="">Any health</option>
          {HEALTH_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select label="Signal" value={filters.signal ?? ""} onChange={(v) => update({ signal: v })}>
          <option value="">Any signal</option>
          {SIGNAL_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select label="Last movement" value={filters.movement ?? ""} onChange={(v) => update({ movement: v })}>
          <option value="">Any last movement</option>
          {MOVEMENT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        <Bound label="Min stock" value={filters.stockMin} onCommit={(v) => update({ min: v })} />
        <Bound label="Max stock" value={filters.stockMax} onCommit={(v) => update({ max: v })} />
        <Select label="Sort by" value={sort} onChange={(v) => update({ sort: v })}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>

        {hasActiveFilters(filters) && (
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={onClear}>
            <X className="h-3 w-3" aria-hidden />
            Clear filters
          </Button>
        )}
        <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5 text-xs" loading={exporting} onClick={onExport}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Export CSV
        </Button>
      </div>
    </div>
  );
}
