import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { ExceptionsTable, ResolveExceptionDialog } from "@/components/fulfillment/ExceptionsPanel";
import { FulfillmentBulkBar, HandoverDialog, HandoverResultsDialog } from "@/components/fulfillment/FulfillmentBulkBar";
import { FulfillmentDrawer } from "@/components/fulfillment/FulfillmentDrawer";
import { FulfillmentFilters } from "@/components/fulfillment/FulfillmentFilters";
import { FulfillmentPagination, FulfillmentTabs } from "@/components/fulfillment/FulfillmentNav";
import { QueueTable } from "@/components/fulfillment/QueueTable";
import { OrderFlowStepper } from "@/components/fulfillment/OrderFlowStepper";
import { FulfillmentPriorityBanner } from "@/components/fulfillment/FulfillmentPriorityBanner";
import { FulfillmentExceptionsStrip } from "@/components/fulfillment/FulfillmentExceptionsStrip";
import { FulfillmentActivityTimeline } from "@/components/fulfillment/FulfillmentActivityTimeline";
import { actionErrorMessage, runsFromRow } from "@/components/fulfillment/fulfillmentFormat";
import {
  DEFAULT_PAGE_SIZE,
  TAB_LABELS,
  exceptionsQueryOf,
  isFiltered,
  queueQueryOf,
  useFulfillmentUrlState,
} from "@/components/fulfillment/fulfillmentParams";
import { EmptyExceptions, EmptyQueue, LoadError, NoMatches, TableSkeleton } from "@/components/fulfillment/fulfillmentUi";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import {
  useBatchHandover,
  useCreatePickList,
  useFulfillmentAction,
  useFulfillmentCarriers,
  useFulfillmentActivity,
  useFulfillmentExceptions,
  useFulfillmentQueue,
  useFulfillmentWarehouses,
  useResolveException,
} from "@/hooks/useFulfillment";
import { toast } from "@/hooks/useToast";
import { cn } from "@/utils/cn";
import type { BatchHandoverResponse, ExceptionRow, QueueRow } from "@/types/fulfillment";

/** the API takes at most this many orders per hand-over (the page size never exceeds it) */
const BULK_MAX = 100;

export default function FulfillmentPage() {
  const url = useFulfillmentUrlState();
  const { update, clearFilters, tab, page, pageSize, drawerId } = url;
  const canWrite = useCan("fulfillment:write");
  const canShip = useCan("shipping:write");
  const canReadShipping = useCan("shipping:read");
  const onExceptions = tab === "exceptions";

  // the queue always loads: its counts feed every tab, including the exceptions tab
  const queue = useFulfillmentQueue(queueQueryOf(onExceptions ? { ...url, tab: "all", page: 1 } : url));
  const exceptions = useFulfillmentExceptions(exceptionsQueryOf(url), onExceptions);
  const activity = useFulfillmentActivity(5);
  const warehouses = useFulfillmentWarehouses();
  const carriers = useFulfillmentCarriers(canReadShipping);

  const act = useFulfillmentAction();
  const pickList = useCreatePickList();
  const handover = useBatchHandover();
  const resolve = useResolveException();

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverError, setHandoverError] = useState<string | null>(null);
  const [results, setResults] = useState<BatchHandoverResponse | null>(null);
  const [resolving, setResolving] = useState<{ row: ExceptionRow; status: "resolved" | "dismissed" } | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(() => queue.data?.items ?? [], [queue.data]);
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.fulfillmentId)), [rows, selected]);

  // Derive real priority breach orders from backend queue items
  const priorityOrders = useMemo(() => {
    if (!queue.data?.items) return undefined;
    const candidates = queue.data.items
      .filter((r) => r.priority === "urgent" || r.priority === "high" || (r.sla?.band === "at_risk" || r.sla?.band === "breached"))
      .map((r) => {
        const leftUnits = r.items.reduce((acc, i) => acc + Math.max(0, i.quantity - i.pickedQuantity), 0);
        return {
          orderNumber: r.orderNumber,
          marketplace: r.channel.name.replace(/ India| US| UK/i, ""),
          minutesRemaining: r.sla?.minutesRemaining ?? null,
          subtext: `${r.stageLabel || "Picking in progress"}${leftUnits > 0 ? ` · ${leftUnits} item${leftUnits > 1 ? "s" : ""} left` : ""}`,
          orderId: r.orderId,
        };
      });
    return candidates;
  }, [queue.data?.items]);

  // Derive real exception categories from backend counts and data
  const exceptionCategories = useMemo(() => {
    if (!queue.data?.counts) return undefined;
    const totalExceptions = queue.data.counts.exceptions;
    if (totalExceptions === 0) return [];

    if (exceptions.data?.items && exceptions.data.items.length > 0) {
      const countsByKind: Record<string, number> = {};
      for (const item of exceptions.data.items) {
        if (item.status === "open") {
          countsByKind[item.kind] = (countsByKind[item.kind] ?? 0) + 1;
        }
      }
      const KIND_MAP: Record<string, string> = {
        pick_short: "Quantity mismatch",
        insufficient_stock: "Inventory issue",
        damaged: "Damaged item",
        wrong_item: "Wrong item",
        pack_issue: "Packing issue",
        address_issue: "Shipping method unavailable",
        ndr: "Delivery issue",
        other: "Evidence required",
      };
      return Object.entries(countsByKind).map(([kind, count]) => ({
        id: kind,
        count,
        label: KIND_MAP[kind] ?? kind.replace(/_/g, " "),
      }));
    }

    return [
      { id: "all", count: totalExceptions, label: "Fulfillment exceptions" },
    ];
  }, [exceptions.data?.items, queue.data?.counts]);

  const listKey = JSON.stringify([tab, url.q, url.warehouse, url.carrier, url.priority, url.hasException, page, pageSize]);
  // a selection belongs to the page it was made on
  useEffect(() => setSelected(new Set()), [listKey]);

  const active = onExceptions ? exceptions : queue;
  // a page past the end (a shrinking result set, an old link) falls back to the last page
  useEffect(() => {
    const data = active.data;
    if (data && data.total > 0 && data.items.length === 0 && page > data.pages) update({ page: String(data.pages) }, { replace: true });
  }, [active.data, page, update]);

  const toggle = useCallback(
    (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );
  const toggleAll = useCallback(() => setSelected((prev) => (rows.length > 0 && rows.every((r) => prev.has(r.fulfillmentId)) ? new Set() : new Set(rows.map((r) => r.fulfillmentId)))), [rows]);

  const runRow = (row: QueueRow) => {
    if (!row.nextAction || !runsFromRow(row.nextAction)) return;
    setBusyId(row.fulfillmentId);
    act.mutate(
      { orderId: row.orderId, action: row.nextAction, fulfillmentId: row.fulfillmentId },
      {
        onSuccess: () => toast({ title: "Done", description: `${row.orderNumber} updated.`, variant: "success" }),
        onError: (e) => toast({ title: `${row.orderNumber} could not be updated`, description: actionErrorMessage(e), variant: "destructive" }),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const onPickList = () =>
    pickList.mutate(
      selectedRows.map((r) => r.fulfillmentId),
      {
        onSuccess: (list) => {
          setSelected(new Set());
          toast({ title: "Picking batch created", description: `Pick list ${list.number} for ${selectedRows.length} ${selectedRows.length === 1 ? "order" : "orders"}.`, variant: "success" });
        },
        onError: (e) => toast({ title: "Picking batch could not be created", description: actionErrorMessage(e), variant: "destructive" }),
      },
    );

  const onHandover = (carrier: string) => {
    setHandoverError(null);
    handover.mutate(
      { carrier, orderIds: selectedRows.map((r) => r.orderId) },
      {
        onSuccess: (res) => {
          setHandoverOpen(false);
          setResults(res);
          // what failed stays selected so it can be retried or looked at
          const failed = new Set(res.results.filter((r) => !r.ok).map((r) => r.orderId));
          setSelected(new Set(rows.filter((r) => failed.has(r.orderId)).map((r) => r.fulfillmentId)));
        },
        onError: (e) => setHandoverError(errorMessage(e)),
      },
    );
  };

  const onResolve = (input: { status: "resolved" | "dismissed"; note?: string; action: "none" | "hold" | "cancel_fulfillment" }) => {
    if (!resolving) return;
    setResolveError(null);
    resolve.mutate(
      { id: resolving.row.id, ...input },
      {
        onSuccess: () => {
          setResolving(null);
          toast({ title: input.status === "resolved" ? "Exception resolved" : "Exception dismissed", variant: "success" });
        },
        onError: (e) => setResolveError(actionErrorMessage(e)),
      },
    );
  };

  const filtered = isFiltered(url);
  const counts = queue.data?.counts;
  const loading = active.isLoading;
  const loadError = active.isError && !active.data;

  return (
    <div className="w-full space-y-6 pb-24">
      {/* 1. Header with breadcrumbs and actions matching Figma Screen 1 */}
      <PageHeader
        eyebrow="Workspace / Orders / Fulfillment"
        title="Fulfillment"
        description="Pick, pack and dispatch orders from one operational workspace."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs font-medium"
              onClick={() => {
                void queue.refetch();
                void exceptions.refetch();
              }}
            >
              <RefreshCw className={cn("h-3.5 w-3.5 text-muted-foreground", (queue.isFetching || exceptions.isFetching) && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs font-medium"
              onClick={onPickList}
              disabled={selectedRows.length === 0 || !canWrite}
            >
              <Printer className="h-3.5 w-3.5 text-muted-foreground" />
              Print pick list
            </Button>
          </div>
        }
      />

      {/* 2. Top Mode Switcher & Floor Status */}
      <FulfillmentTabs active={tab} counts={counts} onChange={(t) => update({ tab: t })} />

      {/* 3. Order Flow Stepper matching Figma Screen 1 */}
      <OrderFlowStepper
        activeTab={tab}
        counts={counts}
        warehouseName={warehouses.data?.length === 1 ? warehouses.data[0].name : undefined}
        onSelectTab={(t) => update({ tab: t })}
      />

      {/* 4. Fulfillment Priority Alert Banner matching Figma Screen 1 */}
      <FulfillmentPriorityBanner
        orders={priorityOrders}
        onOpenOrder={(orderId) => update({ drawer: `order:${orderId}` }, { keepPage: true })}
        onWorkOnPriority={() => update({ priority: "urgent" })}
      />

      {/* 5. Pick Queue Header & Filter Controls */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                {tab === "packing" ? "Pack Queue" : tab === "ready_to_ship" ? "Dispatch Queue" : "Pick Queue"}
              </h2>
              <span className="font-mono text-xs text-muted-foreground">
                {queue.data ? `${queue.data.total} orders` : "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              All orders · {warehouses.data?.[0]?.name ?? "Mumbai warehouse"} · All pickers
            </p>
          </div>
        </div>

        <FulfillmentFilters
          state={url}
          warehouses={warehouses.data ?? []}
          carriers={canReadShipping && carriers.data ? carriers.data : null}
          filtered={filtered}
          onSearch={(q) => update({ q }, { replace: true })}
          onWarehouse={(warehouse) => update({ warehouse })}
          onCarrier={(carrier) => update({ carrier })}
          onPriority={(priority) => update({ priority })}
          onException={(exception) => update({ exception })}
          onExceptionStatus={(status) => update({ xstatus: status === "open" ? null : status })}
          onClear={clearFilters}
        />
      </div>

      {!onExceptions && selectedRows.length > 0 && (
        <FulfillmentBulkBar
          rows={selectedRows}
          canWrite={canWrite}
          canShip={canShip}
          busy={pickList.isPending || handover.isPending}
          max={BULK_MAX}
          onPickList={onPickList}
          onHandover={() => {
            setHandoverError(null);
            setHandoverOpen(true);
          }}
          onClear={() => setSelected(new Set())}
        />
      )}

      {loading ? (
        <TableSkeleton rows={8} label={onExceptions ? "Loading exceptions" : "Loading queue"} />
      ) : loadError ? (
        <LoadError title={onExceptions ? "Exceptions could not be loaded." : "The fulfillment queue could not be loaded."} message={errorMessage(active.error)} onRetry={() => void active.refetch()} />
      ) : onExceptions ? (
        exceptions.data && exceptions.data.items.length > 0 ? (
          <>
            <ExceptionsTable
              rows={exceptions.data.items}
              canWrite={canWrite}
              refreshing={exceptions.isFetching && exceptions.isPlaceholderData}
              onOpen={(id) => update({ drawer: `order:${id}` }, { keepPage: true })}
              onResolve={(row, status) => {
                setResolveError(null);
                setResolving({ row, status });
              }}
            />
            <FulfillmentPagination
              page={exceptions.data.page}
              pages={exceptions.data.pages}
              total={exceptions.data.total}
              pageSize={pageSize}
              shown={exceptions.data.items.length}
              noun="exceptions"
              onPage={(p) => update({ page: p > 1 ? String(p) : null })}
              onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
            />
          </>
        ) : filtered ? (
          <NoMatches onClear={clearFilters} />
        ) : (
          <EmptyExceptions status={url.exceptionStatus} />
        )
      ) : rows.length === 0 ? (
        filtered ? <NoMatches onClear={clearFilters} /> : <EmptyQueue stage={tab === "all" ? null : TAB_LABELS[tab]} />
      ) : (
        <>
          <QueueTable
            rows={rows}
            selected={selected}
            canWrite={canWrite}
            refreshing={queue.isFetching && queue.isPlaceholderData}
            busyId={busyId}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onOpen={(id) => update({ drawer: `order:${id}` }, { keepPage: true })}
            onAct={runRow}
          />
          <FulfillmentPagination
            page={queue.data?.page ?? page}
            pages={queue.data?.pages ?? 1}
            total={queue.data?.total ?? 0}
            pageSize={pageSize}
            shown={rows.length}
            noun="orders"
            onPage={(p) => update({ page: p > 1 ? String(p) : null })}
            onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
          />
        </>
      )}

      {/* 6. Exceptions Summary Strip matching Figma Screen 1 */}
      {!onExceptions && (
        <FulfillmentExceptionsStrip
          categories={exceptionCategories}
          onSelectException={() => update({ tab: "exceptions" })}
        />
      )}

      {/* 7. Fulfillment Activity Timeline matching Figma Screen 1 */}
      {!onExceptions && (
        <FulfillmentActivityTimeline
          events={activity.data}
          loading={activity.isLoading}
          error={activity.isError ? errorMessage(activity.error) : null}
          onRetry={() => void activity.refetch()}
          onOpenOrder={(orderId) => update({ drawer: `order:${orderId}` }, { keepPage: true })}
        />
      )}

      {/* Drawers and Dialogs */}
      <FulfillmentDrawer orderId={drawerId} canWrite={canWrite} onClose={() => update({ drawer: null }, { keepPage: true, replace: true })} />
      <HandoverDialog open={handoverOpen} rows={selectedRows} busy={handover.isPending} error={handoverError} onConfirm={onHandover} onClose={() => setHandoverOpen(false)} />
      <HandoverResultsDialog response={results} onClose={() => setResults(null)} />
      <ResolveExceptionDialog target={resolving} busy={resolve.isPending} error={resolveError} onConfirm={onResolve} onClose={() => setResolving(null)} />
    </div>
  );
}
