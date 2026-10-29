import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Plus, RefreshCw } from "lucide-react";
import { saveBlob } from "@/components/products/list/saveBlob";
import { errorMessage } from "@/api/errors";
import { AnalyticsSection } from "@/components/returns/AnalyticsSection";
import { AttentionSection } from "@/components/returns/AttentionSection";
import { Notice } from "@/components/returns/design";
import { InspectionView } from "@/components/returns/InspectionView";
import { GlanceTiles, LifecycleRail, SignalRail } from "@/components/returns/LifecycleRail";
import { LedgerSection } from "@/components/returns/LedgerSection";
import { RefundsView } from "@/components/returns/RefundsView";
import { ReturnsView } from "@/components/returns/ReturnsView";
import { NO_WRITE_REASON } from "@/components/returns/returnFormat";
import { DEFAULT_DAYS, VIEWS, VIEW_LABELS, ledgerQueryOf, useReturnsUrlState, type DrawerKind, type ReturnsView as ViewKey } from "@/components/returns/returnParams";
import { useCan } from "@/hooks/useCan";
import { RETURN_KEYS, useExportAttention, useExportReturns, useReturnMarketplaces, useReturnsInsights, useReturnsOverview, useReturnsSummary, useSyncReturns } from "@/hooks/useReturns";
import { toast } from "@/hooks/useToast";
import { cn } from "@/utils/cn";
import { MoreMenu } from "@/components/returns/MoreMenu";
import { SyncReportPanel } from "@/components/returns/SyncReport";
import { syncHeadline } from "@/components/returns/returnFormat";
import { SUMMARY_WINDOWS, type ReturnOrder, type SyncReport } from "@/types/returns";
import { CreateReturnModal } from "./CreateReturnModal";
import { InspectionDrawer } from "./InspectionDrawer";
import { RefundDetailDrawer } from "./RefundDetailDrawer";
import { ReturnDetailDrawer } from "./ReturnDetailDrawer";

const CREATE_UNAVAILABLE: Record<string, string> = {
  shopify_only: "Returns can only be created for orders from a connected Shopify store.",
};

export default function ReturnsPage() {
  const url = useReturnsUrlState();
  const { update, filters, days, drawer, view } = url;
  const canWrite = useCan("returns:write");

  const query = ledgerQueryOf(url);
  const summary = useReturnsSummary(days);
  const overview = useReturnsOverview();
  const insights = useReturnsInsights(days);
  const marketplaces = useReturnMarketplaces();
  const exporter = useExportReturns();
  const sync = useSyncReturns();
  const attentionExport = useExportAttention();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [reviewIds, setReviewIds] = useState<string[]>([]);

  const channelNames = useMemo(() => new Map((marketplaces.data ?? []).map((m) => [m.code, m.name])), [marketplaces.data]);
  const channelName = useCallback((code: string) => channelNames.get(code) ?? code, [channelNames]);
  // the connected channels are the ones that have returns; the full marketplace list names them
  const channelOptions = useMemo(
    () => (marketplaces.data ?? []).concat((insights.data?.channels ?? []).filter((c) => !channelNames.has(c.code)).map((c) => ({ code: c.code, name: c.code }))),
    [marketplaces.data, insights.data, channelNames],
  );

  const create = overview.data?.createReturn;
  const createReason = !canWrite ? NO_WRITE_REASON : create && !create.available ? (CREATE_UNAVAILABLE[create.reason ?? ""] ?? "Creating a return is not available right now.") : undefined;
  const createChannels = (create?.allowedChannels ?? []).map(channelName);
  const statusLine = overview.data?.statusLine;

  const openDrawer = useCallback((kind: DrawerKind, id: string) => update({ drawer: `${kind}:${id}` }, { keepPage: true }), [update]);
  /** from one drawer to another (inspection from the detail, ...) replaces the entry, so back leaves the drawers in one step */
  const switchDrawer = useCallback((kind: DrawerKind, id: string) => update({ drawer: `${kind}:${id}` }, { keepPage: true, replace: true }), [update]);
  const closeDrawer = useCallback(() => update({ drawer: null }, { keepPage: true, replace: true }), [update]);

  const onExport = () =>
    exporter.mutate(query, {
      onSuccess: (file) => saveBlob(file.blob, file.fileName),
      onError: (e) => toast({ title: "Export failed", description: errorMessage(e), variant: "destructive" }),
    });

  const onSync = () => {
    setReport(null);
    sync.mutate(
      { onUpdate: setReport },
      {
        onSuccess: (done) => {
          const failed = done.accounts.some((a) => a.job && a.job.status !== "succeeded");
          toast({ title: done.nothingToSync ? "Nothing to sync" : done.stillRunning ? "Sync still running" : failed ? "Returns synced, with problems" : "Returns synced", description: syncHeadline(done), variant: done.nothingToSync || failed ? "default" : "success" });
        },
        onError: (e) => {
          setReport(null);
          toast({ title: "Sync failed", description: errorMessage(e), variant: "destructive" });
        },
      },
    );
  };

  const onRefresh = () => void queryClient.invalidateQueries({ queryKey: RETURN_KEYS.all });
  const onExportAttention = () =>
    attentionExport.mutate(undefined, {
      onSuccess: (file) => saveBlob(file.blob, file.fileName),
      onError: (e) => toast({ title: "Export failed", description: errorMessage(e), variant: "destructive" }),
    });

  /** "Review selected": the drawer opens the first picked return and steps through the rest */
  const startReview = (ids: string[]) => {
    const first = ids[0];
    if (!first) return;
    setReviewIds(ids);
    openDrawer("return", first);
  };
  const stepTo = (id: string | undefined) => (id ? () => switchDrawer("return", id) : null);
  const reviewIndex = drawer?.kind === "return" ? reviewIds.indexOf(drawer.id) : -1;
  const review =
    reviewIndex >= 0
      ? {
          index: reviewIndex,
          total: reviewIds.length,
          onPrev: stepTo(reviewIds[reviewIndex - 1]),
          onNext: stepTo(reviewIds[reviewIndex + 1]),
          onStop: () => setReviewIds([]),
        }
      : null;

  const onCreated = (created: ReturnOrder) => {
    setCreating(false);
    toast({ title: `Return ${created.number} created`, description: "No refund has been issued yet.", variant: "success" });
    openDrawer("return", created.id);
  };

  const pickView = (next: ViewKey) => update({ view: next === "overview" ? null : next });

  return (
    <div className="w-full space-y-6 pb-24 text-foreground">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">RETURNS OPERATIONS</p>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Returns</h1>

          <div className="flex flex-wrap items-center gap-2">
            {create && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                disabled={createReason !== undefined}
                title={createReason}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 shadow-2xs cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Create Return</span>
              </button>
            )}

            <button
              type="button"
              onClick={onSync}
              disabled={sync.isPending || !canWrite}
              title={canWrite ? undefined : NO_WRITE_REASON}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 px-3 text-xs font-medium text-white dark:text-neutral-900 shadow-2xs transition-colors hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", sync.isPending && "animate-spin")} />
              <span>{sync.isPending ? "Syncing..." : "Sync Returns"}</span>
            </button>

            <button
              type="button"
              onClick={onExport}
              disabled={exporter.isPending}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 shadow-2xs"
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{exporter.isPending ? "Exporting..." : "Export"}</span>
            </button>

            <select
              aria-label="Summary window"
              value={days}
              onChange={(e) => update({ days: Number(e.target.value) === DEFAULT_DAYS ? null : e.target.value }, { keepPage: true })}
              className="inline-flex h-8 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted shadow-2xs focus:outline-none cursor-pointer"
            >
              {SUMMARY_WINDOWS.map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </select>

            <MoreMenu onExportAttention={onExportAttention} exportingAttention={attentionExport.isPending} onRefresh={onRefresh} onShowSyncReport={sync.data && !report ? () => setReport(sync.data) : null} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground sm:text-sm">Centralize returns, inspect returned products, process refunds and decide the next inventory disposition.</p>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs text-muted-foreground">
          <span>
            {statusLine ? `${statusLine.open} open returns · ${statusLine.awaitingInspection} awaiting inspection · ${statusLine.refundsPending} refunds pending` : overview.isError ? "The status line could not be loaded." : "Loading returns..."}
          </span>
          <span className="text-xs text-muted-foreground">{create && !create.available ? (createReason ?? "") : createChannels.length > 0 ? `Create Return: ${createChannels.join(", ")} connection only` : ""}</span>
        </div>

        {report && <SyncReportPanel report={report} running={sync.isPending} canRetry={canWrite} onRetry={onSync} onDismiss={() => setReport(null)} />}

        <div role="tablist" aria-label="Returns workspace" className="mt-3 flex items-center gap-7 border-b border-border">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => pickView(v)}
              className={cn(
                "relative cursor-pointer pb-2.5 text-xs transition-colors",
                view === v ? "font-semibold text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-foreground" : "font-normal text-muted-foreground hover:text-foreground",
              )}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {view === "overview" && (
        <>
          {summary.isError && !summary.data ? (
            <Notice
              role="alert"
              tone="error"
              title="Return numbers could not be loaded."
              description={errorMessage(summary.error)}
              action={
                <button type="button" onClick={() => void summary.refetch()} className="rounded-lg border border-[#FCA5A5] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#991B1B] hover:bg-[#FEF2F2]">
                  Retry
                </button>
              }
            />
          ) : summary.data ? (
            <GlanceTiles summary={summary.data} />
          ) : (
            <div role="status" aria-label="Loading return numbers" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-[98px] animate-pulse rounded-xl bg-[#F5F5F5]" />
              ))}
            </div>
          )}

          <LifecycleRail
            overview={overview.data}
            summary={summary.data}
            loading={overview.isLoading}
            error={overview.isError ? errorMessage(overview.error) : null}
            onRetry={() => void overview.refetch()}
            activeStage={filters.stage}
            onPickStage={(stage) => update({ stage, tab: null })}
          />

          <SignalRail overview={overview.data} activeSignal={filters.signal} onPick={(signal) => update({ signal })} />

          <LedgerSection
            url={url}
            overview={overview.data}
            channelOptions={channelOptions}
            canWrite={canWrite}
            onCreate={create?.available && canWrite ? () => setCreating(true) : null}
            onOpen={openDrawer}
            onReview={startReview}
            onExport={onExport}
            exporting={exporter.isPending}
          />

          <AnalyticsSection days={days} channelName={channelName} />

          <AttentionSection onOpen={openDrawer} />
        </>
      )}

      {view === "returns" && <ReturnsView url={url} onOpen={openDrawer} />}
      {view === "inspection" && <InspectionView url={url} canWrite={canWrite} onOpen={openDrawer} />}
      {view === "refunds" && <RefundsView url={url} onOpen={openDrawer} />}

      <ReturnDetailDrawer returnId={drawer?.kind === "return" ? drawer.id : null} onClose={closeDrawer} onStartInspection={(id) => switchDrawer("inspect", id)} onOpenRefund={(id) => switchDrawer("refund", id)} review={review} />
      <InspectionDrawer returnId={drawer?.kind === "inspect" ? drawer.id : null} onClose={closeDrawer} />
      <RefundDetailDrawer returnId={drawer?.kind === "refund" ? drawer.id : null} onClose={closeDrawer} onViewInspection={(id) => switchDrawer("inspect", id)} />
      <CreateReturnModal isOpen={creating} onClose={() => setCreating(false)} onCreated={onCreated} channelNames={createChannels} />
    </div>
  );
}
