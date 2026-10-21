import { formatDateTime } from "@/utils/format";
import type { AutomationRun } from "@/types/automation";
import { durationText } from "./autoFormat";
import { RunBadge } from "./AutoUi";

interface Props {
  rows: AutomationRun[];
  refreshing: boolean;
  onOpen: (r: AutomationRun) => void;
}

const COLUMNS = ["Time", "Rule", "What happened", "About", "Duration", "Status"];

export function RunsTable({ rows, refreshing, onOpen }: Props) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity ${refreshing ? "opacity-60" : ""}`} aria-busy={refreshing}>
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
          <tr>
            {COLUMNS.map((c, i) => (
              <th key={c} scope="col" className={`px-4 py-3 ${i === 4 ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="transition-colors hover:bg-muted/30">
              <td className="whitespace-nowrap px-4 py-3 text-[11px] text-muted-foreground">{formatDateTime(r.timestamp)}</td>
              <td className="px-4 py-3 font-semibold text-foreground">{r.ruleName}</td>
              <td className="max-w-[380px] px-4 py-3">
                <button type="button" onClick={() => onOpen(r)} className="text-left text-foreground/90 hover:underline" aria-label={`Open run of ${r.ruleName}: ${r.summary}`}>
                  {r.summary}
                </button>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-foreground">{r.entityName}</div>
                {r.skuOrOrder && r.skuOrOrder !== r.entityName && <div className="font-mono text-[11px] text-blue-600">{r.skuOrOrder}</div>}
              </td>
              <td className="px-4 py-3 text-right font-mono text-muted-foreground">{durationText(r.durationMs)}</td>
              <td className="px-4 py-3">
                <RunBadge status={r.executionStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
