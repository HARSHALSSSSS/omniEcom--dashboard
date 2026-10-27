import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { preferredPageSize } from "@/lib/preferences";
import { INTEL_ACTIONS, INTEL_SORTS, type IntelAction, type IntelSort, type ProductIntelligenceQuery } from "@/types/intelligence";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_SORT: IntelSort = "priority";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const oneOf = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined => allowed.find((a) => a === value);
const uuid = (value: string | null): string | undefined => (value && UUID.test(value) ? value : undefined);

export type IntelTab = "overview" | "all" | "watchlist";

export interface IntelUrlState {
  tab: IntelTab;
  query: ProductIntelligenceQuery;
  /** the variant whose drawer is open */
  open: string | undefined;
}

export function readUrlState(params: URLSearchParams): IntelUrlState {
  const size = Number(params.get("size"));
  const page = Number(params.get("page"));
  const hasCatalogParams = Boolean(
    params.get("action") ||
    params.get("category") ||
    params.get("warehouse") ||
    params.get("q") ||
    params.get("open") ||
    params.get("sort") ||
    (Number.isInteger(page) && page > 1) ||
    ((PAGE_SIZES as readonly number[]).includes(size) && size !== preferredPageSize(PAGE_SIZES, DEFAULT_PAGE_SIZE))
  );
  const tab = oneOf<IntelTab>(params.get("tab"), ["overview", "all", "watchlist"]) ?? (hasCatalogParams ? "all" : "overview");
  return {
    tab,
    query: {
      action: oneOf<IntelAction>(params.get("action"), INTEL_ACTIONS),
      categoryId: uuid(params.get("category")),
      warehouseId: uuid(params.get("warehouse")),
      q: params.get("q")?.trim() || undefined,
      sort: oneOf<IntelSort>(params.get("sort"), INTEL_SORTS) ?? DEFAULT_SORT,
      page: Number.isInteger(page) && page > 1 ? page : 1,
      pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : preferredPageSize(PAGE_SIZES, DEFAULT_PAGE_SIZE),
    },
    open: uuid(params.get("open")),
  };
}

/** anything narrowing the list beyond the action pills and the sort */
export const intelFiltered = (q: ProductIntelligenceQuery): boolean => Boolean(q.action || q.categoryId || q.warehouseId || q.q);

type Patch = Partial<Record<"tab" | "action" | "category" | "warehouse" | "q" | "sort" | "page" | "size" | "open", string | null>>;

/** the screen keeps action, search, filters, sort, page and the open drawer in the URL, so reload, back and deep links work */
export function useIntelUrlState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readUrlState(params), [params]);

  /** a filter or sort change goes back to page 1 (opening a drawer does not); `replace` keeps typing out of the history */
  const update = useCallback(
    (patch: Patch, opts: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const onlyDrawer = Object.keys(patch).every((k) => k === "open");
          if (!("page" in patch) && !onlyDrawer) next.delete("page");
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key);
            if (value !== null && value !== undefined && value !== "") {
              next.set(key, value);
            }
          }
          if (
            next.has("action") ||
            next.has("category") ||
            next.has("warehouse") ||
            next.has("q") ||
            next.has("open") ||
            next.has("sort") ||
            next.has("page") ||
            next.has("size")
          ) {
            next.delete("tab");
          }
          if (next.get("tab") === "overview") {
            next.delete("tab");
          }
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  const clearFilters = useCallback(() => update({ action: null, category: null, warehouse: null, q: null }), [update]);

  return { ...state, update, clearFilters };
}
