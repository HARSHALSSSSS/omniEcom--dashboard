import { useEffect, useRef, useState } from "react";
import { errorMessage, isApiError } from "@/api/errors";
import { useAiAccept, useAiDismiss, useAiSuggest } from "@/hooks/useProductEdit";
import type { AiMode, AiSuggestion } from "@/types/productEdit";
import { plainToHtml } from "./form";

export interface AiRequest {
  mode: AiMode;
  /** changes on every request so the same mode can be requested again */
  nonce: number;
}

const MODES: Array<{ mode: AiMode; label: string }> = [
  { mode: "rewrite", label: "Rewrite for clarity" },
  { mode: "concise", label: "Make more concise" },
  { mode: "benefits", label: "Highlight key benefits" },
];
const label = (m: AiMode) => MODES.find((x) => x.mode === m)?.label ?? m;

interface Props {
  productId: string;
  request: AiRequest | null;
  /** the description as it is in the editor right now (plain text, may be unsaved) */
  getText: () => string;
  /** the accepted text goes into the editor; nothing is saved */
  onAccept: (html: string) => void;
  onClose: () => void;
}

function aiError(e: unknown): string {
  if (isApiError(e)) {
    if (e.rule === "feature_disabled" || e.code === "FEATURE_DISABLED") return "AI suggestions are turned off for this business.";
    if (e.rule === "nothing_to_rewrite") return "Write a description first, then ask for a rewrite.";
    if (e.rule === "product_not_editable") return "This product can no longer be edited.";
    if (e.code === "RATE_LIMITED") return "Too many AI requests. Please wait a moment and try again.";
  }
  return errorMessage(e, "Could not get a suggestion. Please try again.");
}

/** Improve with AI: recommend -> explain -> approve. Apply only fills the editor (persist: false); Save changes writes it. */
export function AiPanel({ productId, request, getText, onAccept, onClose }: Props) {
  const suggest = useAiSuggest(productId);
  const accept = useAiAccept(productId);
  const dismiss = useAiDismiss(productId);
  const [mode, setMode] = useState<AiMode>("rewrite");
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const run = (m: AiMode) => {
    const mine = ++seq.current;
    setMode(m);
    setSuggestion(null);
    setError(null);
    suggest.mutate(
      { mode: m, text: getText() },
      {
        onSuccess: (s) => {
          if (mine === seq.current) setSuggestion(s);
        },
        onError: (e) => {
          if (mine === seq.current) setError(aiError(e));
        },
      },
    );
  };

  useEffect(() => {
    if (request) run(request.mode);
    // run only when a new request arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  if (!request) return null;

  const busy = suggest.isPending || accept.isPending || dismiss.isPending;
  const apply = (s: { id: string; html: string; text: string }) =>
    accept.mutate(s.id, {
      onSuccess: (res) => {
        onAccept(res.html || plainToHtml(res.text));
        onClose();
      },
      onError: (e) => setError(aiError(e)),
    });
  const dismissSuggestion = () => {
    if (suggestion) dismiss.mutate(suggestion.id);
    seq.current += 1;
    onClose();
  };
  const alt = suggestion?.alternatives?.[0];

  const solid = "flex items-center justify-center h-9 px-4 rounded-[8px] bg-[#000000] text-[12px] font-semibold text-white leading-[145%] hover:bg-neutral-800 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const outline = "flex items-center justify-center h-9 px-4 rounded-[8px] bg-white border border-[#EAEAEA] text-[12px] font-semibold text-[#000000] leading-[145%] hover:bg-neutral-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <section aria-label="Improve with AI" className="box-border flex flex-col items-start pt-4 gap-3 w-full border-t border-[#EAEAEA]">
      <div className="flex flex-row justify-between items-center w-full">
        <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">Improve with AI</span>
        <span className="text-[11px] font-normal text-[#666666] leading-[145%]">Recommend &rarr; Explain &rarr; Approve</span>
      </div>

      <fieldset className="flex flex-col items-start gap-2 w-full" disabled={busy}>
        <legend className="sr-only">Suggestion type</legend>
        {MODES.map((m) => (
          <label key={m.mode} className="flex flex-row items-center gap-2 cursor-pointer w-full">
            <input type="radio" name="ai-mode" value={m.mode} checked={mode === m.mode} onChange={() => run(m.mode)} className="peer sr-only" />
            <span
              aria-hidden="true"
              className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-[#000000]/30 ${mode === m.mode ? "border-[#000000] bg-[#000000]" : "border-[#666666] bg-white"}`}
            >
              {mode === m.mode && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
            </span>
            <span className={`text-[12px] leading-[145%] ${mode === m.mode ? "font-semibold text-[#000000]" : "font-normal text-[#666666]"}`}>{m.label}</span>
          </label>
        ))}
        {alt && (
          <span className="text-[11px] font-normal text-[#666666] leading-[145%] pl-5">
            Alternative ({label(alt.mode)}): {alt.text}{" "}
            {!alt.unchanged && (
              <button type="button" className="font-semibold text-[#000000] hover:underline cursor-pointer" disabled={busy} onClick={() => apply(alt)}>
                Use this instead
              </button>
            )}
          </span>
        )}
      </fieldset>

      {suggest.isPending && (
        <p role="status" className="text-[12px] text-[#666666]">
          Preparing a suggestion...
        </p>
      )}
      {error && (
        <p role="alert" className="text-[12px] font-medium text-[#B42318]">
          {error}
        </p>
      )}

      {suggestion && (
        <div className="box-border flex flex-col items-start p-4 gap-3 w-full bg-[#F5F5F5] rounded-[8px]">
          <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">Preview &middot; Not applied</span>
          {suggestion.unchanged ? (
            <p className="text-[12px] font-normal text-[#000000] leading-[145%]">No improvement found: your description already reads well for this option.</p>
          ) : (
            <p className="text-[12px] font-normal text-[#000000] leading-[145%]">{suggestion.text}</p>
          )}
          <p className="text-[11px] font-normal text-[#666666] leading-[145%]">{suggestion.explanation || suggestion.note}</p>
          {suggestion.needsFacts && <p className="text-[11px] text-[#B45309] leading-[145%]">Add product facts (material, dimensions, ...) for a more specific suggestion.</p>}
          <div className="flex flex-row items-center gap-2 pt-1">
            <button type="button" className={solid} disabled={busy || suggestion.unchanged} onClick={() => apply(suggestion)}>
              Apply suggestion
            </button>
            <button type="button" className={outline} disabled={busy} onClick={dismissSuggestion}>
              Dismiss
            </button>
          </div>
          <p className="text-[11px] font-normal text-[#666666] leading-[145%]">Applying only changes the editor. Your original stays until you press Save changes.</p>
        </div>
      )}
      {!suggestion && !suggest.isPending && (
        <button type="button" className={outline} onClick={onClose}>
          Close
        </button>
      )}
    </section>
  );
}
