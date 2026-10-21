import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { ReturnStage, ReturnsSummary } from "@/types/returns";
import { formatMoney } from "./returnFormat";

interface ReturnKpiTilesProps {
  summary: ReturnsSummary | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** the stage the list is filtered to */
  activeStage: ReturnStage | undefined;
  onPickStage: (stage: ReturnStage | null) => void;
}

function Tile({ label, value, caption, tone }: { label: string; value: string; caption: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-bold", tone ?? "text-foreground")}>{value}</p>
      <span className="text-xs text-muted-foreground">{caption}</span>
    </div>
  );
}

function rateCaption(rate: ReturnsSummary["returnRate"], days: number): string {
  if (rate.percent === null) return `No orders in the last ${days} days`;
  const own = `${formatNumber(rate.returnedOrders)} of ${formatNumber(rate.orders)} orders`;
  if (rate.previousPercent === null || rate.deltaPoints === null) return `${own}. No orders in the previous ${days} days to compare`;
  const delta = rate.deltaPoints === 0 ? "no change" : `${rate.deltaPoints > 0 ? "+" : ""}${rate.deltaPoints} pts`;
  return `${own}. Previous ${days} days: ${rate.previousPercent}% (${delta})`;
}

/** the four numbers of the screen, then how many returns sit in each stage (a stage filters the list) */
export function ReturnKpiTiles({ summary, loading, error, onRetry, activeStage, onPickStage }: ReturnKpiTilesProps) {
  if (error && !summary) {
    return (
      <div role="alert" className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-xs">
        <span className="text-muted-foreground">Return numbers could not be loaded. {error}</span>
        <button type="button" onClick={onRetry} className="rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-muted">
          Retry
        </button>
      </div>
    );
  }
  if (loading && !summary) {
    return (
      <div role="status" aria-label="Loading return numbers" className="space-y-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[98px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[34px] rounded-xl" />
      </div>
    );
  }
  if (!summary) return null;

  const { requests, pendingInspections: insp, returnRate, refundExposure: exposure } = summary;
  const days = summary.window.days;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Returns at a glance">
        <Tile label={`Return requests (${days}D)`} value={formatNumber(requests.total)} caption={`${formatNumber(requests.today)} today, ${formatNumber(requests.open)} open`} />
        <Tile
          label="Awaiting warehouse inspection"
          value={formatNumber(insp.count)}
          tone={insp.count > 0 ? "text-amber-600" : undefined}
          caption={insp.overdue > 0 ? `${formatNumber(insp.overdue)} overdue (over ${insp.overdueAfterHours} h)` : "None overdue"}
        />
        <Tile label={`Return rate (${days}D)`} value={returnRate.percent === null ? "—" : `${returnRate.percent}%`} caption={rateCaption(returnRate, days)} />
        <Tile
          label="Refund exposure"
          value={formatMoney(exposure.amountMinor, exposure.currency)}
          caption={`${formatNumber(exposure.count)} ${exposure.count === 1 ? "return" : "returns"}, ${formatNumber(exposure.actionableCount)} ready to refund${exposure.mixedCurrencies ? ". Largest currency shown" : ""}`}
        />
      </div>

      <div role="group" aria-label="Returns by stage" className="flex flex-wrap gap-2">
        {summary.stages.map((s) => {
          const active = activeStage === s.stage;
          return (
            <button
              key={s.stage}
              type="button"
              aria-pressed={active}
              onClick={() => onPickStage(active ? null : s.stage)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "border-primary bg-primary/5 text-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted/40",
              )}
            >
              {s.label}
              <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">{formatNumber(s.count)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
