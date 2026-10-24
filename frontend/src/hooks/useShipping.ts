import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { shippingApi } from "@/api/shipping.api";
import { useWorkspaceStore } from "@/store/workspace.store";
import type {
  AddMethodInput,
  BulkOrderAction,
  DecisionQuery,
  MethodKind,
  MethodPatch,
  NdrAction,
  PickupSlotInput,
  RuleInput,
  SelectionInput,
  ShipmentsQuery,
  TrackingQuery,
} from "@/types/shipping";
import { SYNC_RUNNING } from "@/types/shipping";

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
  methods: (businessId: string | undefined) => ["shipping", "methods", businessId] as const,
  capability: (id: string) => ["shipping", "capability", id] as const,
  decisions: (businessId: string | undefined, query: DecisionQuery) => ["shipping", "decisions", businessId, query] as const,
  options: (id: string) => ["shipping", "options", id] as const,
  overview: (businessId: string | undefined) => ["shipping", "overview", businessId] as const,
  exceptions: (businessId: string | undefined) => ["shipping", "exceptions", businessId] as const,
  trackingList: (businessId: string | undefined, query: TrackingQuery) => ["shipping", "tracking-list", businessId, query] as const,
  trackingFailures: (businessId: string | undefined) => ["shipping", "tracking-failures", businessId] as const,
  rules: (businessId: string | undefined) => ["shipping", "rules", businessId] as const,
  syncLatest: (businessId: string | undefined) => ["shipping", "sync-latest", businessId] as const,
  syncJob: (id: string) => ["shipping", "sync-job", id] as const,
  shipmentRow: (id: string) => ["shipping", "shipment-row", id] as const,
  pickupSlots: (businessId: string | undefined) => ["shipping", "pickup-slots", businessId] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

/** the carrier ribbon */
export function useShippingSummary(days: number, enabled = true) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: SHIPPING_KEYS.summary(businessId, days), queryFn: ({ signal }) => shippingApi.summary(days, signal), enabled, staleTime: 30_000 });
}

/** one numbered page; the previous page stays on screen while the next one loads */
export function useShipments(query: ShipmentsQuery, enabled = true) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: SHIPPING_KEYS.shipments(businessId, query),
    queryFn: ({ signal }) => shippingApi.shipments(query, signal),
    enabled,
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

// ---- methods
export function useShippingMethods() {
  const businessId = useBusinessId();
  return useQuery({ queryKey: SHIPPING_KEYS.methods(businessId), queryFn: ({ signal }) => shippingApi.methods(signal), staleTime: 30_000 });
}

export function useMethodCapability(methodId: string | null) {
  return useQuery({ queryKey: SHIPPING_KEYS.capability(methodId ?? ""), queryFn: ({ signal }) => shippingApi.capability(methodId as string, signal), enabled: Boolean(methodId) });
}

// ---- orders to ship
export function useDecisions(query: DecisionQuery, enabled = true) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: SHIPPING_KEYS.decisions(businessId, query),
    queryFn: ({ signal }) => shippingApi.decisions(query, signal),
    enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function useShippingOptions(fulfillmentId: string | null) {
  return useQuery({ queryKey: SHIPPING_KEYS.options(fulfillmentId ?? ""), queryFn: ({ signal }) => shippingApi.options(fulfillmentId as string, signal), enabled: Boolean(fulfillmentId), staleTime: 0 });
}

// ---- overview, exceptions
export function useShippingOverview(enabled = true) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: SHIPPING_KEYS.overview(businessId), queryFn: ({ signal }) => shippingApi.overview(signal), enabled, staleTime: 30_000 });
}

export function useShippingExceptions(enabled: boolean) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: SHIPPING_KEYS.exceptions(businessId), queryFn: ({ signal }) => shippingApi.exceptions(signal), enabled, staleTime: 15_000 });
}

// ---- tracking
export function useTrackingList(query: TrackingQuery, enabled = true) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: SHIPPING_KEYS.trackingList(businessId, query),
    queryFn: ({ signal }) => shippingApi.trackingList(query, signal),
    enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function useTrackingFailures(enabled = true) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: SHIPPING_KEYS.trackingFailures(businessId), queryFn: ({ signal }) => shippingApi.trackingFailures(signal), enabled, staleTime: 15_000 });
}

// ---- rules
export function useShippingRules(enabled: boolean) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: SHIPPING_KEYS.rules(businessId), queryFn: ({ signal }) => shippingApi.rules(signal), enabled, staleTime: 30_000 });
}

/** labels are fetched for printing: nothing on the screen changes */
export function useBulkLabels() {
  return useGuardedMutation({ mutationFn: (ids: string[]) => shippingApi.bulkLabels(ids) });
}

export function useShipmentLabel() {
  return useGuardedMutation({ mutationFn: (id: string) => shippingApi.label(id) });
}

const useInvalidateAll = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SHIPPING_KEYS.all });
};

export function useAddMethod() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({
    mutationFn: (input: AddMethodInput) => shippingApi.addMethod(input),
    // the method exists even when its check failed: the list must show it
    onSettled: invalidate,
  });
}

export function usePatchMethod() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (v: { id: string; patch: MethodPatch }) => shippingApi.patchMethod(v.id, v.patch), onSettled: invalidate });
}

export function useVerifyCarrier() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (id: string) => shippingApi.verifyCarrier(id), onSettled: invalidate });
}

export function useSelectMethod() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (v: { fulfillmentId: string; input: SelectionInput }) => shippingApi.select(v.fulfillmentId, v.input), onSettled: invalidate });
}

export function useBulkOrders() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({
    mutationFn: (v: { ids: string[]; action: BulkOrderAction; params?: { kind?: MethodKind; providerId?: string | null } }) => shippingApi.bulkOrders(v.ids, v.action, v.params),
    onSettled: invalidate,
  });
}

/**
 * Sync Shipping: starts the background job (verifies the active methods, refreshes tracking of open shipments) and follows it while it
 * runs (progress counts every second). A page that is loaded while a sync runs picks it up; a finished one from an earlier visit is not shown.
 */
export function useShippingSync() {
  const qc = useQueryClient();
  const businessId = useBusinessId();
  const [startedId, setStartedId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const start = useGuardedMutation({
    mutationFn: () => shippingApi.sync(),
    onSuccess: (job) => {
      setStartedId(job.id);
      setDismissed(null);
      qc.setQueryData(SHIPPING_KEYS.syncJob(job.id), job);
    },
  });
  const latest = useQuery({ queryKey: SHIPPING_KEYS.syncLatest(businessId), queryFn: ({ signal }) => shippingApi.latestSync(signal), staleTime: 0 });
  const id = startedId ?? latest.data?.id ?? null;
  const poll = useQuery({
    queryKey: SHIPPING_KEYS.syncJob(id ?? ""),
    queryFn: ({ signal }) => shippingApi.syncJob(id as string, signal),
    enabled: id !== null,
    placeholderData: latest.data && latest.data.id === id ? latest.data : undefined,
    refetchInterval: (q) => (q.state.data && !SYNC_RUNNING.includes(q.state.data.status) ? false : 1000),
  });
  const job = poll.data ?? null;
  const running = job !== null && SYNC_RUNNING.includes(job.status);
  // the numbers on the page move when the job is over
  const finishedId = job && !running ? job.id : null;
  useEffect(() => {
    if (finishedId) void qc.invalidateQueries({ queryKey: SHIPPING_KEYS.all });
  }, [finishedId, qc]);
  const visible = job !== null && job.id !== dismissed && (running || job.id === startedId);
  return {
    start: () => start.mutate(),
    starting: start.isPending,
    startError: start.isError ? start.error : null,
    job: visible ? job : null,
    running: start.isPending || running,
    dismiss: () => {
      start.reset();
      if (job) setDismissed(job.id);
    },
  };
}

/** one shipment as a table row, by id: the shipment drawer loads itself with this (links, reloads) */
export function useShipmentRow(id: string | null) {
  return useQuery({ queryKey: SHIPPING_KEYS.shipmentRow(id ?? ""), queryFn: ({ signal }) => shippingApi.shipmentRow(id as string, signal), enabled: Boolean(id), staleTime: 10_000, retry: false });
}

/** what the row actions do: book the label of a confirmed order (with the AWB a configured logistics provider issued), hand a labelled one over */
export function useCreateShipment() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (v: { fulfillmentId: string; providerCode: string; awb?: string }) => shippingApi.createShipment(v), onSettled: invalidate });
}

export function usePickupSlots(enabled: boolean) {
  const businessId = useBusinessId();
  return useQuery({ queryKey: SHIPPING_KEYS.pickupSlots(businessId), queryFn: ({ signal }) => shippingApi.pickupSlots("upcoming", signal), enabled, staleTime: 10_000 });
}

export function useBookPickupSlot() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (input: PickupSlotInput) => shippingApi.bookPickupSlot(input), onSettled: invalidate });
}

export function useCancelPickupSlot() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (id: string) => shippingApi.cancelPickupSlot(id), onSettled: invalidate });
}

export function useDispatchShipment() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (id: string) => shippingApi.dispatchShipment(id), onSettled: invalidate });
}

export function useSyncTracking() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (ids?: string[]) => shippingApi.syncTracking(ids), onSettled: invalidate });
}

export function useRefreshTracking() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (id: string) => shippingApi.refreshTracking(id), onSettled: invalidate });
}

export function useCancelShipment() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (v: { id: string; reason?: string }) => shippingApi.cancelShipment(v.id, v.reason), onSettled: invalidate });
}

export function useNdrAction() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (v: { id: string; action: NdrAction; note?: string }) => shippingApi.ndrAction(v.id, v.action, v.note), onSettled: invalidate });
}

export function useCreateRule() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (input: RuleInput) => shippingApi.createRule(input), onSettled: invalidate });
}

export function useUpdateRule() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (v: { id: string; input: Partial<RuleInput> }) => shippingApi.updateRule(v.id, v.input), onSettled: invalidate });
}

export function useDeleteRule() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (id: string) => shippingApi.deleteRule(id), onSettled: invalidate });
}

export function useRuleAction() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (v: { id: string; action: "enable" | "disable" | "duplicate" }) => shippingApi.ruleAction(v.id, v.action), onSettled: invalidate });
}

export function useReorderRules() {
  const invalidate = useInvalidateAll();
  return useGuardedMutation({ mutationFn: (ids: string[]) => shippingApi.reorderRules(ids), onSettled: invalidate });
}
