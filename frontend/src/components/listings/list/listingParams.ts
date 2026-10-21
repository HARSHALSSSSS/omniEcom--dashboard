import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CONTENT_STATES,
  LISTING_SORTS,
  LISTING_SOURCES,
  LISTING_STATUSES,
  LISTING_TABS,
  type ContentState,
  type ListingFilters,
  type ListingSort,
  type ListingSource,
  type ListingTab,
  type ListingsQuery,
  type ListingLifecycle,
  type ScreenStatus,
} from "@/types/listing";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_SORT: ListingSort = "-updatedAt";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARKETPLACE_CODE = /^[a-z0-9_]{1,40}$/;

export const TAB_LABELS: Record<ListingTab, string> = {
  all: "Total listings",
  live: "Live / Active",
  ready: "Ready",
  needs_review: "Needs review",
  syncing: "Syncing",
  failed: "Failed / Errors",
  blocked: "Blocked",
  not_listed: "Not listed",
};

export const SCREEN_STATUS_LABELS: Record<ScreenStatus, string> = {
  live: "Live",
  ready: "Ready",
  needs_review: "Needs review",
  syncing: "Syncing",
  failed: "Failed",
  blocked: "Blocked",
};

export const LIFECYCLE_LABELS: Record<ListingLifecycle, string> = {
  draft: "Draft",
  ready: "Ready",
  approved: "Approved",
  pending: "Pending at marketplace",
  active: "Active",
  rejected: "Rejected",
  correction_required: "Correction required",
  unpublished: "Unpublished",
};

export const CONTENT_LABELS: Record<ContentState, string> = {
  synced: "In sync",
  sync_pending: "Update queued",
  needs_review: "Needs review",
  needs_republish: "Needs republish",
  failed: "Update failed",
};

export const SOURCE_LABELS: Record<ListingSource, string> = { created: "Created here", imported: "Imported" };

export const SORT_OPTIONS: ReadonlyArray<{ id: ListingSort; label: string }> = [
  { id: "-updatedAt", label: "Recently updated" },
  { id: "updatedAt", label: "Least recently updated" },
  { id: "title", label: "Title A to Z" },
  { id: "-title", label: "Title Z to A" },
  { id: "sku", label: "SKU A to Z" },
  { id: "-sku", label: "SKU Z to A" },
  { id: "-price", label: "Price high to low" },
  { id: "price", label: "Price low to high" },
  { id: "status", label: "Status A to Z" },
];

export interface ListingsUrlState {
  filters: ListingFilters;
  sort: ListingSort;
  page: number;
  pageSize: number;
}

const oneOf = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined => allowed.find((a) => a === value);

/** deep links from the API use `filter[...]` names (`/listings?filter[contentState]=failed`); the page's own names win */
const ALIASES = {
  tab: ["tab", "filter[screenStatus]"],
  marketplace: ["marketplace", "filter[marketplace]"],
  account: ["account", "accountId", "filter[accountId]"],
  status: ["status", "filter[status]"],
  content: ["content", "filter[contentState]"],
  source: ["source", "filter[source]"],
  attention: ["attention", "filter[attention]"],
} as const;
type Key = keyof typeof ALIASES;

const read = (params: URLSearchParams, key: Key): string | null => {
  for (const name of ALIASES[key]) {
    const value = params.get(name);
    if (value) return value;
  }
  return null;
};

/** `status=attention` and `status=needs_fix` are the API's wording for "needs attention" */
const ATTENTION_STATUS = ["attention", "needs_fix"];

export function readUrlState(params: URLSearchParams): ListingsUrlState {
  const rawStatus = read(params, "status");
  const attention = read(params, "attention") === "true" || (rawStatus !== null && ATTENTION_STATUS.includes(rawStatus));
  const marketplace = read(params, "marketplace") ?? "";
  const account = read(params, "account") ?? "";
  const product = params.get("productId") ?? "";
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  return {
    filters: {
      tab: oneOf(read(params, "tab"), LISTING_TABS) ?? "all",
      q: params.get("q")?.trim() || undefined,
      marketplace: MARKETPLACE_CODE.test(marketplace) ? marketplace : undefined,
      accountId: UUID.test(account) ? account : undefined,
      status: oneOf(rawStatus, LISTING_STATUSES),
      contentState: oneOf(read(params, "content"), CONTENT_STATES),
      source: oneOf(read(params, "source"), LISTING_SOURCES),
      attention: attention || undefined,
      productId: UUID.test(product) ? product : undefined,
    },
    sort: oneOf(params.get("sort"), LISTING_SORTS) ?? DEFAULT_SORT,
    page: Number.isInteger(page) && page > 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
  };
}

export const queryOf = (s: ListingsUrlState): ListingsQuery => ({ ...s.filters, sort: s.sort, page: s.page, pageSize: s.pageSize });

/** true when something narrows the list beyond the tab (the tab itself has its own highlight) */
export const isFiltered = (f: ListingFilters): boolean =>
  Boolean(f.q || f.marketplace || f.accountId || f.status || f.contentState || f.source || f.attention || f.productId || f.tab !== "all");

type Patch = Partial<Record<Key | "q" | "sort" | "page" | "size" | "productId", string | null>>;

/** The Listings screen keeps tab, search, filters, sort, page and size in the URL, so reload, back and deep links work. */
export function useListingsUrlState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readUrlState(params), [params]);

  /** a filter, sort or tab change goes back to page 1; `replace` keeps typing out of the history */
  const update = useCallback(
    (patch: Patch, opts: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!("page" in patch)) next.delete("page");
          for (const [key, value] of Object.entries(patch)) {
            const names: readonly string[] = key in ALIASES ? ALIASES[key as Key] : [key];
            for (const name of names) next.delete(name);
            // a deep link's `status=attention` is the attention flag too
            if (key === "attention") for (const name of ALIASES.status) if (ATTENTION_STATUS.includes(next.get(name) ?? "")) next.delete(name);
            if (value !== null && value !== undefined && value !== "" && !(key === "tab" && value === "all")) next.set(key, value);
          }
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  const clearFilters = useCallback(
    () => update({ q: null, tab: null, marketplace: null, account: null, status: null, content: null, source: null, attention: null, productId: null }),
    [update],
  );

  return { ...state, update, clearFilters };
}
