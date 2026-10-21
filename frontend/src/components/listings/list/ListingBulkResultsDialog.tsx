import { CheckCircle2, Loader2, MinusCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isTerminalJob, useJobStatus } from "@/hooks/useListings";
import type { JobStatus } from "@/types/listing";
import type { ResultsView } from "./listingFormat";

const JOB_TEXT: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  retrying: "Retrying",
  succeeded: "Finished",
  partially_failed: "Finished with some failures",
  failed: "Failed",
  dead_lettered: "Failed after several attempts",
  cancelled: "Cancelled",
};

/** the background job of a queued publish: polls until it ends */
function JobLine({ jobId }: { jobId: string }) {
  const job = useJobStatus(jobId);
  if (job.isError) return <p className="text-muted-foreground">Job status unavailable, see Sync jobs.</p>;
  if (!job.data) return <p className="text-muted-foreground">Checking job...</p>;
  const done = isTerminalJob(job.data.status);
  const bad = ["failed", "dead_lettered", "partially_failed", "cancelled"].includes(job.data.status);
  return (
    <p className={bad ? "text-rose-700" : "text-muted-foreground"} aria-live="polite">
      {!done && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden />}
      Job: {JOB_TEXT[job.data.status]}
      {job.data.error ? ` (${job.data.error.message})` : ""}
    </p>
  );
}

interface ListingBulkResultsDialogProps {
  view: ResultsView | null;
  onClose: () => void;
}

/** a bulk action answers 200 with a result per listing: partial success is shown listing by listing */
export function ListingBulkResultsDialog({ view, onClose }: ListingBulkResultsDialogProps) {
  return (
    <Dialog open={view !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {view && (
          <>
            <DialogHeader>
              <DialogTitle>{view.title}</DialogTitle>
              <DialogDescription>{view.summary}</DialogDescription>
            </DialogHeader>
            <ul className="mt-2 max-h-[320px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {view.rows.map((r) => (
                <li key={r.key} className="flex items-start gap-2 px-3 py-2">
                  {r.status === "done" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Succeeded" />
                  ) : r.status === "skipped" ? (
                    <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Skipped" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-label="Did not succeed" />
                  )}
                  <div className="min-w-0 text-xs">
                    <p className="font-mono font-semibold text-foreground">{r.label}</p>
                    <p className="text-muted-foreground">{r.message}</p>
                    {r.jobId && <JobLine jobId={r.jobId} />}
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
