import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadError, Row } from "@/components/procurement/procurementUi";
import { errorMessage } from "@/api/errors";
import { useReportRun } from "@/hooks/useReports";
import { formatDateTime, formatNumber } from "@/utils/format";
import type { Catalog } from "@/types/reports";
import { downloadRunFile } from "./downloadRun";
import { entryOf, FORMAT_LABEL, formatBytes, paramSummary } from "./reportsFormat";
import { RunStatusPill } from "./RunsTable";

interface Props {
  runId: string | undefined;
  catalog: Catalog | undefined;
  onClose: () => void;
}

/** one run in full (GET /reports/runs/{id}); it keeps polling while the report is still being generated */
export function RunDetailDialog({ runId, catalog, onClose }: Props) {
  const query = useReportRun(runId ?? null);
  const run = query.data;
  return (
    <Dialog open={Boolean(runId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{run?.reportTitle ?? "Report run"}</DialogTitle>
          <DialogDescription>{run ? `Requested ${formatDateTime(run.createdAt)}` : "Loading the run"}</DialogDescription>
        </DialogHeader>
        {query.isLoading && <div role="status" aria-label="Loading the run" className="h-32 animate-pulse rounded-md bg-muted" />}
        {query.isError && !run && <LoadError title="This run could not be loaded." message={errorMessage(query.error)} onRetry={() => void query.refetch()} />}
        {run && (
          <div className="space-y-3 text-xs">
            <Row label="Status" value={<RunStatusPill status={run.status} />} />
            <Row label="Period" value={run.period?.label ?? "-"} />
            <Row label="Options" value={paramSummary(run.params, entryOf(catalog, run.reportType), catalog?.periods) || "Defaults"} />
            <Row label="Format" value={FORMAT_LABEL[run.format]} />
            <Row label="Started by" value={run.trigger === "schedule" ? `Schedule${run.scheduleName ? `: ${run.scheduleName}` : ""}` : run.scheduleName ? `Run now of ${run.scheduleName}` : "A person"} />
            {run.fileName && <Row label="File" value={<span className="break-all font-mono">{run.fileName}</span>} />}
            {run.sizeBytes !== null && <Row label="Size" value={formatBytes(run.sizeBytes)} />}
            {run.rowCount !== null && <Row label="Rows" value={formatNumber(run.rowCount)} />}
            {run.warnings !== null && run.warnings > 0 && <Row label="Warnings" value={`${formatNumber(run.warnings)} flagged in the file`} />}
            {run.finishedAt && <Row label="Finished" value={formatDateTime(run.finishedAt)} />}
            {run.expiresAt && run.status === "succeeded" && <Row label={run.downloadable ? "File kept until" : "File expired"} value={formatDateTime(run.expiresAt)} />}
            {run.settlementDataAvailable === false && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">No marketplace settlement data was recorded for this period, so payouts are estimates.</p>}
            {run.notes.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {run.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            {run.status === "failed" && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{run.error ?? "The report could not be generated."}</p>}
            {(run.status === "queued" || run.status === "running") && <p className="text-muted-foreground" aria-live="polite">This report is being prepared. This view updates by itself.</p>}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" className="h-10 sm:h-9" onClick={onClose}>
            Close
          </Button>
          {run?.downloadable && (
            <Button type="button" size="sm" className="gap-2 h-10 sm:h-9" onClick={() => void downloadRunFile(run)}>
              <Download className="h-4 w-4" aria-hidden />
              Download
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
