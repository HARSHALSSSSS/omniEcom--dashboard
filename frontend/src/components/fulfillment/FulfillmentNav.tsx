import { useMemo } from "react";
import { cn } from "@/utils/cn";
import { formatInZone, formatNumber } from "@/utils/format";
import { FULFILLMENT_TABS, type FulfillmentTab, type QueueCounts } from "@/types/fulfillment";
import { TAB_LABELS } from "./fulfillmentParams";
import { CheckCircle2, ChevronLeft, ChevronRight, Package, Send } from "lucide-react";

const COUNT_OF: Record<FulfillmentTab, (c: QueueCounts) => number> = {
  all: (c) => c.all,
  awaiting_pick: (c) => c.awaiting_pick,
  picking: (c) => c.picking,
  packing: (c) => c.packing,
  ready_to_ship: (c) => c.ready_to_ship,
  exceptions: (c) => c.exceptions,
};

interface FulfillmentTabsProps {
  active: FulfillmentTab;
  counts: QueueCounts | undefined;
  onChange: (tab: FulfillmentTab) => void;
  updatedAt?: number;
}

/** the warehouse stages; the counts come from the queue itself, so a tab never shows a different number than its list */
export function FulfillmentTabs({ active, counts, onChange, updatedAt }: FulfillmentTabsProps) {
  // Aggregate counts for Figma primary modes
  const pickTotal = counts ? counts.awaiting_pick + counts.picking : 0;
  const packTotal = counts?.packing ?? 0;
  const dispatchTotal = counts?.ready_to_ship ?? 0;

  const isPickActive = active === "all" || active === "awaiting_pick" || active === "picking";
  const isPackActive = active === "packing";
  const isDispatchActive = active === "ready_to_ship";

  const updatedLabel = useMemo(() => {
    const ts = updatedAt && updatedAt > 0 ? updatedAt : Date.now();
    return formatInZone(new Date(ts).toISOString(), { hour: "numeric", minute: "2-digit", hour12: true });
  }, [updatedAt]);

  return (
    <div className="space-y-3">
      {/* 1. Top Mode Switcher matching Figma Screen 1 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-1">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => onChange("picking")}
            className={cn(
              "-mb-[5px] flex items-center gap-2 border-b-2 pb-2 text-xs font-semibold transition-colors",
              isPickActive
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Pick</span>
            <span className="font-mono text-xs opacity-90">{formatNumber(pickTotal)}</span>
          </button>

          <button
            type="button"
            onClick={() => onChange("packing")}
            className={cn(
              "-mb-[5px] flex items-center gap-2 border-b-2 pb-2 text-xs font-semibold transition-colors",
              isPackActive
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Package className="h-4 w-4" />
            <span>Pack</span>
            <span className="font-mono text-xs opacity-90">{formatNumber(packTotal)}</span>
          </button>

          <button
            type="button"
            onClick={() => onChange("ready_to_ship")}
            className={cn(
              "-mb-[5px] flex items-center gap-2 border-b-2 pb-2 text-xs font-semibold transition-colors",
              isDispatchActive
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Send className="h-4 w-4" />
            <span>Dispatch</span>
            <span className="font-mono text-xs opacity-90">{formatNumber(dispatchTotal)}</span>
          </button>
        </div>

        {/* Live floor telemetry badge */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span>Live floor · Updated {updatedLabel}</span>
        </div>
      </div>

      {/* 2. Detailed Stage Tabs (Accessible role="tablist", visually sr-only to match Figma Clean UI) */}
      <div
        role="tablist"
        aria-label="Fulfillment stage"
        className="sr-only"
      >
        {FULFILLMENT_TABS.map((tab) => {
          const selected = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                selected
                  ? "bg-neutral-900 text-white font-semibold dark:bg-white dark:text-neutral-900"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {TAB_LABELS[tab]}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 font-mono text-[10px]",
                  selected
                    ? "bg-white/20 text-white dark:bg-black/20 dark:text-black"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {counts ? formatNumber(COUNT_OF[tab](counts)) : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface FulfillmentPaginationProps {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  shown: number;
  noun: string;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

export function FulfillmentPagination({
  page,
  pages,
  total,
  pageSize,
  shown,
  noun,
  onPage,
  onPageSize: _onPageSize,
}: FulfillmentPaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-xs text-muted-foreground">
      <span>
        Showing {shown} of {formatNumber(total)} {noun}
      </span>

      <div className="flex items-center gap-3">
        <span className="font-mono">
          {from}-{to} / {formatNumber(total)}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
            className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background hover:bg-muted disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
