import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { ListingStudio } from "@/types/listingStudio";
import { formatDateTime } from "@/utils/format";

/** exactly what is sent to the marketplace: request, payload, warnings and whether the approval still matches */
export function PreviewTab({ s }: { s: ListingStudio }) {
  const p = s.preview;
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">Marketplace Payload Preview</h3>
        <span className="font-mono text-xs text-muted-foreground">{p.endpoint}</span>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {p.approval.approved && p.approval.current ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Approved{p.approval.approvedAt ? ` on ${formatDateTime(p.approval.approvedAt)}` : ""}; this is the approved content.
          </>
        ) : p.approval.approved ? (
          <>
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            The content changed after it was approved. Publishing approves it again.
          </>
        ) : (
          "Not approved yet. Publishing validates, approves and submits it."
        )}
      </p>
      {p.warnings.length > 0 && (
        <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900" aria-label="Preview warnings">
          {p.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      <pre aria-label="Request payload" className="max-h-[480px] overflow-auto rounded-lg border border-border bg-muted/30 p-4 text-[11px] leading-relaxed">
        {JSON.stringify(p.payload, null, 2)}
      </pre>
    </div>
  );
}
