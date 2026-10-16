import { client } from "./client";
import { ENDPOINTS } from "./endpoints";
import { NeedsAttentionItem } from "@/types/attention";

export interface AttentionListResponse {
  data: NeedsAttentionItem[];
  meta: {
    total: number;
    openCount: number;
    criticalCount: number;
    highCount: number;
  };
}

export const attentionApi = {
  getItems: async (params?: {
    status?: string;
    priority?: string;
  }): Promise<AttentionListResponse> => {
    const query = new URLSearchParams();
    if (params?.status) query.append("status", params.status);
    if (params?.priority) query.append("priority", params.priority);

    const queryString = query.toString();
    const url = `${ENDPOINTS.NEEDS_ATTENTION}${queryString ? `?${queryString}` : ""}`;
    const res = await client.get<AttentionListResponse>(url);
    return res.data;
  },

  takeAction: async (
    id: string,
    action: "resolve" | "snooze" | "in_progress",
    snoozeHours?: number,
  ): Promise<NeedsAttentionItem> => {
    const res = await client.post<{ data: NeedsAttentionItem }>(
      `${ENDPOINTS.NEEDS_ATTENTION}/${id}/action`,
      { action, snoozeHours },
    );
    return res.data.data;
  },
};
