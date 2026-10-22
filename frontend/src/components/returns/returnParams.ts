import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DISPOSITION_FILTERS,
  INSPECTION_STATUSES,
  REFUND_STATUSES,
  RETURN_SIGNALS,
  RETURN_SORTS,
  RETURN_STAGES,
  RETURN_TABS,
  SUMMARY_WINDOWS,
  type DispositionFilter,
  type InspectionStatus,
  type LedgerQuery,
  type RefundStatus,
  type ReturnFilters,
  type ReturnSignal,
  type ReturnSort,
  type ReturnTab,
} from "@/types/returns";

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_DAYS = 30;

export const TAB_LABELS: Record<ReturnTab, string> = {
  all: "All",
  needs_attention: "Needs Attention",
  awaiting_receipt: "Awaiting Receipt",
  awaiting_inspection: "Awaiting Inspection",
  refund_pending: "Refund Pending",
  completed: "Completed",
};

/** the four workspace tabs of the screen */
export const VIEWS = ["overview", "returns", "inspection", "refunds"] as const;
export type ReturnsView = (typeof VIEWS)[number];
export const VIEW_LABELS: Record<ReturnsView, string> = { overview: "Overview", returns: "Returns", inspection: "Inspection", refunds: "Refunds" };

/** the queues of the Inspection tab: each is one ledger tab or inspection status the API already filters by */
export const INSPECTION_QUEUES = ["awaiting", "review", "passed", "failed"] as const;
export type InspectionQueue = (typeof INSPECTION_QUEUES)[number];
export const INSPECTION_QUEUE_LABELS: Record<InspectionQueue, string> = { awaiting: "Awaiting inspection", review: "Needs review", passed: "Passed", failed: "Failed" };

/** the queues of the Refunds tab: every refund in the queue, or one refund status */
export const REFUND_QUEUES = ["all", "pending", "ready", "processing", "failed", "processed"] as const;
export type RefundQueueKey = (typeof REFUND_QUEUES)[number];
export const REFUND_QUEUE_LABELS: Record<RefundQueueKey, string> = { all: "All", pending: "Pending", ready: "Ready", processing: "Processing", failed: "Failed", processed: "Refunded" };

/** the drawer in the URL: `?drawer=return:<id>` (detail), `inspect:<id>` or `refund:<id>` */
export type DrawerKind = "return" | "inspect" | "refund";
export interface DrawerRef {
  kind: DrawerKind;
  id: string;
}
const DRAWER_KINDS: readonly DrawerKind[] = ["return", "inspect", "refund"];

export const SIGNAL_LABELS: Record<ReturnSignal, string> = {
  awaiting_inspection: "Awaiting inspection",
  refunds_pending: "Refunds pending",
  inventory_discrepancy: "Quantity mismatch",
  high_value_review: "High value",
};

export const INSPECTION_LABELS: Record<InspectionStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  passed: "Passed",
  failed: "Failed",
  requires_review: "Needs review",
};

export const REFUND_LABELS: Record<RefundStatus, string> = {
  not_applicable: "N/A",
  pending: "Pending",
  ready: "Ready",
  processing: "Processing",
  processed: "Refunded",
  failed: "Failed",
};

/** the words of the refund drawer and the Refunds tab */
export const REFUND_DESIGN_LABELS: Record<RefundStatus, string> = {
  pending: "Pending",
  ready: "Ready for Refund",
  processing: "Processing",
  processed: "Refunded",
  failed: "Refund Failed",
  not_applicable: "Not Applicable",
};

export const DISPOSITION_LABELS: Record<DispositionFilter, string> = {
  pending: "Not decided",
  sellable: "Sellable",
  damaged: "Damaged",
  rejected: "Rejected",
  quarantine: "Quarantine",
  repair: "Repair",
  write_off: "Write-off",
  return_to_vendor: "Return to vendor",
};

export const SORT_OPTIONS: ReadonlyArray<{ id: ReturnSort; label: string }> = [
  { id: "-requestedAt", label: "Newest first" },
  { id: "requestedAt", label: "Oldest first" },
  { id: "-refundAmount", label: "Refund high to low" },
  { id: "refundAmount", label: "Refund low to high" },
];

export interface ReturnsUrlState {
  tab: ReturnTab;
  filters: ReturnFilters;
  sort: ReturnSort;
  page: number;
  pageSize: number;
  /** the window of the tiles and insights, in days */
  days: number;
  /** the open drawer (`?drawer=return:<id>`, `inspect:<id>`, `refund:<id>`) */
  drawer: DrawerRef | null;
  view: ReturnsView;
  /** the return picked in the Returns and Inspection tabs (`?focus=<id>`) */
  focus: string | null;
  inspectionQueue: InspectionQueue;
  refundQueue: RefundQueueKey;
}

const oneOf = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined => allowed.find((a) => a === value);

/** deep links from the API use `filter[...]` names (`/returns?filter[refund]=failed`); the page's own names win */
const ALIASES = {
  tab: ["tab", "filter[tab]"],
  stage: ["stage", "filter[stage]", "filter[status]"],
  marketplace: ["marketplace", "filter[marketplace]"],
  signal: ["signal", "filter[signal]"],
  inspection: ["inspection", "filter[inspectionStatus]"],
  refund: ["refund", "filter[refund]", "filter[refundStatus]"],
  disposition: ["disposition", "filter[disposition]"],
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

export function readUrlState(params: URLSearchParams): ReturnsUrlState {
  const tab = oneOf(read(params, "tab"), RETURN_TABS) ?? "all";
  const marketplace = read(params, "marketplace") ?? "";
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  const days = Number(params.get("days"));
  const drawerParam = params.get("drawer") ?? "";
  const sep = drawerParam.indexOf(":");
  const drawerKind = DRAWER_KINDS.find((k) => k === drawerParam.slice(0, Math.max(sep, 0)));
  const drawerId = sep > 0 ? drawerParam.slice(sep + 1) : "";
  return {
    tab,
    filters: {
      q: params.get("q")?.trim() || undefined,
      tab: tab === "all" ? undefined : tab,
      stage: oneOf(read(params, "stage"), RETURN_STAGES),
      marketplace: MARKETPLACE_CODE.test(marketplace) ? marketplace : undefined,
      signal: oneOf(read(params, "signal"), RETURN_SIGNALS),
      inspectionStatus: oneOf(read(params, "inspection"), INSPECTION_STATUSES),
      refundStatus: oneOf(read(params, "refund"), REFUND_STATUSES),
      disposition: oneOf(read(params, "disposition"), DISPOSITION_FILTERS),
    },
    sort: oneOf(params.get("sort"), RETURN_SORTS) ?? "-requestedAt",
    page: Number.isInteger(page) && page > 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    days: (SUMMARY_WINDOWS as readonly number[]).includes(days) ? days : DEFAULT_DAYS,
    drawer: drawerKind && drawerId ? { kind: drawerKind, id: drawerId } : null,
    view: oneOf(params.get("view"), VIEWS) ?? "overview",
    focus: params.get("focus") || null,
    inspectionQueue: oneOf(params.get("iq"), INSPECTION_QUEUES) ?? "awaiting",
    refundQueue: oneOf(params.get("rq"), REFUND_QUEUES) ?? "all",
  };
}

export const ledgerQueryOf = (s: ReturnsUrlState): LedgerQuery => ({ ...s.filters, sort: s.sort, page: s.page, pageSize: s.pageSize });

/** true when something narrows the list beyond "all returns" */
export const isFiltered = (f: ReturnFilters): boolean =>
  Boolean(f.q || f.tab || f.stage || f.marketplace || f.signal || f.inspectionStatus || f.refundStatus || f.disposition);

type Patch = Partial<Record<Key | "q" | "sort" | "page" | "size" | "days" | "drawer" | "view" | "iq" | "rq" | "focus", string | null>>;

/** The Returns screen keeps tab, stage, search, filters, sort, page, window and the open drawer in the URL, so reload, back and deep links work. */
export function useReturnsUrlState() {
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
    () => update({ q: null, tab: null, stage: null, marketplace: null, signal: null, inspection: null, refund: null, disposition: null }),
    [update],
  );

  return { ...state, update, clearFilters };
}
