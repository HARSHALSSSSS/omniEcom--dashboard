import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { ExceptionsTable, ResolveExceptionDialog } from "@/components/fulfillment/ExceptionsPanel";
import { FulfillmentBulkBar, HandoverDialog, HandoverResultsDialog } from "@/components/fulfillment/FulfillmentBulkBar";
import { FulfillmentDrawer } from "@/components/fulfillment/FulfillmentDrawer";
import { FulfillmentFilters } from "@/components/fulfillment/FulfillmentFilters";
import { FulfillmentPagination, FulfillmentTabs } from "@/components/fulfillment/FulfillmentNav";
import { QueueTable } from "@/components/fulfillment/QueueTable";
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
  useFulfillmentExceptions,
  useFulfillmentQueue,
  useFulfillmentWarehouses,
  useResolveException,
} from "@/hooks/useFulfillment";
import { toast } from "@/hooks/useToast";
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
      <PageHeader
        eyebrow="OPERATIONAL DISPATCH"
        title="Fulfillment Workspace"
        description="Pick, pack, manifest, and dispatch orders across warehouses with barcode scanning and batch generation."
      />

      <div className="space-y-4">
        <FulfillmentTabs active={tab} counts={counts} onChange={(t) => update({ tab: t })} />
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

      <FulfillmentDrawer orderId={drawerId} canWrite={canWrite} onClose={() => update({ drawer: null }, { keepPage: true, replace: true })} />
      <HandoverDialog open={handoverOpen} rows={selectedRows} busy={handover.isPending} error={handoverError} onConfirm={onHandover} onClose={() => setHandoverOpen(false)} />
      <HandoverResultsDialog response={results} onClose={() => setResults(null)} />
      <ResolveExceptionDialog target={resolving} busy={resolve.isPending} error={resolveError} onConfirm={onResolve} onClose={() => setResolving(null)} />
    </div>
  );
}
