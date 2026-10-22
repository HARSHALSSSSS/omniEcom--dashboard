import { ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/utils/format";
import type { InventoryKpis, InventoryOverview } from "@/types/inventory";

interface AdvisoryBannerProps {
  advisory: InventoryOverview["advisory"] | undefined;
  /** the reorder recommendation of GET /inventory/kpis; its button opens the low stock list */
  reorder: InventoryKpis["reorder"] | undefined;
  onOpen: (variantId: string) => void;
  onReviewRisk: () => void;
  onReviewLowStock: () => void;
}

/** "Inventory intelligence": advisory only (nothing here changes stock). GET /inventory/overview -> advisory. */
export function AdvisoryBanner({ advisory, reorder, onOpen, onReviewRisk, onReviewLowStock }: AdvisoryBannerProps) {
  const items = advisory?.items.slice(0, 3) ?? [];
  return (
    <section
      aria-label="Inventory intelligence"
      style={{ background: "linear-gradient(98deg, #E9D5FF 0%, #DBEAFE 48%, #93C5FD 100%)" }}
      className="flex w-full flex-col items-start gap-6 rounded-[24px] px-8 py-6 lg:flex-row lg:gap-16"
    >
      <div className="flex w-full shrink-0 flex-col items-start gap-2 lg:w-[340px]">
        <div className="flex flex-row items-center gap-2">
          <span className="text-[14px] leading-none text-[#222222]" aria-hidden>
            ✦
          </span>
          <span className="text-[13px] font-semibold text-[#111111]">Inventory intelligence</span>
          <span className="ml-0.5 text-[12px] font-normal tracking-wide text-[#666666]">ADVISORY</span>
        </div>

        {!advisory ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <span className="mt-0.5 text-[13px] font-semibold text-[#D97706]">{advisory.title}</span>
            <p className="m-0 text-[12px] font-normal leading-relaxed text-[#555555]">{advisory.text}</p>
            <span className="mt-1 text-[12px] font-normal text-[#666666]">Recommendation category: Safety buffer depletion</span>
          </>
        )}
        {reorder?.show && (
          <div className="mt-1 flex flex-col items-start gap-1">
            <p className="m-0 text-[12px] font-semibold text-[#111111]">{reorder.title}</p>
            <p className="m-0 text-[12px] text-[#555555]">{reorder.text}</p>
            <button type="button" onClick={onReviewLowStock} className="cursor-pointer border-none bg-transparent p-0 text-[12px] font-semibold text-[#111111] hover:underline">
              Review Low Stock Items
            </button>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5 pt-0.5">
        {items.map((it) => (
          <button key={it.variantId} type="button" onClick={() => onOpen(it.variantId)} className="group flex w-full cursor-pointer flex-row items-center gap-3 border-none bg-transparent py-0.5 text-left">
            <span className="h-3.5 w-[3px] shrink-0 rounded-full bg-[#D97706]" />
            <span className="w-[130px] shrink-0 truncate text-[13px] font-semibold text-[#111111]">{it.title}</span>
            <span className="flex-1 truncate text-[12px] text-[#555555]">
              {formatNumber(it.units)} units · {formatNumber(Math.round(it.coverDays))} days coverage · {it.leadTimeDays}-day lead time
            </span>
            <ArrowUpRight className="ml-4 h-3.5 w-3.5 shrink-0 stroke-[1.5px] text-[#666666] transition-colors group-hover:text-black" aria-hidden />
          </button>
        ))}
        {advisory && items.length === 0 && <p className="m-0 text-[12px] text-[#555555]">Nothing needs a reorder decision right now.</p>}
        {items.length > 0 && (
          <button type="button" onClick={onReviewRisk} className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 pt-1.5 text-[13px] font-semibold text-[#111111] hover:underline">
            Review recommendations →
          </button>
        )}
      </div>
    </section>
  );
}
