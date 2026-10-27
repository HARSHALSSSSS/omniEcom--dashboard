import { useEffect, useMemo, useRef } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  User,
  Sliders,
  Globe,
  Package,
  Truck,
  Tag,
  Plug,
  Building2,
  Bell,
  Users,
  ShieldCheck,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LeaveDialog } from "@/components/products/edit/Dialogs";
import { BusinessTab } from "@/components/settings/BusinessTab";
import { GeneralTab } from "@/components/settings/GeneralTab";
import { GstinTab } from "@/components/settings/GstinTab";
import { InventoryListingsTab } from "@/components/settings/InventoryListingsTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { OperationsTab } from "@/components/settings/OperationsTab";
import { PricingMarginsTab } from "@/components/settings/PricingMarginsTab";
import { ProfileTab } from "@/components/settings/ProfileTab";
import { IntegrationsTab, isConnected } from "@/components/settings/IntegrationsTab";
import { useHubAccounts } from "@/hooks/useHub";
import { formatRelativeTime } from "@/utils/format";
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
import type { LucideIcon } from "lucide-react";
import type { SettingsModule } from "@/types/settings";

interface TabDef {
  id: SettingsModule;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  form: boolean;
  badge?: string;
  hasDot?: boolean;
}

const TABS: TabDef[] = [
  {
    id: "general",
    label: "General",
    subtitle: "Workspace defaults & display",
    icon: Sliders,
    form: false,
  },
  {
    id: "business",
    label: "Business profile",
    subtitle: "Legal entity, PAN, CIN",
    icon: Building2,
    form: true,
  },
  {
    id: "regional",
    label: "Regional & tax",
    subtitle: "IST, INR ₹, GSTIN compliance",
    icon: Globe,
    form: true,
  },
  {
    id: "listings",
    label: "Products & Listings",
    subtitle: "SKU taxonomy, HSN gates",
    icon: Package,
    form: false,
  },
  {
    id: "operations",
    label: "Operations",
    subtitle: "Orders & Fulfillment, E-way, 3PL",
    icon: Truck,
    form: true,
  },
  {
    id: "pricing",
    label: "Pricing & Margins",
    subtitle: "Guardrails & floor bounds",
    icon: Tag,
    form: false,
  },
  {
    id: "integrations",
    label: "Integrations",
    subtitle: "Marketplaces & Courier APIs",
    icon: Plug,
    form: false,
  },
  {
    id: "gstin",
    label: "GSTIN Registrations",
    subtitle: "State hubs & verification",
    icon: Building2,
    form: false,
  },
  {
    id: "notifications",
    label: "Notifications",
    subtitle: "SLA breach & stockouts",
    icon: Bell,
    form: true,
  },
  {
    id: "team",
    label: "Team",
    subtitle: "Staff roles & invitations",
    icon: Users,
    form: false,
  },
  {
    id: "security",
    label: "Security",
    subtitle: "Passkeys, 2FA & active sessions",
    icon: ShieldCheck,
    form: false,
  },
  {
    id: "profile",
    label: "Profile",
    subtitle: "Personal credentials & scope",
    icon: User,
    form: false,
  },
];

const MODULE_META: Record<
  string,
  { title: string; clusterBadge: string; description: string }
> = {
  general: {
    title: "General Settings",
    clusterBadge: "HQ CLUSTER",
    description:
      "Configure workspace identity, display preferences, operational default views, and confirmation thresholds.",
  },
  regional: {
    title: "Business & Regional Settings",
    clusterBadge: "STATUTORY ACTIVE",
    description:
      "Standard Indian tax localization, registered state GSTIN hub bindings, and operating currency rules.",
  },
  listings: {
    title: "Products & Listings Settings",
    clusterBadge: "CATALOG CLUSTER",
    description:
      "Standardized SKU taxonomy, GS1-compliant EAN/UPC verification, and mandatory Indian statutory listing gates.",
  },
  inventory: {
    title: "Inventory & Buffers Settings",
    clusterBadge: "SAFETY BUFFER",
    description:
      "Multi-channel inventory safety thresholds, active reserve percentage quotas, and live buffer allocations.",
  },
  operations: {
    title: "Orders & Fulfillment Settings",
    clusterBadge: "ROUTING ACTIVE",
    description:
      "Fulfillment hub priority hierarchy, negative stock override safeguards, and automated dispatch parameters.",
  },
  pricing: {
    title: "Pricing & Margins Settings",
    clusterBadge: "MARGIN PROTECTION",
    description:
      "Gross margin circuit breakers, algorithmic Buy Box parameters, live unit economics calculator, and channel tiers.",
  },
  business: {
    title: "Business Legal Entity Profile",
    clusterBadge: "LEGAL ENTITY",
    description:
      "Company registration, CIN, legal entity PAN, and commercial invoice branding details.",
  },
  gstin: {
    title: "GSTIN State Registrations",
    clusterBadge: "TAX COMPLIANCE",
    description:
      "State tax registrations linked to your fulfillment centers and multi-channel marketplace accounts.",
  },
  notifications: {
    title: "Alert Matrix & Telemetry",
    clusterBadge: "LIVE DISPATCH",
    description:
      "Configure operational alerts, dispatch SLA thresholds, and priority broadcast channels.",
  },
  team: {
    title: "Team & Access Management",
    clusterBadge: "RBAC ENFORCED",
    description:
      "Provision staff accounts, manage invitations, and configure enterprise role permissions.",
  },
  security: {
    title: "Account Security & Authentication",
    clusterBadge: "FIDO2 ACTIVE",
    description:
      "Cryptographic passkeys, session isolation, hardware 2FA keys, and password modification.",
  },
};

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

  // the Integrations badge is the real number of connected marketplace accounts (nothing until the first one connects)
  const hubAccounts = useHubAccounts();
  const connectedCount = (hubAccounts.data?.items ?? []).filter(isConnected).length;
  const tabs = useMemo(
    () =>
      TABS.filter((t) => t.id !== "team" || canReadTeam).map((t) => (t.id === "integrations" && connectedCount > 0 ? { ...t, badge: `${connectedCount} CONNECTED` } : t)),
    [canReadTeam, connectedCount],
  );

  // If no module or invalid, default to business
  const isProfile = module === "profile";
  const activeModuleId = isProfile ? "profile" : (module ?? "business");
  const active = tabs.find((t) => t.id === activeModuleId) ?? tabs.find((t) => t.id === "business") ?? tabs[0];

  // Bring first problem into view after failed save
  const firstProblem = useMemo(
    () => (Object.keys(ctl.fieldErrors) as FormKey[]).find((k) => ctl.fieldErrors[k]),
    [ctl.fieldErrors],
  );
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

  // If visiting /settings without subpath, redirect to business
  if (!module) {
    return <Navigate to={`${ROUTES.SETTINGS}/business`} replace />;
  }

  // Redirect /settings/inventory to /settings/listings
  if (module === "inventory") {
    return <Navigate to={`${ROUTES.SETTINGS}/listings`} replace />;
  }

  // If visiting an unknown module other than profile, redirect to business
  if (module && module !== "profile" && !tabs.some((t) => t.id === module)) {
    return <Navigate to={`${ROUTES.SETTINGS}/business`} replace />;
  }

  const dirtyNames = tabs.filter((t) => ctl.dirtyTabs.has(t.id)).map((t) => t.label);

  const formPanel = () => {
    if (query.isLoading) return <SettingsSkeleton />;
    if (query.isError || !s || !v) {
      return (
        <div
          role="alert"
          className="flex min-h-[260px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 p-8 text-center"
        >
          <h2 className="text-base font-semibold text-foreground">
            Could not load your settings
          </h2>
          <p className="max-w-sm text-xs text-muted-foreground">
            {errorMessage(query.error, "Something went wrong while loading the settings.")}
          </p>
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
    if (active.id === "general") return <GeneralTab canWrite={ctl.canWrite} s={s} v={v} ctl={ctl} />;
    if (active.id === "listings" || active.id === "inventory" || active.id === "fulfillment") {
      return <InventoryListingsTab canWrite={ctl.canWrite} s={s} v={v} ctl={ctl} />;
    }
    if (active.id === "pricing") return <PricingMarginsTab canWrite={ctl.canWrite} s={s} v={v} ctl={ctl} />;
    if (active.id === "profile") return <ProfileTab s={s} />;
    if (active.id === "team") return <TeamTab />;
    if (active.id === "security") return <SecurityTab />;
    if (active.id === "gstin") {
      if (query.isLoading) return <SettingsSkeleton />;
      if (query.isError || !s) return formPanel();
      return <GstinTab gstins={s.gstins} canWrite={ctl.canWrite} />;
    }
    if (active.id === "integrations") return <IntegrationsTab />;
    return formPanel();
  };

  // Administration sidebar topics (excluding profile)
  const adminTopics = tabs.filter((t) => t.id !== "profile");
  const meta = MODULE_META[active.id] ?? {
    title: active.label,
    clusterBadge: "ACTIVE",
    description: "Manage system configurations and operational preferences.",
  };

  return (
    <div className="w-full space-y-6 pb-24">
      {/* =========================================================================
          TOP-LEVEL TWO TABS: [Profile] and [Administration]
          ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div
          role="tablist"
          aria-label="Settings sections"
          className="inline-flex items-center rounded-xl border border-border/80 bg-muted/40 p-1 shadow-sm"
        >
          <button
            type="button"
            role="tab"
            id="tab-profile"
            aria-selected={isProfile}
            aria-controls="profile-panel"
            onClick={() => navigate(`${ROUTES.SETTINGS}/profile`)}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-xs sm:text-sm font-semibold transition-all ${
              isProfile
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            <User className="h-4 w-4" />
            Profile
          </button>

          <button
            type="button"
            role="tab"
            id="tab-administration"
            aria-selected={!isProfile}
            aria-controls="administration-panel"
            onClick={() => navigate(`${ROUTES.SETTINGS}/general`)}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-xs sm:text-sm font-semibold transition-all ${
              !isProfile
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            <Sliders className="h-4 w-4" />
            Administration
          </button>
        </div>

      </div>

      {/* =========================================================================
          VIEW A: PROFILE
          ========================================================================= */}
      {isProfile ? (
        <div id="profile-panel" role="tabpanel" aria-labelledby="tab-profile">
          <ProfileTab />
        </div>
      ) : (
        /* =========================================================================
            VIEW B: ADMINISTRATION (Matching Attached Screenshot Exact Layout)
            ========================================================================= */
        <div id="administration-panel" role="tabpanel" aria-labelledby="tab-administration" className="space-y-6">
          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium tracking-wide"
          >
            <span className="text-muted-foreground">Administration</span>
            <span>/</span>
            <span className="text-muted-foreground">Settings</span>
          </nav>

          {/* Title Header Row with Sync Status & Actions Bar */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {meta.title}
                </h1>
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border-primary/20"
                >
                  {meta.clusterBadge}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground max-w-2xl leading-relaxed">
                {meta.description}
              </p>
            </div>

            {/* Action Bar (Matching screenshot) */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-1.5 text-xs">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  {ctl.dirty
                    ? `Unsaved changes in ${dirtyNames.join(", ") || "settings"}`
                    : "All changes saved"}
                </span>
              </div>

              {ctl.canWrite && (
                <>
                  <Button
                    type="button"
                    aria-label="Reset"
                    variant="outline"
                    size="sm"
                    disabled={!ctl.dirty || ctl.saving || query.isFetching}
                    onClick={() => void ctl.reset()}
                    className="h-8 text-xs font-semibold"
                  >
                    Discard Changes
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    loading={ctl.saving}
                    disabled={!ctl.dirty || ctl.saving}
                    onClick={() => void ctl.save()}
                    className="h-8 gap-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold shadow-sm"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save changes
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Banner notification if any */}
          {ctl.banner && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-red-50 p-3 text-xs text-red-900"
            >
              <p>{ctl.banner}</p>
              <button
                type="button"
                className="font-medium underline"
                onClick={ctl.dismissBanner}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* =====================================================================
              TWO-COLUMN LAYOUT:
              Left Column: SETTINGS MODULES (8 Topics Sidebar Card)
              Right Column: Active Module Panel
              ===================================================================== */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* --- LEFT COLUMN: Settings Modules Sidebar --- */}
            <div className="space-y-4 lg:col-span-4 xl:col-span-3">
              <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-4 py-3">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
                    SETTINGS MODULES
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] font-bold text-muted-foreground uppercase">
                    {adminTopics.length} TOPICS
                  </span>
                </div>

                <div
                  role="tablist"
                  aria-label="Settings modules"
                  className="divide-y divide-border/60 p-1.5"
                >
                  {adminTopics.map((topic) => {
                    const selected = active.id === topic.id;
                    const dirty = ctl.dirtyTabs.has(topic.id);
                    const Icon = topic.icon;

                    return (
                      <button
                        key={topic.id}
                        type="button"
                        role="tab"
                        aria-label={topic.label}
                        id={`settings-tab-${topic.id}`}
                        aria-selected={selected}
                        aria-controls="settings-panel"
                        onClick={() => navigate(`${ROUTES.SETTINGS}/${topic.id}`)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                          selected
                            ? "bg-muted font-semibold text-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                              selected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted/80 text-muted-foreground"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 leading-tight">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-xs font-bold text-foreground">
                                {topic.label}
                              </span>
                              {dirty && (
                                <span
                                  className="h-1.5 w-1.5 rounded-full bg-amber-500"
                                  title="Unsaved changes"
                                />
                              )}
                            </div>
                            <p className="truncate text-[10px] text-muted-foreground mt-0.5">
                              {topic.subtitle}
                            </p>
                          </div>
                        </div>

                        {/* Badges on right side */}
                        <div className="flex items-center gap-1 shrink-0">
                          {selected && (
                            <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 font-mono text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">
                              ACTIVE
                            </span>
                          )}
                          {topic.hasDot && !selected && (
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                          )}
                          {topic.badge && !selected && (
                            <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 font-mono text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">
                              {topic.badge}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Bottom strip: what is true right now */}
                <div className="border-t border-border/80 bg-muted/20 p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      CONNECTIONS
                    </span>
                    <span className="font-mono text-xs font-bold text-foreground">
                      {hubAccounts.data ? `${connectedCount} of ${hubAccounts.data.items.length} connected` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      Settings last saved
                    </span>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {s ? formatRelativeTime(s.updatedAt) : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* --- RIGHT COLUMN: Active Module Content --- */}
            <div className="lg:col-span-8 xl:col-span-9">
              {!ctl.canWrite && !query.isLoading && active.form && (
                <div className="mb-4">
                  <ReadOnlyNote>
                    You have read-only access to settings. Only administrators can alter workspace rules.
                  </ReadOnlyNote>
                </div>
              )}

              <div
                id="settings-panel"
                role="tabpanel"
                aria-labelledby={`settings-tab-${active.id}`}
              >
                {panel()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conflict & Leave Dialogs */}
      <SettingsConflictDialog
        open={ctl.conflict}
        hasMyEdits={ctl.dirty}
        onReload={(keep) => void ctl.reloadFromConflict(keep)}
        onClose={ctl.closeConflict}
      />
      <LeaveDialog
        open={blocker.state === "blocked"}
        saving={ctl.saving}
        onKeep={() => blocker.reset?.()}
        onDiscard={() => {
          ctl.revertAll();
          blocker.proceed?.();
        }}
        onSave={() => void ctl.save().then((o) => o === "saved" && blocker.proceed?.())}
      />
    </div>
  );
}
