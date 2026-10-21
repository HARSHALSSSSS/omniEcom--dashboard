import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { formatDuration } from "@/utils/format";
import type { ExceptionRow, ResolveAction, ResolveInput } from "@/types/fulfillment";
import { EXCEPTION_STATUS_LABELS } from "./fulfillmentParams";
import { NO_WRITE_REASON } from "./fulfillmentFormat";

const noteOf = (details: Record<string, unknown>): string | null => (typeof details.note === "string" && details.note ? details.note : null);

interface ExceptionsTableProps {
  rows: ExceptionRow[];
  canWrite: boolean;
  refreshing: boolean;
  onOpen: (orderId: string) => void;
  onResolve: (row: ExceptionRow, status: "resolved" | "dismissed") => void;
}

export function ExceptionsTable({ rows, canWrite, refreshing, onOpen, onResolve }: ExceptionsTableProps) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity", refreshing && "opacity-60")} aria-busy={refreshing}>
      <table className="w-full min-w-[860px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
          <tr>
            {["Exception", "Order", "Warehouse", "Raised by", "Open for", "Status"].map((c) => (
              <th key={c} scope="col" className="px-3 py-3 first:pl-4">
                {c}
              </th>
            ))}
            <th scope="col" className="py-3 pl-3 pr-4 text-right">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((x) => (
            <tr key={x.id} className="hover:bg-muted/20">
              <td className="py-3 pl-4 pr-3 align-top">
                <p className="font-semibold">{x.kindLabel}</p>
                {noteOf(x.details) && <p className="max-w-[240px] text-[11px] text-muted-foreground">{noteOf(x.details)}</p>}
              </td>
              <td className="px-3 py-3 align-top">
                <button type="button" onClick={() => onOpen(x.orderId)} className="font-mono font-semibold text-primary hover:underline">
                  {x.orderNumber}
                </button>
                <p className="text-[11px] text-muted-foreground">{x.fulfillment.number}</p>
              </td>
              <td className="px-3 py-3 align-top">{x.warehouse.code}</td>
              <td className="px-3 py-3 align-top">{x.raisedBy?.name ?? "System"}</td>
              <td className="px-3 py-3 align-top">{formatDuration(x.ageMinutes)}</td>
              <td className="px-3 py-3 align-top">
                {EXCEPTION_STATUS_LABELS[x.status]}
                {x.resolution?.note && <p className="max-w-[200px] text-[11px] text-muted-foreground">{x.resolution.note}</p>}
              </td>
              <td className="py-3 pl-3 pr-4 text-right align-top">
                {x.status === "open" && (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!canWrite} title={canWrite ? undefined : NO_WRITE_REASON} onClick={() => onResolve(x, "dismissed")}>
                      Dismiss
                    </Button>
                    <Button size="sm" className="h-7 text-xs" disabled={!canWrite} title={canWrite ? undefined : NO_WRITE_REASON} onClick={() => onResolve(x, "resolved")}>
                      Resolve
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ResolveExceptionDialogProps {
  target: { row: ExceptionRow; status: "resolved" | "dismissed" } | null;
  busy: boolean;
  error: string | null;
  onConfirm: (input: Omit<ResolveInput, "id">) => void;
  onClose: () => void;
}

const FOLLOW_UP: ReadonlyArray<{ value: ResolveAction; label: string }> = [
  { value: "none", label: "Just acknowledge it" },
  { value: "hold", label: "Park the fulfillment (hold)" },
  { value: "cancel_fulfillment", label: "Cancel the fulfillment" },
];

/** resolving can also park or cancel the fulfillment; dismissing only closes the exception */
export function ResolveExceptionDialog({ target, busy, error, onConfirm, onClose }: ResolveExceptionDialogProps) {
  const [note, setNote] = useState("");
  const [action, setAction] = useState<ResolveAction>("none");
  useEffect(() => {
    if (target) {
      setNote("");
      setAction("none");
    }
  }, [target]);
  const resolving = target?.status === "resolved";
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{resolving ? "Resolve exception" : "Dismiss exception"}</DialogTitle>
          <DialogDescription>
            {target?.row.kindLabel} on {target?.row.orderNumber} ({target?.row.fulfillment.number}).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <label className="block space-y-1">
            <span className="font-semibold text-foreground">Note (optional)</span>
            <textarea aria-label="Note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-card p-2 text-xs" />
          </label>
          {resolving && (
            <label className="block space-y-1">
              <span className="font-semibold text-foreground">Follow-up</span>
              <select aria-label="Follow-up" value={action} onChange={(e) => setAction(e.target.value as ResolveAction)} className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs">
                {FOLLOW_UP.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && (
            <p role="alert" className="text-rose-700">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="mt-2 gap-2">
          <Button variant="outline" size="sm" className="text-xs" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" className="text-xs" disabled={busy} onClick={() => target && onConfirm({ status: target.status, note: note.trim() || undefined, action: resolving ? action : "none" })}>
            {busy ? "Saving..." : resolving ? "Resolve" : "Dismiss"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
