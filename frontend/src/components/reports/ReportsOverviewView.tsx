import { useMemo } from "react";
import { Calendar, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/api/errors";
import { useHubAccounts } from "@/hooks/useHub";
import { useReportsOverviewKpis } from "@/hooks/useReports";
import { useWorkspaceStore } from "@/store/workspace.store";
import { saveBlob } from "@/components/products/list/saveBlob";
import { toast } from "@/hooks/useToast";
import { CATEGORY_LABEL } from "@/components/marketplace-hub/accounts/hubFormat";
import { OVERVIEW_COMPARES, type Catalog, type CatalogEntry } from "@/types/reports";
import { ReportsOverviewKpiStrip } from "./ReportsOverviewKpiStrip";
import { ReportsSalesTrendSection } from "./ReportsSalesTrendSection";
import { ReportsChannelBreakdown, type ChannelInfo } from "./ReportsChannelBreakdown";
import { ReportsCatalogSection } from "./ReportsCatalogSection";
import { COMPARE_LABELS, RANGE_PRESETS, dateKeyInZone, useOverviewUrlState } from "./overviewRange";
import { overviewCsv } from "./overviewCsv";

const FIELD = "rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-foreground";

interface ReportsOverviewViewProps {
  catalog: Catalog | undefined;
  catalogLoading: boolean;
  catalogError: string | null;
  onRetryCatalog: () => void;
  canWrite: boolean;
  noWrite?: string;
  activeSchedules: number | undefined;
  onGenerate: (entry: CatalogEntry) => void;
  onCreateSchedule: () => void;
  onExploreSales?: () => void;
  onViewChannelReport?: () => void;
}

/** the Overview tab: a real date range (URL state, business time zone) and one call for everything on it */
export function ReportsOverviewView({ catalog, catalogLoading, catalogError, onRetryCatalog, canWrite, noWrite, activeSchedules, onGenerate, onCreateSchedule, onExploreSales, onViewChannelReport }: ReportsOverviewViewProps) {
  const shell = useWorkspaceStore((s) => s.shell);
  const timezone = shell?.business.timezone ?? "Asia/Kolkata";
  const currency = shell?.business.currency ?? "INR";
  const today = dateKeyInZone(new Date(), timezone);
  const { state, setPreset, setCustom, setCompare, setPeriod } = useOverviewUrlState(today);

  // the query is only sent for a usable range
  const kpis = useReportsOverviewKpis({ from: state.from, to: state.to, compare: state.compare, period: state.period }, state.problem === null);
  const data = state.problem === null ? kpis.data : undefined;

  const hub = useHubAccounts();
  const info = useMemo(() => {
    const m = new Map<string, ChannelInfo>();
    for (const a of hub.data?.items ?? []) if (!m.has(a.marketplace)) m.set(a.marketplace, { name: a.connectorName || a.name, type: CATEGORY_LABEL[a.category] ?? null });
    return m;
  }, [hub.data]);
  const channelName = (code: string) => info.get(code)?.name ?? code;

  const exportCsv = () => {
    if (!data) return;
    saveBlob(new Blob([overviewCsv(data, channelName)], { type: "text/csv;charset=utf-8" }), `reports-overview-${data.range.from}-to-${data.range.to}.csv`);
    toast({ title: "Overview downloaded", description: `${data.range.from} to ${data.range.to}, in ${currency}.`, variant: "success" });
  };

  const noSales = data !== undefined && data.totals.orders === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-xs shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <select aria-label="Date range" value={state.preset} onChange={(e) => setPreset(e.target.value as (typeof RANGE_PRESETS)[number]["id"])} className={FIELD}>
              {RANGE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {state.preset === "custom" && (
            <div className="inline-flex items-center gap-1.5">
              <input type="date" aria-label="From date" value={state.from} max={today} onChange={(e) => setCustom(e.target.value, state.to)} className={FIELD} />
              <span className="text-muted-foreground">to</span>
              <input type="date" aria-label="To date" value={state.to} max={today} onChange={(e) => setCustom(state.from, e.target.value)} className={FIELD} />
            </div>
          )}

          <select aria-label="Compare period" value={state.compare} onChange={(e) => setCompare(e.target.value as (typeof OVERVIEW_COMPARES)[number])} className={FIELD}>
            {OVERVIEW_COMPARES.map((c) => (
              <option key={c} value={c}>
                {COMPARE_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            {state.problem ? "No dates chosen" : `${state.from} to ${state.to}`} · {currency} · {timezone}
          </span>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs font-semibold" disabled={!data} onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export overview
          </Button>
        </div>
      </div>

      {state.problem ? (
        <div role="alert" className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
          {state.problem}
        </div>
      ) : kpis.isLoading ? (
        <div role="status" aria-label="Loading the overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : kpis.isError && !data ? (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-border bg-card p-6 text-xs">
          <span className="text-rose-700">{errorMessage(kpis.error, "The overview could not be loaded.")}</span>
          <Button size="sm" variant="outline" className="text-xs" onClick={() => void kpis.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        data && (
          <>
            {noSales && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-card p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">No sales in this period</p>
                  <p className="text-xs text-muted-foreground">{data.totalAccounts === 0 ? "No channel is connected yet. Connect one to start seeing sales here." : "Try a longer date range."}</p>
                </div>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setPreset("last_90")}>
                  Show the last 90 days
                </Button>
              </div>
            )}
            <ReportsOverviewKpiStrip data={data} />
            <ReportsSalesTrendSection data={data} onPeriodChange={setPeriod} onExploreSales={onExploreSales} />
            <ReportsChannelBreakdown data={data} info={info} onViewChannelReport={onViewChannelReport} />
          </>
        )
      )}

      <ReportsCatalogSection catalog={catalog} loading={catalogLoading} error={catalogError} onRetry={onRetryCatalog} canWrite={canWrite} noWrite={noWrite} activeSchedules={activeSchedules} onGenerate={onGenerate} onCreateSchedule={onCreateSchedule} />
    </div>
  );
}
