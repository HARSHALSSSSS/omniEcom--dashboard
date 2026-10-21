import { Checkbox } from "@/components/ui/checkbox";
import type { PromotionProduct } from "@/types/promotions";
import { formatDateTime } from "@/utils/format";
import { formatBps, money } from "./promoFormat";
import { ChannelChips, ItemBadge } from "./PromoUi";

interface Props {
  rows: PromotionProduct[];
  refreshing: boolean;
  /** show the campaign column (the cross-campaign list); the campaign drawer already is one campaign */
  showCampaign: boolean;
  /** selectable rows (draft campaigns in the drawer) */
  selected?: ReadonlySet<string>;
  onToggle?: (variantId: string) => void;
  onToggleAll?: () => void;
  onOpenCampaign?: (campaignId: string) => void;
}

/** promoted SKUs: original and promotional price, the state and why a product cannot run */
export function ProductsTable({ rows, refreshing, showCampaign, selected, onToggle, onToggleAll, onOpenCampaign }: Props) {
  const selectable = Boolean(selected && onToggle);
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selected?.has(r.variantId));
  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity ${refreshing ? "opacity-60" : ""}`} aria-busy={refreshing}>
      <table className={`w-full text-left text-xs ${showCampaign ? "min-w-[900px]" : "min-w-[560px]"}`}>
        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
          <tr>
            {selectable && (
              <th className="w-10 py-3 pl-4 pr-2">
                <Checkbox aria-label="Select all products on this page" checked={allSelected} onCheckedChange={() => onToggleAll?.()} />
              </th>
            )}
            <th scope="col" className="px-4 py-3">
              Product / SKU
            </th>
            {showCampaign && (
              <>
                <th scope="col" className="px-4 py-3">
                  Campaign
                </th>
                <th scope="col" className="px-4 py-3">
                  Channels
                </th>
              </>
            )}
            <th scope="col" className="px-4 py-3 text-right">
              Original
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Promotional
            </th>
            <th scope="col" className="px-4 py-3">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => (
            <tr key={p.id} className="align-top transition-colors hover:bg-muted/30">
              {selectable && (
                <td className="py-3 pl-4 pr-2">
                  <Checkbox aria-label={`Select ${p.sku}`} checked={selected?.has(p.variantId) ?? false} onCheckedChange={() => onToggle?.(p.variantId)} />
                </td>
              )}
              <td className="px-4 py-3">
                <div className="font-semibold text-foreground">{p.productName}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{p.sku}</div>
              </td>
              {showCampaign && (
                <>
                  <td className="px-4 py-3">
                    <button type="button" className="text-left font-medium text-foreground hover:underline" onClick={() => onOpenCampaign?.(p.campaignId)}>
                      {p.campaignName}
                    </button>
                    <div className="font-mono text-[11px] text-blue-600">{p.campaignCode}</div>
                  </td>
                  <td className="px-4 py-3">
                    <ChannelChips channels={p.channels} />
                  </td>
                </>
              )}
              <td className="px-4 py-3 text-right text-muted-foreground line-through">{money(p.originalPriceMinor)}</td>
              <td className="px-4 py-3 text-right">
                <div className="font-bold text-emerald-600">{money(p.promoPriceMinor)}</div>
                <div className="text-[11px] text-muted-foreground">{formatBps(p.discountBps)} off</div>
              </td>
              <td className="px-4 py-3">
                <ItemBadge status={p.status} />
                {p.reason && <p className="mt-1 max-w-[320px] text-[11px] leading-snug text-muted-foreground">{p.reason}</p>}
                {p.lastSyncedAt && p.status === "live" && <p className="mt-1 text-[11px] text-muted-foreground">Synced {formatDateTime(p.lastSyncedAt)}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
