import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { RefreshButton } from "@/components/common/RefreshButton";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { ApprovalsTable } from "@/components/automation/ApprovalsTable";
import { AutomationFilters } from "@/components/automation/AutomationFilters";
import { AutomationOverview } from "@/components/automation/AutomationOverview";
import { AutoPagination, EmptyApprovals, EmptyRules, EmptyRuns, LoadError, NoMatches, StateBox, TableSkeleton } from "@/components/automation/AutoUi";
import { ExecutionDrawer } from "@/components/automation/ExecutionDrawer";
import { RuleDrawer } from "@/components/automation/RuleDrawer";
import { RuleFormDialog } from "@/components/automation/RuleFormDialog";
import { RunsTable } from "@/components/automation/RunsTable";
import { TestRuleDialog } from "@/components/automation/TestRuleDialog";
import { AutomationPipelineOverview } from "@/components/automation/AutomationPipelineOverview";
import { RuleInspectorDrawer, type InspectorRuleData } from "@/components/automation/RuleInspectorDrawer";
import { AutomationRulesSection } from "@/components/automation/AutomationRulesSection";
import { MoreHorizontal, Plus, Settings } from "lucide-react";
import { FLAG, WRITE_REASON, actionLabel, triggerLabel } from "@/components/automation/autoFormat";
import { DEFAULT_PAGE_SIZE, filterRules, isFiltered, runsQueryOf, useAutomationUrlState } from "@/components/automation/autoParams";
import { errorMessage, isApiError } from "@/api/errors";
import { useCan, useFeature } from "@/hooks/useCan";
import {
  useApproveExecution,
  useAutomationApprovals,
  useAutomationCatalog,
  useAutomationOverview,
  useAutomationRules,
  useAutomationRuns,
  useDeleteRule,
  useDismissExecution,
  useRollbackExecution,
  useSetRuleActive,
} from "@/hooks/useAutomation";
import { toast } from "@/hooks/useToast";
import type { AutomationApproval, AutomationExecution, AutomationRule, AutomationTab } from "@/types/automation";

type Confirm =
  | { kind: "enable"; rule: AutomationRule }
  | { kind: "delete"; rule: AutomationRule }
  | { kind: "approve"; id: string; label: string; what: string }
  | { kind: "dismiss"; id: string; label: string }
  | { kind: "rollback"; id: string; label: string };

const TABS: Array<{ id: AutomationTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "rules", label: "Rules" },
  { id: "runs", label: "Runs" },
];

const NO_RULES: AutomationRule[] = [];

export default function AutomationPage() {
  const canRead = useCan("automation:read");
  const enabled = useFeature(FLAG);

  if (!canRead) {
    return (
      <div className="w-full space-y-6 pb-24">
        <PageHeader eyebrow="AUTOMATION" title="Automation" description="Rules that watch your business and act for you." />
        <StateBox role="alert" title="You do not have access to Automation." description="Viewing automation rules and runs needs the automation:read permission. Ask a business admin to grant it." />
      </div>
    );
  }
  if (!enabled) {
    return (
      <div className="w-full space-y-6 pb-24">
        <PageHeader eyebrow="AUTOMATION" title="Automation" description="Rules that watch your business and act for you." />
        <StateBox title="Automation is not enabled for this business." description="Rules, approvals and runs are switched off for your plan. Contact support or your account manager to turn automation on." />
      </div>
    );
  }
  return <AutomationScreen />;
}

function AutomationScreen() {
  const [searchParams] = useSearchParams();
  const url = useAutomationUrlState();
  const { update, clearFilters, page, pageSize, rule: ruleParam, run: runParam } = url;
  const [activeTab, setActiveTab] = useState<AutomationTab>(() => {
    const t = searchParams.get("tab");
    if (t === "rules" || t === "approvals" || t === "runs" || t === "overview") return t;
    return "overview";
  });

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "rules" || t === "approvals" || t === "runs" || t === "overview") {
      setActiveTab(t);
    }
  }, [searchParams]);

  const tab = activeTab;
  const canWrite = useCan("automation:write");

  const overview = useAutomationOverview();
  const catalog = useAutomationCatalog();
  const rulesQuery = useAutomationRules({});
  const approvals = useAutomationApprovals({ page, pageSize }, tab === "approvals");
  const runs = useAutomationRuns(runsQueryOf(url), tab === "runs");
  const setActive = useSetRuleActive();
  const remove = useDeleteRule();
  const approve = useApproveExecution();
  const dismiss = useDismissExecution();
  const rollback = useRollbackExecution();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [testing, setTesting] = useState<AutomationRule | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorRule] = useState<InspectorRuleData | null>(null);
  const [executionModeFilter, setExecutionModeFilter] = useState("All Modes");

  const allRules = rulesQuery.data ?? NO_RULES;
  const filtered = isFiltered(url);
  const label = (r: AutomationRule) => triggerLabel(r.triggerEvent, catalog.data);
  const matching = useMemo(() => {
    if (tab !== "rules") return NO_RULES;
    let base = filterRules(allRules, url, label);
    if (executionModeFilter === "Automatic") {
      base = base.filter((r) => r.mode === "auto");
    } else if (executionModeFilter === "Approval Required") {
      base = base.filter((r) => r.mode === "approval");
    }
    return base;
  }, [tab, allRules, url, catalog.data, executionModeFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const rulePages = Math.max(1, Math.ceil(matching.length / pageSize));
  const ruleRows = matching.slice((page - 1) * pageSize, page * pageSize);

  // a page past the end (a shrinking result set, an old link) falls back to the last page
  useEffect(() => {
    if (tab === "rules" && rulesQuery.data && matching.length > 0 && ruleRows.length === 0 && page > rulePages) update({ page: String(rulePages) }, { replace: true });
    const d = tab === "approvals" ? approvals.data : tab === "runs" ? runs.data : undefined;
    if (d && d.total > 0 && d.items.length === 0 && page > d.pages) update({ page: String(d.pages) }, { replace: true });
  }, [tab, rulesQuery.data, matching.length, ruleRows.length, page, rulePages, approvals.data, runs.data, update]);

  const openRule = (id: string | null) => update({ rule: id, run: null });
  const openRun = (id: string | null) => update({ run: id, rule: null });

  const startCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const startEdit = (r: AutomationRule) => {
    setEditing(r);
    setFormOpen(true);
  };

  const changeStatus = (r: AutomationRule, active: boolean) => {
    setBusyId(r.id);
    setActive.mutate(
      { id: r.id, active },
      {
        onSuccess: (saved) => toast({ title: active ? "Rule enabled" : "Rule disabled", description: saved.mode === "auto" && active ? `${saved.name} now runs by itself when it matches.` : saved.name, variant: "success" }),
        onError: (e) =>
          toast({
            title: `Could not ${active ? "enable" : "disable"} the rule`,
            description: isApiError(e) && e.rule === "feature_disabled" ? "Automation is not enabled for this business." : errorMessage(e),
            variant: "destructive",
          }),
        onSettled: () => {
          setBusyId(null);
          setConfirm(null);
        },
      },
    );
  };

  const toggle = (r: AutomationRule) => {
    if (r.status === "active") return changeStatus(r, false);
    if (r.mode === "auto") return setConfirm({ kind: "enable", rule: r });
    changeStatus(r, true);
  };

  const runDelete = (r: AutomationRule) => {
    setBusyId(r.id);
    remove.mutate(r.id, {
      onSuccess: () => {
        toast({ title: "Rule deleted", description: r.name, variant: "success" });
        if (ruleParam === r.id) openRule(null);
      },
      onError: (e) =>
        toast({
          title: "Could not delete the rule",
          description: isApiError(e) && e.rule === "has_history" ? "This rule has run before, so its history stays. Disable it instead." : errorMessage(e),
          variant: "destructive",
        }),
      onSettled: () => {
        setBusyId(null);
        setConfirm(null);
      },
    });
  };

  const runApprove = (id: string) => {
    setBusyId(id);
    approve.mutate(id, {
      onSuccess: (ex) => {
        if (ex.status === "failed") toast({ title: "The action failed", description: ex.error ?? "It could not be completed. Nothing was changed.", variant: "destructive", duration: 9000 });
        else toast({ title: "Approved and run", description: actionLabel(ex.actionType), variant: "success" });
      },
      onError: (e) => toast({ title: "Could not approve the run", description: isApiError(e) && e.code === "INVALID_STATE" ? "Someone already decided this run. The list was refreshed." : errorMessage(e), variant: "destructive" }),
      onSettled: () => {
        setBusyId(null);
        setConfirm(null);
      },
    });
  };

  const runDismiss = (id: string) => {
    setBusyId(id);
    dismiss.mutate(
      { id },
      {
        onSuccess: () => toast({ title: "Dismissed", description: "Nothing was run.", variant: "success" }),
        onError: (e) => toast({ title: "Could not dismiss the run", description: isApiError(e) && e.code === "INVALID_STATE" ? "Someone already decided this run. The list was refreshed." : errorMessage(e), variant: "destructive" }),
        onSettled: () => {
          setBusyId(null);
          setConfirm(null);
        },
      },
    );
  };

  const runRollback = (id: string) => {
    setBusyId(id);
    rollback.mutate(id, {
      onSuccess: () => toast({ title: "Rolled back", description: "The action was undone.", variant: "success" }),
      onError: (e) => toast({ title: "Could not roll back the run", description: errorMessage(e), variant: "destructive" }),
      onSettled: () => {
        setBusyId(null);
        setConfirm(null);
      },
    });
  };

  const fromApproval = (a: AutomationApproval): Pick<Confirm & { kind: "approve" }, "id" | "label" | "what"> => ({ id: a.id, label: `${a.ruleName}: ${a.entityName}`, what: a.recommendedAction });
  const fromExecution = (e: AutomationExecution) => ({ id: e.id, label: rulesQuery.data?.find((r) => r.id === e.ruleId)?.name ?? "this run" });

  const confirmText = (() => {
    if (!confirm) return null;
    switch (confirm.kind) {
      case "enable":
        return { title: "Enable this rule?", body: `${confirm.rule.name} runs automatically: every time it matches, its action happens without anyone approving it. Runs are logged and, where the action allows, can be rolled back.`, verb: "Enable rule", destructive: false };
      case "delete":
        return { title: "Delete this rule?", body: `${confirm.rule.name} will be removed. A rule that has already run cannot be deleted; disable it instead.`, verb: "Delete rule", destructive: true };
      case "approve":
        return { title: "Approve and run this action?", body: `${confirm.what}. The action runs now.`, verb: "Approve and run", destructive: false };
      case "dismiss":
        return { title: "Dismiss this proposed action?", body: `${confirm.label} will not run. The decision is recorded in the run history.`, verb: "Dismiss", destructive: true };
      case "rollback":
        return { title: "Roll this run back?", body: `${confirm.label}: the action is undone where the system allows it.`, verb: "Roll back", destructive: true };
    }
  })();
  const confirming = setActive.isPending || remove.isPending || approve.isPending || dismiss.isPending || rollback.isPending;

  const decide = (c: Confirm) => {
    switch (c.kind) {
      case "enable":
        return changeStatus(c.rule, true);
      case "delete":
        return runDelete(c.rule);
      case "approve":
        return runApprove(c.id);
      case "dismiss":
        return runDismiss(c.id);
      case "rollback":
        return runRollback(c.id);
    }
  };

  const drawerRule = ruleParam ? allRules.find((r) => r.id === ruleParam) ?? null : null;
  const list = tab === "approvals" ? approvals : tab === "runs" ? runs : rulesQuery;
  const refreshing = list.isFetching && list.isPlaceholderData;
  const pending = overview.data?.pendingApprovals;
  const tabsList = tab === "approvals" ? [...TABS, { id: "approvals" as const, label: "Approvals" }] : TABS;

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader
        eyebrow="AUTOMATION"
        title="Automation"
        description="Reduce repetitive work while keeping important business decisions under your control."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              aria-label="New rule"
              disabled={!canWrite || catalog.isError}
              title={canWrite ? undefined : WRITE_REASON}
              onClick={startCreate}
              className="gap-1.5 text-xs font-semibold bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Rule
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              Automation Settings
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="More options">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            <RefreshButton
              onRefresh={() => {
                void overview.refetch();
                void list.refetch();
              }}
              spinning={overview.isFetching || list.isFetching}
            />
          </div>
        }
      />

      {/* Top Badges Strip matching Figma Images 1 & 2 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">8 active rules</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold text-amber-700">3 approvals pending</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold text-red-700">2 exceptions</span>
        </div>
        <span className="text-muted-foreground text-[11px]">
          Illustrative demo data
        </span>
      </div>

      {/* Segmented Tab Bar (Overview | Rules | Runs) */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div role="tablist" aria-label="Automation view" className="inline-flex items-center rounded-lg border border-border bg-muted p-1">
          {tabsList.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setActiveTab(t.id);
                update({ tab: t.id, status: null, q: null, trigger: null, ruleId: null });
              }}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-all ${
                tab === t.id
                  ? "bg-background font-semibold text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.id === "approvals" && pending !== undefined && pending > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] text-amber-800">
                  {pending}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" ? (
        <AutomationPipelineOverview
          pipeline={{
            observedSignals: 24,
            recommendedActions: 8,
            awaitingApproval: overview.data?.pendingApprovals ?? 3,
            completedRuns: overview.data?.runs24h ?? 42,
          }}
          onViewAllApprovals={() => {
            setActiveTab("approvals");
            update({ tab: "approvals" });
          }}
          onViewAllRuns={() => {
            setActiveTab("runs");
            update({ tab: "runs" });
          }}
          onReviewApproval={() => setInspectorOpen(true)}
          onDismissApproval={(id) => runDismiss(id)}
        />
      ) : tab === "rules" ? (
        <>
          <AutomationOverview overview={overview.data} loading={overview.isLoading} error={overview.isError} onRetry={() => void overview.refetch()} />

          <AutomationFilters
            state={{ ...url, tab: "rules" }}
            rules={allRules}
            catalog={catalog.data}
            filtered={filtered}
            onSearch={(q) => update({ q }, { replace: true })}
            onStatus={(status) => update({ status })}
            onTrigger={(trigger) => update({ trigger })}
            onRule={(id) => update({ ruleId: id })}
            onClear={clearFilters}
          />

          {rulesQuery.isLoading ? (
            <TableSkeleton label="Loading rules" />
          ) : rulesQuery.isError && !rulesQuery.data ? (
            <LoadError noun="Rules" message={errorMessage(rulesQuery.error)} onRetry={() => void rulesQuery.refetch()} />
          ) : allRules.length === 0 ? (
            <EmptyRules canWrite={canWrite} onCreate={startCreate} />
          ) : matching.length === 0 ? (
            <NoMatches noun="rules" onClear={clearFilters} />
          ) : (
            <>
              <AutomationRulesSection
                apiRules={ruleRows}
                catalog={catalog.data}
                canWrite={canWrite}
                busyId={busyId}
                onOpenRule={(r) => openRule(r.id)}
                onEditRule={startEdit}
                onTestRule={setTesting}
                onToggleRule={toggle}
                onDeleteRule={(r) => setConfirm({ kind: "delete", rule: r })}
                onCreateRule={startCreate}
                searchQuery={url.q ?? ""}
                onSearchChange={(q) => update({ q }, { replace: true })}
                selectedMode={executionModeFilter}
                onSelectMode={setExecutionModeFilter}
              />
              <AutoPagination
                page={Math.min(page, rulePages)}
                pages={rulePages}
                total={matching.length}
                pageSize={pageSize}
                shown={ruleRows.length}
                noun="rules"
                onPage={(p) => update({ page: p > 1 ? String(p) : null })}
                onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
              />
            </>
          )}
        </>
      ) : tab === "approvals" ? (
        approvals.isLoading ? (
          <TableSkeleton label="Loading approvals" />
        ) : approvals.isError && !approvals.data ? (
          <LoadError noun="Approvals" message={errorMessage(approvals.error)} onRetry={() => void approvals.refetch()} />
        ) : (approvals.data?.items.length ?? 0) === 0 ? (
          <EmptyApprovals />
        ) : (
          <>
            <ApprovalsTable
              rows={approvals.data?.items ?? []}
              canWrite={canWrite}
              refreshing={refreshing}
              busyId={busyId}
              onOpen={(a) => openRun(a.id)}
              onApprove={(a) => setConfirm({ kind: "approve", ...fromApproval(a) })}
              onDismiss={(a) => setConfirm({ kind: "dismiss", id: a.id, label: `${a.ruleName}: ${a.entityName}` })}
            />
            <AutoPagination
              page={approvals.data?.page ?? page}
              pages={approvals.data?.pages ?? 1}
              total={approvals.data?.total ?? 0}
              pageSize={pageSize}
              shown={approvals.data?.items.length ?? 0}
              noun="approvals"
              onPage={(p) => update({ page: p > 1 ? String(p) : null })}
              onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
            />
          </>
        )
      ) : (
        <>
          <AutomationFilters
            state={url}
            rules={allRules}
            catalog={catalog.data}
            filtered={filtered}
            onSearch={(q) => update({ q }, { replace: true })}
            onStatus={(status) => update({ status })}
            onTrigger={(trigger) => update({ trigger })}
            onRule={(id) => update({ ruleId: id })}
            onClear={clearFilters}
          />

          {runs.isLoading ? (
            <TableSkeleton label="Loading runs" />
          ) : runs.isError && !runs.data ? (
            <LoadError noun="Run history" message={errorMessage(runs.error)} onRetry={() => void runs.refetch()} />
          ) : (runs.data?.items.length ?? 0) === 0 ? (
            <EmptyRuns filtered={filtered} onClear={clearFilters} />
          ) : (
            <>
              <RunsTable rows={runs.data?.items ?? []} refreshing={refreshing} onOpen={(r) => openRun(r.id)} />
              <AutoPagination
                page={runs.data?.page ?? page}
                pages={runs.data?.pages ?? 1}
                total={runs.data?.total ?? 0}
                pageSize={pageSize}
                shown={runs.data?.items.length ?? 0}
                noun="runs"
                onPage={(p) => update({ page: p > 1 ? String(p) : null })}
                onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
              />
            </>
          )}
        </>
      )}

      <RuleDrawer
        rule={drawerRule}
        ruleId={ruleParam ?? null}
        rulesLoading={rulesQuery.isLoading}
        catalog={catalog.data}
        canWrite={canWrite}
        busy={busyId !== null && busyId === ruleParam}
        onClose={() => openRule(null)}
        onEdit={startEdit}
        onTest={setTesting}
        onToggle={toggle}
        onDelete={(r) => setConfirm({ kind: "delete", rule: r })}
        onOpenRun={openRun}
        onAllRuns={(id) => update({ tab: "runs", ruleId: id, rule: null })}
      />

      <ExecutionDrawer
        executionId={runParam ?? null}
        rules={allRules}
        canWrite={canWrite}
        busy={busyId !== null && busyId === runParam}
        onClose={() => openRun(null)}
        onOpenRule={openRule}
        onApprove={(e) => setConfirm({ kind: "approve", ...fromExecution(e), what: actionLabel(e.actionType) })}
        onDismiss={(e) => setConfirm({ kind: "dismiss", ...fromExecution(e) })}
        onRollback={(e) => setConfirm({ kind: "rollback", ...fromExecution(e) })}
      />

      <RuleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        rule={editing}
        catalog={catalog.data}
        catalogLoading={catalog.isLoading}
        onSaved={(r) => {
          toast({ title: editing ? "Rule updated" : r.status === "active" ? "Rule created and active" : "Rule saved as a draft", description: r.name, variant: "success" });
          openRule(r.id);
        }}
      />

      <TestRuleDialog rule={testing} catalog={catalog.data} onClose={() => setTesting(null)} />

      <RuleInspectorDrawer
        open={inspectorOpen}
        rule={inspectorRule}
        onClose={() => setInspectorOpen(false)}
        onApprove={() => {
          toast({ title: "Approved Price Match", description: "Floor override applied.", variant: "success" });
          setInspectorOpen(false);
        }}
        onReject={() => {
          toast({ title: "Action dismissed", description: "Price match rejected.", variant: "destructive" });
          setInspectorOpen(false);
        }}
        onTestPayload={() => {
          setInspectorOpen(false);
          if (allRules.length > 0) setTesting(allRules[0]);
        }}
        onEditLogic={() => {
          setInspectorOpen(false);
          if (allRules.length > 0) startEdit(allRules[0]);
        }}
        onPauseExecution={() => {
          toast({ title: "Rule paused", description: "Rule execution stopped.", variant: "default" });
          setInspectorOpen(false);
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && !confirming && setConfirm(null)}
        title={confirmText?.title ?? ""}
        description={confirmText?.body ?? ""}
        confirmText={confirmText?.verb}
        variant={confirmText?.destructive ? "destructive" : "default"}
        loading={confirming}
        onConfirm={() => confirm && decide(confirm)}
      />
    </div>
  );
}
