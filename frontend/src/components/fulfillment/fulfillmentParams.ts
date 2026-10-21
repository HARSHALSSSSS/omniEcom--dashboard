import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  EXCEPTION_STATUSES,
  FULFILLMENT_TABS,
  PRIORITIES,
  STAGES,
  type ExceptionStatus,
  type ExceptionsQuery,
  type FulfillmentTab,
  type Priority,
  type QueueQuery,
  type Stage,
} from "@/types/fulfillment";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export const TAB_LABELS: Record<FulfillmentTab, string> = {
  all: "All",
  awaiting_pick: "Awaiting pick",
  picking: "Picking",
  packing: "Packing",
  ready_to_ship: "Ready to ship",
  exceptions: "Exceptions",
};

export const PRIORITY_LABELS: Record<Priority, string> = { normal: "Normal", high: "High", urgent: "Urgent" };
export const EXCEPTION_STATUS_LABELS: Record<ExceptionStatus, string> = { open: "Open", resolved: "Resolved", dismissed: "Dismissed" };

export interface FulfillmentUrlState {
  tab: FulfillmentTab;
  q: string;
  warehouse: string | undefined;
  carrier: string | undefined;
  priority: Priority | undefined;
  hasException: boolean | undefined;
  /** the status filter of the exceptions tab */
  exceptionStatus: ExceptionStatus;
  page: number;
  pageSize: number;
  /** order id of the open drawer (`?drawer=order:<id>`) */
  drawerId: string | null;
}

const oneOf = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined => allowed.find((a) => a === value);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readUrlState(params: URLSearchParams): FulfillmentUrlState {
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  const drawer = params.get("drawer") ?? "";
  const warehouse = params.get("warehouse") ?? "";
  const exception = params.get("exception");
  return {
    tab: oneOf(params.get("tab"), FULFILLMENT_TABS) ?? "all",
    q: params.get("q")?.trim() ?? "",
    warehouse: UUID.test(warehouse) ? warehouse : undefined,
    carrier: params.get("carrier")?.trim() || undefined,
    priority: oneOf(params.get("priority"), PRIORITIES),
    hasException: exception === "true" ? true : exception === "false" ? false : undefined,
    exceptionStatus: oneOf(params.get("xstatus"), EXCEPTION_STATUSES) ?? "open",
    page: Number.isInteger(page) && page > 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    drawerId: drawer.startsWith("order:") && drawer.length > 6 ? drawer.slice(6) : null,
  };
}

const stageOf = (tab: FulfillmentTab): Stage | undefined => STAGES.find((s) => s === tab);

export const queueQueryOf = (s: FulfillmentUrlState): QueueQuery => ({
  stage: stageOf(s.tab),
  warehouse: s.warehouse,
  carrier: s.carrier,
  priority: s.priority,
  hasException: s.hasException,
  q: s.q || undefined,
  page: s.page,
  pageSize: s.pageSize,
});

export const exceptionsQueryOf = (s: FulfillmentUrlState): ExceptionsQuery => ({
  status: s.exceptionStatus,
  warehouse: s.warehouse,
  q: s.q || undefined,
  page: s.page,
  pageSize: s.pageSize,
});

/** true when something narrows the list beyond the plain tab */
export const isFiltered = (s: FulfillmentUrlState): boolean =>
  Boolean(s.q || s.warehouse || (s.tab !== "exceptions" && (s.carrier || s.priority || s.hasException !== undefined)));

type Patch = Partial<Record<"tab" | "q" | "warehouse" | "carrier" | "priority" | "exception" | "xstatus" | "page" | "size" | "drawer", string | null>>;

/** The Fulfillment screen keeps tab, search, filters, page and the open drawer in the URL, so reload, back and deep links work. */
export function useFulfillmentUrlState() {
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
            next.delete(key);
            if (value !== null && value !== undefined && value !== "" && !(key === "tab" && value === "all")) next.set(key, value);
          }
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  const clearFilters = useCallback(() => update({ q: null, warehouse: null, carrier: null, priority: null, exception: null }), [update]);

  return { ...state, update, clearFilters };
}
