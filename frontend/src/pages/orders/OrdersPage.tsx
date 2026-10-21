import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { AssignWarehouseDialog } from "@/components/orders/AssignWarehouseDialog";
import { CancelOrderDialog } from "@/components/orders/CancelOrderDialog";
import { OrderBulkBar } from "@/components/orders/OrderBulkBar";
import { OrderBulkResultsDialog } from "@/components/orders/OrderBulkResultsDialog";
import { OrderDrawer } from "@/components/orders/OrderDrawer";
import { OrderFilters } from "@/components/orders/OrderFilters";
import { OrderKpiTiles } from "@/components/orders/OrderKpiTiles";
import { OrderTabs } from "@/components/orders/OrderTabs";
import { OrdersPagination } from "@/components/orders/OrdersPagination";
import { EmptyOrders, LoadError, NoMatches } from "@/components/orders/OrdersStates";
import { OrdersTable, TableSkeleton } from "@/components/orders/OrdersTable";
import { SlaBanner } from "@/components/orders/SlaBanner";
import { DEFAULT_PAGE_SIZE, isFiltered, ledgerQueryOf, useOrdersUrlState } from "@/components/orders/orderParams";
import { NO_WRITE_REASON, writeErrorMessage } from "@/components/orders/orderFormat";
import { saveBlob } from "@/components/products/list/saveBlob";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useBulkOrders, useExportOrders, useOrderChannels, useOrdersLedger, useOrdersSummary, useOrdersWorkspace, useSyncOrders } from "@/hooks/useOrders";
import { toast } from "@/hooks/useToast";
import type { BulkOrderParams, BulkOrderAction, BulkOrdersResponse } from "@/types/orders";

/** the API takes at most this many orders per bulk call (the page size never exceeds it) */
const BULK_MAX = 200;

export default function OrdersPage() {
  const url = useOrdersUrlState();
  const { update, clearFilters, filters, sort, page, pageSize, tab, drawerId } = url;
  const canWrite = useCan("orders:write");

  const summary = useOrdersSummary();
  const workspace = useOrdersWorkspace();
  const ledger = useOrdersLedger(ledgerQueryOf(url));
  const channels = useOrderChannels();
  const bulk = useBulkOrders();
  const exporter = useExportOrders();
  const sync = useSyncOrders();

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [results, setResults] = useState<BulkOrdersResponse | null>(null);
  const [dialog, setDialog] = useState<"cancel" | "warehouse" | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const orders = useMemo(() => ledger.data?.items ?? [], [ledger.data]);
  const queryKey = JSON.stringify([filters, sort, page, pageSize]);
  // a selection belongs to the page it was made on
  useEffect(() => setSelected(new Set()), [queryKey]);

  // a page past the end (a shrinking result set, an old link) falls back to the last page
  useEffect(() => {
    const data = ledger.data;
    if (data && data.total > 0 && data.items.length === 0 && page > data.pages) update({ page: String(data.pages) }, { replace: true });
  }, [ledger.data, page, update]);

  const accounts = useMemo(() => (channels.data?.accounts ?? []).filter((a) => a.status === "active"), [channels.data]);
  const filtered = isFiltered(filters);

  const toggle = useCallback((id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  }), []);
  const toggleAll = useCallback(
    () => setSelected((prev) => (orders.length > 0 && orders.every((o) => prev.has(o.id)) ? new Set() : new Set(orders.map((o) => o.id)))),
    [orders],
  );

  const runBulk = (action: BulkOrderAction, params?: BulkOrderParams) => {
    bulk.mutate(
      { action, ids: [...selected], params },
      {
        onSuccess: (res) => {
          setDialog(null);
          setDialogError(null);
          setResults(res);
          // what failed stays selected so it can be retried or looked at
          setSelected(new Set(res.results.filter((r) => !r.ok).map((r) => r.orderId)));
        },
        onError: (e) => (dialog === "cancel" ? setDialogError(writeErrorMessage(e)) : toast({ title: "Bulk action failed", description: writeErrorMessage(e), variant: "destructive" })),
      },
    );
  };

  const onExport = () =>
    exporter.mutate(
      { filters, sort },
      {
        onSuccess: (file) => saveBlob(file.blob, file.fileName),
        onError: (e) => toast({ title: "Export failed", description: errorMessage(e), variant: "destructive" }),
      },
    );

  const onSync = () =>
    sync.mutate(accounts, {
      onSuccess: (outcomes) => {
        const failed = outcomes.filter((o) => ["failed", "partially_failed", "dead_lettered", "cancelled"].includes(o.status));
        const running = outcomes.filter((o) => o.status === "running");
        if (failed.length > 0) {
          toast({ title: "Order sync had problems", description: failed.map((o) => `${o.accountName}: ${o.error ?? o.status.replace(/_/g, " ")}`).join(" "), variant: "destructive" });
        } else if (running.length > 0) {
          toast({ title: "Order sync is still running", description: "New orders will appear here when it finishes.", variant: "warning" });
        } else {
          toast({ title: "Orders synced", description: outcomes.map((o) => o.accountName).join(", "), variant: "success" });
        }
      },
      onError: (e) => toast({ title: "Order sync could not start", description: errorMessage(e), variant: "destructive" }),
    });

  const loadingList = ledger.isLoading;
  const listError = ledger.isError && !ledger.data;
  const total = ledger.data?.total ?? 0;

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader
        eyebrow="OPERATIONS & FULFILLMENT"
        title="Orders Workspace"
        description="Multi-channel order processing, SLA countdown monitors and dispatch follow-up."
        actions={
          accounts.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={!canWrite || sync.isPending}
              title={canWrite ? "Import the latest orders from every connected marketplace" : NO_WRITE_REASON}
              onClick={onSync}
            >
              <RefreshCw className={`h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} aria-hidden />
              {sync.isPending ? "Syncing..." : "Sync orders"}
            </Button>
          ) : undefined
        }
      />

      <OrderKpiTiles
        summary={summary.data}
        loading={summary.isLoading}
        error={summary.isError ? errorMessage(summary.error) : null}
        onRetry={() => void summary.refetch()}
        activeStatuses={filters.status ?? []}
        onPick={(statuses) => update({ status: statuses.join(","), tab: null, sla: null })}
      />

      <SlaBanner summary={summary.data} workspace={workspace.data} onReview={() => update({ sla: "at_risk,breached", tab: null, status: null, sort: "sla" })} />

      <div className="space-y-4">
        <OrderTabs active={tab} summary={summary.data} onChange={(t) => update({ tab: t, status: null, sla: null })} />
        <OrderFilters
          filters={filters}
          sort={sort}
          channels={channels.data?.options ?? []}
          filtered={filtered}
          exporting={exporter.isPending}
          onSearch={(q) => update({ q }, { replace: true })}
          onChannel={(code) => update({ marketplace: code })}
          onStatus={(statuses) => update({ status: statuses.join(",") })}
          onSla={(states) => update({ sla: states.join(",") })}
          onPayment={(payment) => update({ payment })}
          onSort={(s) => update({ sort: s === "-placedAt" ? null : s })}
          onClear={clearFilters}
          onExport={onExport}
        />
      </div>

      {selected.size > 0 && (
        <OrderBulkBar
          count={selected.size}
          max={BULK_MAX}
          canWrite={canWrite}
          busy={bulk.isPending}
          onConfirm={() => runBulk("confirm")}
          onCancel={() => {
            setDialogError(null);
            setDialog("cancel");
          }}
          onAssign={() => setDialog("warehouse")}
          onPriority={(priority) => runBulk("mark_priority", { priority })}
          onClear={() => setSelected(new Set())}
        />
      )}

      {loadingList ? (
        <TableSkeleton rows={8} />
      ) : listError ? (
        <LoadError message={errorMessage(ledger.error)} onRetry={() => void ledger.refetch()} />
      ) : orders.length === 0 ? (
        filtered ? (
          <NoMatches onClear={clearFilters} />
        ) : (
          <EmptyOrders canSync={canWrite && accounts.length > 0} syncing={sync.isPending} onSync={onSync} />
        )
      ) : (
        <>
          <OrdersTable
            orders={orders}
            selected={selected}
            canWrite={canWrite}
            refreshing={ledger.isFetching && ledger.isPlaceholderData}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onOpen={(id) => update({ drawer: `order:${id}` }, { keepPage: true })}
          />
          <OrdersPagination
            page={ledger.data?.page ?? page}
            pages={ledger.data?.pages ?? 1}
            total={total}
            pageSize={pageSize}
            shown={orders.length}
            onPage={(p) => update({ page: p > 1 ? String(p) : null })}
            onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
          />
        </>
      )}

      <OrderDrawer orderId={drawerId} onClose={() => update({ drawer: null }, { keepPage: true, replace: true })} />

      <CancelOrderDialog
        open={dialog === "cancel"}
        subject={`${selected.size} ${selected.size === 1 ? "order" : "orders"}`}
        busy={bulk.isPending}
        error={dialogError}
        onClose={() => setDialog(null)}
        onConfirm={(input) => runBulk("cancel", input)}
      />
      <AssignWarehouseDialog
        open={dialog === "warehouse"}
        count={selected.size}
        busy={bulk.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(warehouseId) => runBulk("assign_warehouse", { warehouseId })}
      />
      <OrderBulkResultsDialog response={results} onClose={() => setResults(null)} />
    </div>
  );
}
