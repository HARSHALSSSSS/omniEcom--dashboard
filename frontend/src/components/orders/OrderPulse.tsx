import { Skeleton } from "@/components/ui/skeleton";
import { formatINR, formatNumber } from "@/utils/format";
import type { OrderStatus, OrdersSummary, OrdersWorkspace, PipelineStage } from "@/types/orders";

const STAGE_LABEL: Record<PipelineStage, string> = {
  new: "New",
  confirmed: "Confirmed",
  picking: "Picking",
  packed: "Packed",
  ready_to_dispatch: "Ready to Dispatch",
  dispatched: "Dispatched",
  in_transit: "In Transit",
};

interface OrderPulseProps {
  summary: OrdersSummary | undefined;
  workspace: OrdersWorkspace | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** `null` = every order placed today */
  onPick: (status: OrderStatus | null) => void;
  /** the status the list is filtered to when it is exactly one stage placed today */
  activeStage: OrderStatus | "today" | null;
}

/** "Order Pulse": how today's orders are spread over the lifecycle, plus the day's headline numbers; a stage filters the list to today's orders in it */
export function OrderPulse({ summary, workspace, loading, error, onRetry, onPick, activeStage }: OrderPulseProps) {
  if (error && !workspace) {
    return (
      <div role="alert" className="w-full flex items-center justify-between rounded-lg border border-[#EAEAEA] bg-white px-3 py-2 text-[12px]">
        <span className="text-[#666666]">Order numbers could not be loaded. {error}</span>
        <button type="button" onClick={onRetry} className="h-[28px] px-3 rounded-lg border border-[#EAEAEA] text-[12px] font-medium text-[#000000] hover:bg-neutral-50 cursor-pointer">
          Retry
        </button>
      </div>
    );
  }
  if (loading && !workspace) {
    return (
      <div role="status" aria-label="Loading order numbers" className="w-full flex flex-col gap-2">
        <Skeleton className="h-[16px] w-full" />
        <Skeleton className="h-[24px] w-full" />
      </div>
    );
  }
  if (!workspace) return null;

  const { pulse } = workspace;
  const stats: string[] = summary
    ? [
        `Revenue today ${formatINR(summary.today.revenueMinor)}`,
        `${formatNumber(summary.pendingDispatchCount)} pending dispatch`,
        summary.avgFulfillmentHours === null ? null : `Avg fulfilment ${summary.avgFulfillmentHours} h`,
        summary.cancellationRatePct === null ? null : `Cancellation rate ${summary.cancellationRatePct}%`,
      ].filter((s): s is string => s !== null)
    : [];

  return (
    <div className="w-full flex flex-col items-start gap-2">
      <div className="w-full flex flex-row flex-wrap justify-between items-start gap-x-4 min-h-[16px]">
        <span className="text-[11px] font-normal leading-[145%] text-[#666666]">Order Pulse</span>
        <span className="text-[11px] font-normal leading-[145%] text-[#666666]" aria-label="Today's numbers">
          Today · Live operational flow{stats.length > 0 ? ` · ${stats.join(" · ")}` : ""}
        </span>
      </div>

      <div className="w-full flex flex-row items-center gap-2 min-h-[24px] overflow-x-auto" role="group" aria-label="Today's orders by stage">
        <button
          type="button"
          aria-pressed={activeStage === "today"}
          onClick={() => onPick(null)}
          className="flex flex-row items-center gap-2 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className="flex flex-row items-center justify-center px-2 h-[24px] bg-[#000000] rounded-full">
            <span className="text-[11px] font-semibold leading-[13px] text-white">{formatNumber(pulse.today)}</span>
          </div>
          <span className="text-[12px] font-semibold leading-[145%] text-[#666666]">Today orders</span>
        </button>

        {pulse.stages.map((stage) => {
          const active = activeStage === stage.key;
          return (
            <button
              key={stage.key}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(stage.key)}
              className="flex flex-1 flex-row items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="w-[14px] h-[1px] bg-[#BDBDBD] shrink-0" />
              <div className={`flex flex-row items-center justify-center min-w-[24px] px-1 h-[24px] rounded-full shrink-0 ${active ? "bg-[#000000]" : "bg-[#F5F5F5]"}`}>
                <span className={`text-[11px] font-semibold leading-[13px] ${active ? "text-white" : "text-[#000000]"}`}>{formatNumber(stage.count)}</span>
              </div>
              <span className={`text-[12px] leading-[145%] whitespace-nowrap ${active ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"}`}>
                {STAGE_LABEL[stage.key]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
