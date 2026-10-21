import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { errorMessage } from "@/api/errors";
import { Button, buttonVariants } from "@/components/ui/button";
import { useDownloadErrors, useImportSummary } from "@/hooks/useImport";
import type { ImportOptions, ImportSession } from "@/types/import";
import { CommitPanel } from "../CommitPanel";
import { ImportResult } from "../ImportResult";
import { Alert } from "../ImportStates";
import { canReview, codeLabel, num } from "../importFormat";
import { issuesUrl } from "../importParams";

function Stat({ label, value, tone = "text-foreground" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{num(value)}</p>
    </div>
  );
}

interface Props {
  session: ImportSession;
  options: UseQueryResult<ImportOptions>;
  canWrite: boolean;
  onBack: () => void;
  onFixSettings: () => void;
}

/** Step 5: the validated file in numbers, the choice of what to import, then the result of the commit. */
export function ReviewStep({ session, options, canWrite, onBack, onFixSettings }: Props) {
  const reviewable = canReview(session.status);
  const summary = useImportSummary(session.id, reviewable);
  const download = useDownloadErrors(session.id);
  const finished = session.status === "committed" || session.status === "partially_committed";
  const rows = summary.data?.rows;
  const eligible = rows ? (rows.valid ?? 0) + (rows.warning ?? 0) : undefined;
  const c = session.counters;

  return (
    <div className="space-y-6">
      {finished && <ImportResult session={session} />}

      {session.status !== "committed" && session.status !== "committing" && (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm" aria-labelledby="review-title">
          <h2 id="review-title" className="text-base font-semibold text-foreground">
            {finished ? "Rows still waiting" : "Review your file"}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Rows" value={c.total} />
            <Stat label="Valid" value={c.valid} tone="text-emerald-600" />
            <Stat label="With warnings" value={c.warning} tone="text-amber-600" />
            <Stat label="With errors" value={c.error} tone="text-red-600" />
            <Stat label="Skipped" value={c.skipped} />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Issues: <span className="font-semibold text-foreground">{num(session.issues.open)}</span> open · {num(session.issues.resolved)} resolved · {num(session.issues.ignored)} ignored
          </p>

          {summary.isError && !summary.data && (
            <div className="mt-3">
              <Alert tone="warning">The issue summary could not be loaded: {errorMessage(summary.error)}</Alert>
            </div>
          )}
          {summary.data && summary.data.byCode.some((x) => x.open > 0) && (
            <ul className="mt-4 divide-y divide-border rounded-lg border border-border" aria-label="Open issues by kind">
              {summary.data.byCode
                .filter((x) => x.open > 0)
                .map((x) => (
                  <li key={x.code} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <span className="font-medium text-foreground">{x.title || codeLabel(x.code)}</span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums text-muted-foreground">{num(x.open)} open</span>
                      <Link to={`${issuesUrl(session.id)}?code=${x.code}`} className="font-semibold text-primary hover:underline">
                        Resolve
                      </Link>
                    </span>
                  </li>
                ))}
            </ul>
          )}

          {session.issues.total > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to={issuesUrl(session.id)} className={buttonVariants({ variant: "outline", size: "sm", className: "text-xs" })}>
                Open the issues screen
              </Link>
              <Button variant="outline" size="sm" className="text-xs" loading={download.isPending} onClick={() => download.mutate()}>
                Download issues (CSV)
              </Button>
            </div>
          )}
          {download.isError && (
            <div className="mt-3">
              <Alert>{errorMessage(download.error, "The file could not be downloaded.")}</Alert>
            </div>
          )}
        </section>
      )}

      <CommitPanel session={session} options={options.data} eligible={eligible} canWrite={canWrite} onFixSettings={onFixSettings} />

      {session.status !== "committing" && (
        <div className="flex justify-start">
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>
      )}
    </div>
  );
}
