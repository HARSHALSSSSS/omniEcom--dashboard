import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import type { FulfillmentAction, QueueRow } from "@/types/fulfillment";
import { NO_WRITE_REASON, runsFromRow, titleCase } from "./fulfillmentFormat";
import { SlaChip } from "./fulfillmentUi";
import { ChevronRight } from "lucide-react";

/** the primary button of a row: what the API says comes next */
const ROW_LABEL: Record<FulfillmentAction, string> = {
  start: "Start picking",
  pick_all: "Pick",
  pack: "Pack",
  ready: "Create label",
  handover: "Hand over",
  exception: "Open",
};

const COLUMNS = [
  "Order",
  "Marketplace",
  "Items",
  "Location",
  "Picker",
  "Priority",
  "SLA",
  "Status",
];

interface QueueTableProps {
  rows: QueueRow[];
  selected: ReadonlySet<string>;
  canWrite: boolean;
  refreshing: boolean;
  busyId: string | null;
  onToggle: (fulfillmentId: string) => void;
  onToggleAll: () => void;
  onOpen: (orderId: string) => void;
  onAct: (row: QueueRow) => void;
}

export function QueueTable({
  rows,
  selected,
  canWrite,
  refreshing,
  busyId,
  onToggle,
  onToggleAll,
  onOpen,
  onAct,
}: QueueTableProps) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.fulfillmentId));

  const priorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
      case "high":
        return (
          <span className="font-semibold text-amber-700 dark:text-amber-400 capitalize">
            {priority === "urgent" ? "Urgent" : "High"}
          </span>
        );
      case "medium":
        return <span className="font-semibold text-amber-600 dark:text-amber-500 capitalize">Medium</span>;
      default:
        return <span className="font-medium text-muted-foreground capitalize">{priority || "Normal"}</span>;
    }
  };

  const statusPill = (status: string, stageLabel?: string | null, onHold?: boolean) => {
    if (onHold) {
      return (
        <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          On hold
        </span>
      );
    }
    const isPicking = status === "picking" || stageLabel === "Picking";
    const isReady = status === "ready_to_ship" || status === "confirmed" || stageLabel === "Ready to ship" || stageLabel === "Awaiting pick";

    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-medium",
          isPicking ? "text-blue-600 dark:text-blue-400" : isReady ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isPicking ? "bg-blue-600" : isReady ? "bg-emerald-600" : "bg-muted-foreground"
          )}
        />
        {stageLabel ?? titleCase(status)}
      </span>
    );
  };

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-border bg-card shadow-2xs transition-opacity",
        refreshing && "opacity-60"
      )}
      aria-busy={refreshing}
    >
      <table className="w-full min-w-[1040px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 font-semibold uppercase text-muted-foreground text-[10px] tracking-wider">
          <tr>
            <th className="w-10 py-3 pl-4 pr-2">
              <input
                type="checkbox"
                aria-label="Select all orders on this page"
                checked={allSelected}
                disabled={!canWrite}
                title={canWrite ? undefined : NO_WRITE_REASON}
                onChange={onToggleAll}
                className="h-4 w-4 cursor-pointer rounded border-border accent-[#1D4ED8] disabled:cursor-not-allowed"
              />
            </th>
            {COLUMNS.map((c) => (
              <th key={c} scope="col" className="px-3 py-3">
                {c}
              </th>
            ))}
            <th scope="col" className="py-3 pl-3 pr-4 text-right">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const shown = r.items.slice(0, 2);
            const action = r.nextAction;
            const direct = runsFromRow(action);
            const isPicking = r.stage === "picking" || r.status === "picking";

            return (
              <tr key={r.fulfillmentId} className="group transition-colors hover:bg-muted/20">
                <td className="relative py-3.5 pl-4 pr-2 align-middle">
                  {/* Left accent line indicator for active/picking orders */}
                  {isPicking && (
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-600 rounded-r" />
                  )}
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.orderNumber}`}
                    checked={selected.has(r.fulfillmentId)}
                    disabled={!canWrite}
                    title={canWrite ? undefined : NO_WRITE_REASON}
                    onChange={() => onToggle(r.fulfillmentId)}
                    className="h-4 w-4 cursor-pointer rounded border-border accent-[#1D4ED8] disabled:cursor-not-allowed"
                  />
                </td>

                {/* 1. Order Number */}
                <td className="px-3 py-3.5 align-middle">
                  <button
                    type="button"
                    onClick={() => onOpen(r.orderId)}
                    className="font-mono text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {r.orderNumber}
                  </button>
                  <span className="sr-only">{r.number}</span>
                </td>

                {/* 2. Marketplace */}
                <td className="px-3 py-3.5 align-middle">
                  <span className="font-medium text-foreground">
                    {r.channel.name.replace(/ India| US| UK/i, "")}
                  </span>
                </td>

                {/* 3. Items & bins */}
                <td className="px-3 py-3.5 align-middle">
                  <div className="flex flex-col">
                    <span className="font-semibold text-foreground">
                      {r.unitCount || r.itemCount} {r.unitCount === 1 ? "item" : "items"}
                    </span>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {shown.map((i, idx) => (
                        <span key={i.sku}>
                          {idx > 0 ? " · " : ""}
                          <span className="font-mono">{i.sku}</span>
                          {i.bin ? ` · Bin ${i.bin}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                </td>

                {/* 4. Location */}
                <td className="px-3 py-3.5 align-middle">
                  <span className="font-medium text-foreground">
                    {r.warehouse.name}
                  </span>
                </td>

                {/* 5. Picker */}
                <td className="px-3 py-3.5 align-middle">
                  <span className="text-foreground">
                    {r.pickList
                      ? `${r.pickList.number} · ${r.assignee?.name ?? "Unassigned"}`
                      : r.assignee?.name ?? "Unassigned"}
                  </span>
                  {r.openExceptions > 0 && (
                    <span className="ml-2 inline-block rounded-full bg-amber-100 px-1.5 py-0.2 font-semibold text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      {r.openExceptions} open
                    </span>
                  )}
                </td>

                {/* 6. Priority */}
                <td className="px-3 py-3.5 align-middle">
                  {priorityBadge(r.priority)}
                </td>

                {/* 7. SLA */}
                <td className="px-3 py-3.5 align-middle">
                  <SlaChip sla={r.sla} />
                </td>

                {/* 8. Status */}
                <td className="px-3 py-3.5 align-middle">
                  {statusPill(r.status, r.stageLabel, r.onHold)}
                </td>

                {/* 9. Action */}
                <td className="py-3.5 pl-3 pr-4 text-right align-middle">
                  {action === null ? (
                    <button
                      type="button"
                      onClick={() => onOpen(r.orderId)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      Continue
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  ) : (
                    <Button
                      size="sm"
                      className="h-7 text-xs font-semibold gap-1"
                      variant={direct ? "default" : "outline"}
                      disabled={busyId === r.fulfillmentId || (direct && !canWrite)}
                      title={direct && !canWrite ? NO_WRITE_REASON : undefined}
                      aria-label={ROW_LABEL[action]}
                      onClick={() => (direct ? onAct(r) : onOpen(r.orderId))}
                    >
                      {busyId === r.fulfillmentId ? "Working..." : ROW_LABEL[action]}
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
