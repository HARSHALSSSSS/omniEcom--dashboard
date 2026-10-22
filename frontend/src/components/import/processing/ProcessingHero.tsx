import { Fragment } from "react";
import { Check, X } from "lucide-react";
import type { ImportSession } from "@/types/import";
import { num } from "../importFormat";
import { clock, etaText, isDone, progressOf, stagesOf } from "./processingModel";

/** Hero card: headline, state line, percent, "N of M processed", estimate and the progress bar. */
export function ProcessingHero({ session }: { session: ImportSession }) {
  const c = session.counters;
  const { done, total, percent } = progressOf(session);
  const finished = isDone(session.status);
  const failed = session.status === "failed";
  const running = !finished && !failed;

  const headline = failed ? "Import failed" : finished ? "Import complete" : "Import in progress";
  const line = failed
    ? `Failed · ${session.failureMessage ?? "The import stopped before it finished."}`
    : session.status === "committed"
      ? `Complete · ${num(c.committed)} rows added to the master catalog`
      : session.status === "partially_committed"
        ? `Partly complete · ${num(c.committed)} imported, ${num(c.failed)} failed`
        : session.status === "committing"
          ? "Running · Creating master product records"
          : "Running · Overall product processing";

  return (
    <div className="p-6 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">{headline}</h2>
          <div className="flex items-center gap-2 text-[12px] leading-[18px] text-[#666666] mt-1">
            <span className={`w-2 h-2 rounded-full ${failed ? "bg-red-500" : running ? "bg-emerald-500 animate-pulse" : "bg-emerald-500"}`} />
            <span>{line}</span>
          </div>
        </div>
        <div className="text-[36px] font-semibold tracking-tight text-[#000000] dark:text-white font-mono" aria-label="Progress">
          {percent}%
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <div className="flex justify-between items-center text-[12px] leading-[18px] text-[#666666]">
          <span className="font-medium text-[#000000] dark:text-white">
            {num(done)} of {num(total)} rows processed
          </span>
          <span>{finished ? `Completed at ${clock(session.finishedAt)}` : failed ? "Stopped" : etaText(c.etaSeconds)}</span>
        </div>
        <div
          className="h-[3px] w-full bg-[#E0E0E0] dark:bg-muted relative overflow-hidden"
          role="progressbar"
          aria-label="Import progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="h-full bg-[#000000] dark:bg-white transition-all duration-500" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}

/** Current batch: the six stages of the import, read from the status. */
export function ProcessingPipeline({ session }: { session: ImportSession }) {
  const stages = stagesOf(session);
  return (
    <div className="p-6 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card space-y-4">
      <h3 className="text-[10px] leading-[15px] font-medium uppercase tracking-wider text-[#666666]">CURRENT BATCH</h3>

      <ol className="flex items-center justify-between gap-1 overflow-x-auto pb-2" aria-label="Import stages">
        {stages.map((stage, idx) => (
          <Fragment key={stage.label}>
            <li className="flex flex-col items-center text-center shrink-0 min-w-[70px]" aria-current={stage.state === "in_progress" ? "step" : undefined}>
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mb-1.5 transition-colors ${
                  stage.state === "complete"
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : stage.state === "failed"
                      ? "bg-red-600 text-white"
                      : stage.state === "in_progress"
                        ? "border-2 border-black dark:border-white text-black dark:text-white"
                        : "bg-[#F6F6F6] text-[#666666]"
                }`}
              >
                {stage.state === "complete" ? (
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                ) : stage.state === "failed" ? (
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                ) : stage.state === "in_progress" ? (
                  <span className="w-2 h-2 rounded-full bg-black dark:bg-white animate-ping" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
                )}
              </div>
              <span className="text-[12px] leading-[18px] font-medium text-[#000000] dark:text-white">{stage.label}</span>
              <span className="text-[10px] leading-[14px] text-[#666666] capitalize">
                {stage.state === "complete" ? "Complete" : stage.state === "in_progress" ? "In progress" : stage.state === "failed" ? "Failed" : "Upcoming"}
              </span>
            </li>

            {idx < stages.length - 1 && <li aria-hidden className={`flex-1 h-[1px] min-w-[20px] -mt-5 list-none ${stage.state === "complete" ? "bg-black dark:bg-white" : "bg-[#E3E3E3] dark:bg-border"}`} />}
          </Fragment>
        ))}
      </ol>
    </div>
  );
}
