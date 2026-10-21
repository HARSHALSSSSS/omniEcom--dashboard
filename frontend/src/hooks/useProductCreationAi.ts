import { useCallback, useRef, useState } from "react";
import { productCreationApi } from "@/api/productCreation.api";
import { errorMessage, isApiError } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { isBlankHtml, plainLength } from "@/components/products/create/richText";
import type { AiMode, AiSuggestion } from "@/types/productCreation";

/** the three choices of the design, in order */
export const AI_CHOICES: Array<{ key: "clarity" | "concise" | "benefits"; mode: AiMode; label: string }> = [
  { key: "clarity", mode: "rewrite", label: "Rewrite for clarity" },
  { key: "concise", mode: "concise", label: "Create a concise product description" },
  { key: "benefits", mode: "benefits", label: "Highlight key benefits" },
];
export type AiChoiceKey = (typeof AI_CHOICES)[number]["key"];

export interface AiProblem {
  kind: "disabled" | "rate_limited" | "nothing_to_rewrite" | "too_long" | "needs_draft" | "conflict" | "expired" | "generic";
  message: string;
}

export function classifyAiError(e: unknown): AiProblem {
  if (isApiError(e)) {
    if (e.status === 403 && e.rule === "feature_disabled") return { kind: "disabled", message: "AI suggestions are turned off for this business. An administrator can enable them in settings." };
    if (e.status === 403) return { kind: "disabled", message: "You do not have permission to use AI suggestions." };
    if (e.status === 429 || e.code === "RATE_LIMITED") return { kind: "rate_limited", message: "Too many AI requests. Wait a minute, then try again." };
    if (e.rule === "nothing_to_rewrite") return { kind: "nothing_to_rewrite", message: "Write a description first, then ask AI to rewrite it." };
    if (e.rule === "suggestion_expired") return { kind: "expired", message: "This suggestion expired. Generate a new one." };
    if (e.rule === "already_decided") return { kind: "expired", message: "This suggestion was already applied or dismissed. Generate a new one." };
    if (e.code === "VERSION_CONFLICT") return { kind: "conflict", message: "The draft changed elsewhere, so the suggestion was not applied. Reload the draft and try again." };
  }
  return { kind: "generic", message: errorMessage(e, "AI suggestions are not available right now.") };
}

interface Options {
  productId: string | null;
  ensureDraft: () => Promise<string | null>;
  flushSave: () => Promise<boolean>;
  getVersion: () => number;
  setVersion: (v: number) => void;
  /** the editor HTML right now (may be unsaved) */
  getDescription: () => string;
  /** the suggestion was applied: put it into the editor */
  onApplied: (html: string) => void;
}

export function useProductCreationAi({ productId, ensureDraft, flushSave, getVersion, setVersion, getDescription, onApplied }: Options) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<AiChoiceKey>("concise");
  const [suggestions, setSuggestions] = useState<Partial<Record<AiChoiceKey, AiSuggestion>>>({});
  const [loading, setLoading] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [problem, setProblem] = useState<AiProblem | null>(null);
  const requestRef = useRef(0);
  const disabledRef = useRef(false);

  const generate = useCallback(
    async (key: AiChoiceKey) => {
      const mode = AI_CHOICES.find((c) => c.key === key)?.mode ?? "concise";
      const mine = ++requestRef.current;
      setProblem(null);
      const html = getDescription();
      if (plainLength(html) > 2000) {
        setProblem({ kind: "too_long", message: "Shorten the description to 2,000 characters before asking AI to work on it." });
        return;
      }
      if (mode === "rewrite" && isBlankHtml(html)) {
        setProblem({ kind: "nothing_to_rewrite", message: "Write a description first, then ask AI to rewrite it." });
        return;
      }
      setLoading(true);
      try {
        const id = productId ?? (await ensureDraft());
        if (!id) {
          setProblem({ kind: "needs_draft", message: "Add a product name first. Suggestions are written from the product's saved facts." });
          return;
        }
        const s = await productCreationApi.suggestDescription(id, mode, isBlankHtml(html) ? undefined : html);
        if (mine === requestRef.current) setSuggestions((cur) => ({ ...cur, [key]: s }));
      } catch (e) {
        const p = classifyAiError(e);
        if (p.kind === "disabled") disabledRef.current = true;
        if (mine === requestRef.current) setProblem(p);
      } finally {
        if (mine === requestRef.current) setLoading(false);
      }
    },
    [ensureDraft, getDescription, productId],
  );

  const openPanel = useCallback(() => {
    setOpen(true);
    setSuggestions({});
    void generate(choice);
  }, [choice, generate]);

  const closePanel = useCallback(() => {
    requestRef.current++;
    setOpen(false);
    setLoading(false);
    setProblem(null);
  }, []);

  const select = useCallback(
    (key: AiChoiceKey) => {
      setChoice(key);
      setProblem(null);
      if (!suggestions[key] && !disabledRef.current) void generate(key);
    },
    [generate, suggestions],
  );

  const regenerate = useCallback(() => {
    setSuggestions((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== choice)) as typeof cur);
    void generate(choice);
  }, [choice, generate]);

  const current = suggestions[choice] ?? null;

  const apply = useCallback(async () => {
    const s = current;
    const id = productId;
    if (!s || !id || deciding) return;
    setDeciding(true);
    setProblem(null);
    try {
      // the version lock: everything typed so far is saved first, so the suggestion is applied to the current draft
      const saved = await flushSave();
      if (!saved) {
        setProblem({ kind: "conflict", message: "Save the draft first: it could not be saved right now." });
        return;
      }
      const res = await productCreationApi.applySuggestion(id, s.id, getVersion());
      if (res.product) setVersion(res.product.version);
      onApplied(res.html);
      toast({ title: "Suggestion applied", description: "The description was updated. You can still edit it.", variant: "success" });
      closePanel();
    } catch (e) {
      setProblem(classifyAiError(e));
    } finally {
      setDeciding(false);
    }
  }, [closePanel, current, deciding, flushSave, getVersion, onApplied, productId, setVersion]);

  const dismiss = useCallback(async () => {
    const s = current;
    const id = productId;
    if (s && id) {
      setDeciding(true);
      try {
        await productCreationApi.dismissSuggestion(id, s.id);
      } catch {
        /* dismissing is best effort: the suggestion simply stays unapplied */
      } finally {
        setDeciding(false);
      }
    }
    closePanel();
  }, [closePanel, current, productId]);

  return { open, choice, current, loading, deciding, problem, openPanel, closePanel, select, regenerate, apply, dismiss, disabled: problem?.kind === "disabled" };
}
