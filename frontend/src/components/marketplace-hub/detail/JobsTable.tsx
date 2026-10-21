import { useState } from "react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { toast } from "@/hooks/useToast";
import { useJobAction, useJobLogs } from "@/hooks/useHub";
import { formatDateTime } from "@/utils/format";
import type { HubSyncJob } from "@/types/hub";
import { JOB_TYPE_LABEL, describeJob } from "../accounts/hubFormat";
import { InlineError, Pill } from "../accounts/hubUi";

function Logs({ jobId }: { jobId: string }) {
  const logs = useJobLogs(jobId);
  if (logs.isPending) return <p className="text-[11px] text-muted-foreground">Loading the log...</p>;
  if (logs.isError) return <InlineError message={errorMessage(logs.error, "The log could not be loaded.")} />;
  if (logs.data.items.length === 0) return <p className="text-[11px] text-muted-foreground">This run wrote no log lines.</p>;
  return (
    <ol className="max-h-48 space-y-0.5 overflow-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-[11px]">
      {logs.data.items.map((l) => (
        <li key={l.id} className={l.level === "error" ? "text-red-700" : l.level === "warn" ? "text-amber-700" : "text-muted-foreground"}>
          {formatDateTime(l.createdAt)} {l.level.toUpperCase()} {l.message}
        </li>
      ))}
    </ol>
  );
}

/** The last sync runs of the account, with their log, and retry / cancel for the roles that may. */
export function JobsTable({ jobs }: { jobs: HubSyncJob[] }) {
  const canRead = useCan("sync:read");
  const canWrite = useCan("sync:write");
  const action = useJobAction();
  const [open, setOpen] = useState<string | null>(null);

  const run = (id: string, kind: "retry" | "cancel") =>
    action.mutate(
      { id, action: kind },
      {
        onSuccess: () => toast({ title: kind === "retry" ? "Run queued again" : "Run cancelled", variant: "success" }),
        onError: (e) => toast({ title: kind === "retry" ? "Could not retry" : "Could not cancel", description: errorMessage(e), variant: "destructive" }),
      },
    );

  if (jobs.length === 0) return <p className="text-xs text-muted-foreground">No sync has run for this account yet.</p>;

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {jobs.map((job) => {
        const d = describeJob(job);
        const retryable = ["failed", "dead_lettered", "partially_failed", "cancelled"].includes(job.status);
        const cancellable = ["queued", "retrying"].includes(job.status);
        return (
          <li key={job.id} className="space-y-2 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{JOB_TYPE_LABEL[job.type] ?? job.type}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDateTime(job.createdAt)} · {job.trigger}
                  {d.detail ? ` · ${d.detail}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={d.tone}>{d.label}</Pill>
                {canRead && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" aria-expanded={open === job.id} onClick={() => setOpen(open === job.id ? null : job.id)}>
                    {open === job.id ? "Hide log" : "Log"}
                  </Button>
                )}
                {retryable && (
                  <span title={canWrite ? undefined : "Needs the sync:write permission."}>
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!canWrite || action.isPending} onClick={() => run(job.id, "retry")}>
                      Retry
                    </Button>
                  </span>
                )}
                {cancellable && (
                  <span title={canWrite ? undefined : "Needs the sync:write permission."}>
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!canWrite || action.isPending} onClick={() => run(job.id, "cancel")}>
                      Cancel
                    </Button>
                  </span>
                )}
              </div>
            </div>
            {open === job.id && <Logs jobId={job.id} />}
          </li>
        );
      })}
    </ul>
  );
}
