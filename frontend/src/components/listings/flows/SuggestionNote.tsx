import { CONFIDENCE_LABEL, SUGGESTION_SOURCE_LABEL } from "./flowFormat";
import type { FixSuggestion } from "@/types/listingFlows";

/** the value the engine proposes, marked as what it is: nothing is saved until the user confirms it */
export function SuggestionNote({ suggestion }: { suggestion: FixSuggestion }) {
  return (
    <div data-testid="fix-suggestion" className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-black">{String(suggestion.value)}</span>
        <span className="text-[11px] text-neutral-500">Unconfirmed suggestion · requires review</span>
      </div>
      <p className="text-[11px] text-neutral-500">
        {suggestion.reason}. {CONFIDENCE_LABEL[suggestion.confidenceLevel]} ({Math.round(suggestion.confidence * 100)}%) · {SUGGESTION_SOURCE_LABEL[suggestion.source]}.
      </p>
    </div>
  );
}
