import { Shield, Building, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ROUTES } from "@/constants/routes";
import { useWorkspaceStore } from "@/store/workspace.store";
import type { CatalogView, ReportingPeriod, SettingsOverview, WorkspacePreferences } from "@/types/settings";
import { PREFERENCE_DEFAULTS } from "./form";
import type { SettingsController, SettingsValues } from "./tabProps";

interface GeneralTabProps {
  canWrite?: boolean;
  s?: SettingsOverview | null;
  v?: SettingsValues | null;
  ctl?: SettingsController;
}

/** the screens a business can start on after signing in (the server accepts exactly these) */
export const LANDING_OPTIONS: Array<{ value: string; label: string }> = [
  { value: ROUTES.DASHBOARD, label: "Dashboard (/)" },
  { value: ROUTES.ORDERS, label: "Orders (/orders)" },
  { value: ROUTES.LISTINGS, label: "Listings (/listings)" },
  { value: ROUTES.INVENTORY, label: "Inventory (/inventory)" },
  { value: ROUTES.PRICING, label: "Pricing (/pricing)" },
  { value: ROUTES.REPORTS, label: "Reports (/reports)" },
  { value: ROUTES.PRODUCTS, label: "Products (/products)" },
  { value: ROUTES.PROFITABILITY, label: "Profitability (/profitability)" },
  { value: ROUTES.PRODUCT_INTELLIGENCE, label: "Product Intelligence (/product-intelligence)" },
  { value: ROUTES.RETURNS, label: "Returns (/returns)" },
  { value: ROUTES.SHIPPING, label: "Shipping (/shipping)" },
  { value: ROUTES.PROCUREMENT, label: "Procurement (/procurement)" },
];

const selectCls = "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
const STORED = "Saved with your workspace; no screen reads it yet.";

export function GeneralTab({ canWrite = true, s, v, ctl }: GeneralTabProps) {
  const shell = useWorkspaceStore((state) => state.shell);
  const prefs = v?.ext.preferences ?? s?.preferences;
  const error = ctl?.fieldErrors["ext:preferences"];
  const edit = canWrite && Boolean(ctl && v);

  if (!prefs) return null;

  const setPrefs = (patch: Partial<Omit<WorkspacePreferences, "guardrails">>) => ctl?.setExt("preferences", { ...prefs, ...patch });
  const setGuard = (patch: Partial<WorkspacePreferences["guardrails"]>) => ctl?.setExt("preferences", { ...prefs, guardrails: { ...prefs.guardrails, ...patch } });
  const guardsOn = Object.values(prefs.guardrails).filter(Boolean).length;
  const businessId = shell?.business?.id ?? "";

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-muted/20 p-4">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">i</div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-foreground">Workspace-Wide Preferences</h3>
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-muted-foreground">WORKSPACE SCOPE</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            What each screen starts with for everyone in this workspace. A choice in a screen's own filters or the address bar always wins over these defaults.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-red-50 p-3 text-xs text-red-900">
          {error}
        </p>
      )}

      <div className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between border-b border-border/70 pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Workspace Identity & Localization</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Workspace display details, primary landing route, and language environment.</p>
          </div>
          <button
            type="button"
            disabled={!edit}
            onClick={() => {
              ctl?.setField("displayName", s?.business.displayName ?? "");
              setPrefs({ defaultRoute: PREFERENCE_DEFAULTS.defaultRoute, language: PREFERENCE_DEFAULTS.language, pageSize: PREFERENCE_DEFAULTS.pageSize });
            }}
            className="text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            Reset Defaults
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="workspace-display-name" className="text-xs font-semibold text-foreground">Workspace Display Name</label>
              {businessId && <span className="font-mono text-[10px] font-semibold text-muted-foreground">ID: {businessId.slice(0, 8)}</span>}
            </div>
            <Input id="workspace-display-name" value={v?.displayName ?? s?.business.displayName ?? shell?.business?.name ?? ""} onChange={(e) => ctl?.setField("displayName", e.target.value)} disabled={!edit} className="h-9 text-xs font-medium" />
            <p className="text-[11px] text-muted-foreground">The business name shown in the top bar and on documents. Saved with the business profile.</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="default-landing-page" className="text-xs font-semibold text-foreground">Default Landing Page</label>
              <span className="text-[10px] font-medium text-muted-foreground">Initial Route</span>
            </div>
            <select id="default-landing-page" value={prefs.defaultRoute} onChange={(e) => setPrefs({ defaultRoute: e.target.value })} disabled={!edit} className={selectCls}>
              {LANDING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">Where you land after signing in, unless a link took you somewhere else.</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="interface-language" className="text-xs font-semibold text-foreground">Interface Language & Locality</label>
              <span className="text-[10px] font-medium text-muted-foreground">Stored preference</span>
            </div>
            <select id="interface-language" value={prefs.language} onChange={(e) => setPrefs({ language: e.target.value })} disabled={!edit} className={selectCls}>
              <option value="en-IN">English (India) - en-IN</option>
              <option value="en-US">English (US) - en-US</option>
              <option value="en-GB">English (UK) - en-GB</option>
            </select>
            <p className="text-[11px] text-muted-foreground">{STORED} Number format is chosen under Regional & tax.</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="default-page-size" className="text-xs font-semibold text-foreground">Default Table Page Size</label>
              <span className="text-[10px] font-medium text-muted-foreground">Pagination</span>
            </div>
            <select id="default-page-size" value={prefs.pageSize} onChange={(e) => setPrefs({ pageSize: Number(e.target.value) })} disabled={!edit} className={selectCls}>
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} records
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">How many rows a table shows per page until someone picks another size.</p>
          </div>
        </div>
      </div>

      <div className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between border-b border-border/70 pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Operational & Reporting Defaults</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Standard view filters, reporting horizons, and refresh frequencies.</p>
          </div>
          <button
            type="button"
            disabled={!edit}
            onClick={() => setPrefs({ catalogView: PREFERENCE_DEFAULTS.catalogView, reportingPeriod: PREFERENCE_DEFAULTS.reportingPeriod, telemetrySeconds: PREFERENCE_DEFAULTS.telemetrySeconds, showThumbnails: PREFERENCE_DEFAULTS.showThumbnails })}
            className="text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            Reset Defaults
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="default-catalog-view" className="text-xs font-semibold text-foreground">Default Catalog & Inventory View</label>
              <span className="text-[10px] font-medium text-muted-foreground">Stored preference</span>
            </div>
            <select id="default-catalog-view" value={prefs.catalogView} onChange={(e) => setPrefs({ catalogView: e.target.value as CatalogView })} disabled={!edit} className={selectCls}>
              <option value="all_active">All active SKUs (every channel)</option>
              <option value="low_stock">Low stock and out of stock only</option>
              <option value="primary_warehouse">Primary warehouse only</option>
            </select>
            <p className="text-[11px] text-muted-foreground">{STORED}</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="default-reporting-period" className="text-xs font-semibold text-foreground">Default Reporting Period</label>
              <span className="text-[10px] font-medium text-muted-foreground">Date range</span>
            </div>
            <select id="default-reporting-period" value={prefs.reportingPeriod} onChange={(e) => setPrefs({ reportingPeriod: e.target.value as ReportingPeriod })} disabled={!edit} className={selectCls}>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="qtd">Quarter to date</option>
              <option value="fytd">Financial year to date (from 1 April)</option>
            </select>
            <p className="text-[11px] text-muted-foreground">The date range Reports, Profitability and Product Intelligence open with.</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="telemetry-frequency" className="text-xs font-semibold text-foreground">Telemetry & Refresh Frequency</label>
              <span className="text-[10px] font-medium text-muted-foreground">Stored preference</span>
            </div>
            <select id="telemetry-frequency" value={prefs.telemetrySeconds} onChange={(e) => setPrefs({ telemetrySeconds: Number(e.target.value) })} disabled={!edit} className={selectCls}>
              <option value={15}>Every 15 seconds</option>
              <option value={30}>Every 30 seconds</option>
              <option value={60}>Every 60 seconds</option>
            </select>
            <p className="text-[11px] text-muted-foreground">{STORED}</p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/20 p-3.5">
            <div>
              <p className="text-xs font-semibold text-foreground">Show product thumbnails in tables</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Product previews in order and inventory tables. {STORED}</p>
            </div>
            <Switch aria-label="Show product thumbnails" checked={prefs.showThumbnails} onCheckedChange={(c) => setPrefs({ showThumbnails: c })} disabled={!edit} />
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between border-b border-border/70 pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Consequential Action Guardrails</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Confirmations before bulk or destructive catalog and order changes. {STORED}</p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">{guardsOn} OF 3 ON</span>
        </div>

        <div className="space-y-3">
          {[
            { key: "bulkConfirm" as const, icon: Shield, tone: "blue", title: "Require confirmation for bulk status changes", text: "Bulk order dispatching, cancellation, or catalog de-listing affecting more than 10 items." },
            { key: "stockAllocationConfirm" as const, icon: Building, tone: "blue", title: "Require confirmation for manual stock allocations", text: "When stock is moved between warehouses by hand." },
            { key: "zeroStockDelistWarning" as const, icon: AlertTriangle, tone: "amber", title: "Zero-stock delist warning", text: "Warn when available stock is set to 0 on a synced marketplace channel." },
          ].map((g) => (
            <div key={g.key} className="flex items-center justify-between rounded-lg border border-border/70 p-3.5 transition-colors hover:bg-muted/10">
              <div className="flex items-center gap-3">
                <div className={g.tone === "amber" ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600" : "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600"}>
                  <g.icon className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">{g.title}</h4>
                  <p className="text-[11px] text-muted-foreground">{g.text}</p>
                </div>
              </div>
              <Switch aria-label={g.title} checked={prefs.guardrails[g.key]} onCheckedChange={(c) => setGuard({ [g.key]: c })} disabled={!edit} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
