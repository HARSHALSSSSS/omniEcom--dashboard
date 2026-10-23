import { Button } from "@/components/ui/button";
import { WRITE_REASON } from "@/components/marketplace-hub/accounts/hubFormat";
import { ago, describeJob, JOB_TYPE_LABEL, SCOPE_LABEL } from "@/components/marketplace-hub/accounts/hubFormat";
import { formatNumber } from "@/utils/format";
import type { DirectoryItem } from "@/types/directory";
import type { HubSyncJob } from "@/types/hub";
import { SetupFooterNote } from "./SetupNotices";

export type SyncStateMode = "ready" | "syncing" | "error" | "partial";

export interface LiveActivityItem {
  time: string;
  text: string;
}

interface SetupSyncStepProps {
  item: DirectoryItem;
  businessName: string;
  syncStateMode: SyncStateMode;
  /** master catalogue size, shown only when it is known */
  totalProducts?: number;
  totalVariants?: number;
  /** which scopes the first sync covers (what the seller chose), as labels */
  includedScopes: string[];
  /** the real jobs of this sync, with their live status and progress */
  jobs: HubSyncJob[];
  /** scopes the connector cannot sync, with the reason the server gave */
  skipped: Array<{ scope: string; reason: string }>;
  activityLogs?: LiveActivityItem[];
  /** why no first sync is running yet (the connect call could not queue it), when that is the case */
  notQueuedReason?: string | null;
  starting: boolean;
  /** the viewer may start syncs (marketplace_accounts:write) */
  canWrite: boolean;
  startError?: string | null;
  statusUnreadable: boolean;
  lastSuccessfulSync: string | null;
  onStartInitialSync: () => void;
  onContinueToWorkspace: () => void;
  onRetrySync: () => void;
  onManageConnection: () => void;
  onCancel: () => void;
}

const FAILED = ["failed", "dead_lettered"];
const labelOf = (j: HubSyncJob) => JOB_TYPE_LABEL[j.type] ?? j.type;

export function SetupSyncStep({
  item,
  businessName,
  syncStateMode,
  totalProducts,
  totalVariants,
  includedScopes,
  jobs,
  skipped,
  activityLogs,
  notQueuedReason,
  starting,
  canWrite,
  startError,
  statusUnreadable,
  lastSuccessfulSync,
  onStartInitialSync,
  onContinueToWorkspace,
  onRetrySync,
  onManageConnection,
  onCancel,
}: SetupSyncStepProps) {
  const failedJobs = jobs.filter((j) => FAILED.includes(j.status));
  const partialJobs = jobs.filter((j) => j.status === "partially_failed" || (j.status === "succeeded" && j.progress.failed > 0));
  const detected = jobs.reduce((n, j) => n + j.progress.total, 0);
  const done = jobs.reduce((n, j) => n + j.progress.done, 0);
  const failedItems = jobs.reduce((n, j) => n + j.progress.failed, 0);
  const reason = failedJobs.map((j) => j.failureDetails[0]?.message ?? j.error?.message).find(Boolean) ?? null;

  const timeline: LiveActivityItem[] = [
    ...jobs.map((j) => ({
      time: j.finishedAt ?? j.startedAt ?? j.createdAt,
      text: `${labelOf(j)}: ${describeJob(j).label}${describeJob(j).detail ? ` (${describeJob(j).detail})` : ""}`,
    })),
  ]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((e) => ({ time: ago(e.time), text: e.text }));
  const activity = [...timeline, ...(activityLogs ?? [])];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">{item.name}</span>
            <span className="text-muted-foreground capitalize">
              {item.category === "storefront" ? "Storefront" : item.category === "shipping" ? "Shipping carrier" : "Marketplace"}
            </span>
          </div>
          <span className="font-medium text-foreground">{businessName}</span>
        </div>

        {skipped.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-[11px] text-amber-900">
            {skipped.map((s) => (
              <li key={s.scope}>
                <span className="font-semibold">{SCOPE_LABEL[s.scope] ?? s.scope} skipped:</span> {s.reason}
              </li>
            ))}
          </ul>
        )}

        {/* SUBSTATE 1: Ready to sync */}
        {syncStateMode === "ready" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">Ready to sync</h2>
              <p className="text-xs text-muted-foreground mt-1">Confirm the data to include in your initial synchronization.</p>
              {notQueuedReason && <p className="text-xs text-amber-700 mt-1">The first sync was not queued with the connection: {notQueuedReason}</p>}
            </div>

            {totalProducts !== undefined && (
              <div className="flex items-baseline gap-12 py-2">
                <div>
                  <span className="text-3xl font-bold tracking-tight text-foreground">{formatNumber(totalProducts)}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">products in your catalogue</p>
                </div>
                {totalVariants !== undefined && (
                  <div>
                    <span className="text-3xl font-bold tracking-tight text-foreground">{formatNumber(totalVariants)}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">variants</p>
                  </div>
                )}
              </div>
            )}

            <div className="divide-y divide-neutral-100 text-xs">
              {["Product catalogue", "Inventory", "Orders"].map((label) => (
                <div key={label} className="flex justify-between py-2.5">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold text-foreground">{includedScopes.includes(label) ? "Included" : "Not included"}</span>
                </div>
              ))}
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Account</span>
                <span className="font-medium text-foreground">{businessName}</span>
              </div>
            </div>

            <div className="pt-2 space-y-1">
              <p className="text-sm font-bold text-foreground">Start when you&apos;re ready</p>
              <p className="text-xs text-muted-foreground">You can continue working while synchronization runs.</p>
            </div>

            {startError && (
              <p role="alert" className="text-xs text-destructive">
                {startError}
              </p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={onStartInitialSync} disabled={starting || !canWrite || includedScopes.length === 0}
                title={canWrite ? undefined : WRITE_REASON} className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold">
                {starting ? "Queueing..." : "Start initial sync"}
              </Button>
              <Button variant="outline" onClick={onCancel} className="text-xs h-9 px-4">
                Back
              </Button>
            </div>
          </div>
        )}

        {/* SUBSTATE 2: Sync in progress (only while the real jobs are active) */}
        {syncStateMode === "syncing" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">Sync in progress</h2>
              <p className="text-xs text-muted-foreground mt-1">Your {item.name} data is being synchronized with the workspace.</p>
              <p className="mt-2 text-xs font-semibold text-foreground flex items-center gap-2" aria-live="polite">
                <span className="h-2 w-2 rounded-sm bg-black" />
                {jobs.filter((j) => !["succeeded", "partially_failed", "failed", "dead_lettered", "cancelled"].includes(j.status)).map(labelOf).join(", ") || "Waiting for the live status"} running
              </p>
              {statusUnreadable && <p className="text-xs text-amber-700 mt-1">The live progress could not be read. The sync keeps running in the background.</p>}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-foreground">Live activity</h3>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="relative pl-6 space-y-4 text-xs">
                  <div className="absolute left-2 top-2 bottom-2 w-[1px] bg-neutral-200" />
                  {activity.length === 0 && <p className="text-muted-foreground">Waiting for the first update...</p>}
                  {activity.map((log, i) => (
                    <div key={i} className="relative flex items-center justify-between gap-3">
                      <span className="absolute -left-6 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full border-2 border-black bg-white" />
                      <span className="font-medium text-foreground">{log.text}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0">{log.time}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Activity shows what the sync jobs report. This step finishes only when every job has finished.</p>
            </div>

            <div className="pt-2 space-y-2">
              <Button onClick={onContinueToWorkspace} className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold">
                Continue to workspace
              </Button>
              <p className="text-xs font-bold text-foreground">You can continue working elsewhere. The sync keeps running.</p>
            </div>
          </div>
        )}

        {/* SUBSTATE 3: Sync failed */}
        {syncStateMode === "error" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">Connection active · Sync needs attention</h2>
              <p className="text-xs text-muted-foreground mt-1">{item.name} is connected, but the initial synchronization did not complete.</p>
            </div>

            <div className="divide-y divide-neutral-100 text-xs">
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Last successful sync</span>
                <span className="font-medium text-foreground">{lastSuccessfulSync ? ago(lastSuccessfulSync) : "No successful sync yet"}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Failed</span>
                <span className="font-semibold text-foreground">{failedJobs.map(labelOf).join(" · ")}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Connection</span>
                <span className="font-semibold text-foreground">Active</span>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 space-y-2 text-xs">
              <p className="font-bold text-foreground">What the sync reported</p>
              <p role="alert" className="text-muted-foreground">
                {reason ?? "The job failed without a message."}
              </p>
            </div>

            <div className="space-y-1 text-xs">
              <p className="font-bold text-foreground">Recommended action</p>
              <p className="text-muted-foreground">Review the issue and retry the failed synchronization.</p>
            </div>

            {startError && (
              <p role="alert" className="text-xs text-destructive">
                {startError}
              </p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={onManageConnection} className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold">
                Review issue
              </Button>
              <Button variant="outline" onClick={onRetrySync} disabled={starting || !canWrite} title={canWrite ? undefined : WRITE_REASON} className="text-xs h-9 px-4">
                {starting ? "Queueing..." : "Retry sync"}
              </Button>
            </div>
          </div>
        )}

        {/* SUBSTATE 4: Finished with exceptions */}
        {syncStateMode === "partial" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">{item.name} connected.</h2>
              <p className="text-xs text-muted-foreground mt-1">The connection is active, but some data requires attention.</p>
            </div>

            <div className="flex items-baseline gap-10 py-2">
              <div>
                <span className="text-3xl font-bold tracking-tight text-foreground">{formatNumber(detected)}</span>
                <p className="text-xs text-muted-foreground mt-0.5">items detected</p>
              </div>
              <div>
                <span className="text-3xl font-bold tracking-tight text-foreground">{formatNumber(done)}</span>
                <p className="text-xs text-muted-foreground mt-0.5">synchronized</p>
              </div>
              <div>
                <span className="text-3xl font-bold tracking-tight text-foreground">{formatNumber(failedItems)}</span>
                <p className="text-xs text-muted-foreground mt-0.5">require attention</p>
              </div>
            </div>

            <div className="divide-y divide-neutral-100 text-xs">
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Connection</span>
                <span className="font-semibold text-foreground">Active</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-muted-foreground">Initial synchronization</span>
                <span className="font-semibold text-foreground">Completed with exceptions</span>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 space-y-2 text-xs">
              <p className="font-bold text-foreground">What needs a look</p>
              {partialJobs.map((j) => (
                <p key={j.id} className="text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">{labelOf(j)}:</span> {j.failureDetails[0]?.message ?? j.error?.message ?? `${j.progress.failed} item(s) failed`}
                </p>
              ))}
              <p className="text-muted-foreground leading-relaxed">The connection stays active while you review these items.</p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={onManageConnection} className="bg-black text-white hover:bg-neutral-800 text-xs h-9 px-4 font-semibold">
                Review issues
              </Button>
              <Button variant="outline" onClick={onContinueToWorkspace} className="text-xs h-9 px-4">
                Continue to workspace
              </Button>
            </div>
          </div>
        )}

        <SetupFooterNote connectorName={item.name} />
      </div>
    </div>
  );
}
