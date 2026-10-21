import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { SUPPLIER_STATUSES, type Supplier, type SupplierSort, type SupplierStatus } from "@/types/procurement";
import { SUPPLIER_STATUS_LABEL } from "./procurementFormat";
import { SUPPLIER_SORT_OPTIONS } from "./procurementParams";
import { SearchBox } from "./PoFilters";
import { SELECT, SupplierStatusPill } from "./procurementUi";

interface SupplierFiltersProps {
  q: string;
  status: SupplierStatus | undefined;
  sort: SupplierSort;
  counts: Record<string, number> | undefined;
  filtered: boolean;
  onSearch: (q: string) => void;
  onStatus: (s: SupplierStatus | null) => void;
  onSort: (s: SupplierSort) => void;
  onClear: () => void;
}

export function SupplierFilters({ q, status, sort, counts, filtered, onSearch, onStatus, onSort, onClear }: SupplierFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchBox value={q} label="Search suppliers" placeholder="Search by name, code, contact or city..." onSearch={onSearch} />
      <select aria-label="Supplier status" className={SELECT} value={status ?? ""} onChange={(e) => onStatus((e.target.value || null) as SupplierStatus | null)}>
        <option value="">All statuses{counts?.all !== undefined ? ` (${formatNumber(counts.all)})` : ""}</option>
        {SUPPLIER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {SUPPLIER_STATUS_LABEL[s]}
            {counts?.[s] !== undefined ? ` (${formatNumber(counts[s] ?? 0)})` : ""}
          </option>
        ))}
      </select>
      <select aria-label="Sort suppliers" className={SELECT} value={sort} onChange={(e) => onSort(e.target.value as SupplierSort)}>
        {SUPPLIER_SORT_OPTIONS.map((o) => (
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
  );
}

interface SupplierTableProps {
  rows: Supplier[];
  refreshing: boolean;
  activeId: string | undefined;
  onOpen: (id: string) => void;
}

export function SupplierTable({ rows, refreshing, activeId, onOpen }: SupplierTableProps) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-2xs transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground">
              <th scope="col" className="px-4 py-3">Supplier</th>
              <th scope="col" className="px-4 py-3">Location</th>
              <th scope="col" className="px-4 py-3">Contact</th>
              <th scope="col" className="px-4 py-3 text-center">Lead time</th>
              <th scope="col" className="px-4 py-3">Payment terms</th>
              <th scope="col" className="px-4 py-3 text-right">Products</th>
              <th scope="col" className="px-4 py-3 text-right">Open POs</th>
              <th scope="col" className="px-4 py-3 text-center">On-time</th>
              <th scope="col" className="px-4 py-3 text-center">Rating</th>
              <th scope="col" className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((s) => (
              <tr key={s.id} onClick={() => onOpen(s.id)} className={cn("cursor-pointer transition-colors hover:bg-muted/40", activeId === s.id && "bg-muted/50")}>
                <td className="px-4 py-3.5">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(s.id); }} aria-label={`Open ${s.name}`} className="text-left font-semibold text-foreground hover:underline">
                    {s.name}
                  </button>
                  <div className="font-mono text-[11px] text-muted-foreground">{s.code}</div>
                </td>
                <td className="px-4 py-3.5 text-muted-foreground">{s.location ?? "—"}</td>
                <td className="px-4 py-3.5">
                  <div className="text-foreground">{s.contactPerson ?? "—"}</div>
                  {s.email && <div className="text-[11px] text-muted-foreground">{s.email}</div>}
                </td>
                <td className="px-4 py-3.5 text-center font-medium text-foreground">
                  {s.leadTimeDays} days
                  {s.averageLeadTimeDays !== null && <div className="text-[10px] font-normal text-muted-foreground">{s.averageLeadTimeDays} actual</div>}
                </td>
                <td className="px-4 py-3.5 text-muted-foreground">{s.paymentTerms ?? "—"}</td>
                <td className="px-4 py-3.5 text-right text-foreground">{formatNumber(s.activeSkusCount)}</td>
                <td className="px-4 py-3.5 text-right text-foreground">{formatNumber(s.openPurchaseOrders)}</td>
                <td className="px-4 py-3.5 text-center text-foreground" title={s.onTimeRatePercent === null ? "Shown after 3 fully received orders" : undefined}>
                  {s.onTimeRatePercent === null ? "—" : `${Math.round(s.onTimeRatePercent)}%`}
                </td>
                <td className="px-4 py-3.5 text-center" title={s.rating === null ? "Shown after 3 fully received orders" : undefined}>
                  {s.rating === null ? <span className="text-muted-foreground">—</span> : <span className="font-bold text-amber-600">★ {s.rating.toFixed(1)}</span>}
                </td>
                <td className="px-4 py-3.5 text-center">
                  <SupplierStatusPill status={s.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
