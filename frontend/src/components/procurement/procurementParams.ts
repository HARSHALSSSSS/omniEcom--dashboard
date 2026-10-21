import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  PO_SORTS,
  PO_STATUSES,
  PROCUREMENT_TABS,
  SUPPLIER_SORTS,
  SUPPLIER_STATUSES,
  type PoFilters,
  type PoQuery,
  type PoSort,
  type ProcurementTab,
  type SupplierQuery,
  type SupplierSort,
  type SupplierStatus,
} from "@/types/procurement";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_PO_SORT: PoSort = "-orderDate";
export const DEFAULT_SUPPLIER_SORT: SupplierSort = "name";

export const PO_SORT_OPTIONS: ReadonlyArray<{ id: PoSort; label: string }> = [
  { id: "-orderDate", label: "Newest first" },
  { id: "orderDate", label: "Oldest first" },
  { id: "expectedAt", label: "Expected soonest" },
  { id: "-expectedAt", label: "Expected latest" },
  { id: "-totalMinor", label: "Total high to low" },
  { id: "totalMinor", label: "Total low to high" },
  { id: "poNumber", label: "PO number A to Z" },
  { id: "-poNumber", label: "PO number Z to A" },
];

export const SUPPLIER_SORT_OPTIONS: ReadonlyArray<{ id: SupplierSort; label: string }> = [
  { id: "name", label: "Name A to Z" },
  { id: "-name", label: "Name Z to A" },
  { id: "-createdAt", label: "Newest first" },
  { id: "createdAt", label: "Oldest first" },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const oneOf = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined => allowed.find((a) => a === value);
const uuid = (v: string | null): string | undefined => (v && UUID.test(v) ? v : undefined);
const day = (v: string | null): string | undefined => (v && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : undefined);

export interface ProcurementUrlState {
  tab: ProcurementTab;
  /** purchase order filters (the `status` is the chip row above the table) */
  po: PoFilters;
  poSort: PoSort;
  supplierQ: string | undefined;
  supplierStatus: SupplierStatus | undefined;
  supplierSort: SupplierSort;
  page: number;
  pageSize: number;
  /** the open purchase order drawer */
  orderId: string | undefined;
  /** the open supplier drawer */
  supplierId: string | undefined;
}

export function readUrlState(p: URLSearchParams): ProcurementUrlState {
  const tab = oneOf(p.get("tab"), PROCUREMENT_TABS) ?? "orders";
  const page = Number(p.get("page"));
  const size = Number(p.get("size"));
  const q = p.get("q")?.trim() || undefined;
  return {
    tab,
    po: {
      q: tab === "orders" ? q : undefined,
      status: oneOf(p.get("status"), PO_STATUSES),
      supplierId: uuid(p.get("supplier")),
      warehouseId: uuid(p.get("warehouse")),
      from: day(p.get("from")),
      to: day(p.get("to")),
    },
    poSort: oneOf(p.get("sort"), PO_SORTS) ?? DEFAULT_PO_SORT,
    supplierQ: tab === "suppliers" ? q : undefined,
    supplierStatus: oneOf(p.get("sstatus"), SUPPLIER_STATUSES),
    supplierSort: oneOf(p.get("ssort"), SUPPLIER_SORTS) ?? DEFAULT_SUPPLIER_SORT,
    page: Number.isInteger(page) && page > 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    orderId: uuid(p.get("po")),
    supplierId: uuid(p.get("sup")),
  };
}

export const poQueryOf = (s: ProcurementUrlState): PoQuery => ({ ...s.po, sort: s.poSort, page: s.page, pageSize: s.pageSize });
export const supplierQueryOf = (s: ProcurementUrlState): SupplierQuery => ({ q: s.supplierQ, status: s.supplierStatus, sort: s.supplierSort, page: s.page, pageSize: s.pageSize });

export const isPoFiltered = (f: PoFilters): boolean => Boolean(f.q || f.status || f.supplierId || f.warehouseId || f.from || f.to);

type Key = "tab" | "q" | "status" | "supplier" | "warehouse" | "from" | "to" | "sort" | "sstatus" | "ssort" | "page" | "size" | "po" | "sup";
export type UrlPatch = Partial<Record<Key, string | null>>;
/** the drawers open and close without losing the page the list is on */
const KEEP_PAGE: readonly Key[] = ["po", "sup"];

/** The Procurement screen keeps tab, search, filters, sort, page and the open drawer in the URL, so reload, back and deep links work. */
export function useProcurementUrlState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readUrlState(params), [params]);

  const update = useCallback(
    (patch: UrlPatch, opts: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const keys = Object.keys(patch) as Key[];
          // a filter, sort or tab change goes back to page 1; a tab change also leaves the other tab's search and sort behind
          if (!keys.includes("page") && !keys.every((k) => KEEP_PAGE.includes(k))) next.delete("page");
          if (keys.includes("tab")) {
            for (const k of ["q", "status", "sort", "sstatus", "ssort"] as Key[]) if (!keys.includes(k)) next.delete(k);
          }
          for (const key of keys) {
            const value = patch[key];
            next.delete(key);
            if (value !== null && value !== undefined && value !== "" && !(key === "tab" && value === "orders")) next.set(key, value);
          }
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  const clearPoFilters = useCallback(() => update({ q: null, status: null, supplier: null, warehouse: null, from: null, to: null }), [update]);
  const clearSupplierFilters = useCallback(() => update({ q: null, sstatus: null }), [update]);

  return { ...state, update, clearPoFilters, clearSupplierFilters };
}
