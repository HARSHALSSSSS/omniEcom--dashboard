import { useEffect, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BatchHandoverResponse, QueueRow } from "@/types/fulfillment";
import { NO_SHIPPING_WRITE_REASON, NO_WRITE_REASON, handoverBlock, pickListBlock } from "./fulfillmentFormat";

const BUTTON =
  "h-[30px] rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

interface FulfillmentBulkBarProps {
  rows: QueueRow[];
  canWrite: boolean;
  canShip: boolean;
  busy: boolean;
  max: number;
  onPickList: () => void;
  onHandover: () => void;
  onClear: () => void;
}

/** the toolbar over the table while orders are selected */
export function FulfillmentBulkBar({ rows, canWrite, canShip, busy, max, onPickList, onHandover, onClear }: FulfillmentBulkBarProps) {
  const pickBlock = !canWrite ? NO_WRITE_REASON : pickListBlock(rows);
  const shipBlock = !canShip ? NO_SHIPPING_WRITE_REASON : handoverBlock(rows);
  return (
    <div role="toolbar" aria-label="Bulk actions" className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3">
      <span className="min-w-[130px] text-xs font-semibold" aria-live="polite">
        {rows.length} {rows.length === 1 ? "order" : "orders"} selected
      </span>
      <button type="button" className={BUTTON} disabled={busy || pickBlock !== null} title={pickBlock ?? undefined} onClick={onPickList}>
        Create picking batch
      </button>
      <button type="button" className={BUTTON} disabled={busy || shipBlock !== null} title={shipBlock ?? undefined} onClick={onHandover}>
        Hand over to carrier
      </button>
      <span className="text-[11px] text-muted-foreground">Up to {max} orders at a time</span>
      <button type="button" onClick={onClear} aria-label="Clear selection" title="Clear selection" className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

interface HandoverDialogProps {
  open: boolean;
  rows: QueueRow[];
  busy: boolean;
  error: string | null;
  onConfirm: (carrier: string) => void;
  onClose: () => void;
}

/** the carrier of the manifest; orders booked with another carrier are reported per order, the rest still go */
export function HandoverDialog({ open, rows, busy, error, onConfirm, onClose }: HandoverDialogProps) {
  const carriers = [...new Set(rows.map((r) => r.carrier).filter((c): c is string => Boolean(c)))];
  const [carrier, setCarrier] = useState("");
  const carriersKey = carriers.join("|");
  useEffect(() => {
    if (open) setCarrier(carriersKey && !carriersKey.includes("|") ? carriersKey : "");
  }, [open, carriersKey]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hand over to carrier</DialogTitle>
          <DialogDescription>
            Create and dispatch a manifest for {rows.length} {rows.length === 1 ? "order" : "orders"}. Orders booked with another carrier are skipped.
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-1 text-xs">
          <span className="font-semibold text-foreground">Carrier</span>
          <select aria-label="Carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs">
            <option value="">Choose a carrier</option>
            {carriers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="text-xs text-rose-700">
            {error}
          </p>
        )}
        <DialogFooter className="mt-2 gap-2">
          <Button variant="outline" size="sm" className="text-xs" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" className="text-xs" disabled={!carrier || busy} onClick={() => onConfirm(carrier)}>
            {busy ? "Handing over..." : "Hand over"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface HandoverResultsDialogProps {
  response: BatchHandoverResponse | null;
  onClose: () => void;
}

/** the batch answers 200 with a result per order: partial success is shown order by order */
export function HandoverResultsDialog({ response, onClose }: HandoverResultsDialogProps) {
  return (
    <Dialog open={response !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {response && (
          <>
            <DialogHeader>
              <DialogTitle>Hand-over results</DialogTitle>
              <DialogDescription>
                {response.summary.handedOver} of {response.summary.requested} handed over to {response.carrier}
                {response.summary.failed ? `, ${response.summary.failed} failed` : ""}.
                {response.manifests.length > 0 && ` Manifests: ${response.manifests.map((m) => m.number).join(", ")}.`}
              </DialogDescription>
            </DialogHeader>
            <ul className="mt-2 max-h-[320px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {response.results.map((r) => (
                <li key={r.orderId} className="flex items-start gap-2 px-3 py-2">
                  {r.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Succeeded" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-label="Did not succeed" />
                  )}
                  <div className="min-w-0 text-xs">
                    <p className="font-mono font-semibold text-foreground">{r.orderNumber ?? r.orderId}</p>
                    <p className="text-muted-foreground">{r.ok ? "Handed over" : (r.error?.message ?? "Failed")}</p>
                  </div>
                </li>
              ))}
            </ul>
            <DialogFooter className="mt-4">
              <Button size="sm" className="text-xs" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
