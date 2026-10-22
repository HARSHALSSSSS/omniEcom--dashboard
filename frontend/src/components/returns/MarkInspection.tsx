import { useState } from "react";
import { useMarkInspection } from "@/hooks/useReturns";
import { toast } from "@/hooks/useToast";
import { cn } from "@/utils/cn";
import type { InspectionResult } from "@/types/returns";
import { DRAWER_BTN_LIGHT, SELECT_SM } from "./design";
import { writeErrorMessage } from "./returnFormat";

const RESULTS: ReadonlyArray<{ value: InspectionResult; label: string }> = [
  { value: "pass", label: "Passed" },
  { value: "fail", label: "Failed" },
  { value: "needs_review", label: "Requires review" },
];

const SKIP_TEXT: Record<string, string> = { not_received: "has not been received yet", not_found: "was not found" };

interface MarkInspectionProps {
  ids: string[];
  label: string;
  onDone?: () => void;
  className?: string;
}

/** sets the inspection status of the picked returns without a checklist (it never approves a refund or picks a disposition) */
export function MarkInspection({ ids, label, onDone, className }: MarkInspectionProps) {
  const mark = useMarkInspection();
  const [result, setResult] = useState<InspectionResult>("pass");
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    if (ids.length === 0) return;
    setError(null);
    mark.mutate(
      { ids, result },
      {
        onSuccess: (res) => {
          if (res.marked.length === 0) {
            setError(`${label} ${SKIP_TEXT[res.skipped[0]?.reason ?? ""] ?? "could not be marked"}.`);
            return;
          }
          toast({
            title: "Inspection status marked",
            description: `${res.marked.length} marked ${RESULTS.find((r) => r.value === result)?.label.toLowerCase()}${res.skipped.length > 0 ? `, ${res.skipped.length} skipped (not received yet)` : ""}. No refund or disposition was decided.`,
            variant: "success",
          });
          onDone?.();
        },
        onError: (e) => setError(writeErrorMessage(e)),
      },
    );
  };

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        <select aria-label="Inspection status to mark" value={result} onChange={(e) => setResult(e.target.value as InspectionResult)} className={cn(SELECT_SM, "h-8 min-w-[150px]")}>
          {RESULTS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={apply} disabled={ids.length === 0 || mark.isPending} className={DRAWER_BTN_LIGHT}>
          {mark.isPending ? "Marking..." : "Mark inspection status"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-[#DC2626]">
          {error}
        </p>
      )}
    </div>
  );
}
