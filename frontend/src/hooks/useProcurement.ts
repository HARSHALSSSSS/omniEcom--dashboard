import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { procurementApi } from "@/api/procurement.api";
import { refreshShell } from "@/lib/session";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { PoQuery, PoUpdate, PoWrite, ReceiveInput, SupplierProductInput, SupplierQuery, SupplierUpdate, SupplierWrite } from "@/types/procurement";

export const procurementKeys = {
  all: ["procurement"] as const,
  overview: (b: string | undefined) => ["procurement", "overview", b] as const,
  orders: (b: string | undefined, q: PoQuery) => ["procurement", "orders", b, q] as const,
  order: (b: string | undefined, id: string) => ["procurement", "order", b, id] as const,
  suppliers: (b: string | undefined, q: SupplierQuery) => ["procurement", "suppliers", b, q] as const,
  activeSuppliers: (b: string | undefined) => ["procurement", "active-suppliers", b] as const,
  supplier: (b: string | undefined, id: string) => ["procurement", "supplier", b, id] as const,
  supplierProducts: (b: string | undefined, id: string, q: string) => ["procurement", "supplier-products", b, id, q] as const,
  suggestions: (b: string | undefined) => ["procurement", "suggestions", b] as const,
  variants: (b: string | undefined, supplierId: string | undefined, q: string, suppliedOnly: boolean) => ["procurement", "variants", b, supplierId, q, suppliedOnly] as const,
  warehouses: (b: string | undefined) => ["procurement", "warehouses", b] as const,
};

const useBusinessId = () => useWorkspaceStore((s) => s.shell?.business.id);

export function useProcurementOverview() {
  const b = useBusinessId();
  return useQuery({ queryKey: procurementKeys.overview(b), queryFn: ({ signal }) => procurementApi.overview(signal), staleTime: 30_000 });
}

/** one numbered page of purchase orders; the previous page stays on screen while the next loads */
export function usePurchaseOrders(query: PoQuery, enabled = true) {
  const b = useBusinessId();
  return useQuery({ queryKey: procurementKeys.orders(b, query), queryFn: ({ signal }) => procurementApi.listOrders(query, signal), staleTime: 15_000, placeholderData: keepPreviousData, enabled });
}

export function usePurchaseOrder(id: string | null) {
  const b = useBusinessId();
  return useQuery({ queryKey: procurementKeys.order(b, id ?? ""), queryFn: ({ signal }) => procurementApi.getOrder(id as string, signal), enabled: Boolean(id), staleTime: 10_000 });
}

export function useSuppliers(query: SupplierQuery, enabled = true) {
  const b = useBusinessId();
  return useQuery({ queryKey: procurementKeys.suppliers(b, query), queryFn: ({ signal }) => procurementApi.listSuppliers(query, signal), staleTime: 15_000, placeholderData: keepPreviousData, enabled });
}

export function useActiveSuppliers(enabled = true) {
  const b = useBusinessId();
  return useQuery({ queryKey: procurementKeys.activeSuppliers(b), queryFn: ({ signal }) => procurementApi.activeSuppliers(signal), staleTime: 30_000, enabled });
}

export function useSupplier(id: string | null) {
  const b = useBusinessId();
  return useQuery({ queryKey: procurementKeys.supplier(b, id ?? ""), queryFn: ({ signal }) => procurementApi.getSupplier(id as string, signal), enabled: Boolean(id) });
}

export function useSupplierProducts(id: string | null, q: string) {
  const b = useBusinessId();
  return useQuery({
    queryKey: procurementKeys.supplierProducts(b, id ?? "", q),
    queryFn: ({ signal }) => procurementApi.supplierProducts(id as string, { q: q || undefined }, signal),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}

export function useReorderSuggestions(enabled = true) {
  const b = useBusinessId();
  return useQuery({ queryKey: procurementKeys.suggestions(b), queryFn: ({ signal }) => procurementApi.suggestions(signal), staleTime: 30_000, enabled });
}

/** product picker of the PO form (searches as the person types) */
export function useVariantSearch(supplierId: string | undefined, q: string, suppliedOnly: boolean, enabled = true) {
  const b = useBusinessId();
  return useQuery({
    queryKey: procurementKeys.variants(b, supplierId, q, suppliedOnly),
    queryFn: ({ signal }) => procurementApi.searchVariants({ supplierId, q: q || undefined, suppliedOnly }, signal),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useProcurementWarehouses() {
  const b = useBusinessId();
  return useQuery({ queryKey: procurementKeys.warehouses(b), queryFn: ({ signal }) => procurementApi.warehouses(signal), staleTime: 5 * 60_000, retry: false });
}

/** a purchase order or supplier changed: every procurement list, tile and open drawer refreshes */
function useAfterProcurementWrite() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: procurementKeys.all });
  };
}

/**
 * Approving, receiving and cancelling move stock (incoming, on hand, damaged): the inventory ledger, product stock, the dashboard,
 * needs attention, recommendations and the sidebar badges all change with them.
 */
function useAfterStockWrite() {
  const qc = useQueryClient();
  const procurement = useAfterProcurementWrite();
  return () => {
    procurement();
    void qc.invalidateQueries({ queryKey: ["inventory"] });
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["productDetail"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    void qc.invalidateQueries({ queryKey: ["attention"] });
    void qc.invalidateQueries({ queryKey: ["needs-attention"] });
    void qc.invalidateQueries({ queryKey: ["recommendations"] });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    refreshShell().catch(() => undefined);
  };
}

export function useCreatePurchaseOrder() {
  const after = useAfterProcurementWrite();
  return useGuardedMutation({ mutationFn: (input: { body: PoWrite; idempotencyKey: string }) => procurementApi.createOrder(input.body, input.idempotencyKey), onSuccess: after });
}

export function useUpdatePurchaseOrder() {
  const after = useAfterProcurementWrite();
  return useGuardedMutation({ mutationFn: (input: { id: string; body: PoUpdate }) => procurementApi.updateOrder(input.id, input.body), onSuccess: after });
}

export function useDeletePurchaseOrder() {
  const after = useAfterProcurementWrite();
  return useGuardedMutation({ mutationFn: (id: string) => procurementApi.deleteOrder(id), onSuccess: after });
}

export function useDuplicatePurchaseOrder() {
  const after = useAfterProcurementWrite();
  return useGuardedMutation({ mutationFn: (id: string) => procurementApi.duplicateOrder(id), onSuccess: after });
}

export function useApprovePurchaseOrder() {
  const after = useAfterStockWrite();
  return useGuardedMutation({ mutationFn: (input: { id: string; version?: number; expectedAt?: string }) => procurementApi.approveOrder(input.id, { version: input.version, expectedAt: input.expectedAt }), onSuccess: after });
}

export function useAcknowledgePurchaseOrder() {
  const after = useAfterProcurementWrite();
  return useGuardedMutation({ mutationFn: (input: { id: string; version?: number; expectedAt?: string }) => procurementApi.acknowledgeOrder(input.id, { version: input.version, expectedAt: input.expectedAt }), onSuccess: after });
}

export function useReceivePurchaseOrder() {
  const after = useAfterStockWrite();
  return useGuardedMutation({ mutationFn: (input: { id: string; body: ReceiveInput; receiptKey: string }) => procurementApi.receiveOrder(input.id, input.body, input.receiptKey), onSuccess: after });
}

export function useCancelPurchaseOrder() {
  const after = useAfterStockWrite();
  return useGuardedMutation({ mutationFn: (input: { id: string; reason: string; version?: number }) => procurementApi.cancelOrder(input.id, { reason: input.reason, version: input.version }), onSuccess: after });
}

export function useCreateFromSuggestions() {
  const after = useAfterProcurementWrite();
  return useGuardedMutation({
    mutationFn: (input: { warehouseId?: string; variantIds?: string[]; dryRun: boolean }) => procurementApi.fromSuggestions(input),
    onSuccess: (res) => {
      if (!res.dryRun) after();
    },
  });
}

export function useCreateSupplier() {
  const after = useAfterProcurementWrite();
  return useGuardedMutation({ mutationFn: (body: SupplierWrite) => procurementApi.createSupplier(body), onSuccess: after });
}

export function useUpdateSupplier() {
  const after = useAfterProcurementWrite();
  return useGuardedMutation({ mutationFn: (input: { id: string; body: SupplierUpdate }) => procurementApi.updateSupplier(input.id, input.body), onSuccess: after });
}

export function useDeleteSupplier() {
  const after = useAfterProcurementWrite();
  return useGuardedMutation({ mutationFn: (id: string) => procurementApi.deleteSupplier(id), onSuccess: after });
}

export function usePutSupplierProducts() {
  const after = useAfterProcurementWrite();
  return useGuardedMutation({ mutationFn: (input: { id: string; items: SupplierProductInput[] }) => procurementApi.putSupplierProducts(input.id, input.items), onSuccess: after });
}

export function useRemoveSupplierProduct() {
  const after = useAfterProcurementWrite();
  return useGuardedMutation({ mutationFn: (input: { id: string; variantId: string }) => procurementApi.removeSupplierProduct(input.id, input.variantId), onSuccess: after });
}
