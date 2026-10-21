import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { LedgerPage, LedgerRow, VariantAllocation } from "@/types/inventory";
import { PAGE_SIZES } from "./inventoryParams";
import { HealthBadge, InventoryThumb, Pill } from "./inventoryUi";
import { NO_WRITE_REASON, SYNC_LABEL } from "./inventoryLabels";

const COLUMNS = 10;

interface SortHeaderProps {
  label: string;
  asc: string;
  desc: string;
  sort: string;
  onSort: (sort: string) => void;
  className?: string;
}

function SortHeader({ label, asc, desc, sort, onSort, className }: SortHeaderProps) {
  const dir = sort === asc ? "ascending" : sort === desc ? "descending" : "none";
  const Icon = dir === "ascending" ? ArrowUp : dir === "descending" ? ArrowDown : ArrowUpDown;
  return (
    <th scope="col" aria-sort={dir} className={className}>
      <button type="button" onClick={() => onSort(sort === asc ? desc : asc)} className="inline-flex items-center gap-1 font-medium hover:text-foreground">
        {label}
        <Icon className={cn("h-3 w-3", dir === "none" && "opacity-40")} aria-hidden />
      </button>
    </th>
  );
}

const coverText = (row: LedgerRow) => {
  if (row.coverDays === null) return <span className="text-muted-foreground" title="No sales data yet">—</span>;
  if (row.available === 0) return <span className="font-bold text-destructive">Depleted</span>;
  const days = Math.round(row.coverDays * 10) / 10;
  return <span className={days < 4 ? "font-bold text-destructive" : "text-foreground"}>{formatNumber(days)} days</span>;
};

function ChannelsCell({ row, allocation, loading }: { row: LedgerRow; allocation: VariantAllocation | undefined; loading: boolean }) {
  const sync = SYNC_LABEL[row.channelSync];
  return (
    <div className="flex flex-col gap-1">
      {row.channelSync !== "not_listed" &&
        (allocation ? (
          <div className="flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] text-muted-foreground">
            {allocation.channels.map((c) => (
              <span key={c.listingId} title={`${c.channel.name} (${c.channel.accountName}): ${c.allocated} may be sold${c.mode === "paused" ? ", sync paused" : ""}`}>
                {c.channel.name}: {formatNumber(c.allocated)}
              </span>
            ))}
            {allocation.buffer !== null && <span title="Held back from every channel">Buffer: {formatNumber(allocation.buffer)}</span>}
          </div>
        ) : (
          loading && <Skeleton className="h-3 w-24" />
        ))}
      <Pill tone={sync.tone} className="self-start">
        {sync.label}
      </Pill>
    </div>
  );
}

function WarehouseCell({ row }: { row: LedgerRow }) {
  const first = row.warehouses[0];
  if (!first) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="text-[11px]" title={row.warehouses.map((w) => `${w.warehouseName}${w.city ? `, ${w.city}` : ""}: ${w.available} available${w.safetyStock !== null ? `, reorder at ${w.safetyStock}` : ""}`).join("\n")}>
      <p className="font-medium text-foreground">{first.warehouseName}</p>
      <p className="text-muted-foreground">
        {first.city ?? "No city"}
        {row.warehouses.length > 1 ? ` · +${row.warehouses.length - 1} more` : ""}
      </p>
    </div>
  );
}

interface LedgerTableProps {
  rows: LedgerRow[];
  loading: boolean;
  allocations: VariantAllocation[] | undefined;
  allocationsLoading: boolean;
  sort: string;
  onSort: (sort: string) => void;
  canWrite: boolean;
  onOpen: (row: LedgerRow) => void;
  onAdjust: (row: LedgerRow) => void;
}

export function LedgerTable({ rows, loading, allocations, allocationsLoading, sort, onSort, canWrite, onOpen, onAdjust }: LedgerTableProps) {
  const byVariant = new Map((allocations ?? []).map((a) => [a.variantId, a]));
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full min-w-[1040px] text-left text-xs">
        <caption className="sr-only">Stock ledger, one row per product variant</caption>
        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
          <tr>
            <SortHeader label="Product / SKU" asc="sku" desc="-sku" sort={sort} onSort={onSort} className="py-3 pl-4 pr-3" />
            <SortHeader label="Available" asc="available" desc="-available" sort={sort} onSort={onSort} className="px-3 py-3" />
            <th scope="col" className="px-3 py-3 font-medium">Reserved</th>
            <th scope="col" className="px-3 py-3 font-medium">Incoming</th>
            <th scope="col" className="px-3 py-3 font-medium">On Hand</th>
            <SortHeader label="Days Cover" asc="coverDays" desc="-coverDays" sort={sort} onSort={onSort} className="px-3 py-3" />
            <th scope="col" className="px-3 py-3 font-medium">Channels Allocation</th>
            <th scope="col" className="px-3 py-3 font-medium">Warehouse</th>
            <th scope="col" className="px-3 py-3 font-medium">Status</th>
            <th scope="col" className="py-3 pl-3 pr-4 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i} aria-hidden>
                  <td colSpan={COLUMNS} className="px-4 py-3">
                    <Skeleton className="h-10 w-full" />
                  </td>
                </tr>
              ))
            : rows.map((row) => (
                <tr key={row.variantId} className="transition-colors hover:bg-muted/20">
                  <td className="py-3 pl-4 pr-3">
                    <div className="flex items-center gap-3">
                      <InventoryThumb url={row.thumbnailUrl} title={row.title} />
                      <div className="min-w-0">
                        <button type="button" onClick={() => onOpen(row)} className="max-w-[260px] truncate text-left font-medium text-foreground hover:underline">
                          {row.title}
                        </button>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {row.sku} · Barcode: {row.barcode ?? "—"}
                        </p>
                        {row.category && <p className="text-[11px] text-muted-foreground">{row.category.name}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-sm font-bold">
                    <span className={row.available === 0 ? "text-destructive" : row.health === "healthy" ? "text-foreground" : "text-amber-600"}>{formatNumber(row.available)}</span>
                  </td>
                  <td className="px-3 py-3 font-mono text-muted-foreground">{formatNumber(row.reserved)}</td>
                  <td className="px-3 py-3 font-mono text-muted-foreground">{formatNumber(row.incoming)}</td>
                  <td className="px-3 py-3 font-mono text-foreground">
                    {formatNumber(row.onHand)}
                    {row.damaged + row.quarantined + row.returned > 0 && (
                      <p className="font-sans text-[10px] text-muted-foreground">
                        {[row.damaged ? `${row.damaged} damaged` : null, row.quarantined ? `${row.quarantined} quarantined` : null, row.returned ? `${row.returned} returned` : null].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono">{coverText(row)}</td>
                  <td className="px-3 py-3">
                    <ChannelsCell row={row} allocation={byVariant.get(row.variantId)} loading={allocationsLoading} />
                  </td>
                  <td className="px-3 py-3">
                    <WarehouseCell row={row} />
                  </td>
                  <td className="px-3 py-3">
                    <HealthBadge health={row.health} stockStatus={row.stockStatus} />
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span title={canWrite ? undefined : NO_WRITE_REASON}>
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!canWrite} onClick={() => onAdjust(row)} aria-label={`Adjust stock of ${row.sku}`}>
                          Adjust
                        </Button>
                      </span>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onOpen(row)} aria-label={`Open details of ${row.sku}`}>
                        Drawer
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

interface PaginationProps {
  data: LedgerPage;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

export function LedgerPagination({ data, onPage, onPageSize }: PaginationProps) {
  const first = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const last = (data.page - 1) * data.pageSize + data.items.length;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 pt-1">
      <span className="text-xs text-muted-foreground" aria-live="polite">
        Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(data.total)} SKUs
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {data.page} of {Math.max(data.pages, 1)}
        </span>
        <Button variant="outline" size="sm" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}>
          Next
        </Button>
        <select aria-label="SKUs per page" value={data.pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>
    </nav>
  );
}

export function EmptyLedger({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-center">
      <h2 className="text-base font-semibold text-foreground">{filtered ? "No stock matches these filters." : "No stock yet."}</h2>
      <p className="max-w-md text-xs text-muted-foreground">
        {filtered ? "Try a different filter combination to find the SKUs you need." : "Stock shows up here once products have inventory. Add products first, then receive or adjust their stock."}
      </p>
      {filtered ? (
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      ) : (
        <Link to={ROUTES.PRODUCTS} className={buttonVariants({ size: "sm" })}>
          Go to products
        </Link>
      )}
    </div>
  );
}

export function LedgerError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-center">
      <h2 className="text-base font-semibold text-foreground">The stock ledger could not be loaded.</h2>
      <p className="max-w-md text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
