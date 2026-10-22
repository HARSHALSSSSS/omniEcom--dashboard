import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { formatNumber, formatRelativeTime } from "@/utils/format";
import type { LedgerPage, LedgerRow, Tone, VariantAllocation } from "@/types/inventory";
import { PAGE_SIZES } from "./inventoryParams";
import { InventoryThumb } from "./inventoryUi";
import { HEALTH_ICON, HEALTH_LABEL, NO_WRITE_REASON, ONE_WAREHOUSE_REASON, SYNC_LABEL, TONE_HEX, TONE_OF_HEALTH, coverShort } from "./inventoryLabels";

const GRID =
  "grid grid-cols-[40px_minmax(180px,1.6fr)_minmax(110px,1fr)_75px_75px_75px_75px_minmax(100px,0.9fr)_minmax(130px,1.1fr)_minmax(130px,1.1fr)_minmax(110px,0.9fr)_44px] items-center px-4";

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
    <div role="columnheader" aria-sort={dir} className={className}>
      <button type="button" onClick={() => onSort(sort === asc ? desc : asc)} className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-medium hover:text-[#111111]">
        {label}
        <Icon className={cn("h-3 w-3", dir === "none" && "opacity-40")} aria-hidden />
      </button>
    </div>
  );
}

const RAIL: Record<Tone, string> = { good: "#16A34A", warn: "#D97706", bad: "#DC2626", neutral: "#A3A3A3", info: "#2563EB" };

function ChannelSyncCell({ row, allocation, loading }: { row: LedgerRow; allocation: VariantAllocation | undefined; loading: boolean }) {
  const sync = SYNC_LABEL[row.channelSync];
  const Icon = sync.icon;
  const color = TONE_HEX[sync.tone];
  const detail = allocation
    ? [...allocation.channels.map((c) => `${c.channel.name}: ${formatNumber(c.allocated)}`), ...(allocation.buffer !== null ? [`Buffer: ${formatNumber(allocation.buffer)}`] : [])].join(" · ")
    : null;
  const title = allocation?.channels.map((c) => `${c.channel.name} (${c.channel.accountName}): ${c.allocated} may be sold${c.mode === "paused" ? ", sync paused" : ""}`).join("\n");
  return (
    <div className="flex min-w-0 flex-col gap-0.5 pl-2">
      <div className="flex min-w-0 flex-row items-center gap-1.5">
        <Icon style={{ color }} className="h-3.5 w-3.5 shrink-0 stroke-[2px]" aria-hidden />
        <span style={{ color }} className="truncate text-[12px] font-medium">
          {sync.label}
        </span>
      </div>
      {row.channelSync !== "not_listed" && (detail ? <span title={title} className="truncate text-[10px] text-[#737373]">{detail}</span> : loading && <Skeleton className="h-2.5 w-24" />)}
    </div>
  );
}

function WarehouseCell({ row }: { row: LedgerRow }) {
  const first = row.warehouses[0];
  if (!first) return <span className="pl-3 text-[13px] text-[#737373]">—</span>;
  const title = row.warehouses.map((w) => `${w.warehouseName}${w.city ? `, ${w.city}` : ""}: ${w.available} available${w.safetyStock !== null ? `, reorder at ${w.safetyStock}` : ""}`).join("\n");
  return (
    <div className="min-w-0 pl-3" title={title}>
      <p className="m-0 truncate text-[13px] font-normal text-[#111111]">{first.warehouseName}</p>
      {row.warehouses.length > 1 && <p className="m-0 text-[10px] text-[#737373]">+{row.warehouses.length - 1} more</p>}
    </div>
  );
}

interface RowMenuProps {
  row: LedgerRow;
  canWrite: boolean;
  multiWarehouse: boolean;
  onOpen: () => void;
  onAdjust: () => void;
  onTransfer: () => void;
}

/** the "More" cell: a small menu per row (adjust, transfer, details) */
function RowMenu({ row, canWrite, multiWarehouse, onOpen, onAdjust, onTransfer }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const item = (label: string, run: () => void, disabled = false, reason = NO_WRITE_REASON) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={disabled ? reason : undefined}
      onClick={() => {
        setOpen(false);
        run();
      }}
      className="block w-full cursor-pointer rounded-md border-none bg-transparent px-3 py-1.5 text-left text-[12px] text-[#111111] hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );

  return (
    <div ref={ref} className="relative flex items-center justify-end pr-1">
      <button type="button" aria-label={`More actions for ${row.sku}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="cursor-pointer border-none bg-transparent p-0 text-[#737373] hover:text-[#111111]">
        <MoreHorizontal className="h-4 w-4 stroke-[1.75px]" aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label={`Actions for ${row.sku}`} className="absolute right-0 top-6 z-30 w-44 rounded-lg border border-[#EAEAEA] bg-white p-1 shadow-lg">
          {item("Adjust stock", onAdjust, !canWrite)}
          {item("Transfer stock", onTransfer, !canWrite || !multiWarehouse, !canWrite ? NO_WRITE_REASON : ONE_WAREHOUSE_REASON)}
          {item("View details", onOpen)}
        </div>
      )}
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
  multiWarehouse: boolean;
  selected: ReadonlySet<string>;
  /** "all matching" counts every visible row as selected */
  allMatching: boolean;
  onToggle: (row: LedgerRow) => void;
  onToggleAll: () => void;
  onOpen: (row: LedgerRow) => void;
  onAdjust: (row: LedgerRow) => void;
  onTransfer: (row: LedgerRow) => void;
}

export function LedgerTable({ rows, loading, allocations, allocationsLoading, sort, onSort, canWrite, multiWarehouse, selected, allMatching, onToggle, onToggleAll, onOpen, onAdjust, onTransfer }: LedgerTableProps) {
  const byVariant = new Map((allocations ?? []).map((a) => [a.variantId, a]));
  const isOn = (row: LedgerRow) => allMatching || selected.has(row.variantId);
  const allOn = rows.length > 0 && rows.every(isOn);
  const checkbox = "h-4 w-4 cursor-pointer rounded-[4px] border border-[#BDBDBD] accent-black";
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-[#EAEAEA] bg-white shadow-2xs">
      <div role="table" aria-label="Stock ledger, one row per product variant" className="min-w-[1180px]">
        <div role="rowgroup">
          <div role="row" className={cn(GRID, "h-11 border-b border-[#EAEAEA] bg-[#F9F9F9] text-[12px] font-medium text-[#737373]")}>
            <div role="columnheader" className="flex items-center">
              <input type="checkbox" aria-label="Select all products on this page" checked={allOn} onChange={onToggleAll} disabled={loading || rows.length === 0} className={checkbox} />
            </div>
            <SortHeader label="Product" asc="sku" desc="-sku" sort={sort} onSort={onSort} />
            <div role="columnheader">SKU</div>
            <SortHeader label="Available" asc="available" desc="-available" sort={sort} onSort={onSort} className="pr-2 text-right" />
            <div role="columnheader" className="pr-2 text-right">Reserved</div>
            <div role="columnheader" className="pr-2 text-right">Incoming</div>
            <SortHeader label="Coverage" asc="coverDays" desc="-coverDays" sort={sort} onSort={onSort} className="pr-2 text-right" />
            <div role="columnheader" className="pl-3">Warehouse</div>
            <div role="columnheader" className="pl-2">Channel sync</div>
            <div role="columnheader" className="pl-2">Health</div>
            <SortHeader label="Last movement" asc="lastMovement" desc="-lastMovement" sort={sort} onSort={onSort} className="text-center" />
            <div role="columnheader" className="pr-2 text-right">More</div>
          </div>
        </div>
        <div role="rowgroup">
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <div key={i} role="row" aria-hidden className="h-[64px] border-b border-[#F0F0F0] px-4 py-3">
                  <Skeleton className="h-10 w-full" />
                </div>
              ))
            : rows.map((row) => {
                const HealthIcon = HEALTH_ICON[row.health];
                const healthColor = TONE_HEX[TONE_OF_HEALTH[row.health]];
                return (
                  <div key={row.variantId} role="row" className={cn(GRID, "relative h-[64px] border-b border-[#F0F0F0] bg-white transition-colors last:border-b-0 hover:bg-neutral-50/70")}>
                    <div style={{ backgroundColor: RAIL[row.borderTone] }} className="absolute bottom-[12px] left-0 top-[12px] w-[3px] rounded-r-sm" aria-hidden />

                    <div role="cell" className="flex items-center">
                      <input type="checkbox" aria-label={`Select ${row.sku}`} checked={isOn(row)} onChange={() => onToggle(row)} className={checkbox} />
                    </div>

                    <div role="cell" className="group flex min-w-0 flex-row items-center gap-3 pr-2">
                      <InventoryThumb url={row.thumbnailUrl} title={row.title} size={36} className="shadow-2xs transition-colors group-hover:border-black" />
                      <div className="min-w-0">
                        <button type="button" onClick={() => onOpen(row)} className="block max-w-full cursor-pointer truncate border-none bg-transparent p-0 text-left text-[13px] font-semibold text-[#111111] hover:underline">
                          {row.title}
                        </button>
                        {row.category && <span className="block truncate text-[10px] text-[#737373]">{row.category.name}</span>}
                      </div>
                    </div>

                    <span role="cell" className="truncate pr-2 text-[12px] text-[#737373]" title={row.barcode ? `Barcode: ${row.barcode}` : undefined}>
                      {row.sku}
                    </span>

                    <div role="cell" className="pr-2 text-right" title={[row.damaged ? `${row.damaged} damaged` : null, row.quarantined ? `${row.quarantined} quarantined` : null, row.returned ? `${row.returned} returned` : null].filter(Boolean).join(" · ") || undefined}>
                      <span className={cn("text-[13px] font-semibold", row.available === 0 ? "text-[#DC2626]" : "text-[#111111]")}>{formatNumber(row.available)}</span>
                      {row.onHand !== row.available && <span className="block text-[10px] font-normal text-[#737373]">{formatNumber(row.onHand)} on hand</span>}
                    </div>

                    <span role="cell" className="pr-2 text-right text-[13px] font-normal text-[#111111]">{formatNumber(row.reserved)}</span>
                    <span role="cell" className="pr-2 text-right text-[13px] font-normal text-[#111111]">{formatNumber(row.incoming)}</span>
                    <span role="cell" style={{ color: row.coverDays === null && row.available > 0 ? "#737373" : healthColor }} className="pr-2 text-right text-[13px] font-medium" title={row.coverDays === null && row.available > 0 ? "No sales data yet" : undefined}>
                      {coverShort(row.coverDays, row.available)}
                    </span>

                    <div role="cell">
                      <WarehouseCell row={row} />
                    </div>

                    <div role="cell" className="min-w-0">
                      <ChannelSyncCell row={row} allocation={byVariant.get(row.variantId)} loading={allocationsLoading} />
                    </div>

                    <div role="cell" className="flex min-w-0 flex-col items-start gap-0.5 pl-2">
                      <div className="flex min-w-0 flex-row items-center gap-1.5">
                        <HealthIcon style={{ color: healthColor }} className="h-3.5 w-3.5 shrink-0 stroke-[2px]" aria-hidden />
                        <span style={{ color: healthColor }} className="truncate text-[12px] font-medium">
                          {HEALTH_LABEL[row.health]}
                        </span>
                      </div>
                      {row.stockStatus === "excess" && <span className="text-[10px] font-medium text-[#2563EB]">Excess</span>}
                    </div>

                    <span role="cell" className="text-center text-[13px] text-[#737373]">{row.lastMovementAt ? formatRelativeTime(row.lastMovementAt) : "—"}</span>

                    <div role="cell">
                      <RowMenu row={row} canWrite={canWrite} multiWarehouse={multiWarehouse} onOpen={() => onOpen(row)} onAdjust={() => onAdjust(row)} onTransfer={() => onTransfer(row)} />
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
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
    <nav aria-label="Pagination" className="flex w-full flex-wrap items-center justify-between gap-2">
      <span className="text-[12px] text-[#737373]" aria-live="polite">
        Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(data.total)} SKUs
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
          Previous
        </Button>
        <span className="text-xs text-[#737373]">
          Page {data.page} of {Math.max(data.pages, 1)}
        </span>
        <Button variant="outline" size="sm" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}>
          Next
        </Button>
        <select aria-label="SKUs per page" value={data.pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-8 rounded-md border border-[#EAEAEA] bg-white px-2 text-xs">
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
    <div className="flex min-h-[260px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-[#EAEAEA] bg-white px-6 text-center">
      <h3 className="m-0 text-base font-semibold text-[#111111]">{filtered ? "No stock matches these filters." : "No stock yet."}</h3>
      <p className="m-0 max-w-md text-xs text-[#737373]">
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
    <div role="alert" className="flex min-h-[260px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-[#EAEAEA] bg-white px-6 text-center">
      <h3 className="m-0 text-base font-semibold text-[#111111]">The stock ledger could not be loaded.</h3>
      <p className="m-0 max-w-md text-xs text-[#737373]">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
