import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SELECT } from "@/components/procurement/procurementUi";
import { cn } from "@/utils/cn";
import { formatDateTime, formatNumber } from "@/utils/format";
import { REPORT_TYPES, RUN_STATUSES, RUN_TRIGGERS, type ReportRun, type ReportType, type RunStatus, type RunTrigger } from "@/types/reports";
import { downloadRunFile } from "./downloadRun";
import { FORMAT_SHORT, formatBytes, RUN_STATUS_CLASS, RUN_STATUS_LABEL, TYPE_LABEL } from "./reportsFormat";

const CHIP = "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-semibold";

export function RunStatusPill({ status }: { status: RunStatus }) {
  return <span className={cn(CHIP, RUN_STATUS_CLASS[status])}>{RUN_STATUS_LABEL[status]}</span>;
}

interface FiltersProps {
  type: ReportType | undefined;
  status: RunStatus | undefined;
  trigger: RunTrigger | undefined;
  filtered: boolean;
  total: number;
  onType: (v: string | null) => void;
  onStatus: (v: string | null) => void;
  onTrigger: (v: string | null) => void;
  onClear: () => void;
}

export function RunFilters({ type, status, trigger, filtered, total, onType, onStatus, onTrigger, onClear }: FiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filter report history">
      <select aria-label="Report type" className={SELECT} value={type ?? ""} onChange={(e) => onType(e.target.value || null)}>
        <option value="">All reports</option>
        {REPORT_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABEL[t]}
          </option>
        ))}
      </select>
      <select aria-label="Status" className={SELECT} value={status ?? ""} onChange={(e) => onStatus(e.target.value || null)}>
        <option value="">Any status</option>
        {RUN_STATUSES.map((s) => (
          <option key={s} value={s}>
            {RUN_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <select aria-label="Started by" className={SELECT} value={trigger ?? ""} onChange={(e) => onTrigger(e.target.value || null)}>
        <option value="">Manual and scheduled</option>
        {RUN_TRIGGERS.map((t) => (
          <option key={t} value={t}>
            {t === "manual" ? "Manual only" : "Scheduled only"}
          </option>
        ))}
      </select>
      {filtered && (
        <Button variant="ghost" size="sm" className="text-xs" onClick={onClear}>
          Clear filters
        </Button>
      )}
      <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
        {formatNumber(total)} {total === 1 ? "run" : "runs"}
      </span>
    </div>
  );
}

interface TableProps {
  runs: ReportRun[];
  onOpen: (run: ReportRun) => void;
}

/** the run history: what was generated, for which period, and the file while it is kept */
export function RunsTable({ runs, onOpen }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[760px] border-collapse text-left text-xs">
        <caption className="sr-only">Report run history</caption>
        <thead>
          <tr className="border-b border-border bg-muted/50 text-[11px] font-medium text-muted-foreground">
            <th scope="col" className="px-4 py-3">Report</th>
            <th scope="col" className="px-4 py-3">Period</th>
            <th scope="col" className="px-4 py-3">Format</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3">Requested</th>
            <th scope="col" className="px-4 py-3 text-right">File</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {runs.map((r) => (
            <tr key={r.id} className="hover:bg-muted/40">
              <td className="px-4 py-3">
                <button type="button" className="text-left font-semibold text-foreground underline-offset-2 hover:underline" onClick={() => onOpen(r)}>
                  {r.reportTitle}
                </button>
                <p className="text-[11px] text-muted-foreground">{r.trigger === "schedule" ? `Scheduled${r.scheduleName ? `: ${r.scheduleName}` : ""}` : r.scheduleName ? `Run now: ${r.scheduleName}` : "Manual"}</p>
                {r.status === "failed" && r.error && <p className="mt-0.5 max-w-xs text-[11px] text-rose-700">{r.error}</p>}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{r.period?.label ?? "-"}</td>
              <td className="px-4 py-3">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">{FORMAT_SHORT[r.format]}</span>
              </td>
              <td className="px-4 py-3">
                <RunStatusPill status={r.status} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">{formatDateTime(r.createdAt)}</td>
              <td className="px-4 py-3 text-right">
                {r.downloadable ? (
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" aria-label={`Download ${r.fileName ?? r.reportTitle}`} onClick={() => void downloadRunFile(r)}>
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    {formatBytes(r.sizeBytes) || "Download"}
                  </Button>
                ) : r.status === "succeeded" ? (
                  <span className="text-[11px] text-muted-foreground">Expired</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
