import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { base64ToBlob, type WarehouseOption } from "@/api/shipping.api";
import { saveBlob } from "@/components/products/list/saveBlob";
import { useBulkLabels, useCarriers, useShipments, useShippingSummary } from "@/hooks/useShipping";
import { toast } from "@/hooks/useToast";
import type { BulkLabelsResponse, ShipmentCounts, ShipmentFilters, ShipmentsQuery } from "@/types/shipping";
import { LabelsResultsDialog } from "./LabelsResultsDialog";
import { ShipmentsTable, TableSkeleton } from "./ShipmentsTable";
import { ShippingFilters, type FilterPatch } from "./ShippingFilters";
import { ShippingPagination } from "./ShippingPagination";
import { ShippingRibbon } from "./ShippingRibbon";
import { LoadError, NoCarrier, NoMatches, NoShipments } from "./ShippingStates";
import { ShippingTabs } from "./ShippingTabs";
import { DEFAULT_PAGE_SIZE, LABEL_MAX } from "./shippingParams";
import { NO_WRITE_REASON } from "./shippingFormat";
import type { ShipmentTab } from "@/types/shipping";

const pdfOf = (res: BulkLabelsResponse): { blob: Blob; fileName: string } | null =>
  res.combined.available && res.combined.content ? { blob: base64ToBlob(res.combined.content, "application/pdf"), fileName: res.combined.fileName ?? "shipping-labels.pdf" } : null;

interface ShipmentsSectionProps {
  query: ShipmentsQuery;
  filters: ShipmentFilters;
  tab: ShipmentTab;
  page: number;
  pageSize: number;
  days: number;
  filtered: boolean;
  warehouses: WarehouseOption[];
  canWrite: boolean;
  canConfigure: boolean;
  labelBusyId: string | null;
  onUpdate: (patch: FilterPatch & Partial<Record<"tab" | "q" | "page" | "size" | "days", string | null>>, opts?: { replace?: boolean; keepPage?: boolean }) => void;
  onClear: () => void;
  onOpenShipment: (id: string) => void;
  onLabel: (id: string) => void;
  onSetupCarrier: () => void;
}

/** every shipment booked with a carrier: carrier performance, groups, filters, labels and the follow-up of failed deliveries */
export function ShipmentsSection(props: ShipmentsSectionProps) {
  const { query, filters, tab, page, pageSize, days, filtered, canWrite, canConfigure, onUpdate } = props;
  const summary = useShippingSummary(days);
  const shipments = useShipments(query);
  const carriers = useCarriers();
  const bulk = useBulkLabels();

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [results, setResults] = useState<BulkLabelsResponse | null>(null);

  const rows = useMemo(() => shipments.data?.items ?? [], [shipments.data]);
  const queryKey = JSON.stringify([filters, page, pageSize]);
  // a selection belongs to the page it was made on
  useEffect(() => setSelected(new Set()), [queryKey]);

  // a page past the end (a shrinking result set, an old link) falls back to the last page
  useEffect(() => {
    const data = shipments.data;
    if (data && data.total > 0 && data.items.length === 0 && page > data.pages) onUpdate({ page: String(data.pages) }, { replace: true });
  }, [shipments.data, page, onUpdate]);

  const carrierNames = useMemo(
    () => [...new Set([...(carriers.data?.items ?? []).map((c) => c.name), ...(summary.data?.carriers ?? []).map((c) => c.name)])].sort((a, b) => a.localeCompare(b)),
    [carriers.data, summary.data],
  );

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

  const openPdf = () => {
    const pdf = results && pdfOf(results);
    if (!pdf) return;
    const href = URL.createObjectURL(pdf.blob);
    window.open(href, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  const loadingList = shipments.isLoading;
  const listError = shipments.isError && !shipments.data;
  const total = shipments.data?.total ?? 0;
  const tooMany = selected.size > LABEL_MAX;
  const counts: ShipmentCounts | undefined = shipments.data?.counts;

  return (
    <section className="space-y-6 pt-1" aria-label="Shipments">
      <div>
        <h2 className="text-[16px] font-semibold text-black">Shipments</h2>
        <p className="text-[11px] text-[#666666]">Every parcel booked with a carrier: AWBs, labels, delivery and the follow-up of failed deliveries.</p>
      </div>

      <ShippingRibbon
        summary={summary.data}
        loading={summary.isLoading}
        error={summary.isError ? errorMessage(summary.error) : null}
        days={days}
        onDays={(d) => onUpdate({ days: d === 30 ? null : String(d) }, { keepPage: true })}
        onRetry={() => void summary.refetch()}
        onExceptions={() => onUpdate({ tab: "ndr" })}
      />

      <div className="space-y-4">
        <ShippingTabs active={tab} counts={counts} onChange={(t) => onUpdate({ tab: t })} />
        <ShippingFilters filters={filters} carriers={carrierNames} warehouses={props.warehouses} filtered={filtered} onSearch={(q) => onUpdate({ q }, { replace: true })} onChange={(patch) => onUpdate(patch)} onClear={props.onClear} />
      </div>

      {selected.size > 0 && (
        <div role="toolbar" aria-label="Bulk actions" className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-lg bg-[#F5F5F5] px-3">
          <span className="min-w-[130px] text-xs font-semibold" aria-live="polite">
            {selected.size} {selected.size === 1 ? "shipment" : "shipments"} selected
          </span>
          <button
            type="button"
            className="h-[30px] rounded-lg border border-[#EAEAEA] bg-white px-3 text-xs font-medium text-black hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canWrite || bulk.isPending || tooMany}
            title={canWrite ? undefined : NO_WRITE_REASON}
            onClick={printLabels}
          >
            {bulk.isPending ? "Preparing labels..." : "Print labels"}
          </button>
          <span className="text-[11px] text-[#666666]">Up to {LABEL_MAX} shipments at a time</span>
          <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection" title="Clear selection" className="ml-auto rounded p-1 text-[#666666] hover:bg-neutral-200 hover:text-black">
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
          <NoMatches onClear={props.onClear} />
        ) : carriers.data && carriers.data.items.length === 0 ? (
          <NoCarrier canConfigure={canConfigure} onSetup={props.onSetupCarrier} />
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
            labelBusyId={props.labelBusyId}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onOpen={props.onOpenShipment}
            onLabel={props.onLabel}
          />
          <ShippingPagination
            page={shipments.data?.page ?? page}
            pages={shipments.data?.pages ?? 1}
            total={total}
            pageSize={pageSize}
            shown={rows.length}
            onPage={(p) => onUpdate({ page: p > 1 ? String(p) : null })}
            onPageSize={(size) => onUpdate({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
          />
        </>
      )}

      <LabelsResultsDialog
        response={results}
        busyId={props.labelBusyId}
        onClose={() => setResults(null)}
        onDownloadPdf={() => {
          const pdf = results && pdfOf(results);
          if (pdf) saveBlob(pdf.blob, pdf.fileName);
        }}
        onOpenPdf={openPdf}
        onLabel={props.onLabel}
      />
    </section>
  );
}
