import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/utils/format";
import type { AutomationApproval } from "@/types/automation";
import { APPROVE_REASON, actionLabel, impactText } from "./autoFormat";

interface Props {
  rows: AutomationApproval[];
  canWrite: boolean;
  refreshing: boolean;
  /** the approval whose decision is running */
  busyId: string | null;
  onOpen: (a: AutomationApproval) => void;
  onApprove: (a: AutomationApproval) => void;
  onDismiss: (a: AutomationApproval) => void;
}

const COLUMNS = ["Rule", "About", "Proposed action", "Money at stake", "Raised"];

export function ApprovalsTable({ rows, canWrite, refreshing, busyId, onOpen, onApprove, onDismiss }: Props) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-border bg-card shadow-sm transition-opacity ${refreshing ? "opacity-60" : ""}`} aria-busy={refreshing}>
      <table className="w-full min-w-[960px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} scope="col" className="px-4 py-3">
                {c}
              </th>
            ))}
            <th scope="col" className="py-3 pl-2 pr-4 text-right">
              <span className="sr-only">Decide</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((a) => {
            const busy = busyId === a.id;
            return (
              <tr key={a.id} className="transition-colors hover:bg-muted/30">
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onOpen(a)} className="flex flex-col text-left" aria-label={`Review ${a.ruleName}: ${a.entityName}`}>
                    <span className="font-semibold text-foreground hover:underline">{a.ruleName}</span>
                    <span className="text-[11px] text-muted-foreground">{actionLabel(a.actionType)}</span>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{a.entityName}</div>
                  {a.skuOrOrder && a.skuOrOrder !== a.entityName && <div className="font-mono text-[11px] text-blue-600">{a.skuOrOrder}</div>}
                </td>
                <td className="max-w-[320px] px-4 py-3 text-foreground/90">{a.recommendedAction}</td>
                <td className="px-4 py-3 font-semibold">{impactText(a)}</td>
                <td className="px-4 py-3 text-[11px] text-muted-foreground">{formatRelativeTime(a.timestamp)}</td>
                <td className="py-3 pl-2 pr-4">
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={!canWrite || busy} title={canWrite ? undefined : APPROVE_REASON} aria-label={`Dismiss ${a.entityName}`} onClick={() => onDismiss(a)}>
                      Dismiss
                    </Button>
                    <Button type="button" size="sm" className="h-7 text-xs" loading={busy} disabled={!canWrite} title={canWrite ? undefined : APPROVE_REASON} aria-label={`Approve ${a.entityName}`} onClick={() => onApprove(a)}>
                      Approve
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
