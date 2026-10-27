import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { MARGIN_STATUSES, PRODUCT_SORTS, RANGE_PRESETS, type DateRange, type ProductQuery, type ProductSort, type ProfitView, type RangePreset, type SpendQuery, type StatusFilter, type WaterfallQuery } from "@/types/profitability";
import { preferredPageSize } from "@/lib/preferences";
import { isRealDay, isoDay, presetRange, rangeProblem } from "./profitFormat";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** the spend filter value for rows that belong to no marketplace account */
export const NO_ACCOUNT = "none";

export interface ProfitUrlState {
  view: ProfitView;
  preset: RangePreset;
  /** the range the page works with; null while a custom range is incomplete or invalid */
  range: DateRange | null;
  /** why `range` is null */
  rangeError: string | null;
  /** the dates typed for a custom range (empty for a preset), valid or not */
  customFrom: string;
  customTo: string;
  compare: boolean;
  account?: string;
  q?: string;
  page: number;
  pageSize: number;
  /** the product table: search, marketplace, margin bucket, sort and page (their own parameters, so the spend filters stay apart) */
  productQ?: string;
  productMarketplace?: string;
  productStatus?: StatusFilter;
  productSort: ProductSort;
  productPage: number;
}

export function readUrlState(params: URLSearchParams, today: string = isoDay(new Date())): ProfitUrlState {
  const raw = params.get("range");
  const preset: RangePreset = (RANGE_PRESETS as readonly string[]).includes(raw ?? "") ? (raw as RangePreset) : "30d";
  let range: DateRange | null;
  let rangeError: string | null = null;
  if (preset === "custom") {
    const from = params.get("from") ?? undefined;
    const to = params.get("to") ?? undefined;
    rangeError = rangeProblem(from, to);
    range = rangeError === null && isRealDay(from) && isRealDay(to) ? { from, to } : null;
  } else {
    range = presetRange(preset, today);
  }
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  const account = params.get("account");
  return {
    view: params.get("view") === "spend" ? "spend" : "waterfall",
    preset,
    range,
    rangeError,
    customFrom: preset === "custom" ? (params.get("from") ?? "") : "",
    customTo: preset === "custom" ? (params.get("to") ?? "") : "",
    compare: params.get("compare") !== "off",
    account: account === NO_ACCOUNT || (account && UUID.test(account)) ? (account as string) : undefined,
    q: params.get("q")?.trim() || undefined,
    page: Number.isInteger(page) && page > 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : preferredPageSize(PAGE_SIZES, DEFAULT_PAGE_SIZE),
    productQ: params.get("pq")?.trim() || undefined,
    productMarketplace: params.get("mk")?.trim() || undefined,
    productStatus: ([...MARGIN_STATUSES, "unknown"] as readonly string[]).includes(params.get("ms") ?? "") ? (params.get("ms") as StatusFilter) : undefined,
    productSort: (PRODUCT_SORTS as readonly string[]).includes(params.get("ps") ?? "") ? (params.get("ps") as ProductSort) : "revenue",
    productPage: Number.isInteger(Number(params.get("pg"))) && Number(params.get("pg")) > 1 ? Number(params.get("pg")) : 1,
  };
}

export const waterfallQueryOf = (s: ProfitUrlState): WaterfallQuery | null => (s.range ? { ...s.range, compare: s.compare } : null);

export const PRODUCT_PAGE_SIZE = 10;

export const productQueryOf = (s: ProfitUrlState): ProductQuery | null =>
  s.range ? { ...s.range, marketplace: s.productMarketplace, q: s.productQ, status: s.productStatus, sort: s.productSort, page: s.productPage, pageSize: PRODUCT_PAGE_SIZE } : null;

export const isProductFiltered = (s: ProfitUrlState): boolean => Boolean(s.productQ || s.productMarketplace || s.productStatus);

export const spendQueryOf = (s: ProfitUrlState): SpendQuery | null =>
  s.range ? { from: s.range.from, to: s.range.to, account: s.account, q: s.q, page: s.page, pageSize: s.pageSize } : null;

export const isSpendFiltered = (s: ProfitUrlState): boolean => Boolean(s.q || s.account);

type Key = "view" | "range" | "from" | "to" | "compare" | "account" | "q" | "page" | "size" | "pq" | "mk" | "ms" | "ps" | "pg";
type Patch = Partial<Record<Key, string | null>>;

/** The screen keeps the date range, comparison, tab, spend filters and page in the URL, so reload, back and shared links work. */
export function useProfitUrlState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readUrlState(params), [params]);

  /** any filter, range or tab change goes back to page 1; `replace` keeps typing out of the history */
  const update = useCallback(
    (patch: Patch, opts: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!("page" in patch)) next.delete("page");
          // a new filter, sort or range starts the product table on its first page again
          if (!("pg" in patch)) next.delete("pg");
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key);
            if (value !== null && value !== undefined && value !== "") next.set(key, value);
          }
          // the default range and view carry no parameter; `from`/`to` only mean something for a custom range
          if (next.get("range") === "30d") next.delete("range");
          if (next.get("view") === "waterfall") next.delete("view");
          if (next.get("range") !== "custom") {
            next.delete("from");
            next.delete("to");
          }
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  const clearFilters = useCallback(() => update({ q: null, account: null }), [update]);
  const clearProductFilters = useCallback(() => update({ pq: null, mk: null, ms: null }), [update]);

  return { ...state, update, clearFilters, clearProductFilters };
}
