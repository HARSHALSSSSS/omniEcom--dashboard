import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Database, Download, FileSpreadsheet, FileText, Layers, Loader2, Package, Store } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { errorMessage } from "@/api/errors";
import { importApi } from "@/api/import.api";
import { FileDropzone } from "@/components/common/FileDropzone";
import { Button } from "@/components/ui/button";
import { useCreateImport, useDownloadTemplate, useUploadImportFile } from "@/hooks/useImport";
import type { ImportOptions, ImportSession, ImportSource } from "@/types/import";
import { Alert, LoadError, PanelSkeleton } from "../ImportStates";
import { BYTES_MB, FILE_EXTENSION, SOURCE_ORDER, formatBytes, hasFile, importErrorMessage, num, sourceInfo } from "../importFormat";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  csv_excel: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  shopify: Layers,
  amazon: Package,
  flipkart: Store,
  marketplace: Store,
  erp: Database,
  csv: FileText,
  tsv: FileText,
};

interface Props {
  /** the import named in the URL, when there is one */
  session: ImportSession | undefined;
  options: UseQueryResult<ImportOptions>;
  canWrite: boolean;
  /** the file was accepted and analysed: continue to the column mapping */
  onUploaded: (importId: string) => void;
  onContinue: () => void;
}

/** Steps "choose the source" and "upload the file": the bytes really go to the API, with progress. */
export function SourceStep({ session, options, canWrite, onUploaded, onContinue }: Props) {
  const [source, setSource] = useState<ImportSource>("csv_excel");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const abort = useRef<AbortController | null>(null);
  /** the import created for the file being sent: a retry of the same file reuses it instead of starting another */
  const draft = useRef<{ id: string; key: string } | null>(null);

  const create = useCreateImport();
  const upload = useUploadImportFile();
  const template = useDownloadTemplate();

  const opts = options.data;
  const sources = useMemo(() => {
    const rank = (id: string) => {
      const i = SOURCE_ORDER.indexOf(id as ImportSource);
      return i === -1 ? SOURCE_ORDER.length : i;
    };
    // "csv_excel" (the type is picked from the file) is always accepted by POST /imports, even though the options list the concrete formats
    return [...new Set(["csv_excel", ...(opts?.sources ?? [])])].sort((a, b) => rank(a) - rank(b));
  }, [opts]);
  const current = sourceInfo(source);
  const uploading = create.isPending || upload.isPending;
  const hasUpload = Boolean(session && hasFile(session)) && !replacing;

  // closing the tab mid-upload would lose the file: ask first
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  if (options.isLoading) return <PanelSkeleton rows={5} />;
  if (options.isError || !opts) return <LoadError title="Import options could not be loaded." message={errorMessage(options.error)} onRetry={() => void options.refetch()} />;

  const maxMb = opts.limits.maxFileBytes / BYTES_MB;
  const presets = opts.presets.filter((p) => p.code !== "generic");

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

  const submit = async () => {
    if (!file) return;
    setError(null);
    setProgress(0);
    const controller = new AbortController();
    abort.current = controller;
    const key = `${source}|${file.name}|${file.size}`;
    try {
      let id = draft.current?.key === key ? draft.current.id : null;
      if (!id) {
        const created = await create.mutateAsync({ source, fileName: file.name, fileSizeBytes: file.size });
        id = created.id;
        // the earlier attempt (or the draft being replaced) is no longer needed: best effort, never blocks the upload
        const stale = [draft.current?.id, session && ["created", "uploaded", "analyzed"].includes(session.status) ? session.id : undefined].filter((x): x is string => Boolean(x) && x !== id);
        for (const old of stale) void importApi.cancel(old).catch(() => undefined);
        draft.current = { id, key };
      }
      await upload.mutateAsync({ id, file, onProgress: setProgress, signal: controller.signal });
      draft.current = null;
      setFile(null);
      setReplacing(false);
      onUploaded(id);
    } catch (e) {
      setError(controller.signal.aborted ? "Upload cancelled." : importErrorMessage(e, "The file could not be uploaded."));
    } finally {
      abort.current = null;
    }
  };

  const stage = create.isPending ? "Preparing the import…" : progress < 100 ? `Uploading… ${progress}%` : "Analyzing the file…";

  return (
    <div className="space-y-6">
      {hasUpload && session ? (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm" aria-label="Uploaded file">
          <h2 className="text-base font-semibold text-foreground">Your file is uploaded</h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
              <div>
                <p className="text-xs font-semibold text-emerald-950">{session.fileName}</p>
                <p className="text-[11px] text-emerald-700">
                  {formatBytes(session.fileSizeBytes)} · {num(session.counters.total)} rows · {num(session.headers.length)} columns
                </p>
              </div>
            </div>
            {canWrite && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setReplacing(true)}>
                Upload a different file
              </Button>
            )}
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm" aria-labelledby="source-title">
            <h2 id="source-title" className="text-base font-semibold text-foreground">
              Where does your catalogue come from?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">We recognise the column names of the common exports and map them for you. You can change every mapping in the next step.</p>

            <div role="radiogroup" aria-label="Catalogue source" className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sources.map((id) => {
                const info = sourceInfo(id);
                const Icon = ICONS[id] ?? FileText;
                const selected = source === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!canWrite || uploading}
                    onClick={() => setSource(id as ImportSource)}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                      selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:bg-muted/40"
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                        {info.title}
                        {info.recommended && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Recommended</span>}
                      </span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{info.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {presets.length > 0 && (
              <ul className="mt-4 space-y-1 text-[11px] text-muted-foreground" aria-label="Recognised layouts">
                {presets.map((p) => (
                  <li key={p.code}>
                    <span className="font-semibold text-foreground">{p.label}:</span> {p.description}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
              <div>
                <p className="text-xs font-medium text-foreground">Starting from scratch?</p>
                <p className="text-[11px] text-muted-foreground">The template has every column the importer understands and an example row.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" loading={template.isPending && template.variables === "csv"} disabled={template.isPending} onClick={() => template.mutate("csv")}>
                  <Download className="h-3.5 w-3.5" /> CSV template
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" loading={template.isPending && template.variables === "xlsx"} disabled={template.isPending} onClick={() => template.mutate("xlsx")}>
                  <Download className="h-3.5 w-3.5" /> Excel template
                </Button>
              </div>
            </div>
            {template.isError && (
              <div className="mt-3">
                <Alert>{errorMessage(template.error, "The template could not be downloaded.")}</Alert>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-sm" aria-labelledby="upload-title">
            <h2 id="upload-title" className="text-base font-semibold text-foreground">
              Upload your file
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {current.title}: .csv, .tsv or .xlsx, up to {maxMb} MB and {num(opts.limits.maxRows)} rows.
            </p>
            <div className="mt-5">
              <FileDropzone
                accept={current.accept}
                maxSizeMb={maxMb}
                helpText={`CSV, TSV or XLSX up to ${maxMb} MB (${num(opts.limits.maxRows)} rows)`}
                uploading={uploading}
                progress={create.isPending ? undefined : progress}
                uploadedFileName={file?.name}
                onFileSelect={pick}
              />
            </div>
            {fileError && (
              <div className="mt-3">
                <Alert>{fileError}</Alert>
              </div>
            )}
            {file && !uploading && (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs">
                  <span className="font-semibold text-foreground">{file.name}</span> <span className="text-muted-foreground">· {formatBytes(file.size)}</span>
                </p>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setFile(null)}>
                  Remove
                </Button>
              </div>
            )}
            {uploading && (
              <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground" aria-live="polite">
                <span>{stage}</span>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => abort.current?.abort()}>
                  Cancel upload
                </Button>
              </div>
            )}
            {error && (
              <div className="mt-4">
                <Alert>{error}</Alert>
              </div>
            )}
          </section>
        </>
      )}

      <div className="flex justify-end gap-3">
        {replacing && (
          <Button variant="outline" onClick={() => setReplacing(false)} disabled={uploading}>
            Keep the current file
          </Button>
        )}
        {hasUpload ? (
          <Button className="gap-2" onClick={onContinue}>
            Continue to column mapping <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="gap-2" disabled={!file || uploading || !canWrite} onClick={() => void submit()}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                Upload and analyze <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
