import { client } from "./client";
import { ENDPOINTS } from "./endpoints";
import {
  InventoryItem,
  InventorySummaryKPIs,
  StockMovement,
  AdjustStockInput,
  TransferStockInput,
} from "@/types/inventory";

export interface InventoryLedgerResponse {
  data: InventoryItem[];
  meta: {
    total: number;
  };
}

export const inventoryApi = {
  getSummary: async (): Promise<InventorySummaryKPIs> => {
    const res = await client.get<{ data: InventorySummaryKPIs }>(
      ENDPOINTS.INVENTORY_SUMMARY,
    );
    return res.data.data;
  },

  getLedger: async (params?: {
    status?: string;
    search?: string;
  }): Promise<InventoryLedgerResponse> => {
    const query = new URLSearchParams();
    if (params?.status) query.append("status", params.status);
    if (params?.search) query.append("search", params.search);

    const queryString = query.toString();
    const url = `${ENDPOINTS.INVENTORY_LEDGER}${queryString ? `?${queryString}` : ""}`;
    const res = await client.get<InventoryLedgerResponse>(url);
    return res.data;
  },

  getMovements: async (): Promise<StockMovement[]> => {
    const res = await client.get<{ data: StockMovement[] }>(
      ENDPOINTS.INVENTORY_MOVEMENTS,
    );
    return res.data.data;
  },

  adjustStock: async (
    payload: AdjustStockInput,
  ): Promise<{ success: boolean; item: InventoryItem; movement: StockMovement }> => {
    const res = await client.post<{
      data: { success: boolean; item: InventoryItem; movement: StockMovement };
    }>(ENDPOINTS.INVENTORY_ADJUST, payload);
    return res.data.data;
  },

  transferStock: async (
    payload: TransferStockInput,
  ): Promise<{ success: boolean; movement: StockMovement }> => {
    const res = await client.post<{
      data: { success: boolean; movement: StockMovement };
    }>(ENDPOINTS.INVENTORY_TRANSFER, payload);
    return res.data.data;
  },

  syncAllChannels: async (): Promise<{
    success: boolean;
    syncedChannels: string[];
    syncedSkusCount: number;
  }> => {
    const res = await client.post<{
      data: {
        success: boolean;
        syncedChannels: string[];
        syncedSkusCount: number;
      };
    }>(ENDPOINTS.INVENTORY_SYNC);
    return res.data.data;
  },
};
