import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BulkOrderAction, BulkOrderResult, BulkOrdersResponse } from "@/types/orders";

const TITLE: Record<BulkOrderAction, string> = {
  confirm: "Confirm results",
  cancel: "Cancel results",
  assign_warehouse: "Assign warehouse results",
  mark_priority: "Priority results",
};

const DONE: Record<BulkOrderAction, string> = {
  confirm: "Confirmed",
  cancel: "Cancelled",
  assign_warehouse: "Moved to the warehouse",
  mark_priority: "Priority updated",
};

const plural = (n: number) => `${n} ${n === 1 ? "order" : "orders"}`;

function detailOf(action: BulkOrderAction, r: BulkOrderResult): string {
  if (!r.ok) return r.error?.message ?? "Failed";
  return r.changed ? DONE[action] : "Already in that state, nothing changed";
}

interface OrderBulkResultsDialogProps {
  response: BulkOrdersResponse | null;
  onClose: () => void;
}

/** a bulk action answers 200 with a result per order: partial success is shown order by order */
export function OrderBulkResultsDialog({ response, onClose }: OrderBulkResultsDialogProps) {
  return (
    <Dialog open={response !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {response && (
          <>
            <DialogHeader>
              <DialogTitle>{TITLE[response.action]}</DialogTitle>
              <DialogDescription>
                {response.succeeded} of {plural(response.total)} succeeded{response.failed ? `, ${response.failed} failed` : ""}.
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
                    <p className="text-muted-foreground">{detailOf(response.action, r)}</p>
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
