import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  PAYMENT_FILTERS,
  SHIPMENT_STATUSES,
  SHIPMENT_TABS,
  SUMMARY_DAYS,
  type ShipmentFilters,
  type ShipmentGroup,
  type ShipmentPayment,
  type ShipmentStatus,
  type ShipmentTab,
  type ShipmentsQuery,
} from "@/types/shipping";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_DAYS = 30;
/** the API prints at most this many labels per call */
export const LABEL_MAX = 100;

export const TAB_LABELS: Record<ShipmentTab, string> = {
  all: "All shipments",
  pre_dispatch: "Ready to dispatch",
  in_transit: "In transit",
  delivered: "Delivered",
  ndr: "Delivery failed (NDR)",
  rto: "Returning (RTO)",
  cancelled: "Cancelled",
};

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  created: "Created",
  label_ready: "Label ready",
  manifested: "Manifested",
  dispatched: "Dispatched",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  delivery_failed: "Delivery failed",
  rto_initiated: "RTO initiated",
  rto_in_transit: "RTO in transit",
  rto_delivered: "RTO delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_LABELS: Record<ShipmentPayment, string> = { prepaid: "Prepaid", cod: "Cash on delivery" };

export interface ShippingUrlState {
  tab: ShipmentTab;
  filters: ShipmentFilters;
  page: number;
  pageSize: number;
  days: number;
  /** shipment id of the open drawer (`?drawer=shipment:<id>`) */
  drawerId: string | null;
  panel: "carriers" | "manifests" | null;
}

const oneOf = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined => allowed.find((a) => a === value);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** deep links from the API use `filter[...]` names (`/shipping?filter[group]=ndr`); the page's own names win */
const ALIASES = {
  tab: ["tab", "group", "filter[group]"],
  carrier: ["carrier", "filter[carrier]"],
  status: ["status", "filter[status]"],
  warehouse: ["warehouse", "filter[warehouseId]"],
  payment: ["payment", "filter[payment]"],
  label: ["label", "filter[labelAvailable]"],
  from: ["from", "filter[from]"],
  to: ["to", "filter[to]"],
} as const;
type Key = keyof typeof ALIASES;

const read = (params: URLSearchParams, key: Key): string | null => {
  for (const name of ALIASES[key]) {
    const value = params.get(name);
    if (value) return value;
  }
  return null;
};

export function readUrlState(params: URLSearchParams): ShippingUrlState {
  const tab = oneOf(read(params, "tab"), SHIPMENT_TABS) ?? "all";
  const label = read(params, "label");
  const from = read(params, "from") ?? "";
  const to = read(params, "to") ?? "";
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  const days = Number(params.get("days"));
  const drawer = params.get("drawer") ?? "";
  return {
    tab,
    filters: {
      q: params.get("q")?.trim() || undefined,
      group: tab === "all" ? undefined : (tab as ShipmentGroup),
      carrier: read(params, "carrier")?.slice(0, 80) || undefined,
      status: oneOf(read(params, "status"), SHIPMENT_STATUSES),
      warehouseId: read(params, "warehouse") ?? undefined,
      payment: oneOf(read(params, "payment"), PAYMENT_FILTERS),
      labelAvailable: label === "true" ? true : label === "false" ? false : undefined,
      from: DATE.test(from) ? from : undefined,
      to: DATE.test(to) ? to : undefined,
    },
    page: Number.isInteger(page) && page > 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    days: (SUMMARY_DAYS as readonly number[]).includes(days) ? days : DEFAULT_DAYS,
    drawerId: drawer.startsWith("shipment:") && drawer.length > 9 ? drawer.slice(9) : null,
    panel: oneOf(params.get("panel"), ["carriers", "manifests"] as const) ?? null,
  };
}

export const shipmentsQueryOf = (s: ShippingUrlState): ShipmentsQuery => ({ ...s.filters, page: s.page, pageSize: s.pageSize });

/** true when something narrows the list beyond "all shipments" */
export const isFiltered = (f: ShipmentFilters): boolean =>
  Boolean(f.q || f.group || f.carrier || f.status || f.warehouseId || f.payment || f.labelAvailable !== undefined || f.from || f.to);

type Patch = Partial<Record<Key | "q" | "page" | "size" | "days" | "drawer" | "panel", string | null>>;

/** The Shipping screen keeps tab, search, filters, page, window, panel and the open drawer in the URL, so reload, back and deep links work. */
export function useShippingUrlState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readUrlState(params), [params]);

  /** a filter or tab change goes back to page 1; `replace` keeps typing out of the history */
  const update = useCallback(
    (patch: Patch, opts: { replace?: boolean; keepPage?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!opts.keepPage && !("page" in patch)) next.delete("page");
          for (const [key, value] of Object.entries(patch)) {
            const names: readonly string[] = key in ALIASES ? ALIASES[key as Key] : [key];
            for (const name of names) next.delete(name);
            if (value !== null && value !== undefined && value !== "" && !(key === "tab" && value === "all")) next.set(key, value);
          }
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  const clearFilters = useCallback(() => update({ q: null, tab: null, carrier: null, status: null, warehouse: null, payment: null, label: null, from: null, to: null }), [update]);

  return { ...state, update, clearFilters };
}
