import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { errorMessage } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useCan } from "@/hooks/useCan";
import { useChannelOptions } from "@/hooks/useProducts";
import { useAllocations, useExportInventory, useInventoryKpis, useInventoryLedger, useWarehouses } from "@/hooks/useInventory";
import { saveBlob } from "@/components/products/list/saveBlob";
import { AdjustDialog } from "@/components/inventory/AdjustDialog";
import { ChannelSyncButton } from "@/components/inventory/ChannelSyncButton";
import { FilterBar } from "@/components/inventory/FilterBar";
import { InventoryDrawer } from "@/components/inventory/InventoryDrawer";
import { KpiTiles, ReorderBanner } from "@/components/inventory/KpiTiles";
import { EmptyLedger, LedgerError, LedgerPagination, LedgerTable } from "@/components/inventory/LedgerTable";
import { MovementsFeed } from "@/components/inventory/MovementsFeed";
import { TransferDialog } from "@/components/inventory/TransferDialog";
import { hasActiveFilters, useInventoryUrlState } from "@/components/inventory/inventoryParams";
import { NO_WRITE_REASON } from "@/components/inventory/inventoryLabels";
import { targetOfRow, type StockTarget } from "@/components/inventory/stockTarget";

const SYNC_REASON = "Syncing channels needs both inventory and listings write access.";

export default function InventoryPage() {
  const { filters, sort, page, pageSize, drawerVariantId, update, clearFilters } = useInventoryUrlState();
  const canWrite = useCan("inventory:write");
  const canSync = useCan("listings:write") && canWrite;

  const kpis = useInventoryKpis(filters.warehouse);
  const ledger = useInventoryLedger({ ...filters, page, pageSize, sort: sort || undefined });
  const rows = ledger.data?.items ?? [];
  const allocations = useAllocations(rows.map((r) => r.variantId));
  const warehouses = useWarehouses();
  const channels = useChannelOptions();
  const exporter = useExportInventory();

  const [adjustTarget, setAdjustTarget] = useState<StockTarget | null>(null);
  const [transferTarget, setTransferTarget] = useState<StockTarget | null>(null);
  const warehouseList = warehouses.data ?? [];
  const multiWarehouse = warehouseList.length > 1;

  // search: typing is debounced into the URL (and kept out of the history)
  const [searchText, setSearchText] = useState(filters.q ?? "");
  const searchTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (searchTimer.current === undefined) setSearchText(filters.q ?? "");
  }, [filters.q]);
  useEffect(() => () => window.clearTimeout(searchTimer.current), []);
  const onSearch = (value: string) => {
    setSearchText(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      searchTimer.current = undefined;
      update({ q: value.trim() || null }, { replace: true });
    }, 300);
  };
  const resetFilters = () => {
    window.clearTimeout(searchTimer.current);
    searchTimer.current = undefined;
    setSearchText("");
    clearFilters();
  };

  // a filter that shrinks the result can leave the URL on a page that no longer exists
  useEffect(() => {
    if (ledger.data && ledger.data.items.length === 0 && ledger.data.total > 0 && page > 1) update({ page: null }, { replace: true });
  }, [ledger.data, page, update]);

  const onExport = () =>
    exporter.mutate(filters, {
      onSuccess: ({ blob, fileName }) => saveBlob(blob, fileName),
      onError: (e) => toast({ title: "Export failed", description: errorMessage(e, "The stock could not be exported."), variant: "destructive" }),
    });

  const filtered = hasActiveFilters(filters);
  const openDrawer = (variantId: string) => update({ drawer: `variant:${variantId}` }, { keepPage: true });

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader
        eyebrow="COMMERCE OPERATIONS"
        title="Inventory Control Room"
        description="Unified stock visibility, real-time safety buffers, warehouse distribution, and multi-channel synchronization."
        actions={<ChannelSyncButton allowed={canSync} disabledReason={SYNC_REASON} />}
      />

      {!canWrite && (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground" role="note">
          {NO_WRITE_REASON}
        </p>
      )}

      <KpiTiles
        kpis={kpis.data}
        isLoading={kpis.isPending}
        error={kpis.isError ? errorMessage(kpis.error) : null}
        onRetry={() => void kpis.refetch()}
        status={filters.stockStatus}
        signal={filters.signal}
        onStatus={(status) => update({ status, signal: null })}
        onSignal={(signal) => update({ signal, status: null })}
      />

      <ReorderBanner reorder={kpis.data?.reorder} onReview={() => update({ status: "low_stock", signal: null })} />

      <FilterBar
        searchText={searchText}
        onSearch={onSearch}
        filters={filters}
        sort={sort}
        warehouses={warehouseList}
        channels={channels.data ?? []}
        update={update}
        onClear={resetFilters}
        onExport={onExport}
        exporting={exporter.isPending}
      />

      {ledger.isError && !ledger.data ? (
        <LedgerError message={errorMessage(ledger.error)} onRetry={() => void ledger.refetch()} />
      ) : ledger.data && ledger.data.total === 0 ? (
        <EmptyLedger filtered={filtered} onClear={resetFilters} />
      ) : (
        <>
          <LedgerTable
            rows={rows}
            loading={ledger.isPending}
            allocations={allocations.data}
            allocationsLoading={allocations.isPending && rows.length > 0}
            sort={sort}
            onSort={(s) => update({ sort: s })}
            canWrite={canWrite}
            onOpen={(row) => openDrawer(row.variantId)}
            onAdjust={(row) => setAdjustTarget(targetOfRow(row))}
          />
          {ledger.data && <LedgerPagination data={ledger.data} onPage={(p) => update({ page: p === 1 ? null : String(p) }, { keepPage: true })} onPageSize={(s) => update({ size: String(s) })} />}
        </>
      )}

      <MovementsFeed warehouseId={filters.warehouse} />

      <InventoryDrawer
        variantId={drawerVariantId}
        onClose={() => update({ drawer: null }, { replace: true })}
        canWrite={canWrite}
        multiWarehouse={multiWarehouse}
        onAdjust={setAdjustTarget}
        onTransfer={setTransferTarget}
      />

      <AdjustDialog target={adjustTarget} warehouses={warehouseList} onClose={() => setAdjustTarget(null)} />
      <TransferDialog target={multiWarehouse ? transferTarget : null} warehouses={warehouseList} onClose={() => setTransferTarget(null)} />
    </div>
  );
}
