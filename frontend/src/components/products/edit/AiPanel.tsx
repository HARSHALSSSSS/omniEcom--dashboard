import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  return (
    <section aria-label="Improve with AI" className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          Improve with AI
        </div>
        <span className="text-[11px] text-muted-foreground">Recommend &rarr; Explain &rarr; Approve</span>
      </div>

      <fieldset className="flex flex-wrap gap-2" disabled={busy}>
        <legend className="sr-only">Suggestion type</legend>
        {MODES.map((m) => (
          <label
            key={m.mode}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 ${mode === m.mode ? "border-primary bg-background" : "border-border"}`}
          >
            <input type="radio" name="ai-mode" value={m.mode} checked={mode === m.mode} onChange={() => run(m.mode)} />
            {m.label}
          </label>
        ))}
      </fieldset>

      {suggest.isPending && (
        <p role="status" className="text-muted-foreground">
          Preparing a suggestion...
        </p>
      )}
      {error && (
        <p role="alert" className="font-medium text-destructive">
          {error}
        </p>
      )}

      {suggestion && (
        <div className="space-y-2">
          {alt && (
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">Alternative ({label(alt.mode)}):</span> {alt.text}{" "}
              {!alt.unchanged && (
                <button type="button" className="font-medium text-primary hover:underline" disabled={busy} onClick={() => apply(alt)}>
                  Use this instead
                </button>
              )}
            </p>
          )}
          <div className="space-y-2 rounded-md border border-border bg-background p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Preview &middot; Not applied</p>
            {suggestion.unchanged ? (
              <p className="text-foreground">No improvement found: your description already reads well for this option.</p>
            ) : (
              <p className="text-sm text-foreground">{suggestion.text}</p>
            )}
            <p className="text-muted-foreground">{suggestion.explanation || suggestion.note}</p>
            {suggestion.needsFacts && <p className="text-amber-700">Add product facts (material, dimensions, ...) for a more specific suggestion.</p>}
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy || suggestion.unchanged} onClick={() => apply(suggestion)}>
              Apply suggestion
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={dismissSuggestion}>
              Dismiss
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Applying only changes the editor. Your original stays until you press Save changes.</p>
        </div>
      )}
      {!suggestion && !suggest.isPending && (
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          Close
        </Button>
      )}
    </section>
  );
}
