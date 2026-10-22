import { useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { importApi } from "@/api/import.api";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportSettingsSection } from "../ImportSettingsSection";
import { useCreateImport, useDownloadTemplate, useSaveSettings, useUploadImportFile } from "@/hooks/useImport";
import type { ImportSession, ImportSettings, ImportSource } from "@/types/import";
import { Alert, LoadError, PanelSkeleton } from "../ImportStates";
import { BYTES_MB, FILE_EXTENSION, SOURCE_ORDER, formatBytes, hasFile, importErrorMessage, isBusy, num, sourceInfo } from "../importFormat";
import { FileIcon } from "./FileIcon";
import { SettingsExtras } from "./SettingsExtras";
import { choiceToStrategy, draftPatch, settingsIncomplete, strategyToChoice, toDraft, type SettingsDraft } from "./settingsDraft";
import type { StepProps } from "./stepTypes";
import { BAR_PRIMARY, BTN_OUTLINE } from "./styles";
import { WizardBar } from "./WizardBar";

const STEPS = [
  { n: "01", title: "Upload your spreadsheet", text: "Your original file stays intact." },
  { n: "02", title: "Review automatic matching", text: "Confirm fields and uncertain matches." },
  { n: "03", title: "Import what is ready", text: "Fix exceptions without restarting." },
];

interface Props extends StepProps {
  /** the import named in the URL, when there is one */
  session: ImportSession | undefined;
  settingsOpen: boolean;
  onSettingsOpen: (open: boolean) => void;
  /** the file was accepted and analysed: continue to the column mapping */
  onUploaded: (importId: string) => void;
}

/** Step 2: the file (really sent to the API, with progress) and the collapsible import settings. */
export function UploadStep({ session, options, canWrite, goTo, onCancel, onSaveDraft, onUploaded, settingsOpen, onSettingsOpen }: Props) {
  const [source, setSource] = useState<ImportSource>("csv_excel");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Partial<SettingsDraft>>({});
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  /** the import created for the file being sent: a retry of the same file reuses it instead of starting another */
  const draftImport = useRef<{ id: string; key: string } | null>(null);

  const create = useCreateImport();
  const upload = useUploadImportFile();
  const save = useSaveSettings();
  const template = useDownloadTemplate();

  const opts = options.data;
  const sources = useMemo(() => {
    const rank = (id: string) => {
      const i = SOURCE_ORDER.indexOf(id as ImportSource);
      return i === -1 ? SOURCE_ORDER.length : i;
    };
    // "csv_excel" (the type is picked from the file) is always accepted by POST /imports
    return [...new Set(["csv_excel", ...(opts?.sources ?? [])])].sort((a, b) => rank(a) - rank(b));
  }, [opts]);

  const uploading = create.isPending || upload.isPending;
  const hasUpload = Boolean(session && hasFile(session)) && !file;

  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  if (options.isLoading) return <PanelSkeleton rows={5} />;
  if (options.isError || !opts) return <LoadError title="Import options could not be loaded." message={errorMessage(options.error)} onRetry={() => void options.refetch()} />;

  const base = session?.settings ?? opts.defaults;
  const draft: SettingsDraft = { ...toDraft(base), ...edits };
  const dupChoice = strategyToChoice(draft.duplicateStrategy);
  const readOnly = !canWrite || Boolean(session && isBusy(session.status));
  const incomplete = settingsIncomplete(draft);
  const patchDraft = (p: Partial<SettingsDraft>) => setEdits((e) => ({ ...e, ...p }));
  const maxMb = opts.limits.maxFileBytes / BYTES_MB;
  const shownError = fileError ?? error;

  const pick = (f: File) => {
    setError(null);
    if (!FILE_EXTENSION.test(f.name)) {
      setFile(null);
      setFileError("Upload a .csv, .tsv or .xlsx file.");
      return;
    }
    if (f.size === 0) {
      setFile(null);
      setFileError("That file is empty.");
      return;
    }
    if (f.size > opts.limits.maxFileBytes) {
      setFile(null);
      setFileError(`That file is ${formatBytes(f.size)}. Files can be at most ${maxMb} MB.`);
      return;
    }
    setFileError(null);
    setFile(f);
  };

  /** the settings the seller changed are saved to the import before the mapping (and so the validation) uses them */
  const saveSettings = async (id: string, saved: ImportSettings): Promise<void> => {
    const patch = draftPatch(draft, saved);
    if (patch) await save.mutateAsync({ id, patch });
  };

  const submit = async () => {
    if (!file) return;
    setError(null);
    setProgress(0);
    const controller = new AbortController();
    abort.current = controller;
    const key = `${source}|${file.name}|${file.size}`;
    try {
      let id = draftImport.current?.key === key ? draftImport.current.id : null;
      if (!id) {
        const created = await create.mutateAsync({ source, fileName: file.name, fileSizeBytes: file.size });
        id = created.id;
        // the earlier attempt (or the draft being replaced) is no longer needed: best effort, never blocks the upload
        const stale = [draftImport.current?.id, session && ["created", "uploaded", "analyzed"].includes(session.status) ? session.id : undefined].filter((x): x is string => Boolean(x) && x !== id);
        for (const old of stale) void importApi.cancel(old).catch(() => undefined);
        draftImport.current = { id, key };
      }
      const done = await upload.mutateAsync({ id, file, onProgress: setProgress, signal: controller.signal });
      draftImport.current = null;
      await saveSettings(id, done.session.settings);
      setFile(null);
      onUploaded(id);
    } catch (e) {
      setError(controller.signal.aborted ? "Upload cancelled." : importErrorMessage(e, "The file could not be uploaded."));
    } finally {
      abort.current = null;
    }
  };

  const saveAndGo = async (after: () => void) => {
    if (!session) return after();
    setError(null);
    try {
      await saveSettings(session.id, session.settings);
      after();
    } catch (e) {
      setError(importErrorMessage(e, "The settings could not be saved."));
    }
  };

  const proceed = () => {
    if (file) void submit();
    else if (hasUpload && session) void saveAndGo(() => goTo("mapping"));
  };

  const stage = create.isPending ? "Preparing the import…" : progress < 100 ? `Uploading… ${progress}%` : "Analyzing the file…";
  const canContinue = canWrite && !uploading && !save.isPending && !incomplete && (Boolean(file) || hasUpload);
  const barStatus = uploading ? stage : file ? `${file.name} · ${formatBytes(file.size)}` : session && hasUpload ? `${session.fileName} · ${num(session.counters.total)} rows` : "Your catalog stays unchanged until you confirm import.";

  const bar = (
    <WizardBar status={barStatus} onCancel={onCancel} onSaveDraft={onSaveDraft}>
      <Button disabled={!canContinue} loading={uploading || save.isPending} onClick={proceed} className={`${BAR_PRIMARY} w-[140px]`}>
        Continue →
      </Button>
    </WizardBar>
  );

  const hiddenInput = (
    <input
      ref={input}
      type="file"
      accept={sourceInfo(source).accept}
      className="hidden"
      disabled={!canWrite || uploading}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) pick(f);
        e.target.value = "";
      }}
    />
  );

  if (settingsOpen) {
    return (
      <>
        {hiddenInput}
        <ImportSettingsSection
          duplicateStrategy={dupChoice}
          onDuplicateStrategyChange={(c) => patchDraft({ duplicateStrategy: choiceToStrategy(c) })}
          importImageUrls={draft.includeImages}
          onImportImageUrlsChange={(v) => patchDraft({ includeImages: v })}
          matchVariants={draft.matchVariants}
          onMatchVariantsChange={(v) => patchDraft({ matchVariants: v })}
          importQuantities={draft.includeQuantities}
          onImportQuantitiesChange={(v) => patchDraft({ includeQuantities: v })}
          disabled={readOnly}
          onBackToUpload={() => void saveAndGo(() => onSettingsOpen(false))}
        >
          <SettingsExtras draft={draft} options={opts} disabled={readOnly} onChange={patchDraft} />
          {error && <Alert>{error}</Alert>}
        </ImportSettingsSection>
        {bar}
      </>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-12 items-start w-full pt-4">
      {hiddenInput}
      <div className="flex-1 min-w-0 w-full space-y-8">
        <div>
          <h2 className="text-[20px] leading-[30px] font-semibold text-[#000000] dark:text-white">Upload your catalog</h2>
          <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">Drop your Excel or CSV file here, or choose a file from your computer.</p>
        </div>

        {/* Dropzone with Error State Support */}
        {shownError && !uploading ? (
          <div role="alert" className="border border-dashed border-destructive/50 rounded-[5px] p-12 bg-destructive/5 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-[16px] font-semibold text-foreground">We couldn&apos;t read this file</h3>
            <p className="text-[12px] text-[#666666] max-w-sm">{shownError}</p>
            <div className="pt-2">
              <Button
                onClick={() => {
                  setFileError(null);
                  setError(null);
                  input.current?.click();
                }}
                className="h-[36px] px-5 bg-[#000000] text-white hover:bg-[#000000]/90 text-[12px] font-medium rounded-[5px]"
              >
                Choose another file
              </Button>
            </div>
            <p className="text-[11px] text-[#666666] pt-1">
              Maximum file size: {maxMb} MB · Supported formats: Excel, CSV
            </p>
          </div>
        ) : (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f && canWrite && !uploading) pick(f);
            }}
            className="min-h-[226px] border border-dashed border-[#E3E3E3] dark:border-border rounded-[5px] py-8 px-6 bg-[#FCFCFC] dark:bg-card/20 text-center flex flex-col items-center justify-center space-y-2.5 transition-colors"
          >
            <FileIcon className="border-[#E3E3E3]" />
            <h3 className="text-[18px] leading-[27px] font-semibold text-[#000000] dark:text-white pt-1">{file ? file.name : hasUpload && session ? (session.fileName ?? "Uploaded file") : "Upload catalog spreadsheet"}</h3>
            {file && <p className="text-[12px] leading-[18px] text-[#666666]">{formatBytes(file.size)}</p>}
            {hasUpload && session && !file && (
              <p className="text-[12px] leading-[18px] text-[#666666]">
                {formatBytes(session.fileSizeBytes)} · {num(session.counters.total)} rows · {num(session.headers.length)} columns · uploaded
              </p>
            )}
            {uploading ? (
              <div className="w-full max-w-sm space-y-2" aria-live="polite">
                <div className="h-[3px] w-full bg-[#E0E0E0] dark:bg-muted overflow-hidden" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={create.isPending ? 0 : progress}>
                  <div className="h-full bg-[#000000] dark:bg-white transition-all" style={{ width: `${create.isPending ? 0 : progress}%` }} />
                </div>
                <div className="flex items-center justify-between text-[12px] text-[#666666]">
                  <span>{stage}</span>
                  <Button variant="outline" className="h-7 text-[11px] rounded-[4px]" onClick={() => abort.current?.abort()}>
                    Cancel upload
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[12px] leading-[18px] text-[#666666] font-normal">or</p>
                <div className="flex items-center gap-2">
                  <Button
                    disabled={!canWrite}
                    onClick={() => input.current?.click()}
                    className="inline-flex items-center justify-center rounded-[5px] font-medium text-[12px] leading-[18px] bg-[#000000] text-white hover:bg-[#000000]/90 h-[36px] w-[152px]"
                  >
                    {hasUpload || file ? "Choose a different file" : "Browse files"}
                  </Button>
                  {file && (
                    <Button variant="ghost" className="h-[36px] text-[12px]" onClick={() => setFile(null)}>
                      Remove
                    </Button>
                  )}
                </div>
              </>
            )}
            <p className="text-[11px] leading-[17px] text-[#666666] font-normal pt-2">
              Maximum file size: {maxMb} MB · Supported formats: Excel, CSV · up to {num(opts.limits.maxRows)} rows
            </p>
          </div>
        )}

        {/* File layout (the API's sources) */}
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="file-layout" className="text-[12px] leading-[18px] font-medium text-[#000000] dark:text-white">
            File layout
          </label>
          <select
            id="file-layout"
            value={source}
            disabled={!canWrite || uploading}
            onChange={(e) => setSource(e.target.value as ImportSource)}
            className="h-[32px] rounded-[5px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card px-2 text-[12px]"
          >
            {sources.map((id) => (
              <option key={id} value={id}>
                {sourceInfo(id).title}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-[#666666]">{sourceInfo(source).description}</span>
        </div>

        {/* Need a starting point? */}
        <div className="space-y-3 pt-2">
          <h4 className="text-[14px] leading-[21px] font-semibold text-[#000000] dark:text-white">Need a starting point?</h4>
          <p className="text-[12px] leading-[18px] text-[#666666] -mt-1.5">Use our product import template with predefined columns for common catalog data.</p>
          <div className="flex items-center gap-3">
            <Button variant="outline" loading={template.isPending && template.variables === "xlsx"} disabled={template.isPending} onClick={() => template.mutate("xlsx")} className={`${BTN_OUTLINE} w-[195px]`}>
              Download Excel template
            </Button>
            <Button variant="outline" loading={template.isPending && template.variables === "csv"} disabled={template.isPending} onClick={() => template.mutate("csv")} className={`${BTN_OUTLINE} w-[190px]`}>
              Download CSV template
            </Button>
          </div>
          {template.isError && <Alert>{errorMessage(template.error, "The template could not be downloaded.")}</Alert>}

          {/* Expected template structure preview */}
          <div className="w-full min-h-[44px] flex items-center bg-[#F6F6F6] dark:bg-muted/40 rounded-[3px] px-3.5 py-2.5 text-[11px] leading-[17px] font-normal text-[#666666]">
            Product name · SKU · Brand · Category · Price · Description · Barcode · Weight · Images
          </div>
        </div>

        {/* Import settings collapsed */}
        <div className="border-t border-[#E3E3E3] dark:border-border pt-3">
          <button type="button" onClick={() => onSettingsOpen(true)} className="flex items-center justify-between w-full py-1 text-left hover:opacity-80 transition-opacity">
            <span className="text-[13px] leading-[20px] font-medium text-[#000000] dark:text-white">Import settings</span>
            <span className="text-[16px] leading-[24px] font-normal text-[#000000] dark:text-white">+</span>
          </button>
          <p className="text-[12px] leading-[18px] text-[#666666] mt-0.5">Your products will be reviewed before anything is added or updated.</p>
        </div>
      </div>

      {/* Right Rail: Import guidance (A safe path to your catalog) */}
      <div className="w-full lg:w-[340px] xl:w-[380px] shrink-0">
        <div className="w-full min-h-[446px] bg-[#F6F6F6] dark:bg-card/40 rounded-[6px] border border-[#E3E3E3] dark:border-border p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white mb-6">A safe path to your catalog</h3>
            <div className="space-y-4">
              {STEPS.map((s, i) => (
                <div key={s.n}>
                  {i > 0 && <div className="h-[1px] bg-[#E3E3E3] dark:bg-border my-4" />}
                  <div className="space-y-1">
                    <div className="text-[13px] leading-[20px] font-medium text-[#000000] dark:text-white flex items-baseline gap-3">
                      <span className="text-[11px] leading-[17px] font-medium text-[#666666] w-5 shrink-0">{s.n}</span>
                      <span>{s.title}</span>
                    </div>
                    <p className="text-[12px] leading-[18px] text-[#666666] pl-8">{s.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-8">
            <p className="text-[12px] leading-[18px] font-medium text-[#000000] dark:text-white">No records are silently merged.</p>
          </div>
        </div>
      </div>
      {bar}
    </div>
  );
}
