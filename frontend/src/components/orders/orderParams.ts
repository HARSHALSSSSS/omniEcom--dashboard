import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ORDER_SORTS,
  ORDER_STATUSES,
  ORDER_TABS,
  PAYMENT_FILTERS,
  SLA_STATES,
  type LedgerQuery,
  type OrderFilters,
  type OrderSort,
  type OrderTab,
  type PaymentFilter,
  type SlaState,
} from "@/types/orders";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export const TAB_LABELS: Record<OrderTab, string> = {
  all: "All orders",
  needs_attention: "Needs attention",
  new: "New",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  returns_disputes: "Returns & disputes",
};

export const SORT_OPTIONS: ReadonlyArray<{ id: OrderSort; label: string }> = [
  { id: "-placedAt", label: "Newest first" },
  { id: "placedAt", label: "Oldest first" },
  { id: "-value", label: "Value high to low" },
  { id: "value", label: "Value low to high" },
  { id: "sla", label: "Most urgent SLA" },
  { id: "-sla", label: "Least urgent SLA" },
];

export const PAYMENT_LABELS: Record<PaymentFilter, string> = { prepaid: "Prepaid", cod: "Cash on delivery" };

export const SLA_LABELS: Record<SlaState, string> = {
  safe: "On track",
  approaching: "Approaching",
  at_risk: "At risk",
  breached: "Breached",
  none: "No SLA",
};

/** the SLA bands a seller can filter by ("none" is every order that has no dispatch deadline) */
export const SLA_FILTER_OPTIONS: ReadonlyArray<SlaState> = ["safe", "approaching", "at_risk", "breached"];

export interface OrdersUrlState {
  tab: OrderTab;
  filters: OrderFilters;
  sort: OrderSort;
  page: number;
  pageSize: number;
  /** order id of the open drawer (`?drawer=order:<id>`) */
  drawerId: string | null;
}

const oneOf = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined => allowed.find((a) => a === value);

/** a comma list in the URL to the values the API knows (unknown ones are dropped) */
const listOf = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T[] | undefined => {
  const out = (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .flatMap((v) => allowed.filter((a) => a === v));
  return out.length ? [...new Set(out)] : undefined;
};

/** deep links from the API use `filter[...]` names (`/orders?filter[slaState]=at_risk`); the page's own names win */
const ALIASES = {
  marketplace: ["marketplace", "filter[marketplace]"],
  status: ["status", "filter[status]"],
  sla: ["sla", "slaState", "filter[sla]", "filter[slaState]"],
  payment: ["payment", "filter[payment]"],
  tab: ["tab", "filter[tab]"],
} as const;
type Key = keyof typeof ALIASES;

const read = (params: URLSearchParams, key: Key): string | null => {
  for (const name of ALIASES[key]) {
    const value = params.get(name);
    if (value) return value;
  }
  return null;
};

const MARKETPLACE_CODE = /^[a-z0-9_]{1,40}$/;

export function readUrlState(params: URLSearchParams): OrdersUrlState {
  const attention = params.get("attention") === "true";
  const tab = oneOf(read(params, "tab"), ORDER_TABS) ?? (attention ? "needs_attention" : "all");
  const marketplace = (read(params, "marketplace") ?? "").split(",").filter((c) => MARKETPLACE_CODE.test(c));
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  const drawer = params.get("drawer") ?? "";
  return {
    tab,
    filters: {
      q: params.get("q")?.trim() || undefined,
      tab: tab === "all" ? undefined : tab,
      marketplace: marketplace.length ? marketplace : undefined,
      status: listOf(read(params, "status"), ORDER_STATUSES),
      slaState: listOf(read(params, "sla"), SLA_STATES),
      payment: oneOf(read(params, "payment"), PAYMENT_FILTERS),
    },
    sort: oneOf(params.get("sort"), ORDER_SORTS) ?? "-placedAt",
    page: Number.isInteger(page) && page > 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    drawerId: drawer.startsWith("order:") && drawer.length > 6 ? drawer.slice(6) : null,
  };
}

export const ledgerQueryOf = (s: OrdersUrlState): LedgerQuery => ({ ...s.filters, sort: s.sort, page: s.page, pageSize: s.pageSize });

/** true when something narrows the list beyond "all orders" */
export const isFiltered = (f: OrderFilters): boolean =>
  Boolean(f.q || f.tab || f.marketplace?.length || f.status?.length || f.slaState?.length || f.payment);

type Patch = Partial<Record<Key | "q" | "sort" | "page" | "size" | "drawer" | "attention", string | null>>;

/** The Orders screen keeps tab, search, filters, sort, page and the open drawer in the URL, so reload, back and deep links work. */
export function useOrdersUrlState() {
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
            const names: readonly string[] = key in ALIASES ? ALIASES[key as Key] : [key];
            for (const name of names) next.delete(name);
            if (key === "tab") next.delete("attention");
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
    () => update({ q: null, tab: null, marketplace: null, status: null, sla: null, payment: null, attention: null }),
    [update],
  );

  return { ...state, update, clearFilters };
}
