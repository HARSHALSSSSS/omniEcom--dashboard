import { useEffect, useMemo, useRef } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LeaveDialog } from "@/components/products/edit/Dialogs";
import { BusinessTab } from "@/components/settings/BusinessTab";
import { GstinTab } from "@/components/settings/GstinTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { OperationsTab } from "@/components/settings/OperationsTab";
import { RegionalTab } from "@/components/settings/RegionalTab";
import { SecurityTab } from "@/components/settings/SecurityTab";
import { SettingsConflictDialog } from "@/components/settings/SettingsConflictDialog";
import { TeamTab } from "@/components/settings/TeamTab";
import { ReadOnlyNote } from "@/components/settings/fields";
import { fieldId, tabOf, type FormKey } from "@/components/settings/form";
import { ROUTES } from "@/constants/routes";
import { errorMessage } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import { useSettingsController } from "@/hooks/useSettings";
import type { SettingsModule } from "@/types/settings";

interface TabDef {
  id: SettingsModule;
  label: string;
  /** a tab that edits the aggregate (GET /settings) and takes part in the Save button */
  form: boolean;
}

const TABS: TabDef[] = [
  { id: "business", label: "Business profile", form: true },
  { id: "regional", label: "Regional", form: true },
  { id: "gstin", label: "GSTIN", form: false },
  { id: "operations", label: "Operations", form: true },
  { id: "notifications", label: "Notifications", form: true },
  { id: "team", label: "Team & access", form: false },
  { id: "security", label: "Account & security", form: false },
];

function SettingsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading settings">
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
      <Skeleton className="h-28" />
    </div>
  );
}

export default function SettingsPage() {
  const { module } = useParams<{ module?: string }>();
  const navigate = useNavigate();
  const canReadTeam = useCan("users:read");
  const ctl = useSettingsController();
  const { settings: s, values: v, query, blocker } = ctl;

  const tabs = useMemo(() => TABS.filter((t) => t.id !== "team" || canReadTeam), [canReadTeam]);
  const active = tabs.find((t) => t.id === module);

  // after a failed save the first problem is brought into view, on its own tab if needed
  const firstProblem = useMemo(() => (Object.keys(ctl.fieldErrors) as FormKey[]).find((k) => ctl.fieldErrors[k]), [ctl.fieldErrors]);
  const lastFocused = useRef<string | null>(null);
  const activeId = active?.id;
  useEffect(() => {
    if (!firstProblem) {
      lastFocused.current = null;
      return;
    }
    const sig = `${firstProblem}:${ctl.fieldErrors[firstProblem]}`;
    if (lastFocused.current === sig) return;
    lastFocused.current = sig;
    const tab = tabOf(firstProblem);
    if (tab !== activeId) navigate(`${ROUTES.SETTINGS}/${tab}`);
    const t = setTimeout(() => {
      const el = document.getElementById(fieldId(firstProblem));
      if (el) {
        el.scrollIntoView?.({ behavior: "smooth", block: "center" });
        el.focus();
      }
    }, 0);
    return () => clearTimeout(t);
  }, [firstProblem, ctl.fieldErrors, activeId, navigate]);

  // /settings and unknown (or not permitted) modules open the business tab; every tab is the same route, so edits survive tab changes
  if (!active) return <Navigate to={`${ROUTES.SETTINGS}/business`} replace />;

  const dirtyNames = tabs.filter((t) => ctl.dirtyTabs.has(t.id)).map((t) => t.label);
  const showFooter = ctl.canWrite && !!s && !!v && (active.form || ctl.dirty);

  const formPanel = () => {
    if (query.isLoading) return <SettingsSkeleton />;
    if (query.isError || !s || !v) {
      return (
        <div role="alert" className="flex min-h-[260px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <h2 className="text-base font-semibold text-foreground">Could not load your settings</h2>
          <p className="max-w-sm text-xs text-muted-foreground">{errorMessage(query.error, "Something went wrong while loading the settings.")}</p>
          <Button type="button" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      );
    }
    switch (active.id) {
      case "business":
        return <BusinessTab s={s} v={v} ctl={ctl} />;
      case "regional":
        return <RegionalTab s={s} v={v} ctl={ctl} />;
      case "operations":
        return <OperationsTab s={s} v={v} ctl={ctl} />;
      case "notifications":
        return <NotificationsTab s={s} v={v} ctl={ctl} />;
      default:
        return null;
    }
  };

  const panel = () => {
    if (active.id === "team") return <TeamTab />;
    if (active.id === "security") return <SecurityTab />;
    if (active.id === "gstin") {
      if (query.isLoading) return <SettingsSkeleton />;
      if (query.isError || !s) return formPanel();
      return <GstinTab gstins={s.gstins} canWrite={ctl.canWrite} />;
    }
    return formPanel();
  };

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader title="Settings" description="Your business profile, regional formats, GST registrations, operating rules, alerts, team and account security." />

      <div role="tablist" aria-label="Settings sections" className="flex items-center gap-1 overflow-x-auto border-b border-border pb-1 text-xs">
        {tabs.map((t) => {
          const selected = active.id === t.id;
          const dirty = ctl.dirtyTabs.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`settings-tab-${t.id}`}
              aria-selected={selected}
              aria-controls="settings-panel"
              onClick={() => navigate(`${ROUTES.SETTINGS}/${t.id}`)}
              className={`whitespace-nowrap rounded-lg px-3.5 py-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {t.label}
              {t.id === "gstin" && s ? ` (${s.gstins.length})` : ""}
              {dirty && (
                <>
                  <span aria-hidden="true" className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />
                  <span className="sr-only"> (unsaved changes)</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {!ctl.canWrite && !query.isLoading && active.form && (
        <ReadOnlyNote>You have read-only access to settings. You can look at everything here, but only a business administrator can change it.</ReadOnlyNote>
      )}
      {ctl.banner && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-red-50 p-3 text-xs text-red-900">
          <p>{ctl.banner}</p>
          <button type="button" className="font-medium underline" onClick={ctl.dismissBanner}>
            Dismiss
          </button>
        </div>
      )}

      <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${active.id}`}>
        {panel()}
      </div>

      {showFooter && (
        <footer className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
          <p role="status" className={ctl.dirty ? "text-xs font-medium text-amber-700" : "text-xs text-muted-foreground"}>
            {ctl.dirty ? `Unsaved changes${dirtyNames.length ? ` in ${dirtyNames.join(", ")}` : ""}` : "All changes saved"}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={ctl.saving || query.isFetching} onClick={() => void ctl.reset()}>
              Reset
            </Button>
            <Button type="button" size="sm" loading={ctl.saving} disabled={!ctl.dirty || ctl.saving} onClick={() => void ctl.save()}>
              Save changes
            </Button>
          </div>
        </footer>
      )}

      <SettingsConflictDialog open={ctl.conflict} hasMyEdits={ctl.dirty} onReload={(keep) => void ctl.reloadFromConflict(keep)} onClose={ctl.closeConflict} />
      <LeaveDialog open={blocker.state === "blocked"} saving={ctl.saving} onKeep={() => blocker.reset?.()} onDiscard={() => { ctl.revertAll(); blocker.proceed?.(); }} onSave={() => void ctl.save().then((o) => o === "saved" && blocker.proceed?.())} />
    </div>
  );
}
