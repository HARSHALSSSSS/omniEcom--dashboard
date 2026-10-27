import { useState } from "react";
import { Link } from "react-router-dom";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import { formatINR, formatNumber } from "@/utils/format";
import { ACTION_LABELS, ACTION_TONE } from "@/components/product-intelligence/intelFormat";
import type { IntelItem } from "@/types/intelligence";

interface ProductContextRailProps {
  /** the SKU the rail was opened for (from the link); undefined when none */
  sku: string | undefined;
  /** the product, read from Product Intelligence for that SKU: null = looked up and not found */
  item: IntelItem | null | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  className?: string;
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-foreground">{value}</span>
  </div>
);

/** the facts the assistant has about one product, straight from Product Intelligence (30-day window); without a product it says so instead of showing an example */
export function ProductContextRail({ sku, item, loading, error, onRetry, className }: ProductContextRailProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className={cn("flex flex-col items-center gap-3 border-l border-border bg-card p-2", className)}>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Expand Product Context" onClick={() => setCollapsed(false)}>
          <PanelRightOpen className="h-4 w-4" />
        </Button>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground [writing-mode:vertical-rl]">Product Context</span>
      </div>
    );
  }

  const body = () => {
    if (!sku) {
      return (
        <div className="space-y-2 py-6 text-center text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">No product selected</p>
          <p>Open the assistant from a product in Product Intelligence to see its stock, demand and margin here.</p>
          <Link to={ROUTES.PRODUCT_INTELLIGENCE} className="font-semibold text-foreground underline">
            Open Product Intelligence
          </Link>
        </div>
      );
    }
    if (loading && item === undefined) return <p role="status" className="py-6 text-center text-xs text-muted-foreground">Loading {sku}...</p>;
    if (error) {
      return (
        <div role="alert" className="space-y-2 py-6 text-center text-xs">
          <p className="text-rose-700">{error}</p>
          <Button size="sm" variant="outline" className="text-xs" onClick={onRetry}>
            Retry
          </Button>
        </div>
      );
    }
    if (!item) {
      return (
        <div className="space-y-1 py-6 text-center text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">{sku} was not found</p>
          <p>It is not among your active products, so there are no facts to show.</p>
        </div>
      );
    }

    const lead = item.inventory.leadTimeDays;
    const cover = item.inventory.runwayDays;
    const coverPercent = cover === null ? 0 : Math.min(100, Math.round((cover / Math.max(1, lead)) * 100));
    const gap = cover === null ? 0 : Math.round(lead - cover);

    return (
      <div className="space-y-5">
        <div className="space-y-1.5">
          <span className={cn("inline-block rounded border px-2 py-0.5 text-[10px] font-semibold", ACTION_TONE[item.recommendedAction])}>{ACTION_LABELS[item.recommendedAction]}</span>
          <h3 className="text-base font-bold text-foreground">{item.productName}</h3>
          <p className="text-xs text-muted-foreground">
            {item.sku}
            {item.category ? ` · ${item.category}` : ""}
          </p>
          <p className="text-[11px] text-muted-foreground">From Product Intelligence · last 30 days</p>
        </div>

        <div className="space-y-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Stock and demand</span>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-foreground">{cover === null ? "No sales pace yet" : `${Math.round(cover)} days of cover`}</span>
              <span className="text-muted-foreground">{lead}-day lead time</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full transition-all", gap > 0 ? "bg-amber-600" : "bg-emerald-600")} style={{ width: `${coverPercent}%` }} />
            </div>
            {gap > 0 && <p className="text-[11px] font-medium text-amber-700">{gap} days below the lead time</p>}
          </div>
          <div className="space-y-1.5">
            <Row label="Available" value={`${formatNumber(item.inventory.available)} units`} />
            <Row label="On hand" value={`${formatNumber(item.inventory.onHand)} units`} />
            <Row label="Sold in 30 days" value={`${formatNumber(item.unitsSold30d)} units`} />
            <Row label="Average daily demand" value={`${item.salesVelocity} units/day`} />
            <Row label="Suggested reorder" value={item.inventory.suggestedReorderUnits === null ? "—" : `${formatNumber(item.inventory.suggestedReorderUnits)} units`} />
          </div>
          <p className="text-[11px] text-muted-foreground">Cover is available stock divided by the average units sold per day. It assumes the same pace continues and leaves out stock already on order.</p>
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Price and margin</span>
          <Row label="Selling price" value={item.sellingPriceMinor === null ? "—" : formatINR(item.sellingPriceMinor)} />
          <Row label="Cost price" value={item.costPriceMinor === null ? "Not recorded" : formatINR(item.costPriceMinor)} />
          <Row label="Margin" value={item.marginPercent === null ? "—" : `${item.marginPercent}%`} />
          <Row label="Competitor price" value={item.competitor ? `${formatINR(item.competitor.priceMinor)}${item.competitor.gapPercent !== null ? ` (${item.competitor.gapPercent > 0 ? "+" : ""}${item.competitor.gapPercent}%)` : ""}` : "None on record"} />
        </div>

        {item.reasons.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Why it is flagged</span>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {item.reasons.map((r) => (
                <li key={r.key}>{r.text}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className={cn("flex h-full w-[340px] shrink-0 flex-col overflow-y-auto border-l border-border bg-card p-5 text-sm", className)}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Product context</span>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Collapse Panel" onClick={() => setCollapsed(true)}>
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>
      {body()}
    </aside>
  );
}
