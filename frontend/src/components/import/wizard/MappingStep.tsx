import { useMemo, useState } from "react";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/useToast";
import { useCommitPreview, useImportMapping, useImportSummary, useUpdateMapping, useValidateImport } from "@/hooks/useImport";
import { cn } from "@/utils/cn";
import type { ImportSession, MappingColumn, MappingView, TargetField } from "@/types/import";
import { ImportSummarySidebar } from "../ImportSummarySidebar";
import { Alert, LoadError, PanelSkeleton } from "../ImportStates";
import { canReview, importErrorMessage, num } from "../importFormat";
import { SIDEBAR_LABEL, bucketsOf, planNumbers, type ExceptionBucket } from "./exceptions";
import { FileIcon } from "./FileIcon";
import type { StepProps } from "./stepTypes";
import { BAR_PRIMARY, BTN_BLACK, BTN_OUTLINE } from "./styles";
import { WizardBar } from "./WizardBar";

const IGNORE = "";
/** a match below this confidence is shown as "Needs review" */
const REVIEW_BELOW = 80;

interface Props extends StepProps {
  session: ImportSession;
  /** the side panel's "Import N ready" */
  onImportReady: () => void;
  /** a kind of exception was picked in the side panel */
  onSelectIssueType: (type: ExceptionBucket) => void;
}

interface Bar {
  label: string;
  /** field keys (or groups) that answer this bar */
  match: (f: TargetField | undefined) => boolean;
}

const BARS: Bar[] = [
  { label: "Product match", match: (f) => f?.key === "title" },
  { label: "SKU match", match: (f) => f?.key === "sku" },
  { label: "Variant match", match: (f) => f?.group === "variants" },
  { label: "Category mapping", match: (f) => f?.key === "category" },
  { label: "Image mapping", match: (f) => f?.group === "media" },
];

/** the design's "Automatic matching" lines, answered by the real mapping: how sure the API is about each kind of column */
function matchingBars(view: MappingView, fields: TargetField[]) {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  return BARS.map((bar) => {
    const cols = view.columns.filter((c) => c.targetField && bar.match(byKey.get(c.targetField)));
    const best = cols.reduce<MappingColumn | null>((a, c) => (!a || c.confidence > a.confidence ? c : a), null);
    return {
      label: bar.label,
      width: best ? Math.max(4, Math.min(100, best.confidence)) : 0,
      text: best ? `${cols.length} ${cols.length === 1 ? "column" : "columns"} · ${best.confidence}% match` : "Not mapped",
    };
  });
}

function statusOf(col: MappingColumn): "review" | "ignored" | "matched" {
  if (!col.targetField) return "ignored";
  if (col.status === "matched" && col.confidence < REVIEW_BELOW) return "review";
  return "matched";
}

/** Step 3: the file's columns against the product fields (auto-detected by the API), then the analysis of the whole file. */
export function MappingStep({ session, options, canWrite, goTo, onCancel, onSaveDraft, onImportReady, onSelectIssueType }: Props) {
  const mapping = useImportMapping(session.id);
  const update = useUpdateMapping(session.id);
  const validate = useValidateImport(session.id);
  const validated = canReview(session.status);
  const summary = useImportSummary(session.id, validated);
  const preview = useCommitPreview(session.id, validated);
  const [editing, setEditing] = useState<MappingColumn | null>(null);
  const [draft, setDraft] = useState(IGNORE);
  const [error, setError] = useState<string | null>(null);
  const fields = useMemo(() => options.data?.targetFields ?? [], [options.data]);

  if (mapping.isLoading || options.isLoading) return <PanelSkeleton rows={6} />;
  if (mapping.isError || !mapping.data) return <LoadError title="The column mapping could not be loaded." message={errorMessage(mapping.error)} onRetry={() => void mapping.refetch()} />;
  if (options.isError || !options.data) return <LoadError title="Import options could not be loaded." message={errorMessage(options.error)} onRetry={() => void options.refetch()} />;

  const view = mapping.data;
  const blocked = view.missingRequired.length > 0;
  const label = (key: string | null) => (key ? (fields.find((f) => f.key === key)?.label ?? key) : "Not imported");
  const total = session.counters.total;
  const buckets = bucketsOf(summary.data);
  const attention = validated ? session.issues.open : undefined;
  const ready = validated ? (preview.data?.cleanOnly ?? (summary.data ? (summary.data.rows.valid ?? 0) : session.counters.valid)) : undefined;
  const nums = planNumbers(session);
  const products = session.products > 0 ? session.products : undefined;

  const openDialog = (col: MappingColumn) => {
    setEditing(col);
    setDraft(col.targetField ?? IGNORE);
  };

  const saveMapping = () => {
    if (!editing) return;
    const col = editing;
    update.mutate(
      { sourceColumn: col.sourceColumn, targetField: draft === IGNORE ? null : draft },
      {
        onSuccess: () => {
          toast({ title: "Column mapping saved", description: `Mapped "${col.sourceColumn}" to "${label(draft === IGNORE ? null : draft)}".` });
          setEditing(null);
        },
      },
    );
  };

  const reset = async () => {
    const changed = view.columns.filter((c) => c.autoTargetField !== c.targetField);
    if (changed.length === 0) {
      toast({ title: "Nothing to reset", description: "Every column already has its automatic match." });
      return;
    }
    try {
      for (const c of changed) await update.mutateAsync({ sourceColumn: c.sourceColumn, targetField: c.autoTargetField });
      toast({ title: "Mappings reset", description: "Restored default automatic column matches." });
    } catch {
      /* the failed change is shown by the error alert */
    }
  };

  const analyze = () => {
    setError(null);
    if (validated) {
      goTo("review");
      return;
    }
    validate.mutate(undefined, {
      onSuccess: () => goTo("review"),
      onError: (e) => setError(importErrorMessage(e, "The analysis could not be started.")),
    });
  };

  const selected = fields.find((f) => f.key === draft);
  const issueGroups = buckets.filter((b) => b.open > 0).map((b) => ({ type: b.bucket, label: SIDEBAR_LABEL[b.bucket](b.open) }));

  return (
    <div className="flex flex-col lg:flex-row gap-12 items-start w-full pt-1">
      {/* Left Column: Analysis, Bars & Mapping Table (takes full available width) */}
      <div className="flex-1 min-w-0 w-full space-y-4">
        {/* Detected File Header */}
        <div className="flex items-start gap-3.5">
          <FileIcon />
          <div>
            <h3 className="text-[15px] leading-[23px] font-semibold text-[#000000] dark:text-white">{session.fileName ?? "Marketplace catalog"}</h3>
            <p className="text-[12px] leading-[18px] text-[#666666] font-normal">
              File detected · {products !== undefined ? `${num(products)} products · ` : ""}
              {num(total)} rows
            </p>
          </div>
        </div>

        {/* Automatic Matching Section */}
        <div className="space-y-3">
          <h3 className="text-[14px] leading-[21px] font-semibold text-[#000000] dark:text-white">Automatic matching</h3>
          <div className="space-y-2 pt-1">
            {matchingBars(view, fields).map((item) => (
              <div key={item.label} className="flex items-center text-[12px] leading-[18px]">
                <span className="w-[160px] text-[#666666] font-normal shrink-0">{item.label}</span>
                <div className="w-[301px] max-w-[40%] sm:max-w-none h-[3px] bg-[#EBEBEB] dark:bg-neutral-800 shrink-0 relative overflow-hidden">
                  <div className="h-[3px] bg-[#4D4D4D] dark:bg-neutral-300" style={{ width: `${item.width}%` }} />
                </div>
                <span className="text-[#000000] dark:text-white font-medium pl-6 shrink-0">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Banner: "Only exceptions need you" */}
        <div className="w-full min-h-[77px] bg-[#F6F6F6] dark:bg-card/40 rounded-[4px] px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-[14px] leading-[21px] font-semibold text-[#000000] dark:text-white">Most of your catalog can be handled automatically.</h4>
            <p className="text-[11px] leading-[17px] text-[#666666] font-normal mt-0.5">We&apos;ll identify matches, map common fields and bring only uncertain rows to your attention.</p>
          </div>
          <div className="shrink-0">
            <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] bg-[#F6F6F6] dark:bg-card border border-[#E3E3E3]/60 dark:border-border text-[11px] leading-[17px] font-medium text-[#000000] dark:text-white">
              {attention === undefined ? "Analysis runs when you continue" : `${num(attention)} require attention`}
            </span>
          </div>
        </div>

        {/* Review Field Mapping Section */}
        <div className="space-y-2 pt-1">
          <div className="flex items-baseline justify-between">
            <div>
              <h3 className="text-[17px] leading-[26px] font-semibold text-[#000000] dark:text-white">Review field mapping</h3>
              <p className="text-[12px] leading-[18px] text-[#666666] font-normal mt-0.5">We matched your spreadsheet columns to master product fields.</p>
            </div>
            <button
              type="button"
              disabled={!canWrite || update.isPending}
              onClick={() => void reset()}
              className="text-[11px] text-[#666666] hover:text-black dark:hover:text-white font-normal underline-offset-2 hover:underline transition-colors cursor-pointer disabled:opacity-50"
            >
              Reset to auto matches
            </button>
          </div>

          {blocked && (
            <Alert tone="warning">Map the required columns first: {view.missingRequired.map((m) => m.label).join(", ")}</Alert>
          )}
          {update.isError && !editing && <Alert>{importErrorMessage(update.error, "The mapping could not be saved.")}</Alert>}

          {/* Mapping Preview Table */}
          <div className="border border-[#E3E3E3] dark:border-border rounded-[4px] bg-[#FFFFFF] dark:bg-card overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="h-[27px] bg-[#F6F6F6] dark:bg-muted/40 border-b border-[#E3E3E3] dark:border-border">
                  <th className="px-3 text-[11px] leading-[16px] font-medium text-[#666666] w-[30%]">Your column</th>
                  <th className="px-3 text-[11px] leading-[16px] font-medium text-[#666666] w-[28%]">Product field</th>
                  <th className="px-3 text-[11px] leading-[16px] font-medium text-[#666666] w-[22%]">Status</th>
                  <th className="px-3 text-[11px] leading-[16px] font-medium text-[#666666] text-right w-[20%]">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.columns.map((row, idx) => {
                  const st = statusOf(row);
                  const needsReview = st === "review";
                  const isLast = idx === view.columns.length - 1;
                  return (
                    <tr
                      key={row.sourceColumn}
                      className={cn(
                        "h-[24px] sm:h-[26px] transition-colors",
                        !isLast && "border-b border-[#E3E3E3] dark:border-border",
                        needsReview ? "bg-[#F4F4F4] dark:bg-muted/60" : "bg-[#FFFFFF] dark:bg-card hover:bg-neutral-50/50",
                      )}
                    >
                      <td className={cn("px-3 py-1 text-[11px] leading-[16px] text-[#000000] dark:text-white", needsReview ? "font-semibold" : "font-normal")}>
                        {row.sourceColumn}
                        {row.isRequired && <span className="ml-1 text-destructive">*</span>}
                      </td>
                      <td className={cn("px-3 py-1 text-[11px] leading-[16px] text-[#000000] dark:text-white", needsReview ? "font-semibold" : "font-normal")}>{label(row.targetField)}</td>
                      <td className={cn("px-3 py-1 text-[11px] leading-[16px]", needsReview ? "font-semibold text-[#666666] dark:text-neutral-300" : "font-normal text-[#666666]")}>
                        {st === "review" ? "Needs review" : st === "ignored" ? "Ignored" : "Matched"}
                      </td>
                      <td className="px-3 py-1 text-right">
                        <button
                          type="button"
                          disabled={!canWrite}
                          aria-label={`Change mapping of ${row.sourceColumn}`}
                          onClick={() => openDialog(row)}
                          className="text-[11px] leading-[16px] font-medium text-[#000000] dark:text-white hover:underline underline-offset-2 transition-opacity cursor-pointer disabled:opacity-50"
                        >
                          Change mapping
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {error && <Alert>{error}</Alert>}
      </div>

      {/* Right Rail: Import Summary Contextual Panel */}
      <ImportSummarySidebar
        totalProducts={products ?? total}
        unit={products !== undefined ? "products" : "rows"}
        readyCount={ready}
        attentionCount={attention}
        rowsCount={total}
        newCount={nums.created}
        matchedCount={nums.matched}
        updatedCount={nums.updated}
        readinessPercent={ready !== undefined && total > 0 ? Math.floor((ready / total) * 100) : undefined}
        issueGroups={issueGroups}
        actionsDisabled={blocked || !canWrite}
        onReviewIssues={validated ? () => goTo("review") : undefined}
        onSelectIssueType={validated ? onSelectIssueType : undefined}
        onImportReady={validated ? onImportReady : undefined}
      />

      {/* Change Column Mapping Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md bg-white dark:bg-card border border-[#E3E3E3] dark:border-border rounded-[8px] p-6 shadow-xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">Change column mapping</DialogTitle>
            <DialogDescription className="text-[12px] leading-[18px] text-[#666666]">
              Map spreadsheet column <span className="font-semibold text-black dark:text-white">&quot;{editing?.sourceColumn}&quot;</span> to a catalog master product field.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            {editing && editing.sampleValues.length > 0 && (
              <div className="bg-[#F6F6F6] dark:bg-muted/40 rounded-[4px] p-3 border border-[#E3E3E3] dark:border-border">
                <div className="text-[10px] uppercase font-semibold text-[#666666] tracking-wider mb-1">Sample values in your file</div>
                <div className="text-[12px] text-[#000000] dark:text-white font-mono break-words">{editing.sampleValues.join(" · ")}</div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="mapping-target" className="text-[12px] font-medium text-[#000000] dark:text-white">
                Destination product field
              </label>
              <select
                id="mapping-target"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full h-[38px] px-3 bg-white dark:bg-card border border-[#E3E3E3] dark:border-border rounded-[5px] text-[13px] text-[#000000] dark:text-white focus:outline-none focus:border-black dark:focus:border-white transition-colors cursor-pointer"
              >
                {fields.map((f) => {
                  const other = view.columns.find((c) => c.targetField === f.key && c.sourceColumn !== editing?.sourceColumn);
                  return (
                    <option key={f.key} value={f.key}>
                      {f.label} {f.required ? "(Required)" : ""}
                      {other ? ` - replaces "${other.sourceColumn}"` : ""}
                    </option>
                  );
                })}
                <option value={IGNORE}>Do not import (Ignore)</option>
              </select>
              <p className="text-[11px] text-[#666666]">{selected?.description || "Select how this column should be stored in master products."}</p>
            </div>
            {update.isError && <Alert>{importErrorMessage(update.error, "The mapping could not be saved.")}</Alert>}
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditing(null)} className={`${BTN_OUTLINE} px-4`}>
              Cancel
            </Button>
            <Button disabled={update.isPending} onClick={saveMapping} className={BTN_BLACK}>
              {update.isPending ? "Saving..." : "Save mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WizardBar
        status={attention === undefined ? `${num(total)} rows detected` : `${num(products ?? total)} ${products !== undefined ? "products" : "rows"} detected · ${num(attention)} require attention`}
        onCancel={onCancel}
        onSaveDraft={onSaveDraft}
      >
        <Button disabled={!canWrite || blocked || update.isPending} loading={validate.isPending} onClick={analyze} className={`${BAR_PRIMARY} w-[140px]`}>
          Continue →
        </Button>
      </WizardBar>
    </div>
  );
}
