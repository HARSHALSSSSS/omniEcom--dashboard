import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { formatRelativeTime } from "@/utils/format";
import type { FulfillmentAction, QueueRow } from "@/types/fulfillment";
import { NO_WRITE_REASON, runsFromRow, titleCase } from "./fulfillmentFormat";
import { SlaChip } from "./fulfillmentUi";

/** the primary button of a row: what the API says comes next */
const ROW_LABEL: Record<FulfillmentAction, string> = {
  start: "Start picking",
  pick_all: "Pick",
  pack: "Pack",
  ready: "Create label",
  handover: "Hand over",
  exception: "Open",
};

const COLUMNS = ["Order", "SLA", "Items & bins", "Warehouse & picking", "Carrier & AWB", "Exceptions"];

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

export function QueueTable({ rows, selected, canWrite, refreshing, busyId, onToggle, onToggleAll, onOpen, onAct }: QueueTableProps) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.fulfillmentId));
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing}>
      <table className="w-full min-w-[1040px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
          <tr>
            <th className="w-10 py-3 pl-4 pr-2">
              <input
                type="checkbox"
                aria-label="Select all orders on this page"
                checked={allSelected}
                disabled={!canWrite}
                title={canWrite ? undefined : NO_WRITE_REASON}
                onChange={onToggleAll}
                className="h-4 w-4 cursor-pointer accent-[#1D4ED8] disabled:cursor-not-allowed"
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
            return (
              <tr key={r.fulfillmentId} className="hover:bg-muted/20">
                <td className="py-3 pl-4 pr-2 align-top">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.orderNumber}`}
                    checked={selected.has(r.fulfillmentId)}
                    disabled={!canWrite}
                    title={canWrite ? undefined : NO_WRITE_REASON}
                    onChange={() => onToggle(r.fulfillmentId)}
                    className="h-4 w-4 cursor-pointer accent-[#1D4ED8] disabled:cursor-not-allowed"
                  />
                </td>
                <td className="px-3 py-3 align-top">
                  <button type="button" onClick={() => onOpen(r.orderId)} className="font-mono text-xs font-semibold text-primary hover:underline">
                    {r.orderNumber}
                  </button>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {r.channel.name} · {r.number}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
                    <span className="rounded-full bg-muted px-1.5 py-0.5 font-semibold text-foreground">{r.onHold ? "On hold" : (r.stageLabel ?? titleCase(r.status))}</span>
                    {r.priority !== "normal" && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 font-semibold capitalize text-rose-700">{r.priority}</span>}
                  </p>
                </td>
                <td className="px-3 py-3 align-top">
                  <SlaChip sla={r.sla} />
                </td>
                <td className="px-3 py-3 align-top">
                  <ul className="space-y-0.5">
                    {shown.map((i) => (
                      <li key={i.sku}>
                        <span className="font-mono font-semibold">{i.sku}</span> × {i.quantity}
                        <span className="text-muted-foreground">{i.bin ? ` · Bin ${i.bin}${i.binSuggested ? " (suggested)" : ""}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                  {r.itemCount > shown.length && <p className="text-[11px] text-muted-foreground">+{r.itemCount - shown.length} more</p>}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {r.pickedUnits}/{r.unitCount} picked · {r.packedUnits} packed
                  </p>
                </td>
                <td className="px-3 py-3 align-top">
                  <p className="font-medium">{r.warehouse.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.pickList ? `${r.pickList.number}${r.assignee ? ` · ${r.assignee.name ?? "Assigned"}` : " · Unassigned"}` : "No pick list"}
                  </p>
                </td>
                <td className="px-3 py-3 align-top">
                  {r.carrier ? (
                    <>
                      <p className="font-medium">{r.carrier}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{r.awb ?? "No AWB yet"}</p>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not booked</span>
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  {r.openExceptions > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{r.openExceptions} open</span>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Placed {formatRelativeTime(r.placedAt)}</p>
                </td>
                <td className="py-3 pl-3 pr-4 text-right align-top">
                  {action === null ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpen(r.orderId)}>
                      Open
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      variant={direct ? "default" : "outline"}
                      disabled={busyId === r.fulfillmentId || (direct && !canWrite)}
                      title={direct && !canWrite ? NO_WRITE_REASON : undefined}
                      onClick={() => (direct ? onAct(r) : onOpen(r.orderId))}
                    >
                      {busyId === r.fulfillmentId ? "Working..." : ROW_LABEL[action]}
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
