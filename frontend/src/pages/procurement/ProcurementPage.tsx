import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/common/RefreshButton";
import { PoDrawer } from "@/components/procurement/PoDrawer";
import { PoFilters, PoStatusTabs } from "@/components/procurement/PoFilters";
import { PoFormDialog, type PoFormTarget } from "@/components/procurement/PoFormDialog";
import { PoTable } from "@/components/procurement/PoTable";
import { ProcurementKpis } from "@/components/procurement/ProcurementKpis";
import { ReorderPanel } from "@/components/procurement/ReorderPanel";
import { SupplierDialog, type SupplierFormTarget } from "@/components/procurement/SupplierDialog";
import { SupplierDrawer } from "@/components/procurement/SupplierDrawer";
import { SupplierFilters, SupplierTable } from "@/components/procurement/SupplierTable";
import { LoadError, Pagination, StateBox, TableSkeleton } from "@/components/procurement/procurementUi";
import { DEFAULT_PAGE_SIZE, DEFAULT_PO_SORT, DEFAULT_SUPPLIER_SORT, isPoFiltered, poQueryOf, supplierQueryOf, useProcurementUrlState } from "@/components/procurement/procurementParams";
import { ordersCsv } from "@/components/procurement/procurementFormat";
import { saveBlob } from "@/components/products/list/saveBlob";
import { procurementApi } from "@/api/procurement.api";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { toast } from "@/hooks/useToast";
import { useActiveSuppliers, useProcurementOverview, useProcurementWarehouses, usePurchaseOrders, useSuppliers } from "@/hooks/useProcurement";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { ProcurementTab } from "@/types/procurement";

const TAB_LABEL: Record<ProcurementTab, string> = { orders: "Purchase orders", suppliers: "Suppliers", reorder: "Reorder suggestions" };

export default function ProcurementPage() {
  const url = useProcurementUrlState();
  const { update, tab, page, pageSize } = url;
  const canWrite = useCan("procurement:write");
  const noWrite = canWrite ? undefined : "You need purchasing permission to do this";

  const overview = useProcurementOverview();
  const poQuery = poQueryOf(url);
  const supplierQuery = supplierQueryOf(url);
  const orders = usePurchaseOrders(poQuery, tab === "orders");
  const suppliers = useSuppliers(supplierQuery, tab === "suppliers");
  const supplierChoices = useActiveSuppliers(tab === "orders");
  const warehouses = useProcurementWarehouses();

  const [poForm, setPoForm] = useState<PoFormTarget | null>(null);
  const [supplierForm, setSupplierForm] = useState<SupplierFormTarget | null>(null);
  const [exporting, setExporting] = useState(false);

  const list = tab === "orders" ? orders : suppliers;
  const poRows = useMemo(() => orders.data?.items ?? [], [orders.data]);
  const supplierRows = useMemo(() => suppliers.data?.items ?? [], [suppliers.data]);

  // a page past the end (a shrinking result set, an old link) falls back to the last page
  useEffect(() => {
    const d = tab === "reorder" ? undefined : list.data;
    if (d && d.total > 0 && d.items.length === 0 && page > d.pages) update({ page: String(d.pages) }, { replace: true });
  }, [list.data, tab, page, update]);

  const poFiltered = isPoFiltered(url.po);
  const supplierFiltered = Boolean(url.supplierQ || url.supplierStatus);

  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const rows = await procurementApi.allOrders({ ...url.po, sort: url.poSort });
      saveBlob(new Blob([ordersCsv(rows)], { type: "text/csv;charset=utf-8" }), `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`);
      toast({ title: "CSV downloaded", description: `${formatNumber(rows.length)} purchase orders.`, variant: "success" });
    } catch (e) {
      toast({ title: "Could not export the purchase orders", description: errorMessage(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }, [url.po, url.poSort]);

  const counts: Record<ProcurementTab, number | undefined> = {
    orders: orders.data?.counts.all ?? (overview.data ? Object.values(overview.data.statusCounts).reduce((a, b) => a + b, 0) : undefined),
    suppliers: overview.data?.totalSuppliers,
    reorder: overview.data?.reorderSuggestionsCount,
  };

  const headerAction =
    tab === "suppliers" ? (
      <Button size="sm" className="gap-2" disabled={!canWrite} title={noWrite} onClick={() => setSupplierForm({ kind: "create" })}>
        <Plus className="h-4 w-4" aria-hidden />
        Add supplier
      </Button>
    ) : (
      <Button size="sm" className="gap-2" disabled={!canWrite} title={noWrite} onClick={() => setPoForm({ kind: "create" })}>
        <Plus className="h-4 w-4" aria-hidden />
        New purchase order
      </Button>
    );

  const refreshing = list.isFetching && list.isPlaceholderData;

  return (
    <div className="w-full space-y-6 pb-16">
      <PageHeader
        eyebrow="COMMERCE OPERATIONS"
        title="Procurement and Inbound"
        description="Manage suppliers and their price lists, raise purchase orders, and receive stock into your warehouses before products run out."
        actions={
          <>
            <RefreshButton
              onRefresh={() => {
                void overview.refetch();
                if (tab !== "reorder") void list.refetch();
              }}
              spinning={overview.isFetching || (tab !== "reorder" && list.isFetching)}
            />
            {headerAction}
          </>
        }
      />

      <ProcurementKpis overview={overview.data} loading={overview.isLoading} failed={overview.isError} />

      <div role="tablist" aria-label="Procurement sections" className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1">
        {(["orders", "suppliers", "reorder"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => update({ tab: t })}
            className={cn("rounded-md px-3.5 py-1.5 text-xs font-medium transition-all", tab === t ? "bg-background font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
          >
            {TAB_LABEL[t]}
            {counts[t] !== undefined && <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{formatNumber(counts[t] ?? 0)}</span>}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <>
          <PoStatusTabs active={url.po.status} counts={orders.data?.counts} onChange={(status) => update({ status: status ?? null })} />
          <PoFilters
            filters={url.po}
            sort={url.poSort}
            suppliers={supplierChoices.data ?? []}
            warehouses={warehouses.data ?? []}
            filtered={poFiltered}
            exporting={exporting}
            total={orders.data?.total ?? 0}
            onSearch={(q) => update({ q }, { replace: true })}
            onSupplier={(id) => update({ supplier: id })}
            onWarehouse={(id) => update({ warehouse: id })}
            onFrom={(d) => update({ from: d })}
            onTo={(d) => update({ to: d })}
            onSort={(s) => update({ sort: s === DEFAULT_PO_SORT ? null : s })}
            onClear={url.clearPoFilters}
            onExport={() => void exportCsv()}
          />
          {orders.isLoading ? (
            <TableSkeleton rows={8} label="Loading purchase orders" />
          ) : orders.isError && !orders.data ? (
            <LoadError title="Purchase orders could not be loaded." message={errorMessage(orders.error)} onRetry={() => void orders.refetch()} />
          ) : poRows.length === 0 ? (
            poFiltered ? (
              <StateBox title="No purchase orders match these filters." description="Try a different search, supplier or date range.">
                <Button variant="outline" size="sm" className="text-xs" onClick={url.clearPoFilters}>
                  Clear filters
                </Button>
              </StateBox>
            ) : (
              <StateBox title="No purchase orders yet." description="A purchase order asks a supplier for stock. Create one by hand, or start from the reorder suggestions of products running low.">
                <Button size="sm" className="text-xs" disabled={!canWrite} title={noWrite} onClick={() => setPoForm({ kind: "create" })}>
                  New purchase order
                </Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => update({ tab: "reorder" })}>
                  See reorder suggestions
                </Button>
              </StateBox>
            )
          ) : (
            <>
              <PoTable rows={poRows} refreshing={refreshing} activeId={url.orderId} onOpen={(id) => update({ po: id })} />
              <Pagination
                page={orders.data?.page ?? page}
                pages={orders.data?.pages ?? 1}
                total={orders.data?.total ?? 0}
                pageSize={pageSize}
                shown={poRows.length}
                noun="purchase orders"
                onPage={(p) => update({ page: p > 1 ? String(p) : null })}
                onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
              />
            </>
          )}
        </>
      )}

      {tab === "suppliers" && (
        <>
          <SupplierFilters
            q={url.supplierQ ?? ""}
            status={url.supplierStatus}
            sort={url.supplierSort}
            counts={suppliers.data?.counts}
            filtered={supplierFiltered}
            onSearch={(q) => update({ q }, { replace: true })}
            onStatus={(s) => update({ sstatus: s })}
            onSort={(s) => update({ ssort: s === DEFAULT_SUPPLIER_SORT ? null : s })}
            onClear={url.clearSupplierFilters}
          />
          {suppliers.isLoading ? (
            <TableSkeleton rows={6} label="Loading suppliers" />
          ) : suppliers.isError && !suppliers.data ? (
            <LoadError title="Suppliers could not be loaded." message={errorMessage(suppliers.error)} onRetry={() => void suppliers.refetch()} />
          ) : supplierRows.length === 0 ? (
            supplierFiltered ? (
              <StateBox title="No supplier matches these filters." description="Try a different search or status.">
                <Button variant="outline" size="sm" className="text-xs" onClick={url.clearSupplierFilters}>
                  Clear filters
                </Button>
              </StateBox>
            ) : (
              <StateBox title="No suppliers yet." description="A supplier sells you products. Add one with its price list and lead time so purchase orders and reorder suggestions can use it.">
                <Button size="sm" className="text-xs" disabled={!canWrite} title={noWrite} onClick={() => setSupplierForm({ kind: "create" })}>
                  Add supplier
                </Button>
              </StateBox>
            )
          ) : (
            <>
              <SupplierTable rows={supplierRows} refreshing={refreshing} activeId={url.supplierId} onOpen={(id) => update({ sup: id })} />
              <Pagination
                page={suppliers.data?.page ?? page}
                pages={suppliers.data?.pages ?? 1}
                total={suppliers.data?.total ?? 0}
                pageSize={pageSize}
                shown={supplierRows.length}
                noun="suppliers"
                onPage={(p) => update({ page: p > 1 ? String(p) : null })}
                onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
              />
            </>
          )}
        </>
      )}

      {tab === "reorder" && <ReorderPanel onOpenOrder={(id) => update({ tab: "orders", po: id })} onOpenSuppliers={() => update({ tab: "suppliers" })} />}

      <PoDrawer orderId={url.orderId} onClose={() => update({ po: null })} onEdit={(id) => setPoForm({ kind: "edit", id })} onOpen={(id) => update({ po: id })} />
      <SupplierDrawer
        supplierId={url.supplierId}
        onClose={() => update({ sup: null })}
        onEdit={(supplier) => setSupplierForm({ kind: "edit", supplier })}
        onNewOrder={(id) => setPoForm({ kind: "create", supplierId: id })}
        onOpenOrder={(id) => update({ sup: null, po: id, tab: "orders" })}
      />

      <PoFormDialog
        target={poForm}
        onClose={() => setPoForm(null)}
        onSaved={(po, mode) => {
          setPoForm(null);
          if (mode === "create") update({ po: po.id, sup: null, tab: "orders" });
        }}
      />
      <SupplierDialog
        target={supplierForm}
        onClose={() => setSupplierForm(null)}
        onSaved={(s, mode) => {
          setSupplierForm(null);
          if (mode === "create") update({ sup: s.id, tab: "suppliers" });
        }}
      />
    </div>
  );
}
