import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { CreateReturnDialog } from "@/components/returns/CreateReturnDialog";
import { ReturnDrawer } from "@/components/returns/ReturnDrawer";
import { ReturnFilters } from "@/components/returns/ReturnFilters";
import { ReturnInsights } from "@/components/returns/ReturnInsights";
import { ReturnKpiTiles } from "@/components/returns/ReturnKpiTiles";
import { ReturnTabs } from "@/components/returns/ReturnTabs";
import { ReturnsPagination } from "@/components/returns/ReturnsPagination";
import { EmptyReturns, LoadError, NoMatches } from "@/components/returns/ReturnsStates";
import { ReturnsTable, TableSkeleton } from "@/components/returns/ReturnsTable";
import { NO_WRITE_REASON } from "@/components/returns/returnFormat";
import { DEFAULT_DAYS, DEFAULT_PAGE_SIZE, isFiltered, ledgerQueryOf, useReturnsUrlState } from "@/components/returns/returnParams";
import { saveBlob } from "@/components/products/list/saveBlob";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useExportReturns, useReturnCounts, useReturnMarketplaces, useReturnsInsights, useReturnsLedger, useReturnsOverview, useReturnsSummary } from "@/hooks/useReturns";
import { toast } from "@/hooks/useToast";
import { SUMMARY_WINDOWS } from "@/types/returns";

const CREATE_UNAVAILABLE: Record<string, string> = {
  shopify_only: "Returns can only be created for orders from a connected Shopify store.",
};

export default function ReturnsPage() {
  const url = useReturnsUrlState();
  const { update, clearFilters, filters, sort, page, pageSize, tab, days, drawerId } = url;
  const canWrite = useCan("returns:write");

  const query = ledgerQueryOf(url);
  const summary = useReturnsSummary(days);
  const insights = useReturnsInsights(days);
  const overview = useReturnsOverview();
  const ledger = useReturnsLedger(query);
  const counts = useReturnCounts(filters);
  const marketplaces = useReturnMarketplaces();
  const exporter = useExportReturns();
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => ledger.data?.items ?? [], [ledger.data]);
  const filtered = isFiltered(filters);

  // a page past the end (a shrinking result set, an old link) falls back to the last page
  useEffect(() => {
    const data = ledger.data;
    if (data && data.total > 0 && data.items.length === 0 && page > data.pages) update({ page: String(data.pages) }, { replace: true });
  }, [ledger.data, page, update]);

  const channelNames = useMemo(() => new Map((marketplaces.data ?? []).map((m) => [m.code, m.name])), [marketplaces.data]);
  const channelName = (code: string) => channelNames.get(code) ?? code;
  // the connected channels are the ones that have returns; the full marketplace list names them
  const channelOptions = useMemo(
    () => (marketplaces.data ?? []).concat((insights.data?.channels ?? []).filter((c) => !channelNames.has(c.code)).map((c) => ({ code: c.code, name: c.code }))),
    [marketplaces.data, insights.data, channelNames],
  );

  const onExport = () =>
    exporter.mutate(query, {
      onSuccess: (file) => saveBlob(file.blob, file.fileName),
      onError: (e) => toast({ title: "Export failed", description: errorMessage(e), variant: "destructive" }),
    });

  const create = overview.data?.createReturn;
  const createReason = !canWrite ? NO_WRITE_REASON : create && !create.available ? (CREATE_UNAVAILABLE[create.reason ?? ""] ?? "Creating a return is not available right now.") : undefined;

  const loadingList = ledger.isLoading;
  const listError = ledger.isError && !ledger.data;

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader
        eyebrow="REVERSE LOGISTICS & RTO"
        title="Returns & Reverse Logistics"
        description="Inspect return deliveries, disposition damaged or sellable stock, and issue multi-channel customer refunds."
        actions={
          <div className="flex items-center gap-2">
            <select
              aria-label="Summary window"
              value={days}
              onChange={(e) => update({ days: Number(e.target.value) === DEFAULT_DAYS ? null : e.target.value }, { keepPage: true })}
              className="h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-medium"
            >
              {SUMMARY_WINDOWS.map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </select>
            {create && (
              <Button size="sm" className="gap-2" disabled={createReason !== undefined} title={createReason} onClick={() => setCreating(true)}>
                Create return
              </Button>
            )}
          </div>
        }
      />

      <ReturnKpiTiles
        summary={summary.data}
        loading={summary.isLoading}
        error={summary.isError ? errorMessage(summary.error) : null}
        onRetry={() => void summary.refetch()}
        activeStage={filters.stage}
        onPickStage={(stage) => update({ stage, tab: null })}
      />

      <div className="space-y-4">
        <ReturnTabs active={tab} counts={counts.data} onChange={(t) => update({ tab: t, stage: null })} />
        <ReturnFilters
          filters={filters}
          sort={sort}
          channels={channelOptions}
          filtered={filtered}
          exporting={exporter.isPending}
          onSearch={(q) => update({ q }, { replace: true })}
          onChannel={(code) => update({ marketplace: code })}
          onSignal={(signal) => update({ signal })}
          onInspection={(status) => update({ inspection: status })}
          onRefund={(status) => update({ refund: status })}
          onDisposition={(kind) => update({ disposition: kind })}
          onSort={(s) => update({ sort: s === "-requestedAt" ? null : s })}
          onClear={clearFilters}
          onExport={onExport}
        />
      </div>

      {loadingList ? (
        <TableSkeleton rows={8} />
      ) : listError ? (
        <LoadError message={errorMessage(ledger.error)} onRetry={() => void ledger.refetch()} />
      ) : rows.length === 0 ? (
        filtered ? <NoMatches onClear={clearFilters} /> : <EmptyReturns onCreate={create?.available && canWrite ? () => setCreating(true) : null} />
      ) : (
        <>
          <ReturnsTable rows={rows} refreshing={ledger.isFetching && ledger.isPlaceholderData} onOpen={(id) => update({ drawer: `return:${id}` }, { keepPage: true })} />
          <ReturnsPagination
            page={ledger.data?.page ?? page}
            pages={ledger.data?.pages ?? 1}
            total={ledger.data?.total ?? 0}
            pageSize={pageSize}
            shown={rows.length}
            onPage={(p) => update({ page: p > 1 ? String(p) : null }, { keepPage: true })}
            onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
          />
        </>
      )}

      <ReturnInsights
        data={insights.data}
        loading={insights.isLoading}
        error={insights.isError ? errorMessage(insights.error) : null}
        days={days}
        onRetry={() => void insights.refetch()}
        channelName={channelName}
      />

      <ReturnDrawer returnId={drawerId} onClose={() => update({ drawer: null }, { keepPage: true, replace: true })} />

      <CreateReturnDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setCreating(false);
          toast({ title: `Return ${created.number} created`, description: "No refund has been issued yet.", variant: "success" });
          update({ drawer: `return:${created.id}` }, { keepPage: true });
        }}
      />
    </div>
  );
}
