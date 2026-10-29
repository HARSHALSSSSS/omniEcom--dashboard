import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SELECT } from "@/components/procurement/procurementUi";
import { cn } from "@/utils/cn";
import { formatDateTime, formatNumber } from "@/utils/format";
import { SCHEDULE_STATUSES, type ReportSchedule, type ScheduleStatus } from "@/types/reports";
import { downloadRunFile } from "./downloadRun";
import { entryOf, FORMAT_SHORT, paramSummary, SCHEDULE_STATUS_CLASS, SCHEDULE_STATUS_LABEL } from "./reportsFormat";
import type { Catalog } from "@/types/reports";

const CHIP = "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-semibold";

export function ScheduleStatusPill({ status }: { status: ScheduleStatus }) {
  return <span className={cn(CHIP, SCHEDULE_STATUS_CLASS[status])}>{SCHEDULE_STATUS_LABEL[status]}</span>;
}

interface FilterProps {
  status: ScheduleStatus | undefined;
  total: number;
  onStatus: (v: string | null) => void;
}

export function ScheduleFilters({ status, total, onStatus }: FilterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2" role="search" aria-label="Filter schedules">
      <select aria-label="Schedule status" className={cn(SELECT, "w-full sm:w-auto")} value={status ?? ""} onChange={(e) => onStatus(e.target.value || null)}>
        <option value="">Active and paused</option>
        {SCHEDULE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {SCHEDULE_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <span className="w-full sm:w-auto sm:ml-auto text-xs text-muted-foreground text-right sm:text-left" aria-live="polite">
        {formatNumber(total)} {total === 1 ? "schedule" : "schedules"}
      </span>
    </div>
  );
}

interface Props {
  schedules: ReportSchedule[];
  catalog: Catalog | undefined;
  canWrite: boolean;
  noWrite: string | undefined;
  /** the schedule an action is running for */
  busyId: string | null;
  onEdit: (s: ReportSchedule) => void;
  onToggle: (s: ReportSchedule) => void;
  onRunNow: (s: ReportSchedule) => void;
  onDelete: (s: ReportSchedule) => void;
}

/** the scheduled reports: cadence, recipients, last and next delivery, and the actions on each */
export function SchedulesTable({ schedules, catalog, canWrite, noWrite, busyId, onEdit, onToggle, onRunNow, onDelete }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[900px] border-collapse text-left text-xs">
        <caption className="sr-only">Scheduled reports</caption>
        <thead>
          <tr className="border-b border-border bg-muted/50 text-[11px] font-medium text-muted-foreground">
            <th scope="col" className="px-4 py-3">Schedule</th>
            <th scope="col" className="px-4 py-3">Format</th>
            <th scope="col" className="px-4 py-3">Cadence</th>
            <th scope="col" className="px-4 py-3">Recipients</th>
            <th scope="col" className="px-4 py-3">Last run</th>
            <th scope="col" className="px-4 py-3">Next delivery</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {schedules.map((s) => {
            const busy = busyId === s.id;
            const last = s.lastRun;
            return (
              <tr key={s.id} className="align-top hover:bg-muted/40">
                <td className="px-4 py-3">
                  <p className="font-semibold text-foreground">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">{s.reportTitle}</p>
                  <p className="text-[11px] text-muted-foreground">{paramSummary(s.params, entryOf(catalog, s.reportType), catalog?.periods)}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">{FORMAT_SHORT[s.format]}</span>
                </td>
                <td className="px-4 py-3 text-foreground">
                  {s.cadence}
                  <p className="text-[11px] text-muted-foreground">{s.timezone}</p>
                </td>
                <td className="max-w-[200px] px-4 py-3 text-[11px] text-muted-foreground">{s.recipients.length ? s.recipients.join(", ") : "In-app notification only"}</td>
                <td className="px-4 py-3 text-[11px] text-muted-foreground">
                  {s.lastRunAt ? formatDateTime(s.lastRunAt) : "Never"}
                  {s.lastRunStatus && <span className="block capitalize">{s.lastRunStatus}</span>}
                  {last?.downloadUrl && (
                    <button type="button" className="mt-0.5 inline-flex items-center gap-1 font-semibold text-foreground underline-offset-2 hover:underline" onClick={() => void downloadRunFile({ id: last.id, fileName: null, format: s.format, reportTitle: s.reportTitle })}>
                      <Download className="h-3 w-3" aria-hidden />
                      Download
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-[11px] text-muted-foreground">{s.nextRunAt ? formatDateTime(s.nextRunAt) : s.status === "paused" ? "Paused" : "-"}</td>
                <td className="px-4 py-3">
                  <ScheduleStatusPill status={s.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Button variant="outline" size="sm" className="text-xs" disabled={!canWrite || busy} title={noWrite} aria-label={`Edit ${s.name}`} onClick={() => onEdit(s)}>
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs" disabled={!canWrite || busy} title={noWrite} aria-label={`${s.status === "active" ? "Pause" : "Resume"} ${s.name}`} onClick={() => onToggle(s)}>
                      {s.status === "active" ? "Pause" : "Resume"}
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs" disabled={!canWrite || busy} title={noWrite} aria-label={`Run ${s.name} now`} onClick={() => onRunNow(s)}>
                      Run now
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs text-red-700 hover:text-red-800" disabled={!canWrite || busy} title={noWrite} aria-label={`Delete ${s.name}`} onClick={() => onDelete(s)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
