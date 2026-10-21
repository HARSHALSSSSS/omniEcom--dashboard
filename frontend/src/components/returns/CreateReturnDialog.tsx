import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateReturn, useFindEligibleOrder, useReturnReasons } from "@/hooks/useReturns";
import type { ReturnOrder } from "@/types/returns";
import { formatMoney, writeErrorMessage } from "./returnFormat";

interface CreateReturnDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (created: ReturnOrder) => void;
}

/** a seller-created return: find the order by number, pick the units and the reason (no refund is issued by creating it) */
export function CreateReturnDialog({ open, onClose, onCreated }: CreateReturnDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <CreateReturnForm onClose={onClose} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}

/** mounted only while the dialog is open, so every opening starts empty */
function CreateReturnForm({ onClose, onCreated }: Omit<CreateReturnDialogProps, "open">) {
  const find = useFindEligibleOrder();
  const create = useCreateReturn();
  const { data: reasons = [] } = useReturnReasons(true);
  const [orderNumber, setOrderNumber] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reasonCode, setReasonCode] = useState("other");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const eligible = find.data;
  const sellerReasons = reasons.filter((r) => r.sources.includes("seller"));
  const picked = (eligible?.items ?? []).map((i) => ({ orderItemId: i.orderItemId, quantity: Math.floor(Number(quantities[i.orderItemId] ?? 0)), max: i.availableQty }));
  const chosen = picked.filter((p) => p.quantity > 0);
  const tooMany = picked.some((p) => p.quantity > p.max || p.quantity < 0 || Number.isNaN(p.quantity));
  const busy = find.isPending || create.isPending;

  const lookup = () => {
    setError(null);
    setQuantities({});
    find.mutate(orderNumber.trim(), { onError: (e) => setError(writeErrorMessage(e)) });
  };

  const submit = () => {
    if (!eligible) return;
    setError(null);
    create.mutate(
      { orderId: eligible.order.id, reasonCode, reasonText: text.trim() || undefined, items: chosen.map((c) => ({ orderItemId: c.orderItemId, quantity: c.quantity })) },
      { onSuccess: (created) => onCreated(created), onError: (e) => setError(writeErrorMessage(e)) },
    );
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>Create a return</DialogTitle>
          <DialogDescription>Find the order and choose the units that are coming back. Creating a return does not issue a refund.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (orderNumber.trim()) lookup();
            }}
          >
            <label className="block flex-1 space-y-1">
              <span className="font-semibold text-foreground">Order number</span>
              <Input aria-label="Order number" value={orderNumber} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOrderNumber(e.target.value)} placeholder="#1042 or the marketplace order id" className="text-xs" />
            </label>
            <Button type="submit" variant="outline" size="sm" className="h-9 text-xs" disabled={!orderNumber.trim() || busy}>
              {find.isPending ? "Finding..." : "Find order"}
            </Button>
          </form>

          {eligible && (
            <>
              <p className="text-muted-foreground">
                Order {eligible.order.number} · {eligible.order.channel.name} · {formatMoney(eligible.order.totalMinor, eligible.order.currency)}
                {eligible.order.customer?.name ? ` · ${eligible.order.customer.name}` : ""}
              </p>
              <fieldset className="space-y-2">
                <legend className="font-semibold text-foreground">Units to return</legend>
                {eligible.items.map((i) => (
                  <div key={i.orderItemId} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-foreground">{i.title}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {i.sku ?? "No SKU"} · {i.availableQty} of {i.fulfilledQty} can still be returned
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={i.availableQty}
                      aria-label={`Units to return for ${i.sku ?? i.title}`}
                      value={quantities[i.orderItemId] ?? ""}
                      disabled={i.availableQty === 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuantities((q) => ({ ...q, [i.orderItemId]: e.target.value }))}
                      className="h-8 w-20 text-xs"
                    />
                  </div>
                ))}
              </fieldset>
              <label className="block space-y-1">
                <span className="font-semibold text-foreground">Reason</span>
                <select aria-label="Return reason" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs">
                  {sellerReasons.length === 0 && <option value="other">Other</option>}
                  {sellerReasons.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-foreground">Details (optional)</span>
                <Textarea aria-label="Return details" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} className="text-xs" />
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="text-rose-700">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="mt-2 gap-2">
          <Button variant="outline" size="sm" className="text-xs" disabled={busy} onClick={onClose}>
            Close
          </Button>
          <Button size="sm" className="text-xs" disabled={!eligible || chosen.length === 0 || tooMany || busy} onClick={submit}>
            {create.isPending ? "Creating..." : "Create return"}
          </Button>
        </DialogFooter>
    </>
  );
}
