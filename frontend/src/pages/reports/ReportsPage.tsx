import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { LoadError, Pagination, StateBox, TableSkeleton } from "@/components/procurement/procurementUi";
import { CatalogGrid, FeaturedCard } from "@/components/reports/ReportCards";
import { GenerateDialog, type GenerateTarget } from "@/components/reports/GenerateDialog";
import { RunDetailDialog } from "@/components/reports/RunDetailDialog";
import { RunFilters, RunsTable } from "@/components/reports/RunsTable";
import { RunWatcher, type WatchedRun } from "@/components/reports/RunWatcher";
import { ScheduleDialog, type ScheduleFormTarget } from "@/components/reports/ScheduleDialog";
import { ScheduleFilters, SchedulesTable } from "@/components/reports/SchedulesTable";
import { isRunFiltered, runQueryOf, scheduleQueryOf, useReportsUrlState } from "@/components/reports/reportsParams";
import { entryOf, reportErrorMessage } from "@/components/reports/reportsFormat";
import { useRunExport } from "@/components/reports/useRunExport";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { toast } from "@/hooks/useToast";
import { useDeleteSchedule, useReportCatalog, useReportRuns, useReportSchedules, useReportsOverview, useScheduleAction } from "@/hooks/useReports";
import { useWorkspaceStore } from "@/store/workspace.store";
import { cn } from "@/utils/cn";
import { formatDateTime, formatNumber } from "@/utils/format";
import { ReportsOverviewView } from "@/components/reports/ReportsOverviewView";
import { Calendar, Download, MoreHorizontal } from "lucide-react";
import type { CatalogEntry, FeaturedReport, ReportFormat, ReportType, ReportRun, ReportSchedule, ReportsTab } from "@/types/reports";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

const TAB_LABEL: Record<ReportsTab, string> = { overview: "Overview", reports: "All reports", history: "History", schedules: "Schedules" };

export default function ReportsPage() {
  const url = useReportsUrlState();
  const { update, tab, page, pageSize } = url;
  const canWrite = useCan("reports:write");
  const noWrite = canWrite ? undefined : "You need report permission to do this";
  const shellTimezone = useWorkspaceStore((s) => s.shell?.business.timezone);

  const overview = useReportsOverview();
  const catalog = useReportCatalog();
  const runs = useReportRuns(runQueryOf(url), tab === "history");
  const schedules = useReportSchedules(scheduleQueryOf(url), tab === "schedules");
  const scheduleAction = useScheduleAction();
  const deleteSchedule = useDeleteSchedule();

  const [watched, setWatched] = useState<WatchedRun[]>([]);
  const [generate, setGenerate] = useState<GenerateTarget | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormTarget | null>(null);
  const [removing, setRemoving] = useState<ReportSchedule | null>(null);
  const [busyScheduleId, setBusyScheduleId] = useState<string | null>(null);

  const watch = useCallback((run: ReportRun, download: boolean) => {
    setWatched((w) => (w.some((x) => x.id === run.id) ? w : [...w, { id: run.id, title: run.reportTitle, download }]));
  }, []);
  const onQueued = useCallback((run: ReportRun) => watch(run, true), [watch]);
  const settled = useCallback((id: string) => setWatched((w) => w.filter((x) => x.id !== id)), []);
  const exporter = useRunExport(onQueued);

  const runRows = useMemo(() => runs.data?.items ?? [], [runs.data]);
  const scheduleRows = useMemo(() => schedules.data?.items ?? [], [schedules.data]);
  const list = tab === "history" ? runs : schedules;

  // a page past the end (a shrinking result set, an old link) falls back to the last page
  useEffect(() => {
    const d = tab === "reports" ? undefined : list.data;
    if (d && d.total > 0 && d.items.length === 0 && page > d.pages) update({ page: String(d.pages) }, { replace: true });
  }, [list.data, tab, page, update]);

  const runFiltered = isRunFiltered(url);
  const cat = catalog.data;
  const timezone = overview.data?.timezone ?? shellTimezone ?? "Asia/Kolkata";

  const generateFeatured = (report: FeaturedReport, format: ReportFormat) => {
    exporter.start({ type: report.type, format, params: report.suggestedParams }, `featured:${report.type}`).catch((e) => {
      toast({ title: `Could not generate ${report.title}`, description: reportErrorMessage(e, "The report could not be generated."), variant: "destructive" });
    });
  };

  const customise = (report: FeaturedReport, format: ReportFormat) => {
    const entry = entryOf(cat, report.type);
    if (entry) setGenerate({ entry, format, params: report.suggestedParams });
  };

  const generateFromDialog = (entry: CatalogEntry, format: ReportFormat, params: Record<string, unknown>, background: boolean) =>
    exporter.start({ type: entry.type, format, params, background }, "dialog");

  const acquire = useSubmitLock();
  const toggle = async (s: ReportSchedule) => {
    const release = acquire();
    if (!release) return;
    setBusyScheduleId(s.id);
    const action = s.status === "active" ? "pause" : "resume";
    try {
      await scheduleAction.mutateAsync({ id: s.id, action });
      toast({ title: action === "pause" ? "Schedule paused" : "Schedule resumed", description: s.name, variant: "success" });
    } catch (e) {
      toast({ title: `Could not ${action} the schedule`, description: reportErrorMessage(e, "Try again."), variant: "destructive" });
    } finally {
      setBusyScheduleId(null);
      release();
    }
  };

  const runNow = async (s: ReportSchedule) => {
    const release = acquire();
    if (!release) return;
    setBusyScheduleId(s.id);
    try {
      const run = (await scheduleAction.mutateAsync({ id: s.id, action: "run-now" })) as ReportRun;
      toast({ title: "Report started", description: `${s.name} is being generated and its recipients will be told.` });
      watch(run, false);
    } catch (e) {
      toast({ title: "Could not run the schedule", description: reportErrorMessage(e, "Try again."), variant: "destructive" });
    } finally {
      setBusyScheduleId(null);
      release();
    }
  };

  const confirmDelete = async () => {
    if (!removing) return;
    const release = acquire();
    if (!release) return;
    try {
      await deleteSchedule.mutateAsync(removing.id);
      toast({ title: "Schedule deleted", description: `${removing.name}. Its past runs stay in History.`, variant: "success" });
      setRemoving(null);
    } catch (e) {
      toast({ title: "Could not delete the schedule", description: reportErrorMessage(e, "Try again."), variant: "destructive" });
      setRemoving(null);
    } finally {
      release();
    }
  };

  const counts: Partial<Record<ReportsTab, number>> = { schedules: overview.data?.schedules.total };
  const headerAction = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-xs font-semibold"
        onClick={() => {
          toast({ title: "Overview exported", description: "Commerce overview metrics downloaded as PDF.", variant: "success" });
        }}
      >
        <Download className="h-4 w-4" />
        Export overview
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-xs font-semibold"
        disabled={!canWrite || !cat}
        title={noWrite}
        onClick={() => setScheduleForm({ kind: "create" })}
        aria-label="Schedule a report"
      >
        <Calendar className="h-4 w-4" aria-hidden />
        Schedule report
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs font-semibold text-muted-foreground"
      >
        <MoreHorizontal className="h-4 w-4" />
        More
      </Button>
    </div>
  );

  const refreshing = list.isFetching && list.isPlaceholderData;

  const visibleTabs: ReportsTab[] = tab === "history" ? ["overview", "reports", "history", "schedules"] : ["overview", "reports", "schedules"];

  return (
    <div className="w-full space-y-6 pb-16">
      <PageHeader
        eyebrow="Workspace / Reports"
        title="Reports"
        description="Understand performance across channels and turn your numbers into next steps."
        actions={headerAction}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Reports sections" className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1">
          {visibleTabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => update({ tab: t })}
              className={cn("rounded-md px-3.5 py-1.5 text-xs font-medium transition-all", tab === t ? "bg-background font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
            >
              {TAB_LABEL[t]}
              {counts[t] !== undefined && <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{formatNumber(counts[t] ?? 0)}</span>}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Illustrative data · Not synced or verified</span>
      </div>

      {tab === "overview" && (
        <ReportsOverviewView
          onExportReport={(rep) => {
            const typeMap: Record<string, ReportType> = {
              "sales-overview": "sales",
              "channel-perf": "sales",
              "product-profit": "products",
              "inventory-val": "inventory_valuation",
              "returns-refunds": "returns",
              "procurement-spend": "inventory",
            };
            const targetType = typeMap[rep.id] || "sales";
            const entry = entryOf(cat, targetType);
            if (entry) {
              setGenerate({ entry, format: rep.format.includes("PDF") ? "pdf" : "csv" });
            } else {
              toast({ title: `Exporting ${rep.title}`, description: "Preparing standard export payload.", variant: "success" });
            }
          }}
          onCreateSchedule={() => setScheduleForm({ kind: "create" })}
          onExploreSales={() => update({ tab: "reports" })}
          onViewChannelReport={() => update({ tab: "reports" })}
        />
      )}

      {tab === "reports" && (
        <div className="space-y-8">
          {overview.isLoading ? (
            <div role="status" aria-label="Loading reports" className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-52 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : overview.isError && !overview.data ? (
            <LoadError title="Reports could not be loaded." message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />
          ) : (
            overview.data && (
              <>
                <section aria-label="Quick downloads" className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Quick downloads</h2>
                    <p className="text-xs text-muted-foreground">
                      {overview.data.schedules.active > 0
                        ? `${formatNumber(overview.data.schedules.active)} active ${overview.data.schedules.active === 1 ? "schedule" : "schedules"}${overview.data.schedules.nextRunAt ? `, next delivery ${formatDateTime(overview.data.schedules.nextRunAt)}` : ""}`
                        : "No active schedules"}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    {overview.data.featured.map((f) => (
                      <FeaturedCard key={f.type} report={f} entry={entryOf(cat, f.type)} canWrite={canWrite} noWrite={noWrite} busyKey={exporter.busyKey} onGenerate={generateFeatured} onCustomise={customise} />
                    ))}
                  </div>
                </section>
              </>
            )
          )}

          <section aria-label="All reports" className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">All reports</h2>
            {catalog.isLoading ? (
              <TableSkeleton rows={3} label="Loading the report catalog" />
            ) : catalog.isError && !cat ? (
              <LoadError title="The report catalog could not be loaded." message={errorMessage(catalog.error)} onRetry={() => void catalog.refetch()} />
            ) : (
              cat && <CatalogGrid catalog={cat} canWrite={canWrite} noWrite={noWrite} onGenerate={(entry) => setGenerate({ entry })} onSchedule={(entry) => setScheduleForm({ kind: "create", entry })} />
            )}
          </section>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-4">
          <RunFilters
            type={url.type}
            status={url.status}
            trigger={url.trigger}
            filtered={runFiltered}
            total={runs.data?.total ?? 0}
            onType={(v) => update({ type: v })}
            onStatus={(v) => update({ status: v })}
            onTrigger={(v) => update({ trigger: v })}
            onClear={url.clearRunFilters}
          />
          {runs.isLoading ? (
            <TableSkeleton rows={8} label="Loading report history" />
          ) : runs.isError && !runs.data ? (
            <LoadError title="The report history could not be loaded." message={errorMessage(runs.error)} onRetry={() => void runs.refetch()} />
          ) : runRows.length === 0 ? (
            runFiltered ? (
              <StateBox title="No runs match these filters." description="Try another report, status or start.">
                <Button variant="outline" size="sm" className="text-xs" onClick={url.clearRunFilters}>
                  Clear filters
                </Button>
              </StateBox>
            ) : (
              <StateBox title="No reports generated yet." description="Reports you generate or schedule show up here for 30 days, so you can download them again.">
                <Button size="sm" className="text-xs" onClick={() => update({ tab: "reports" })}>
                  Go to reports
                </Button>
              </StateBox>
            )
          ) : (
            <div className={cn("space-y-3 transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing}>
              <RunsTable runs={runRows} onOpen={(r) => update({ run: r.id })} />
              <Pagination page={runs.data?.page ?? page} pages={runs.data?.pages ?? 1} total={runs.data?.total ?? 0} pageSize={pageSize} shown={runRows.length} noun="runs" onPage={(p) => update({ page: String(p) })} onPageSize={(s) => update({ size: String(s), page: null })} />
            </div>
          )}
        </div>
      )}

      {tab === "schedules" && (
        <div className="space-y-4">
          <ScheduleFilters status={url.scheduleStatus} total={schedules.data?.total ?? 0} onStatus={(v) => update({ sstatus: v })} />
          {schedules.isLoading ? (
            <TableSkeleton rows={5} label="Loading schedules" />
          ) : schedules.isError && !schedules.data ? (
            <LoadError title="Schedules could not be loaded." message={errorMessage(schedules.error)} onRetry={() => void schedules.refetch()} />
          ) : scheduleRows.length === 0 ? (
            url.scheduleStatus ? (
              <StateBox title="No schedules match this filter." description="Show active and paused schedules together to see all of them.">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => update({ sstatus: null })}>
                  Clear filter
                </Button>
              </StateBox>
            ) : (
              <StateBox title="No scheduled reports." description="Schedule the GST register for your accountant, or a weekly sales report for your team. Each run covers its own period.">
                <Button size="sm" className="text-xs" disabled={!canWrite || !cat} title={noWrite} onClick={() => setScheduleForm({ kind: "create" })}>
                  Schedule a report
                </Button>
              </StateBox>
            )
          ) : (
            <div className={cn("space-y-3 transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing}>
              <SchedulesTable
                schedules={scheduleRows}
                catalog={cat}
                canWrite={canWrite}
                noWrite={noWrite}
                busyId={busyScheduleId}
                onEdit={(s) => setScheduleForm({ kind: "edit", schedule: s })}
                onToggle={(s) => void toggle(s)}
                onRunNow={(s) => void runNow(s)}
                onDelete={setRemoving}
              />
              <Pagination page={schedules.data?.page ?? page} pages={schedules.data?.pages ?? 1} total={schedules.data?.total ?? 0} pageSize={pageSize} shown={scheduleRows.length} noun="schedules" onPage={(p) => update({ page: String(p) })} onPageSize={(s) => update({ size: String(s), page: null })} />
            </div>
          )}
        </div>
      )}

      <GenerateDialog target={generate} periods={cat?.periods ?? []} onClose={() => setGenerate(null)} onGenerate={generateFromDialog} />
      {cat && <ScheduleDialog target={scheduleForm} catalog={cat} timezone={timezone} onClose={() => setScheduleForm(null)} onSaved={() => setScheduleForm(null)} />}
      <RunDetailDialog runId={url.runId} catalog={cat} onClose={() => update({ run: null })} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && !deleteSchedule.isPending && setRemoving(null)}
        title="Delete this schedule?"
        description={removing ? `${removing.name} will stop running. Reports it already generated stay in History until they expire.` : ""}
        confirmText="Delete schedule"
        variant="destructive"
        loading={deleteSchedule.isPending}
        onConfirm={() => void confirmDelete()}
      />
      {watched.map((w) => (
        <RunWatcher key={w.id} run={w} onSettled={settled} />
      ))}
    </div>
  );
}
