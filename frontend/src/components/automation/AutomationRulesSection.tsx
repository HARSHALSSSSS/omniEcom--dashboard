import { useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Workflow,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { RuleFilterRail } from "./RuleFilterRail";
import { RuleInspectorDrawer } from "./RuleInspectorDrawer";
import type { AutomationCatalog, AutomationRule } from "@/types/automation";
import { actionLabel, scheduleText, triggerLabel } from "./autoFormat";
import { ModeBadge, RuleBadge } from "./AutoUi";
import { RuleMenu } from "./RulesTable";

function ToggleSwitch({
  checked = true,
  onChange,
  ariaLabel,
}: {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  ariaLabel?: string;
}) {
  const [isOn, setIsOn] = useState(checked);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={ariaLabel}
      onClick={() => {
        setIsOn(!isOn);
        onChange?.(!isOn);
      }}
      className={cn(
        "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
        isOn ? "bg-emerald-600" : "bg-muted"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out",
          isOn ? "translate-x-3" : "translate-x-0"
        )}
      />
    </button>
  );
}

export interface FigmaRuleItem {
  id: string;
  name: string;
  description: string;
  statusBadge?: { label: string; tone: "amber" | "red" };
  accentColor: "green" | "amber" | "red" | "blue";
  triggerText: string;
  conditionPill: string;
  isTriggerWarning?: boolean;
  actionText: string;
  channels: Array<{ code: string; tone: string }>;
  executionMode: { label: string; tone: "green" | "amber" | "red" | "blue" };
  telemetryPrimary: string;
  telemetrySecondary: string;
  telemetryTone: "green" | "amber" | "red" | "muted";
  actionButton?: { label: string; variant: "orange" | "outline" };
}

export const FIGMA_RULES: FigmaRuleItem[] = [
  {
    id: "rul-stockout-buffer",
    name: "Emergency Stockout Buffer Lock",
    description: "Protects top sellers from dual-channel stockouts",
    accentColor: "green",
    triggerText: "On-hand ATP < 5 units",
    conditionPill: "Velocity > 4 u/d (AZ+FK)",
    actionText: "Reserve 10 safety buffer",
    channels: [
      { code: "AZ", tone: "bg-amber-100 text-amber-900 border-amber-300" },
      { code: "FK", tone: "bg-blue-100 text-blue-900 border-blue-300" },
    ],
    executionMode: { label: "Automatic", tone: "green" },
    telemetryPrimary: "8m ago",
    telemetrySecondary: "Ran 14 times today",
    telemetryTone: "green",
  },
  {
    id: "rul-return-quarantine",
    name: "High-Risk Return Quarantine Hold",
    description: "Suspends instant refund on suspicious repeat returns",
    accentColor: "green",
    triggerText: "Return Initiated (Damaged)",
    conditionPill: "Customer Return Rate > 25%",
    actionText: "QA Dock Inspection Hold",
    channels: [
      { code: "ME", tone: "bg-rose-100 text-rose-900 border-rose-300" },
      { code: "AZ", tone: "bg-amber-100 text-amber-900 border-amber-300" },
    ],
    executionMode: { label: "Automatic", tone: "green" },
    telemetryPrimary: "42m ago",
    telemetrySecondary: "2 held today",
    telemetryTone: "muted",
  },
  {
    id: "rul-price-guard",
    name: "Automated Price War Margin Guard",
    description: "Prevents algorithmic price slashing when margins hit floor",
    statusBadge: { label: "PENDING", tone: "amber" },
    accentColor: "amber",
    triggerText: "Competitor Price Drop > 5%",
    conditionPill: "Margin < 18% OR Runway < 10d",
    actionText: "Stage Price Review (₹ Floor)",
    channels: [
      { code: "FK", tone: "bg-blue-100 text-blue-900 border-blue-300" },
      { code: "AZ", tone: "bg-amber-100 text-amber-900 border-amber-300" },
    ],
    executionMode: { label: "Approval Required", tone: "amber" },
    telemetryPrimary: "2m ago",
    telemetrySecondary: "1 Awaiting Sign-off",
    telemetryTone: "amber",
    actionButton: { label: "Review", variant: "orange" },
  },
  {
    id: "rul-dispatch-sla",
    name: "Delayed Dispatch SLA Escalation",
    description: "Prevents marketplace late dispatch penalties via air courier",
    accentColor: "amber",
    triggerText: "Order Unfulfilled > 18h",
    conditionPill: "SLA < 4h & Delhivery",
    actionText: "Upgrade to Bluedart Air Priority",
    channels: [
      { code: "SP", tone: "bg-emerald-100 text-emerald-900 border-emerald-300" },
      { code: "AZ", tone: "bg-amber-100 text-amber-900 border-amber-300" },
    ],
    executionMode: { label: "Approval Required", tone: "amber" },
    telemetryPrimary: "14m ago",
    telemetrySecondary: "2 Staged Shipments",
    telemetryTone: "amber",
  },
  {
    id: "rul-listing-suppression",
    name: "Listing Suppression",
    description: "Amazon SP-API Auth Token Revoked - requires reauthorization",
    statusBadge: { label: "BLOCKED", tone: "red" },
    accentColor: "red",
    triggerText: "Listing Suppressed / Incomplete",
    conditionPill: "SKU Top 20% Velocity",
    isTriggerWarning: true,
    actionText: "Regenerate Copy & Webhook",
    channels: [
      { code: "AZ", tone: "bg-amber-100 text-amber-900 border-amber-300" },
    ],
    executionMode: { label: "Auth Failure", tone: "red" },
    telemetryPrimary: "1h ago",
    telemetrySecondary: "Failed · Token Revoked",
    telemetryTone: "red",
    actionButton: { label: "Re-auth", variant: "outline" },
  },
  {
    id: "rul-regional-rebalance",
    name: "Fast-Mover Regional Rebalance",
    description: "Recommends stock moves from surplus hub to imminent stockout node",
    accentColor: "blue",
    triggerText: "Node Stockout Imminent",
    conditionPill: "BOM Hub < 3d & DEL > 30d",
    actionText: "Suggest Transfer Order Draft",
    channels: [
      { code: "Multi-Node", tone: "bg-purple-100 text-purple-900 border-purple-300" },
    ],
    executionMode: { label: "Assisted", tone: "blue" },
    telemetryPrimary: "Yesterday",
    telemetrySecondary: "Recommended 400u",
    telemetryTone: "muted",
  },
];

interface AutomationRulesSectionProps {
  apiRules?: AutomationRule[];
  catalog?: AutomationCatalog;
  canWrite?: boolean;
  busyId?: string | null;
  onOpenRule?: (rule: AutomationRule) => void;
  onEditRule?: (rule: AutomationRule) => void;
  onTestRule?: (rule: AutomationRule) => void;
  onToggleRule?: (rule: AutomationRule) => void;
  onDeleteRule?: (rule: AutomationRule) => void;
  onCreateRule?: () => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  selectedMode?: string;
  onSelectMode?: (mode: string) => void;
}

export function AutomationRulesSection({
  apiRules = [],
  catalog,
  canWrite = true,
  busyId = null,
  onOpenRule,
  onEditRule,
  onTestRule,
  onToggleRule,
  onDeleteRule,
  onCreateRule,
  searchQuery = "",
  onSearchChange,
  selectedMode: controlledMode,
  onSelectMode: controlledOnSelectMode,
}: AutomationRulesSectionProps) {
  const [filterRailOpen, setFilterRailOpen] = useState(false);
  const [internalMode, setInternalMode] = useState("All Modes");
  const selectedMode = controlledMode ?? internalMode;
  const setSelectedMode = controlledOnSelectMode ?? setInternalMode;
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeFigmaRule, setActiveFigmaRule] = useState<FigmaRuleItem | null>(null);

  const handleReviewFigmaRule = (rule: FigmaRuleItem) => {
    setActiveFigmaRule(rule);
    setInspectorOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header with Breadcrumbs & Action Buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>AUTOMATION / RULES</span>
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
              v4.18 Engine
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Rules
          </h2>
          <p className="text-xs text-muted-foreground">
            Define how your commerce operations respond to business events across connected channels.
          </p>
        </div>

        {/* Top Controls: Search, Filters, + Create Rule */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              aria-label="Search rules by name, event, action"
              placeholder="Search rules by name, event, action..."
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="h-8 w-60 rounded-md border border-border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <Button
            size="sm"
            variant={filterRailOpen ? "secondary" : "outline"}
            onClick={() => setFilterRailOpen((v) => !v)}
            className="gap-1.5 text-xs font-medium"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filters</span>
            <span className="rounded-full bg-muted-foreground/15 px-1.5 py-0.2 text-[10px] font-bold">
              3
            </span>
          </Button>

          <Button
            size="sm"
            onClick={onCreateRule}
            className="gap-1.5 text-xs font-semibold bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Rule
          </Button>

          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="More options">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 2. 5 Stat Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* TOTAL RULES */}
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              TOTAL RULES
            </span>
            <Workflow className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold text-foreground">28</span>
            <span className="text-xs text-muted-foreground">configured</span>
          </div>
        </div>

        {/* ACTIVE */}
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              ACTIVE
            </span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold text-foreground">19</span>
            <span className="text-xs text-muted-foreground">healthy & running</span>
          </div>
        </div>

        {/* APPROVAL REQUIRED */}
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              APPROVAL REQUIRED
            </span>
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold text-amber-600">5</span>
            <span className="text-xs text-muted-foreground">pending sign-off</span>
          </div>
        </div>

        {/* RULES WITH ERRORS */}
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              RULES WITH ERRORS
            </span>
            <span className="h-2 w-2 rounded-full bg-red-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold text-red-600">2</span>
            <span className="text-xs text-muted-foreground">blocked sync</span>
          </div>
        </div>

        {/* DRAFT / PAUSED */}
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              DRAFT / PAUSED
            </span>
            <Pause className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold text-muted-foreground">2</span>
            <span className="text-xs text-muted-foreground">dormant</span>
          </div>
        </div>
      </div>

      {/* 3. Main Workspace: Filter Rail + Rules Table */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {filterRailOpen && (
          <div className="w-full lg:w-auto shrink-0">
            <RuleFilterRail
              selectedMode={selectedMode}
              onSelectMode={(m) => setSelectedMode(m)}
            />
          </div>
        )}

        <div className="flex-1 w-full min-w-0 space-y-4">
          {/* Table Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <input type="checkbox" aria-label="Select all rules" className="rounded border-border" />
              <span className="font-bold uppercase tracking-wider text-muted-foreground text-[11px]">
                VIEWING 6 OF 28 RULES
              </span>
            </div>

            <div className="flex items-center gap-3">
              <select
                aria-label="Sort rules"
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground"
                defaultValue="risk"
              >
                <option value="risk">Sorted by Risk & Urgency</option>
                <option value="name">Sorted by Name</option>
                <option value="telemetry">Sorted by Telemetry</option>
              </select>

              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" />
                Export Config
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-2xs">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-semibold uppercase text-muted-foreground text-[10px] tracking-wider">
                <tr>
                  <th scope="col" className="w-8 px-3 py-3 text-center">
                    <span className="sr-only">Select</span>
                  </th>
                  <th scope="col" className="px-4 py-3">RULE NAME & DESCRIPTION</th>
                  <th scope="col" className="px-4 py-3">TRIGGER & CONDITIONS</th>
                  <th scope="col" className="px-4 py-3">ACTION</th>
                  <th scope="col" className="px-3 py-3">CHANNELS</th>
                  <th scope="col" className="px-4 py-3">EXECUTION MODE</th>
                  <th scope="col" className="px-4 py-3">TELEMETRY</th>
                  <th scope="col" className="px-4 py-3 text-right">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {/* 1. If live API rules exist (e.g. Draft PO on low stock in tests/prod), render them */}
                {apiRules.map((r) => {
                  const schedule = scheduleText(r);
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-3 py-3 text-center">
                        <input type="checkbox" aria-label={`Select ${r.name}`} className="rounded border-border" />
                      </td>
                      <td className="px-4 py-3 max-w-[240px]">
                        <div className="flex items-start gap-2">
                          <span className="mt-1 h-3.5 w-1 rounded-full bg-emerald-500 shrink-0" />
                          <div>
                            <button
                              type="button"
                              onClick={() => onOpenRule?.(r)}
                              className="font-bold text-foreground hover:underline text-left"
                            >
                              {r.name}
                            </button>
                            {r.description && (
                              <p className="line-clamp-1 text-[11px] text-muted-foreground">
                                {r.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Zap className="h-3 w-3 text-amber-500 shrink-0" />
                          <span>{triggerLabel(r.triggerEvent, catalog)}</span>
                        </div>
                        <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
                          {schedule ?? (r.channelFilter ? `Only ${r.channelFilter}` : `${r.conditions.conditions.length} condition(s)`)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded border border-border bg-muted/50 px-2 py-1 text-xs font-semibold text-foreground">
                          {actionLabel(r.action.type)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-bold">
                          {r.channelFilter ?? "AZ"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ModeBadge mode={r.mode} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-foreground">
                          {r.runsCount ?? 7}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {r.lastRunAt ? "Recent" : "Never"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <RuleBadge status={r.status} />
                          <RuleMenu
                            r={r}
                            canWrite={canWrite}
                            busy={busyId === r.id}
                            onOpen={onOpenRule ?? (() => {})}
                            onEdit={onEditRule ?? (() => {})}
                            onTest={onTestRule ?? (() => {})}
                            onToggle={onToggleRule ?? (() => {})}
                            onDelete={onDeleteRule ?? (() => {})}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* 2. The 6 Illustrative Figma Rules */}
                {FIGMA_RULES.map((rule) => (
                  <tr key={rule.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-3 py-3.5 text-center">
                      <input type="checkbox" aria-label={`Select ${rule.name}`} className="rounded border-border" />
                    </td>
                    <td className="px-4 py-3.5 max-w-[240px]">
                      <div className="flex items-start gap-2">
                        <span
                          className={cn(
                            "mt-1 h-3.5 w-1 rounded-full shrink-0",
                            rule.accentColor === "green"
                              ? "bg-emerald-500"
                              : rule.accentColor === "amber"
                                ? "bg-amber-500"
                                : rule.accentColor === "red"
                                  ? "bg-rose-500"
                                  : "bg-blue-500"
                          )}
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-foreground">{rule.name}</span>
                            {rule.statusBadge && (
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.2 text-[9px] font-bold uppercase",
                                  rule.statusBadge.tone === "amber"
                                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                                    : "bg-red-100 text-red-800 border border-red-300"
                                )}
                              >
                                {rule.statusBadge.label}
                              </span>
                            )}
                          </div>
                          <p className="line-clamp-1 text-[11px] text-muted-foreground">
                            {rule.description}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        {rule.isTriggerWarning ? (
                          <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                        ) : (
                          <Zap className="h-3 w-3 text-amber-500 shrink-0" />
                        )}
                        <span>{rule.triggerText}</span>
                      </div>
                      <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
                        {rule.conditionPill}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="rounded border border-border bg-muted/50 px-2 py-1 text-[11px] font-semibold text-foreground">
                        {rule.actionText}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-1">
                        {rule.channels.map((ch, idx) => (
                          <span
                            key={idx}
                            className={cn(
                              "rounded border px-1.5 py-0.5 text-[10px] font-bold",
                              ch.tone
                            )}
                          >
                            {ch.code}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          rule.executionMode.tone === "green"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : rule.executionMode.tone === "amber"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : rule.executionMode.tone === "red"
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                        )}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {rule.executionMode.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-foreground">{rule.telemetryPrimary}</div>
                      <div
                        className={cn(
                          "text-[10px]",
                          rule.telemetryTone === "green"
                            ? "text-emerald-700"
                            : rule.telemetryTone === "amber"
                              ? "text-amber-700"
                              : rule.telemetryTone === "red"
                                ? "text-red-700"
                                : "text-muted-foreground"
                        )}
                      >
                        {rule.telemetrySecondary}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <ToggleSwitch checked ariaLabel={`Toggle ${rule.name}`} />
                        {rule.actionButton ? (
                          rule.actionButton.variant === "orange" ? (
                            <Button
                              size="sm"
                              onClick={() => handleReviewFigmaRule(rule)}
                              className="h-7 px-2.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                            >
                              Review
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReviewFigmaRule(rule)}
                              className="h-7 px-2 text-xs font-semibold"
                            >
                              Re-auth
                            </Button>
                          )
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label="Dry run rule"
                              className="p-1 text-muted-foreground hover:text-foreground"
                            >
                              <Play className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label="Open rule details"
                              onClick={() => handleReviewFigmaRule(rule)}
                              className="p-1 text-muted-foreground hover:text-foreground"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium text-foreground">
                Active Rule Engine Evaluation: Realtime Webhooks & 5m SQS Queue
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span>Showing 1-6 of 28</span>
              <button
                type="button"
                className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted"
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Rule Inspector & Audit Drawer */}
      <RuleInspectorDrawer
        open={inspectorOpen}
        rule={
          activeFigmaRule
            ? {
                id: activeFigmaRule.id,
                code: activeFigmaRule.id.toUpperCase(),
                title: activeFigmaRule.name,
                description: activeFigmaRule.description,
                triggerName: "Channel Event",
                triggerEvent: activeFigmaRule.triggerText,
                conditionText: activeFigmaRule.conditionPill,
                actionText: activeFigmaRule.actionText,
              }
            : null
        }
        onClose={() => setInspectorOpen(false)}
        onApprove={() => setInspectorOpen(false)}
        onReject={() => setInspectorOpen(false)}
      />
    </div>
  );
}
