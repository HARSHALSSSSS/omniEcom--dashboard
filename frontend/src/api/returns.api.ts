import { client } from "./client";
import { ENDPOINTS } from "./endpoints";
import {
  ReturnOrder,
  CreateReturnInput,
  SubmitInspectionInput,
  ConfirmDispositionInput,
  ProcessRefundInput,
} from "@/types/returns";

export const returnsApi = {
  getReturns: async (params?: {
    status?: string;
    channel?: string;
    search?: string;
  }): Promise<ReturnOrder[]> => {
    const query = new URLSearchParams();
    if (params?.status) query.append("status", params.status);
    if (params?.channel) query.append("channel", params.channel);
    if (params?.search) query.append("search", params.search);

    const queryString = query.toString();
    const url = `${ENDPOINTS.RETURNS}${queryString ? `?${queryString}` : ""}`;
    const res = await client.get<{ data: ReturnOrder[]; meta?: any } | ReturnOrder[]>(url);

    if (Array.isArray(res.data)) {
      return res.data;
    }
    return res.data.data;
  },

  getReturn: async (id: string): Promise<ReturnOrder> => {
    const res = await client.get<{ data: ReturnOrder }>(ENDPOINTS.RETURN(id));
    return res.data.data;
  },

  createReturn: async (payload: CreateReturnInput): Promise<ReturnOrder> => {
    const res = await client.post<{ data: ReturnOrder }>(
      ENDPOINTS.RETURNS,
      payload
    );
    return res.data.data;
  },

  submitInspection: async (
    id: string,
    payload: SubmitInspectionInput
  ): Promise<ReturnOrder> => {
    const res = await client.post<{ data: ReturnOrder }>(
      ENDPOINTS.RETURN_ACTION(id, "inspect"),
      payload
    );
    return res.data.data;
  },

  confirmDisposition: async (
    id: string,
    payload: ConfirmDispositionInput
  ): Promise<ReturnOrder> => {
    const res = await client.post<{ data: ReturnOrder }>(
      ENDPOINTS.RETURN_ACTION(id, "disposition"),
      payload
    );
    return res.data.data;
  },

  processRefund: async (
    id: string,
    payload?: ProcessRefundInput
  ): Promise<ReturnOrder> => {
    const res = await client.post<{ data: ReturnOrder }>(
      ENDPOINTS.RETURN_ACTION(id, "refund"),
      payload || {}
    );
    return res.data.data;
  },

  retryRefund: async (id: string): Promise<ReturnOrder> => {
    const res = await client.post<{ data: ReturnOrder }>(
      ENDPOINTS.RETURN_ACTION(id, "retry-refund"),
      {}
    );
    return res.data.data;
  },
};
