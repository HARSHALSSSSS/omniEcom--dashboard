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

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_DAYS = 30;

export const TAB_LABELS: Record<ReturnTab, string> = {
  all: "All returns",
  needs_attention: "Needs attention",
  awaiting_receipt: "Awaiting receipt",
  awaiting_inspection: "Awaiting inspection",
  refund_pending: "Refund pending",
  completed: "Completed",
};

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
  not_applicable: "No refund due",
  pending: "Pending",
  ready: "Ready",
  processing: "Processing",
  processed: "Refunded",
  failed: "Failed",
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
  /** return id of the open drawer (`?drawer=return:<id>`) */
  drawerId: string | null;
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
  const drawer = params.get("drawer") ?? "";
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
    drawerId: drawer.startsWith("return:") && drawer.length > 7 ? drawer.slice(7) : null,
  };
}

export const ledgerQueryOf = (s: ReturnsUrlState): LedgerQuery => ({ ...s.filters, sort: s.sort, page: s.page, pageSize: s.pageSize });

/** true when something narrows the list beyond "all returns" */
export const isFiltered = (f: ReturnFilters): boolean =>
  Boolean(f.q || f.tab || f.stage || f.marketplace || f.signal || f.inspectionStatus || f.refundStatus || f.disposition);

type Patch = Partial<Record<Key | "q" | "sort" | "page" | "size" | "days" | "drawer", string | null>>;

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
