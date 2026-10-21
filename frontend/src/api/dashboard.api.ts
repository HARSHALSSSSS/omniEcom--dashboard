import { client, unwrap } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { Dashboard, SalesPeriod } from "@/types/dashboard";

export const dashboardApi = {
  /** the whole home screen in one call; the sales chart covers `salesPeriod` days ending today (business time zone) */
  get: async (salesPeriod: SalesPeriod, signal?: AbortSignal) =>
    unwrap<Dashboard>(await client.get(ENDPOINTS.DASHBOARD, { params: { salesPeriod }, signal })),

  /** closes the recommendation without any change */
  rejectRecommendation: async (id: string) => {
    await client.post(ENDPOINTS.AI_RECOMMENDATION_REJECT(id), {});
  },
};
