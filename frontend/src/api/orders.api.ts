import { client } from "./client";
import { ENDPOINTS } from "./endpoints";
import {
  Order,
  OrdersSummaryKPIs,
  FulfillmentBatch,
  ReturnOrder,
} from "@/types/orders";
import { OrderStatus } from "@/constants/enums";

export interface OrdersListResponse {
  data: Order[];
  meta: {
    total: number;
    new: number;
    confirmed: number;
    picking: number;
    packing: number;
    dispatched: number;
  };
}

export const ordersApi = {
  getSummary: async (): Promise<OrdersSummaryKPIs> => {
    const res = await client.get<{ data: OrdersSummaryKPIs }>(
      ENDPOINTS.ORDERS_SUMMARY,
    );
    return res.data.data;
  },

  getOrders: async (params?: {
    status?: string;
    channel?: string;
    search?: string;
  }): Promise<OrdersListResponse> => {
    const query = new URLSearchParams();
    if (params?.status) query.append("status", params.status);
    if (params?.channel) query.append("channel", params.channel);
    if (params?.search) query.append("search", params.search);

    const queryString = query.toString();
    const url = `${ENDPOINTS.ORDERS}${queryString ? `?${queryString}` : ""}`;
    const res = await client.get<OrdersListResponse>(url);
    return res.data;
  },

  getOrder: async (id: string): Promise<Order> => {
    const res = await client.get<{ data: Order }>(`${ENDPOINTS.ORDERS}/${id}`);
    return res.data.data;
  },

  updateOrderStatus: async (
    id: string,
    nextStatus: OrderStatus,
  ): Promise<Order> => {
    const res = await client.post<{ data: Order }>(
      `${ENDPOINTS.ORDERS}/${id}/action`,
      { nextStatus },
    );
    return res.data.data;
  },

  getFulfillmentQueue: async (): Promise<{
    batches: FulfillmentBatch[];
    unbatchedOrders: Order[];
  }> => {
    const res = await client.get<{
      data: { batches: FulfillmentBatch[]; unbatchedOrders: Order[] };
    }>(ENDPOINTS.FULFILLMENT_QUEUE);
    return res.data.data;
  },

  getReturns: async (): Promise<ReturnOrder[]> => {
    const res = await client.get<{ data: ReturnOrder[] }>(
      ENDPOINTS.RETURNS,
    );
    return res.data.data;
  },
};
