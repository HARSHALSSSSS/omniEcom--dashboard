import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import type { IntelItem } from "@/types/intelligence";
import { ACTION_HINTS, ACTION_LABELS, ACTION_TONE } from "./intelFormat";

interface PrioritizedOpportunitiesProps {
  /** the list already ordered by priority; the first few that need a decision are shown */
  items: IntelItem[];
  loading: boolean;
  onInspect: (item: IntelItem) => void;
}

const SHOWN = 3;

/** the products to look at first: the recommendation, the facts behind it (the reasons the server wrote from the numbers) and a way into the real drawer */
export function PrioritizedOpportunities({ items, loading, onInspect }: PrioritizedOpportunitiesProps) {
  const top = items.filter((i) => i.recommendedAction !== "hold").slice(0, SHOWN);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">Prioritized opportunities</h2>
        <span className="text-xs text-muted-foreground">{top.length} {top.length === 1 ? "product" : "products"} · Review suggestions only</span>
      </div>

      {top.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">{loading ? "Loading..." : "Nothing needs a decision right now. Recommendations appear here when stock, margin or sales call for one."}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {top.map((item, idx) => (
            <div key={item.variantId} className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-2xs">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-foreground">P{idx + 1} · {ACTION_HINTS[item.recommendedAction]}</span>
                  <span className={cn("shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold", ACTION_TONE[item.recommendedAction])}>{ACTION_LABELS[item.recommendedAction]}</span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{item.productName}</h3>
                  <p className="font-mono text-[11px] text-muted-foreground">{item.sku}</p>
                  <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                    {item.reasons.slice(0, 2).map((r) => (
                      <li key={r.key}>{r.text}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-[11px] text-foreground/80">Confidence: {item.confidence.level} ({item.confidence.score}).</p>
              </div>
              <div className="pt-3">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => onInspect(item)} aria-label={`Inspect ${item.productName}`}>
                  <span>Inspect product</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Ordered by urgency: stock that runs out before a restock, then excess stock, then price and promotion opportunities. Nothing is applied without your review.</p>
    </div>
  );
}
