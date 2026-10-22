import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { toast } from "@/hooks/useToast";
import { useCommitImport, useCommitPreview, useImportSummary, useRevalidateImport } from "@/hooks/useImport";
import type { CommitMode, ImportSession } from "@/types/import";
import { ImportProgress } from "../ImportProgress";
import { ImportResult } from "../ImportResult";
import { ImportSummarySidebar } from "../ImportSummarySidebar";
import { Alert } from "../ImportStates";
import { canReview, importErrorMessage, num, ruleOf } from "../importFormat";
import { planNumbers } from "./exceptions";
import type { StepProps } from "./stepTypes";
import { BAR_PRIMARY, BTN_BLACK, BTN_OUTLINE } from "./styles";
import { WizardBar } from "./WizardBar";

interface Props extends StepProps {
  session: ImportSession;
  /** the seller came from "Import N ready products": start with the clean rows only */
  preferCleanOnly: boolean;
  /** the commit needs a warehouse: the settings are on the upload step */
  onFixSettings: () => void;
}

const Figure = ({ value, label }: { value: string; label: string }) => (
  <div>
    <div className="text-[26px] leading-[36px] font-semibold text-[#000000] dark:text-white">{value}</div>
    <div className="text-[12px] leading-[18px] text-[#666666]">{label}</div>
  </div>
);

/** Step 5: the final impact, what to import, and the explicit confirmation. Starting the commit continues on the processing page. */
export function ReadyStep({ session, options, canWrite, goTo, onCancel, onSaveDraft, preferCleanOnly, onFixSettings }: Props) {
  const navigate = useNavigate();
  const reviewable = canReview(session.status);
  const summary = useImportSummary(session.id, reviewable);
  const preview = useCommitPreview(session.id, reviewable);
  const commit = useCommitImport(session.id);
  const revalidate = useRevalidateImport(session.id);
  const [picked, setPicked] = useState<CommitMode | null>(null);
  const [error, setError] = useState<{ message: string; rule: string | null } | null>(null);

  const processing = `${ROUTES.PRODUCTS_IMPORT}/${session.id}/processing`;
  const link = buttonVariants({ variant: "outline", className: BTN_OUTLINE });
  const { counters, issues } = session;
  const finished = session.status === "committed" || session.status === "partially_committed";

  // ---- already started: the progress / result of this import
  if (session.status === "committing" || finished) {
    return (
      <div className="w-full pt-1 space-y-6">
        <div>
          <h2 className="text-[23px] leading-[35px] font-semibold text-[#000000] dark:text-white">{finished ? "Your import has finished" : "Your import is starting"}</h2>
          <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">{session.fileName ?? "Marketplace catalog"} · {num(counters.total)} rows</p>
        </div>
        {session.status === "committing" ? (
          <div className="p-8 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card space-y-4">
            <ImportProgress session={session} mode="commit" />
            <p className="text-[11px] leading-[17px] text-[#666666]">Import has begun. Product records are not yet confirmed as imported.</p>
          </div>
        ) : (
          <ImportResult session={session} />
        )}
        <Link to={processing} className={link}>
          Open import progress
        </Link>
        <WizardBar status="Your catalog stays unchanged until you confirm import." onCancel={onCancel} onSaveDraft={onSaveDraft} />
      </div>
    );
  }

  const modes = options.data?.commitModes ?? [];
  const mode: CommitMode = picked ?? (preferCleanOnly ? "clean_only" : issues.resolved > 0 ? "include_resolved" : "clean_only");
  const exact = preview.data ? (mode === "include_resolved" ? preview.data.includeResolved : preview.data.cleanOnly) : undefined;
  const eligible = summary.data ? (summary.data.rows.valid ?? 0) + (summary.data.rows.warning ?? 0) : undefined;
  const count = exact ?? eligible;
  const nothing = count === 0;
  const stale = error?.rule === "revalidate_first";
  const nums = planNumbers(session);
  const products = session.products > 0 ? session.products : undefined;
  const canStart = canWrite && reviewable && !nothing && !stale && modes.length > 0;

  const start = () => {
    setError(null);
    commit.mutate(mode, {
      onSuccess: (res) => {
        toast({ title: "Import started", description: `${num(res.eligibleRows)} rows are being imported.`, variant: "success" });
        navigate(processing);
      },
      onError: (e) => setError({ message: importErrorMessage(e, "The import could not be started."), rule: ruleOf(e) }),
    });
  };

  const runRevalidate = () => {
    setError(null);
    revalidate.mutate(undefined, {
      onSuccess: (res) => toast({ title: res.queued ? "Revalidation started" : "Revalidated", description: res.queued ? undefined : `${num(res.remainingIssuesCount)} issue(s) remain.` }),
      onError: (e) => setError({ message: importErrorMessage(e, "The import could not be revalidated."), rule: ruleOf(e) }),
    });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-12 items-start w-full pt-1">
      <div className="flex-1 min-w-0 w-full space-y-6">
        <div>
          <h2 className="text-[23px] leading-[35px] font-semibold text-[#000000] dark:text-white">Ready to import</h2>
          <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">Review the final impact, then explicitly confirm your catalog import.</p>
        </div>

        <div className="space-y-6">
          <div className="rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card p-6 space-y-6">
            <div>
              <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">{session.fileName ?? "Marketplace catalog"}</h3>
              <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">
                {issues.open === 0 ? "All mappings confirmed · Review complete" : `All mappings confirmed · ${num(issues.open)} open issue${issues.open === 1 ? "" : "s"}`}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-y border-[#E3E3E3] dark:border-border">
              <Figure value={num(session.scope.products)} label="Products" />
              <Figure value={num(counters.total)} label="Rows" />
              <Figure value={num(session.scope.newProducts)} label="New products" />
              <Figure value={num(session.scope.updates)} label="Product updates" />
            </div>

            <fieldset className="space-y-3" disabled={!canWrite}>
              <legend className="sr-only">What to import</legend>
              {modes.map((m) => (
                <label key={m.value} className="flex cursor-pointer items-start gap-3 text-[13px] leading-[20px]">
                  <input type="radio" name="commit-mode" className="mt-1 h-4 w-4" checked={mode === m.value} onChange={() => setPicked(m.value as CommitMode)} />
                  <span>
                    <span className="block font-medium text-[#000000] dark:text-white">
                      {m.label}
                      {preview.data && <span className="font-normal text-[#666666]"> · {num(m.value === "include_resolved" ? preview.data.includeResolved : preview.data.cleanOnly)} rows</span>}
                    </span>
                    <span className="block text-[12px] text-[#666666]">{m.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${issues.openErrors === 0 ? "bg-emerald-500" : "bg-amber-500"}`} />
              <span className="text-[12px] leading-[18px] font-medium text-[#000000] dark:text-white">
                {num(issues.openErrors)} blocking issues · {count === undefined ? "–" : num(count)} rows ready to import
              </span>
            </div>
          </div>

          <p className="text-[12px] leading-[18px] text-[#666666]">Your original file is preserved. Rows with an open error are never imported.</p>

          {nothing && <Alert tone="warning">No row can be imported yet. Fix the errors first, then revalidate.</Alert>}
          {stale && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Alert tone="warning">You changed rows after the last validation. Revalidate before importing.</Alert>
              {canWrite && (
                <Button variant="outline" loading={revalidate.isPending} onClick={runRevalidate} className={BTN_OUTLINE}>
                  Revalidate now
                </Button>
              )}
            </div>
          )}
          {error && !stale && (
            <div className="space-y-2">
              <Alert>{error.message}</Alert>
              {error.rule === "no_warehouse" && (
                <Button variant="outline" onClick={onFixSettings} className={BTN_OUTLINE}>
                  Open settings
                </Button>
              )}
            </div>
          )}
          {!canWrite && <p className="text-[11px] text-[#666666]">You can view this import but not start it: the imports write permission is needed.</p>}

          <div className="flex items-center gap-3">
            <Button disabled={!canStart} loading={commit.isPending} onClick={start} className={`${BTN_BLACK} px-6`}>
              Import products
            </Button>
            <Button variant="outline" onClick={() => goTo("review")} className={`${BTN_OUTLINE} px-6`}>
              Back to review
            </Button>
          </div>

          <p className="text-[11px] leading-[17px] text-[#666666] pt-1">Totals above are distinct from the row-level analysis.</p>
        </div>
      </div>

      <ImportSummarySidebar
        isConfirmationStep={issues.open === 0}
        totalProducts={products ?? counters.total}
        unit={products !== undefined ? "products" : "rows"}
        readyCount={count}
        attentionCount={issues.open}
        rowsCount={counters.total}
        newCount={nums.created}
        matchedCount={nums.matched}
        updatedCount={nums.updated}
        readinessPercent={count !== undefined && counters.total > 0 ? Math.floor((count / counters.total) * 100) : undefined}
      />

      <WizardBar status={`${num(products ?? counters.total)} ${products !== undefined ? "products" : "rows"} detected · ${num(issues.open)} require attention`} onCancel={onCancel} onSaveDraft={onSaveDraft}>
        <Button disabled={!canStart} loading={commit.isPending} onClick={start} className={BAR_PRIMARY}>
          {count === undefined ? "Import" : `Import ${num(count)} rows`}
        </Button>
      </WizardBar>
    </div>
  );
}
