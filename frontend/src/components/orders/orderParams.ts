import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ATTENTION_KEYS,
  DATE_FILTERS,
  FULFILLMENT_FILTERS,
  ORDER_SORTS,
  ORDER_STATUSES,
  ORDER_TABS,
  PAYMENT_FILTERS,
  SLA_STATES,
  type AttentionKey,
  type DateFilter,
  type FulfillmentFilter,
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
  all: "All Orders",
  needs_attention: "Needs Attention",
  new: "New",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  returns_disputes: "Returns / Disputes",
};

export const SORT_OPTIONS: ReadonlyArray<{ id: OrderSort; label: string }> = [
  { id: "-placedAt", label: "Newest first" },
  { id: "placedAt", label: "Oldest first" },
  { id: "-value", label: "Value high to low" },
  { id: "value", label: "Value low to high" },
  { id: "sla", label: "Most urgent SLA" },
  { id: "-sla", label: "Least urgent SLA" },
];

export const PAYMENT_LABELS: Record<PaymentFilter, string> = {
  prepaid: "Prepaid",
  cod: "Cash on delivery",
  paid: "Paid",
  pending: "Pending",
  failed: "Failed",
};

export const SLA_LABELS: Record<SlaState, string> = {
  safe: "On track",
  approaching: "Approaching",
  at_risk: "At risk",
  breached: "Breached",
  none: "No SLA",
};

/** the SLA bands a seller can filter by ("none" is every order that has no dispatch deadline) */
export const SLA_FILTER_OPTIONS: ReadonlyArray<SlaState> = ["safe", "approaching", "at_risk", "breached"];

export const FULFILLMENT_LABELS: Record<FulfillmentFilter, string> = {
  none: "Not started",
  confirmed: "Confirmed",
  picking: "Picking",
  picked: "Picked",
  packing: "Packing",
  packed: "Packed",
  ready_to_ship: "Ready to dispatch",
  on_hold: "On hold",
  shipped: "Shipped",
  in_transit: "In transit",
  delivered: "Delivered",
  delivery_failed: "Delivery failed",
  cancelled: "Cancelled",
};

export const DATE_LABELS: Record<DateFilter, string> = { today: "Today", yesterday: "Yesterday" };

/** the quick filters under the controls (and the "Needs Attention" strip) */
export const ATTENTION_LABELS: Record<AttentionKey, string> = {
  sla_risk: "SLA Risk",
  unprocessed: "Unprocessed",
  inventory_issue: "Inventory Issue",
  payment_issue: "Payment Issue",
  cancellation_risk: "Cancellation Risk",
  delayed: "Delayed",
  returns: "Returns",
  disputes: "Disputes",
};

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
  fulfillment: ["fulfillment", "filter[fulfillmentStatus]"],
  chip: ["chip", "filter[attention]"],
  date: ["date", "filter[date]"],
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
      fulfillment: listOf(read(params, "fulfillment"), FULFILLMENT_FILTERS),
      attention: listOf(read(params, "chip"), ATTENTION_KEYS),
      date: oneOf(read(params, "date"), DATE_FILTERS),
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
  Boolean(f.q || f.tab || f.marketplace?.length || f.status?.length || f.slaState?.length || f.payment || f.fulfillment?.length || f.attention?.length || f.date);

/** a short sentence for "Filtered by ..." (what the list is narrowed by, besides the tab and the search box) */
export function describeFilters(f: OrderFilters, channelName: (code: string) => string): string[] {
  const parts: string[] = [];
  if (f.marketplace?.length) parts.push(f.marketplace.map(channelName).join(" + "));
  if (f.status?.length) parts.push(f.status.map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ")).join(" + "));
  if (f.slaState?.length) parts.push(`SLA ${f.slaState.map((s) => SLA_LABELS[s]).join(" + ").toLowerCase()}`);
  if (f.payment) parts.push(PAYMENT_LABELS[f.payment]);
  if (f.fulfillment?.length) parts.push(f.fulfillment.map((x) => FULFILLMENT_LABELS[x]).join(" + "));
  if (f.date) parts.push(DATE_LABELS[f.date]);
  if (f.attention?.length) parts.push(f.attention.map((a) => ATTENTION_LABELS[a]).join(" + "));
  if (f.q) parts.push(`"${f.q}"`);
  return parts;
}

/** the filters a saved view stores (the API's allow-list for the orders screen) */
export function viewFiltersOf(f: OrderFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.q) out.q = f.q;
  if (f.marketplace?.length) out.marketplace = f.marketplace;
  if (f.status?.length) out.status = f.status;
  if (f.slaState?.length) out.slaState = f.slaState;
  if (f.payment) out.payment = f.payment;
  if (f.fulfillment?.length) out.fulfillment = f.fulfillment;
  if (f.attention?.length) out.attention = f.attention;
  if (f.date) out.date = f.date;
  return out;
}

type Patch = Partial<Record<Key | "q" | "sort" | "page" | "size" | "drawer" | "attention", string | null>>;

const csv = (v: unknown): string | null => {
  const list = (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).filter((x): x is string => typeof x === "string" && x.length > 0);
  return list.length ? list.join(",") : null;
};

/** a saved view as a URL patch: every filter is replaced (the ones the view does not have are cleared) */
export function patchOfView(filters: Record<string, unknown>, sort: string | null): Patch {
  const one = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    q: one(filters.q),
    tab: null,
    marketplace: csv(filters.marketplace),
    status: csv(filters.status),
    sla: csv(filters.slaState),
    payment: one(filters.payment),
    fulfillment: csv(filters.fulfillment),
    chip: csv(filters.attention),
    date: one(filters.date),
    attention: null,
    sort: sort && sort !== "-placedAt" ? sort : null,
  };
}

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
    () => update({ q: null, tab: null, marketplace: null, status: null, sla: null, payment: null, fulfillment: null, chip: null, date: null, attention: null }),
    [update],
  );

  return { ...state, update, clearFilters };
}
