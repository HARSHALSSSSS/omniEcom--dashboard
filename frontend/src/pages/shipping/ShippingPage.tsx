import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Truck, X } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { CarriersDialog } from "@/components/shipping/CarriersDialog";
import { LabelsResultsDialog } from "@/components/shipping/LabelsResultsDialog";
import { ManifestsDialog } from "@/components/shipping/ManifestsDialog";
import { ShipmentDrawer } from "@/components/shipping/ShipmentDrawer";
import { ShipmentsTable, TableSkeleton } from "@/components/shipping/ShipmentsTable";
import { ShippingFilters } from "@/components/shipping/ShippingFilters";
import { ShippingPagination } from "@/components/shipping/ShippingPagination";
import { ShippingRibbon } from "@/components/shipping/ShippingRibbon";
import { LoadError, NoCarrier, NoMatches, NoShipments } from "@/components/shipping/ShippingStates";
import { ShippingTabs } from "@/components/shipping/ShippingTabs";
import { DEFAULT_PAGE_SIZE, LABEL_MAX, isFiltered, shipmentsQueryOf, useShippingUrlState } from "@/components/shipping/shippingParams";
import { NO_WRITE_REASON } from "@/components/shipping/shippingFormat";
import { saveBlob } from "@/components/products/list/saveBlob";
import { base64ToBlob } from "@/api/shipping.api";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useBulkLabels, useCarriers, useShipmentLabel, useShipments, useShippingSummary, useShippingWarehouses } from "@/hooks/useShipping";
import { toast } from "@/hooks/useToast";
import type { BulkLabelsResponse } from "@/types/shipping";

const pdfOf = (res: BulkLabelsResponse): { blob: Blob; fileName: string } | null =>
  res.combined.available && res.combined.content ? { blob: base64ToBlob(res.combined.content, "application/pdf"), fileName: res.combined.fileName ?? "shipping-labels.pdf" } : null;

export default function ShippingPage() {
  const url = useShippingUrlState();
  const { update, clearFilters, filters, tab, page, pageSize, days, drawerId, panel } = url;
  const canWrite = useCan("shipping:write");
  const canConfigure = useCan("shipping:configure");

  const summary = useShippingSummary(days);
  const shipments = useShipments(shipmentsQueryOf(url));
  const carriers = useCarriers();
  const warehouses = useShippingWarehouses();
  const bulk = useBulkLabels();
  const singleLabel = useShipmentLabel();

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [results, setResults] = useState<BulkLabelsResponse | null>(null);

  const rows = useMemo(() => shipments.data?.items ?? [], [shipments.data]);
  const queryKey = JSON.stringify([filters, page, pageSize]);
  // a selection belongs to the page it was made on
  useEffect(() => setSelected(new Set()), [queryKey]);

  // a page past the end (a shrinking result set, an old link) falls back to the last page
  useEffect(() => {
    const data = shipments.data;
    if (data && data.total > 0 && data.items.length === 0 && page > data.pages) update({ page: String(data.pages) }, { replace: true });
  }, [shipments.data, page, update]);

  const carrierNames = useMemo(
    () => [...new Set([...(carriers.data?.items ?? []).map((c) => c.name), ...(summary.data?.carriers ?? []).map((c) => c.name)])].sort((a, b) => a.localeCompare(b)),
    [carriers.data, summary.data],
  );
  const filtered = isFiltered(filters);

  const toggle = useCallback(
    (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );
  const toggleAll = useCallback(() => setSelected((prev) => (rows.length > 0 && rows.every((r) => prev.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id)))), [rows]);

  const printLabels = () => {
    bulk.mutate([...selected], {
      onSuccess: (res) => {
        setResults(res);
        const pdf = pdfOf(res);
        if (pdf) saveBlob(pdf.blob, pdf.fileName);
        // what failed stays selected so it can be looked at
        setSelected(new Set(res.results.filter((r) => !r.ok).map((r) => r.shipmentId)));
      },
      onError: (e) => toast({ title: "Labels could not be printed", description: errorMessage(e), variant: "destructive" }),
    });
  };

  const printOne = (id: string) =>
    singleLabel.mutate(id, {
      onSuccess: (file) => saveBlob(file.blob, file.fileName),
      onError: (e) => toast({ title: "The label could not be downloaded", description: errorMessage(e), variant: "destructive" }),
    });

  const openPdf = () => {
    const pdf = results && pdfOf(results);
    if (!pdf) return;
    const href = URL.createObjectURL(pdf.blob);
    window.open(href, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  const labelBusyId = singleLabel.isPending ? (singleLabel.variables ?? null) : null;
  const loadingList = shipments.isLoading;
  const listError = shipments.isError && !shipments.data;
  const total = shipments.data?.total ?? 0;
  const tooMany = selected.size > LABEL_MAX;

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader
        eyebrow="CARRIER LOGISTICS"
        title="Shipping Workspace"
        description="Carrier performance, AWBs, labels and transit tracking across the couriers you ship with."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-2" onClick={() => update({ panel: "manifests" }, { keepPage: true })}>
              <Layers className="h-4 w-4" aria-hidden /> Manifests
            </Button>
            <Button size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => update({ panel: "carriers" }, { keepPage: true })}>
              <Truck className="h-4 w-4" aria-hidden /> Carriers
            </Button>
          </div>
        }
      />

      <ShippingRibbon
        summary={summary.data}
        loading={summary.isLoading}
        error={summary.isError ? errorMessage(summary.error) : null}
        days={days}
        onDays={(d) => update({ days: d === 30 ? null : String(d) }, { keepPage: true })}
        onRetry={() => void summary.refetch()}
        onExceptions={() => update({ tab: "ndr" })}
      />

      <div className="space-y-4">
        <ShippingTabs active={tab} counts={shipments.data?.counts} onChange={(t) => update({ tab: t })} />
        <ShippingFilters
          filters={filters}
          carriers={carrierNames}
          warehouses={warehouses.data ?? []}
          filtered={filtered}
          onSearch={(q) => update({ q }, { replace: true })}
          onChange={(patch) => update(patch)}
          onClear={clearFilters}
        />
      </div>

      {selected.size > 0 && (
        <div role="toolbar" aria-label="Bulk actions" className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3">
          <span className="min-w-[130px] text-xs font-semibold" aria-live="polite">
            {selected.size} {selected.size === 1 ? "shipment" : "shipments"} selected
          </span>
          <Button size="sm" variant="outline" className="h-[30px] text-xs" disabled={!canWrite || bulk.isPending || tooMany} title={canWrite ? undefined : NO_WRITE_REASON} onClick={printLabels}>
            {bulk.isPending ? "Preparing labels..." : "Print labels"}
          </Button>
          <span className="text-[11px] text-muted-foreground">Up to {LABEL_MAX} shipments at a time</span>
          <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection" title="Clear selection" className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      {loadingList ? (
        <TableSkeleton rows={8} />
      ) : listError ? (
        <LoadError message={errorMessage(shipments.error)} onRetry={() => void shipments.refetch()} />
      ) : rows.length === 0 ? (
        filtered ? (
          <NoMatches onClear={clearFilters} />
        ) : carriers.data && carriers.data.items.length === 0 ? (
          <NoCarrier canConfigure={canConfigure} onSetup={() => update({ panel: "carriers" }, { keepPage: true })} />
        ) : (
          <NoShipments />
        )
      ) : (
        <>
          <ShipmentsTable
            rows={rows}
            selected={selected}
            canWrite={canWrite}
            refreshing={shipments.isFetching && shipments.isPlaceholderData}
            labelBusyId={labelBusyId}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onOpen={(id) => update({ drawer: `shipment:${id}` }, { keepPage: true })}
            onLabel={printOne}
          />
          <ShippingPagination
            page={shipments.data?.page ?? page}
            pages={shipments.data?.pages ?? 1}
            total={total}
            pageSize={pageSize}
            shown={rows.length}
            onPage={(p) => update({ page: p > 1 ? String(p) : null })}
            onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
          />
        </>
      )}

      <ShipmentDrawer
        shipmentId={drawerId}
        row={rows.find((r) => r.id === drawerId)}
        canWrite={canWrite}
        labelBusy={singleLabel.isPending}
        onClose={() => update({ drawer: null }, { keepPage: true, replace: true })}
        onLabel={printOne}
      />
      <LabelsResultsDialog
        response={results}
        busyId={labelBusyId}
        onClose={() => setResults(null)}
        onDownloadPdf={() => {
          const pdf = results && pdfOf(results);
          if (pdf) saveBlob(pdf.blob, pdf.fileName);
        }}
        onOpenPdf={openPdf}
        onLabel={printOne}
      />
      <CarriersDialog open={panel === "carriers"} canConfigure={canConfigure} onClose={() => update({ panel: null }, { keepPage: true, replace: true })} />
      <ManifestsDialog open={panel === "manifests"} onClose={() => update({ panel: null }, { keepPage: true, replace: true })} />
    </div>
  );
}
