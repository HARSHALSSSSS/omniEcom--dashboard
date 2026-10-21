import { Skeleton } from "@/components/ui/skeleton";
import type { ListingBulkAction, ListingRow as Row } from "@/types/listing";
import { NO_WRITE_REASON } from "./listingFormat";
import { ListingRow } from "./ListingRow";

interface ListingsTableProps {
  rows: Row[];
  selected: ReadonlySet<string>;
  canWrite: boolean;
  refreshing: boolean;
  /** the listing whose row action is running */
  busyId: string | null;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onQuickView: (row: Row) => void;
  onAction: (row: Row, action: ListingBulkAction) => void;
}

const COLUMNS = ["Product / SKU", "Marketplace", "Status", "Price / MRP", "Stock", "Readiness", "Last sync"];

export function ListingsTable({ rows, selected, canWrite, refreshing, busyId, onToggle, onToggleAll, onQuickView, onAction }: ListingsTableProps) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity ${refreshing ? "opacity-60" : ""}`} aria-busy={refreshing}>
      <table className="w-full min-w-[1080px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
          <tr>
            <th className="w-10 py-3 pl-4 pr-2">
              <input
                type="checkbox"
                aria-label="Select all listings on this page"
                checked={allSelected}
                disabled={!canWrite}
                title={canWrite ? undefined : NO_WRITE_REASON}
                onChange={onToggleAll}
                className="h-4 w-4 cursor-pointer accent-[#1D4ED8] disabled:cursor-not-allowed"
              />
            </th>
            {COLUMNS.map((c) => (
              <th key={c} scope="col" className="px-3 py-3">
                {c}
              </th>
            ))}
            <th scope="col" className="py-3 pl-3 pr-4 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <ListingRow key={row.id} row={row} selected={selected.has(row.id)} canWrite={canWrite} busy={busyId === row.id} onToggle={onToggle} onQuickView={onQuickView} onAction={onAction} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div role="status" aria-label="Loading listings" className="space-y-px overflow-hidden rounded-xl border border-border bg-card p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="my-2 h-10 w-full" />
      ))}
    </div>
  );
}
