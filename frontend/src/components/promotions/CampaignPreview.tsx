import { errorMessage } from "@/api/errors";
import { formatNumber } from "@/utils/format";
import type { PreviewResult, PreviewRow } from "@/types/promotions";
import { marketplaceLabel, money, percentLabel } from "./promoFormat";

const VISIBLE_ROWS = 50;

interface Props {
  data: PreviewResult | undefined;
  loading: boolean;
  /** the numbers on screen are for earlier terms; new ones are on their way */
  stale: boolean;
  error: unknown;
  /** why there is nothing to preview yet */
  idle: string | null;
}

function Margin({ r }: { r: PreviewRow }) {
  if (r.marginPromoBps === null) return <span className="text-muted-foreground">{r.unitCostMinor === null ? "cost not set" : "—"}</span>;
  return (
    <span>
      {r.marginRegularBps === null ? "—" : percentLabel(r.marginRegularBps)} → <span className={r.belowTarget ? "font-semibold text-amber-600" : ""}>{percentLabel(r.marginPromoBps)}</span>
      {r.targetMarginBps !== null && (
        <span className="block text-[11px] text-muted-foreground">
          target {percentLabel(r.targetMarginBps)}
          {r.belowTarget ? " · below target" : ""}
        </span>
      )}
    </span>
  );
}

/** what the campaign would do to each product on each channel, before anything is saved (POST /promotions/preview) */
export function CampaignPreview({ data, loading, stale, error, idle }: Props) {
  if (idle) return <p className="rounded-lg border border-dashed border-border p-3 text-[11px] text-muted-foreground">{idle}</p>;
  if (error && !data) {
    return (
      <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive">
        The preview could not be loaded: {errorMessage(error)}
      </p>
    );
  }
  if (!data) {
    return (
      <p role="status" className="rounded-lg border border-border p-3 text-[11px] text-muted-foreground">
        Checking prices and margins…
      </p>
    );
  }
  const s = data.summary;
  const rows = data.items.slice(0, VISIBLE_ROWS);
  const notes: string[] = [];
  if (s.notListed > 0) notes.push(`${s.notListed} not listed on a target channel`);
  if (s.belowMarginTarget > 0) notes.push(`${s.belowMarginTarget} below the margin target`);
  if (s.unknownCost > 0) notes.push(`${s.unknownCost} without a cost price`);
  if (s.conflicts > 0) notes.push(`${s.conflicts} in conflict with another campaign or sale`);
  if (s.connectorCannotPush > 0) notes.push(`${s.connectorCannotPush} on channels that cannot take price changes`);
  if (s.unknownVariants > 0) notes.push(`${s.unknownVariants} product${s.unknownVariants === 1 ? "" : "s"} not found`);

  return (
    <div className={`space-y-2 ${stale || loading ? "opacity-70" : ""}`} aria-label="Campaign preview" aria-busy={stale || loading}>
      <p className="text-[11px] font-medium text-foreground" data-testid="preview-summary">
        {formatNumber(s.runnable)} of {formatNumber(s.placements)} product placement{s.placements === 1 ? "" : "s"} can run
        {s.notRunnable > 0 ? `, ${formatNumber(s.notRunnable)} cannot` : ""}
        {s.avgDiscountBps !== null ? ` · average discount ${percentLabel(s.avgDiscountBps)}` : ""}
      </p>
      {notes.length > 0 && <p className="text-[11px] text-amber-700">{notes.join(" · ")}</p>}
      {rows.length > 0 && (
        <div className="max-h-[220px] overflow-auto rounded-lg border border-border">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">Product</th>
                <th className="px-2 py-1.5 font-medium">Channel</th>
                <th className="px-2 py-1.5 font-medium">Regular</th>
                <th className="px-2 py-1.5 font-medium">Promo</th>
                <th className="px-2 py-1.5 font-medium">Margin</th>
                <th className="px-2 py-1.5 font-medium">Floor</th>
                <th className="px-2 py-1.5 font-medium">Can run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={`${r.variantId}|${r.accountId}`} className="align-top">
                  <td className="px-2 py-1.5">
                    <span className="block max-w-[140px] truncate font-medium text-foreground">{r.productName}</span>
                    <span className="font-mono text-muted-foreground">{r.sku}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    {r.displayName || marketplaceLabel(r.marketplace)}
                    {!r.canPushPrices && <span className="block text-red-600">cannot take prices</span>}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{money(r.regularPriceMinor)}</td>
                  <td className="px-2 py-1.5 font-mono">
                    {money(r.promoPriceMinor)}
                    <span className="block text-muted-foreground">−{percentLabel(r.discountBps)}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <Margin r={r} />
                  </td>
                  <td className="px-2 py-1.5">
                    {r.minPromoPriceMinor === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        {money(r.minPromoPriceMinor)}
                        <span className="block text-muted-foreground">{r.maxDiscountBps ? `up to ${percentLabel(r.maxDiscountBps)} off` : "no discount keeps it"}</span>
                      </>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {r.ok ? <span className="font-medium text-emerald-700">Can run</span> : <span className="text-red-600">{r.reason ?? "Cannot run"}</span>}
                    {r.conflict && <span className="block text-amber-700">{r.conflict.message}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.items.length > VISIBLE_ROWS && <p className="text-[11px] text-muted-foreground">Showing the first {VISIBLE_ROWS} of {formatNumber(data.items.length)} rows.</p>}
    </div>
  );
}
