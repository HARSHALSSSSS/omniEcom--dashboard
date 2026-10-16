import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  connectorsApi,
  ConnectionsListResponse,
  HealthOverviewResponse,
} from "@/api/connectors.api";
import { ConnectChannelInput, ChannelConnection } from "@/types/connection";
import { useToast } from "@/hooks/useToast";

export const CONNECTOR_KEYS = {
  all: ["connectors"] as const,
  connections: () => ["connectors", "connections"] as const,
  connection: (id: string) => ["connectors", "connection", id] as const,
  directory: () => ["connectors", "directory"] as const,
  health: () => ["connectors", "health"] as const,
};

export function useConnections() {
  return useQuery<ConnectionsListResponse>({
    queryKey: CONNECTOR_KEYS.connections(),
    queryFn: connectorsApi.getConnections,
  });
}

export function useConnection(id: string | null) {
  return useQuery<ChannelConnection>({
    queryKey: CONNECTOR_KEYS.connection(id ?? ""),
    queryFn: () => (id ? connectorsApi.getConnection(id) : Promise.reject(new Error("No id"))),
    enabled: Boolean(id),
  });
}

export function useConnectorDirectory() {
  return useQuery({
    queryKey: CONNECTOR_KEYS.directory(),
    queryFn: connectorsApi.getDirectory,
  });
}

export function useConnectorHealth() {
  return useQuery<HealthOverviewResponse["data"]>({
    queryKey: CONNECTOR_KEYS.health(),
    queryFn: connectorsApi.getHealthOverview,
  });
}

export function useSyncConnection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (connectionId: string) =>
      connectorsApi.syncConnection(connectionId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({
        queryKey: CONNECTOR_KEYS.connections(),
      });
      queryClient.invalidateQueries({
        queryKey: CONNECTOR_KEYS.connection(res.connection.id),
      });
      toast({
        title: "Synchronization complete",
        description: `Successfully synced ${res.connection.name}.`,
      });
    },
    onError: () => {
      toast({
        title: "Sync failed",
        description: "Failed to communicate with marketplace gateway.",
        variant: "destructive",
      });
    },
  });
}

export function useTestConnection() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: (connectionId: string) =>
      connectorsApi.testConnection(connectionId),
    onSuccess: (res) => {
      toast({
        title: "Connection verified",
        description: `${res.message} (Ping: ${res.latencyMs}ms)`,
      });
    },
    onError: () => {
      toast({
        title: "Connection test failed",
        description: "Could not reach endpoint. Verify API credentials or permissions.",
        variant: "destructive",
      });
    },
  });
}

export function useCreateConnection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: ConnectChannelInput) =>
      connectorsApi.createConnection(payload),
    onSuccess: (newConn) => {
      queryClient.invalidateQueries({
        queryKey: CONNECTOR_KEYS.connections(),
      });
      queryClient.invalidateQueries({ queryKey: CONNECTOR_KEYS.directory() });
      toast({
        title: "Channel connected!",
        description: `${newConn.name} is now connected and operational.`,
      });
    },
    onError: () => {
      toast({
        title: "Authorization failed",
        description: "Failed to complete connector authorization.",
        variant: "destructive",
      });
    },
  });
}

export function useDisconnectConnection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (connectionId: string) =>
      connectorsApi.disconnect(connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: CONNECTOR_KEYS.connections(),
      });
      queryClient.invalidateQueries({ queryKey: CONNECTOR_KEYS.directory() });
      toast({
        title: "Channel disconnected",
        description: "Credentials and sync schedules removed.",
      });
    },
  });
}
