import { Link } from "react-router-dom";
import { cn } from "@/utils/cn";
import type { NotListedRow } from "@/types/listing";
import { NO_WRITE_REASON, STATUS_COLOR, notListedKey, price, unlistedPath } from "./listingFormat";

interface NotListedTableProps {
  rows: NotListedRow[];
  selected: ReadonlySet<string>;
  canWrite: boolean;
  refreshing: boolean;
  /** the pair whose listing is being created */
  busyKey: string | null;
  onToggle: (key: string) => void;
  onToggleAll: () => void;
  onCreate: (row: NotListedRow) => void;
}

/** variants that could be listed on a connected account: "Prepare" opens the preparation screen, "Create listing" starts a draft */
export function NotListedTable({ rows, selected, canWrite, refreshing, busyKey, onToggle, onToggleAll, onCreate }: NotListedTableProps) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(notListedKey(r)));
  return (
    <div className="w-full overflow-x-auto" aria-busy={refreshing}>
      <div role="table" aria-label="Products to list" className={cn("min-w-[860px] transition-opacity", refreshing && "opacity-60")}>
        <div role="row" className="flex h-8 w-full flex-row items-center bg-[#F5F5F5] px-4 text-[11px] font-medium text-[#666666]">
          <div role="columnheader" className="w-6 shrink-0">
            <input
              type="checkbox"
              aria-label="Select all products on this page"
              checked={allSelected}
              disabled={!canWrite}
              title={canWrite ? undefined : NO_WRITE_REASON}
              onChange={onToggleAll}
              className="h-3.5 w-3.5 cursor-pointer rounded border border-[#BDBDBD] accent-black disabled:cursor-not-allowed"
            />
          </div>
          <div role="columnheader" className="w-[260px] shrink-0">
            Product
          </div>
          <div role="columnheader" className="w-[130px] shrink-0">
            Master product
          </div>
          <div role="columnheader" className="w-[150px] shrink-0">
            Marketplace
          </div>
          <div role="columnheader" className="w-[130px] shrink-0">
            Price / MRP
          </div>
          <div role="columnheader" className="min-w-[120px] flex-1">
            Status
          </div>
          <div role="columnheader" className="w-[230px] shrink-0 text-right">
            Action
          </div>
        </div>
        <div className="w-full divide-y divide-[#EAEAEA] border-b border-[#EAEAEA]">
          {rows.map((r) => {
            const key = notListedKey(r);
            const isSelected = selected.has(key);
            return (
              <div key={key} role="row" className={cn("flex min-h-[48px] w-full flex-row items-center px-4 py-1.5 text-[12px] transition-colors hover:bg-[#FAFAFA]", isSelected && "bg-[#F9FAFB]")}>
                <div role="cell" className="w-6 shrink-0">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.productTitle} for ${r.marketplaceName}`}
                    checked={isSelected}
                    disabled={!canWrite}
                    title={canWrite ? undefined : NO_WRITE_REASON}
                    onChange={() => onToggle(key)}
                    className="h-3.5 w-3.5 cursor-pointer rounded border border-[#BDBDBD] accent-black disabled:cursor-not-allowed"
                  />
                </div>
                <div role="cell" className="w-[260px] shrink-0 pr-3">
                  <p className="truncate text-[13px] font-medium text-[#000000]" title={r.productTitle}>
                    {r.productTitle}
                  </p>
                  {r.barcode && <p className="truncate font-mono text-[10px] text-[#666666]">{r.barcode}</p>}
                </div>
                <div role="cell" className="w-[130px] shrink-0 truncate font-mono text-[12px] text-[#666666]" title={r.sku}>
                  {r.sku}
                </div>
                <div role="cell" className="w-[150px] shrink-0 pr-2">
                  <p className="truncate text-[12px] text-[#000000]">{r.marketplaceName}</p>
                  <p className="truncate text-[10px] text-[#666666]">{r.accountName}</p>
                </div>
                <div role="cell" className="w-[130px] shrink-0">
                  <span className="text-[12px] font-medium text-[#000000]">{price(r.priceMinor)}</span>
                  {r.mrpMinor !== null && r.priceMinor !== null && r.mrpMinor > r.priceMinor && <span className="ml-1 text-[10px] text-[#666666] line-through">{price(r.mrpMinor)}</span>}
                </div>
                <div role="cell" className="flex min-w-[120px] flex-1 items-center gap-1.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLOR.not_listed }} />
                  <span className="text-[12px] font-medium text-[#666666]">Not listed</span>
                </div>
                <div role="cell" className="flex w-[230px] shrink-0 items-center justify-end gap-3">
                  <button
                    type="button"
                    className="cursor-pointer text-[11px] font-medium text-[#666666] hover:text-[#000000] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canWrite || busyKey === key}
                    title={canWrite ? "Start a draft listing for this product on this account" : NO_WRITE_REASON}
                    aria-label={`Create listing for ${r.productTitle} on ${r.marketplaceName}`}
                    onClick={() => onCreate(r)}
                  >
                    {busyKey === key ? "Creating…" : "Create listing"}
                  </button>
                  <Link
                    to={unlistedPath(r.variantId, r.accountId)}
                    className="text-[12px] font-semibold text-[#000000] hover:underline"
                    aria-label={`Prepare ${r.productTitle} for ${r.marketplaceName}`}
                  >
                    Prepare →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
