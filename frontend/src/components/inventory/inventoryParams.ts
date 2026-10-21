import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { HealthFilter, InventoryFilters, InventorySignal, MovementFilter, StockStatus } from "@/types/inventory";

export const STATUS_TABS: ReadonlyArray<{ id: "all" | StockStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "healthy", label: "Healthy" },
  { id: "low_stock", label: "Low stock" },
  { id: "out_of_stock", label: "Out of stock" },
  { id: "excess", label: "Excess" },
];

export const HEALTH_OPTIONS: ReadonlyArray<{ id: HealthFilter; label: string }> = [
  { id: "stockout", label: "Stocked out" },
  { id: "critical", label: "Critical" },
  { id: "attention", label: "Needs attention" },
  { id: "healthy", label: "Healthy" },
  { id: "stockout_risk", label: "Stockout risk" },
];

export const SIGNAL_OPTIONS: ReadonlyArray<{ id: InventorySignal; label: string }> = [
  { id: "low_stock", label: "Low stock" },
  { id: "stockout_risk", label: "Stockout risk" },
  { id: "inventory_mismatch", label: "Inventory mismatch" },
  { id: "slow_moving", label: "Slow moving" },
  { id: "high_velocity", label: "High velocity" },
  { id: "aging_inventory", label: "Aging inventory" },
  { id: "warehouse_imbalance", label: "Warehouse imbalance" },
];

export const MOVEMENT_OPTIONS: ReadonlyArray<{ id: MovementFilter; label: string }> = [
  { id: "received", label: "Received" },
  { id: "adjusted", label: "Adjusted" },
  { id: "reserved", label: "Reserved" },
  { id: "returned", label: "Returned" },
  { id: "synced", label: "Synced to a channel" },
];

/** `sort` values the ledger understands (a leading "-" is descending); "" is its default, most urgent first */
export const SORT_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "", label: "Most urgent first" },
  { id: "sku", label: "SKU A-Z" },
  { id: "-sku", label: "SKU Z-A" },
  { id: "available", label: "Available low to high" },
  { id: "-available", label: "Available high to low" },
  { id: "coverDays", label: "Days cover low to high" },
  { id: "-coverDays", label: "Days cover high to low" },
  { id: "-lastMovement", label: "Latest movement" },
  { id: "lastMovement", label: "Oldest movement" },
];

export const PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 25;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const oneOf = <T extends string>(value: string | null, allowed: ReadonlyArray<{ id: T }>): T | undefined => allowed.find((o) => o.id === value)?.id;
const whole = (value: string | null): number | undefined => (value !== null && /^\d{1,9}$/.test(value) ? Number(value) : undefined);

export interface InventoryUrlState {
  filters: InventoryFilters;
  sort: string;
  page: number;
  pageSize: number;
  /** the variant whose drawer is open (`?drawer=variant:<id>`) */
  drawerVariantId: string | null;
}

export function readUrlState(params: URLSearchParams): InventoryUrlState {
  const warehouse = params.get("warehouse");
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  const drawer = /^variant:(.+)$/.exec(params.get("drawer") ?? "")?.[1] ?? null;
  const sort = params.get("sort") ?? "";
  return {
    filters: {
      q: params.get("q")?.trim() || undefined,
      stockStatus: oneOf(params.get("status"), STATUS_TABS.filter((t): t is { id: StockStatus; label: string } => t.id !== "all")),
      warehouse: warehouse && UUID.test(warehouse) ? warehouse : undefined,
      channel: params.get("channel") || undefined,
      health: oneOf(params.get("health"), HEALTH_OPTIONS),
      signal: oneOf(params.get("signal"), SIGNAL_OPTIONS),
      movement: oneOf(params.get("movement"), MOVEMENT_OPTIONS),
      stockMin: whole(params.get("min")),
      stockMax: whole(params.get("max")),
    },
    sort: SORT_OPTIONS.some((o) => o.id === sort) ? sort : "",
    page: Number.isInteger(page) && page > 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    drawerVariantId: drawer && UUID.test(drawer) ? drawer : null,
  };
}

export type Patch = Partial<Record<"status" | "q" | "warehouse" | "channel" | "health" | "signal" | "movement" | "min" | "max" | "sort" | "page" | "size" | "drawer", string | null>>;

const FILTER_KEYS = ["status", "q", "warehouse", "channel", "health", "signal", "movement", "min", "max"] as const;

/** The Inventory screen keeps tab, search, filters, sort, page and the open drawer in the URL, so reload and back behave. */
export function useInventoryUrlState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readUrlState(params), [params]);

  /** a filter or sort change goes back to page 1; `replace` keeps typing out of the history */
  const update = useCallback(
    (patch: Patch, opts: { replace?: boolean; keepPage?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!opts.keepPage && !("page" in patch) && !("drawer" in patch)) next.delete("page");
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === undefined || value === "" || (key === "status" && value === "all")) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  const clearFilters = useCallback(() => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null]))), [update]);

  return { ...state, update, clearFilters, search: params.toString() };
}

export const hasActiveFilters = (f: InventoryFilters): boolean => Object.values(f).some((v) => v !== undefined);
