import { useState } from "react";
import { ArrowRightLeft, Box, History, RefreshCw, ShoppingBag, SlidersHorizontal, Undo2, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInZone } from "@/utils/format";
import type { OverviewFeedItem } from "@/types/inventory";
import { MovementsFeed } from "./MovementsFeed";

/** the `type` values of the overview feed (see describeMovement in the inventory module) */
const ICON: Record<string, LucideIcon> = {
  order_reserved: ShoppingBag,
  order_released: ShoppingBag,
  order_dispatched: ShoppingBag,
  received: Box,
  incoming: Box,
  adjusted: SlidersHorizontal,
  damaged: SlidersHorizontal,
  quarantined: SlidersHorizontal,
  quarantine_released: SlidersHorizontal,
  returned: Undo2,
  transferred: ArrowRightLeft,
  synced: RefreshCw,
};

interface RecentMovementsProps {
  items: OverviewFeedItem[] | undefined;
  warehouseId: string | undefined;
}

/** "Recent movements": the last few stock events as a timeline (GET /inventory/overview), with the full audit trail one click away. */
export function RecentMovements({ items, warehouseId }: RecentMovementsProps) {
  const [trail, setTrail] = useState(false);
  return (
    <section aria-label="Recent movements" className="flex w-full flex-col items-start gap-4">
      <div className="flex w-full flex-row items-baseline justify-between">
        <h2 className="m-0 text-[20px] font-semibold tracking-tight text-[#111111]">Recent movements</h2>
        <button type="button" aria-expanded={trail} onClick={() => setTrail((t) => !t)} className="cursor-pointer border-none bg-transparent p-0 text-[12px] font-normal text-[#737373] transition-colors hover:text-black">
          {trail ? "Hide audit trail" : "Inventory audit trail →"}
        </button>
      </div>

      {!items ? (
        <Skeleton className="h-20 w-full" role="status" aria-label="Loading recent movements" />
      ) : items.length === 0 ? (
        <p className="m-0 text-[12px] text-[#737373]">No stock movements yet. Receipts, orders and adjustments show up here.</p>
      ) : (
        <ol className="relative isolate m-0 grid w-full list-none grid-cols-1 gap-4 p-0 pt-1 sm:grid-cols-3 lg:grid-cols-5 lg:gap-0">
          <div className="absolute left-[8px] right-[40px] top-[9px] z-0 hidden h-[1px] bg-[#EAEAEA] lg:block" />
          {items.map((m, i) => {
            const Icon = ICON[m.type] ?? History;
            return (
              <li key={`${m.at}-${i}`} className="z-10 flex flex-col items-start pr-6">
                <div className="mb-2 flex h-4 w-4 items-center justify-center bg-[#FAFAFA]">
                  <Icon className="h-3.5 w-3.5 stroke-[1.5px] text-[#555555]" aria-hidden />
                </div>
                <span className="mb-1 text-[12px] text-[#737373]">{formatInZone(m.at, { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                <span className="mb-1 max-w-[220px] text-[13px] leading-snug text-[#111111]">{m.text}</span>
                {m.detail && <span className="text-[13px] font-semibold text-[#111111]">{m.detail}</span>}
              </li>
            );
          })}
        </ol>
      )}

      {trail && <MovementsFeed warehouseId={warehouseId} />}
    </section>
  );
}
