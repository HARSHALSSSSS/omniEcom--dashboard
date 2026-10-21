import { AlertTriangle, CheckCircle2, Loader2, MinusCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StudioController } from "@/hooks/useListingStudio";
import { isJobDone, type FlowStep, type ListingStudio, type StudioActionKey } from "@/types/listingStudio";

const STEP_LABEL: Record<FlowStep["step"], string> = { validate: "Validate", approve: "Approve", publish: "Publish" };

const JOB_STATE: Record<string, string> = {
  queued: "Waiting in the queue",
  running: "Running",
  retrying: "Retrying after a temporary problem",
  succeeded: "Finished",
  partially_failed: "Finished with problems",
  failed: "Failed",
  dead_lettered: "Failed",
  cancelled: "Cancelled",
};

/** progress of the background job behind publish / unpublish / refresh / content sync */
export function JobBanner({ ctl }: { ctl: StudioController }) {
  if (!ctl.jobAction) return null;
  const job = ctl.job;
  const done = !!job && isJobDone(job.status);
  const ok = job?.status === "succeeded";
  return (
    <div role="status" aria-live="polite" className={`flex items-center justify-between gap-3 rounded-xl border p-4 text-xs shadow-sm ${done ? (ok ? "border-emerald-200 bg-emerald-50/60 text-emerald-950" : "border-rose-200 bg-rose-50/70 text-rose-950") : "border-sky-200 bg-sky-50/60 text-sky-950"}`}>
      <div className="flex items-center gap-3">
        {done ? ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" /> : <XCircle className="h-5 w-5 text-rose-600" aria-hidden="true" /> : <Loader2 className="h-5 w-5 animate-spin text-sky-600" aria-hidden="true" />}
        <div>
          <p className="text-sm font-semibold">{ctl.jobLabel}</p>
          <p>{ctl.jobPollFailed ? "Could not read the job status." : job ? `${JOB_STATE[job.status] ?? job.status}${job.error ? `: ${job.error.message}` : ""}` : "Starting"}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {ctl.jobPollFailed && (
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={ctl.retryJob}>
            Retry
          </Button>
        )}
        {(done || ctl.jobPollFailed) && (
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={ctl.dismissJob}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}

const StepIcon = ({ status }: { status: FlowStep["status"] }) =>
  status === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : status === "failed" ? <XCircle className="h-4 w-4 text-rose-600" aria-hidden="true" /> : <MinusCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;

/** result of "Publish to channel": the three steps and why it stopped */
export function FlowCard({ ctl }: { ctl: StudioController }) {
  const flow = ctl.flow;
  if (!flow) return null;
  const stopped = flow.steps.find((s) => s.status === "failed");
  const heading =
    flow.outcome === "queued" ? "Submitted for publishing" : flow.outcome === "blocked" ? "Not published: fix the problems below" : flow.outcome === "failed" ? "Publishing stopped" : "Nothing to publish: this listing is already live";
  return (
    <section aria-label="Publish result" className={`space-y-3 rounded-xl border p-4 text-xs shadow-sm ${flow.outcome === "queued" || flow.outcome === "not_applicable" ? "border-border bg-card" : "border-rose-200 bg-rose-50/50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{heading}</h4>
          {stopped && <p className="mt-0.5 text-rose-900">{stopped.message}</p>}
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={ctl.dismissFlow}>
          Dismiss
        </Button>
      </div>
      {flow.steps.length > 0 && (
        <ol className="space-y-1.5" aria-label="Publish steps">
          {flow.steps.map((st) => (
            <li key={st.step} className="flex items-center gap-2">
              <StepIcon status={st.status} />
              <span className="font-medium text-foreground">{STEP_LABEL[st.step]}</span>
              <span className="text-muted-foreground">{st.status === "not_run" ? "Not run" : st.message}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

interface SyncProps {
  s: ListingStudio;
  ctl: StudioController;
  act: (key: StudioActionKey) => { enabled: boolean; reason: string | null };
  onChooseCategory: () => void;
}

/** the master-content state of a live listing: category review, failed update, republish needed, update queued */
export function ContentSyncPanel({ s, ctl, act, onChooseCategory }: SyncProps) {
  const cs = s.contentSync;
  if (cs.state === "synced") return null;
  const resolve = act("resolve_review");
  const sync = act("sync_content");
  const busy = ctl.resolving || ctl.running;
  const reviewDisabled = !ctl.canWrite || !resolve.enabled || busy;

  if (cs.state === "needs_review") {
    const r = cs.review;
    return (
      <section aria-label="Category review" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden="true" />
          <div>
            <h4 className="text-sm font-bold text-amber-950">Category review needed</h4>
            <p className="mt-0.5 text-amber-900">
              {r.reason === "category_changed" ? "The category of the product changed, so the marketplace category of this live listing needs your decision." : "The master content changed and this live listing needs your decision before it is updated."}
            </p>
            {r.suggestedMarketplaceCategoryId && (
              <p className="mt-1 text-amber-900">
                Suggested category: <span className="font-semibold">{r.suggestedMarketplaceCategoryName ?? r.suggestedMarketplaceCategoryId}</span>
              </p>
            )}
            {s.category.marketplaceCategoryName && <p className="text-amber-900">Current category: {s.category.marketplaceCategoryName}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {r.suggestedMarketplaceCategoryId && (
            <Button type="button" size="sm" className="h-8 text-xs" disabled={reviewDisabled} title={resolve.reason ?? undefined} onClick={() => void ctl.resolveReview({ action: "accept_mapping" })}>
              Use suggested category
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={reviewDisabled} title={resolve.reason ?? undefined} onClick={() => void ctl.resolveReview({ action: "keep_current" })}>
            Keep current category
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={reviewDisabled} title={resolve.reason ?? undefined} onClick={onChooseCategory}>
            Choose another category
          </Button>
        </div>
      </section>
    );
  }

  const failed = cs.state === "failed";
  const text =
    cs.state === "failed" ? "The last content update could not be sent to the marketplace." : cs.state === "needs_republish" ? "This marketplace cannot update a live listing. Unpublish it and publish it again to send the latest content." : "The latest content is queued to be sent to the marketplace.";
  return (
    <section aria-label="Content update" className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-xs shadow-sm ${failed ? "border-rose-200 bg-rose-50/70 text-rose-950" : "border-amber-200 bg-amber-50/70 text-amber-950"}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-0.5 h-5 w-5 ${failed ? "text-rose-600" : "text-amber-600"}`} aria-hidden="true" />
        <div>
          <h4 className="text-sm font-bold">{failed ? "Content update failed" : cs.state === "needs_republish" ? "Republish needed" : "Content update queued"}</h4>
          <p className="mt-0.5">{text}</p>
          {cs.error && <p className="mt-0.5 font-medium">{cs.error}</p>}
          {cs.changedFields.length > 0 && <p className="mt-0.5">Changed: {cs.changedFields.join(", ")}</p>}
        </div>
      </div>
      {cs.state !== "needs_republish" && (
        <Button type="button" size="sm" className="h-8 shrink-0 text-xs" disabled={!ctl.canWrite || !sync.enabled || busy} title={sync.reason ?? undefined} onClick={() => void ctl.run("sync_content")}>
          {failed ? "Retry now" : "Send now"}
        </Button>
      )}
    </section>
  );
}
