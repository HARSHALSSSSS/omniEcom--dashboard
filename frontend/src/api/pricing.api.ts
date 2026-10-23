import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type {
  BulkDecisionResult,
  CompetitorImportResult,
  CompetitorPrice,
  CompetitorWrite,
  CompetitorsPage,
  CompetitorsQuery,
  DecisionAction,
  DecisionResult,
  GenerateInput,
  GenerateResponse,
  HistoryPage,
  HistoryQuery,
  MarginOverview,
  PriceTablePage,
  PriceTableQuery,
  PriceProposal,
  PricingOverview,
  PricingPolicy,
  PolicyWrite,
  ProposalsPage,
  ProposalsQuery,
  VariantOption,
} from "@/types/pricing";

/** the list filters in the API's `filter[...]` style; empty values are left out */
export function proposalParams(query: ProposalsQuery): Record<string, string | number> {
  const params: Record<string, string | number> = { sort: query.sort, pageSize: query.pageSize };
  if (query.tab !== "all") params["filter[status]"] = query.tab;
  if (query.accountId) params["filter[accountId]"] = query.accountId;
  if (query.strategy) params["filter[strategy]"] = query.strategy;
  if (query.q) params.q = query.q;
  if (query.page > 1) params.page = query.page;
  return params;
}

export function priceTableParams(query: PriceTableQuery): Record<string, string | number> {
  const params: Record<string, string | number> = { sort: query.sort, pageSize: query.pageSize };
  if (query.accountId) params["filter[accountId]"] = query.accountId;
  if (query.state) params["filter[state]"] = query.state;
  if (query.q) params.q = query.q;
  if (query.page > 1) params.page = query.page;
  return params;
}

export function competitorParams(query: CompetitorsQuery): Record<string, string | number> {
  const params: Record<string, string | number> = { pageSize: query.pageSize, latest: query.latest ? "true" : "false" };
  if (query.accountId) params["filter[accountId]"] = query.accountId;
  if (query.q) params.q = query.q;
  if (query.page > 1) params.page = query.page;
  return params;
}

export const HISTORY_PAGE = 50;

export const pricingApi = {
  overview: async (signal?: AbortSignal) => unwrap<PricingOverview>(await client.get(ENDPOINTS.PRICING_OVERVIEW, { signal })),

  /** per-channel margins and totals from real cost, fee and policy data */
  marginOverview: async (accountId?: string, signal?: AbortSignal) =>
    unwrap<MarginOverview>(await client.get(ENDPOINTS.PRICING_MARGIN_OVERVIEW, { params: accountId ? { "filter[accountId]": accountId } : {}, signal })),

  priceTable: async (query: PriceTableQuery, signal?: AbortSignal) =>
    unwrap<PriceTablePage>(await client.get(ENDPOINTS.PRICING_PRICE_TABLE, { params: priceTableParams(query), signal })),

  proposals: async (query: ProposalsQuery, signal?: AbortSignal) =>
    unwrap<ProposalsPage>(await client.get(ENDPOINTS.PRICING_PROPOSALS, { params: proposalParams(query), signal })),

  proposal: async (id: string, signal?: AbortSignal) => unwrap<PriceProposal>(await client.get(ENDPOINTS.PRICING_PROPOSAL(id), { signal })),

  /** approve applies the price (and queues the marketplace push); reject keeps the current price. `version` is the one the reviewer saw. */
  decide: async (id: string, action: DecisionAction, body: { version: number; note?: string }) =>
    unwrap<DecisionResult>(await client.post(ENDPOINTS.PRICING_PROPOSAL_ACTION(id, action), body)),

  /** a 200 with a result per proposal, even when some failed */
  bulkDecide: async (ids: string[], action: DecisionAction, note?: string) =>
    unwrap<BulkDecisionResult>(await client.post(ENDPOINTS.PRICING_PROPOSALS_BULK, { ids, action, ...(note ? { note } : {}) })),

  /** 200 with the result, or 202 when the work was queued as a background job */
  generate: async (input: GenerateInput) => unwrap<GenerateResponse>(await client.post(ENDPOINTS.PRICING_PROPOSALS_GENERATE, input)),

  // ---- policies
  policies: async (signal?: AbortSignal) => unwrap<PricingPolicy[]>(await client.get(ENDPOINTS.PRICING_POLICIES, { signal })),
  policyPreview: async (accountId: string | null, signal?: AbortSignal) =>
    unwrap<{ affectedVariants: number }>(await client.post(ENDPOINTS.PRICING_POLICIES_PREVIEW, { accountId }, { signal })),
  createPolicy: async (body: PolicyWrite) => unwrap<PricingPolicy>(await client.post(ENDPOINTS.PRICING_POLICIES, body)),
  updatePolicy: async (id: string, patch: Partial<PolicyWrite>, version: number) =>
    unwrap<PricingPolicy>(await client.patch(ENDPOINTS.PRICING_POLICY(id), { ...patch, version })),
  deletePolicy: async (id: string) => unwrap<{ deleted: true }>(await client.delete(ENDPOINTS.PRICING_POLICY(id))),

  // ---- competitor prices
  competitors: async (query: CompetitorsQuery, signal?: AbortSignal) =>
    unwrap<CompetitorsPage>(await client.get(ENDPOINTS.PRICING_COMPETITOR_PRICES, { params: competitorParams(query), signal })),
  addCompetitor: async (body: CompetitorWrite) =>
    unwrap<CompetitorPrice>(
      await client.post(ENDPOINTS.PRICING_COMPETITOR_PRICES, {
        variantId: body.variantId,
        accountId: body.accountId,
        priceMinor: body.priceMinor,
        sellerName: body.sellerName,
        observedAt: body.observedAt,
      }),
    ),
  importCompetitors: async (csv: string) => unwrap<CompetitorImportResult>(await client.post(ENDPOINTS.PRICING_COMPETITOR_PRICES_IMPORT, { csv })),
  deleteCompetitor: async (id: string) => unwrap<{ deleted: true }>(await client.delete(ENDPOINTS.PRICING_COMPETITOR_PRICE(id))),

  /** the SKU / title search of the competitor form (catalog variants) */
  searchVariants: async (q: string, signal?: AbortSignal): Promise<VariantOption[]> => {
    const res = await client.get<{ data: Array<{ id: string; sku: string; productTitle: string }> }>(ENDPOINTS.VARIANTS, { params: { q, limit: 10 }, signal });
    return res.data.data.map((v) => ({ id: v.id, sku: v.sku, productTitle: v.productTitle }));
  },

  // ---- audit log of price changes (newest first, keyset paged with `before`)
  history: async (query: HistoryQuery, before: number | null, signal?: AbortSignal) => {
    const params: Record<string, string | number> = { include: "names", limit: HISTORY_PAGE };
    if (query.accountId) params["filter[accountId]"] = query.accountId;
    if (query.field) params["filter[field]"] = query.field;
    if (before !== null) params.before = before;
    return unwrap<HistoryPage>(await client.get(ENDPOINTS.PRICING_HISTORY, { params, signal }));
  },
};
