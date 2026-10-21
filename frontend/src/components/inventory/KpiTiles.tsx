import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { formatINR, formatNumber, formatRelativeTime } from "@/utils/format";
import type { InventoryKpis, InventorySignal, StockStatus, SyncFreshness } from "@/types/inventory";
import { InlineError, Pill } from "./inventoryUi";

interface TileProps {
  label: string;
  value: string;
  hint: string;
  tone: string;
  activeClass: string;
  active?: boolean;
  /** a tile with a handler is a filter button */
  onClick?: () => void;
  className?: string;
}

function Tile({ label, value, hint, tone, activeClass, active, onClick, className }: TileProps) {
  const body = (
    <>
      <p className={cn("text-[10px] font-semibold uppercase tracking-wider", tone)}>{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-bold", tone)}>{value}</p>
      <span className={cn("text-[11px]", tone)}>{hint}</span>
    </>
  );
  const base = cn("rounded-xl border p-4 text-left transition-all", active ? activeClass : "border-border bg-card", onClick && !active && "hover:bg-muted/30", className);
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn(base, "cursor-pointer")}>
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  );
}

const SYNC_TONE: Record<SyncFreshness, "good" | "warn" | "bad" | "neutral"> = { fresh: "good", stale: "warn", failed: "bad", never_synced: "neutral", not_connected: "neutral" };

interface KpiTilesProps {
  kpis: InventoryKpis | undefined;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  status: StockStatus | undefined;
  signal: InventorySignal | undefined;
  onStatus: (status: StockStatus | null) => void;
  onSignal: (signal: InventorySignal | null) => void;
}

export function KpiTiles({ kpis, isLoading, error, onRetry, status, signal, onStatus, onSignal }: KpiTilesProps) {
  if (error && !kpis) {
    return (
      <div className="space-y-2">
        <InlineError message={`The stock numbers could not be loaded. ${error}`} />
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (isLoading || !kpis) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5" role="status" aria-label="Loading stock numbers">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
    );
  }

  const toggle = (id: StockStatus) => onStatus(status === id ? null : id);
  const sync = kpis.channelSync;
  const costNote = kpis.valuation.skusWithoutCost > 0 ? `${formatNumber(kpis.valuation.skusWithoutCost)} SKUs without a cost price are not counted` : "At cost price";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Tile
          label="Total Inventory Units"
          value={formatNumber(kpis.totals.unitsAvailable)}
          hint={`Across ${formatNumber(kpis.totals.skus)} Active SKUs`}
          tone="text-foreground"
          activeClass="border-[#1D4ED8] bg-[#E6F4FF]/30 shadow-sm"
          active={status === undefined && signal === undefined}
          onClick={() => onStatus(null)}
        />
        <Tile label="Healthy Stock" value={formatNumber(kpis.health.healthy)} hint="Enough cover for the lead time" tone="text-emerald-700" activeClass="border-emerald-500 bg-emerald-50/50 shadow-sm" active={status === "healthy"} onClick={() => toggle("healthy")} />
        <Tile label="Low Stock Threshold" value={formatNumber(kpis.health.lowStock)} hint="Reorder recommended" tone="text-amber-700" activeClass="border-amber-500 bg-amber-50/50 shadow-sm" active={status === "low_stock"} onClick={() => toggle("low_stock")} />
        <Tile label="Out of Stock" value={formatNumber(kpis.health.outOfStock)} hint="Zero units available" tone="text-destructive" activeClass="border-rose-500 bg-rose-50/50 shadow-sm" active={status === "out_of_stock"} onClick={() => toggle("out_of_stock")} />
        <Tile label="Excess / Slow Moving" value={formatNumber(kpis.health.excess)} hint="> 90 days cover" tone="text-[#1D4ED8]" activeClass="border-blue-500 bg-blue-50/50 shadow-sm" active={status === "excess"} onClick={() => toggle("excess")} className="col-span-2 sm:col-span-1" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          label="Stockout Risk"
          value={formatNumber(kpis.stockoutRiskCount)}
          hint="Cover shorter than the lead time"
          tone="text-rose-700"
          activeClass="border-rose-500 bg-rose-50/50 shadow-sm"
          active={signal === "stockout_risk"}
          onClick={() => onSignal(signal === "stockout_risk" ? null : "stockout_risk")}
        />
        <Tile label="Stock Valuation" value={formatINR(kpis.valuation.amountMinor, true)} hint={costNote} tone="text-foreground" activeClass="" />
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Channel Sync</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill tone={SYNC_TONE[sync.state]}>{sync.label}</Pill>
            {sync.lastSuccessAt && <span className="text-[11px] text-muted-foreground">last success {formatRelativeTime(sync.lastSuccessAt)}</span>}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {sync.connectedChannels === 0
              ? "No marketplace connected"
              : `${formatNumber(sync.connectedChannels)} connected${sync.failedChannels ? ` · ${sync.failedChannels} failing` : ""}${sync.skusNeedingReview ? ` · ${formatNumber(sync.skusNeedingReview)} SKUs to review` : ""}`}
          </p>
        </div>
      </div>
    </div>
  );
}

/** the reorder recommendation of the advisory (GET /inventory/kpis -> reorder); hidden when the server says there is nothing to show */
export function ReorderBanner({ reorder, onReview }: { reorder: InventoryKpis["reorder"] | undefined; onReview: () => void }) {
  if (!reorder?.show) return null;
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="text-xs font-bold text-amber-950">{reorder.title}</p>
          <p className="text-[11px] text-amber-800">{reorder.text}</p>
        </div>
      </div>
      <Button size="sm" className="h-8 shrink-0 bg-amber-700 text-xs text-white hover:bg-amber-800" onClick={onReview}>
        Review Low Stock Items
      </Button>
    </div>
  );
}
