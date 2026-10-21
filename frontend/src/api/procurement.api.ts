import { client } from "./client";
import { ENDPOINTS } from "./endpoints";
import type { Supplier, PurchaseOrder } from "@/types/procurement";

export interface ProcurementOverviewResponse {
  suppliers: Supplier[];
  orders: PurchaseOrder[];
}

export const procurementApi = {
  getOverview: async (): Promise<ProcurementOverviewResponse> => {
    const res = await client.get<ProcurementOverviewResponse>(ENDPOINTS.PROCUREMENT_OVERVIEW);
    return res.data;
  },

  getSuppliers: async (): Promise<{ suppliers: Supplier[] }> => {
    const res = await client.get<{ suppliers: Supplier[] }>(ENDPOINTS.SUPPLIERS);
    return res.data;
  },

  getPurchaseOrders: async (): Promise<{ orders: PurchaseOrder[] }> => {
    const res = await client.get<{ orders: PurchaseOrder[] }>(ENDPOINTS.PURCHASE_ORDERS);
    return res.data;
  },
};
