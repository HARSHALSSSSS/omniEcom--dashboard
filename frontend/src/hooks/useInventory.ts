import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  inventoryApi,
  InventoryLedgerResponse,
} from "@/api/inventory.api";
import {
  InventorySummaryKPIs,
  StockMovement,
  AdjustStockInput,
  TransferStockInput,
} from "@/types/inventory";
import { useToast } from "@/hooks/useToast";

export const INVENTORY_KEYS = {
  all: ["inventory"] as const,
  summary: () => ["inventory", "summary"] as const,
  ledger: (params?: { status?: string; search?: string }) =>
    ["inventory", "ledger", params] as const,
  movements: () => ["inventory", "movements"] as const,
};

export function useInventorySummary() {
  return useQuery<InventorySummaryKPIs>({
    queryKey: INVENTORY_KEYS.summary(),
    queryFn: inventoryApi.getSummary,
  });
}

export function useInventoryLedger(params?: { status?: string; search?: string }) {
  return useQuery<InventoryLedgerResponse>({
    queryKey: INVENTORY_KEYS.ledger(params),
    queryFn: () => inventoryApi.getLedger(params),
  });
}

export function useStockMovements() {
  return useQuery<StockMovement[]>({
    queryKey: INVENTORY_KEYS.movements(),
    queryFn: inventoryApi.getMovements,
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: AdjustStockInput) =>
      inventoryApi.adjustStock(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: INVENTORY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast({
        title: "Stock adjusted",
        description: `${res.item.sku}: New available balance is ${res.item.totalAvailable} units.`,
      });
    },
    onError: () => {
      toast({
        title: "Adjustment failed",
        description: "Failed to record manual stock adjustment.",
        variant: "destructive",
      });
    },
  });
}

export function useTransferStock() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (payload: TransferStockInput) =>
      inventoryApi.transferStock(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVENTORY_KEYS.all });
      toast({
        title: "Transfer initiated",
        description: "Inter-warehouse transit record logged.",
      });
    },
  });
}

export function useSyncInventoryChannels() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: () => inventoryApi.syncAllChannels(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: INVENTORY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["connectors"] });
      toast({
        title: "Channels synchronized",
        description: `Synced real-time inventory for ${res.syncedSkusCount} SKUs across 4 channels.`,
      });
    },
    onError: () => {
      toast({
        title: "Inventory sync failed",
        description: "Could not push stock deltas to marketplaces.",
        variant: "destructive",
      });
    },
  });
}
