import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  CatalogFilters,
  CatalogInventoryStatus,
  CatalogProductStatus,
  CatalogProductType,
  SavedView,
} from "@/types/product";

export type CatalogTab = "all" | "active" | "draft" | "archived" | "attention";

export const TABS: ReadonlyArray<{ id: CatalogTab; label: string }> = [
  { id: "all", label: "All products" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Draft" },
  { id: "archived", label: "Archived" },
  { id: "attention", label: "Needs attention" },
];

export const INVENTORY_OPTIONS: ReadonlyArray<{ id: CatalogInventoryStatus; label: string }> = [
  { id: "healthy", label: "Healthy" },
  { id: "low", label: "Low stock" },
  { id: "out", label: "Out of stock" },
];

export const TYPE_OPTIONS: ReadonlyArray<{ id: CatalogProductType; label: string }> = [
  { id: "physical", label: "Physical" },
  { id: "digital", label: "Digital" },
  { id: "service", label: "Service" },
];

/** `sort` values the API understands (a leading "-" is descending); "" is its default, newest update first */
export const SORT_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "", label: "Last updated" },
  { id: "updatedAt", label: "Oldest updated" },
  { id: "title", label: "Product name A-Z" },
  { id: "-title", label: "Product name Z-A" },
  { id: "inventory", label: "Inventory low to high" },
  { id: "-inventory", label: "Inventory high to low" },
  { id: "sku", label: "SKU A-Z" },
  { id: "-sku", label: "SKU Z-A" },
];

export const PAGE_SIZES = [12, 24, 48] as const;
export const DEFAULT_PAGE_SIZE = 24;

const oneOf = <T extends string>(value: string | null | undefined, allowed: ReadonlyArray<{ id: T }>): T | undefined =>
  allowed.find((o) => o.id === value)?.id;

const STATUS_OF_TAB: Partial<Record<CatalogTab, CatalogProductStatus>> = { active: "active", draft: "draft", archived: "archived" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CatalogUrlState {
  tab: CatalogTab;
  filters: CatalogFilters;
  sort: string;
  page: number;
  pageSize: number;
}

export function readUrlState(params: URLSearchParams): CatalogUrlState {
  const tab = oneOf(params.get("tab"), TABS) ?? "all";
  const category = params.get("category");
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  const filters: CatalogFilters = {
    q: params.get("q")?.trim() || undefined,
    status: STATUS_OF_TAB[tab],
    needsAttention: tab === "attention" ? true : undefined,
    categoryId: category && UUID.test(category) ? category : undefined,
    channel: params.get("channel") || undefined,
    inventory: oneOf(params.get("inventory"), INVENTORY_OPTIONS),
    productType: oneOf(params.get("type"), TYPE_OPTIONS),
  };
  const sort = SORT_OPTIONS.some((o) => o.id === params.get("sort")) ? (params.get("sort") ?? "") : "";
  return {
    tab,
    filters,
    sort,
    page: Number.isInteger(page) && page > 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
  };
}

/** what a saved view stores: the filters (tab included) and nothing about paging */
export function viewFiltersOf(filters: CatalogFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") out[key] = value;
  return out;
}

type Patch = Partial<Record<"tab" | "q" | "category" | "channel" | "inventory" | "type" | "sort" | "page" | "size", string | null>>;

/** URL parameters for a saved view's filters and sort (unknown or stale values are dropped) */
export function paramsOfView(view: Pick<SavedView, "filters" | "sort">): Patch {
  const f = view.filters;
  const text = (key: string) => (typeof f[key] === "string" ? (f[key] as string) : null);
  const status = oneOf(text("status"), [{ id: "active" }, { id: "draft" }, { id: "archived" }] as const);
  return {
    tab: f.needsAttention === true ? "attention" : (status ?? null),
    q: text("q"),
    category: text("categoryId"),
    channel: text("channel"),
    inventory: text("inventory"),
    type: text("productType"),
    sort: view.sort ?? null,
    page: null,
    size: null,
  };
}

/** The Products list keeps tab, search, filters, sort and page in the URL, so reload and back behave. */
export function useCatalogUrlState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readUrlState(params), [params]);

  /** a filter, sort or tab change goes back to page 1; `replace` keeps typing out of the history */
  const update = useCallback(
    (patch: Patch, opts: { replace?: boolean; keepPage?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!opts.keepPage && !("page" in patch)) next.delete("page");
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === undefined || value === "" || (key === "tab" && value === "all")) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  const clearFilters = useCallback(
    () => update({ q: null, category: null, channel: null, inventory: null, type: null }),
    [update],
  );

  return { ...state, update, clearFilters, search: params.toString() };
}
