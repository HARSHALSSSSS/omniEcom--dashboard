import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/api/errors";
import { useApplySuggestion, type ApplyOutcome } from "@/hooks/useListingAudit";
import type { Suggestion } from "@/types/listingAudit";

/**
 * The merchant confirms a suggestion here. Nothing changes before "Apply": it then PATCHes the attribute on each listing listed below.
 * The value is prefilled only when the same product already carries one on another listing; otherwise the merchant types it.
 */
export function SuggestionDialog({ suggestion, open, onClose, onApplied }: { suggestion: Suggestion; open: boolean; onClose: () => void; onApplied: (o: ApplyOutcome, value: string) => void }) {
  const apply = useApplySuggestion();
  const [value, setValue] = useState(suggestion.suggestedValue ?? "");
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trimmed = value.trim();
  const hidden = suggestion.total - suggestion.listings.length;

  const submit = () => {
    setError(null);
    apply.mutate(
      { suggestion, value: trimmed },
      {
        onSuccess: (o) => {
          if (o.failed.length === 0) onApplied(o, trimmed);
          else setOutcome(o);
        },
        onError: (e) => setError(errorMessage(e, "Could not apply the suggestion.")),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !apply.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{suggestion.title}</DialogTitle>
          <DialogDescription>
            {suggestion.description} Review the value and the listings below, then confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <label className="block space-y-1">
            <span className="font-medium text-black">{suggestion.label}</span>
            <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={500} placeholder={`Enter the ${suggestion.label.toLowerCase()}`} aria-label={suggestion.label} />
          </label>
          <p className="text-[#666666]">{suggestion.valueSource ?? `No value is known for this attribute yet: type the ${suggestion.label.toLowerCase()} to apply.`}</p>

          <div className="rounded-lg border border-[#EAEAEA] divide-y divide-[#EAEAEA] max-h-48 overflow-auto">
            {suggestion.listings.map((l) => (
              <div key={l.id} className="px-3 py-2 flex items-center justify-between gap-3">
                <span className="font-medium text-black truncate">{l.productTitle}</span>
                <span className="font-mono text-[11px] text-[#666666] shrink-0">{l.sku}</span>
              </div>
            ))}
          </div>
          {hidden > 0 && <p className="text-[11px] text-[#666666]">And {hidden} more: apply again after this batch.</p>}
          <p className="text-[11px] text-[#666666]">{suggestion.note}. The listings are re-validated before they can be published.</p>

          {outcome && outcome.failed.length > 0 && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 space-y-1">
              <p className="font-semibold">
                Updated {outcome.done} of {suggestion.listingIds.length} listings.
              </p>
              {outcome.failed.slice(0, 3).map((f) => (
                <p key={f.id}>
                  <Link to={`/listings/${f.id}`} className="underline">
                    {suggestion.listings.find((l) => l.id === f.id)?.sku ?? f.id}
                  </Link>
                  : {f.message}
                </p>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <button type="button" onClick={onClose} disabled={apply.isPending} className="h-9 px-4 rounded-lg border border-[#BDBDBD] bg-white text-neutral-700 text-xs font-medium hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-50">
            {outcome ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={apply.isPending || trimmed === ""}
            className="h-9 px-4 rounded-lg bg-black text-white text-xs font-semibold hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {apply.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                Applying…
              </>
            ) : (
              `Apply to ${suggestion.listings.length} listing${suggestion.listings.length === 1 ? "" : "s"}`
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
