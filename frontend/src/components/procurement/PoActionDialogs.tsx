import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useAcknowledgePurchaseOrder, useApprovePurchaseOrder, useCancelPurchaseOrder, useReceivePurchaseOrder } from "@/hooks/useProcurement";
import { formatCurrency, formatNumber } from "@/utils/format";
import type { PurchaseOrder } from "@/types/procurement";
import { dateOrDash, dayToIso, parseQty, todayDay } from "./procurementFormat";
import { Field, InlineError } from "./procurementUi";
import { VersionConflictDialog } from "./VersionConflictDialog";
import { isVersionConflict } from "./procurementErrors";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

interface BaseProps {
  order: PurchaseOrder | null;
  onClose: () => void;
}

/** a newer version exists: reload the order everywhere and close the dialog so the person sees the latest state */
function useConflict(onClose: () => void) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  return {
    open,
    show: () => setOpen(true),
    dialog: <VersionConflictDialog open={open} noun="purchase order" hasMyEdits={false} onReload={() => { void qc.invalidateQueries({ queryKey: ["procurement"] }); setOpen(false); onClose(); }} onClose={() => setOpen(false)} />,
  };
}

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ---------------------------------------------------------------- approve and acknowledge: both take an optional date

interface DateDialogProps extends BaseProps {
  mode: "approve" | "acknowledge";
}

/** Approve (administrators): draft to submitted, the units become incoming. Acknowledge: record the supplier's confirmation and date. */
export function DateActionDialog({ order, mode, onClose }: DateDialogProps) {
  return (
    <Dialog open={order !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">{order && <DateActionForm key={`${order.id}-${mode}`} order={order} mode={mode} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function DateActionForm({ order, mode, onClose }: { order: PurchaseOrder; mode: "approve" | "acknowledge"; onClose: () => void }) {
  const approve = useApprovePurchaseOrder();
  const acknowledge = useAcknowledgePurchaseOrder();
  const conflict = useConflict(onClose);
  const [day, setDay] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = approve.isPending || acknowledge.isPending;
  const approving = mode === "approve";

  const acquire = useSubmitLock();
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    const input = { id: order.id, version: order.version, expectedAt: day ? dayToIso(day) : undefined };
    const release = acquire();
    if (!release) return;
    try {
      const po = approving ? await approve.mutateAsync(input) : await acknowledge.mutateAsync(input);
      toast({
        title: approving ? "Purchase order approved" : "Supplier confirmation recorded",
        description: approving ? `${po.poNumber} is submitted. ${formatNumber(po.unitsOrdered)} units are now incoming at ${po.warehouseName}.` : `${po.poNumber} is confirmed${po.expectedAt ? `, expected ${dateOrDash(po.expectedAt)}` : ""}.`,
        variant: "success",
      });
      onClose();
    } catch (e) {
      if (isVersionConflict(e)) conflict.show();
      else setError(errorMessage(e, approving ? "Could not approve the purchase order." : "Could not record the confirmation."));
    } finally {
      release();
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{approving ? `Approve ${order.poNumber}` : `Supplier confirmed ${order.poNumber}`}</DialogTitle>
        <DialogDescription>
          {approving
            ? `Approving submits the order to ${order.supplierName}. The ${formatNumber(order.unitsOrdered)} ordered units become incoming stock at ${order.warehouseName}.`
            : `Record that ${order.supplierName} accepted the order, with the delivery date they promised.`}
        </DialogDescription>
      </DialogHeader>
      <div className="flex justify-between rounded-lg border border-border bg-muted/20 p-3 text-xs">
        <span>Order total (with GST)</span>
        <span className="font-mono font-bold">{formatCurrency(order.totalMinor, order.currency)}</span>
      </div>
      {error && <InlineError message={error} />}
      <Field id="date-action-day" label={approving ? "Expected delivery" : "Date the supplier promised"} hint={approving ? (order.expectedAt ? `Currently ${dateOrDash(order.expectedAt)}. Leave empty to keep it.` : "Optional. Left empty it is set from the longest supplier lead time.") : "Optional. Left empty the current expected date stays."}>
        <Input id="date-action-day" type="date" min={todayDay()} value={day} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDay(e.target.value)} className="text-xs" />
      </Field>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={pending}>
          {approving ? "Approve and submit" : "Record confirmation"}
        </Button>
      </DialogFooter>
      {conflict.dialog}
    </form>
  );
}

// ---------------------------------------------------------------- cancel

export function CancelOrderDialog({ order, onClose }: BaseProps) {
  return (
    <Dialog open={order !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">{order && <CancelForm key={order.id} order={order} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function CancelForm({ order, onClose }: { order: PurchaseOrder; onClose: () => void }) {
  const cancel = useCancelPurchaseOrder();
  const conflict = useConflict(onClose);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const tooShort = reason !== "" && trimmed.length < 3;
  const received = order.unitsReceived + order.unitsDamaged > 0;

  const acquire = useSubmitLock();
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (trimmed.length < 3) return;
    setError(null);
    const release = acquire();
    if (!release) return;
    try {
      const res = await cancel.mutateAsync({ id: order.id, reason: trimmed, version: order.version });
      toast({ title: "Purchase order cancelled", description: res.releasedUnits > 0 ? `${res.purchaseOrder.poNumber}: ${formatNumber(res.releasedUnits)} units are no longer expected.` : `${res.purchaseOrder.poNumber} was cancelled.`, variant: "success" });
      onClose();
    } catch (e) {
      if (isVersionConflict(e)) conflict.show();
      else setError(errorMessage(e, "Could not cancel the purchase order."));
    } finally {
      release();
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Cancel {order.poNumber}?</DialogTitle>
        <DialogDescription>
          {order.status === "draft"
            ? "The draft is cancelled; no stock was ever expected for it."
            : `Units that never arrived stop being incoming at ${order.warehouseName}.${received ? " Units already received stay in stock." : ""}`}
        </DialogDescription>
      </DialogHeader>
      {error && <InlineError message={error} />}
      <Field id="cancel-reason" label="Reason" required error={tooShort ? "Give a reason of at least 3 characters" : null} hint="Kept on the order's history">
        <Textarea id="cancel-reason" rows={3} maxLength={500} value={reason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)} error={tooShort} className="text-xs" />
      </Field>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" size="sm" disabled={cancel.isPending} onClick={onClose}>
          Keep order
        </Button>
        <Button type="submit" variant="destructive" size="sm" loading={cancel.isPending} disabled={trimmed.length < 3}>
          Cancel order
        </Button>
      </DialogFooter>
      {conflict.dialog}
    </form>
  );
}

// ---------------------------------------------------------------- receive stock

export function ReceiveDialog({ order, onClose }: BaseProps) {
  return (
    <Dialog open={order !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">{order && <ReceiveForm key={order.id} order={order} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function ReceiveForm({ order, onClose }: { order: PurchaseOrder; onClose: () => void }) {
  const receive = useReceivePurchaseOrder();
  const conflict = useConflict(onClose);
  const open = order.lines.filter((l) => l.quantityOutstanding > 0);
  const [got, setGot] = useState<Record<string, string>>({});
  const [bad, setBad] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // one key per dialog: a retry after a network blip never moves the stock twice
  const key = useMemo(() => `receive-ui-${newKey()}`, []);

  const rows = open.map((l) => {
    const g = got[l.id] ?? "";
    const d = bad[l.id] ?? "";
    const received = g.trim() === "" ? 0 : parseQty(g);
    const damaged = d.trim() === "" ? 0 : parseQty(d);
    let problem: string | null = null;
    if (received === null) problem = "Whole units only";
    else if (damaged === null) problem = "Whole units only";
    else if (received > l.quantityOutstanding) problem = `Only ${formatNumber(l.quantityOutstanding)} are still expected`;
    else if (damaged > received) problem = "Damaged units are part of the received units";
    return { line: l, received: received ?? 0, damaged: damaged ?? 0, problem };
  });
  const totalReceived = rows.reduce((s, r) => s + (r.problem ? 0 : r.received), 0);
  const totalDamaged = rows.reduce((s, r) => s + (r.problem ? 0 : r.damaged), 0);
  const invalid = rows.some((r) => r.problem);
  const ready = totalReceived > 0 && !invalid;

  const receiveAll = () => {
    setGot(Object.fromEntries(open.map((l) => [l.id, String(l.quantityOutstanding)])));
    setBad({});
  };

  const acquire = useSubmitLock();
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!ready) return;
    setError(null);
    const release = acquire();
    if (!release) return;
    try {
      const res = await receive.mutateAsync({
        id: order.id,
        receiptKey: key,
        body: { items: rows.filter((r) => r.received > 0).map((r) => ({ lineId: r.line.id, receivedQuantity: r.received, damagedQuantity: r.damaged > 0 ? r.damaged : undefined })), note: note.trim() || undefined, version: order.version },
      });
      const po = res.purchaseOrder;
      toast({
        title: res.duplicate ? "Receipt already recorded" : po.status === "received" ? "Purchase order fully received" : "Stock received",
        description: res.duplicate
          ? `${po.poNumber}: this receipt was already saved, no stock moved twice.`
          : `${po.poNumber}: ${formatNumber(totalReceived - totalDamaged)} good${totalDamaged ? ` and ${formatNumber(totalDamaged)} damaged` : ""} units added to ${po.warehouseName}. ${po.unitsOutstanding > 0 ? `${formatNumber(po.unitsOutstanding)} still expected.` : ""}`.trim(),
        variant: "success",
      });
      onClose();
    } catch (e) {
      if (isVersionConflict(e)) conflict.show();
      else setError(errorMessage(e, "Could not record the receipt."));
    } finally {
      release();
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Receive stock for {order.poNumber}</DialogTitle>
        <DialogDescription>
          Enter what arrived now at {order.warehouseName}. Good units go on hand, damaged units to the damaged bucket. You can receive an order in several parts.
        </DialogDescription>
      </DialogHeader>
      {error && <InlineError message={error} />}
      {open.length === 0 ? (
        <p className="text-xs text-muted-foreground">Every line has been received.</p>
      ) : (
        <>
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" className="text-xs" onClick={receiveAll}>
              Everything arrived
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[520px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] text-muted-foreground">
                  <th scope="col" className="px-3 py-2">Product</th>
                  <th scope="col" className="px-3 py-2 text-right">Still expected</th>
                  <th scope="col" className="w-28 px-3 py-2">Received now</th>
                  <th scope="col" className="w-28 px-3 py-2">Of which damaged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ line: l, problem }) => (
                  <tr key={l.id} className="align-top">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-foreground">{l.title}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{l.sku}</p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(l.quantityOutstanding)} <span className="text-muted-foreground">of {formatNumber(l.quantityOrdered)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Input aria-label={`Received now for ${l.sku}`} inputMode="numeric" value={got[l.id] ?? ""} placeholder="0" error={Boolean(problem)} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGot((g) => ({ ...g, [l.id]: e.target.value }))} className="h-8 text-xs" autoComplete="off" />
                      {problem && <p role="alert" className="mt-0.5 text-[11px] text-red-700">{problem}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <Input aria-label={`Damaged for ${l.sku}`} inputMode="numeric" value={bad[l.id] ?? ""} placeholder="0" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBad((g) => ({ ...g, [l.id]: e.target.value }))} className="h-8 text-xs" autoComplete="off" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ready && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {formatNumber(totalReceived - totalDamaged)} good{totalDamaged > 0 ? ` and ${formatNumber(totalDamaged)} damaged` : ""} units will be added to stock.
            </p>
          )}
        </>
      )}
      <Field id="receive-note" label="Note (optional)" hint="For example the delivery challan number">
        <Input id="receive-note" value={note} maxLength={1000} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)} className="text-xs" />
      </Field>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" size="sm" disabled={receive.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={receive.isPending} disabled={!ready}>
          Record receipt
        </Button>
      </DialogFooter>
      {conflict.dialog}
    </form>
  );
}
