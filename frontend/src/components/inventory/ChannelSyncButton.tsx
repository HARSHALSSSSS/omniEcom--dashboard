import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/api/errors";
import { useChannelSync } from "@/hooks/useInventory";
import type { SyncJob, SyncStartResult, Tone } from "@/types/inventory";
import { InlineError, Pill } from "./inventoryUi";

function describe(result: SyncStartResult["results"][number], job: SyncJob | undefined, unreadable: boolean): { label: string; tone: Tone; detail: string | null } {
  if (result.status === "failed") return { label: "Could not queue", tone: "bad", detail: result.error?.message ?? null };
  if (!job) return unreadable ? { label: "Queued", tone: "neutral", detail: "The live status of this job is not available to your role." } : { label: result.status === "already_queued" ? "Already queued" : "Queued", tone: "neutral", detail: null };
  const progress = job.progress && job.progress.total > 0 ? `${job.progress.done} of ${job.progress.total} SKUs` : null;
  const reason = job.failureDetails[0]?.message ?? job.error?.message ?? null;
  switch (job.status) {
    case "succeeded":
      return { label: "Synced", tone: "good", detail: progress };
    case "partially_failed":
      return { label: "Synced with errors", tone: "warn", detail: [progress, job.progress ? `${job.progress.failed} failed` : null, reason].filter(Boolean).join(" · ") };
    case "failed":
    case "dead_lettered":
      return { label: "Failed", tone: "bad", detail: reason };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral", detail: null };
    case "retrying":
      return { label: "Retrying", tone: "warn", detail: reason };
    case "running":
      return { label: "Syncing", tone: "info", detail: progress };
    default:
      return { label: "Queued", tone: "neutral", detail: null };
  }
}

interface ChannelSyncButtonProps {
  /** needs inventory:write AND listings:write */
  allowed: boolean;
  disabledReason: string;
}

/** "Sync all channels": POST /inventory/channel-sync (202), then the per-account jobs are polled and shown. */
export function ChannelSyncButton({ allowed, disabledReason }: ChannelSyncButtonProps) {
  const sync = useChannelSync();
  const [open, setOpen] = useState(false);
  const running = sync.start.isPending || (sync.start.isSuccess && !sync.settled);
  const data = sync.start.data;

  const begin = () => {
    sync.reset();
    setOpen(true);
    sync.start.mutate(undefined);
  };

  return (
    <>
      <span title={allowed ? undefined : disabledReason}>
        <button
          type="button"
          disabled={!allowed || running}
          onClick={begin}
          className="box-border flex h-[34px] cursor-pointer flex-row items-center gap-[7px] rounded-lg border border-[#EAEAEA] bg-white px-3 py-0 text-[#000000] transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 stroke-[1.5px] text-[#666666] ${running ? "animate-spin" : ""}`} aria-hidden />
          <span className="text-[12px] font-normal leading-[145%]">{running ? "Syncing..." : "Sync all"}</span>
        </button>
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Channel sync</DialogTitle>
            <DialogDescription>Pushes the current stock of every product to your connected marketplaces.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs" aria-live="polite">
            {sync.start.isPending && <p className="text-muted-foreground">Queueing the syncs...</p>}
            {sync.start.isError && <InlineError message={errorMessage(sync.start.error, "The sync could not be started.")} />}
            {data && data.requested === 0 && (
              <p className="text-muted-foreground">
                No marketplace is connected yet.{" "}
                <Link to={ROUTES.MARKETPLACE_HUB} className="font-medium text-foreground underline" onClick={() => setOpen(false)}>
                  Connect one
                </Link>
              </p>
            )}
            {data && data.requested > 0 && (
              <>
                <p className="text-muted-foreground">
                  {data.queued} of {data.requested} {data.requested === 1 ? "channel" : "channels"} queued{sync.settled ? ", all finished." : ", syncing..."}
                </p>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {data.results.map((r) => {
                    const entry = r.jobId ? sync.byId.get(r.jobId) : undefined;
                    const d = describe(r, entry?.job, entry?.unreadable ?? false);
                    return (
                      <li key={r.accountId} className="flex items-start justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{r.channel.name}</p>
                          {d.detail && <p className="text-[11px] text-muted-foreground">{d.detail}</p>}
                        </div>
                        <Pill tone={d.tone}>{d.label}</Pill>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          <DialogFooter>
            {sync.start.isError && (
              <Button variant="outline" size="sm" onClick={begin}>
                Try again
              </Button>
            )}
            <Button size="sm" onClick={() => setOpen(false)}>
              {running ? "Close (keeps syncing)" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
