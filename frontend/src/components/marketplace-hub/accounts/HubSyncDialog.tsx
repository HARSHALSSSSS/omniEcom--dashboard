import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/api/errors";
import type { useAccountSync } from "@/hooks/useHub";
import { JOB_TYPE_LABEL, SCOPE_LABEL, describeJob } from "./hubFormat";
import { Bar, InlineError, Pill } from "./hubUi";

interface HubSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  sync: ReturnType<typeof useAccountSync>;
  onRetry: () => void;
}

/** Shows what "Sync now" started. The 202 only means "queued": progress and the result come from polling sync-status. */
export function HubSyncDialog({ open, onOpenChange, accountName, sync, onRetry }: HubSyncDialogProps) {
  const { start, started, jobs, settled } = sync;
  const running = start.isPending || (Boolean(started) && !settled && !sync.statusError);
  const failedCount = jobs.filter((j) => ["failed", "dead_lettered"].includes(j.job.status)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sync {accountName}</DialogTitle>
          <DialogDescription>Imports orders and pushes stock and listing status for this account.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs" aria-live="polite">
          {start.isPending && <p className="text-muted-foreground">Queueing the sync...</p>}
          {start.isError && <InlineError message={errorMessage(start.error, "The sync could not be started.")} />}
          {started && started.jobs.length === 0 && <p className="text-muted-foreground">Nothing was queued.</p>}
          {jobs.length > 0 && (
            <>
              <p className="text-muted-foreground">
                {settled
                  ? failedCount > 0
                    ? `Finished: ${failedCount} of ${jobs.length} ${jobs.length === 1 ? "run" : "runs"} failed.`
                    : "Finished."
                  : sync.statusError
                    ? "The live progress could not be read. The sync keeps running in the background."
                    : "Syncing..."}
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {jobs.map(({ scope, job, created }) => {
                  const d = describeJob(job);
                  return (
                    <li key={job.id} className="space-y-1.5 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{SCOPE_LABEL[scope] ?? JOB_TYPE_LABEL[job.type] ?? scope}</p>
                          {!created && <p className="text-[11px] text-muted-foreground">Already queued, using the existing run.</p>}
                          {d.detail && <p className="text-[11px] text-muted-foreground">{d.detail}</p>}
                        </div>
                        <Pill tone={d.tone}>{d.label}</Pill>
                      </div>
                      {job.status === "running" && job.progress.total > 0 && (
                        <Bar value={(job.progress.done / job.progress.total) * 100} tone="info" label={`${SCOPE_LABEL[scope] ?? scope} progress`} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {started && started.skipped.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-[11px] text-amber-900">
              {started.skipped.map((s) => (
                <li key={s.scope}>
                  <span className="font-semibold">{SCOPE_LABEL[s.scope] ?? s.scope} skipped:</span> {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          {start.isError && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Button size="sm" onClick={() => onOpenChange(false)}>
            {running ? "Close (keeps syncing)" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
