import type { ImportIssue } from "@/types/import";
import { Skeleton } from "@/components/ui/skeleton";
import { codeLabel } from "../importFormat";

const SEVERITY = { error: "bg-red-50 text-red-700", warning: "bg-amber-50 text-amber-800" } as const;
const STATUS = { open: "text-red-700", resolved: "text-emerald-700", ignored: "text-muted-foreground" } as const;
const STATUS_LABEL = { open: "Open", resolved: "Resolved", ignored: "Ignored" } as const;

export function IssueListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading issues">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

interface Props {
  issues: ImportIssue[];
  selectedId: string | undefined;
  refreshing: boolean;
  onSelect: (issue: ImportIssue) => void;
}

/** one numbered page of issues; the row number is the line of the file */
export function IssueList({ issues, selectedId, refreshing, onSelect }: Props) {
  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-card ${refreshing ? "opacity-70" : ""}`}>
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Import issues</caption>
        <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
          <tr>
            <th scope="col" className="w-16 py-2.5 pl-4 pr-2">
              Row
            </th>
            <th scope="col" className="px-2 py-2.5">
              Issue
            </th>
            <th scope="col" className="hidden px-2 py-2.5 sm:table-cell">
              Value
            </th>
            <th scope="col" className="py-2.5 pl-2 pr-4 text-right">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {issues.map((issue) => {
            const selected = issue.id === selectedId;
            return (
              <tr key={issue.id} className={selected ? "bg-primary/5" : "hover:bg-muted/30"}>
                <td className="py-2.5 pl-4 pr-2 font-mono font-semibold text-muted-foreground">{issue.rowNumber}</td>
                <td className="px-2 py-2.5">
                  <button type="button" onClick={() => onSelect(issue)} className="block w-full text-left" aria-label={`Open issue for row ${issue.rowNumber}: ${issue.title}`} aria-current={selected ? "true" : undefined}>
                    <span className="block font-semibold text-foreground">{issue.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY[issue.severity]}`}>{issue.severity}</span>
                      <span className="text-[11px] text-muted-foreground">{codeLabel(issue.code)}</span>
                      {issue.productData.title && <span className="line-clamp-1 text-[11px] text-muted-foreground">· {issue.productData.title}</span>}
                    </span>
                  </button>
                </td>
                <td className="hidden max-w-[160px] truncate px-2 py-2.5 font-mono text-[11px] text-muted-foreground sm:table-cell" title={issue.sourceValue ?? undefined}>
                  {issue.sourceValue || "—"}
                </td>
                <td className={`py-2.5 pl-2 pr-4 text-right text-[11px] font-semibold ${STATUS[issue.status]}`}>{STATUS_LABEL[issue.status]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
