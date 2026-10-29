import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { Search, ChevronRight, ChevronDown, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { PricingPagination } from "@/components/pricing/PricingPagination";
import { usePriceTable } from "@/hooks/usePricing";
import { useDebounced } from "@/hooks/useDebounced";
import { formatDate, formatINR, formatNumber } from "@/utils/format";
import { errorMessage } from "@/api/errors";
import type { ChannelMargin, MarginOverview, PriceTableQuery, PriceTableRow, PriceTableSort, PriceTableState } from "@/types/pricing";
import { marginText, moneyText } from "./marginText";

interface ProductChannelPricingTableProps {
  /** channels for the channel filter (from the margin overview) */
  channels: ChannelMargin[];
  /** totals for the filter pill counts */
  totals?: MarginOverview["totals"];
  onSelectPriceItem?: (item: PriceTableRow) => void;
  /** the filters currently applied (for the page header's Export) */
  onQueryChange?: (query: Omit<PriceTableQuery, "page" | "pageSize">) => void;
}

type FilterPill = "all" | PriceTableState;

const NEXT_SORT: Record<PriceTableSort, PriceTableSort> = { product: "margin_asc", margin_asc: "margin_desc", margin_desc: "product", price_desc: "product" };

export function ProductChannelPricingTable({ channels, totals, onSelectPriceItem, onQueryChange }: ProductChannelPricingTableProps) {
  const [filterPill, setFilterPill] = useState<FilterPill>("all");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput.trim(), 300, { minLength: 2 });
  const [channelFilter, setChannelFilter] = useState("");
  const [sort, setSort] = useState<PriceTableSort>("product");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // a new search, filter or sort goes back to page 1
  useEffect(() => {
    setPage(1);
  }, [filterPill, channelFilter, search, sort]);

  const filterState = filterPill === "all" ? undefined : filterPill;
  useEffect(() => {
    onQueryChange?.({ q: search || undefined, accountId: channelFilter || undefined, state: filterState, sort });
  }, [onQueryChange, search, channelFilter, filterState, sort]);

  const query = usePriceTable({
    q: search || undefined,
    accountId: channelFilter || undefined,
    state: filterPill === "all" ? undefined : filterPill,
    sort,
    page,
    pageSize,
  });
  const data = query.data;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  const pill = (id: FilterPill, label: string, count: number | undefined) => (
    <button
      key={id}
      type="button"
      aria-pressed={filterPill === id}
      onClick={() => setFilterPill(id)}
      className={cn(
        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap",
        filterPill === id ? "bg-black text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
      )}
    >
      {label} <span className="ml-1 opacity-80 font-normal">{count === undefined ? "—" : formatNumber(count)}</span>
    </button>
  );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
      {/* Header & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
        <h3 className="text-base font-bold text-foreground">Product & channel pricing</h3>
        <span className="text-xs text-muted-foreground font-medium">
          {totals ? `${formatNumber(totals.productChannelPrices)} prices across ${formatNumber(totals.productsInView)} products · live listing prices` : "Live listing prices"}
        </span>
      </div>

      {/* Filter Row: Pills + Search + Dropdown */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {pill("all", "All prices", totals?.productChannelPrices)}
          {pill("below_target", "Below target", totals?.belowTargetCount)}
          {pill("proposed", "With proposals", totals?.withProposalCount)}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1 sm:w-60 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              aria-label="Search product or SKU"
              placeholder="Search product or SKU"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-8 w-full rounded-md border border-neutral-300 bg-white pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:border-black transition-colors"
            />
          </div>

          <div className="relative">
            <select
              aria-label="Channel"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="h-8 w-full sm:w-auto rounded-md border border-neutral-300 bg-white pl-2.5 pr-7 text-xs font-medium text-foreground focus:outline-none focus:border-black appearance-none cursor-pointer"
            >
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c.accountId} value={c.accountId}>
                  {c.channel}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground" />
          </div>
        </div>
      </div>

      {query.isLoading && (
        <div role="status" aria-label="Loading prices" className="space-y-2 border-t border-neutral-100 pt-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {query.isError && !data && (
        <div role="alert" className="flex flex-col items-center gap-2 border-t border-neutral-100 py-8 text-center text-xs text-muted-foreground">
          <p>Prices could not be loaded. {errorMessage(query.error)}</p>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {data && total === 0 && (
        <p className="border-t border-neutral-100 py-8 text-center text-xs text-muted-foreground">
          {search || channelFilter || filterPill !== "all"
            ? "No prices match these filters."
            : "No listings with a price yet. Publish a listing with a price to see it here."}
        </p>
      )}

      {/* Table */}
      {data && total > 0 && (
        <div className="overflow-x-auto border-t border-neutral-100 pt-2">
          <table className="w-full min-w-[760px] text-xs text-left">
            <thead>
              <tr className="border-b border-neutral-200 text-muted-foreground">
                <th className="pb-2.5 font-medium">Product / SKU</th>
                <th className="pb-2.5 font-medium">Channel</th>
                <th className="pb-2.5 font-medium">Current price</th>
                <th className="pb-2.5 font-medium">Unit cost</th>
                <th className="pb-2.5 font-medium">Channel fees</th>
                <th className="pb-2.5 font-medium">
                  <button type="button" onClick={() => setSort(NEXT_SORT[sort])} className="inline-flex items-center gap-1 font-medium cursor-pointer hover:text-foreground" aria-label="Sort by margin">
                    Est. margin
                    <ArrowUpDown className="h-3 w-3" aria-hidden />
                  </button>
                </th>
                <th className="pb-2.5 font-medium">Proposal state</th>
                <th className="pb-2.5 font-medium text-right w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((item) => (
                <tr
                  key={item.listingId}
                  onClick={() => onSelectPriceItem?.(item)}
                  className="hover:bg-neutral-50/70 transition-colors cursor-pointer group"
                >
                  <td className="py-3">
                    <p className="font-semibold text-foreground">{item.productTitle}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{item.sku}</p>
                  </td>
                  <td className="py-3 font-medium text-foreground">{item.channel}</td>
                  <td className="py-3 font-semibold text-foreground">
                    {formatINR(item.currentPriceMinor)}
                    {item.salePriceMinor != null && (
                      <p className="mt-0.5 text-[11px] font-medium text-emerald-700">
                        On sale {formatINR(item.salePriceMinor)}
                        {item.saleEndsAt ? ` until ${formatDate(item.saleEndsAt)}` : ""}
                      </p>
                    )}
                  </td>
                  <td className="py-3 text-muted-foreground">
                    {item.unitCostMinor === null ? (
                      <Link
                        to={`${ROUTES.PRODUCTS}/${item.productId}/variants`}
                        onClick={(e) => e.stopPropagation()}
                        title="No cost price set: add it on the product's variants"
                        className="font-medium text-foreground underline"
                      >
                        Set cost
                      </Link>
                    ) : (
                      <Link
                        to={`${ROUTES.PRODUCTS}/${item.productId}/variants`}
                        onClick={(e) => e.stopPropagation()}
                        title="Edit the cost price on the product's variants"
                        className="hover:text-foreground hover:underline"
                      >
                        {moneyText(item.unitCostMinor)}
                      </Link>
                    )}
                  </td>
                  <td className="py-3 text-muted-foreground" title={item.feesMinor === null ? "Channel fees are not configured" : undefined}>
                    {moneyText(item.feesMinor)}
                  </td>
                  <td className="py-3 font-semibold">
                    <span className={cn(item.belowTarget ? "text-amber-600 font-bold" : "text-foreground")}>{marginText(item.marginBps)}</span>
                  </td>
                  <td className="py-3">
                    {item.proposalState === "proposed" ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Proposed{item.proposedPriceMinor !== null ? ` · ${formatINR(item.proposedPriceMinor)}` : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
                        No proposal
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-foreground transition-colors ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && total > 0 && (
        <div className="pt-2 border-t border-neutral-100">
          <PricingPagination
            page={Math.min(page, pages)}
            pages={pages}
            total={total}
            pageSize={pageSize}
            shown={items.length}
            noun="prices"
            onPage={setPage}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            pageSizes={[10, 25, 50]}
          />
        </div>
      )}

      {/* Footnote */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-muted-foreground pt-1 border-t border-neutral-100">
        <p>Prices come from your listings. Margin = price - unit cost - channel fees; a dash means the cost price or fees are not set. Proposals are separate and unapplied.</p>
        <span className="font-medium text-foreground">Showing {items.length} of {formatNumber(total)} prices</span>
      </div>
    </div>
  );
}
