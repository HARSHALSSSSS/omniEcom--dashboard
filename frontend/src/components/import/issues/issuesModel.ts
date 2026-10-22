import type { ImportSession } from "@/types/import";
import { isDuplicateCode, type IssueX } from "@/types/importProcessing";

/** the design's vocabulary for the two severities the API knows: a blocking error, a warning (or a warning that needs a decision) */
export function severityLabel(issue: IssueX): { text: string; cls: string } {
  if (issue.severity === "error") {
    return issue.status === "open" ? { text: "Blocking", cls: "text-red-600 font-semibold" } : { text: "Blocking · cleared", cls: "text-[#666666]" };
  }
  const review = issue.code === "category_unmapped" || isDuplicateCode(issue.code);
  return review ? { text: "Needs review", cls: "text-amber-600 dark:text-amber-400" } : { text: "Warning", cls: "text-[#666666]" };
}

/** rows that are in (or on their way into) the catalog: committed rows, otherwise the rows that passed the checks */
export const importedOf = (s: ImportSession): number => (s.counters.committed > 0 ? s.counters.committed : s.counters.valid + s.counters.warning);
