import { CheckCircle2, ListOrdered, Package, RefreshCw, Send, Check } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { FulfillmentTab, QueueCounts } from "@/types/fulfillment";

interface OrderFlowStepperProps {
  activeTab: FulfillmentTab;
  counts?: QueueCounts;
  warehouseName?: string;
  onSelectTab: (tab: FulfillmentTab) => void;
}

export function OrderFlowStepper({
  activeTab,
  counts,
  warehouseName,
  onSelectTab,
}: OrderFlowStepperProps) {
  // Real backend counts from /fulfillment/queue
  const toPickCount = counts?.awaiting_pick ?? 0;
  const pickingCount = counts?.picking ?? 0;
  const toPackCount = counts?.packing ?? 0;
  const readyToDispatchCount = counts?.ready_to_ship ?? 0;
  // real statuses: packed (waiting for a carrier) and handed to a carrier since midnight UTC
  const packedCount = counts?.packed ?? 0;
  const dispatchedCount = counts?.dispatchedToday ?? 0;

  const steps = [
    {
      id: "awaiting_pick" as const,
      label: "To Pick",
      count: toPickCount,
      icon: ListOrdered,
      status: "pending",
      isActive: activeTab === "awaiting_pick",
    },
    {
      id: "picking" as const,
      label: "Picking",
      count: pickingCount,
      icon: RefreshCw,
      status: "in_progress",
      isActive: activeTab === "picking",
    },
    {
      id: "packing" as const,
      label: "To Pack",
      count: toPackCount,
      icon: Package,
      status: "pending",
      isActive: activeTab === "packing",
    },
    {
      id: "packed",
      label: "Packed",
      count: packedCount,
      icon: Check,
      status: "done",
      isActive: false,
    },
    {
      id: "ready_to_ship" as const,
      label: "Ready to Dispatch",
      count: readyToDispatchCount,
      icon: CheckCircle2,
      status: "ready",
      isActive: activeTab === "ready_to_ship",
    },
    {
      id: "dispatched",
      label: "Dispatched",
      count: dispatchedCount,
      icon: Send,
      status: "done",
      isActive: false,
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
      <div className="flex items-center justify-between pb-3 text-xs">
        <span className="font-semibold text-foreground">Order flow</span>
        <span className="text-muted-foreground">{warehouseName ? `${warehouseName} · ` : ""}Dispatched = today (UTC)</span>
      </div>

      <div className="flex items-center justify-between gap-1 overflow-x-auto pt-1">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isBlueActive = step.id === "picking" || step.isActive;
          const isDone = step.status === "done" || step.status === "ready";

          return (
            <div key={step.label} className="flex flex-1 items-center min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (step.id === "awaiting_pick" || step.id === "picking" || step.id === "packing" || step.id === "ready_to_ship") {
                    onSelectTab(step.id);
                  }
                }}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors shrink-0",
                  isBlueActive
                    ? "bg-blue-50 text-blue-700 font-semibold dark:bg-blue-950/40 dark:text-blue-300 ring-1 ring-blue-500/20"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                    isBlueActive
                      ? "bg-blue-600 text-white"
                      : isDone
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="font-mono font-bold text-foreground">
                  {formatNumber(step.count)}
                </span>
                <span className="truncate">{step.label}</span>
              </button>

              {idx < steps.length - 1 && (
                <div className="mx-2 h-px flex-1 bg-border/80 min-w-4" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
