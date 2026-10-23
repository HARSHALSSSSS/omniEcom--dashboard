import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  PRICE_FIELDS,
  PRICING_STRATEGIES,
  PRICING_VIEWS,
  PROPOSAL_SORTS,
  PROPOSAL_TABS,
  type CompetitorsQuery,
  type HistoryQuery,
  type PriceField,
  type PriceStrategy,
  type PricingView,
  type ProposalSort,
  type ProposalTab,
  type ProposalsQuery,
} from "@/types/pricing";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_TAB: ProposalTab = "pending_review";
export const DEFAULT_SORT: ProposalSort = "impact";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const oneOf = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined => allowed.find((a) => a === value);
const positive = (raw: string | null): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 1 ? n : 1;
};

export interface PricingUrlState {
  view: PricingView;
  /** the account filter is shared by the queue, the competitor prices and the audit log */
  accountId: string | undefined;
  proposals: ProposalsQuery;
  competitors: CompetitorsQuery;
  history: HistoryQuery;
}

export function readUrlState(params: URLSearchParams): PricingUrlState {
  const account = params.get("account") ?? "";
  const accountId = UUID.test(account) ? account : undefined;
  const size = Number(params.get("size"));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE;
  return {
    view: oneOf(params.get("view"), PRICING_VIEWS) ?? "overview",
    accountId,
    proposals: {
      tab: oneOf(params.get("tab"), PROPOSAL_TABS) ?? DEFAULT_TAB,
      q: params.get("q")?.trim() || undefined,
      accountId,
      strategy: oneOf<PriceStrategy>(params.get("strategy"), PRICING_STRATEGIES),
      sort: oneOf<ProposalSort>(params.get("sort"), PROPOSAL_SORTS) ?? DEFAULT_SORT,
      page: positive(params.get("page")),
      pageSize,
    },
    competitors: {
      q: params.get("cq")?.trim() || undefined,
      accountId,
      latest: params.get("latest") === "true",
      page: positive(params.get("cpage")),
      pageSize,
    },
    history: { accountId, field: oneOf<PriceField>(params.get("field"), PRICE_FIELDS) },
  };
}

/** a narrowed queue (beyond the tab) has its own "clear filters" */
export const proposalsFiltered = (q: ProposalsQuery): boolean => Boolean(q.q || q.accountId || q.strategy);

type Patch = Partial<Record<"view" | "tab" | "q" | "account" | "strategy" | "sort" | "page" | "size" | "cq" | "cpage" | "latest" | "field", string | null>>;

/** the Pricing screen keeps view, tab, search, filters, sort and page in the URL, so reload, back and deep links work */
export function usePricingUrlState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readUrlState(params), [params]);

  /** a filter, tab or sort change goes back to page 1; `replace` keeps typing out of the history */
  const update = useCallback(
    (patch: Patch, opts: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!("page" in patch)) next.delete("page");
          if (!("cpage" in patch)) next.delete("cpage");
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key);
            if (value !== null && value !== undefined && value !== "") next.set(key, value);
          }
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  const clearFilters = useCallback(() => update({ q: null, account: null, strategy: null }), [update]);

  return { ...state, update, clearFilters };
}
