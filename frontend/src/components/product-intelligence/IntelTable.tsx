import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { IntelAction, ProductIntelligenceItem } from "@/types/intelligence";
import { ACTION_LABELS, ACTION_TONE, CONFIDENCE_TONE, TREND_LABELS, TREND_TONE, gapText, marginText, money, runwayText, runwayUrgent, velocityText } from "./intelFormat";

export function ActionBadge({ action }: { action: IntelAction }) {
  return <span className={cn("inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", ACTION_TONE[action])}>{ACTION_LABELS[action]}</span>;
}

const TH = "px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

interface IntelTableProps {
  items: ProductIntelligenceItem[];
  selectedVariantId: string | undefined;
  onOpen: (item: ProductIntelligenceItem) => void;
}

/** one row per variant: what it sells, how long the stock lasts, the margin, the competitor and the recommendation */
export function IntelTable({ items, selectedVariantId, onOpen }: IntelTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[960px] text-xs">
        <caption className="sr-only">Product recommendations</caption>
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th scope="col" className={TH}>
              Product
            </th>
            <th scope="col" className={TH}>
              Action
            </th>
            <th scope="col" className={TH}>
              Sales velocity
            </th>
            <th scope="col" className={TH}>
              Stock runway
            </th>
            <th scope="col" className={TH}>
              Margin
            </th>
            <th scope="col" className={TH}>
              Competitor
            </th>
            <th scope="col" className={TH}>
              Confidence
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => {
            const gap = gapText(item.competitor?.gapPercent ?? null);
            return (
              <tr key={item.id} onClick={() => onOpen(item)} className={cn("cursor-pointer align-top transition-colors hover:bg-muted/30", selectedVariantId === item.variantId && "bg-muted/50")}>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(item);
                    }}
                    aria-label={`Open details for ${item.productName} ${item.sku}`}
                    className="text-left"
                  >
                    <span className="block max-w-[260px] truncate text-[13px] font-semibold text-foreground">{item.productName}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">{item.sku}</span>
                  </button>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.category ?? "Uncategorised"}</span>
                </td>
                <td className="px-4 py-3">
                  <ActionBadge action={item.recommendedAction} />
                  {item.reasons[0] && <span className="mt-1 line-clamp-2 block max-w-[240px] text-[11px] text-muted-foreground">{item.reasons[0].text}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="block font-mono font-semibold text-foreground">{velocityText(item.salesVelocity)}</span>
                  <span className={cn("block text-[11px]", item.velocityTrend ? TREND_TONE[item.velocityTrend] : "text-muted-foreground")}>
                    {item.velocityTrend ? TREND_LABELS[item.velocityTrend] : "Not enough sales"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("block font-mono font-semibold", runwayUrgent(item.inventory.runwayDays) ? "text-rose-600" : "text-foreground")}>
                    {runwayText(item.inventory.runwayDays, item.inventory.available)}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{formatNumber(item.inventory.available)} available</span>
                </td>
                <td className="px-4 py-3">
                  <span className="block font-mono font-semibold text-foreground">{marginText(item.marginPercent)}</span>
                  <span className="block text-[11px] text-muted-foreground">{item.sellingPriceMinor === null ? "No price" : money(item.sellingPriceMinor)}</span>
                </td>
                <td className="px-4 py-3">
                  {item.competitor ? (
                    <>
                      <span className="block font-mono font-semibold text-foreground">{money(item.competitor.priceMinor)}</span>
                      <span className="block text-[11px] text-muted-foreground">{gap ? `${gap} vs our price` : (item.competitor.sellerName ?? "Seen recently")}</span>
                    </>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">No competitor price</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={cn("block font-mono font-semibold", CONFIDENCE_TONE[item.confidence.level])}>{item.confidence.score}%</span>
                  <span className="block text-[11px] capitalize text-muted-foreground">{item.confidence.level}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
