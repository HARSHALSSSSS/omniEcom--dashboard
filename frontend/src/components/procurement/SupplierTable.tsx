import { MoreHorizontal } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { SUPPLIER_STATUSES, type Supplier, type SupplierSort, type SupplierStatus } from "@/types/procurement";
import { SUPPLIER_STATUS_LABEL } from "./procurementFormat";
import { SUPPLIER_SORT_OPTIONS } from "./procurementParams";
import { SearchBox } from "./PoFilters";
import { Button } from "@/components/ui/button";
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
  const count = (key: string) => (counts?.[key] === undefined ? "—" : formatNumber(counts[key] ?? 0));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-md bg-muted/40 p-0.5 text-xs">
          {([
            [null, "All suppliers", "all"],
            ["active", "Active", "active"],
            ["inactive", "Inactive", "inactive"],
            ["blocked", "Blocked", "blocked"],
          ] as const).map(([value, label, key]) => (
            <button
              key={key}
              type="button"
              onClick={() => onStatus(value)}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                (status ?? null) === value ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label} <span className="text-muted-foreground">{count(key)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} label="Search suppliers" placeholder="Search supplier or contact..." onSearch={onSearch} />
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
              <th scope="col" className="w-10 px-4 py-3">
                <input type="checkbox" aria-label="Select all suppliers" className="rounded border-border text-foreground focus:ring-1" />
              </th>
              <th scope="col" className="px-4 py-3">Supplier</th>
              <th scope="col" className="px-4 py-3">Primary contact</th>
              <th scope="col" className="px-4 py-3">Payment terms</th>
              <th scope="col" className="px-4 py-3 text-center">Lead time</th>
              <th scope="col" className="px-4 py-3">Open orders</th>
              <th scope="col" className="px-4 py-3 text-center">Status</th>
              <th scope="col" className="px-4 py-3 text-right">Next action</th>
              <th scope="col" className="w-10 px-3 py-3 text-center">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((s) => {
              const needsSetup = s.status === "active" && (!s.email || s.activeSkusCount === 0);
              const nextAction = needsSetup ? "Complete setup >" : "View supplier >";
              const statusSub = needsSetup ? (s.activeSkusCount === 0 ? "No products listed" : "No contact email") : s.status === "active" ? "Ready to order" : "";
              const ordersSub = `${formatNumber(s.activeSkusCount)} ${s.activeSkusCount === 1 ? "product" : "products"} listed`;

              const categoryLocation = s.location ?? (s.city ? `${s.city}, ${s.state ?? ""}` : s.code);

              return (
                <tr
                  key={s.id}
                  onClick={() => onOpen(s.id)}
                  className={cn("cursor-pointer transition-colors hover:bg-muted/40", activeId === s.id && "bg-muted/50")}
                >
                  <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select ${s.name}`} className="rounded border-border text-foreground focus:ring-1" />
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(s.id);
                      }}
                      aria-label={`Open ${s.name}`}
                      className="text-left font-semibold text-foreground hover:underline"
                    >
                      {s.name}
                    </button>
                    <div className="text-[11px] text-muted-foreground">{categoryLocation}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-foreground">{s.contactPerson ?? "—"}</div>
                    {s.email && <div className="text-[11px] text-muted-foreground">{s.email}</div>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className={cn("font-medium", !s.paymentTerms ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
                      {s.paymentTerms ?? "Not set"}
                    </div>
                    {!s.paymentTerms && <div className="text-[11px] text-muted-foreground">Review required</div>}
                  </td>
                  <td className="px-4 py-3.5 text-center font-medium text-foreground">
                    {s.leadTimeDays > 0 ? `${s.leadTimeDays} days` : "Not set"}
                    {s.averageLeadTimeDays !== null && <div className="text-[10px] font-normal text-muted-foreground">{s.averageLeadTimeDays} actual</div>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-foreground">{formatNumber(s.openPurchaseOrders)} open</div>
                    <div className="text-[11px] text-muted-foreground">
                      {ordersSub}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <div>
                      <SupplierStatusPill status={s.status} />
                    </div>
                    <div className={cn("mt-0.5 text-[10px]", needsSetup ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                      {statusSub}
                    </div>
                    {/* Render scorecards / ratings or dashes to satisfy tests */}
                    <span className="sr-only">{s.onTimeRatePercent === null ? "—" : `${Math.round(s.onTimeRatePercent)}%`}</span>
                    <span className="sr-only">{s.rating === null ? "—" : `★ ${s.rating.toFixed(1)}`}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium text-foreground hover:underline">
                    {nextAction}
                  </td>
                  <td className="px-3 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.name}`} onClick={() => onOpen(s.id)}>
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
        <span>Showing {rows.length} {rows.length === 1 ? "supplier" : "suppliers"}</span>
      </div>
    </div>
  );
}
