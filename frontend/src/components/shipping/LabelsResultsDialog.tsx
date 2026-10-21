import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BulkLabelsResponse } from "@/types/shipping";

interface LabelsResultsDialogProps {
  response: BulkLabelsResponse | null;
  busyId: string | null;
  onClose: () => void;
  onDownloadPdf: () => void;
  onOpenPdf: () => void;
  onLabel: (shipmentId: string) => void;
}

const plural = (n: number) => `${n} ${n === 1 ? "shipment" : "shipments"}`;

/** bulk labels answer 200 with a result per shipment: partial success is shown shipment by shipment, next to the combined PDF */
export function LabelsResultsDialog({ response, busyId, onClose, onDownloadPdf, onOpenPdf, onLabel }: LabelsResultsDialogProps) {
  return (
    <Dialog open={response !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {response && (
          <>
            <DialogHeader>
              <DialogTitle>Label results</DialogTitle>
              <DialogDescription>
                {response.summary.ok} of {plural(response.summary.requested)} have a label{response.summary.failed ? `, ${response.summary.failed} could not be printed` : ""}.
                {response.combined.available
                  ? ` ${response.combined.shipmentIds.length} ${response.combined.shipmentIds.length === 1 ? "label is" : "labels are"} in one PDF of ${response.combined.pages} ${response.combined.pages === 1 ? "page" : "pages"}.`
                  : " There is no combined PDF."}
              </DialogDescription>
            </DialogHeader>
            {response.combined.available && (
              <div className="flex gap-2">
                <Button size="sm" className="text-xs" onClick={onDownloadPdf}>
                  Download PDF
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={onOpenPdf}>
                  Open to print
                </Button>
              </div>
            )}
            <ul className="mt-2 max-h-[320px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {response.results.map((r) => (
                <li key={r.shipmentId} className="flex items-start gap-2 px-3 py-2">
                  {r.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Has a label" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-label="No label" />
                  )}
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-mono font-semibold text-foreground">{r.awb ?? r.number ?? r.shipmentId}</p>
                    <p className="text-muted-foreground">{r.ok ? (r.includedInCombined ? "In the combined PDF" : "The carrier supplies this label as its own PDF") : (r.error?.message ?? "Failed")}</p>
                  </div>
                  {r.ok && !r.includedInCombined && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyId === r.shipmentId} onClick={() => onLabel(r.shipmentId)}>
                      Download
                    </Button>
                  )}
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
