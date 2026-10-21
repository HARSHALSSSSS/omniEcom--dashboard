import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import {
  CONTENT_STATES,
  LISTING_SOURCES,
  LISTING_STATUSES,
  type ContentState,
  type ListingChannels,
  type ListingFilters as Filters,
  type ListingLifecycle,
  type ListingSort,
  type ListingSource,
} from "@/types/listing";
import { CONTENT_LABELS, LIFECYCLE_LABELS, SORT_OPTIONS, SOURCE_LABELS } from "./listingParams";

const SELECT = "h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground disabled:opacity-50";

interface ListingFiltersProps {
  filters: Filters;
  sort: ListingSort;
  channels: ListingChannels | undefined;
  /** the "Not listed" tab lists variants: it only has search, marketplace and account */
  variantsOnly: boolean;
  filtered: boolean;
  /** the one-product view keeps the API order */
  hideSort: boolean;
  onSearch: (q: string) => void;
  onMarketplace: (code: string | null) => void;
  onAccount: (id: string | null) => void;
  onStatus: (status: ListingLifecycle | null) => void;
  onContent: (state: ContentState | null) => void;
  onSource: (source: ListingSource | null) => void;
  onAttention: (on: boolean) => void;
  onSort: (sort: ListingSort) => void;
  onClear: () => void;
}

/** search, marketplace chips and the filter selects; every change goes to the URL */
export function ListingFilters({ filters, sort, channels, variantsOnly, filtered, hideSort, onSearch, onMarketplace, onAccount, onStatus, onContent, onSource, onAttention, onSort, onClear }: ListingFiltersProps) {
  const q = filters.q ?? "";
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => onSearch(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text, q, onSearch]);

  const known = channels?.marketplaces ?? [];
  // a code from a deep link that is not among the connected channels still shows (and can be cleared)
  const chips = filters.marketplace && !known.some((m) => m.code === filters.marketplace) ? [...known, { code: filters.marketplace, name: filters.marketplace }] : known;
  const accounts = (channels?.accounts ?? []).filter((a) => !filters.marketplace || a.marketplace === filters.marketplace);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search listings"
            placeholder={variantsOnly ? "Search by SKU, barcode or product title..." : "Search by SKU, marketplace ID or product title..."}
            value={text}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div role="group" aria-label="Marketplace" className="flex flex-wrap items-center gap-2">
          {[{ code: "", name: "All channels" }, ...chips].map((c) => {
            const active = c.code === "" ? !filters.marketplace : filters.marketplace === c.code;
            return (
              <button
                key={c.code || "all"}
                type="button"
                aria-pressed={active}
                onClick={() => onMarketplace(c.code || null)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {accounts.length > 1 && (
          <select aria-label="Account" className={SELECT} value={filters.accountId ?? ""} onChange={(e) => onAccount(e.target.value || null)}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </select>
        )}

        {!variantsOnly && (
          <>
            <select aria-label="Lifecycle status" className={SELECT} value={filters.status ?? ""} onChange={(e) => onStatus((e.target.value || null) as ListingLifecycle | null)}>
              <option value="">Any lifecycle status</option>
              {LISTING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LIFECYCLE_LABELS[s]}
                </option>
              ))}
            </select>

            <select aria-label="Content sync" className={SELECT} value={filters.contentState ?? ""} onChange={(e) => onContent((e.target.value || null) as ContentState | null)}>
              <option value="">Any content state</option>
              {CONTENT_STATES.map((s) => (
                <option key={s} value={s}>
                  {CONTENT_LABELS[s]}
                </option>
              ))}
            </select>

            <select aria-label="Source" className={SELECT} value={filters.source ?? ""} onChange={(e) => onSource((e.target.value || null) as ListingSource | null)}>
              <option value="">Any source</option>
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
                "h-9 rounded-lg px-3 text-xs font-medium transition-colors",
                filters.attention ? "bg-amber-100 text-amber-800" : "border border-border bg-card text-muted-foreground hover:bg-muted",
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

        {filtered && (
          <button type="button" onClick={onClear} className="h-9 rounded-lg px-2.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
