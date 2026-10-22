import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { AssignWarehouseDialog } from "@/components/orders/AssignWarehouseDialog";
import { CancelOrderDialog } from "@/components/orders/CancelOrderDialog";
import { OrderActivity } from "@/components/orders/OrderActivity";
import { OrderAttentionStrip } from "@/components/orders/OrderAttentionStrip";
import { OrderBulkBar } from "@/components/orders/OrderBulkBar";
import { OrderBulkResultsDialog } from "@/components/orders/OrderBulkResultsDialog";
import { OrderDrawer } from "@/components/orders/OrderDrawer";
import { OrderFilters } from "@/components/orders/OrderFilters";
import { OrderSources, SlaPressure } from "@/components/orders/OrderIntelligence";
import { OrderPulse } from "@/components/orders/OrderPulse";
import { OrderTabs } from "@/components/orders/OrderTabs";
import { OrdersHeader } from "@/components/orders/OrdersHeader";
import { OrdersPagination } from "@/components/orders/OrdersPagination";
import { EmptyOrders, LoadError, NoMatches } from "@/components/orders/OrdersStates";
import { OrdersTable, TableSkeleton } from "@/components/orders/OrdersTable";
import { DEFAULT_PAGE_SIZE, TAB_LABELS, isFiltered, ledgerQueryOf, patchOfView, useOrdersUrlState } from "@/components/orders/orderParams";
import { writeErrorMessage } from "@/components/orders/orderFormat";
import { saveBlob } from "@/components/products/list/saveBlob";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import {
  ORDER_KEYS,
  useBulkOrders,
  useExportOrders,
  useOrderChannels,
  useOrdersActivity,
  useOrdersLedger,
  useOrdersSummary,
  useOrdersWorkspace,
  useSyncOrders,
} from "@/hooks/useOrders";
import { toast } from "@/hooks/useToast";
import type { AttentionKey, BulkOrderParams, BulkOrderAction, BulkOrdersResponse, OrderSavedView, OrderStatus } from "@/types/orders";

/** the API takes at most this many orders per bulk call (the page size never exceeds it) */
const BULK_MAX = 200;

export default function OrdersPage() {
  const url = useOrdersUrlState();
  const { update, clearFilters, filters, sort, page, pageSize, tab, drawerId } = url;
  const canWrite = useCan("orders:write");
  const queryClient = useQueryClient();
  const refreshing = useIsFetching({ queryKey: ORDER_KEYS.all }) > 0;

  const summary = useOrdersSummary();
  const workspace = useOrdersWorkspace();
  const activity = useOrdersActivity(5);
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
  const channelOptions = useMemo(() => channels.data?.options ?? [], [channels.data]);

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

  const openOrder = (id: string) => update({ drawer: `order:${id}` }, { keepPage: true });
  const attention = filters.attention ?? [];
  const toggleChip = (key: AttentionKey) => update({ chip: attention.length === 1 && attention[0] === key ? null : key });
  const pickStage = (status: OrderStatus | null) => update({ status: status ?? null, date: "today", tab: null, sla: null, chip: null });
  const activeStage = filters.date === "today" && !filters.slaState && !attention.length ? (filters.status?.length === 1 ? (filters.status[0] as OrderStatus) : !filters.status?.length ? "today" : null) : null;
  const channelName = (code: string) => channelOptions.find((c) => c.code === code)?.name ?? code;
  const ledgerScope = [
    tab === "all" ? "All orders" : TAB_LABELS[tab],
    filters.marketplace?.length ? filters.marketplace.map(channelName).join(" + ") : "All marketplaces",
    filters.status?.length ? filters.status.map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ")).join(" + ") : "Any status",
  ].join(" · ");

  return (
    <div className="w-full flex flex-col items-start gap-3 pb-24 font-['Inter',sans-serif] text-[#000000]">
      <div className="w-full flex flex-col items-start gap-[10px]">
        <OrdersHeader
          refreshing={refreshing}
          onRefresh={() => void queryClient.invalidateQueries({ queryKey: ORDER_KEYS.all })}
          exporting={exporter.isPending}
          onExport={onExport}
          canSync={accounts.length > 0}
          canWrite={canWrite}
          syncing={sync.isPending}
          onSync={onSync}
        />
        <OrderTabs active={tab} summary={summary.data} onChange={(t) => update({ tab: t, status: null, sla: null })} />
      </div>

      <div className="w-full flex flex-col items-start gap-3">
        <OrderPulse
          summary={summary.data}
          workspace={workspace.data}
          loading={workspace.isLoading}
          error={workspace.isError ? errorMessage(workspace.error) : null}
          onRetry={() => void workspace.refetch()}
          onPick={pickStage}
          activeStage={activeStage}
        />
        <OrderAttentionStrip workspace={workspace.data} active={attention} onToggle={toggleChip} />
        {workspace.data && (
          <div className="w-full flex flex-col lg:flex-row items-start gap-7 min-h-[104px]">
            <OrderSources workspace={workspace.data} />
            <SlaPressure workspace={workspace.data} onReview={() => update({ sla: "at_risk,breached", tab: null, status: null, sort: "sla" })} />
          </div>
        )}
      </div>

      <div className="w-full flex flex-col items-start gap-4">
        <div className="w-full flex flex-col items-start gap-1">
          <div className="w-full flex flex-row justify-between items-center min-h-[43px]">
            <div className="flex flex-col items-start gap-[1px]">
              <h2 className="text-[18px] font-semibold leading-[145%] text-[#000000] m-0 p-0">Order Ledger</h2>
              <span className="text-[11px] font-normal leading-[145%] text-[#666666]">{ledgerScope}</span>
            </div>
            <span className="text-[11px] font-normal leading-[145%] text-[#666666]" aria-live="polite">
              {ledger.data ? `${total.toLocaleString("en-IN")} ${total === 1 ? "order" : "orders"}` : ""}
            </span>
          </div>

          <OrderFilters
            filters={filters}
            sort={sort}
            channels={channelOptions}
            filtered={filtered}
            onSearch={(q) => update({ q }, { replace: true })}
            onChannel={(code) => update({ marketplace: code })}
            onStatus={(statuses) => update({ status: statuses.join(",") })}
            onSla={(states) => update({ sla: states.join(",") })}
            onPayment={(payment) => update({ payment })}
            onFulfillment={(values) => update({ fulfillment: values.join(",") })}
            onDate={(date) => update({ date })}
            onAttention={(keys) => update({ chip: keys.join(",") })}
            onSort={(s) => update({ sort: s === "-placedAt" ? null : s })}
            onClear={clearFilters}
            onApplyView={(view: OrderSavedView) => update(patchOfView(view.filters, view.sort))}
          />

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
                onOpen={openOrder}
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
        </div>

        <OrderActivity
          items={activity.data}
          loading={activity.isLoading}
          error={activity.isError ? errorMessage(activity.error) : null}
          onRetry={() => void activity.refetch()}
          onOpen={openOrder}
        />
      </div>

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
