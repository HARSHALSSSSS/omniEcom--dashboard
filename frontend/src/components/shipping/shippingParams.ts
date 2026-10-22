import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DECISION_STATUSES,
  METHOD_FILTERS,
  PAYMENT_FILTERS,
  SHIPMENT_STATUSES,
  SHIPMENT_TABS,
  SHIPPING_VIEWS,
  SLA_BANDS,
  SUMMARY_DAYS,
  TRACKING_STATUSES,
  type DecisionFilters,
  type DecisionQuery,
  type ShipmentFilters,
  type ShipmentGroup,
  type ShipmentPayment,
  type ShipmentStatus,
  type ShipmentTab,
  type ShipmentsQuery,
  type ShippingView,
  type TrackingFilters,
  type TrackingQuery,
} from "@/types/shipping";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_DAYS = 30;
/** the API prints at most this many labels per call */
export const LABEL_MAX = 100;
/** the API handles at most this many orders per bulk call */
export const BULK_MAX = 200;

export const VIEW_LABELS: Record<ShippingView, string> = {
  overview: "Overview",
  orders: "Orders to Ship",
  methods: "Shipping Methods",
  rules: "Rules",
  tracking: "Tracking",
  shipments: "Shipments",
};

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
  view: ShippingView;
  tab: ShipmentTab;
  filters: ShipmentFilters;
  page: number;
  pageSize: number;
  days: number;
  /** shipment id of the open drawer (`?drawer=shipment:<id>`) */
  drawerId: string | null;
  /** `carriers` opens the Add Provider drawer (the old Carriers dialog link), `manifests` the manifests dialog */
  panel: "carriers" | "manifests" | null;
  orders: DecisionFilters;
  ordersPage: number;
  ordersPageSize: number;
  tracking: TrackingFilters;
  trackingPage: number;
  trackingPageSize: number;
  /** the exception matrix of the overview is open (`?exceptions=1`) */
  exceptions: boolean;
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

/** the parameters that belong to the shipments table (they also switch an old deep link to that view) */
const SHIPMENT_PARAMS = ["tab", "group", "q", "carrier", "status", "warehouse", "payment", "label", "from", "to", "page", "size", "drawer", "days", "filter[group]", "filter[carrier]", "filter[status]", "filter[warehouseId]", "filter[payment]", "filter[labelAvailable]", "filter[from]", "filter[to]"];

const read = (params: URLSearchParams, key: Key): string | null => {
  for (const name of ALIASES[key]) {
    const value = params.get(name);
    if (value) return value;
  }
  return null;
};

const pageOf = (params: URLSearchParams, name: string): number => {
  const n = Number(params.get(name));
  return Number.isInteger(n) && n > 1 ? n : 1;
};
const sizeOf = (params: URLSearchParams, name: string): number => {
  const n = Number(params.get(name));
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
};

export function readUrlState(params: URLSearchParams): ShippingUrlState {
  const tab = oneOf(read(params, "tab"), SHIPMENT_TABS) ?? "all";
  const label = read(params, "label");
  const from = read(params, "from") ?? "";
  const to = read(params, "to") ?? "";
  const days = Number(params.get("days"));
  const drawer = params.get("drawer") ?? "";
  const explicit = oneOf(params.get("view"), SHIPPING_VIEWS);
  const legacy = SHIPMENT_PARAMS.some((p) => params.get(p));
  return {
    view: explicit ?? (legacy ? "shipments" : "overview"),
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
    page: pageOf(params, "page"),
    pageSize: sizeOf(params, "size"),
    days: (SUMMARY_DAYS as readonly number[]).includes(days) ? days : DEFAULT_DAYS,
    drawerId: drawer.startsWith("shipment:") && drawer.length > 9 ? drawer.slice(9) : null,
    panel: oneOf(params.get("panel"), ["carriers", "manifests"] as const) ?? null,
    orders: {
      q: params.get("oq")?.trim() || undefined,
      marketplace: params.get("omarketplace")?.slice(0, 40) || undefined,
      warehouse: params.get("owarehouse") || undefined,
      method: oneOf(params.get("omethod"), METHOD_FILTERS),
      sla: oneOf(params.get("osla"), SLA_BANDS),
      status: oneOf(params.get("ostatus"), DECISION_STATUSES),
    },
    ordersPage: pageOf(params, "opage"),
    ordersPageSize: sizeOf(params, "osize"),
    tracking: {
      q: params.get("tq")?.trim() || undefined,
      marketplace: params.get("tmarketplace")?.slice(0, 40) || undefined,
      method: params.get("tmethod")?.slice(0, 40) || undefined,
      status: oneOf(params.get("tstatus"), TRACKING_STATUSES),
    },
    trackingPage: pageOf(params, "tpage"),
    trackingPageSize: sizeOf(params, "tsize"),
    exceptions: params.get("exceptions") === "1",
  };
}

export const shipmentsQueryOf = (s: ShippingUrlState): ShipmentsQuery => ({ ...s.filters, page: s.page, pageSize: s.pageSize });
export const decisionQueryOf = (s: ShippingUrlState): DecisionQuery => ({ ...s.orders, page: s.ordersPage, pageSize: s.ordersPageSize });
export const trackingQueryOf = (s: ShippingUrlState): TrackingQuery => ({ ...s.tracking, page: s.trackingPage, pageSize: s.trackingPageSize });

/** true when something narrows the list beyond "all shipments" */
export const isFiltered = (f: ShipmentFilters): boolean =>
  Boolean(f.q || f.group || f.carrier || f.status || f.warehouseId || f.payment || f.labelAvailable !== undefined || f.from || f.to);

export const isOrdersFiltered = (f: DecisionFilters): boolean => Boolean(f.q || f.marketplace || f.warehouse || f.method || f.sla || f.status);
export const isTrackingFiltered = (f: TrackingFilters): boolean => Boolean(f.q || f.marketplace || f.method || f.status);

type Patch = Partial<
  Record<
    | Key
    | "q"
    | "page"
    | "size"
    | "days"
    | "drawer"
    | "panel"
    | "view"
    | "exceptions"
    | "oq"
    | "omarketplace"
    | "owarehouse"
    | "omethod"
    | "osla"
    | "ostatus"
    | "opage"
    | "osize"
    | "tq"
    | "tmarketplace"
    | "tmethod"
    | "tstatus"
    | "tpage"
    | "tsize",
    string | null
  >
>;

const ORDER_FILTER_KEYS = ["oq", "omarketplace", "owarehouse", "omethod", "osla", "ostatus", "osize"];
const TRACKING_FILTER_KEYS = ["tq", "tmarketplace", "tmethod", "tstatus", "tsize"];
const SHIPMENT_FILTER_KEYS = ["tab", "q", "carrier", "status", "warehouse", "payment", "label", "from", "to", "size"];

/**
 * The Shipping screen keeps the view, search, filters, page, window, panel and the open drawer in the URL, so reload, back and deep links work.
 * A filter change goes back to page 1 of ITS list (shipments, orders to ship or tracking).
 */
export function useShippingUrlState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readUrlState(params), [params]);

  /** `replace` keeps typing out of the history; `keepPage` keeps the page when a drawer or panel opens */
  const update = useCallback(
    (patch: Patch, opts: { replace?: boolean; keepPage?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!opts.keepPage) {
            const keys = Object.keys(patch);
            if (!("page" in patch) && keys.some((k) => SHIPMENT_FILTER_KEYS.includes(k))) next.delete("page");
            if (!("opage" in patch) && keys.some((k) => ORDER_FILTER_KEYS.includes(k))) next.delete("opage");
            if (!("tpage" in patch) && keys.some((k) => TRACKING_FILTER_KEYS.includes(k))) next.delete("tpage");
          }
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
  const clearOrderFilters = useCallback(() => update({ oq: null, omarketplace: null, owarehouse: null, omethod: null, osla: null, ostatus: null }), [update]);
  const clearTrackingFilters = useCallback(() => update({ tq: null, tmarketplace: null, tmethod: null, tstatus: null }), [update]);

  return { ...state, update, clearFilters, clearOrderFilters, clearTrackingFilters };
}
