import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { CategoryNode } from "@/types/product";
import type {
  CampaignsPage,
  CampaignsQuery,
  CampaignWrite,
  CandidatesPage,
  CandidatesQuery,
  CategoryOption,
  CreateCampaignResult,
  LifecycleResult,
  PickerPage,
  PickerVariant,
  ProcessResult,
  ProductSelection,
  ProductsPage,
  ProductsQuery,
  PromotionAccount,
  PromotionCampaign,
  PromotionCampaignDetail,
  PromotionLifecycleAction,
  PromotionOverview,
  SelectionResult,
} from "@/types/promotions";

export function campaignParams(q: CampaignsQuery): Record<string, string | number> {
  const out: Record<string, string | number> = { pageSize: q.pageSize };
  if (q.page > 1) out.page = q.page;
  if (q.q) out.q = q.q;
  if (q.status) out["filter[status]"] = q.status;
  if (q.type) out["filter[type]"] = q.type;
  return out;
}

export function productParams(q: ProductsQuery): Record<string, string | number> {
  const out: Record<string, string | number> = { pageSize: q.pageSize };
  if (q.page > 1) out.page = q.page;
  if (q.q) out.q = q.q;
  if (q.status) out["filter[status]"] = q.status;
  if (q.campaignId) out["filter[campaignId]"] = q.campaignId;
  if (q.accountId) out["filter[accountId]"] = q.accountId;
  return out;
}

function flatten(nodes: CategoryNode[], trail: string[] = []): CategoryOption[] {
  return nodes.flatMap((n) => {
    const path = [...trail, n.name];
    return [{ id: n.id, label: path.join(" > ") }, ...flatten(n.children, path)];
  });
}

interface VariantListRow extends Omit<PickerVariant, "productTitle"> {
  productTitle: string;
}

export const promotionsApi = {
  overview: async (signal?: AbortSignal) => unwrap<PromotionOverview>(await client.get(ENDPOINTS.PROMOTIONS_OVERVIEW, { signal })),

  campaigns: async (query: CampaignsQuery, signal?: AbortSignal) =>
    unwrap<CampaignsPage>(await client.get(ENDPOINTS.PROMOTIONS_CAMPAIGNS, { params: campaignParams(query), signal })),

  products: async (query: ProductsQuery, signal?: AbortSignal) =>
    unwrap<ProductsPage>(await client.get(ENDPOINTS.PROMOTIONS_PRODUCTS, { params: productParams(query), signal })),

  campaign: async (id: string, signal?: AbortSignal) =>
    unwrap<PromotionCampaignDetail>(await client.get(ENDPOINTS.PROMOTION_CAMPAIGN(id), { signal })),

  /** products of one campaign (the same row shape as the cross-campaign list) */
  campaignProducts: async (id: string, query: Pick<ProductsQuery, "status" | "q" | "page" | "pageSize">, signal?: AbortSignal) => {
    const params: Record<string, string | number> = { pageSize: query.pageSize };
    if (query.page > 1) params.page = query.page;
    if (query.q) params.q = query.q;
    if (query.status) params["filter[status]"] = query.status;
    return unwrap<ProductsPage>(await client.get(ENDPOINTS.PROMOTION_CAMPAIGN_PRODUCTS(id), { params, signal }));
  },

  /** always creates a draft; `selection` fills its products in the same request */
  create: async (body: CampaignWrite & { selection?: ProductSelection }) =>
    unwrap<CreateCampaignResult>(await client.post(ENDPOINTS.PROMOTIONS_CAMPAIGNS, body)),

  update: async (id: string, body: Partial<CampaignWrite> & { version: number }) =>
    unwrap<PromotionCampaign>(await client.patch(ENDPOINTS.PROMOTION_CAMPAIGN(id), body)),

  remove: async (id: string, version?: number) =>
    unwrap<{ id: string }>(await client.delete(ENDPOINTS.PROMOTION_CAMPAIGN(id), { params: version === undefined ? undefined : { version } })),

  lifecycle: async (id: string, action: PromotionLifecycleAction, version?: number) =>
    unwrap<LifecycleResult>(await client.post(ENDPOINTS.PROMOTION_CAMPAIGN_ACTION(id, action), version === undefined ? {} : { version })),

  duplicate: async (id: string) => unwrap<PromotionCampaign>(await client.post(ENDPOINTS.PROMOTION_CAMPAIGN_ACTION(id, "duplicate"), {})),

  /** re-checks every product of a draft against prices, listings, margin floors and other campaigns */
  evaluate: async (id: string) => unwrap<{ campaign: PromotionCampaign }>(await client.post(ENDPOINTS.PROMOTION_CAMPAIGN_ACTION(id, "evaluate"), {})),

  setProducts: async (id: string, selection: ProductSelection, mode: "replace" | "add") =>
    unwrap<SelectionResult>(await client.put(ENDPOINTS.PROMOTION_CAMPAIGN_PRODUCTS(id), { ...selection, mode })),

  removeProducts: async (id: string, variantIds: string[]) =>
    unwrap<{ removed: number; total: number }>(await client.delete(ENDPOINTS.PROMOTION_CAMPAIGN_PRODUCTS(id), { params: { variantIds: variantIds.join(",") } })),

  /** starts due campaigns, ends finished ones and refreshes results now (the scheduler does it every minute) */
  process: async () => unwrap<ProcessResult>(await client.post(ENDPOINTS.PROMOTIONS_PROCESS, {})),

  /** the Products tab list: one product on one channel per row, with margin, stock, eligibility and the recommendation */
  candidates: async (query: CandidatesQuery, signal?: AbortSignal) => {
    const params: Record<string, string | number> = { pageSize: query.pageSize, "filter[segment]": query.segment };
    if (query.page > 1) params.page = query.page;
    if (query.q) params.q = query.q;
    if (query.status) params["filter[status]"] = query.status;
    if (query.accountId) params["filter[accountId]"] = query.accountId;
    return unwrap<CandidatesPage>(await client.get(ENDPOINTS.PROMOTIONS_CANDIDATES, { params, signal }));
  },

  /** connected accounts a campaign can target */
  accounts: async (): Promise<PromotionAccount[]> => {
    const res = await client.get<{ data: PromotionAccount[] }>(ENDPOINTS.MARKETPLACE_ACCOUNTS, { params: { limit: 100 } });
    return res.data.data.map((a) => ({ id: a.id, marketplace: a.marketplace, displayName: a.displayName, status: a.status }));
  },

  categories: async (): Promise<CategoryOption[]> => flatten(unwrap<CategoryNode[]>(await client.get(ENDPOINTS.CATEGORIES_TREE))),

  /** active variants to pick from, newest first through the API's cursor */
  variants: async (q: string, cursor: string | null, signal?: AbortSignal): Promise<PickerPage> => {
    const params: Record<string, string | number> = { limit: 25, "filter[status]": "active" };
    if (q) params.q = q;
    if (cursor) params.cursor = cursor;
    const res = await client.get<{ data: VariantListRow[]; meta: { nextCursor: string | null; hasMore: boolean } }>(ENDPOINTS.VARIANTS, { params, signal });
    return {
      items: res.data.data.map((v) => ({
        id: v.id,
        productId: v.productId,
        sku: v.sku,
        productTitle: v.productTitle,
        optionValues: v.optionValues,
        sellingPriceMinor: v.sellingPriceMinor,
        status: v.status,
      })),
      nextCursor: res.data.meta.nextCursor,
      hasMore: res.data.meta.hasMore,
    };
  },
};
