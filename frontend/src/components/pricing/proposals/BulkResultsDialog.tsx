import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BulkDecisionResult } from "@/types/pricing";
import { OUTCOME_TEXT } from "../pricingFormat";

export interface BulkResultsView {
  result: BulkDecisionResult;
  /** id -> "SKU · channel", taken when the action started */
  labels: Record<string, string>;
}

/** a bulk decision answers 200 with a result per proposal: partial success is shown proposal by proposal */
export function BulkResultsDialog({ view, onClose }: { view: BulkResultsView | null; onClose: () => void }) {
  const result = view?.result;
  const skipped = result?.pushed.filter((p) => p.skipped).length ?? 0;
  return (
    <Dialog open={view !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {view && result && (
          <>
            <DialogHeader>
              <DialogTitle>{result.action === "approve" ? "Approval finished" : "Rejection finished"}</DialogTitle>
              <DialogDescription>
                {result.succeeded} of {result.total} succeeded
                {result.failed > 0 ? `, ${result.failed} did not` : ""}.
                {skipped > 0 ? ` ${skipped} ${skipped === 1 ? "channel cannot" : "channels cannot"} take price updates through the marketplace API: change those prices in the seller panel.` : ""}
              </DialogDescription>
            </DialogHeader>
            <ul className="mt-2 max-h-[320px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {result.items.map((r) => {
                const good = r.outcome === "applied" || r.outcome === "rejected";
                return (
                  <li key={r.id} className="flex items-start gap-2 px-3 py-2">
                    {good ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Succeeded" />
                    ) : r.outcome === "unchanged" ? (
                      <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Unchanged" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-label="Did not succeed" />
                    )}
                    <div className="min-w-0 text-xs">
                      <p className="font-mono font-semibold text-foreground">{view.labels[r.id] ?? r.id}</p>
                      <p className="text-muted-foreground">{r.message ?? OUTCOME_TEXT[r.outcome]}</p>
                    </div>
                  </li>
                );
              })}
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
