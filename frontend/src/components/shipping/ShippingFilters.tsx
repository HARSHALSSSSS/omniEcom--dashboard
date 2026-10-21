import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PAYMENT_FILTERS, SHIPMENT_STATUSES, type ShipmentFilters, type ShipmentPayment, type ShipmentStatus } from "@/types/shipping";
import type { WarehouseOption } from "@/api/shipping.api";
import { PAYMENT_LABELS, STATUS_LABELS } from "./shippingParams";

const SELECT = "h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground";
const DATE = "h-9 rounded-lg border border-border bg-card px-2 text-xs font-medium text-foreground";

export type FilterPatch = Partial<Record<"carrier" | "status" | "warehouse" | "payment" | "label" | "from" | "to", string | null>>;

interface ShippingFiltersProps {
  filters: ShipmentFilters;
  carriers: string[];
  warehouses: WarehouseOption[];
  filtered: boolean;
  onSearch: (q: string) => void;
  onChange: (patch: FilterPatch) => void;
  onClear: () => void;
}

/** search and the filter controls; every change goes to the URL */
export function ShippingFilters({ filters, carriers, warehouses, filtered, onSearch, onChange, onClear }: ShippingFiltersProps) {
  const q = filters.q ?? "";
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, onSearch]);

  // a carrier from a deep link that is not in the ribbon still shows (and can be cleared)
  const carrierOptions = filters.carrier && !carriers.includes(filters.carrier) ? [...carriers, filters.carrier] : carriers;
  const labelValue = filters.labelAvailable === undefined ? "" : String(filters.labelAvailable);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Search shipments"
          placeholder="Search AWB, order #, customer or pincode..."
          value={text}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
          className="pl-9 text-xs"
        />
      </div>

      <select aria-label="Carrier" className={SELECT} value={filters.carrier ?? ""} onChange={(e) => onChange({ carrier: e.target.value || null })}>
        <option value="">All carriers</option>
        {carrierOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select aria-label="Status" className={SELECT} value={filters.status ?? ""} onChange={(e) => onChange({ status: (e.target.value || null) as ShipmentStatus | null })}>
        <option value="">Any status</option>
        {SHIPMENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      {warehouses.length > 0 && (
        <select aria-label="Warehouse" className={SELECT} value={filters.warehouseId ?? ""} onChange={(e) => onChange({ warehouse: e.target.value || null })}>
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      )}

      <select aria-label="Payment" className={SELECT} value={filters.payment ?? ""} onChange={(e) => onChange({ payment: (e.target.value || null) as ShipmentPayment | null })}>
        <option value="">Any payment</option>
        {PAYMENT_FILTERS.map((p) => (
          <option key={p} value={p}>
            {PAYMENT_LABELS[p]}
          </option>
        ))}
      </select>

      <select aria-label="Label" className={SELECT} value={labelValue} onChange={(e) => onChange({ label: e.target.value || null })}>
        <option value="">Any label state</option>
        <option value="true">Label available</option>
        <option value="false">No label</option>
      </select>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        From
        <input type="date" aria-label="Created from" className={DATE} value={filters.from ?? ""} max={filters.to} onChange={(e) => onChange({ from: e.target.value || null })} />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        To
        <input type="date" aria-label="Created to" className={DATE} value={filters.to ?? ""} min={filters.from} onChange={(e) => onChange({ to: e.target.value || null })} />
      </label>

      {filtered && (
        <button type="button" onClick={onClear} className="h-9 rounded-lg px-2.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Clear filters
        </button>
      )}
    </div>
  );
}
