import { formatInZone } from "@/utils/format";
import type { OrderActivityEvent, OrderActivityItem } from "@/types/orders";

const DOT: Record<OrderActivityEvent, string> = {
  payment_confirmed: "bg-[#16A34A]",
  ready_to_dispatch: "bg-[#2563EB]",
  picking_started: "bg-[#2563EB]",
  sla_risk: "bg-[#D97706]",
  return_requested: "bg-[#666666]",
};

interface OrderActivityProps {
  items: OrderActivityItem[] | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (orderId: string) => void;
}

/** "Recent Order Activity": a vertical timeline of the newest events across the marketplaces */
export function OrderActivity({ items, loading, error, onRetry, onOpen }: OrderActivityProps) {
  return (
    <section aria-label="Recent order activity" className="box-border w-full flex flex-col items-start pt-[10px] gap-[6px] border-t border-[#EAEAEA]">
      <div className="w-full flex flex-row justify-between items-start min-h-[17px]">
        <h2 className="text-[12px] font-semibold leading-[145%] text-[#000000] m-0">Recent Order Activity</h2>
        <span className="text-[10px] font-normal leading-[12px] text-[#666666]">Across all connected marketplaces</span>
      </div>

      {loading && !items ? (
        <p role="status" className="text-[11px] leading-[13px] text-[#666666]">
          Loading activity...
        </p>
      ) : error && !items ? (
        <p role="alert" className="text-[11px] leading-[13px] text-[#666666]">
          Recent activity could not be loaded. {error}{" "}
          <button type="button" onClick={onRetry} className="font-semibold text-[#000000] underline cursor-pointer">
            Retry
          </button>
        </p>
      ) : !items || items.length === 0 ? (
        <p className="text-[11px] leading-[13px] text-[#666666]">No order activity yet.</p>
      ) : (
        <ol className="relative w-full flex flex-col items-start pl-1 m-0 list-none">
          <div className="absolute left-[3px] top-[8px] bottom-[8px] w-[1px] bg-[#EAEAEA]" aria-hidden />
          {items.map((e) => (
            <li key={`${e.event}-${e.orderId}-${e.at}`} className="relative z-10 w-full flex flex-row items-center gap-[10px] min-h-[19px]">
              <div className={`w-[7px] h-[7px] rounded-full shrink-0 ${DOT[e.event]}`} />
              <span className="w-[34px] text-[10px] font-normal leading-[12px] text-[#666666] shrink-0">{formatInZone(e.at, { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
              <button type="button" onClick={() => onOpen(e.orderId)} className="min-w-[77px] text-left text-[11px] font-medium leading-[13px] text-[#000000] shrink-0 hover:underline cursor-pointer">
                {e.orderNumber}
              </button>
              <span className="flex-1 text-[11px] font-normal leading-[13px] text-[#666666]">{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
