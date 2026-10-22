import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { saveBlob } from "@/components/products/list/saveBlob";
import { shippingApi, type WarehouseOption } from "@/api/shipping.api";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useBulkOrders, useCreateShipment, useDecisions, useDispatchShipment, useShippingMethods } from "@/hooks/useShipping";
import { toast } from "@/hooks/useToast";
import { cn } from "@/utils/cn";
import { formatCurrency, formatNumber } from "@/utils/format";
import { DECISION_STATUSES, METHOD_FILTERS, SLA_BANDS, type BulkOrderAction, type BulkOrdersResult, type DecisionFilters, type DecisionItem, type DecisionQuery } from "@/types/shipping";
import { DEFAULT_PAGE_SIZE, BULK_MAX } from "./shippingParams";
import { DECISION_STATUS_FILTER_LABEL, KIND_LABEL, NO_WRITE_REASON, SLA_LABEL, SLA_TONE, decisionStatus, destinationText, slaText, weightText } from "./shippingFormat";
import { FilterSelect, Notice, SearchBox } from "./shippingUi";
import { ShippingPagination } from "./ShippingPagination";

type FilterPatch = Partial<Record<"oq" | "omarketplace" | "owarehouse" | "omethod" | "osla" | "ostatus" | "opage" | "osize", string | null>>;

interface OrdersSectionProps {
  query: DecisionQuery;
  filters: DecisionFilters;
  filtered: boolean;
  channels: ReadonlyArray<{ code: string; name: string }>;
  warehouses: WarehouseOption[];
  canWrite: boolean;
  hasMethods: boolean;
  /** shown above the table when this is a section of the overview instead of its own tab */
  embedded: boolean;
  onUpdate: (patch: FilterPatch, opts?: { replace?: boolean; keepPage?: boolean }) => void;
  onClear: () => void;
  onChoose: (fulfillmentId: string) => void;
  onBulkAssign: (fulfillmentIds: string[]) => void;
  /** downloads the label of a labelled order */
  onPrintLabel: (shipmentId: string) => void;
  /** opens the Book slot drawer for this order's warehouse and method */
  onBookSlot: (item: DecisionItem) => void;
  /** Track dispatch: the Tracking tab with this order pre-selected */
  onTrack: (item: DecisionItem) => void;
  onSetupMethods: () => void;
}

const ACTION_TITLE: Record<BulkOrderAction, string> = { assign_method: "Assign shipping method", generate_labels: "Generate labels", recalculate: "Recalculate shipping option" };

function BulkResultDialog({ result, onClose }: { result: BulkOrdersResult | null; onClose: () => void }) {
  const failures = result?.results.filter((r) => !r.ok) ?? [];
  return (
    <Dialog open={result !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{result ? (ACTION_TITLE[result.action as BulkOrderAction] ?? "Bulk action") : "Bulk action"}</DialogTitle>
          <DialogDescription>
            {result ? `${result.succeeded} of ${result.requested} ${result.requested === 1 ? "order" : "orders"} done, ${result.failed} could not be processed.` : ""}
          </DialogDescription>
        </DialogHeader>
        {failures.length > 0 && (
          <ul className="max-h-[300px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {failures.map((f) => (
              <li key={f.fulfillmentId} className="px-3 py-2.5 text-xs">
                <p className="font-semibold text-foreground">{f.number ?? f.fulfillmentId}</p>
                <p className="text-muted-foreground">{f.message ?? "It could not be processed."}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <Button size="sm" className="text-xs" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface RowHandlers {
  onChoose: (fulfillmentId: string) => void;
  onDispatch: (item: DecisionItem) => void;
  onPrintLabel: (shipmentId: string) => void;
  onGenerateLabel: (item: DecisionItem) => void;
  onEnterAwb: (item: DecisionItem) => void;
  onBookSlot: (item: DecisionItem) => void;
  onTrack: (item: DecisionItem) => void;
}

const ACTION_LINK = "font-medium hover:underline disabled:cursor-not-allowed disabled:opacity-50";

/** the design's per-state actions: Choose shipping → / Review choice → / View label → / Print label → + Dispatch, with what the row's state allows */
function RowActions({ o, canWrite, busy, h }: { o: DecisionItem; canWrite: boolean; busy: boolean; h: RowHandlers }) {
  const a = o.action;
  const tone = o.status === "exception" ? "text-[#DC2626]" : "text-[#2563EB]";
  const arrow = <span aria-hidden> →</span>;
  const primary =
    a.key === "dispatch" ? (
      <button type="button" disabled={!canWrite || busy} title={canWrite ? "Hand the parcel over to the courier" : NO_WRITE_REASON} aria-label={`${a.label} ${o.number}`} onClick={() => h.onDispatch(o)} className={cn(ACTION_LINK, "text-[#16A34A]")}>
        {a.label}
        {arrow}
      </button>
    ) : a.key === "book_slot" ? (
      <button type="button" disabled={!canWrite} title={canWrite ? "Book a pickup slot with the carrier" : NO_WRITE_REASON} aria-label={`${a.label} ${o.number}`} onClick={() => h.onBookSlot(o)} className={cn(ACTION_LINK, "text-[#D97706]")}>
        {a.label}
        {arrow}
      </button>
    ) : a.key === "track_dispatch" ? (
      <button type="button" aria-label={`${a.label} ${o.number}`} onClick={() => h.onTrack(o)} className={cn(ACTION_LINK, tone)}>
        {a.label}
        {arrow}
      </button>
    ) : a.key === "view_label" ? (
      <button type="button" disabled title="The label is not ready yet." aria-label={`${a.label} ${o.number}`} className={cn(ACTION_LINK, tone)}>
        {a.label}
        {arrow}
      </button>
    ) : (
      <button type="button" aria-label={`${a.label} ${o.number}`} onClick={() => h.onChoose(o.fulfillmentId)} className={cn(ACTION_LINK, tone)}>
        {a.label}
        {arrow}
      </button>
    );
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
      {o.secondaryActions.map((s) => {
        const run = s.key === "print_label" ? () => h.onPrintLabel(o.shipmentId as string) : s.key === "enter_awb" ? () => h.onEnterAwb(o) : s.key === "review" ? () => h.onChoose(o.fulfillmentId) : () => h.onGenerateLabel(o);
        const needsWrite = s.key !== "print_label" && s.key !== "review";
        return (
          <button
            key={s.key}
            type="button"
            disabled={s.enabled === false || (needsWrite && (!canWrite || busy))}
            title={s.enabled === false ? "This method cannot produce a label." : needsWrite && !canWrite ? NO_WRITE_REASON : undefined}
            aria-label={`${s.label} ${o.number}`}
            onClick={run}
            className={cn(ACTION_LINK, "text-black")}
          >
            {s.label}
          </button>
        );
      })}
      {primary}
    </div>
  );
}

function OrdersTable({
  rows,
  selected,
  canWrite,
  refreshing,
  busy,
  onToggle,
  onToggleAll,
  handlers,
}: {
  rows: DecisionItem[];
  selected: ReadonlySet<string>;
  canWrite: boolean;
  refreshing: boolean;
  busy: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  handlers: RowHandlers;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-[#EAEAEA] bg-white text-[11px] transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing}>
      <table className="w-full min-w-[1000px] text-left">
        <thead className="border-y border-[#EAEAEA] bg-[#F5F5F5] text-[10px] font-normal text-[#666666]">
          <tr>
            <th className="w-8 py-2.5 pl-3">
              <input
                type="checkbox"
                aria-label="Select all orders on this page"
                checked={rows.length > 0 && rows.every((r) => selected.has(r.fulfillmentId))}
                disabled={!canWrite}
                title={canWrite ? undefined : NO_WRITE_REASON}
                onChange={onToggleAll}
                className="h-3 w-3 rounded border-[#BDBDBD] accent-black"
              />
            </th>
            {["Order", "Marketplace", "Warehouse", "Destination", "Order Value", "Weight", "Available Shipping", "Selected Method", "SLA", "Status"].map((h) => (
              <th key={h} scope="col" className="px-2 py-2.5 font-normal">
                {h}
              </th>
            ))}
            <th scope="col" className="py-2.5 pr-3 text-right font-normal">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EAEAEA]">
          {rows.map((o) => {
            const status = decisionStatus(o);
            const usable = o.availableMethods.filter((m) => m.available).map((m) => m.name);
            return (
              <tr key={o.fulfillmentId} className="hover:bg-neutral-50/50">
                <td className="py-2.5 pl-3">
                  <input
                    type="checkbox"
                    aria-label={`Select order ${o.number}`}
                    checked={selected.has(o.fulfillmentId)}
                    disabled={!canWrite}
                    title={canWrite ? undefined : NO_WRITE_REASON}
                    onChange={() => onToggle(o.fulfillmentId)}
                    className="h-3 w-3 rounded border-[#BDBDBD] accent-black"
                  />
                </td>
                <td className="px-2 py-2.5 font-semibold text-black">{o.number}</td>
                <td className="px-2 py-2.5 text-black">{o.channel.name}</td>
                <td className="px-2 py-2.5 text-black">{o.warehouse.name}</td>
                <td className="px-2 py-2.5 text-black">{destinationText(o.destination)}</td>
                <td className="px-2 py-2.5 text-black">{formatCurrency(o.valueMinor, o.currency)}</td>
                <td className="px-2 py-2.5 text-black">{weightText(o.weightGrams)}</td>
                <td className="px-2 py-2.5 text-black">{usable.length ? usable.join(" / ") : "None available"}</td>
                <td className="px-2 py-2.5 text-black">{o.selectedMethod ? o.selectedMethod.name : "—"}</td>
                <td className={cn("px-2 py-2.5", SLA_TONE[o.sla.band])}>{slaText(o.sla)}</td>
                <td className="px-2 py-2.5">
                  <span className={cn("font-medium", status.tone)}>{status.text}</span>
                </td>
                <td className="py-2.5 pr-3 text-right">
                  <RowActions o={o} canWrite={canWrite} busy={busy} h={handlers} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** the packed orders waiting for a shipping decision, with the design's filters and bulk rail */
export function OrdersSection(props: OrdersSectionProps) {
  const { query, filters, filtered, channels, warehouses, canWrite, onUpdate } = props;
  const orders = useDecisions(query);
  const bulk = useBulkOrders();
  const methods = useShippingMethods();
  const createShipment = useCreateShipment();
  const dispatch = useDispatchShipment();
  const [awbFor, setAwbFor] = useState<DecisionItem | null>(null);
  const [awb, setAwb] = useState("");
  const [awbError, setAwbError] = useState<string | null>(null);
  const [dispatchFor, setDispatchFor] = useState<DecisionItem | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [result, setResult] = useState<BulkOrdersResult | null>(null);
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(() => orders.data?.items ?? [], [orders.data]);
  const queryKey = JSON.stringify(query);
  // a selection belongs to the page it was made on
  useEffect(() => setSelected(new Set()), [queryKey]);

  // a page past the end (a shrinking result set, an old link) falls back to the last page
  useEffect(() => {
    const data = orders.data;
    if (data && data.total > 0 && data.items.length === 0 && query.page > data.pages) onUpdate({ opage: String(data.pages) }, { replace: true });
  }, [orders.data, query.page, onUpdate]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAll = () => setSelected((prev) => (rows.length > 0 && rows.every((r) => prev.has(r.fulfillmentId)) ? new Set() : new Set(rows.map((r) => r.fulfillmentId))));

  const ids = [...selected];
  const tooMany = ids.length > BULK_MAX;

  const run = (action: BulkOrderAction) =>
    bulk.mutate(
      { ids, action },
      {
        onSuccess: (res) => {
          setResult(res);
          // what failed stays selected so it can be looked at
          setSelected(new Set(res.results.filter((r) => !r.ok).map((r) => r.fulfillmentId)));
        },
        onError: (e) => toast({ title: `${ACTION_TITLE[action]} failed`, description: errorMessage(e), variant: "destructive" }),
      },
    );

  const rowBusy = bulk.isPending || createShipment.isPending || dispatch.isPending;

  const generateLabel = (item: DecisionItem) =>
    bulk.mutate(
      { ids: [item.fulfillmentId], action: "generate_labels" },
      {
        onSuccess: (res) => {
          const r = res.results[0];
          if (r?.ok) toast({ title: `Label created for ${item.number}`, description: r.awb ? `AWB ${r.awb}` : undefined, variant: "success" });
          else toast({ title: `The label for ${item.number} could not be created`, description: r?.message ?? "It could not be processed.", variant: "destructive" });
        },
        onError: (e) => toast({ title: "The label could not be created", description: errorMessage(e), variant: "destructive" }),
      },
    );

  const submitAwb = () => {
    if (!awbFor) return;
    const providerCode = methods.data?.items.find((m) => m.id === awbFor.selectedMethod?.providerId)?.providerCode;
    if (!providerCode) {
      setAwbError("The shipping method of this order could not be found. Reload and try again.");
      return;
    }
    setAwbError(null);
    createShipment.mutate(
      { fulfillmentId: awbFor.fulfillmentId, providerCode, awb: awb.trim() },
      {
        onSuccess: () => {
          toast({ title: `Label created for ${awbFor.number}`, description: `AWB ${awb.trim()}`, variant: "success" });
          setAwbFor(null);
          setAwb("");
        },
        onError: (e) => setAwbError(errorMessage(e)),
      },
    );
  };

  const confirmDispatch = () => {
    if (!dispatchFor?.shipmentId) return;
    const item = dispatchFor;
    dispatch.mutate(item.shipmentId as string, {
      onSuccess: () => {
        setDispatchFor(null);
        toast({ title: `${item.number} dispatched`, description: "The order is marked dispatched and the marketplace is told.", variant: "success" });
      },
      onError: (e) => {
        setDispatchFor(null);
        toast({ title: "The order could not be dispatched", description: errorMessage(e), variant: "destructive" });
      },
    });
  };

  const handlers: RowHandlers = {
    onChoose: props.onChoose,
    onDispatch: setDispatchFor,
    onPrintLabel: props.onPrintLabel,
    onBookSlot: props.onBookSlot,
    onTrack: props.onTrack,
    onGenerateLabel: generateLabel,
    onEnterAwb: (item) => {
      setAwb("");
      setAwbError(null);
      setAwbFor(item);
    },
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const file = await shippingApi.exportOrders(filters);
      saveBlob(file.blob, file.fileName);
    } catch (e) {
      toast({ title: "The export failed", description: errorMessage(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const total = orders.data?.total ?? 0;
  const readyToShip = orders.data?.counts.readyToShip;
  const none = ids.length === 0;
  const off = !canWrite;
  const railBtn = "text-black hover:underline disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section className={cn("space-y-3.5", props.embedded ? "border-t border-[#EAEAEA] pt-4" : "pt-1")} aria-label="Orders to ship">
      {props.embedded && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-[#666666]">ALTERNATE VIEW</span>
          <span className="h-2.5 w-[1px] bg-[#BDBDBD]" />
          <span className="text-[11px] font-semibold text-black">Orders to Ship</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-semibold text-black">Orders to Ship</h2>
          <p className="text-[11px] text-[#666666]">Packed orders waiting for a shipping decision · no shipping prices or SLA promises</p>
        </div>
        <span className="text-[11px] text-[#666666]">{readyToShip === undefined ? "—" : formatNumber(readyToShip)} ready to ship</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={filters.q ?? ""} label="Search orders to ship" placeholder="Search order / SKU" onSearch={(q) => onUpdate({ oq: q }, { replace: true })} />
        <FilterSelect label="Marketplace" value={filters.marketplace ?? ""} options={channels.map((c) => ({ value: c.code, label: c.name }))} onChange={(v) => onUpdate({ omarketplace: v })} />
        <FilterSelect label="Warehouse" value={filters.warehouse ?? ""} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} onChange={(v) => onUpdate({ owarehouse: v })} />
        <FilterSelect
          label="Shipping method"
          value={filters.method ?? ""}
          options={METHOD_FILTERS.map((m) => ({ value: m, label: m === "unassigned" ? "Not assigned" : KIND_LABEL[m] }))}
          onChange={(v) => onUpdate({ omethod: v })}
        />
        <FilterSelect label="SLA" value={filters.sla ?? ""} options={SLA_BANDS.map((b) => ({ value: b, label: SLA_LABEL[b] }))} onChange={(v) => onUpdate({ osla: v })} />
        <FilterSelect label="Status" value={filters.status ?? ""} options={DECISION_STATUSES.map((s) => ({ value: s, label: DECISION_STATUS_FILTER_LABEL[s] }))} onChange={(v) => onUpdate({ ostatus: v })} />
        {filtered && (
          <button type="button" onClick={props.onClear} className="h-8 rounded-lg px-2.5 text-[12px] font-medium text-[#666666] underline-offset-2 hover:text-black hover:underline">
            Clear filters
          </button>
        )}
      </div>

      <div role="toolbar" aria-label="Bulk actions" className="flex flex-wrap items-center gap-4 border-t border-[#EAEAEA] pt-2 text-[11px]">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={rows.length > 0 && rows.every((r) => selected.has(r.fulfillmentId))} disabled={off || rows.length === 0} onChange={toggleAll} className="h-3 w-3 rounded border-[#BDBDBD] accent-black" />
          <span className="text-black">Select all</span>
        </label>
        {!none && (
          <span className="text-[#666666]" aria-live="polite">
            {ids.length} {ids.length === 1 ? "order" : "orders"} selected
          </span>
        )}
        <button
          type="button"
          disabled={off || rows.length === 0 || tooMany}
          title={off ? NO_WRITE_REASON : undefined}
          onClick={() => (none ? rows[0] && props.onChoose(rows[0].fulfillmentId) : props.onBulkAssign(ids))}
          className={cn("font-semibold", railBtn)}
        >
          Assign shipping method
        </button>
        <button type="button" disabled={off || none || tooMany || bulk.isPending} title={off ? NO_WRITE_REASON : undefined} onClick={() => run("generate_labels")} className={cn("font-semibold", railBtn)}>
          {bulk.isPending && bulk.variables?.action === "generate_labels" ? "Generating labels..." : "Generate labels where supported"}
        </button>
        <button type="button" disabled={off || none || tooMany || bulk.isPending} title={off ? NO_WRITE_REASON : undefined} onClick={() => run("recalculate")} className={railBtn}>
          {bulk.isPending && bulk.variables?.action === "recalculate" ? "Recalculating..." : "Recalculate shipping option"}
        </button>
        {tooMany && <span className="text-[#D97706]">Up to {BULK_MAX} orders at a time</span>}
        <button type="button" disabled={exporting || total === 0} onClick={() => void onExport()} className="ml-auto text-black hover:underline disabled:opacity-40">
          {exporting ? "Exporting..." : "Export"}
        </button>
      </div>

      {orders.isLoading ? (
        <div role="status" aria-label="Loading orders to ship" className="space-y-px overflow-hidden rounded-lg border border-[#EAEAEA] bg-white p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="my-2 h-8 w-full" />
          ))}
        </div>
      ) : orders.isError && !orders.data ? (
        <Notice role="alert" title="Orders to ship could not be loaded.">
          <p>{errorMessage(orders.error)}</p>
          <button type="button" onClick={() => void orders.refetch()} className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-medium text-black hover:bg-neutral-50">
            Retry
          </button>
        </Notice>
      ) : rows.length === 0 ? (
        filtered ? (
          <Notice title="No orders match these filters.">
            <p>Try a different search, marketplace or status.</p>
            <button type="button" onClick={props.onClear} className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-medium text-black hover:bg-neutral-50">
              Clear filters
            </button>
          </Notice>
        ) : (
          <Notice title="No orders are waiting to ship.">
            <p>Orders appear here once they are packed in Fulfillment and need a shipping method.</p>
            {!props.hasMethods && (
              <button type="button" onClick={props.onSetupMethods} className="h-8 rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] font-medium text-black hover:bg-neutral-50">
                Set up a shipping method
              </button>
            )}
          </Notice>
        )
      ) : (
        <>
          <OrdersTable rows={rows} selected={selected} canWrite={canWrite} refreshing={orders.isFetching && orders.isPlaceholderData} busy={rowBusy} onToggle={toggle} onToggleAll={toggleAll} handlers={handlers} />
          <ShippingPagination
            noun="orders"
            page={orders.data?.page ?? query.page}
            pages={orders.data?.pages ?? 1}
            total={total}
            pageSize={query.pageSize}
            shown={rows.length}
            onPage={(p) => onUpdate({ opage: p > 1 ? String(p) : null })}
            onPageSize={(size) => onUpdate({ osize: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
          />
        </>
      )}

      <BulkResultDialog result={result} onClose={() => setResult(null)} />

      <Dialog open={awbFor !== null} onOpenChange={(o) => !o && setAwbFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enter AWB{awbFor ? ` — ${awbFor.number}` : ""}</DialogTitle>
            <DialogDescription>{awbFor?.selectedMethod?.name ?? "The logistics provider"} issues the AWB. Enter the one it gave you; the label is created with it.</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-xs text-muted-foreground">
            <span>AWB</span>
            <input aria-label="AWB" value={awb} maxLength={80} onChange={(e) => setAwb(e.target.value)} className="h-9 w-full rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] text-black focus:border-black focus:outline-none" />
          </label>
          {awbError && (
            <p role="alert" className="text-xs text-[#B91C1C]">
              {awbError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => setAwbFor(null)}>
              Cancel
            </Button>
            <Button size="sm" className="text-xs" disabled={awb.trim().length < 3 || createShipment.isPending} onClick={submitAwb}>
              {createShipment.isPending ? "Creating..." : "Create label"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dispatchFor !== null}
        onOpenChange={(o) => !o && setDispatchFor(null)}
        title={`Dispatch ${dispatchFor?.number ?? "this order"}?`}
        description="The parcel is handed over to the courier: the order is marked dispatched with its AWB and the marketplace is told. It cannot be undone from here."
        confirmText="Dispatch"
        cancelText="Not yet"
        loading={dispatch.isPending}
        onConfirm={confirmDispatch}
      />
    </section>
  );
}
