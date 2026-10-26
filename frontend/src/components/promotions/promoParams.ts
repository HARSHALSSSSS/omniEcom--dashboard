import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CAMPAIGN_HORIZONS,
  CAMPAIGN_SORTS,
  CANDIDATE_QUICK_FILTERS,
  CANDIDATE_SORTS,
  CANDIDATE_STATUSES,
  PRODUCT_SEGMENTS,
  PROMOTION_STATUSES,
  PROMOTION_TYPES,
  type CampaignHorizon,
  type CampaignSort,
  type CampaignsQuery,
  type CandidateQuick,
  type CandidateSort,
  type CandidateStatus,
  type CandidatesQuery,
  type ProductSegment,
  type PromotionItemStatus,
  type PromotionStatus,
  type PromotionType,
  type PromotionView,
} from "@/types/promotions";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const oneOf = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined => allowed.find((a) => a === value);
const uuid = (value: string | null): string | undefined => (value && UUID.test(value) ? value : undefined);

export interface PromotionsUrlState {
  view: PromotionView;
  q?: string;
  /** campaign status on the campaigns view, product status on the products view */
  status?: PromotionStatus | PromotionItemStatus;
  type?: PromotionType;
  campaignId?: string;
  accountId?: string;
  /** the campaign whose detail drawer is open */
  open?: string;
  /** products view: which candidates (recommended / the seller's own selection / all) */
  segment: ProductSegment;
  quick?: CandidateQuick;
  marketplace?: string;
  sort: CandidateSort;
  candidateStatus?: CandidateStatus;
  /** campaigns view: the Past / Now / Next toggle (a status filter overrides it) */
  horizon: CampaignHorizon;
  endingSoon: boolean;
  campaignSort: CampaignSort;
  page: number;
  pageSize: number;
}

export function readUrlState(params: URLSearchParams): PromotionsUrlState {
  const rawView = params.get("view");
  const view: PromotionView = rawView === "products" ? "products" : rawView === "campaigns" ? "campaigns" : "overview";
  const rawStatus = params.get("status");
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  return {
    view,
    q: params.get("q")?.trim() || undefined,
    status: view === "products" ? undefined : oneOf(rawStatus, PROMOTION_STATUSES),
    segment: oneOf(params.get("seg"), PRODUCT_SEGMENTS) ?? "recommended",
    quick: oneOf(params.get("quick"), CANDIDATE_QUICK_FILTERS),
    marketplace: params.get("market")?.trim() || undefined,
    sort: view === "products" ? (oneOf(params.get("sort"), CANDIDATE_SORTS) ?? "priority") : "priority",
    horizon: oneOf(params.get("when"), CAMPAIGN_HORIZONS) ?? "now",
    endingSoon: view === "campaigns" && params.get("ending") === "true",
    campaignSort: view === "campaigns" ? (oneOf(params.get("sort"), CAMPAIGN_SORTS) ?? "newest") : "newest",
    candidateStatus: view === "products" ? oneOf(rawStatus, CANDIDATE_STATUSES) : undefined,
    type: view === "campaigns" ? oneOf(params.get("type"), PROMOTION_TYPES) : undefined,
    campaignId: view === "products" ? uuid(params.get("campaign")) : undefined,
    accountId: view === "products" ? uuid(params.get("account")) : undefined,
    open: uuid(params.get("open")),
    page: Number.isInteger(page) && page > 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
  };
}

export const campaignsQueryOf = (s: PromotionsUrlState): CampaignsQuery => ({
  status: s.status as PromotionStatus | undefined,
  type: s.type,
  // a status filter is more specific than the Past / Now / Next toggle
  horizon: s.status ? undefined : s.horizon,
  endingSoon: s.endingSoon || undefined,
  marketplace: s.marketplace,
  sort: s.campaignSort,
  q: s.q,
  page: s.page,
  pageSize: s.pageSize,
});

/** the candidates the Products tab lists; the "custom" segment is the seller's own selection and is not asked of the server */
export const candidatesQueryOf = (s: PromotionsUrlState): CandidatesQuery => ({
  segment: s.segment === "all" ? "all" : "recommended",
  status: s.candidateStatus,
  quick: s.quick,
  accountId: s.accountId,
  marketplace: s.marketplace,
  sort: s.sort,
  q: s.q,
  page: s.page,
  pageSize: s.pageSize,
});


type Key = "view" | "q" | "status" | "type" | "campaign" | "account" | "open" | "page" | "size" | "seg" | "quick" | "market" | "sort" | "when" | "ending";
type Patch = Partial<Record<Key, string | null>>;

/** The Promotions screen keeps view, tab, search, filters, page and the open campaign in the URL, so reload, back and deep links work. */
export function usePromotionsUrlState() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readUrlState(params), [params]);

  /** a filter or view change goes back to page 1; opening a drawer keeps the page; `replace` keeps typing out of the history */
  const update = useCallback(
    (patch: Patch, opts: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const onlyDrawer = Object.keys(patch).every((k) => k === "open");
          if (!("page" in patch) && !onlyDrawer) next.delete("page");
          for (const [key, value] of Object.entries(patch)) {
            next.delete(key);
            if (value !== null && value !== undefined && value !== "" && !(key === "view" && value === "overview")) next.set(key, value);
          }
          return next;
        },
        { replace: opts.replace },
      );
    },
    [setParams],
  );

  const clearFilters = useCallback(() => update({ q: null, status: null, type: null, campaign: null, account: null, quick: null, market: null, ending: null }), [update]);

  return { ...state, update, clearFilters };
}
