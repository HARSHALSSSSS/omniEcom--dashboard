import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGrid, Loader2, Table } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/useToast";
import { useBulkResolve, useCommitPreview, useDownloadErrors, useImportIssuesByCodes, useImportSummary, useResolveIssue, useRevalidateImport, useValidateImport } from "@/hooks/useImport";
import type { ImportIssue, ImportSession, IssueAction } from "@/types/import";
import { ImportProgress } from "../ImportProgress";
import { ImportSummarySidebar } from "../ImportSummarySidebar";
import { Alert, LoadError } from "../ImportStates";
import { canReview, importErrorMessage, num } from "../importFormat";
import { issuesUrl } from "../importParams";
import { BUCKET_ORDER, PILL_LABEL, SIDEBAR_LABEL, bucketsOf, existingProductOf, existingSkuOf, isDuplicateIssue, planNumbers, productName, suggestionText, type ExceptionBucket } from "./exceptions";
import type { StepProps } from "./stepTypes";
import { BAR_PRIMARY, BTN_BLACK, BTN_OUTLINE } from "./styles";
import { WizardBar } from "./WizardBar";

interface Props extends StepProps {
  session: ImportSession;
  /** the kind of exception on screen (undefined: the first kind that has open issues) */
  bucket: ExceptionBucket | undefined;
  onBucket: (bucket: ExceptionBucket) => void;
  /** import what is ready: continue to the confirmation with "clean rows only" */
  onImportReady: () => void;
}

const PILL_ON = "bg-[#000000] text-white dark:bg-white dark:text-black";
const PILL_OFF = "bg-[#F6F6F6] dark:bg-card border border-[#E3E3E3] dark:border-border text-[#666666] hover:text-black dark:hover:text-white";
const TOGGLE_ON = "bg-[#000000] text-white dark:bg-white dark:text-black";
const TOGGLE_OFF = "text-[#666666] hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-muted";
const SMALL_BLACK = "bg-[#000000] text-white hover:bg-[#000000]/90 dark:bg-white dark:text-black font-medium text-[11px] h-[28px] px-3 rounded-[4px]";
const SMALL_OUTLINE = "text-[11px] h-[28px] border border-[#E3E3E3] dark:border-border text-[#000000] dark:text-white hover:bg-neutral-50 hover:dark:bg-muted font-medium px-3 rounded-[4px] bg-white dark:bg-card";

/** Step 4: the validation of the whole file, then only the exceptions: cards or table, one kind at a time, with the recovery actions. */
export function ReviewStep({ session, canWrite, goTo, onCancel, onSaveDraft, bucket, onBucket, onImportReady }: Props) {
  const navigate = useNavigate();
  const reviewable = canReview(session.status);
  const summary = useImportSummary(session.id, reviewable);
  const preview = useCommitPreview(session.id, reviewable);
  const resolve = useResolveIssue(session.id);
  const bulk = useBulkResolve(session.id);
  const revalidate = useRevalidateImport(session.id);
  const validate = useValidateImport(session.id);
  const download = useDownloadErrors(session.id);
  const [view, setView] = useState<"card" | "table">("card");
  const [limit, setLimit] = useState(25);
  const [error, setError] = useState<string | null>(null);

  const buckets = bucketsOf(summary.data);
  const active = bucket ?? buckets.find((b) => b.open > 0)?.bucket ?? "categories";
  const info = buckets.find((b) => b.bucket === active) ?? buckets[0];
  const issues = useImportIssuesByCodes(session.id, info?.codes ?? [], limit, reviewable);
  const { status, counters } = session;
  const total = counters.total;
  const products = session.products > 0 ? session.products : undefined;
  const unit = products !== undefined ? "products" : "rows";
  const nums = planNumbers(session);
  const attention = session.issues.open;
  const ready = preview.data?.cleanOnly ?? (summary.data ? (summary.data.rows.valid ?? 0) : counters.valid);

  const startValidation = () => {
    setError(null);
    validate.mutate(undefined, { onError: (e) => setError(importErrorMessage(e, "The analysis could not be started.")) });
  };

  const bar = (primary: React.ReactNode, text: string) => (
    <WizardBar status={text} onCancel={onCancel} onSaveDraft={onSaveDraft}>
      {primary}
    </WizardBar>
  );

  // ---- the analysis is running, failed or has not started
  if (status === "validating") {
    return (
      <div className="w-full pt-1">
        <div className="p-8 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card space-y-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <div>
              <h2 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">Validating your file</h2>
              <p className="text-[12px] leading-[18px] text-[#666666] mt-1">Checking SKUs, titles, categories, prices, barcodes, stock and image links against your catalogue.</p>
            </div>
          </div>
          <ImportProgress session={session} mode="validate" />
        </div>
        {bar(
          <Button disabled className={`${BAR_PRIMARY} w-[140px]`}>
            Continue →
          </Button>,
          `${num(counters.processed)} of ${num(total)} rows checked`,
        )}
      </div>
    );
  }

  if (status === "failed" || !reviewable) {
    const failed = status === "failed";
    const done = status === "committing" || status === "committed";
    return (
      <div className="w-full pt-1 space-y-6">
        <div className="p-8 rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card space-y-4">
          <h2 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">{failed ? "The import failed" : done ? "This import has already started" : "Ready to analyze"}</h2>
          <p className="text-[12px] leading-[18px] text-[#666666]">
            {failed
              ? (session.failureMessage ?? "The import stopped before it finished.")
              : done
                ? "Its progress and result are on the import step."
                : `${num(total)} rows from ${session.fileName ?? "the catalog"} will be checked. Nothing is imported yet.`}
          </p>
          {(validate.isError || error) && <Alert>{error ?? "The analysis could not be started."}</Alert>}
          <div className="flex gap-3">
            {done ? (
              <Button className={BTN_BLACK} onClick={() => goTo("import")}>
                Open the import
              </Button>
            ) : (
              canWrite && (
                <Button className={BTN_BLACK} loading={validate.isPending} onClick={startValidation}>
                  {failed ? "Validate again" : "Start validation"}
                </Button>
              )
            )}
            <Button variant="outline" className={BTN_OUTLINE} onClick={() => goTo("mapping")}>
              Back to mapping
            </Button>
          </div>
        </div>
        {bar(
          <Button disabled className={`${BAR_PRIMARY} w-[140px]`}>
            Continue →
          </Button>,
          "Your catalog stays unchanged until you confirm import.",
        )}
      </div>
    );
  }

  if (summary.isError && !summary.data) {
    return <LoadError title="The issue summary could not be loaded." message={errorMessage(summary.error)} onRetry={() => void summary.refetch()} />;
  }

  // ---- the exceptions
  const acceptable = (i: ImportIssue) => (isDuplicateIssue(i) ? "use_existing" : "accept_suggestion") satisfies IssueAction;
  const canAccept = (i: ImportIssue) => canWrite && (isDuplicateIssue(i) ? Boolean(existingProductOf(i)) : Boolean(i.suggestion));
  const run = (i: ImportIssue, action: IssueAction, done: string) =>
    resolve.mutate(
      { issueId: i.id, action },
      {
        onSuccess: () => toast({ title: "Resolution applied", description: done }),
        onError: (e) => toast({ title: "Could not apply the resolution", description: importErrorMessage(e), variant: "destructive" }),
      },
    );
  const pendingId = resolve.isPending ? resolve.variables?.issueId : undefined;
  const openIssue = (i: ImportIssue) => navigate(`${issuesUrl(session.id)}?issue=${i.id}`);
  const withSuggestion = issues.items.filter((i) => !isDuplicateIssue(i) && i.suggestion).length;

  const acceptAll = async () => {
    try {
      let applied = 0;
      for (const code of info?.codes ?? []) applied += (await bulk.mutateAsync({ code, action: "accept_suggestion" })).applied;
      toast({ title: "Suggestions accepted", description: `${num(applied)} issue${applied === 1 ? "" : "s"} resolved.` });
    } catch (e) {
      toast({ title: "Could not accept the suggestions", description: importErrorMessage(e), variant: "destructive" });
    }
  };

  const runRevalidate = () =>
    revalidate.mutate(undefined, {
      onSuccess: (res) => {
        toast({ title: res.queued ? "Revalidation started" : "Revalidation complete", description: res.queued ? undefined : `${num(res.remainingIssuesCount)} issue(s) remain.` });
        if (!res.queued && res.remainingIssuesCount === 0) goTo("import");
      },
      onError: (e) => toast({ title: "Could not revalidate", description: importErrorMessage(e), variant: "destructive" }),
    });

  return (
    <div className="flex flex-col lg:flex-row gap-12 items-start w-full pt-1">
      <div className="flex-1 min-w-0 w-full space-y-6">
        {/* Header with Switch between Table and Card View */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[23px] leading-[35px] font-semibold text-[#000000] dark:text-white">Only exceptions need you</h2>
            <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">Resolve uncertain items here. Your file and confirmed mappings stay intact.</p>
          </div>

          {/* View Mode Switcher Toggle */}
          <div className="flex items-center gap-1 border border-[#E3E3E3] dark:border-border rounded-[5px] p-0.5 bg-white dark:bg-card">
            <button type="button" title="Card view" aria-pressed={view === "card"} onClick={() => setView("card")} className={`flex items-center gap-1.5 px-3 py-1 rounded-[4px] text-[12px] leading-[18px] font-medium transition-colors ${view === "card" ? TOGGLE_ON : TOGGLE_OFF}`}>
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button type="button" title="Table view" aria-pressed={view === "table"} onClick={() => setView("table")} className={`flex items-center gap-1.5 px-3 py-1 rounded-[4px] text-[12px] leading-[18px] font-medium transition-colors ${view === "table" ? TOGGLE_ON : TOGGLE_OFF}`}>
              <Table className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {BUCKET_ORDER.filter((b) => b !== "other" || (buckets.find((x) => x.bucket === "other")?.open ?? 0) > 0).map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={active === b}
              onClick={() => {
                setLimit(25);
                onBucket(b);
              }}
              className={`px-3.5 py-1.5 rounded-[5px] text-[12px] leading-[18px] font-medium transition-colors ${active === b ? PILL_ON : PILL_OFF}`}
            >
              {PILL_LABEL[b](buckets.find((x) => x.bucket === b)?.open ?? 0)}
            </button>
          ))}
        </div>

        {withSuggestion > 1 && canWrite && (
          <div>
            <button type="button" disabled={bulk.isPending} onClick={() => void acceptAll()} className="text-[12px] font-medium text-[#000000] dark:text-white underline underline-offset-2 disabled:opacity-50">
              {bulk.isPending ? "Accepting…" : `Accept all ${num(info?.open ?? withSuggestion)} suggestions`}
            </button>
          </div>
        )}

        {issues.isError && <LoadError title="The issues could not be loaded." message={errorMessage(issues.error)} onRetry={issues.refetch} />}
        {error && <Alert>{error}</Alert>}

        {/* Content Based on Selected View Mode: Cards vs Table */}
        {!issues.isError && issues.items.length === 0 ? (
          <div className="rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card p-6" role="status">
            <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">{issues.isLoading ? "Loading…" : "No exceptions of this kind"}</h3>
            <p className="text-[12px] leading-[18px] text-[#666666] mt-1">{attention === 0 ? "Every row passed the checks. You can import now." : "Pick another kind above to see what still needs a decision."}</p>
          </div>
        ) : view === "card" ? (
          <div className="space-y-4">
            {issues.items.map((i) =>
              isDuplicateIssue(i) ? (
                <div key={i.id} className="rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card p-6 space-y-4">
                  <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">Potential duplicates · {productName(i)}</h3>
                  <p className="text-[12px] leading-[18px] text-[#666666] -mt-2">
                    CSV SKU: {i.productData.sku ?? "–"} · Existing master product: {existingSkuOf(i)}
                  </p>
                  {i.duplicateMatch && (
                    <p className="text-[11px] leading-[17px] text-[#666666] -mt-2">
                      {i.duplicateMatch.existingTitle} · {i.duplicateMatch.confidence} match · {i.duplicateMatch.reason}
                    </p>
                  )}
                  <p className="text-[12px] leading-[18px] text-[#666666]">{i.description}</p>
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button disabled={!canWrite || !existingProductOf(i) || pendingId === i.id} onClick={() => run(i, "use_existing", "Existing product will be updated.")} className={BTN_BLACK}>
                      Update existing product
                    </Button>
                    <Button variant="outline" disabled={!canWrite || pendingId === i.id} onClick={() => run(i, "create_new", "Will create as a new independent product.")} className={`${BTN_OUTLINE}`}>
                      Create new product
                    </Button>
                    <span className="text-[12px] leading-[18px] text-[#666666] pl-2">No records are silently merged.</span>
                  </div>
                </div>
              ) : (
                <div key={i.id} className="rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">{productName(i)}</h3>
                    <span className="text-[11px] leading-[17px] font-mono font-medium text-[#666666] bg-[#F6F6F6] dark:bg-muted border border-[#E3E3E3]/60 px-2 py-0.5 rounded-[3px]">Row {i.rowNumber}</span>
                  </div>

                  <div className="space-y-2 text-[12px] leading-[18px]">
                    <div className="font-medium text-[#000000] dark:text-white">{i.title}</div>
                    <div className="grid grid-cols-[80px_1fr] gap-2">
                      <span className="text-[#666666] uppercase font-semibold text-[10px] leading-[15px] tracking-wider pt-0.5">WHY</span>
                      <span className="text-[#666666]">
                        {i.description} {i.whyItMatters}
                      </span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr] gap-2 pt-1">
                      <span className="text-[#666666] uppercase font-semibold text-[10px] leading-[15px] tracking-wider pt-0.5">SUGGESTION</span>
                      <div>
                        {suggestionText(i) ? (
                          <>
                            <div className="font-semibold text-[#000000] dark:text-white">
                              {i.sourceValue ? `"${i.sourceValue}" → ` : ""}
                              {suggestionText(i)}
                            </div>
                            {i.suggestion && (
                              <p className="text-[#666666] mt-0.5">
                                Matched with {i.suggestion.confidence} confidence. {i.suggestion.confidenceReason}
                              </p>
                            )}
                            <p className="text-[#666666] mt-0.5">{i.impact}</p>
                          </>
                        ) : (
                          <p className="text-[#666666]">No automatic suggestion. Use Change to enter a value.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Button disabled={!canAccept(i) || pendingId === i.id} loading={pendingId === i.id} onClick={() => run(i, acceptable(i), "Suggestion applied.")} className={BTN_BLACK}>
                      Accept
                    </Button>
                    <Button variant="outline" onClick={() => openIssue(i)} className={BTN_OUTLINE}>
                      Change
                    </Button>
                    <Button variant="outline" onClick={() => goTo("mapping")} className={BTN_OUTLINE}>
                      Review mapping
                    </Button>
                  </div>
                  <p className="text-[11px] leading-[17px] text-[#666666]">AI recommends and explains. You decide which mapping is applied.</p>
                </div>
              ),
            )}
          </div>
        ) : (
          /* Exception Table View */
          <div className="border border-[#E3E3E3] dark:border-border rounded-[4px] overflow-x-auto bg-white dark:bg-card">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="h-[27px] bg-[#F6F6F6] dark:bg-muted/40 border-b border-[#E3E3E3] dark:border-border text-[11px] leading-[16px] font-medium text-[#666666]">
                  <th className="py-1 px-3 font-medium w-14">Row</th>
                  <th className="py-1 px-3 font-medium">Product</th>
                  <th className="py-1 px-3 font-medium">Issue</th>
                  <th className="py-1 px-3 font-medium">Field</th>
                  <th className="py-1 px-3 font-medium">Suggested Fix</th>
                  <th className="py-1 px-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {issues.items.map((i) => (
                  <tr key={i.id} className="h-[36px] border-b border-[#E3E3E3] dark:border-border hover:bg-neutral-50/50 transition-colors text-[11px] leading-[16px]">
                    <td className="py-2 px-3 font-mono text-[#666666]">{i.rowNumber}</td>
                    <td className="py-2 px-3">
                      <div className="font-semibold text-[#000000] dark:text-white">{productName(i)}</div>
                      <div className="text-[10px] text-[#666666] font-mono">{i.productData.sku ?? "SKU missing"}</div>
                    </td>
                    <td className="py-2 px-3 font-medium text-[#000000] dark:text-white">{i.title}</td>
                    <td className="py-2 px-3 text-[#666666]">{i.field ?? "–"}</td>
                    <td className="py-2 px-3 font-medium text-[#000000] dark:text-white">{isDuplicateIssue(i) ? `Match: ${existingSkuOf(i)}` : (suggestionText(i) ?? "–")}</td>
                    <td className="py-2 px-3 text-right space-x-1.5 whitespace-nowrap">
                      <Button disabled={!canAccept(i) || pendingId === i.id} onClick={() => run(i, acceptable(i), `Applied fix for row ${i.rowNumber}.`)} className={SMALL_BLACK}>
                        Accept
                      </Button>
                      <Button variant="outline" onClick={() => openIssue(i)} className={SMALL_OUTLINE}>
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {issues.total > issues.items.length && limit < 100 && (
          <div>
            <Button variant="outline" className={BTN_OUTLINE} onClick={() => setLimit(100)}>
              Show more
            </Button>
          </div>
        )}

        {/* Recovery Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => navigate(issuesUrl(session.id))} className={BTN_OUTLINE}>
              Fix in platform
            </Button>
            <Button variant="outline" loading={download.isPending} disabled={session.issues.total === 0} onClick={() => download.mutate()} className={BTN_OUTLINE}>
              Download corrected file
            </Button>
            <Button variant="outline" disabled={!canWrite} loading={revalidate.isPending} onClick={runRevalidate} className={BTN_OUTLINE}>
              Revalidate
            </Button>
          </div>
          <span className="text-[12px] leading-[18px] text-[#666666]">Fix → Revalidate → Continue</span>
        </div>
        {download.isError && <Alert>{errorMessage(download.error, "The file could not be downloaded.")}</Alert>}
      </div>

      {/* Right Rail: Import Summary */}
      <ImportSummarySidebar
        totalProducts={products ?? total}
        unit={unit}
        readyCount={ready}
        attentionCount={attention}
        rowsCount={total}
        newCount={nums.created}
        matchedCount={nums.matched}
        updatedCount={nums.updated}
        readinessPercent={total > 0 ? Math.floor((ready / total) * 100) : undefined}
        issueGroups={buckets.filter((b) => b.open > 0).map((b) => ({ type: b.bucket, label: SIDEBAR_LABEL[b.bucket](b.open) }))}
        actionsDisabled={!canWrite}
        onSelectIssueType={(t) => {
          setLimit(25);
          onBucket(t);
        }}
        onReviewIssues={() => navigate(issuesUrl(session.id))}
        onImportReady={onImportReady}
      />

      {bar(
        <Button onClick={() => goTo("import")} className={`${BAR_PRIMARY} w-[140px]`}>
          Continue →
        </Button>,
        `${num(products ?? total)} ${unit} detected · ${num(attention)} require attention`,
      )}
    </div>
  );
}
