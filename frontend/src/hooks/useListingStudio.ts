import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { listingStudioApi } from "@/api/listingStudio.api";
import { errorMessage, isApiError } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useToastStore } from "@/hooks/useToast";
import {
  buildChanges,
  isDirty,
  mapFieldErrors,
  modifiedKeys,
  PRICE_ABOVE_MRP,
  rupeesText,
  toFormValues,
  type FieldProblems,
  type FormKey,
  type FormValues,
} from "@/components/listings/studio/form";
import {
  isJobDone,
  type ActivityItem,
  type ListingPatch,
  type ListingStudio,
  type PublishFlowResult,
  type ReviewResolution,
  type StudioActionKey,
  type SyncJob,
} from "@/types/listingStudio";

export const STUDIO_KEYS = {
  studio: (id: string) => ["listing-studio", id, "studio"] as const,
  job: (jobId: string) => ["listing-studio", "job", jobId] as const,
  categories: (accountId: string, query: string) => ["listing-studio", "categories", accountId, query] as const,
};

export const JOB_POLL_MS = 1500;

export const useStudio = (id: string) =>
  useQuery({
    queryKey: STUDIO_KEYS.studio(id),
    queryFn: () => listingStudioApi.getStudio(id),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: "always",
  });

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** marketplace category search of the category dialog */
export const useCategorySearch = (accountId: string | undefined, query: string, enabled: boolean) =>
  useQuery({
    queryKey: STUDIO_KEYS.categories(accountId ?? "", query),
    queryFn: ({ signal }) => listingStudioApi.searchCategories(accountId ?? "", query, signal),
    enabled: enabled && !!accountId,
    staleTime: 60_000,
    retry: false,
  });

export type SaveOutcome = "saved" | "nochange" | "conflict" | "error";
export type JobAction = "publish" | "unpublish" | "refresh" | "content";
const JOB_LABEL: Record<JobAction, string> = {
  publish: "Publishing to the marketplace",
  unpublish: "Taking the listing down",
  refresh: "Checking the status on the marketplace",
  content: "Sending the latest content",
};

const clone = (v: FormValues): FormValues => ({ ...v, bullets: [...v.bullets], attrs: { ...v.attrs } });

/** everything the Listing Studio needs: baseline, edit session, save, listing flow, job polling, dialogs, leave guard */
export function useStudioController(id: string) {
  const qc = useQueryClient();
  const canWrite = useCan("listings:write");
  const studioQuery = useStudio(id);
  const studio: ListingStudio | undefined = studioQuery.data;
  const toast = useToastStore.getState().addToast;

  const base = useMemo(() => (studio ? toFormValues(studio) : null), [studio]);
  const [values, setValues] = useState<FormValues | null>(null);
  const valuesRef = useRef<FormValues | null>(null);
  const prevBase = useRef<FormValues | null>(null);
  const resetNext = useRef(false);
  const commit = useCallback((next: FormValues | null) => {
    valuesRef.current = next;
    setValues(next);
  }, []);

  // a refetch never overwrites typing: the form follows the server only when it holds no edits (or right after a save / reload)
  useEffect(() => {
    if (!base) return;
    const cur = valuesRef.current;
    const prev = prevBase.current;
    if (!cur || !prev || resetNext.current || !isDirty(prev, cur)) commit(clone(base));
    resetNext.current = false;
    prevBase.current = base;
  }, [base, commit]);

  const modified = useMemo(() => (base && values ? modifiedKeys(base, values) : []), [base, values]);
  const dirty = modified.length > 0;
  const built = useMemo(() => (studio && base && values ? buildChanges(studio, base, values) : null), [studio, base, values]);

  const [serverErrors, setServerErrors] = useState<FieldProblems>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ currentVersion: number | null } | null>(null);
  const [flow, setFlow] = useState<PublishFlowResult | null>(null);
  const [jobRef, setJobRef] = useState<{ id: string; action: JobAction } | null>(null);
  const inflight = useRef(false);

  const setField = useCallback(
    <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
      if (valuesRef.current) commit({ ...valuesRef.current, [key]: value });
    },
    [commit],
  );
  const setAttr = useCallback(
    (key: string, value: string) => {
      if (valuesRef.current) commit({ ...valuesRef.current, attrs: { ...valuesRef.current.attrs, [key]: value } });
    },
    [commit],
  );
  const clearError = useCallback((key: FormKey) => setServerErrors((e) => (e[key] ? { ...e, [key]: undefined } : e)), []);

  const revertAll = useCallback(() => {
    if (base) commit(clone(base));
    setServerErrors({});
    setBanner(null);
  }, [base, commit]);

  /** puts the master (or the product) value back into one input; the override is removed when the form is saved */
  const resetField = useCallback(
    (key: FormKey) => {
      const cur = valuesRef.current;
      if (!cur || !studio) return;
      const c = studio.content;
      const next = clone(cur);
      if (key === "title") next.title = c.title.master;
      else if (key === "description") next.description = c.description.master ?? "";
      else if (key === "bulletPoints") next.bullets = [...c.bulletPoints.master];
      else if (key === "searchTerms") next.searchTerms = c.searchTerms.master.join(", ");
      else if (key === "brand") next.brand = c.brand.master ?? "";
      else if (key === "price") next.price = studio.pricing.variantPriceMinor === null ? cur.price : rupeesText(studio.pricing.variantPriceMinor);
      else if (key === "mrp") next.mrp = rupeesText(studio.pricing.variantMrpMinor);
      else if (key.startsWith("attr:")) next.attrs[key.slice(5)] = "";
      commit(next);
      clearError(key);
    },
    [clearError, commit, studio],
  );

  /** after any write: the studio, the list, and the product screens read the same listing */
  const refreshAll = useCallback(async () => {
    void qc.invalidateQueries({ queryKey: ["listings"] });
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["productDetail"] });
    await qc.invalidateQueries({ queryKey: STUDIO_KEYS.studio(id) });
  }, [id, qc]);

  // ---------------------------------------------------------------- save
  const saveMutation = useGuardedMutation({ mutationFn: (patch: ListingPatch) => listingStudioApi.save(id, patch) });

  const failSave = useCallback((e: unknown): SaveOutcome => {
    if (isApiError(e)) {
      if (e.code === "VERSION_CONFLICT") {
        const v = e.details?.currentVersion;
        setConflict({ currentVersion: typeof v === "number" ? v : null });
        return "conflict";
      }
      if (e.rule === "price_above_mrp") {
        setServerErrors({ price: PRICE_ABOVE_MRP });
        setBanner("Fix the highlighted fields before saving.");
        return "error";
      }
      if (e.fields) {
        const { byKey, other } = mapFieldErrors(e.fields);
        setServerErrors(byKey);
        setBanner(other.length ? other.join(" · ") : "Some fields need attention. Fix them and save again.");
        return "error";
      }
    }
    setBanner(errorMessage(e, "Could not save your changes. Please try again."));
    return "error";
  }, []);

  /** Save the edits. Never runs twice at once. */
  const save = useCallback(async (): Promise<SaveOutcome> => {
    if (inflight.current || !studio || !built || !canWrite) return "error";
    if (Object.keys(built.problems).length > 0) {
      setServerErrors(built.problems);
      setBanner("Fix the highlighted fields before saving.");
      return "error";
    }
    if (Object.keys(built.changes).length === 0) return "nochange";
    inflight.current = true;
    setBanner(null);
    setServerErrors({});
    try {
      await saveMutation.mutateAsync({ version: studio.listing.version, ...built.changes });
      resetNext.current = true;
      await refreshAll();
      toast({ title: "Changes saved", variant: "success" });
      return "saved";
    } catch (e) {
      return failSave(e);
    } finally {
      inflight.current = false;
    }
  }, [built, canWrite, failSave, refreshAll, saveMutation, studio, toast]);

  /** the seller chose "reload": show the latest version; keep my edits on top when asked */
  const reloadFromConflict = useCallback(
    async (keepMine: boolean) => {
      setConflict(null);
      if (!keepMine) resetNext.current = true;
      await refreshAll();
    },
    [refreshAll],
  );

  // ---------------------------------------------------------------- the listing flow and its job
  const jobQuery = useQuery<SyncJob>({
    queryKey: STUDIO_KEYS.job(jobRef?.id ?? ""),
    queryFn: () => listingStudioApi.getJob(jobRef?.id ?? ""),
    enabled: !!jobRef,
    retry: false,
    refetchInterval: (q) => (q.state.data && isJobDone(q.state.data.status) ? false : JOB_POLL_MS),
  });
  const job = jobQuery.data ?? null;
  const handledJob = useRef<string | null>(null);
  useEffect(() => {
    if (!jobRef || !job || !isJobDone(job.status) || handledJob.current === job.id) return;
    handledJob.current = job.id;
    void refreshAll();
    const ok = job.status === "succeeded";
    toast({ title: ok ? "Done" : "The job did not finish", description: ok ? JOB_LABEL[jobRef.action] + ": finished." : (job.error?.message ?? "See the activity tab for details."), variant: ok ? "success" : "destructive" });
  }, [job, jobRef, refreshAll, toast]);

  const startJob = useCallback((j: SyncJob, action: JobAction) => {
    handledJob.current = null;
    setJobRef({ id: j.id, action });
  }, []);

  const flowMutation = useGuardedMutation({ mutationFn: () => listingStudioApi.publishFlow(id) });
  const actionMutation = useGuardedMutation({
    mutationFn: async (action: Exclude<StudioActionKey, "edit" | "publish_flow" | "resolve_review" | "sync_inventory" | "delete" | "approve" | "publish">) => {
      if (action === "validate") return { kind: "validate" as const, res: await listingStudioApi.validate(id) };
      if (action === "unpublish") return { kind: "job" as const, action: "unpublish" as const, res: await listingStudioApi.unpublish(id) };
      if (action === "refresh_status") return { kind: "job" as const, action: "refresh" as const, res: await listingStudioApi.refreshStatus(id) };
      return { kind: "job" as const, action: "content" as const, res: await listingStudioApi.contentSync(id) };
    },
  });

  /** validate -> approve -> publish. Unsaved edits are saved first. */
  const publish = useCallback(async () => {
    if (!canWrite || flowMutation.isPending) return;
    setBanner(null);
    setFlow(null);
    if (dirty) {
      const outcome = await save();
      if (outcome !== "saved" && outcome !== "nochange") return;
    }
    try {
      const res = await flowMutation.mutateAsync();
      if (res.outcome === "queued" && res.job) startJob(res.job, "publish");
      setFlow(res);
      await refreshAll();
    } catch (e) {
      setBanner(errorMessage(e, "Could not publish this listing. Please try again."));
    }
  }, [canWrite, dirty, flowMutation, refreshAll, save, startJob]);

  const run = useCallback(
    async (action: Parameters<typeof actionMutation.mutateAsync>[0]) => {
      if (!canWrite) return;
      setBanner(null);
      try {
        const out = await actionMutation.mutateAsync(action);
        if (out.kind === "validate") {
          await refreshAll();
          const { errors, warnings } = out.res.validation;
          toast({ title: out.res.validation.ready ? "Validation passed" : "Validation found problems", description: `${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`, variant: out.res.validation.ready ? "success" : "warning" });
        } else {
          startJob(out.res.job, out.action);
          await refreshAll();
        }
      } catch (e) {
        setBanner(errorMessage(e, "That action failed. Please try again."));
      }
    },
    [actionMutation, canWrite, refreshAll, startJob, toast],
  );

  const resolveMutation = useGuardedMutation({ mutationFn: (body: ReviewResolution) => listingStudioApi.resolveReview(id, body) });
  const resolveReview = useCallback(
    async (body: ReviewResolution): Promise<boolean> => {
      if (!canWrite) return false;
      setBanner(null);
      try {
        const res = await resolveMutation.mutateAsync(body);
        await refreshAll();
        toast({ title: "Category decision saved", description: res.syncQueued ? "The latest content is on its way to the marketplace." : undefined, variant: "success" });
        return true;
      } catch (e) {
        setBanner(errorMessage(e, "Could not save the category decision."));
        return false;
      }
    },
    [canWrite, refreshAll, resolveMutation, toast],
  );

  /** a category chosen for a listing that is not live yet */
  const setCategory = useCallback(
    async (marketplaceCategoryId: string): Promise<boolean> => {
      if (!studio || !canWrite) return false;
      setBanner(null);
      try {
        await saveMutation.mutateAsync({ version: studio.listing.version, marketplaceCategoryId });
        await refreshAll();
        toast({ title: "Category saved", variant: "success" });
        return true;
      } catch (e) {
        if (isApiError(e) && e.code === "VERSION_CONFLICT") {
          failSave(e);
          return false;
        }
        setBanner(errorMessage(e, "Could not save the category."));
        return false;
      }
    },
    [canWrite, failSave, refreshAll, saveMutation, studio, toast],
  );

  // ---------------------------------------------------------------- leaving with unsaved edits
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

  const fieldErrors = serverErrors;

  return {
    studioQuery,
    studio,
    base,
    values,
    canWrite,
    modified,
    dirty,
    setField,
    setAttr,
    resetField,
    revertAll,
    clearError,
    fieldErrors,
    saving: saveMutation.isPending,
    save,
    banner,
    dismissBanner: () => setBanner(null),
    conflict,
    closeConflict: () => setConflict(null),
    reloadFromConflict,
    publishing: flowMutation.isPending,
    publish,
    flow,
    dismissFlow: () => setFlow(null),
    running: actionMutation.isPending,
    run,
    job,
    jobAction: jobRef?.action ?? null,
    jobLabel: jobRef ? JOB_LABEL[jobRef.action] : "",
    jobPollFailed: !!jobRef && jobQuery.isError,
    retryJob: () => void jobQuery.refetch(),
    dismissJob: () => setJobRef(null),
    resolveReview,
    resolving: resolveMutation.isPending,
    setCategory,
    blocker,
  };
}

export type StudioController = ReturnType<typeof useStudioController>;

/** the activity timeline: the first page comes with the studio, "Load more" fetches the next ones */
export function useActivityTimeline(id: string, studio: ListingStudio | undefined) {
  const [extra, setExtra] = useState<{ stamp: number; pages: number; items: ActivityItem[] }>({ stamp: 0, pages: 1, items: [] });
  const stamp = studio ? Date.parse(studio.listing.updatedAt) + studio.activity.total : 0;
  const mutation = useGuardedMutation({ mutationFn: (page: number) => listingStudioApi.getActivity(id, page) });
  // a fresh studio read (after a write) starts the timeline over
  const current = useMemo(() => (extra.stamp === stamp ? extra : { stamp, pages: 1, items: [] as ActivityItem[] }), [extra, stamp]);
  const items = useMemo(() => [...(studio?.activity.items ?? []), ...current.items], [studio, current.items]);
  const total = studio?.activity.total ?? 0;
  const loadMore = useCallback(async () => {
    const page = current.pages + 1;
    const res = await mutation.mutateAsync(page);
    setExtra({ stamp, pages: page, items: [...current.items, ...res.items] });
  }, [current, mutation, stamp]);
  return { items, total, hasMore: items.length < total, loadMore, loading: mutation.isPending, failed: mutation.isError };
}
