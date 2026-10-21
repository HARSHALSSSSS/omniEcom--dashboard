import { toAppPath } from "@/lib/links";
import type { ReplenishmentCard } from "@/types/recommendations";

/**
 * Replenish-this-week suggestions: suggested units = target days of sales minus available stock (computed by the server).
 * Recommendation only: the button opens procurement, where the purchase order is created; nothing is changed here.
 */
export function ReplenishmentPanel({ card, onNavigate }: { card: ReplenishmentCard; onNavigate: (path: string) => void }) {
  const review = card.actions.find((a) => a.key === "review_replenishment");

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-[12px] p-5 flex flex-col justify-between shadow-2xs" data-testid="replenishment-panel">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-normal leading-[145%] text-[#666666] uppercase tracking-wide">Recommendation details</span>
          <h2 className="text-[18px] font-semibold text-[#000000] leading-[145%]">{card.headline}</h2>
          <p className="text-[12px] font-normal text-[#666666] leading-[145%]">{card.summary}</p>
        </div>

        <div className="bg-[#F5F5F5] rounded-[8px] p-4 flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">Why this is recommended</span>
          <p className="text-[12px] font-normal text-[#666666] leading-[145%]">{card.rationale}</p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">Suggested quantities</span>
            <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
              {card.targetDays}-day target cover, less available stock
            </span>
          </div>

          <div className="flex flex-col divide-y divide-[#EAEAEA] pt-1">
            <div className="flex items-center justify-between bg-[#F5F5F5] px-2.5 h-[30px] text-[10px] text-[#000000] font-normal">
              <span>Product / Available</span>
              <span>Add units</span>
            </div>
            {card.items.map((item) => (
              <div key={item.variantId} data-testid="replenishment-row" className="flex items-center justify-between px-2.5 h-[43px]">
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium text-[#000000] leading-[145%]">{item.name}</span>
                  <span className="text-[10px] font-normal text-[#666666] leading-[145%]">
                    {item.sku} · {item.available} available
                  </span>
                </div>
                <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">+{item.suggestedUnits}</span>
              </div>
            ))}
          </div>

          {card.totalProducts > card.shown && (
            <p className="text-[11px] font-normal text-[#666666] leading-[145%]">
              Showing {card.shown} of {card.totalProducts} products.
            </p>
          )}
          <p className="text-[11px] font-normal text-[#666666] leading-[145%] pt-1">{card.note}</p>
        </div>
      </div>

      {review && (
        <div className="flex items-center gap-2 pt-6">
          <button
            type="button"
            onClick={() => onNavigate(toAppPath(review.href))}
            className="flex-1 sm:w-[202px] h-10 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-white hover:bg-neutral-800 transition-colors flex items-center justify-center"
          >
            {review.label}
          </button>
        </div>
      )}
    </div>
  );
}
