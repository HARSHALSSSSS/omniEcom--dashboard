import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { shippingApi } from "@/api/shipping.api";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { AddCarrierInput, NdrAction, ShipmentsQuery } from "@/types/shipping";

export const SHIPPING_KEYS = {
  all: ["shipping"] as const,
  summary: (businessId: string | undefined, days: number) => ["shipping", "summary", businessId, days] as const,
  shipments: (businessId: string | undefined, query: ShipmentsQuery) => ["shipping", "shipments", businessId, query] as const,
  carriers: (businessId: string | undefined) => ["shipping", "carriers", businessId] as const,
  catalog: (businessId: string | undefined) => ["shipping", "catalog", businessId] as const,
  warehouses: (businessId: string | undefined) => ["shipping", "warehouses", businessId] as const,
  tracking: (id: string) => ["shipping", "tracking", id] as const,
  ndr: (id: string) => ["shipping", "ndr", id] as const,
  manifests: (businessId: string | undefined) => ["shipping", "manifests", businessId] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

/** the carrier ribbon */
export function useShippingSummary(days: number) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: SHIPPING_KEYS.summary(businessId, days), queryFn: ({ signal }) => shippingApi.summary(days, signal), staleTime: 30_000 });
}

/** one numbered page; the previous page stays on screen while the next one loads */
export function useShipments(query: ShipmentsQuery) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: SHIPPING_KEYS.shipments(businessId, query),
    queryFn: ({ signal }) => shippingApi.shipments(query, signal),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function useCarriers(enabled = true) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: SHIPPING_KEYS.carriers(businessId), queryFn: ({ signal }) => shippingApi.carriers(signal), enabled, staleTime: 30_000 });
}

export function useProviderCatalog(enabled: boolean) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: SHIPPING_KEYS.catalog(businessId), queryFn: shippingApi.providerCatalog, enabled, staleTime: 5 * 60_000 });
}

export function useShippingWarehouses() {
  const businessId = useBusinessId();
  return useQuery({ queryKey: SHIPPING_KEYS.warehouses(businessId), queryFn: shippingApi.warehouses, staleTime: 5 * 60_000, retry: false });
}

export function useTracking(shipmentId: string | null) {
  return useQuery({ queryKey: SHIPPING_KEYS.tracking(shipmentId ?? ""), queryFn: ({ signal }) => shippingApi.tracking(shipmentId as string, signal), enabled: Boolean(shipmentId) });
}

export function useNdrCases(shipmentId: string | null, enabled: boolean) {
  return useQuery({ queryKey: SHIPPING_KEYS.ndr(shipmentId ?? ""), queryFn: ({ signal }) => shippingApi.ndrCases(shipmentId as string, signal), enabled: Boolean(shipmentId) && enabled });
}

export function useManifests(enabled: boolean) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: SHIPPING_KEYS.manifests(businessId), queryFn: ({ signal }) => shippingApi.manifests(signal), enabled });
}

/** labels are fetched for printing: nothing on the screen changes */
export function useBulkLabels() {
  return useMutation({ mutationFn: (ids: string[]) => shippingApi.bulkLabels(ids) });
}

export function useShipmentLabel() {
  return useMutation({ mutationFn: (id: string) => shippingApi.label(id) });
}

export function useAddCarrier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddCarrierInput) => shippingApi.addCarrier(input),
    // the carrier exists even when its check failed: the list must show it
    onSettled: () => qc.invalidateQueries({ queryKey: SHIPPING_KEYS.all }),
  });
}

export function useVerifyCarrier() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => shippingApi.verifyCarrier(id), onSettled: () => qc.invalidateQueries({ queryKey: SHIPPING_KEYS.all }) });
}

export function useRefreshTracking() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => shippingApi.refreshTracking(id), onSettled: () => qc.invalidateQueries({ queryKey: SHIPPING_KEYS.all }) });
}

export function useCancelShipment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { id: string; reason?: string }) => shippingApi.cancelShipment(v.id, v.reason), onSettled: () => qc.invalidateQueries({ queryKey: SHIPPING_KEYS.all }) });
}

export function useNdrAction() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { id: string; action: NdrAction; note?: string }) => shippingApi.ndrAction(v.id, v.action, v.note), onSettled: () => qc.invalidateQueries({ queryKey: SHIPPING_KEYS.all }) });
}
