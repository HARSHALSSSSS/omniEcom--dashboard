import { useEffect, useState } from "react";
import {
  Shield,
  Building,
  AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { SettingsOverview } from "@/types/settings";
import type { SettingsController, SettingsValues } from "./tabProps";

const STORAGE_KEY = "omni_general_prefs";

interface GeneralTabProps {
  canWrite?: boolean;
  s?: SettingsOverview | null;
  v?: SettingsValues | null;
  ctl?: SettingsController;
}

export function GeneralTab({ canWrite = true, s, v, ctl }: GeneralTabProps) {
  const shell = useWorkspaceStore((state) => state.shell);

  // Read saved local operational preferences if any
  const savedPrefs = (() => {
    try {
      const item = localStorage.getItem(STORAGE_KEY);
      return item ? JSON.parse(item) : {};
    } catch {
      return {};
    }
  })();

  const initialWorkspaceName =
    v?.displayName ||
    s?.business.displayName ||
    shell?.business?.name ||
    "Omni-OS India Operations Hub";

  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName);
  const [defaultRoute, setDefaultRoute] = useState(savedPrefs.defaultRoute || "/orders");
  const [language, setLanguage] = useState(savedPrefs.language || "en-IN");
  const [pageSize, setPageSize] = useState(savedPrefs.pageSize || 50);
  const [catalogScope, setCatalogScope] = useState(savedPrefs.catalogScope || "all_active");
  const [reportingPeriod, setReportingPeriod] = useState(savedPrefs.reportingPeriod || "7d");
  const [telemetryFrequency, setTelemetryFrequency] = useState(savedPrefs.telemetryFrequency || "15s");
  const [showThumbnails, setShowThumbnails] = useState(savedPrefs.showThumbnails ?? true);

  // Guardrails
  const [guardrailBulk, setGuardrailBulk] = useState(savedPrefs.guardrailBulk ?? true);
  const [guardrailStock, setGuardrailStock] = useState(savedPrefs.guardrailStock ?? true);
  const [guardrailDelist, setGuardrailDelist] = useState(savedPrefs.guardrailDelist ?? true);

  // Sync workspace name when backend settings change
  useEffect(() => {
    if (v?.displayName) {
      setWorkspaceName(v.displayName);
    } else if (s?.business.displayName) {
      setWorkspaceName(s.business.displayName);
    }
  }, [v?.displayName, s?.business.displayName]);

  // Persist operational preferences
  const updatePref = (key: string, val: unknown) => {
    try {
      const current = (() => {
        const item = localStorage.getItem(STORAGE_KEY);
        return item ? JSON.parse(item) : {};
      })();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, [key]: val }));
    } catch {
      // ignore localStorage errors in sandboxed environments
    }
  };

  const handleNameChange = (val: string) => {
    setWorkspaceName(val);
    if (ctl) {
      ctl.setField("displayName", val);
    }
  };

  const resetIdentity = () => {
    const defaultName = s?.business.displayName || "Omni-OS India Operations Hub";
    setWorkspaceName(defaultName);
    if (ctl) ctl.setField("displayName", defaultName);
    setDefaultRoute("/orders");
    setLanguage("en-IN");
    setPageSize(50);
    updatePref("defaultRoute", "/orders");
    updatePref("language", "en-IN");
    updatePref("pageSize", 50);
  };

  const resetDefaults = () => {
    setCatalogScope("all_active");
    setReportingPeriod("7d");
    setTelemetryFrequency("15s");
    setShowThumbnails(true);
    updatePref("catalogScope", "all_active");
    updatePref("reportingPeriod", "7d");
    updatePref("telemetryFrequency", "15s");
    updatePref("showThumbnails", true);
  };

  return (
    <div className="space-y-6">
      {/* 1. Top Cluster Notice Card */}
      <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-muted/20 p-4">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background text-xs font-bold mt-0.5">
          i
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-foreground">
              Workspace-Wide Preferences
            </h3>
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-[9px] font-bold text-muted-foreground uppercase">
              CLUSTER SCOPE
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Display, density, and default view settings apply to all operators in this workspace. Critical operational action confirmations protect against accidental bulk status transitions.
          </p>
        </div>
      </div>

      {/* 2. Workspace Identity & Localization Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
        <div className="flex items-start justify-between border-b border-border/70 pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Workspace Identity & Localization
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Workspace display details, primary landing route, and language environment.
            </p>
          </div>
          <button
            type="button"
            onClick={resetIdentity}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset Defaults
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Workspace Display Name */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="workspace-display-name" className="text-xs font-semibold text-foreground">
                Workspace Display Name
              </label>
              <span className="font-mono text-[10px] text-muted-foreground font-semibold">
                ID: HQ-IND-01
              </span>
            </div>
            <Input
              id="workspace-display-name"
              value={workspaceName}
              onChange={(e) => handleNameChange(e.target.value)}
              disabled={!canWrite}
              className="h-9 text-xs font-medium"
            />
            <p className="text-[11px] text-muted-foreground">
              Identifies this workspace across multi-tenant switches.
            </p>
          </div>

          {/* Default Landing Page */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="default-landing-page" className="text-xs font-semibold text-foreground">
                Default Landing Page
              </label>
              <span className="text-[10px] text-muted-foreground font-medium">
                Initial Route
              </span>
            </div>
            <select
              id="default-landing-page"
              value={defaultRoute}
              onChange={(e) => setDefaultRoute(e.target.value)}
              disabled={!canWrite}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="/orders">Orders & Fulfillment Pipeline (Selected)</option>
              <option value="/">Executive Dashboard (/)</option>
              <option value="/listings">Omni Listings Studio (/listings)</option>
              <option value="/inventory">Inventory & Buffers (/inventory)</option>
              <option value="/pricing">Pricing & Margins (/pricing)</option>
              <option value="/reports">Reports & Analytics (/reports)</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              Initial view loaded upon authentication for operational teams.
            </p>
          </div>

          {/* Interface Language & Locality */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                Interface Language & Locality
              </label>
              <span className="text-[10px] text-muted-foreground font-medium">
                I18N Standard
              </span>
            </div>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={!canWrite}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="en-IN">English (India) - en-IN</option>
              <option value="en-US">English (US) - en-US</option>
              <option value="en-GB">English (UK) - en-GB</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              Number formatting, calendar rules, and UI translation strings.
            </p>
          </div>

          {/* Default Table Page Size */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                Default Table Page Size
              </label>
              <span className="text-[10px] text-muted-foreground font-medium">
                Pagination
              </span>
            </div>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              disabled={!canWrite}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value={50}>50 records (Default)</option>
              <option value={25}>25 records (Compact)</option>
              <option value={100}>100 records (Dense)</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              Controls server-side pagination chunk size for table grids.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Operational & Reporting Defaults Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
        <div className="flex items-start justify-between border-b border-border/70 pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Operational & Reporting Defaults
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Standard view filters, reporting horizons, and telemetry refresh frequencies.
            </p>
          </div>
          <button
            type="button"
            onClick={resetDefaults}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset Defaults
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Default Catalog & Inventory View */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                Default Catalog & Inventory View
              </label>
              <span className="text-[10px] text-muted-foreground font-medium">
                SKU Scope
              </span>
            </div>
            <select
              value={catalogScope}
              onChange={(e) => setCatalogScope(e.target.value)}
              disabled={!canWrite}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all_active">All Active SKUs (Multi-channel)</option>
              <option value="low_stock">Low Stock & Out of Stock Only</option>
              <option value="single_hub">Primary Warehouse Focus Only</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              Default operational filter applied when accessing catalog grids.
            </p>
          </div>

          {/* Default Reporting Period */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                Default Reporting Period
              </label>
              <span className="text-[10px] text-muted-foreground font-medium">
                Temporal Range
              </span>
            </div>
            <select
              value={reportingPeriod}
              onChange={(e) => setReportingPeriod(e.target.value)}
              disabled={!canWrite}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="7d">Last 7 Days (Selected)</option>
              <option value="30d">Last 30 Days (Operational Standard)</option>
              <option value="qtd">Quarter to Date (QTD)</option>
              <option value="fytd">Financial Year to Date (FYTD 2024-25)</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              Baseline date range used in GMV reports and analytics charts.
            </p>
          </div>

          {/* Telemetry & Refresh Frequency */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                Telemetry & Refresh Frequency
              </label>
              <span className="text-[10px] text-muted-foreground font-medium">
                Polling Cycle
              </span>
            </div>
            <select
              value={telemetryFrequency}
              onChange={(e) => setTelemetryFrequency(e.target.value)}
              disabled={!canWrite}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="15s">High-rate Polling (15s - Default)</option>
              <option value="30s">Standard Polling (30s)</option>
              <option value="60s">Conserved Polling (60s)</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              Background synchronization cadence for metrics and inventory states.
            </p>
          </div>

          {/* Show HD Media Thumbnails Box */}
          <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/20 p-3.5">
            <div>
              <p className="text-xs font-semibold text-foreground">
                Show HD Media Thumbnails in tables
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Renders 48px square product previews in order and inventory tables.
              </p>
            </div>
            <Switch
              checked={showThumbnails}
              onCheckedChange={setShowThumbnails}
              disabled={!canWrite}
            />
          </div>
        </div>
      </div>

      {/* 4. Consequential Action Guardrails Card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-start justify-between border-b border-border/70 pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Consequential Action Guardrails
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Require two-step verification dialogs before executing bulk or destructive catalog and order mutations.
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 font-mono">
            PROTECTION ACTIVE
          </span>
        </div>

        <div className="space-y-3">
          {/* Row 1 */}
          <div className="flex items-center justify-between rounded-lg border border-border/70 p-3.5 hover:bg-muted/10 transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground">
                  Require Confirmation for Bulk Status Changes
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Applies to bulk order dispatching, cancellation, or catalog de-listing affecting &gt; 10 items.
                </p>
              </div>
            </div>
            <Switch
              checked={guardrailBulk}
              onCheckedChange={setGuardrailBulk}
              disabled={!canWrite}
            />
          </div>

          {/* Row 2 */}
          <div className="flex items-center justify-between rounded-lg border border-border/70 p-3.5 hover:bg-muted/10 transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Building className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground">
                  Require Confirmation for Manual Stock Allocations
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Prompts for confirmation when manually forcing stock re-allocations between fulfillment hubs.
                </p>
              </div>
            </div>
            <Switch
              checked={guardrailStock}
              onCheckedChange={setGuardrailStock}
              disabled={!canWrite}
            />
          </div>

          {/* Row 3 */}
          <div className="flex items-center justify-between rounded-lg border border-border/70 p-3.5 hover:bg-muted/10 transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground">
                  Zero-Stock Delist Warning
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Alerts user when setting available inventory to 0 on synced marketplace channels.
                </p>
              </div>
            </div>
            <Switch
              checked={guardrailDelist}
              onCheckedChange={setGuardrailDelist}
              disabled={!canWrite}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
