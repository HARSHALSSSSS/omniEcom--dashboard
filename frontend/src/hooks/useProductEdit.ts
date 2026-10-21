import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { productEditApi } from "@/api/productEdit.api";
import { isApiError, errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import {
  buildChanges,
  formKeyOf,
  mapFieldErrors,
  modifiedKeys,
  revertField,
  toFormValues,
  type FieldProblems,
  type FormKey,
  type FormValues,
} from "@/components/products/edit/form";
import type {
  AiMode,
  ChangeImpact,
  CategoryOption,
  EditChanges,
  EditSaveResult,
  EditorView,
  InsightKey,
  VersionConflictDetails,
} from "@/types/productEdit";

export const EDIT_KEYS = {
  editor: (id: string) => ["product-edit", id, "editor"] as const,
  impact: (id: string, version: number, changes: string) => ["product-edit", id, "impact", version, changes] as const,
  insights: (id: string) => ["product-edit", id, "insights"] as const,
  categories: ["product-edit", "categories"] as const,
};

// ------------------------------------------------------------------------------------------------ queries
export const useEditor = (id: string) =>
  useQuery({ queryKey: EDIT_KEYS.editor(id), queryFn: () => productEditApi.getEditor(id), enabled: !!id, staleTime: 0, refetchOnMount: "always" });

export const useEditCategories = () =>
  useQuery<CategoryOption[]>({ queryKey: EDIT_KEYS.categories, queryFn: productEditApi.listCategories, staleTime: 5 * 60 * 1000, retry: false });

export const useInsightList = (id: string, enabled = true) =>
  useQuery({ queryKey: EDIT_KEYS.insights(id), queryFn: () => productEditApi.getInsights(id), enabled: enabled && !!id, staleTime: 0 });

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ------------------------------------------------------------------------------------------------ insights + AI
export function useInsightDecision(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, action }: { key: InsightKey; action: "dismiss" | "restore" }) =>
      action === "dismiss" ? productEditApi.dismissInsight(id, key) : productEditApi.restoreInsight(id, key),
    onSuccess: (decision) => {
      qc.setQueryData<EditorView>(EDIT_KEYS.editor(id), (old) => (old ? { ...old, insights: decision.insights } : old));
      void qc.invalidateQueries({ queryKey: EDIT_KEYS.insights(id) });
    },
  });
}

export const useAiSuggest = (id: string) =>
  useMutation({
    mutationFn: ({ mode, text }: { mode: AiMode; text: string }) => {
      const also: AiMode | null = mode === "rewrite" ? "concise" : mode === "concise" ? "rewrite" : null;
      return productEditApi.suggestDescription(id, {
        mode,
        ...(mode !== "benefits" && text.trim() ? { text } : {}),
        ...(also && text.trim() ? { alsoSuggest: [also] } : {}),
      });
    },
  });
export const useAiAccept = (id: string) => useMutation({ mutationFn: (suggestionId: string) => productEditApi.acceptDescription(id, suggestionId) });
export const useAiDismiss = (id: string) => useMutation({ mutationFn: (suggestionId: string) => productEditApi.dismissDescription(id, suggestionId) });

// ------------------------------------------------------------------------------------------------ the page controller
export type SaveOutcome = "saved" | "nochange" | "confirm" | "conflict" | "error";

/** everything the Edit product page needs: baseline, edit session, live impact, save flow, dialogs, leave guard */
export function useEditController(id: string) {
  const qc = useQueryClient();
  const canWrite = useCan("products:write");
  const editorQuery = useEditor(id);
  const editor = editorQuery.data;
  const categoriesQuery = useEditCategories();

  const base = useMemo(() => (editor ? toFormValues(editor.product) : null), [editor]);
  const [values, setValues] = useState<FormValues | null>(null);
  /** the editor version the form was last initialised from: a refetch of the same version never overwrites typing */
  const initialised = useRef<string | null>(null);
  useEffect(() => {
    if (!editor) return;
    const stamp = `${editor.product.id}:${editor.version}`;
    if (initialised.current !== stamp) {
      initialised.current = stamp;
      setValues(toFormValues(editor.product));
    }
  }, [editor]);

  const modified = useMemo(() => (base && values ? modifiedKeys(base, values) : []), [base, values]);
  const dirty = modified.length > 0;
  const { changes, problems } = useMemo(() => (base && values ? buildChanges(base, values) : { changes: {}, problems: {} as FieldProblems }), [base, values]);
  const changesKey = JSON.stringify(changes);
  const debouncedKey = useDebounced(changesKey, 500);
  const hasProposal = dirty && Object.keys(changes).length > 0;

  const impactQuery = useQuery<ChangeImpact>({
    queryKey: EDIT_KEYS.impact(id, editor?.version ?? 0, debouncedKey),
    queryFn: ({ signal }) => productEditApi.changeImpact(id, JSON.parse(debouncedKey), signal),
    enabled: !!editor && debouncedKey !== "{}" && hasProposal,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });
  const impactPending = hasProposal && (debouncedKey !== changesKey || impactQuery.isFetching);

  const [serverErrors, setServerErrors] = useState<FieldProblems>({});
  const [banner, setBanner] = useState<{ message: string; link?: { label: string; to: string } } | null>(null);
  const [confirmation, setConfirmation] = useState<ChangeImpact | null>(null);
  const [conflict, setConflict] = useState<VersionConflictDetails | null>(null);
  const [lastSave, setLastSave] = useState<EditSaveResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inflight = useRef(false);

  // a new edit hides the "Changes saved" card and old server messages
  useEffect(() => {
    if (dirty) {
      setLastSave(null);
      setNotice(null);
    }
  }, [dirty]);

  const setField = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((v) => (v ? { ...v, [key]: value } : v));
  }, []);
  const clearError = useCallback((key: FormKey) => setServerErrors((e) => (e[key] ? { ...e, [key]: undefined } : e)), []);

  const revert = useCallback(
    (key: FormKey) => {
      setValues((v) => (v && base ? revertField(v, base, key) : v));
      clearError(key);
    },
    [base, clearError],
  );
  const revertAll = useCallback(() => {
    if (base) setValues({ ...base, tags: [...base.tags], customAttributes: base.customAttributes.map((a) => ({ ...a })) });
    setServerErrors({});
    setBanner(null);
  }, [base]);

  const saveMutation = useMutation({
    mutationFn: (args: { version: number; changes: EditChanges; confirm: boolean }) =>
      productEditApi.save(id, { version: args.version, changes: args.changes, ...(args.confirm ? { confirm: true } : {}) }),
  });

  const applySaved = useCallback(
    (res: EditSaveResult) => {
      const saved = res.product;
      if (!saved) return;
      initialised.current = `${saved.id}:${res.version}`;
      qc.setQueryData<EditorView>(EDIT_KEYS.editor(id), (old) =>
        old
          ? {
              ...old,
              product: saved,
              version: res.version,
              status: saved.status,
              locks: { productCode: { locked: saved.productCodeLocked, reason: saved.productCodeLocked ? (old.locks.productCode.reason ?? "Used as the primary internal product identifier.") : null } },
              meta: { ...old.meta, productId: saved.productCode, updatedAt: res.savedAt ?? old.meta.updatedAt },
              readiness: res.readiness ?? old.readiness,
              insights: res.insights ?? old.insights,
            }
          : old,
      );
      setValues(toFormValues(saved));
      // nav counts, channels and attribute counters come from the full read
      void qc.invalidateQueries({ queryKey: EDIT_KEYS.editor(id) });
      void qc.invalidateQueries({ queryKey: EDIT_KEYS.insights(id) });
      void qc.invalidateQueries({ queryKey: ["products"] });
      // the detail page and the top bar breadcrumb read the same product overview
      void qc.invalidateQueries({ queryKey: ["productDetail", id] });
    },
    [id, qc],
  );

  /** Save changes. `confirm` re-posts after the seller accepted the impact. Never runs twice at once. */
  const submit = useCallback(
    async (confirm = false): Promise<SaveOutcome> => {
      if (inflight.current || !editor || !canWrite) return "error";
      if (Object.keys(problems).length > 0) {
        setServerErrors(problems);
        setBanner({ message: "Fix the highlighted fields before saving." });
        return "error";
      }
      inflight.current = true;
      setBanner(null);
      setServerErrors({});
      try {
        const res = await saveMutation.mutateAsync({ version: editor.version, changes, confirm });
        setConfirmation(null);
        if (!res.saved) {
          // the server found nothing to write (for example only whitespace differed): drop the no-op edits
          setValues(toFormValues(editor.product));
          setNotice("There were no changes to save.");
          return "nochange";
        }
        applySaved(res);
        setLastSave(res);
        return "saved";
      } catch (e) {
        if (isApiError(e)) {
          if (e.code === "VERSION_CONFLICT") {
            setConfirmation(null);
            setConflict((e.details as unknown as VersionConflictDetails) ?? null);
            return "conflict";
          }
          if (e.status === 409 && e.rule === "confirmation_required") {
            setConfirmation((e.details?.impact as ChangeImpact | undefined) ?? null);
            return "confirm";
          }
          setConfirmation(null);
          if (e.status === 409 && e.rule === "code_locked") {
            setServerErrors({ productCode: "The master SKU cannot be changed once the product is no longer a draft." });
            setBanner({ message: "The master SKU is locked. Revert it to save your other changes." });
            return "error";
          }
          if (e.status === 409 && e.rule === "needs_variant") {
            setBanner({ message: "An active product needs at least one active variant before it can be saved.", link: { label: "Open variants", to: `/products/${id}/variants` } });
            return "error";
          }
          if (e.status === 413) {
            setBanner({ message: e.message || "This product has too many listings to update in one change." });
            return "error";
          }
          if (e.fields) {
            const { byKey, other } = mapFieldErrors(e.fields);
            setServerErrors(byKey);
            setBanner({ message: other.length ? other.join(" · ") : "Some fields need attention. Fix them and save again." });
            return "error";
          }
        }
        setBanner({ message: errorMessage(e, "Could not save your changes. Please try again.") });
        return "error";
      } finally {
        inflight.current = false;
      }
    },
    [applySaved, canWrite, changes, editor, id, problems, saveMutation],
  );

  /** show the latest version after a VERSION_CONFLICT; keep the seller's own edits on top when asked */
  const reloadFromConflict = useCallback(
    (keepMine: boolean) => {
      if (!conflict?.current) return;
      const current = conflict.current;
      initialised.current = `${current.product.id}:${current.version}`;
      qc.setQueryData<EditorView>(EDIT_KEYS.editor(id), current);
      if (keepMine && base && values) {
        // the latest version is the new baseline; only the fields I changed keep my values
        const merged = modifiedKeys(base, values).reduce((acc, k) => revertField(acc, values, k), toFormValues(current.product));
        setValues(merged);
      } else {
        setValues(toFormValues(current.product));
      }
      setConflict(null);
      setBanner(null);
      void qc.invalidateQueries({ queryKey: EDIT_KEYS.editor(id) });
    },
    [base, conflict, id, qc, values],
  );

  /** an AI suggestion accepted into the editor (nothing is written until Save) */
  const setDescriptionHtml = useCallback((html: string) => setField("description", html), [setField]);

  // ---- leaving with unsaved edits
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === "blocked" && !dirty) blocker.proceed();
  }, [blocker, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const categoryName = useCallback(
    (cid: string) => categoriesQuery.data?.find((c) => c.id === cid)?.name ?? (editor?.product.category?.id === cid ? editor.product.category.name : "Selected category"),
    [categoriesQuery.data, editor],
  );

  // what the server said on save wins; the live preview also reports fields the save would reject
  const previewErrors = hasProposal ? impactQuery.data?.errors : undefined;
  const fieldErrors = useMemo<FieldProblems>(() => {
    const out: FieldProblems = {};
    for (const e of previewErrors ?? []) {
      const key = formKeyOf(e.field);
      if (key && !out[key]) out[key] = e.message;
    }
    for (const [k, v] of Object.entries(serverErrors)) if (v) out[k as FormKey] = v;
    return out;
  }, [previewErrors, serverErrors]);

  return {
    editorQuery,
    editor,
    categories: categoriesQuery.data ?? null,
    categoriesError: categoriesQuery.isError,
    categoryName,
    base,
    values,
    canWrite,
    modified,
    dirty,
    changes,
    setField,
    revert,
    revertAll,
    fieldErrors,
    impact: hasProposal ? (impactQuery.data ?? null) : null,
    impactPending,
    impactError: hasProposal && impactQuery.isError,
    saving: saveMutation.isPending,
    submit,
    banner,
    dismissBanner: () => setBanner(null),
    notice,
    lastSave,
    confirmation,
    closeConfirmation: () => setConfirmation(null),
    conflict,
    closeConflict: () => setConflict(null),
    reloadFromConflict,
    setDescriptionHtml,
    blocker,
    clearError,
  };
}

export type EditController = ReturnType<typeof useEditController>;
