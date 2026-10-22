import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, RefreshCw, X } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { SYNC_JOB_DONE, type SyncAccountReport, type SyncReport } from "@/types/returns";
import { SYNC_SKIP_TEXT, syncJobLine } from "./returnFormat";

const FAILURES_SHOWN = 5;

function AccountRow({ a }: { a: SyncAccountReport }) {
  const job = a.job;
  const done = job !== null && SYNC_JOB_DONE.includes(job.status);
  const bad = job?.status === "failed" || job?.status === "dead_lettered";
  const partial = job?.status === "partially_failed";
  return (
    <li className="space-y-1.5 py-2.5">
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="min-w-0 truncate font-semibold text-black">
          {a.accountName}
          <span className="ml-2 font-normal text-[#666666]">{a.marketplace}</span>
        </span>
        <span className={cn("shrink-0 text-[11px] font-medium", bad ? "text-[#DC2626]" : partial ? "text-[#D97706]" : done ? "text-[#16A34A]" : "text-[#2563EB]")}>
          {!job ? "Starting" : job.status === "queued" ? "Waiting in the queue" : job.status === "running" ? "Fetching returns" : job.status === "retrying" ? "Retrying" : job.status === "succeeded" ? "Done" : job.status === "partially_failed" ? "Done with problems" : job.status === "cancelled" ? "Cancelled" : "Failed"}
        </span>
      </div>

      {!done && (
        <div className="space-y-1">
          <div role="progressbar" aria-label={`Sync of ${a.accountName}`} aria-valuemin={0} aria-valuemax={Math.max(job?.progress.total ?? 0, job?.progress.done ?? 0, 1)} aria-valuenow={job?.progress.done ?? 0} className="h-1.5 overflow-hidden rounded-full bg-[#F5F5F5]">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[#111111]" />
          </div>
          <p className="text-[11px] text-[#666666]">
            {job && job.progress.done > 0 ? `${formatNumber(job.progress.done)} ${job.progress.done === 1 ? "return" : "returns"} checked so far` : a.alreadyQueued ? "A sync of this account was already waiting; following it." : "Asking the marketplace for returns..."}
            {job?.status === "retrying" && job.error?.message ? ` Last attempt failed: ${job.error.message}` : ""}
          </p>
        </div>
      )}

      {job && done && (
        <>
          <p className="text-[11px] text-[#666666]">
            {bad || job.status === "cancelled" ? (job.error?.message ?? "The sync did not finish.") : syncJobLine(job)}
            {job.progress.done > 0 ? ` · ${formatNumber(job.progress.done)} checked` : ""}
          </p>
          {job.failureDetails.length > 0 && (
            <ul aria-label={`Returns that could not be imported from ${a.accountName}`} className="space-y-0.5 rounded-lg bg-[#FFFBF5] p-2.5 text-[11px] text-[#92400E]">
              {job.failureDetails.slice(0, FAILURES_SHOWN).map((f) => (
                <li key={f.ref}>
                  <span className="font-mono font-semibold">{f.ref}</span> · {f.message}
                </li>
              ))}
              {job.failureDetails.length > FAILURES_SHOWN && <li>and {job.failureDetails.length - FAILURES_SHOWN} more</li>}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

interface SyncReportPanelProps {
  report: SyncReport;
  running: boolean;
  canRetry: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

/** what "Sync Returns" is doing and did: each connected account's job with its live progress, the counts, the returns that could not be imported and the accounts that cannot send returns */
export function SyncReportPanel({ report, running, canRetry, onRetry, onDismiss }: SyncReportPanelProps) {
  const problems = report.accounts.some((a) => a.job && (a.job.status !== "succeeded" && SYNC_JOB_DONE.includes(a.job.status)));
  const heading = running ? "Syncing returns..." : report.nothingToSync ? "Nothing to sync" : report.stillRunning ? "Still syncing in the background" : problems ? "Returns synced, with problems" : "Returns synced";
  return (
    <section aria-label="Returns sync" role="status" className={cn("space-y-1 rounded-xl border p-3.5", problems ? "border-[#FDE68A] bg-[#FFFBF5]" : "border-[#EAEAEA] bg-white")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-black">
          {running ? <RefreshCw className="h-3.5 w-3.5 animate-spin stroke-[2] text-[#2563EB]" aria-hidden /> : problems || report.nothingToSync ? <AlertTriangle className="h-3.5 w-3.5 stroke-[2] text-[#D97706]" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5 stroke-[2] text-[#16A34A]" aria-hidden />}
          <span>{heading}</span>
        </div>
        <div className="flex items-center gap-3">
          {!running && problems && canRetry && (
            <button type="button" onClick={onRetry} className="text-[11px] font-semibold text-black hover:underline">
              Sync again
            </button>
          )}
          {!running && (
            <button type="button" onClick={onDismiss} aria-label="Dismiss sync report" className="flex h-6 w-6 items-center justify-center rounded-md text-[#666666] hover:bg-neutral-100 hover:text-black">
              <X className="h-3.5 w-3.5 stroke-[1.5]" />
            </button>
          )}
        </div>
      </div>

      {report.nothingToSync && (
        <p className="text-[12px] text-[#666666]">
          None of your connected marketplaces can send returns through its connector yet.{" "}
          <Link to={ROUTES.MARKETPLACE_HUB} className="font-semibold text-black hover:underline">
            See your connections
          </Link>
        </p>
      )}

      {report.accounts.length > 0 && <ul className="divide-y divide-[#EAEAEA]/80">{report.accounts.map((a) => <AccountRow key={a.accountId} a={a} />)}</ul>}

      {report.stillRunning && <p className="text-[11px] text-[#666666]">The marketplace is slow to answer. The sync keeps running; the numbers refresh when you reload.</p>}

      {report.skipped.length > 0 && (
        <ul aria-label="Accounts that cannot send returns" className="space-y-0.5 border-t border-[#EAEAEA]/80 pt-2 text-[11px] text-[#666666]">
          {report.skipped.map((s) => (
            <li key={s.accountId}>
              <span className="font-semibold text-black">{s.accountName}</span> ({s.marketplace}): {SYNC_SKIP_TEXT[s.reason]}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
