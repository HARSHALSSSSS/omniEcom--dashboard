import { useState } from "react";
import { Download, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadRunFile } from "./downloadRun";
import { CATEGORY_LABEL, FORMAT_LABEL, FORMAT_SHORT, paramSummary } from "./reportsFormat";
import { FIELD_SELECT } from "@/components/procurement/procurementUi";
import { formatDateTime } from "@/utils/format";
import type { Catalog, CatalogEntry, FeaturedReport, ReportFormat } from "@/types/reports";

const CARD = "flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-5";

interface FeaturedProps {
  report: FeaturedReport;
  entry: CatalogEntry | undefined;
  canWrite: boolean;
  noWrite: string | undefined;
  /** key of the export that is running, to lock the buttons */
  busyKey: string | null;
  onGenerate: (report: FeaturedReport, format: ReportFormat) => void;
  onCustomise: (report: FeaturedReport, format: ReportFormat) => void;
}

/** one of the featured downloads: a ready button label ("Download October 2026"), the format, and the last run of this report */
export function FeaturedCard({ report, entry, canWrite, noWrite, busyKey, onGenerate, onCustomise }: FeaturedProps) {
  const [format, setFormat] = useState<ReportFormat>(report.defaultFormat);
  const busy = busyKey === `featured:${report.type}`;
  const last = report.lastRun;
  return (
    <article className={CARD} aria-label={report.title}>
      <div className="space-y-2">
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{report.formats.map((f) => FORMAT_SHORT[f]).join(" / ")}</span>
        <h3 className="text-[15px] font-semibold text-foreground">{report.title}</h3>
        <p className="text-xs text-muted-foreground">{report.description}</p>
        {entry && <p className="text-[11px] text-muted-foreground">{paramSummary(report.suggestedParams, entry) || "Default period"}</p>}
      </div>
      <div className="space-y-2">
        {last && last.status === "succeeded" && last.finishedAt && (
          <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <span>Last generated {formatDateTime(last.finishedAt)}</span>
            {last.downloadable && (
              <button type="button" className="inline-flex items-center gap-1 font-semibold text-foreground underline-offset-2 hover:underline" onClick={() => void downloadRunFile(last)}>
                <Download className="h-3 w-3" aria-hidden />
                Download again
              </button>
            )}
          </p>
        )}
        <div className="flex items-center gap-2">
          <select aria-label={`${report.title} file format`} className={`${FIELD_SELECT} w-24 shrink-0`} value={format} disabled={busy} onChange={(e) => setFormat(e.target.value as ReportFormat)}>
            {report.formats.map((f) => (
              <option key={f} value={f}>
                {FORMAT_SHORT[f]}
              </option>
            ))}
          </select>
          <Button size="sm" className="flex-1 gap-2 text-xs" loading={busy} disabled={!canWrite || (busyKey !== null && !busy)} title={noWrite} onClick={() => onGenerate(report, format)}>
            {!busy && <Download className="h-4 w-4" aria-hidden />}
            {report.buttonLabel}
          </Button>
          <Button variant="outline" size="icon" className="shrink-0" aria-label={`Choose the period and options for ${report.title}`} title={noWrite ?? "Choose the period and options"} disabled={!canWrite} onClick={() => onCustomise(report, format)}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </article>
  );
}

interface CatalogProps {
  catalog: Catalog;
  canWrite: boolean;
  noWrite: string | undefined;
  onGenerate: (entry: CatalogEntry) => void;
  onSchedule: (entry: CatalogEntry) => void;
}

/** every report type the server can export (GET /reports/catalog) */
export function CatalogGrid({ catalog, canWrite, noWrite, onGenerate, onSchedule }: CatalogProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {catalog.types.map((t) => (
        <article key={t.type} className={CARD} aria-label={t.title}>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORY_LABEL[t.category] ?? t.category}</span>
              <span className="font-mono text-[10px] uppercase text-muted-foreground">{t.formats.map((f) => FORMAT_SHORT[f]).join(" / ")}</span>
            </div>
            <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
            <p className="text-xs text-muted-foreground">{t.description}</p>
            <p className="text-[11px] text-muted-foreground">
              Default {FORMAT_LABEL[t.defaultFormat]}. {t.sheets.length > 1 ? `Sheets: ${t.sheets.join(", ")}.` : `Sheet: ${t.sheets[0] ?? t.csvSheet}.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="flex-1 text-xs" disabled={!canWrite} title={noWrite} onClick={() => onGenerate(t)}>
              Generate
            </Button>
            {t.schedulable && (
              <Button size="sm" variant="outline" className="text-xs" disabled={!canWrite} title={noWrite} onClick={() => onSchedule(t)}>
                Schedule
              </Button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
