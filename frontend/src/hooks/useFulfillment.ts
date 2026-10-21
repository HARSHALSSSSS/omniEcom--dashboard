import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fulfillmentApi } from "@/api/fulfillment.api";
import { refreshShell } from "@/lib/session";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { ActionInput, ExceptionsQuery, QueueQuery, ResolveInput } from "@/types/fulfillment";

export const FULFILLMENT_KEYS = {
  all: ["fulfillment"] as const,
  queue: (businessId: string | undefined, query: QueueQuery) => ["fulfillment", "queue", businessId, query] as const,
  exceptions: (businessId: string | undefined, query: ExceptionsQuery) => ["fulfillment", "exceptions", businessId, query] as const,
  workspace: (orderId: string, fulfillmentId: string | undefined) => ["fulfillment", "workspace", orderId, fulfillmentId ?? null] as const,
  warehouses: (businessId: string | undefined) => ["fulfillment", "warehouses", businessId] as const,
  carriers: (businessId: string | undefined) => ["fulfillment", "carriers", businessId] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

/** one numbered page of the queue; the previous page stays on screen while the next one loads */
export function useFulfillmentQueue(query: QueueQuery) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: FULFILLMENT_KEYS.queue(businessId, query),
    queryFn: ({ signal }) => fulfillmentApi.queue(query, signal),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function useFulfillmentExceptions(query: ExceptionsQuery, enabled: boolean) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: FULFILLMENT_KEYS.exceptions(businessId, query),
    queryFn: ({ signal }) => fulfillmentApi.exceptions(query, signal),
    enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function useFulfillmentWorkspace(orderId: string | null, fulfillmentId?: string) {
  return useQuery({
    queryKey: FULFILLMENT_KEYS.workspace(orderId ?? "", fulfillmentId),
    queryFn: ({ signal }) => fulfillmentApi.workspace(orderId as string, fulfillmentId, signal),
    enabled: Boolean(orderId),
  });
}

export function useFulfillmentWarehouses() {
  const businessId = useBusinessId();
  return useQuery({ queryKey: FULFILLMENT_KEYS.warehouses(businessId), queryFn: fulfillmentApi.warehouses, staleTime: 5 * 60_000, retry: false });
}

/** the carriers to filter by and hand over to (needs shipping:read) */
export function useFulfillmentCarriers(enabled: boolean) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: FULFILLMENT_KEYS.carriers(businessId), queryFn: fulfillmentApi.carriers, enabled, staleTime: 5 * 60_000, retry: false });
}

/** every write changes the queue, the order screens and the badges in the sidebar */
function useAfterWrite() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: FULFILLMENT_KEYS.all });
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    refreshShell().catch(() => undefined);
  };
}

/** an action answers with the fresh workspace, which replaces the drawer's data straight away */
export function useFulfillmentAction() {
  const queryClient = useQueryClient();
  const afterWrite = useAfterWrite();
  return useMutation({
    mutationFn: (input: ActionInput) => fulfillmentApi.act(input),
    onSuccess: (res, input) => {
      queryClient.setQueryData(FULFILLMENT_KEYS.workspace(input.orderId, input.fulfillmentId), res.workspace);
      afterWrite();
    },
    onError: afterWrite,
  });
}

export function useBatchHandover() {
  const afterWrite = useAfterWrite();
  return useMutation({ mutationFn: (input: { carrier: string; orderIds: string[] }) => fulfillmentApi.batchHandover(input.carrier, input.orderIds), onSuccess: afterWrite });
}

export function useCreatePickList() {
  const afterWrite = useAfterWrite();
  return useMutation({ mutationFn: (fulfillmentIds: string[]) => fulfillmentApi.createPickList(fulfillmentIds), onSuccess: afterWrite });
}

export function useResolveException() {
  const afterWrite = useAfterWrite();
  return useMutation({ mutationFn: (input: ResolveInput) => fulfillmentApi.resolveException(input), onSuccess: afterWrite });
}
