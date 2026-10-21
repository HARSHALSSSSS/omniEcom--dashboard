import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCancellationReasons } from "@/hooks/useOrders";

interface CancelOrderDialogProps {
  open: boolean;
  /** "order ORD-1" for one order, or "3 orders" */
  subject: string;
  busy: boolean;
  error: string | null;
  onConfirm: (input: { reason: string; reasonCode: string }) => void;
  onClose: () => void;
}

/** the reason is asked for before an order is cancelled (single or bulk): it is stored with the cancellation and sent to the marketplace */
export function CancelOrderDialog({ open, subject, busy, error, onConfirm, onClose }: CancelOrderDialogProps) {
  const { data: reasons = [] } = useCancellationReasons(open);
  const [code, setCode] = useState("other");
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) {
      setCode("other");
      setText("");
    }
  }, [open]);

  const sellerReasons = reasons.filter((r) => r.initiators.includes("seller"));
  const valid = text.trim().length >= 2;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel {subject}?</DialogTitle>
          <DialogDescription>Held stock is released and the marketplace is told where it supports cancellation. A cancelled order cannot be reopened.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <label className="block space-y-1">
            <span className="font-semibold text-foreground">Reason</span>
            <select
              aria-label="Cancellation reason"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs"
            >
              {sellerReasons.length === 0 && <option value="other">Other</option>}
              {sellerReasons.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="font-semibold text-foreground">Details</span>
            <Textarea aria-label="Cancellation details" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="What happened? (required)" className="text-xs" />
          </label>
          {error && (
            <p role="alert" className="text-rose-700">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="mt-2 gap-2">
          <Button variant="outline" size="sm" className="text-xs" disabled={busy} onClick={onClose}>
            Keep order
          </Button>
          <Button size="sm" className="bg-rose-700 text-xs text-white hover:bg-rose-800" disabled={!valid || busy} onClick={() => onConfirm({ reason: text.trim(), reasonCode: code })}>
            {busy ? "Cancelling..." : "Cancel order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
