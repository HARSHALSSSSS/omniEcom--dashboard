import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { saveBlob } from "@/components/products/list/saveBlob";
import { useReturnCounts, useReturnsLedger, useSelectAllReturns } from "@/hooks/useReturns";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import {
  DISPOSITION_FILTERS,
  INSPECTION_STATUSES,
  REFUND_STATUSES,
  RETURN_SIGNALS,
  RETURN_TABS,
  type DispositionFilter,
  type InspectionStatus,
  type LedgerRow,
  type MarketplaceOption,
  type RefundStatus,
  type ReturnSignal,
  type ReturnSort,
  type ReturnsOverview,
} from "@/types/returns";
import { AssignInspector } from "./AssignInspector";
import { MarkInspection } from "./MarkInspection";
import { BTN_LIGHT, DesignPagination, INSPECTION_COLOR, Notice, REFUND_COLOR, SELECT_MD, SkeletonRows, SectionHeading, STAGE_COLOR, TABLE_WRAP, dispositionColor } from "./design";
import { fmtShortDay, rowsToCsv } from "./returnFormat";
import {
  DEFAULT_PAGE_SIZE,
  DISPOSITION_LABELS,
  INSPECTION_LABELS,
  REFUND_LABELS,
  SIGNAL_LABELS,
  SORT_OPTIONS,
  TAB_LABELS,
  isFiltered,
  ledgerQueryOf,
  type DrawerKind,
  type useReturnsUrlState,
} from "./returnParams";
import { rowAction } from "./returnUi";

type UrlState = ReturnType<typeof useReturnsUrlState>;

interface LedgerSectionProps {
  url: UrlState;
  overview: ReturnsOverview | undefined;
  channelOptions: MarketplaceOption[];
  canWrite: boolean;
  /** opens the create form, when a return can be created here */
  onCreate: (() => void) | null;
  onOpen: (kind: DrawerKind, id: string) => void;
  /** opens the picked returns one after the other in the detail drawer */
  onReview: (ids: string[]) => void;
  onExport: () => void;
  exporting: boolean;
}

const dispositionLabel = (d: string): string => (d in DISPOSITION_LABELS ? DISPOSITION_LABELS[d as DispositionFilter] : d === "mixed" ? "Mixed" : d);

/** a debounced search box whose text mirrors the URL */
function SearchBox({ q, onSearch }: { q: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, onSearch]);
  return (
    <div className="relative min-w-[280px] flex-1">
      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 stroke-[1.5] text-[#666666]" aria-hidden />
      <input
        type="search"
        aria-label="Search returns"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search return, order, product or SKU"
        className="h-[34px] w-full rounded-lg border border-[#EAEAEA] bg-white pl-9 pr-3 text-[12px] text-black placeholder:text-[#666666] focus:border-black focus:outline-none"
      />
    </div>
  );
}

/** the ledger of the Overview tab: queues, search, filters, the table with its selection bar, pagination and the signal card */
export function LedgerSection({ url, overview, channelOptions, canWrite, onCreate, onOpen, onReview, onExport, exporting }: LedgerSectionProps) {
  const { update, clearFilters, filters, sort, page, pageSize, tab } = url;
  const query = ledgerQueryOf(url);
  const ledger = useReturnsLedger(query);
  const counts = useReturnCounts(filters);
  const filtered = isFiltered(filters);
  const hasAdvanced = Boolean(filters.signal || filters.inspectionStatus || filters.refundStatus || filters.disposition || sort !== "-requestedAt");
  const [showFilters, setShowFilters] = useState(hasAdvanced);
  const [selected, setSelected] = useState<Record<string, LedgerRow>>({});
  const [tool, setTool] = useState<"assign" | "mark" | null>(null);
  const selectEvery = useSelectAllReturns();
  const [selectAllNote, setSelectAllNote] = useState<string | null>(null);

  const rows = useMemo(() => ledger.data?.items ?? [], [ledger.data]);
  const total = ledger.data?.total ?? 0;
  const selectAllBusy = selectEvery.isPending;
  /** every return of the current queue, search and filters, across the pages */
  const selectAll = () => {
    setSelectAllNote(null);
    selectEvery.mutate(query, {
      onSuccess: ({ rows: all, truncated }) => {
        setSelected(Object.fromEntries(all.map((r) => [r.id, r])));
        if (truncated) setSelectAllNote(`Only the first ${formatNumber(all.length)} are selected; narrow the filters for the rest.`);
      },
      onError: (e) => setSelectAllNote(errorMessage(e)),
    });
  };
  const selectedRows = Object.values(selected);
  const allVisible = rows.length > 0 && rows.every((r) => selected[r.id]);

  // a page past the end (a shrinking result set, an old link) falls back to the last page
  useEffect(() => {
    const data = ledger.data;
    if (data && data.total > 0 && data.items.length === 0 && page > data.pages) update({ page: String(data.pages) }, { replace: true });
  }, [ledger.data, page, update]);

  const toggleRow = (row: LedgerRow) =>
    setSelected((s) => {
      if (s[row.id]) return Object.fromEntries(Object.entries(s).filter(([id]) => id !== row.id));
      return { ...s, [row.id]: row };
    });
  const toggleVisible = () =>
    setSelected((s) => {
      if (allVisible) {
        const visible = new Set(rows.map((r) => r.id));
        return Object.fromEntries(Object.entries(s).filter(([id]) => !visible.has(id)));
      }
      return { ...s, ...Object.fromEntries(rows.map((r) => [r.id, r])) };
    });

  const exportSelected = () => saveBlob(new Blob([rowsToCsv(selectedRows)], { type: "text/csv;charset=utf-8" }), "returns-selected.csv");

  const channels = filters.marketplace && !channelOptions.some((c) => c.code === filters.marketplace) ? [...channelOptions, { code: filters.marketplace, name: filters.marketplace }] : channelOptions;
  const loading = ledger.isLoading;
  const listError = ledger.isError && !ledger.data;

  return (
    <section className="space-y-3.5">
      <SectionHeading title="Returns" description="Know what came back, why it came back, and what happens next." />

      <div role="tablist" aria-label="Return queues" className="flex flex-wrap items-center gap-2">
        {RETURN_TABS.map((t) => {
          const active = t === tab;
          const count = counts.data?.[t];
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => update({ tab: t, stage: null })}
              className={cn("flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] transition-colors", active ? "bg-[#F5F5F5] font-semibold text-black" : "bg-white text-black hover:bg-neutral-50")}
            >
              {TAB_LABELS[t]}
              <span className="font-mono text-[10px] text-[#666666]">{count === undefined ? "—" : formatNumber(count)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox q={filters.q ?? ""} onSearch={(q) => update({ q }, { replace: true })} />
        <div className="relative">
          <select aria-label="Marketplace" value={filters.marketplace ?? ""} onChange={(e) => update({ marketplace: e.target.value || null })} className={cn(SELECT_MD, "cursor-pointer appearance-none pr-8")}>
            <option value="">Marketplace</option>
            {channels.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 stroke-[2] text-black" />
        </div>
        <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)} className={cn(BTN_LIGHT, "shadow-none", hasAdvanced && "border-black")}>
          <SlidersHorizontal className="h-3.5 w-3.5 stroke-[2] text-black" />
          <span>Filters</span>
        </button>
        {filtered && (
          <button type="button" onClick={clearFilters} className="text-[12px] font-semibold text-black hover:underline">
            Clear filters
          </button>
        )}
        <button type="button" onClick={onExport} disabled={exporting} className={cn(BTN_LIGHT, "ml-auto")}>
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#EAEAEA] bg-[#FAFAFA] p-2.5">
          <select aria-label="Attention signal" value={filters.signal ?? ""} onChange={(e) => update({ signal: (e.target.value as ReturnSignal) || null })} className={SELECT_MD}>
            <option value="">Any signal</option>
            {RETURN_SIGNALS.map((s) => (
              <option key={s} value={s}>
                {SIGNAL_LABELS[s]}
              </option>
            ))}
          </select>
          <select aria-label="Inspection status" value={filters.inspectionStatus ?? ""} onChange={(e) => update({ inspection: (e.target.value as InspectionStatus) || null })} className={SELECT_MD}>
            <option value="">Any inspection</option>
            {INSPECTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                Inspection: {INSPECTION_LABELS[s]}
              </option>
            ))}
          </select>
          <select aria-label="Refund status" value={filters.refundStatus ?? ""} onChange={(e) => update({ refund: (e.target.value as RefundStatus) || null })} className={SELECT_MD}>
            <option value="">Any refund</option>
            {REFUND_STATUSES.map((s) => (
              <option key={s} value={s}>
                Refund: {REFUND_LABELS[s]}
              </option>
            ))}
          </select>
          <select aria-label="Disposition" value={filters.disposition ?? ""} onChange={(e) => update({ disposition: (e.target.value as DispositionFilter) || null })} className={SELECT_MD}>
            <option value="">Any disposition</option>
            {DISPOSITION_FILTERS.map((d) => (
              <option key={d} value={d}>
                {DISPOSITION_LABELS[d]}
              </option>
            ))}
          </select>
          <select aria-label="Sort returns" value={sort} onChange={(e) => update({ sort: e.target.value === "-requestedAt" ? null : (e.target.value as ReturnSort) })} className={cn(SELECT_MD, "ml-auto")}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedRows.length > 0 && (
        <div role="toolbar" aria-label="Selected returns" className="flex flex-wrap items-center gap-4 rounded-lg bg-[#F5F8FE] px-3.5 py-2 text-[11px] text-black">
          <label className="flex cursor-pointer items-center gap-1.5 font-semibold">
            <input type="checkbox" aria-label="Select all visible" checked={allVisible} onChange={toggleVisible} className="h-3.5 w-3.5 rounded border-[#BDBDBD] accent-black" />
            <span>{selectedRows.length} selected</span>
          </label>
          <button type="button" onClick={toggleVisible} className="hover:underline">
            {allVisible ? "Unselect visible" : `Select visible (${rows.length})`}
          </button>
          {total > rows.length && (
            <button type="button" onClick={selectAll} disabled={selectAllBusy} className="hover:underline disabled:opacity-60">
              {selectAllBusy ? "Selecting..." : `Select all (${formatNumber(total)})`}
            </button>
          )}
          <button type="button" onClick={() => setSelected({})} className="text-[#666666] hover:text-black hover:underline">
            Clear selection
          </button>
          <button type="button" onClick={exportSelected} className="hover:underline">
            Export selected
          </button>
          {canWrite && (
            <button type="button" aria-expanded={tool === "assign"} onClick={() => setTool((v) => (v === "assign" ? null : "assign"))} className="hover:underline">
              Assign inspection
            </button>
          )}
          {canWrite && (
            <button type="button" aria-expanded={tool === "mark"} onClick={() => setTool((v) => (v === "mark" ? null : "mark"))} className="hover:underline">
              Mark inspection status
            </button>
          )}
          <button type="button" onClick={() => onReview(selectedRows.map((r) => r.id))} className="hover:underline">
            Review selected
          </button>
          <span className="text-[#666666]">No bulk refunds or dispositions</span>
          {selectAllNote && <span className="text-[#D97706]">{selectAllNote}</span>}
          {tool === "assign" && canWrite && (
            <AssignInspector
              className="w-full"
              ids={selectedRows.map((r) => r.id)}
              label={`${selectedRows.length} ${selectedRows.length === 1 ? "return" : "returns"}`}
              onDone={() => {
                setTool(null);
                setSelected({});
              }}
            />
          )}
          {tool === "mark" && canWrite && (
            <MarkInspection
              className="w-full"
              ids={selectedRows.map((r) => r.id)}
              label={`${selectedRows.length} ${selectedRows.length === 1 ? "return" : "returns"}`}
              onDone={() => {
                setTool(null);
                setSelected({});
              }}
            />
          )}
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={8} label="Loading returns" />
      ) : listError ? (
        <Notice
          role="alert"
          tone="error"
          title="Returns could not be loaded."
          description={errorMessage(ledger.error)}
          action={
            <button type="button" className={BTN_LIGHT} onClick={() => void ledger.refetch()}>
              Retry
            </button>
          }
        />
      ) : rows.length === 0 ? (
        filtered ? (
          <Notice
            title="No returns match these filters."
            description="Try a different search, queue, channel or status to find the returns you need."
            action={
              <button type="button" className={BTN_LIGHT} onClick={clearFilters}>
                Clear filters
              </button>
            }
          />
        ) : (
          <Notice
            title="No returns yet."
            description="Return requests from your marketplaces and from your own team appear here."
            action={
              onCreate ? (
                <button type="button" className={BTN_LIGHT} onClick={onCreate}>
                  Create a return
                </button>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <div className={cn(TABLE_WRAP, "transition-opacity", ledger.isFetching && ledger.isPlaceholderData && "opacity-60")} aria-busy={ledger.isFetching && ledger.isPlaceholderData}>
            <table aria-label="Returns" className="w-full whitespace-nowrap text-left text-[11px]">
              <thead>
                <tr className="border-b border-[#EAEAEA] bg-[#F5F5F5] text-[10px] text-[#666666]">
                  <th scope="col" className="w-8 py-2.5 pl-3">
                    <input type="checkbox" aria-label="Select all visible returns" checked={allVisible} onChange={toggleVisible} className="h-3 w-3 cursor-pointer rounded border-[#BDBDBD] accent-black" />
                  </th>
                  {["Return ID", "Order", "Product / SKU", "Marketplace", "Return Reason"].map((c) => (
                    <th key={c} scope="col" className="px-2 py-2.5 font-normal">
                      {c}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2.5 text-center font-normal">
                    Quantity
                  </th>
                  {["Return Status", "Received", "Inspection", "Refund", "Inventory Disposition"].map((c) => (
                    <th key={c} scope="col" className="px-2 py-2.5 font-normal">
                      {c}
                    </th>
                  ))}
                  <th scope="col" className="py-2.5 pr-3 text-right font-normal">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA]/80">
                {rows.map((ret) => {
                  const isSel = Boolean(selected[ret.id]);
                  const act = rowAction(ret);
                  const extra = ret.product.itemCount - 1;
                  return (
                    <tr key={ret.id} className={cn("transition-colors", isSel ? "bg-[#F5F8FE]" : "hover:bg-neutral-50/50")}>
                      <td className="py-2.5 pl-3">
                        <input type="checkbox" aria-label={`Select ${ret.number}`} checked={isSel} onChange={() => toggleRow(ret)} className="h-3 w-3 cursor-pointer rounded border-[#BDBDBD] accent-black" />
                      </td>
                      <td className="px-2 py-2.5 font-semibold">
                        <button type="button" onClick={() => onOpen("return", ret.id)} className="cursor-pointer text-left font-semibold text-black hover:underline">
                          {ret.number}
                        </button>
                      </td>
                      <td className="px-2 py-2.5 text-[#666666]">
                        <button type="button" onClick={() => onOpen("return", ret.id)} className="cursor-pointer text-left text-[#666666] hover:text-black hover:underline">
                          {ret.orderNumber}
                        </button>
                      </td>
                      <td className="max-w-[220px] px-2 py-2.5">
                        <div className="truncate font-medium text-black">{ret.product.title ?? "—"}</div>
                        <div className="text-[10px] text-[#666666]">
                          {ret.product.sku ?? "No SKU"}
                          {extra > 0 ? ` +${extra} more` : ""}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-[#666666]">{ret.channel.name}</td>
                      <td className="max-w-[200px] truncate px-2 py-2.5 text-[#666666]">{ret.reason.label}</td>
                      <td className="px-2 py-2.5 text-center text-[#666666]">{ret.quantity}</td>
                      <td className="px-2 py-2.5">
                        <span className={cn("font-medium", STAGE_COLOR[ret.stage])}>{ret.stageLabel}</span>
                      </td>
                      <td className="px-2 py-2.5 text-[#666666]">{ret.receivedAt ? fmtShortDay(ret.receivedAt) : "—"}</td>
                      <td className="px-2 py-2.5">
                        <button type="button" aria-label={`Inspection of ${ret.number}`} onClick={() => onOpen("inspect", ret.id)} className={cn("cursor-pointer text-left hover:underline", INSPECTION_COLOR[ret.inspection.status])}>
                          {INSPECTION_LABELS[ret.inspection.status]}
                        </button>
                      </td>
                      <td className="px-2 py-2.5">
                        <button type="button" aria-label={`Refund of ${ret.number}`} onClick={() => onOpen("refund", ret.id)} className={cn("cursor-pointer text-left hover:underline", REFUND_COLOR[ret.refund.status])}>
                          {REFUND_LABELS[ret.refund.status]}
                        </button>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={dispositionColor(ret.disposition)}>{dispositionLabel(ret.disposition)}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-right">
                        <button type="button" aria-label={`${act.label.replace(" →", "")} ${ret.number}`} onClick={() => onOpen(act.drawer, ret.id)} className="cursor-pointer font-medium text-black hover:underline">
                          {act.label}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <DesignPagination
            page={ledger.data?.page ?? page}
            pages={ledger.data?.pages ?? 1}
            total={ledger.data?.total ?? 0}
            pageSize={pageSize}
            shown={rows.length}
            noun="returns"
            onPage={(p) => update({ page: p > 1 ? String(p) : null }, { keepPage: true })}
            onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
            suffix={
              overview?.statusLine ? (
                <>
                  {" · "}
                  <span className="font-medium text-black">{formatNumber(overview.statusLine.open)} open</span>
                </>
              ) : undefined
            }
          />

          {filters.signal && (
            <div className="space-y-2 rounded-xl border border-[#EAEAEA] bg-white p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 font-semibold text-[#D97706]">
                  <span>FILTER APPLIED</span>
                  <span>·</span>
                  <span>{SIGNAL_LABELS[filters.signal]}</span>
                  <span>·</span>
                  <span>
                    {formatNumber(ledger.data?.total ?? 0)} {(ledger.data?.total ?? 0) === 1 ? "result" : "results"}
                  </span>
                </div>
                <button type="button" onClick={() => update({ signal: null })} className="text-[11px] font-medium text-black hover:underline">
                  Clear filter ×
                </button>
              </div>
              <div className="overflow-hidden rounded-lg border border-[#EAEAEA]">
                <div className="grid grid-cols-12 bg-[#F5F5F5] px-3 py-2 text-[10px] text-[#666666]">
                  <div className="col-span-2">Return</div>
                  <div className="col-span-4">Product / SKU</div>
                  <div className="col-span-3">Issue</div>
                  <div className="col-span-3 text-right">Next action</div>
                </div>
                {rows.slice(0, 3).map((ret) => {
                  const act = rowAction(ret);
                  return (
                    <div key={ret.id} className="grid grid-cols-12 items-center border-t border-[#EAEAEA] bg-[#F5F8FE] px-3 py-2.5 text-[12px]">
                      <div className="col-span-2 font-semibold text-[#666666]">{ret.number}</div>
                      <div className="col-span-4 text-black">
                        {ret.product.title ?? "—"} <span className="text-[11px] text-[#666666]">{ret.product.sku}</span>
                      </div>
                      <div className="col-span-3 text-[11px] font-medium text-[#D97706]">{ret.signals.length > 0 ? ret.signals.map((s) => SIGNAL_LABELS[s as ReturnSignal] ?? s).join(", ") : ret.reason.label}</div>
                      <div className="col-span-3 text-right">
                        <button type="button" onClick={() => onOpen(act.drawer, ret.id)} className="cursor-pointer text-[12px] font-medium text-black hover:underline">
                          {act.label}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
