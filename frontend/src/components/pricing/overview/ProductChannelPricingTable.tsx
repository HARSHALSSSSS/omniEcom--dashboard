import { useState, useMemo, useEffect } from "react";
import { Search, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/utils/cn";
import { PricingPagination } from "@/components/pricing/PricingPagination";
import type { ProductChannelPriceItem } from "@/types/pricing";

interface ProductChannelPricingTableProps {
  items?: ProductChannelPriceItem[];
  onSelectPriceItem?: (item: ProductChannelPriceItem) => void;
}

const DEFAULT_PRICES: ProductChannelPriceItem[] = [
  {
    id: "pc1",
    productTitle: "Cotton Oversized T-Shirt",
    sku: "NL-CT-001",
    channel: "Shopify",
    marketplace: "shopify",
    currentPrice: 699,
    unitCost: 300,
    feesAndShipping: 70,
    estMarginPct: 47.1,
    proposalState: "none",
  },
  {
    id: "pc2",
    productTitle: "Cotton Oversized T-Shirt",
    sku: "NL-CT-001",
    channel: "Amazon",
    marketplace: "amazon",
    currentPrice: 649,
    unitCost: 300,
    feesAndShipping: 155,
    estMarginPct: 29.9,
    proposalState: "proposed",
    proposedPrice: 699,
  },
  {
    id: "pc3",
    productTitle: "Home Storage Set",
    sku: "NL-HS-024",
    channel: "Amazon",
    marketplace: "amazon",
    currentPrice: 899,
    unitCost: 480,
    feesAndShipping: 165,
    estMarginPct: 28.3,
    proposalState: "proposed",
    proposedPrice: 949,
  },
  {
    id: "pc4",
    productTitle: "Home Storage Set",
    sku: "NL-HS-024",
    channel: "Shopify",
    marketplace: "shopify",
    currentPrice: 899,
    unitCost: 480,
    feesAndShipping: 60,
    estMarginPct: 39.9,
    proposalState: "none",
  },
  {
    id: "pc5",
    productTitle: "Canvas Shoes",
    sku: "NL-CS-012",
    channel: "Flipkart",
    marketplace: "flipkart",
    currentPrice: 1599,
    unitCost: 850,
    feesAndShipping: 210,
    estMarginPct: 33.7,
    proposalState: "proposed",
    proposedPrice: 1649,
  },
  {
    id: "pc6",
    productTitle: "Leather Wallet",
    sku: "NL-LW-008",
    channel: "Shopify",
    marketplace: "shopify",
    currentPrice: 999,
    unitCost: 450,
    feesAndShipping: 80,
    estMarginPct: 46.9,
    proposalState: "none",
  },
];

type FilterPill = "all" | "below_target" | "with_proposals";

export function ProductChannelPricingTable({
  items = DEFAULT_PRICES,
  onSelectPriceItem,
}: ProductChannelPricingTableProps) {
  const [filterPill, setFilterPill] = useState<FilterPill>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const channels = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.channel)));
  }, [items]);

  // Reset pagination to page 1 on filter or search changes
  useEffect(() => {
    setPage(1);
  }, [filterPill, channelFilter, searchQuery]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Pill filter
      if (filterPill === "below_target" && item.estMarginPct >= 30) return false;
      if (filterPill === "with_proposals" && item.proposalState !== "proposed") return false;

      // Channel filter
      if (channelFilter !== "all" && item.channel.toLowerCase() !== channelFilter.toLowerCase()) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.productTitle.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          item.channel.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [items, filterPill, channelFilter, searchQuery]);

  const total = filteredItems.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, safePage, pageSize]);

  const belowTargetCount = items.filter((i) => i.estMarginPct < 30).length;
  const withProposalsCount = items.filter((i) => i.proposalState === "proposed").length;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
      {/* Header & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
        <h3 className="text-base font-bold text-foreground">Product & channel pricing</h3>
        <span className="text-xs text-muted-foreground font-medium">
          Illustrative records · {items.length} prices across {new Set(items.map(i => i.sku)).size} products
        </span>
      </div>

      {/* Filter Row: Pills + Search + Dropdown */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setFilterPill("all")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap",
              filterPill === "all"
                ? "bg-black text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            )}
          >
            All prices <span className="ml-1 opacity-80 font-normal">{items.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterPill("below_target")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap",
              filterPill === "below_target"
                ? "bg-black text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            )}
          >
            Below target <span className="ml-1 opacity-80 font-normal">{belowTargetCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterPill("with_proposals")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap",
              filterPill === "with_proposals"
                ? "bg-black text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            )}
          >
            With proposals <span className="ml-1 opacity-80 font-normal">{withProposalsCount}</span>
          </button>
        </div>

        {/* Search & Channel Dropdown */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-60">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search product or SKU"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-md border border-neutral-300 bg-white pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:border-black transition-colors"
            />
          </div>

          <div className="relative">
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="h-8 rounded-md border border-neutral-300 bg-white pl-2.5 pr-7 text-xs font-medium text-foreground focus:outline-none focus:border-black appearance-none cursor-pointer"
            >
              <option value="all">All channels</option>
              {channels.map((c) => (
                <option key={c} value={c.toLowerCase()}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border-t border-neutral-100 pt-2">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-neutral-200 text-muted-foreground">
              <th className="pb-2.5 font-medium">Product / SKU</th>
              <th className="pb-2.5 font-medium">Channel</th>
              <th className="pb-2.5 font-medium">Current price</th>
              <th className="pb-2.5 font-medium">Unit cost</th>
              <th className="pb-2.5 font-medium">Fees + shipping</th>
              <th className="pb-2.5 font-medium">Est. margin</th>
              <th className="pb-2.5 font-medium">Proposal state</th>
              <th className="pb-2.5 font-medium text-right w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {paginatedItems.map((item) => {
              const isBelowTarget = item.estMarginPct < 30;
              return (
                <tr
                  key={item.id}
                  onClick={() => onSelectPriceItem?.(item)}
                  className="hover:bg-neutral-50/70 transition-colors cursor-pointer group"
                >
                  <td className="py-3">
                    <p className="font-semibold text-foreground">{item.productTitle}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{item.sku}</p>
                  </td>
                  <td className="py-3 font-medium text-foreground">{item.channel}</td>
                  <td className="py-3 font-semibold text-foreground">
                    ₹{item.currentPrice.toLocaleString()}
                  </td>
                  <td className="py-3 text-muted-foreground">
                    ₹{item.unitCost.toLocaleString()}
                  </td>
                  <td className="py-3 text-muted-foreground">
                    ₹{item.feesAndShipping.toLocaleString()}
                  </td>
                  <td className="py-3 font-semibold">
                    <span
                      className={cn(
                        isBelowTarget ? "text-amber-600 font-bold" : "text-foreground"
                      )}
                    >
                      {item.estMarginPct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3">
                    {item.proposalState === "proposed" ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Proposed
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
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="pt-2 border-t border-neutral-100">
          <PricingPagination
            page={safePage}
            pages={pages}
            total={total}
            pageSize={pageSize}
            shown={paginatedItems.length}
            noun="prices"
            onPage={setPage}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            pageSizes={[5, 10, 25, 50]}
          />
        </div>
      )}

      {/* Footnote */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-muted-foreground pt-1 border-t border-neutral-100">
        <p>Current prices are example values, not live listings. Proposals are separate and unapplied.</p>
        <span className="font-medium text-foreground">Showing {paginatedItems.length} of {filteredItems.length} prices</span>
      </div>
    </div>
  );
}
