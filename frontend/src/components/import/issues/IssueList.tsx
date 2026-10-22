import { Check } from "lucide-react";
import type { IssueX } from "@/types/importProcessing";
import { Skeleton } from "@/components/ui/skeleton";
import { codeLabel } from "../importFormat";
import { severityLabel } from "./issuesModel";

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
  issues: IssueX[];
  selectedId: string | undefined;
  refreshing: boolean;
  /** a revalidation is running: the corrected issues are being checked */
  checking: boolean;
  total: number;
  onSelect: (issue: IssueX) => void;
}

/** one numbered page of issues; the row number is the line of the file */
export function IssueList({ issues, selectedId, refreshing, checking, total, onSelect }: Props) {
  return (
    <div className="space-y-3">
      <div className={`border border-[#E3E3E3] dark:border-border rounded-[4px] overflow-hidden bg-white dark:bg-card ${refreshing ? "opacity-70" : ""}`}>
        <table className="w-full text-left text-[12px] leading-[18px]">
          <caption className="sr-only">Import issues</caption>
          <thead className="bg-[#F6F6F6] dark:bg-muted/50 border-b border-[#E3E3E3] dark:border-border text-[#666666] font-medium text-[11px] leading-[17px] h-[27px]">
            <tr>
              <th scope="col" className="py-1 px-3.5 font-medium w-12">
                Row
              </th>
              <th scope="col" className="py-1 px-3.5 font-medium">
                Product
              </th>
              <th scope="col" className="py-1 px-3.5 font-medium">
                Issue
              </th>
              <th scope="col" className="py-1 px-3.5 font-medium">
                Field
              </th>
              <th scope="col" className="py-1 px-3.5 font-medium">
                Severity
              </th>
              <th scope="col" className="py-1 px-3.5 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E3E3E3] dark:divide-border">
            {issues.map((issue) => {
              const selected = issue.id === selectedId;
              const resolved = issue.status === "resolved";
              const sev = severityLabel(issue);
              return (
                <tr key={issue.id} onClick={() => onSelect(issue)} className={`cursor-pointer transition-colors ${selected ? "bg-[#F0F0F0] dark:bg-muted font-medium" : "hover:bg-[#F9F9F9] dark:hover:bg-muted/40"}`}>
                  <td className="py-2.5 px-3.5 font-mono text-[#666666] text-[11px]">{issue.rowNumber}</td>
                  <td className="py-2.5 px-3.5">
                    <div className="font-semibold text-[#000000] dark:text-white">{issue.productData.title || "Untitled row"}</div>
                    <div className="text-[11px] text-[#666666] font-mono">{issue.productData.sku || "SKU missing"}</div>
                  </td>
                  <td className="py-2.5 px-3.5 font-medium text-[#000000] dark:text-white">
                    <button type="button" className="text-left" aria-label={`Open issue for row ${issue.rowNumber}: ${issue.title}`} aria-current={selected ? "true" : undefined}>
                      {issue.title}
                    </button>
                    <div className="text-[11px] font-normal text-[#666666]">{codeLabel(issue.code)}</div>
                  </td>
                  <td className="py-2.5 px-3.5 text-[#666666]">{issue.field ?? issue.affectedFields[0] ?? "General"}</td>
                  <td className="py-2.5 px-3.5">
                    <span className={`text-[11px] leading-[16px] font-medium ${sev.cls}`}>{sev.text}</span>
                  </td>
                  <td className="py-2.5 px-3.5">
                    {resolved && checking ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#666666] font-medium animate-pulse">Checking...</span>
                    ) : resolved ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#000000] dark:text-white font-semibold">
                        <Check className="w-3.5 h-3.5 stroke-[2.5] text-emerald-600" />
                        Resolved
                      </span>
                    ) : issue.status === "ignored" ? (
                      <span className="text-[11px] text-[#666666]">Ignored</span>
                    ) : (
                      <span className="text-[11px] text-[#666666]">Open</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-1 text-[11px] leading-[17px] text-[#666666] space-y-1">
        <p>Showing {total === issues.length ? `all ${total}` : `${issues.length} of ${total}`} findings · Resolved corrections stay visible.</p>
        <p className="opacity-80">
          Blocking: affected record only · Review: confirmation needed · Warning: may not prevent import. Health counts include nonblocking review findings awaiting validation.
        </p>
      </div>
    </div>
  );
}
