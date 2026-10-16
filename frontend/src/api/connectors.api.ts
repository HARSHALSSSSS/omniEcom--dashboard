import { client } from "./client";
import { ENDPOINTS } from "./endpoints";
import {
  ChannelConnection,
  ConnectorDirectoryItem,
  ConnectChannelInput,
} from "@/types/connection";

export interface ConnectionsListResponse {
  data: ChannelConnection[];
  meta: {
    total: number;
    healthy: number;
    warning: number;
    error: number;
  };
}

export interface HealthOverviewResponse {
  data: {
    overallPulseScore: number;
    networkStatus: "optimal" | "degraded" | "critical";
    connectionsCount: number;
    totalActiveListings: number;
    totalPendingOrders: number;
    dataFlowLanes: Array<{
      lane: string;
      status: "healthy" | "warning" | "error";
      throughput: string;
      successRate: string;
    }>;
    connections: ChannelConnection[];
  };
}

export const connectorsApi = {
  getConnections: async (): Promise<ConnectionsListResponse> => {
    const res = await client.get<ConnectionsListResponse>(
      ENDPOINTS.CONNECTIONS,
    );
    return res.data;
  },

  getConnection: async (id: string): Promise<ChannelConnection> => {
    const res = await client.get<{ data: ChannelConnection }>(
      `${ENDPOINTS.CONNECTIONS}/${id}`,
    );
    return res.data.data;
  },

  getDirectory: async (): Promise<ConnectorDirectoryItem[]> => {
    const res = await client.get<{ data: ConnectorDirectoryItem[] }>(
      ENDPOINTS.CONNECTORS,
    );
    return res.data.data;
  },

  testConnection: async (
    connectionId: string,
  ): Promise<{ success: boolean; latencyMs: number; message: string }> => {
    const res = await client.post<{
      data: { success: boolean; latencyMs: number; message: string };
    }>(`${ENDPOINTS.CONNECTIONS}/${connectionId}/test`);
    return res.data.data;
  },

  syncConnection: async (
    connectionId: string,
  ): Promise<{
    success: boolean;
    connection: ChannelConnection;
    syncedItemsCount: number;
  }> => {
    const res = await client.post<{
      data: {
        success: boolean;
        connection: ChannelConnection;
        syncedItemsCount: number;
      };
    }>(`${ENDPOINTS.CONNECTIONS}/${connectionId}/sync`);
    return res.data.data;
  },

  createConnection: async (
    payload: ConnectChannelInput,
  ): Promise<ChannelConnection> => {
    const res = await client.post<{ data: ChannelConnection }>(
      ENDPOINTS.CONNECTIONS,
      payload,
    );
    return res.data.data;
  },

  disconnect: async (connectionId: string): Promise<void> => {
    await client.delete(`${ENDPOINTS.CONNECTIONS}/${connectionId}`);
  },

  getHealthOverview: async (): Promise<HealthOverviewResponse["data"]> => {
    const res = await client.get<HealthOverviewResponse>(
      ENDPOINTS.CONNECTIONS_HEALTH,
    );
    return res.data.data;
  },
};
