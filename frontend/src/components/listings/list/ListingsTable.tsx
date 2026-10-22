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

/** the design's listings table: a header line and one fixed-column line per listing */
export function ListingsTable({ rows, selected, canWrite, refreshing, busyId, onToggle, onToggleAll, onQuickView, onAction }: ListingsTableProps) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <div className="w-full overflow-x-auto" aria-busy={refreshing}>
      <div role="table" aria-label="Listings" className={`min-w-[1100px] transition-opacity ${refreshing ? "opacity-60" : ""}`}>
        <div role="row" className="flex h-8 w-full flex-row items-center bg-[#F5F5F5] px-4 pl-12 text-[11px] font-medium text-[#666666]">
          <div role="columnheader" className="w-6 shrink-0">
            <input
              type="checkbox"
              aria-label="Select all listings on this page"
              checked={allSelected}
              disabled={!canWrite}
              title={canWrite ? undefined : NO_WRITE_REASON}
              onChange={onToggleAll}
              className="h-3.5 w-3.5 cursor-pointer rounded border border-[#BDBDBD] accent-black disabled:cursor-not-allowed"
            />
          </div>
          <div role="columnheader" className="w-[240px] shrink-0">
            Listing
          </div>
          <div role="columnheader" className="w-[170px] shrink-0">
            Master product
          </div>
          <div role="columnheader" className="w-[120px] shrink-0">
            Marketplace
          </div>
          <div role="columnheader" className="w-[130px] shrink-0">
            Readiness
          </div>
          <div role="columnheader" className="w-[90px] shrink-0">
            Inventory
          </div>
          <div role="columnheader" className="w-[120px] shrink-0">
            Last sync
          </div>
          <div role="columnheader" className="min-w-[120px] flex-1">
            Status
          </div>
          <div role="columnheader" className="w-[150px] shrink-0 text-right">
            Action
          </div>
        </div>
        <div className="w-full divide-y divide-[#EAEAEA] border-b border-[#EAEAEA]">
          {rows.map((row) => (
            <ListingRow key={row.id} row={row} selected={selected.has(row.id)} canWrite={canWrite} busy={busyId === row.id} onToggle={onToggle} onQuickView={onQuickView} onAction={onAction} />
          ))}
        </div>
      </div>
    </div>
  );
}
