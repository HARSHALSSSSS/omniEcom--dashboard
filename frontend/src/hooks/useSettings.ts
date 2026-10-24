import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuardedMutation } from "@/hooks/useSubmitGuard";
import { settingsApi } from "@/api/settings.api";
import { errorMessage, isApiError } from "@/api/errors";
import { useCan, useFeature } from "@/hooks/useCan";
import { useToastStore } from "@/hooks/useToast";
import { refreshShell } from "@/lib/session";
import { ROUTES } from "@/constants/routes";
import {
  buildPatch,
  isDirty,
  mapServerErrors,
  modifiedKeys,
  tabOf,
  toForm,
  type FieldProblems,
  type FormKey,
  type SettingsForm,
} from "@/components/settings/form";
import type { AlertKey, GstinCreateBody, GstinPatchBody, MemberStatus, SettingsModule, SettingsOverview, VendorRoleKey } from "@/types/settings";

export const SETTINGS_KEYS = {
  overview: ["settings", "overview"] as const,
  states: ["settings", "gst-states"] as const,
  gstinCheck: (gstin: string) => ["settings", "gstin-check", gstin] as const,
  members: (status: string) => ["settings", "members", status] as const,
  invitations: ["settings", "invitations"] as const,
  roles: ["settings", "roles"] as const,
  sessions: ["settings", "sessions"] as const,
};

export const useSettingsQuery = () =>
  useQuery({
    queryKey: SETTINGS_KEYS.overview,
    queryFn: () => settingsApi.get(),
    staleTime: 0,
    refetchOnMount: "always",
    // the `version` of the baseline must stay the one the seller started from, so a background refetch never silently replaces it
    refetchOnWindowFocus: false,
  });

export type SaveOutcome = "saved" | "nochange" | "conflict" | "error";

const clone = (v: SettingsForm): SettingsForm => ({ ...v, alerts: { ...v.alerts } });

/** a save changed what the rest of the app formats with: everything on screen must re-read and re-format */
const SHELL_FIELDS: FormKey[] = ["displayName", "legalName", "timezone", "currency", "numberFormat", "lowStockThreshold"];

/** everything the Settings screen needs: baseline, edit session, real dirty state, save, reset, conflict, leave guard */
export function useSettingsController() {
  const qc = useQueryClient();
  const canWrite = useCan("vendors:write");
  const canAi = useCan("ai:use");
  const aiFeature = useFeature("ai.enabled");
  const query = useSettingsQuery();
  const settings: SettingsOverview | undefined = query.data;
  const toast = useToastStore.getState().addToast;

  const base = useMemo(() => (settings ? toForm(settings) : null), [settings]);
  const [values, setValues] = useState<SettingsForm | null>(null);
  const valuesRef = useRef<SettingsForm | null>(null);
  const prevBase = useRef<SettingsForm | null>(null);
  const resetNext = useRef(false);
  const commit = useCallback((next: SettingsForm | null) => {
    valuesRef.current = next;
    setValues(next);
  }, []);

  // a refetch never overwrites typing: the form follows the server only when it holds no edits (or right after a save / reset)
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
  const dirtyTabs = useMemo(() => new Set<SettingsModule>(modified.map(tabOf)), [modified]);

  const [fieldErrors, setFieldErrors] = useState<FieldProblems>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const inflight = useRef(false);

  const setField = useCallback(<K extends Exclude<keyof SettingsForm, "alerts">>(key: K, value: SettingsForm[K]) => {
    if (valuesRef.current) commit({ ...valuesRef.current, [key]: value });
    setFieldErrors((e) => (e[key as FormKey] ? { ...e, [key]: undefined } : e));
  }, [commit]);
  const setAlert = useCallback((key: AlertKey, value: boolean) => {
    if (valuesRef.current) commit({ ...valuesRef.current, alerts: { ...valuesRef.current.alerts, [key]: value } });
  }, [commit]);

  const revertAll = useCallback(() => {
    if (base) commit(clone(base));
    setFieldErrors({});
    setBanner(null);
  }, [base, commit]);

  /** "Reset": throw the edits away and read the settings from the server again */
  const reset = useCallback(async () => {
    setFieldErrors({});
    setBanner(null);
    resetNext.current = true;
    const res = await query.refetch();
    if (res.data) commit(clone(toForm(res.data)));
    else {
      resetNext.current = false;
      if (base) commit(clone(base));
      setBanner("Could not reload the settings. Your edits were discarded; the values shown are the last ones loaded.");
    }
  }, [base, commit, query]);

  const failSave = useCallback((e: unknown): SaveOutcome => {
    if (isApiError(e)) {
      if (e.code === "VERSION_CONFLICT") {
        setConflict(true);
        return "conflict";
      }
      if (e.fields) {
        const { byKey, other } = mapServerErrors(e.fields);
        setFieldErrors(byKey);
        setBanner(other.length ? other.join(" · ") : "Some fields need attention. Fix them and save again.");
        return "error";
      }
      if (e.status === 403) {
        setBanner("You do not have permission to change these settings.");
        return "error";
      }
    }
    setBanner(errorMessage(e, "Could not save your changes. Please try again."));
    return "error";
  }, []);

  const save = useCallback(async (): Promise<SaveOutcome> => {
    if (inflight.current || !settings || !base || !valuesRef.current || !canWrite) return "error";
    const built = buildPatch(settings, base, valuesRef.current);
    if (Object.keys(built.problems).length > 0) {
      setFieldErrors(built.problems);
      const tabs = [...new Set((Object.keys(built.problems) as FormKey[]).map(tabOf))];
      setBanner(`Fix the highlighted fields before saving${tabs.length > 1 || tabs[0] ? ` (${tabs.join(", ")})` : ""}.`);
      return "error";
    }
    const aiChange = built.ai !== null && canAi && aiFeature ? built.ai : null;
    if (Object.keys(built.patch).length === 0 && aiChange === null) return "nochange";
    inflight.current = true;
    setSaving(true);
    setBanner(null);
    setFieldErrors({});
    try {
      let next = settings;
      if (Object.keys(built.patch).length > 0) next = await settingsApi.save({ ...built.patch, version: settings.version });
      if (aiChange !== null) {
        try {
          await settingsApi.setAiEnabled(aiChange);
        } catch (e) {
          // the rest is saved; keep the AI switch as the seller set it so it can be retried
          qc.setQueryData(SETTINGS_KEYS.overview, next);
          setBanner(`Your other changes were saved, but the advisory AI setting was not: ${errorMessage(e, "please try again.")}`);
          return "error";
        }
        next = { ...next, ai: { ...next.ai, enabled: aiChange } };
      }
      resetNext.current = true;
      qc.setQueryData(SETTINGS_KEYS.overview, next);
      void refreshShell().catch(() => undefined);
      // the business name, currency, number format, time zone and low-stock threshold are read all over the app
      if (built.modified.some((k) => SHELL_FIELDS.includes(k))) void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "settings" });
      toast({ title: "Settings saved", variant: "success" });
      return "saved";
    } catch (e) {
      return failSave(e);
    } finally {
      inflight.current = false;
      setSaving(false);
    }
  }, [aiFeature, base, canAi, canWrite, failSave, qc, settings, toast]);

  /** the seller chose "reload": show the latest version; keep my edits on top when asked */
  const reloadFromConflict = useCallback(
    async (keepMine: boolean) => {
      setConflict(false);
      if (!keepMine) resetNext.current = true;
      await query.refetch();
    },
    [query],
  );

  // ---------------------------------------------------------------- leaving with unsaved edits
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const inSettings = (p: string) => p === ROUTES.SETTINGS || p.startsWith(`${ROUTES.SETTINGS}/`);
    return dirty && !(inSettings(currentLocation.pathname) && inSettings(nextLocation.pathname));
  });
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

  const aiLockReason = !aiFeature ? "Advisory AI is not enabled for your business plan." : !canAi ? "Only a business administrator can change the AI setting." : null;

  return {
    query,
    settings,
    base,
    values,
    canWrite,
    modified,
    dirty,
    dirtyTabs,
    setField,
    setAlert,
    revertAll,
    reset,
    fieldErrors,
    saving,
    save,
    banner,
    dismissBanner: () => setBanner(null),
    conflict,
    closeConflict: () => setConflict(false),
    reloadFromConflict,
    blocker,
    aiLockReason,
  };
}

export type SettingsController = ReturnType<typeof useSettingsController>;

// ---------------------------------------------------------------- GSTIN registry

export const useGstStates = () =>
  useQuery({ queryKey: SETTINGS_KEYS.states, queryFn: () => settingsApi.gstStates(), staleTime: Infinity, retry: 1 });

/** live check of a complete GSTIN: structure, state, check character and PAN match (nothing is saved) */
export const useGstinCheck = (gstin: string, enabled: boolean) =>
  useQuery({
    queryKey: SETTINGS_KEYS.gstinCheck(gstin),
    queryFn: ({ signal }) => settingsApi.validateGstin(gstin, signal),
    enabled: enabled && gstin.length === 15,
    staleTime: 60_000,
    retry: false,
  });

export function useGstinActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: SETTINGS_KEYS.overview });
  const add = useGuardedMutation({ mutationFn: (b: GstinCreateBody) => settingsApi.addGstin(b), onSuccess: refresh });
  const update = useGuardedMutation({ mutationFn: (a: { id: string; body: GstinPatchBody }) => settingsApi.updateGstin(a.id, a.body), onSuccess: refresh });
  const makePrimary = useGuardedMutation({ mutationFn: (id: string) => settingsApi.setPrimaryGstin(id), onSuccess: refresh });
  const remove = useGuardedMutation({ mutationFn: (id: string) => settingsApi.deleteGstin(id), onSuccess: refresh });
  return { add, update, makePrimary, remove };
}

/** friendly sentence for the GSTIN errors the API names by `details.rule` */
export function gstinErrorMessage(e: unknown): string {
  if (isApiError(e)) {
    switch (e.rule) {
      case "gstin_duplicate":
        return "This GSTIN is already registered for your business.";
      case "gstin_primary_required":
        return "The primary GSTIN cannot be deactivated or removed while other registrations exist. Make another registration primary first.";
      case "gstin_primary_inactive":
        return "Only an active registration can be the primary GSTIN.";
      case "gstin_pan_mismatch":
        return "The PAN inside this GSTIN does not match the PAN of your business.";
      case "gstin_format":
        return "This is not a valid GSTIN: it must be 15 characters in the GST format.";
      case "gstin_state_code":
        return "The first two digits are not a valid state or union territory code.";
      case "gstin_checksum":
        return "The last character does not match: check the GSTIN for a typing mistake.";
    }
    if (e.code === "VERSION_CONFLICT") return "This registration was changed by someone else. Close this window and try again.";
  }
  return errorMessage(e, "Could not save the GSTIN. Please try again.");
}

// ---------------------------------------------------------------- team and access

export const useMembers = (status: MemberStatus | "all", enabled: boolean) =>
  useInfiniteQuery({
    queryKey: SETTINGS_KEYS.members(status),
    queryFn: ({ pageParam }) => settingsApi.listMembers({ cursor: pageParam, status: status === "all" ? undefined : status, limit: 100 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? (last.nextCursor ?? undefined) : undefined),
    enabled,
    staleTime: 0,
  });

export const useInvitations = (enabled: boolean) =>
  useInfiniteQuery({
    queryKey: SETTINGS_KEYS.invitations,
    queryFn: ({ pageParam }) => settingsApi.listInvitations({ cursor: pageParam, limit: 100 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? (last.nextCursor ?? undefined) : undefined),
    enabled,
    staleTime: 0,
  });

export const useRoles = (enabled: boolean) => useQuery({ queryKey: SETTINGS_KEYS.roles, queryFn: () => settingsApi.roles(), enabled, staleTime: 5 * 60_000, retry: false });

export function useTeamActions() {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["settings", "members"] }), qc.invalidateQueries({ queryKey: SETTINGS_KEYS.invitations })]);
  const invite = useGuardedMutation({ mutationFn: (b: { email: string; roleKey: VendorRoleKey }) => settingsApi.invite(b), onSuccess: refresh });
  const update = useGuardedMutation({
    mutationFn: (a: { id: string; body: { roleKey?: VendorRoleKey; status?: "active" | "disabled"; fullName?: string } }) => settingsApi.updateMember(a.id, a.body),
    onSuccess: refresh,
  });
  const remove = useGuardedMutation({ mutationFn: (id: string) => settingsApi.removeMember(id), onSuccess: refresh });
  const resend = useGuardedMutation({ mutationFn: (id: string) => settingsApi.resendInvitation(id), onSuccess: refresh });
  const revoke = useGuardedMutation({ mutationFn: (id: string) => settingsApi.revokeInvitation(id), onSuccess: refresh });
  return { invite, update, remove, resend, revoke };
}

// ---------------------------------------------------------------- account security

export const useSessions = () => useQuery({ queryKey: SETTINGS_KEYS.sessions, queryFn: () => settingsApi.sessions(), staleTime: 0, refetchOnMount: "always" });

export function useSecurityActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: SETTINGS_KEYS.sessions });
  const changePassword = useGuardedMutation({ mutationFn: (b: { currentPassword: string; newPassword: string }) => settingsApi.changePassword(b), onSuccess: refresh });
  const revoke = useGuardedMutation({ mutationFn: (id: string) => settingsApi.revokeSession(id), onSuccess: refresh });
  const revokeOthers = useGuardedMutation({ mutationFn: () => settingsApi.revokeOtherSessions(), onSettled: refresh });
  return { changePassword, revoke, revokeOthers };
}
