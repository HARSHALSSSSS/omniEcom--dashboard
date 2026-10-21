import { Button } from "@/components/ui/button";
import { AuthThumbnail } from "@/components/products/list/AuthThumbnail";
import type { NotListedRow } from "@/types/listing";
import { NO_WRITE_REASON, initialsOf, notListedKey, price } from "./listingFormat";

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

const COLUMNS = ["Product / SKU", "Marketplace", "Price / MRP"];

/** variants that could be listed on a connected account; "Create listing" starts a draft */
export function NotListedTable({ rows, selected, canWrite, refreshing, busyKey, onToggle, onToggleAll, onCreate }: NotListedTableProps) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(notListedKey(r)));
  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity ${refreshing ? "opacity-60" : ""}`} aria-busy={refreshing}>
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
          <tr>
            <th className="w-10 py-3 pl-4 pr-2">
              <input
                type="checkbox"
                aria-label="Select all products on this page"
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
          {rows.map((r) => {
            const key = notListedKey(r);
            return (
              <tr key={key} className={selected.has(key) ? "bg-muted/30" : "hover:bg-muted/20"}>
                <td className="py-3 pl-4 pr-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.productTitle} for ${r.marketplaceName}`}
                    checked={selected.has(key)}
                    disabled={!canWrite}
                    title={canWrite ? undefined : NO_WRITE_REASON}
                    onChange={() => onToggle(key)}
                    className="h-4 w-4 cursor-pointer accent-[#1D4ED8] disabled:cursor-not-allowed"
                  />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <AuthThumbnail url={null} alt="" initials={initialsOf(r.productTitle)} compact />
                    <div className="min-w-0">
                      <p className="max-w-[320px] truncate font-medium text-foreground">{r.productTitle}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        SKU: {r.sku}
                        {r.barcode ? ` · ${r.barcode}` : ""}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <p className="font-medium text-foreground">{r.marketplaceName}</p>
                  <p className="text-[11px] text-muted-foreground">{r.accountName}</p>
                </td>
                <td className="px-3 py-3">
                  <span className="font-semibold text-foreground">{price(r.priceMinor)}</span>
                  {r.mrpMinor !== null && r.priceMinor !== null && r.mrpMinor > r.priceMinor && (
                    <span className="ml-1 text-[11px] text-muted-foreground line-through">{price(r.mrpMinor)}</span>
                  )}
                </td>
                <td className="py-3 pl-3 pr-4 text-right">
                  <Button
                    size="sm"
                    className="h-7 bg-primary text-xs text-primary-foreground hover:bg-primary/90"
                    disabled={!canWrite || busyKey === key}
                    title={canWrite ? "Start a draft listing for this product on this account" : NO_WRITE_REASON}
                    aria-label={`Create listing for ${r.productTitle} on ${r.marketplaceName}`}
                    onClick={() => onCreate(r)}
                  >
                    {busyKey === key ? "Creating..." : "Create listing"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
