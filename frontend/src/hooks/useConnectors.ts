import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  connectorsApi,
  ConnectionsListResponse,
  HealthOverviewResponse,
} from "@/api/connectors.api";
import { ConnectChannelInput, ChannelConnection } from "@/types/connection";
import type { HubSyncJob } from "@/types/hub";
import { useToast } from "@/hooks/useToast";
import { refreshShell } from "@/lib/session";
import { errorMessage } from "@/api/errors";

/** all under the "hub" prefix, so every hub write (sync, test, disconnect, ...) refreshes these too */
export const CONNECTOR_KEYS = {
  all: ["hub", "connectors"] as const,
  connections: () => ["hub", "connectors", "connections"] as const,
  connection: (id: string) => ["hub", "connectors", "connection", id] as const,
  directory: () => ["hub", "connectors", "directory"] as const,
  health: () => ["hub", "connectors", "health"] as const,
  syncJobs: () => ["hub", "connectors", "sync-jobs"] as const,
};

export function useConnections() {
  return useQuery<ConnectionsListResponse>({
    queryKey: CONNECTOR_KEYS.connections(),
    queryFn: connectorsApi.getConnections,
    staleTime: 15_000,
    refetchInterval: (q) =>
      q.state.data?.data.some((c) => c.syncState === "syncing") ? 4000 : false,
  });
}

export function useConnection(id: string | null) {
  return useQuery<ChannelConnection>({
    queryKey: CONNECTOR_KEYS.connection(id ?? ""),
    queryFn: () => (id ? connectorsApi.getConnection(id) : Promise.reject(new Error("No id"))),
    enabled: Boolean(id),
    staleTime: 15_000,
    refetchInterval: (q) => (q.state.data?.syncState === "syncing" ? 4000 : false),
  });
}

export function useConnectorDirectory() {
  return useQuery({
    queryKey: CONNECTOR_KEYS.directory(),
    queryFn: connectorsApi.getDirectory,
    staleTime: 60_000,
  });
}

export function useConnectorHealth() {
  return useQuery<HealthOverviewResponse["data"]>({
    queryKey: CONNECTOR_KEYS.health(),
    queryFn: connectorsApi.getHealthOverview,
    staleTime: 15_000,
    // the screen is a live monitor: keep it fresh, also when the tab is in the background
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
}

export function useSyncConnection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (connectionId: string) =>
      connectorsApi.syncConnection(connectionId),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({
        queryKey: CONNECTOR_KEYS.connections(),
      });
      void queryClient.invalidateQueries({
        queryKey: CONNECTOR_KEYS.connection(res.connection.id),
      });
      void queryClient.invalidateQueries({ queryKey: ["hub"] });
      void queryClient.invalidateQueries({ queryKey: CONNECTOR_KEYS.health() });
      toast({
        title: "Synchronization started",
        description: `Successfully queued sync for ${res.connection.name}.`,
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Sync failed",
        description: errorMessage(err) || "Failed to communicate with marketplace gateway.",
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
        title: res.success ? "Connection verified" : "Verification notice",
        description: `${res.message} (Ping: ${res.latencyMs}ms)`,
        variant: res.success ? "default" : "destructive",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Connection test failed",
        description: errorMessage(err) || "Could not reach endpoint. Verify API credentials or permissions.",
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
      void queryClient.invalidateQueries({
        queryKey: CONNECTOR_KEYS.connections(),
      });
      void queryClient.invalidateQueries({ queryKey: CONNECTOR_KEYS.directory() });
      void queryClient.invalidateQueries({ queryKey: ["hub"] });
      void queryClient.invalidateQueries({ queryKey: CONNECTOR_KEYS.health() });
      void refreshShell().catch(() => undefined);
      toast({
        title: "Channel connected!",
        description: `${newConn.name} is now connected and operational.`,
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Authorization failed",
        description: errorMessage(err) || "Failed to complete connector authorization.",
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
      void queryClient.invalidateQueries({
        queryKey: CONNECTOR_KEYS.connections(),
      });
      void queryClient.invalidateQueries({ queryKey: CONNECTOR_KEYS.directory() });
      void queryClient.invalidateQueries({ queryKey: ["hub"] });
      void queryClient.invalidateQueries({ queryKey: CONNECTOR_KEYS.health() });
      void refreshShell().catch(() => undefined);
      toast({
        title: "Channel disconnected",
        description: "Credentials and sync schedules removed.",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Disconnect failed",
        description: errorMessage(err) || "Failed to disconnect channel.",
        variant: "destructive",
      });
    },
  });
}

export function useRecentSyncJobs() {
  return useQuery<HubSyncJob[]>({
    queryKey: CONNECTOR_KEYS.syncJobs(),
    queryFn: connectorsApi.getRecentSyncJobs,
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  });
}

export function useRetrySyncJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (jobId: string) => connectorsApi.retrySyncJob(jobId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONNECTOR_KEYS.syncJobs() });
      void queryClient.invalidateQueries({ queryKey: CONNECTOR_KEYS.health() });
      void queryClient.invalidateQueries({ queryKey: CONNECTOR_KEYS.connections() });
      toast({
        title: "Sync job retried",
        description: "The sync job has been re-queued for processing.",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Retry failed",
        description: errorMessage(err) || "Failed to retry sync job.",
        variant: "destructive",
      });
    },
  });
}
