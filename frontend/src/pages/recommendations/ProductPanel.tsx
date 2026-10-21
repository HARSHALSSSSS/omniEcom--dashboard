import { Clock3 } from "lucide-react";
import { toAppPath } from "@/lib/links";
import type { ProductCard } from "@/types/recommendations";
import { formatInZone } from "@/utils/format";

const STATUS_LABEL = { out: "Out of stock", low: "Low stock", healthy: "In stock" } as const;
const day = (iso: string) => formatInZone(iso, { day: "numeric", month: "short" });
const units = (n: number) => `${n} ${n === 1 ? "unit" : "units"}`;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function ProductPanel({ card, onNavigate }: { card: ProductCard; onNavigate: (path: string) => void }) {
  const review = card.actions.find((a) => a.key === "review_replenishment");
  const open = card.actions.find((a) => a.key === "open_product");

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 flex flex-col justify-between shadow-2xs" data-testid="product-panel">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-normal leading-[145%] text-[#666666] uppercase tracking-wide">Product / Inventory</span>
          <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">{card.title}</h2>
          <p className="text-[12px] font-normal text-[#666666] leading-[145%]">
            {card.sku}
            {card.location ? ` · ${card.location}` : ""}
          </p>
        </div>

        <div>
          <span className="inline-flex items-center gap-1.5 px-2 h-[26px] bg-white border border-[#EAEAEA] rounded-[4px] text-[11px] font-normal text-[#333333]">
            <Clock3 className="h-3 w-3 text-[#333333]" />
            {STATUS_LABEL[card.status]}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[26px] font-semibold text-[#000000] leading-[145%]">{units(card.available)} available</span>
          <span className="text-[11px] font-normal text-[#666666] leading-[145%]">On-hand stock minus reserved units</span>
        </div>

        <div className="flex flex-col divide-y divide-[#EAEAEA] border-t border-[#EAEAEA]">
          {[
            ["On hand", units(card.onHand)],
            ["Reserved", units(card.reserved)],
            ["Available", units(card.available)],
            ["Low-stock threshold", units(card.lowStockThreshold)],
            ["Recent sales velocity", `${Number(card.salesVelocityPerDay.toFixed(2))} units / day`],
            ["Estimated stock cover", card.estimatedCoverDays === null ? "Not enough sales data" : `${card.estimatedCoverDays} ${card.estimatedCoverDays === 1 ? "day" : "days"}`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between h-[34px] text-[11px]">
              <span className="text-[#666666]">{label}</span>
              <span className="text-[12px] font-medium text-[#000000]">{value}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold text-[#000000] leading-[145%]">Recent stock movement</h3>
          {card.recentMovements.length === 0 ? (
            <p className="text-[12px] text-[#666666] leading-[145%]">No stock movements recorded yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[#EAEAEA]">
              {card.recentMovements.map((m, idx) => (
                <div key={`${m.at}-${idx}`} className="flex items-center justify-between h-[34px] text-[11px]">
                  <span className="text-[#666666]">
                    {day(m.at)} · {m.label}
                  </span>
                  <span className="text-[12px] font-medium text-[#000000]">{signed(m.quantity)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[12px] font-normal text-[#666666] leading-[145%] pt-1">This central stock source is shared across your connected channels.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-6">
        {review && (
          <button
            type="button"
            onClick={() => onNavigate(toAppPath(review.href))}
            className="w-full sm:w-[200px] h-10 rounded-[8px] border border-[#666666] bg-white text-[12px] font-semibold text-[#000000] hover:bg-neutral-50 transition-colors"
          >
            {review.label}
          </button>
        )}
        {open && (
          <button type="button" onClick={() => onNavigate(toAppPath(open.href))} className="text-[12px] font-medium text-[#000000] hover:underline text-left">
            Open product →
          </button>
        )}
      </div>
    </div>
  );
}
