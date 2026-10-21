import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { DecisionAction, PriceProposal } from "@/types/pricing";
import { money } from "../pricingFormat";

export type DecisionTarget = { kind: "one"; action: DecisionAction; proposal: PriceProposal } | { kind: "bulk"; action: DecisionAction; ids: string[] };

interface DecisionDialogProps {
  target: DecisionTarget | null;
  pending: boolean;
  /** why the last attempt failed (the dialog stays open so the reviewer can retry or cancel) */
  error: string | null;
  onConfirm: (note: string) => void;
  onClose: () => void;
}

const NOTE_MAX = 500;

/** every decision goes through this step: nothing changes on a marketplace without an explicit confirmation */
export function DecisionDialog({ target, pending, error, onConfirm, onClose }: DecisionDialogProps) {
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [target]);

  const approve = target?.action === "approve";
  const retry = target?.kind === "one" && target.proposal.status === "failed";

  let title = "";
  let body = "";
  if (target?.kind === "one") {
    const p = target.proposal;
    title = approve ? (retry ? "Retry this price" : "Approve this price") : "Reject this proposal";
    body = approve
      ? `${p.productTitle} (${p.sku}) on ${p.channelName} goes from ${money(p.currentPriceMinor, p.currency)} to ${money(p.proposedPriceMinor, p.currency)}. The price is saved and sent to the marketplace; if the marketplace cannot take price updates through its API, you will be told to change it in the seller panel.`
      : `The proposal for ${p.productTitle} (${p.sku}) on ${p.channelName} is dismissed. The price stays at ${money(p.currentPriceMinor, p.currency)}.`;
  } else if (target) {
    const n = target.ids.length;
    title = approve ? `Approve ${n} ${n === 1 ? "proposal" : "proposals"}` : `Reject ${n} ${n === 1 ? "proposal" : "proposals"}`;
    body = approve
      ? `Each proposed price is applied on its own and sent to its marketplace. If some cannot be applied you will see the result for each one.`
      : `Each selected proposal is dismissed and its price stays as it is.`;
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">{body}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="decision-note" className="text-xs font-semibold">
            Note <span className="font-normal text-muted-foreground">(optional, kept with the decision)</span>
          </label>
          <Textarea id="decision-note" rows={3} maxLength={NOTE_MAX} value={note} disabled={pending} onChange={(e) => setNote(e.target.value)} className="text-xs" />
          <p className="text-right text-[11px] text-muted-foreground">
            {note.length}/{NOTE_MAX}
          </p>
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" variant={approve ? "default" : "destructive"} loading={pending} onClick={() => onConfirm(note.trim())}>
            {approve ? (retry ? "Confirm and retry" : "Confirm and apply price") : "Confirm rejection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
