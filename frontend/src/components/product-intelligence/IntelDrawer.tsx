import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/utils/cn";
import { formatDate, formatNumber } from "@/utils/format";
import type { ProductIntelligenceItem } from "@/types/intelligence";
import { ACTION_HINTS, CONFIDENCE_TONE, TREND_LABELS, gapText, marginText, money, runwayText, velocityText } from "./intelFormat";
import { IntelActions } from "./IntelActions";
import { ActionBadge } from "./IntelTable";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <span className="block text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-semibold text-foreground">{value}</span>
      {hint && <span className="mt-0.5 block text-[10px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

interface IntelDrawerProps {
  item: ProductIntelligenceItem | null;
  onClose: () => void;
}

/** every fact behind one recommendation, the reasons in the server's words, and what to do about it */
export function IntelDrawer({ item, onClose }: IntelDrawerProps) {
  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[460px] max-w-full overflow-y-auto">
        {item && (
          <div className="flex flex-col gap-4">
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="text-base">{item.productName}</SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {item.sku} · {item.category ?? "Uncategorised"}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-wrap items-center gap-2">
              <ActionBadge action={item.recommendedAction} />
              <span className="text-[11px] text-muted-foreground">{ACTION_HINTS[item.recommendedAction]}</span>
            </div>

            <IntelActions item={item} />

            <div className="rounded-lg border border-border bg-muted/40 p-3.5">
              <span className="text-xs font-semibold text-foreground">Why this recommendation</span>
              {item.reasons.length === 0 ? (
                <p className="mt-1.5 text-xs text-muted-foreground">There is nothing in the data that calls for an action on this variant.</p>
              ) : (
                <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
                  {item.reasons.map((r) => (
                    <li key={r.key}>{r.text}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Sales velocity"
                value={velocityText(item.salesVelocity)}
                hint={`${formatNumber(item.unitsSold30d)} sold in 30 days${item.velocityTrend ? ` · ${TREND_LABELS[item.velocityTrend]}${item.trendChangePercent !== null ? ` (${item.trendChangePercent > 0 ? "+" : ""}${item.trendChangePercent}%)` : ""}` : ""}`}
              />
              <Stat label="Stock runway" value={runwayText(item.inventory.runwayDays, item.inventory.available)} hint={`Lead time ${formatNumber(item.inventory.leadTimeDays)} days`} />
              <Stat label="Available" value={formatNumber(item.inventory.available)} hint={`${formatNumber(item.inventory.onHand)} on hand`} />
              <Stat
                label="Suggested reorder"
                value={item.inventory.suggestedReorderUnits ? `${formatNumber(item.inventory.suggestedReorderUnits)} units` : "None"}
                hint={item.inventory.ageDays !== null ? `Last received ${formatNumber(item.inventory.ageDays)} days ago` : undefined}
              />
              <Stat label="Selling price" value={money(item.sellingPriceMinor)} />
              <Stat label="Cost price" value={money(item.costPriceMinor)} hint={item.costPriceMinor === null ? "Add a cost price to see the margin" : undefined} />
              <Stat label="Margin" value={marginText(item.marginPercent)} />
              <Stat
                label="Competitor price"
                value={item.competitor ? money(item.competitor.priceMinor) : "N/A"}
                hint={
                  item.competitor
                    ? `${gapText(item.competitor.gapPercent) ? `${gapText(item.competitor.gapPercent)} vs our price · ` : ""}${item.competitor.sellerName ?? "Unknown seller"} · ${formatDate(item.competitor.observedAt)}`
                    : "No competitor price recorded"
                }
              />
            </div>

            <div className="rounded-lg border border-border p-3.5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-foreground">Confidence</span>
                <span className={cn("font-mono text-sm font-semibold", CONFIDENCE_TONE[item.confidence.level])}>
                  {item.confidence.score}% · <span className="capitalize">{item.confidence.level}</span>
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">How much data the recommendation rests on, not a statistical claim.</p>
              <ul className="mt-2 space-y-1">
                {item.confidence.factors.map((f) => (
                  <li key={f.key} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                    <span className={cn("mt-0.5 font-semibold", f.met ? "text-emerald-600" : "text-muted-foreground")} aria-label={f.met ? "Met" : "Not met"}>
                      {f.met ? "✓" : "–"}
                    </span>
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
