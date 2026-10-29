import { useState } from "react";
import { Download, Pause, Plus, Search, SlidersHorizontal, Workflow, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber, formatRelativeTime } from "@/utils/format";
import { RuleFilterRail } from "./RuleFilterRail";
import type { AutomationCatalog, AutomationOverview, AutomationRule, RuleStatus } from "@/types/automation";
import { WRITE_REASON, actionLabel, scheduleText, triggerLabel } from "./autoFormat";
import { ModeBadge, RuleBadge } from "./AutoUi";
import { RuleMenu } from "./RulesTable";

export type RuleSort = "name" | "lastRun" | "runs";

export const sortRules = (rules: AutomationRule[], sort: RuleSort): AutomationRule[] => {
  const out = [...rules];
  if (sort === "runs") out.sort((a, b) => b.runsCount - a.runsCount || a.name.localeCompare(b.name));
  else if (sort === "lastRun") out.sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? "") || a.name.localeCompare(b.name));
  else out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
};

interface AutomationRulesSectionProps {
  /** the rules of the current page */
  apiRules: AutomationRule[];
  /** every rule (the stat cards and the filter counts) */
  allRules: AutomationRule[];
  /** the rules that pass the filters, over all pages */
  matchingCount: number;
  overview: AutomationOverview | undefined;
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
  selectedMode: string;
  onSelectMode: (mode: string) => void;
  selectedStatus: RuleStatus | undefined;
  selectedTrigger: string | undefined;
  onSelectStatus: (status: RuleStatus | null) => void;
  onSelectTrigger: (trigger: string | null) => void;
  onResetFilters: () => void;
  activeFilterCount: number;
  sort: RuleSort;
  onSort: (sort: RuleSort) => void;
}

function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function AutomationRulesSection({
  apiRules,
  allRules,
  matchingCount,
  overview,
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
  selectedMode,
  onSelectMode,
  selectedStatus,
  selectedTrigger,
  onSelectStatus,
  onSelectTrigger,
  onResetFilters,
  activeFilterCount,
  sort,
  onSort,
}: AutomationRulesSectionProps) {
  const [filterRailOpen, setFilterRailOpen] = useState(false);
  const active = allRules.filter((r) => r.status === "active").length;
  const approvalRules = allRules.filter((r) => r.mode === "approval").length;
  const dormant = allRules.filter((r) => r.status !== "active").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AUTOMATION / RULES</div>
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Rules</h2>
          <p className="text-xs text-muted-foreground">Define how your commerce operations respond to business events across connected channels.</p>
        </div>

        <div className="flex w-full sm:w-auto shrink-0 flex-wrap items-center gap-2 sm:gap-2.5">
          <div className="relative w-full sm:w-auto flex-1 sm:flex-initial">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              aria-label="Search rules by name, event, action"
              placeholder="Search rules by name, event, action..."
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="h-10 sm:h-8 w-full sm:w-48 md:w-60 rounded-md border border-border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <Button size="sm" variant={filterRailOpen ? "secondary" : "outline"} onClick={() => setFilterRailOpen((v) => !v)} className="h-10 sm:h-8 gap-1.5 text-xs font-medium flex-1 sm:flex-initial cursor-pointer">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && <span className="py-0.2 rounded-full bg-muted-foreground/15 px-1.5 text-[10px] font-bold">{activeFilterCount}</span>}
          </Button>

          <Button
            size="sm"
            onClick={onCreateRule}
            disabled={!canWrite}
            title={canWrite ? undefined : WRITE_REASON}
            className="h-10 sm:h-8 gap-1.5 bg-neutral-900 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 flex-1 sm:flex-initial cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Rule
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">TOTAL RULES</span>
            <Workflow className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold text-foreground">{formatNumber(allRules.length)}</span>
            <span className="text-xs text-muted-foreground">configured</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">ACTIVE</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold text-foreground">{formatNumber(active)}</span>
            <span className="text-xs text-muted-foreground">running</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">APPROVAL REQUIRED</span>
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold text-amber-600">{formatNumber(approvalRules)}</span>
            <span className="text-xs text-muted-foreground">{overview ? `rules · ${formatNumber(overview.pendingApprovals)} waiting` : "rules"}</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">FAILED RUNS (24H)</span>
            <span className="h-2 w-2 rounded-full bg-red-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold text-red-600">{overview ? formatNumber(overview.failedRuns24h) : "—"}</span>
            <span className="text-xs text-muted-foreground">runs</span>
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-xl border border-border bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">DRAFT / PAUSED</span>
            <Pause className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-extrabold text-muted-foreground">{formatNumber(dormant)}</span>
            <span className="text-xs text-muted-foreground">dormant</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start gap-6 lg:flex-row">
        {filterRailOpen && (
          <div className="w-full shrink-0 lg:w-auto">
            <RuleFilterRail
              rules={allRules}
              catalog={catalog}
              selectedMode={selectedMode}
              selectedStatus={selectedStatus}
              selectedTrigger={selectedTrigger}
              onSelectMode={onSelectMode}
              onSelectStatus={onSelectStatus}
              onSelectTrigger={onSelectTrigger}
              onReset={onResetFilters}
            />
          </div>
        )}

        <div className="w-full min-w-0 flex-1 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              VIEWING {formatNumber(apiRules.length)} OF {formatNumber(matchingCount)} RULES
            </span>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <select aria-label="Sort rules" value={sort} onChange={(e) => onSort(e.target.value as RuleSort)} className="h-9 sm:h-8 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                <option value="name">Sorted by Name</option>
                <option value="lastRun">Sorted by Last run</option>
                <option value="runs">Sorted by Runs</option>
              </select>

              <Button size="sm" variant="outline" className="h-9 sm:h-8 gap-1.5 text-xs cursor-pointer" onClick={() => downloadJson("automation-rules.json", allRules)}>
                <Download className="h-3.5 w-3.5" />
                Export Config
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-2xs">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
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
                {apiRules.map((r) => {
                  const schedule = scheduleText(r);
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-muted/30">
                      <td className="max-w-[240px] px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span className="mt-1 h-3.5 w-1 shrink-0 rounded-full bg-emerald-500" />
                          <div>
                            <button type="button" onClick={() => onOpenRule?.(r)} className="text-left font-bold text-foreground hover:underline">
                              {r.name}
                            </button>
                            {r.description && <p className="line-clamp-1 text-[11px] text-muted-foreground">{r.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Zap className="h-3 w-3 shrink-0 text-amber-500" />
                          <span>{triggerLabel(r.triggerEvent, catalog)}</span>
                        </div>
                        <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {schedule ?? (r.channelFilter ? `Only ${r.channelFilter}` : `${r.conditions.conditions.length} condition(s)`)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded border border-border bg-muted/50 px-2 py-1 text-xs font-semibold text-foreground">{actionLabel(r.action.type)}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-bold">{r.channelFilter ?? "All channels"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <ModeBadge mode={r.mode} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-foreground">{formatNumber(r.runsCount)}</div>
                        <div className="text-[10px] text-muted-foreground">{r.lastRunAt ? `Last run ${formatRelativeTime(r.lastRunAt)}` : "Never run"}</div>
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
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
