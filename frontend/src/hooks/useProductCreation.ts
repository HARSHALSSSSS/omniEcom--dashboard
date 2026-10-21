import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useSearchParams, type Blocker } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { productCreationApi } from "@/api/productCreation.api";
import { isApiError, errorMessage } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { ROUTES } from "@/constants/routes";
import {
  emptyValues,
  FIELD_ORDER,
  fieldDomId,
  formFieldFor,
  hasContent,
  mapFieldErrors,
  MORE_INFO_FIELDS,
  toDraftValues,
  toPreviewValues,
  valuesFromProduct,
  type CreateFormValues,
  type FormFieldKey,
} from "@/components/products/create/formModel";
import type { CreationDto, CreationReadiness, DraftValues, FormOptions, StepIssue } from "@/types/productCreation";

export const CREATION_KEYS = {
  all: ["productCreation"] as const,
  formOptions: ["productCreation", "form-options"] as const,
  categories: ["productCreation", "categories"] as const,
  brands: ["productCreation", "brands"] as const,
  drafts: ["productCreation", "drafts"] as const,
  creation: (id: string) => ["productCreation", "creation", id] as const,
  primaryImage: (id: string) => ["productCreation", "primary-image", id] as const,
  standardCategories: (q: string) => ["productCreation", "standard-categories", q] as const,
};

// ------------------------------------------------------------------------------------------------ lookups
export const useFormOptions = () => useQuery({ queryKey: CREATION_KEYS.formOptions, queryFn: productCreationApi.formOptions, staleTime: 30 * 60 * 1000 });
export const useCategoryTree = () => useQuery({ queryKey: CREATION_KEYS.categories, queryFn: productCreationApi.categoryTree, staleTime: 60 * 1000 });
export const useBrands = () => useQuery({ queryKey: CREATION_KEYS.brands, queryFn: productCreationApi.brands, staleTime: 30 * 1000 });
export const useDrafts = (enabled: boolean) => useQuery({ queryKey: CREATION_KEYS.drafts, queryFn: () => productCreationApi.listDrafts(5), enabled, staleTime: 0, refetchOnMount: "always" });
export const useStandardCategories = (q: string) =>
  useQuery({ queryKey: CREATION_KEYS.standardCategories(q), queryFn: () => productCreationApi.standardCategories(q || undefined), staleTime: 60 * 1000 });

// ------------------------------------------------------------------------------------------------ the flow
export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";
export type FieldErrors = Partial<Record<FormFieldKey, string>>;
type SaveOutcome = { status: "saved"; dto: CreationDto } | { status: "clean" } | { status: "skipped"; reason: "no_title" } | { status: "conflict" } | { status: "error"; message: string };

interface Options {
  canWrite: boolean;
  formOptions: FormOptions | undefined;
}

export interface ProductCreation {
  form: UseFormReturn<CreateFormValues>;
  values: CreateFormValues;
  productId: string | null;
  dto: CreationDto | null;
  version: number;
  savedAt: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  conflictVersion: number | null;
  readiness: CreationReadiness | null;
  readinessLoading: boolean;
  /** step validation warnings (non-blocking) */
  warnings: StepIssue[];
  errors: FieldErrors;
  loading: boolean;
  loadError: Error | null;
  /** the product behind ?draft= is not a draft any more */
  notADraft: boolean;
  moreInfoOpen: boolean;
  setMoreInfoOpen: (open: boolean) => void;
  continuing: boolean;
  savingDraft: boolean;
  discarding: boolean;
  /** unsaved work exists (typed but not yet on the server) */
  unsaved: boolean;
  hasContent: boolean;
  leave: { open: boolean; error: string | null };
  // actions
  ensureDraft: () => Promise<string | null>;
  flushSave: () => Promise<boolean>;
  setErrors: (patch: FieldErrors) => void;
  clearError: (key: FormFieldKey) => void;
  adoptDto: (dto: CreationDto) => void;
  setVersion: (version: number) => void;
  getVersion: () => number;
  refreshReadiness: () => void;
  focusField: (key: Parameters<typeof fieldDomId>[0]) => void;
  saveDraft: () => Promise<boolean>;
  retrySave: () => void;
  resolveConflict: (choice: "reload" | "keep") => Promise<void>;
  continueToVariants: () => Promise<void>;
  requestLeave: () => void;
  closeLeave: () => void;
  leaveSave: () => Promise<void>;
  leaveDiscard: () => Promise<void>;
  resumeDraft: (id: string) => void;
}

const AUTOSAVE_MS = 1200;
const PREVIEW_MS = 450;
const AUTO_CREATE_MIN_TITLE = 3;

/** removes fields the server refused (so the rest of the form still autosaves) */
function without(body: DraftValues, apiKeys: string[]): DraftValues {
  const drop = new Set(apiKeys.map((k) => k.split(".")[0]));
  return Object.fromEntries(Object.entries(body).filter(([k]) => !drop.has(k))) as DraftValues;
}

/** a copy of the errors without one key */
function omitKey(errors: FieldErrors, key: FormFieldKey): FieldErrors {
  return Object.fromEntries(Object.entries(errors).filter(([k]) => k !== key)) as FieldErrors;
}

export function useProductCreation({ canWrite, formOptions }: Options): ProductCreation {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const draftParam = params.get("draft");

  const form = useForm<CreateFormValues>({ defaultValues: emptyValues() });
  const values = useWatch({ control: form.control }) as CreateFormValues;
  const limits = formOptions?.limits;

  const [dto, setDto] = useState<CreationDto | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [errors, setErrorsState] = useState<FieldErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [warnings, setWarnings] = useState<StepIssue[]>([]);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [leave, setLeave] = useState<{ open: boolean; error: string | null }>({ open: false, error: null });
  const [readiness, setReadiness] = useState<CreationReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [previewTick, setPreviewTick] = useState(0);
  const [notADraft, setNotADraft] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(false);

  const idRef = useRef<string | null>(null);
  const versionRef = useRef(0);
  const savedSnapRef = useRef<string | null>(null);
  const attemptSnapRef = useRef<string | null>(null);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const allowLeaveRef = useRef(false);
  const blockerRef = useRef<Blocker | null>(null);
  const limitsRef = useRef(limits);
  limitsRef.current = limits;
  const conflictRef = useRef(false);

  const snap = useMemo(() => {
    const body = toDraftValues(values, limits).values;
    if (productId && !body.title) delete body.title; // same as what a save sends
    return JSON.stringify(body);
  }, [values, limits, productId]);
  const content = useMemo(() => hasContent(values), [values]);
  const unsaved = content && (productId === null || snap !== savedSnapRef.current || saveStatus === "saving" || saveStatus === "error" || saveStatus === "conflict");

  // ------------------------------------------------------------------------------------------ errors
  const setErrors = useCallback((patch: FieldErrors) => setErrorsState((cur) => ({ ...cur, ...patch })), []);
  const clearError = useCallback(
    (key: FormFieldKey) =>
      setErrorsState((cur) => {
        return key in cur ? omitKey(cur, key) : cur;
      }),
    [],
  );

  // an error belongs to the value that caused it: editing the field clears it
  const prevValues = useRef<CreateFormValues>(values);
  useEffect(() => {
    const prev = prevValues.current;
    prevValues.current = values;
    setErrorsState((cur) => {
      const keys = Object.keys(cur) as FormFieldKey[];
      if (!keys.length) return cur;
      const stale = keys.filter((k) => {
        const group: Array<keyof CreateFormValues> = k === "dimLength" ? ["dimLength", "dimWidth", "dimHeight", "dimUnit"] : k === "weightValue" ? ["weightValue", "weightUnit"] : [k];
        return group.some((g) => JSON.stringify(values[g]) !== JSON.stringify(prev[g]));
      });
      return stale.length ? (Object.fromEntries(Object.entries(cur).filter(([k]) => !stale.includes(k as FormFieldKey))) as FieldErrors) : cur;
    });
  }, [values]);

  const localIssues = useMemo(() => (attempted ? toDraftValues(values, limits).localIssues : {}), [attempted, values, limits]);
  const allErrors = useMemo<FieldErrors>(() => ({ ...localIssues, ...errors }), [localIssues, errors]);

  const focusField = useCallback((key: Parameters<typeof fieldDomId>[0]) => {
    const target = key === "primary_image" || key === "master_sku" || key === "category" || key === "product_name" ? key : (key as FormFieldKey);
    const go = () => {
      const domId = fieldDomId(target);
      const el = document.getElementById(domId) ?? document.getElementById(`${domId}-stage`);
      if (!el) return false;
      el.scrollIntoView?.({ block: "center", behavior: "smooth" });
      (el as HTMLElement).focus?.({ preventScroll: true });
      return true;
    };
    const isMore = MORE_INFO_FIELDS.includes(key as FormFieldKey);
    if (isMore) {
      setMoreInfoOpen(true);
      setTimeout(go, 30);
    } else if (!go()) {
      setMoreInfoOpen(false);
      setTimeout(go, 30);
    }
  }, []);

  /** shows API field errors under their fields, opens the right view and focuses the first one */
  const showFieldErrors = useCallback(
    (fields: Record<string, string> | null | undefined) => {
      const { byField } = mapFieldErrors(fields);
      setErrorsState((cur) => ({ ...cur, ...byField }));
      const first = FIELD_ORDER.find((k) => byField[k]);
      if (first) focusField(first);
      return byField;
    },
    [focusField],
  );

  // ------------------------------------------------------------------------------------------ adopting server answers
  const adoptDto = useCallback(
    (next: CreationDto, snapOverride?: string) => {
      idRef.current = next.product.id;
      versionRef.current = next.creation.version;
      if (snapOverride !== undefined) savedSnapRef.current = snapOverride;
      setProductId(next.product.id);
      setDto(next);
      setReadiness((cur) => cur ?? next.readiness);
    },
    [],
  );
  const setVersion = useCallback((v: number) => {
    versionRef.current = v;
  }, []);

  const refreshReadiness = useCallback(() => setPreviewTick((t) => t + 1), []);

  // ------------------------------------------------------------------------------------------ saving
  const runSave = useCallback(
    async (force: boolean): Promise<SaveOutcome> => {
      if (conflictRef.current) return { status: "conflict" };
      const current = form.getValues();
      const mapped = toDraftValues(current, limitsRef.current);
      const body = mapped.values;
      const existing = idRef.current;
      // a cleared name is not sent (the server needs one): it is asked for when the seller continues
      if (existing && !body.title) delete body.title;
      const mySnap = JSON.stringify(body);
      if (!existing && !body.title) return { status: "skipped", reason: "no_title" };
      if (existing && !force && mySnap === savedSnapRef.current) return { status: "clean" };
      setSaveStatus("saving");
      setSaveError(null);
      attemptSnapRef.current = mySnap;

      const send = (b: DraftValues) => (existing ? productCreationApi.patchDraft(existing, b, versionRef.current) : productCreationApi.createDraft({ ...b, title: b.title ?? "" }));
      const finish = (result: CreationDto): SaveOutcome => {
        adoptDto(result, mySnap);
        setSaveStatus("saved");
        if (!existing) {
          setParams((p) => { const n = new URLSearchParams(p); n.set("draft", result.product.id); return n; }, { replace: true });
          void qc.invalidateQueries({ queryKey: CREATION_KEYS.drafts });
        }
        return { status: "saved", dto: result };
      };
      const failure = (e: unknown): SaveOutcome => {
        if (isApiError(e) && e.code === "VERSION_CONFLICT") {
          conflictRef.current = true;
          setConflictVersion(typeof e.details?.currentVersion === "number" ? e.details.currentVersion : null);
          setSaveStatus("conflict");
          return { status: "conflict" };
        }
        const message = errorMessage(e, "Could not save the draft");
        setSaveStatus("error");
        setSaveError(message);
        return { status: "error", message };
      };
      try {
        return finish(await send(body));
      } catch (e) {
        // a refused field must not stop the rest from being saved: show the error, retry without it
        const duplicate = isApiError(e) && e.rule === "duplicate_product_code";
        const fields: Record<string, string> | null = duplicate
          ? { productCode: "Master SKU already exists. Choose another code." }
          : isApiError(e) && e.status === 400 && e.fields
            ? Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k.replace(/^body\./, ""), v]))
            : null;
        if (!fields) return failure(e);
        const retryBody = without(body, Object.keys(fields));
        if (existing && Object.keys(retryBody).every((k) => k === "title")) {
          showFieldErrors(fields);
          return failure(e);
        }
        try {
          const result = await send(retryBody);
          showFieldErrors(fields);
          return finish(result);
        } catch (e2) {
          return failure(e2);
        }
      }
    },
    [adoptDto, form, qc, setParams, showFieldErrors],
  );

  /** saves one at a time (the version lock needs the previous answer) */
  const save = useCallback(
    (force = false): Promise<SaveOutcome> => {
      const next = chainRef.current.then(() => runSave(force));
      chainRef.current = next.catch(() => undefined);
      return next;
    },
    [runSave],
  );

  const flushSave = useCallback(async () => {
    const r = await save(false);
    return r.status === "saved" || r.status === "clean";
  }, [save]);

  const ensureDraft = useCallback(async (): Promise<string | null> => {
    if (idRef.current) return idRef.current;
    if (!form.getValues("title").trim()) {
      setAttempted(true);
      setErrors({ title: "Enter a product name first: it is the only thing a draft needs." });
      focusField("title");
      return null;
    }
    const r = await save(true);
    return r.status === "saved" ? r.dto.product.id : idRef.current;
  }, [focusField, form, save, setErrors]);

  // autosave: a first meaningful edit creates the draft, later edits patch it with the version lock
  useEffect(() => {
    if (!canWrite || hydrating || conflictRef.current || notADraft) return;
    if (!content) return;
    if (!idRef.current && values.title.trim().length < AUTO_CREATE_MIN_TITLE) return;
    if (idRef.current && snap === savedSnapRef.current) return;
    if (snap === attemptSnapRef.current && saveStatus === "error") return;
    const t = setTimeout(() => void save(false), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [snap, content, canWrite, hydrating, notADraft, saveStatus, values.title, save]);

  const retrySave = useCallback(() => {
    attemptSnapRef.current = null;
    void save(true);
  }, [save]);

  // ------------------------------------------------------------------------------------------ resume (?draft=<id>)
  const hydrate = useCallback(
    (next: CreationDto) => {
      if (next.product.status !== "draft") {
        setNotADraft(true);
        return;
      }
      const v = valuesFromProduct(next.product, next.creation.codeIsPlaceholder);
      conflictRef.current = false;
      setConflictVersion(null);
      form.reset(v);
      prevValues.current = v;
      idRef.current = next.product.id;
      versionRef.current = next.creation.version;
      savedSnapRef.current = JSON.stringify(toDraftValues(v, limitsRef.current).values);
      attemptSnapRef.current = null;
      setErrorsState({});
      setAttempted(false);
      setProductId(next.product.id);
      setDto(next);
      setReadiness(next.readiness);
      setSaveStatus("saved");
      setSaveError(null);
      setHydrating(false);
    },
    [form],
  );

  const needsLoad = !!draftParam && draftParam !== idRef.current;
  const creationQuery = useQuery({
    queryKey: CREATION_KEYS.creation(draftParam ?? ""),
    queryFn: () => productCreationApi.getCreation(draftParam as string),
    enabled: needsLoad,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (needsLoad) setHydrating(true);
  }, [needsLoad]);
  useEffect(() => {
    if (creationQuery.data && draftParam && draftParam !== idRef.current) hydrate(creationQuery.data);
  }, [creationQuery.data, draftParam, hydrate]);
  // the limits arrive after a resume: the snapshot of the loaded draft must use them too
  useEffect(() => {
    if (idRef.current && savedSnapRef.current !== null && limits) savedSnapRef.current = JSON.stringify(toDraftValues(form.getValues(), limits).values);
    // only when the limits first arrive for a hydrated draft
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limits]);

  const resumeDraft = useCallback(
    (id: string) => {
      allowLeaveRef.current = true;
      setParams({ draft: id });
      setTimeout(() => {
        allowLeaveRef.current = false;
      }, 0);
    },
    [setParams],
  );

  // ------------------------------------------------------------------------------------------ readiness preview (unsaved values)
  const previewKey = JSON.stringify(toPreviewValues(values));
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      if (hydrating) return;
      try {
        setReadinessLoading(true);
        const r = await productCreationApi.previewReadiness(toPreviewValues(form.getValues()), idRef.current, ctl.signal);
        if (!ctl.signal.aborted) setReadiness(r);
      } catch {
        /* keep the last readiness: it is advisory */
      } finally {
        if (!ctl.signal.aborted) setReadinessLoading(false);
      }
    }, PREVIEW_MS);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [previewKey, productId, previewTick, hydrating, form]);

  // ------------------------------------------------------------------------------------------ explicit save
  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!canWrite || savingDraft) return false;
    setAttempted(true);
    setSavingDraft(true);
    try {
      if (!idRef.current && !form.getValues("title").trim()) {
        setErrors({ title: "Enter a product name to save a draft." });
        focusField("title");
        return false;
      }
      const r = await save(true);
      if (r.status === "saved") {
        toast({ title: "Draft saved", description: `"${r.dto.product.title}" is saved. Nothing is published.`, variant: "success" });
        return true;
      }
      if (r.status === "error") toast({ title: "Could not save the draft", description: r.message, variant: "destructive" });
      if (r.status === "conflict") toast({ title: "This draft changed elsewhere", description: "Choose how to continue in the banner above the form.", variant: "warning" });
      return false;
    } finally {
      setSavingDraft(false);
    }
  }, [canWrite, focusField, form, save, savingDraft, setErrors]);

  const resolveConflict = useCallback(
    async (choice: "reload" | "keep") => {
      const id = idRef.current;
      if (!id) return;
      if (choice === "keep") {
        if (conflictVersion !== null) versionRef.current = conflictVersion;
        conflictRef.current = false;
        setConflictVersion(null);
        setSaveStatus("idle");
        attemptSnapRef.current = null;
        await save(true);
        return;
      }
      try {
        const fresh = await productCreationApi.getCreation(id);
        hydrate(fresh);
        toast({ title: "Draft reloaded", description: "Showing the latest saved version." });
      } catch (e) {
        toast({ title: "Could not reload the draft", description: errorMessage(e), variant: "destructive" });
      }
    },
    [conflictVersion, hydrate, save],
  );

  // ------------------------------------------------------------------------------------------ Continue
  const continueToVariants = useCallback(async () => {
    if (!canWrite || continuing) return;
    setContinuing(true);
    setAttempted(true);
    setWarnings([]);
    try {
      const mapped = toDraftValues(form.getValues(), limitsRef.current);
      if (!mapped.values.title) {
        setErrors({ title: "Enter a product name." });
        focusField("title");
        return;
      }
      const localKeys = Object.keys(mapped.localIssues) as FormFieldKey[];
      if (localKeys.length) {
        const first = FIELD_ORDER.find((k) => localKeys.includes(k));
        if (first) focusField(first);
        return;
      }
      // 1) the draft with everything the seller typed
      const saved = await save(true);
      if (saved.status === "conflict") return;
      if (saved.status === "error") {
        toast({ title: "Could not save before continuing", description: saved.message, variant: "destructive" });
        return;
      }
      const id = idRef.current;
      if (!id) return;
      // 2) check this step only
      const check = await productCreationApi.validateStep(id, mapped.values);
      setReadiness(check.readiness);
      setWarnings(check.warnings);
      if (!check.valid) {
        const fields: Record<string, string> = {};
        for (const i of check.errors) if (!(i.field in fields)) fields[i.field] = i.message;
        showFieldErrors(fields);
        toast({ title: "This step needs a correction", description: "Fix the highlighted fields to continue. Your draft is saved.", variant: "warning" });
        return;
      }
      // 3) move on
      const done = await productCreationApi.continueStep(id, versionRef.current, mapped.values);
      adoptDto(done);
      allowLeaveRef.current = true;
      void qc.invalidateQueries({ queryKey: CREATION_KEYS.drafts });
      navigate(`${ROUTES.PRODUCTS}/${id}/variants`);
    } catch (e) {
      if (isApiError(e)) {
        if (e.code === "VERSION_CONFLICT") {
          conflictRef.current = true;
          setConflictVersion(typeof e.details?.currentVersion === "number" ? e.details.currentVersion : null);
          setSaveStatus("conflict");
          return;
        }
        if (e.status === 422 && e.fields) {
          const creation = e.details?.creation as CreationDto | undefined;
          if (creation?.creation) {
            // the valid values were saved: keep the version in step
            versionRef.current = creation.creation.version;
            setReadiness(creation.readiness);
          }
          const w = e.details?.warnings;
          if (Array.isArray(w)) setWarnings(w as StepIssue[]);
          showFieldErrors(e.fields);
          toast({ title: "This step needs a correction", description: "Fix the highlighted fields to continue. Your draft is saved.", variant: "warning" });
          return;
        }
      }
      toast({ title: "Could not continue", description: errorMessage(e), variant: "destructive" });
    } finally {
      setContinuing(false);
    }
  }, [adoptDto, canWrite, continuing, focusField, form, navigate, qc, save, setErrors, showFieldErrors]);

  // ------------------------------------------------------------------------------------------ leaving
  const guardActive = unsaved && canWrite && !notADraft;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => guardActive && !allowLeaveRef.current && currentLocation.pathname !== nextLocation.pathname);
  blockerRef.current = blocker;
  useEffect(() => {
    if (blocker.state === "blocked") setLeave({ open: true, error: null });
  }, [blocker.state]);

  useEffect(() => {
    if (!guardActive) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [guardActive]);

  const goOut = useCallback(() => {
    allowLeaveRef.current = true;
    const b = blockerRef.current;
    if (b && b.state === "blocked") b.proceed();
    else navigate(ROUTES.PRODUCTS);
  }, [navigate]);

  const requestLeave = useCallback(() => {
    if (content && canWrite) setLeave({ open: true, error: null });
    else goOut();
  }, [canWrite, content, goOut]);

  const closeLeave = useCallback(() => {
    setLeave({ open: false, error: null });
    const b = blockerRef.current;
    if (b && b.state === "blocked") b.reset();
  }, []);

  const leaveSave = useCallback(async () => {
    setSavingDraft(true);
    try {
      if (!idRef.current && !form.getValues("title").trim()) {
        setLeave({ open: true, error: "Enter a product name to save a draft, or discard your changes." });
        return;
      }
      const r = await save(true);
      if (r.status === "saved" || r.status === "clean") {
        toast({ title: "Draft saved", description: "You can pick it up again from Create product.", variant: "success" });
        setLeave({ open: false, error: null });
        goOut();
      } else setLeave({ open: true, error: r.status === "error" ? r.message : "The draft changed elsewhere. Stay on this page to resolve it." });
    } finally {
      setSavingDraft(false);
    }
  }, [form, goOut, save]);

  const leaveDiscard = useCallback(async () => {
    if (discarding) return;
    setDiscarding(true);
    try {
      const id = idRef.current;
      if (id) {
        try {
          await productCreationApi.discardDraft(id);
        } catch (e) {
          if (!(isApiError(e) && e.status === 404)) {
            const reason = isApiError(e) && e.rule ? errorMessage(e) : errorMessage(e, "Could not discard the draft");
            setLeave({ open: true, error: reason });
            return;
          }
        }
        void qc.invalidateQueries({ queryKey: CREATION_KEYS.drafts });
        toast({ title: "Draft discarded", description: "The draft was removed." });
      }
      setLeave({ open: false, error: null });
      goOut();
    } finally {
      setDiscarding(false);
    }
  }, [discarding, goOut, qc]);

  return {
    form,
    values,
    productId,
    dto,
    version: versionRef.current,
    savedAt: dto?.creation.savedAt ?? null,
    saveStatus,
    saveError,
    conflictVersion,
    readiness: readiness ?? dto?.readiness ?? null,
    readinessLoading,
    warnings,
    errors: allErrors,
    loading: needsLoad && creationQuery.isLoading,
    loadError: needsLoad && creationQuery.isError ? (creationQuery.error as Error) : null,
    notADraft,
    moreInfoOpen,
    setMoreInfoOpen,
    continuing,
    savingDraft,
    discarding,
    unsaved,
    hasContent: content,
    leave,
    ensureDraft,
    flushSave,
    setErrors,
    clearError,
    adoptDto: (d) => adoptDto(d),
    setVersion,
    getVersion: () => versionRef.current,
    refreshReadiness,
    focusField,
    saveDraft,
    retrySave,
    resolveConflict,
    continueToVariants,
    requestLeave,
    closeLeave,
    leaveSave,
    leaveDiscard,
    resumeDraft,
  };
}

/** "Last saved just now" / "Last saved 3 min ago" / the clock time */
export function savedLabel(savedAt: string | null, now: number = Date.now()): string {
  if (!savedAt) return "Not saved yet";
  const at = new Date(savedAt).getTime();
  if (Number.isNaN(at)) return "Saved";
  const sec = Math.max(0, Math.round((now - at) / 1000));
  if (sec < 45) return "Last saved just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `Last saved ${min} min ago`;
  return `Last saved at ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export { formFieldFor };
