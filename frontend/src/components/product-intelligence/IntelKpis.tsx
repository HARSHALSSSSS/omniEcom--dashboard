import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/api/errors";
import { formatNumber } from "@/utils/format";
import type { IntelAction, ProductIntelligencePage } from "@/types/intelligence";

interface IntelKpisProps {
  data: ProductIntelligencePage | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onAction: (action: IntelAction | null) => void;
}

const TILE = "flex flex-col gap-1 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/30";
const LABEL = "text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

/** the tiles over the list: how many variants were analysed and how many call for each action */
export function IntelKpis({ data, loading, error, onRetry, onAction }: IntelKpisProps) {
  if (loading && !data) {
    return (
      <div role="status" aria-label="Loading the summary" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[98px] rounded-xl" />
        ))}
      </div>
    );
  }
  if (!data) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-xs">
        <span className="text-muted-foreground">The summary could not be loaded: {errorMessage(error)}</span>
        <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  const { summary } = data;
  const analysed = Object.values(summary).reduce((sum, n) => sum + n, 0);
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <button type="button" onClick={() => onAction(null)} className={TILE}>
        <span className={LABEL}>Variants analysed</span>
        <span className="font-mono text-2xl font-bold text-foreground">{formatNumber(analysed)}</span>
        <span className="text-[11px] text-muted-foreground">{formatNumber(summary.hold)} need no action</span>
      </button>
      <button type="button" onClick={() => onAction("reorder")} className={TILE}>
        <span className={LABEL}>Reorder now</span>
        <span className={`font-mono text-2xl font-bold ${summary.reorder > 0 ? "text-amber-600" : "text-foreground"}`}>{formatNumber(summary.reorder)}</span>
        <span className="text-[11px] text-muted-foreground">{summary.reorder > 0 ? "Running out before a restock arrives" : "No stock-out risk"}</span>
      </button>
      <button type="button" onClick={() => onAction("raise_price")} className={TILE}>
        <span className={LABEL}>Pricing upside</span>
        <span className={`font-mono text-2xl font-bold ${summary.raise_price > 0 ? "text-blue-600" : "text-foreground"}`}>{formatNumber(summary.raise_price)}</span>
        <span className="text-[11px] text-muted-foreground">{summary.raise_price > 0 ? "Room to raise the price" : "Prices look right"}</span>
      </button>
      <button type="button" onClick={() => onAction("liquidate")} className={TILE}>
        <span className={LABEL}>Excess stock</span>
        <span className={`font-mono text-2xl font-bold ${summary.liquidate > 0 ? "text-rose-600" : "text-foreground"}`}>{formatNumber(summary.liquidate)}</span>
        <span className="text-[11px] text-muted-foreground">
          {formatNumber(summary.promote)} {summary.promote === 1 ? "variant" : "variants"} to promote
        </span>
      </button>
    </div>
  );
}
