import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/utils/cn";
import {
  CONTENT_STATES,
  INVENTORY_FILTERS,
  LISTING_SOURCES,
  LISTING_STATUSES,
  POTENTIALS,
  PRODUCT_STATUSES,
  READINESS_BANDS,
  type ContentState,
  type InventoryFilter,
  type ListingChannels,
  type ListingFilterOptions,
  type ListingFilters as Filters,
  type ListingLifecycle,
  type ListingSort,
  type ListingSource,
  type Potential,
  type ProductStatus,
  type ReadinessBand,
} from "@/types/listing";
import { CONTENT_LABELS, INVENTORY_LABELS, LIFECYCLE_LABELS, POTENTIAL_HINTS, POTENTIAL_LABELS, PRODUCT_STATUS_LABELS, READINESS_LABELS, SORT_OPTIONS, SOURCE_LABELS } from "./listingParams";

const SELECT = "h-[34px] cursor-pointer appearance-none rounded-lg border border-[#BDBDBD] bg-white px-2.5 pr-6 text-[12px] font-medium text-[#000000] focus:outline-none disabled:opacity-50";

interface ListingFiltersProps {
  filters: Filters;
  sort: ListingSort;
  channels: ListingChannels | undefined;
  /** the "Not listed" tab lists variants: it only has search, marketplace and account */
  variantsOnly: boolean;
  /** the one-product view keeps the API order */
  hideSort: boolean;
  /** the one-product view has no catalogue-wide filters (category, readiness, inventory, potential, product status) */
  hideCatalogFilters: boolean;
  /** the categories that have listings */
  filterOptions: ListingFilterOptions | undefined;
  onSearch: (q: string) => void;
  onCategory: (id: string | null) => void;
  onReadiness: (band: ReadinessBand | null) => void;
  onInventory: (inventory: InventoryFilter | null) => void;
  onPotential: (potential: Potential | null) => void;
  onProductStatus: (status: ProductStatus | null) => void;
  onMarketplace: (code: string | null) => void;
  onAccount: (id: string | null) => void;
  onStatus: (status: ListingLifecycle | null) => void;
  onContent: (state: ContentState | null) => void;
  onSource: (source: ListingSource | null) => void;
  onAttention: (on: boolean) => void;
  onSort: (sort: ListingSort) => void;
  onClear: () => void;
}

/** the search box (Ctrl or Cmd + K focuses it) and the filter selects; every change goes to the URL */
export function ListingFilters({
  filters,
  sort,
  channels,
  variantsOnly,
  hideSort,
  hideCatalogFilters,
  filterOptions,
  onSearch,
  onCategory,
  onReadiness,
  onInventory,
  onPotential,
  onProductStatus,
  onMarketplace,
  onAccount,
  onStatus,
  onContent,
  onSource,
  onAttention,
  onSort,
  onClear,
}: ListingFiltersProps) {
  const q = filters.q ?? "";
  const [text, setText] = useState(q);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, onSearch]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const known = channels?.marketplaces ?? [];
  // a code from a deep link that is not among the connected channels still shows (and can be cleared)
  const options = filters.marketplace && !known.some((m) => m.code === filters.marketplace) ? [...known, { code: filters.marketplace, name: filters.marketplace === "social" ? "Social Commerce" : filters.marketplace }] : known;
  const accounts = (channels?.accounts ?? []).filter((a) => !filters.marketplace || a.marketplace === filters.marketplace);

  return (
    <div className="flex w-full flex-row flex-wrap items-center gap-2">
      <div className="relative flex h-[34px] w-[280px] items-center gap-2 rounded-lg bg-[#F5F5F5] px-2.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-[#666666]" aria-hidden />
        <input
          ref={input}
          type="search"
          aria-label="Search listings"
          placeholder={variantsOnly ? "Search by product, SKU or barcode…" : "Search by product, SKU or listing…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full border-none bg-transparent text-[12px] text-[#000000] placeholder-[#666666] focus:outline-none"
        />
        <span className="shrink-0 select-none text-[11px] font-normal text-[#666666]" aria-hidden>
          ⌘ K
        </span>
      </div>

      <select aria-label="Marketplace filter" className={SELECT} value={filters.marketplace ?? ""} onChange={(e) => onMarketplace(e.target.value || null)}>
        <option value="">Marketplace ⌄</option>
        {options.map((m) => (
          <option key={m.code} value={m.code}>
            {m.name}
          </option>
        ))}
      </select>

      {accounts.length > 1 && (
        <select aria-label="Account" className={SELECT} value={filters.accountId ?? ""} onChange={(e) => onAccount(e.target.value || null)}>
          <option value="">Account ⌄</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.displayName}
            </option>
          ))}
        </select>
      )}

      {!hideCatalogFilters && (
        <select aria-label="Category" className={SELECT} value={filters.categoryId ?? ""} onChange={(e) => onCategory(e.target.value || null)}>
          <option value="">Category ⌄</option>
          {/* a category from a deep link that has no listings still shows (and can be cleared) */}
          {filters.categoryId && !(filterOptions?.categories ?? []).some((c) => c.id === filters.categoryId) && <option value={filters.categoryId}>Selected category</option>}
          {(filterOptions?.categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {!variantsOnly && (
        <>
          {!hideCatalogFilters && (
            <>
              <select aria-label="Listing readiness" className={SELECT} value={filters.readiness ?? ""} onChange={(e) => onReadiness((e.target.value || null) as ReadinessBand | null)}>
                <option value="">Listing readiness ⌄</option>
                {READINESS_BANDS.map((b) => (
                  <option key={b} value={b}>
                    {READINESS_LABELS[b]}
                  </option>
                ))}
              </select>

              <select aria-label="Inventory" className={SELECT} value={filters.inventory ?? ""} onChange={(e) => onInventory((e.target.value || null) as InventoryFilter | null)}>
                <option value="">Inventory ⌄</option>
                {INVENTORY_FILTERS.map((i) => (
                  <option key={i} value={i}>
                    {INVENTORY_LABELS[i]}
                  </option>
                ))}
              </select>

              <select aria-label="Product status" className={SELECT} value={filters.productStatus ?? ""} onChange={(e) => onProductStatus((e.target.value || null) as ProductStatus | null)}>
                <option value="">Product status ⌄</option>
                {PRODUCT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PRODUCT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>

              <select
                aria-label="Potential"
                className={SELECT}
                value={filters.potential ?? ""}
                title={filters.potential ? POTENTIAL_HINTS[filters.potential] : "High velocity: sold 5+ units in 30 days. Missing channel: could still be listed on a connected account."}
                onChange={(e) => onPotential((e.target.value || null) as Potential | null)}
              >
                <option value="">Potential ⌄</option>
                {POTENTIALS.map((p) => (
                  <option key={p} value={p} title={POTENTIAL_HINTS[p]}>
                    {POTENTIAL_LABELS[p]}
                  </option>
                ))}
              </select>
            </>
          )}

          <select aria-label="Lifecycle status" className={SELECT} value={filters.status ?? ""} onChange={(e) => onStatus((e.target.value || null) as ListingLifecycle | null)}>
            <option value="">Listing status ⌄</option>
            {LISTING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LIFECYCLE_LABELS[s]}
              </option>
            ))}
          </select>

          <select aria-label="Content sync" className={SELECT} value={filters.contentState ?? ""} onChange={(e) => onContent((e.target.value || null) as ContentState | null)}>
            <option value="">Content sync ⌄</option>
            {CONTENT_STATES.map((s) => (
              <option key={s} value={s}>
                {CONTENT_LABELS[s]}
              </option>
            ))}
          </select>

          <select aria-label="Source" className={SELECT} value={filters.source ?? ""} onChange={(e) => onSource((e.target.value || null) as ListingSource | null)}>
            <option value="">Source ⌄</option>
            {LISTING_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>

          <button
            type="button"
            aria-pressed={Boolean(filters.attention)}
            onClick={() => onAttention(!filters.attention)}
            title="Needs review, failed and blocked listings"
            className={cn(
              "h-[34px] cursor-pointer rounded-lg border px-2.5 text-[12px] font-medium transition-colors",
              filters.attention ? "border-[#D97706] bg-[#FEF3C7] text-[#92400E]" : "border-[#BDBDBD] bg-white text-[#000000] hover:bg-neutral-50",
            )}
          >
            Needs attention only
          </button>

          {!hideSort && (
            <select aria-label="Sort listings" className={SELECT} value={sort} onChange={(e) => onSort(e.target.value as ListingSort)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onClear}
        className="h-[34px] cursor-pointer rounded-lg border border-[#BDBDBD] bg-white px-2.5 text-[12px] font-medium text-[#000000] transition-colors hover:bg-neutral-50"
      >
        Reset filters
      </button>
    </div>
  );
}
