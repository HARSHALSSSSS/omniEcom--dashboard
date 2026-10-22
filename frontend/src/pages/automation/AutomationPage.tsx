import { useEffect, useMemo, useState } from "react";
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
import { RulesTable } from "@/components/automation/RulesTable";
import { RunsTable } from "@/components/automation/RunsTable";
import { TestRuleDialog } from "@/components/automation/TestRuleDialog";
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
  { id: "rules", label: "Rules" },
  { id: "approvals", label: "Approvals" },
  { id: "runs", label: "Run history" },
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
  const url = useAutomationUrlState();
  const { tab, update, clearFilters, page, pageSize, rule: ruleParam, run: runParam } = url;
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

  const allRules = rulesQuery.data ?? NO_RULES;
  const filtered = isFiltered(url);
  const label = (r: AutomationRule) => triggerLabel(r.triggerEvent, catalog.data);
  const matching = useMemo(() => (tab === "rules" ? filterRules(allRules, url, label) : NO_RULES), [tab, allRules, url, catalog.data]); // eslint-disable-line react-hooks/exhaustive-deps
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

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader
        eyebrow="AUTOMATION"
        title="Automation"
        description="Rules that watch for an event, check your conditions and then do one thing for you. New rules ask for approval until you let them run on their own."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div role="tablist" aria-label="Automation view" className="inline-flex items-center rounded-lg border border-border bg-muted p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => update({ tab: t.id, status: null, q: null, trigger: null, ruleId: null })}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-all ${tab === t.id ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t.label}
                  {t.id === "approvals" && pending !== undefined && pending > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] text-amber-800">{pending}</span>}
                </button>
              ))}
            </div>
            <RefreshButton
              onRefresh={() => {
                void overview.refetch();
                void list.refetch();
              }}
              spinning={overview.isFetching || list.isFetching}
            />
            <Button size="sm" disabled={!canWrite || catalog.isError} title={canWrite ? undefined : WRITE_REASON} onClick={startCreate}>
              New rule
            </Button>
          </div>
        }
      />

      <AutomationOverview overview={overview.data} loading={overview.isLoading} error={overview.isError} onRetry={() => void overview.refetch()} />

      {tab !== "approvals" && (
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
      )}

      {tab === "rules" ? (
        rulesQuery.isLoading ? (
          <TableSkeleton label="Loading rules" />
        ) : rulesQuery.isError && !rulesQuery.data ? (
          <LoadError noun="Rules" message={errorMessage(rulesQuery.error)} onRetry={() => void rulesQuery.refetch()} />
        ) : allRules.length === 0 ? (
          <EmptyRules canWrite={canWrite} onCreate={startCreate} />
        ) : matching.length === 0 ? (
          <NoMatches noun="rules" onClear={clearFilters} />
        ) : (
          <>
            <RulesTable
              rows={ruleRows}
              catalog={catalog.data}
              canWrite={canWrite}
              refreshing={refreshing}
              busyId={busyId}
              onOpen={(r) => openRule(r.id)}
              onEdit={startEdit}
              onTest={setTesting}
              onToggle={toggle}
              onDelete={(r) => setConfirm({ kind: "delete", rule: r })}
            />
            <AutoPagination page={Math.min(page, rulePages)} pages={rulePages} total={matching.length} pageSize={pageSize} shown={ruleRows.length} noun="rules" onPage={(p) => update({ page: p > 1 ? String(p) : null })} onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })} />
          </>
        )
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
      ) : runs.isLoading ? (
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
