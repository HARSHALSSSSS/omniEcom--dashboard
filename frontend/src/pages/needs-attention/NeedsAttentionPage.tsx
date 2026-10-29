import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RotateCw } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { toAppPath } from "@/lib/links";
import { useCan } from "@/hooks/useCan";
import {
  useAssignees,
  useIssueActions,
  useIssueCounts,
  useIssueHistory,
  useIssues,
  useQueueRecommendation,
} from "@/hooks/useNeedsAttention";
import type { BulkResult, IssueFilters, SnoozePreset } from "@/types/attention";
import { BulkBar } from "./BulkBar";
import { HistoryView } from "./HistoryView";
import { IssueDrawer } from "./IssueDrawer";
import { IssueList } from "./IssueList";
import { Pager } from "./Pager";
import { QueueFilters } from "./QueueFilters";
import { QueueNotice, type Notice } from "./QueueNotice";
import { QueueEmpty, QueueError, QueueSkeleton } from "./QueueStates";
import { QueueTabs } from "./QueueTabs";
import { RecommendationBanner } from "./RecommendationBanner";
import { SNOOZE_LABEL } from "@/hooks/useNeedsAttention";
import { ago } from "./attention.ui";
import { PAGE_SIZE, useQueueParams } from "./queueParams";

/** a clock that moves every 30 seconds, so "Updated 2 min ago" stays true without refetching */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Needs attention: the issue queue of the business, read from and acted on through /issues */
export default function NeedsAttentionPage() {
  const navigate = useNavigate();
  const p = useQueueParams();
  const now = useNow();
  const canWrite = useCan("issues:write");

  const filters: IssueFilters = { tab: p.tab, area: p.area, priority: p.priority, status: p.status, due: p.due, page: p.page, pageSize: PAGE_SIZE };
  const issues = useIssues(filters);
  const counts = useIssueCounts();
  const recommendation = useQueueRecommendation();
  const history = useIssueHistory(p.historyStatus, p.historyPage, PAGE_SIZE, p.view === "history");
  const assignees = useAssignees(canWrite);
  const actions = useIssueActions();

  const [rawSelected, setRawSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);

  const rows = useMemo(() => issues.data?.items ?? [], [issues.data]);
  // only rows that are on screen count as selected
  const selected = useMemo(() => rawSelected.filter((id) => rows.some((r) => r.id === id)), [rawSelected, rows]);
  const members = assignees.isError ? undefined : assignees.data;

  const go = (href: string | null | undefined) => navigate(toAppPath(href));
  const resetView = () => {
    setRawSelected([]);
    setNotice(null);
  };

  const setFilters = (patch: Record<string, string | undefined>) => {
    resetView();
    p.update(patch);
  };

  const toggleRow = (id: string) => setRawSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () => setRawSelected(selected.length === rows.length ? [] : rows.map((r) => r.id));

  /** what a bulk call did, id by id: the banner names the ones that failed; they stay selected */
  const afterBulk = (verb: "resolved" | "snoozed" | "assigned", result: BulkResult, until?: SnoozePreset) => {
    const title = (id: string) => rows.find((r) => r.id === id)?.title ?? id;
    const failedIds = result.results.filter((r) => !r.ok).map((r) => r.id);
    setRawSelected(failedIds);
    const done = result.succeeded;
    const what = done === 1 ? "Issue" : `${done} issues`;
    const first = rows.find((r) => result.results.find((x) => x.id === r.id)?.ok);
    const base: Notice =
      verb === "resolved"
        ? { tone: "resolved", heading: `${what} marked resolved`, description: `${done === 1 && first ? first.title : "They"} ${done === 1 ? "has" : "have"} been removed from the active queue. It's available in history.`, historyLink: true }
        : verb === "snoozed"
          ? {
              tone: "snoozed",
              heading: `${what} snoozed${until ? ` until ${SNOOZE_LABEL[until]}` : ""}`,
              description: `The ${done === 1 ? "issue has" : "issues have"} temporarily left the active queue. ${done === 1 ? "It" : "They"} will return${until ? ` ${SNOOZE_LABEL[until]}` : " later"}; you can find ${done === 1 ? "it" : "them"} in history now.`,
              historyLink: true,
            }
          : { tone: "info", heading: `${what} assigned`, description: "The assignee is shown under each issue." };
    if (done === 0 && failedIds.length > 0) {
      setNotice({ tone: "error", heading: `Nothing was ${verb}`, description: "Every selected issue was refused.", details: result.results.filter((r) => !r.ok).map((r) => `${title(r.id)}: ${r.error ?? "failed"}`) });
    } else if (failedIds.length > 0) {
      setNotice({ ...base, details: result.results.filter((r) => !r.ok).map((r) => `${title(r.id)}: ${r.error ?? "failed"}`), description: `${base.description} ${failedIds.length} failed:` });
    } else setNotice(base);
  };

  const bulkResolve = () => actions.bulk.mutate({ ids: selected, action: "resolve" }, { onSuccess: (r) => afterBulk("resolved", r) });
  const bulkSnooze = (until: SnoozePreset) => actions.bulk.mutate({ ids: selected, action: "snooze", until }, { onSuccess: (r) => afterBulk("snoozed", r, until) });
  const bulkAssign = (assigneeId: string) => actions.bulk.mutate({ ids: selected, action: "assign", assigneeId }, { onSuccess: (r) => afterBulk("assigned", r) });

  const openIssue = (id: string) => p.update({ issue: id }, { keepPage: true });
  const closeIssue = () => p.update({ issue: undefined }, { keepPage: true });

  const filtered = p.tab !== "all" || Boolean(p.area || p.priority || p.status || p.due);
  const total = issues.data?.total;
  const openCount = counts.data?.open;
  const refreshing = issues.isFetching || counts.isFetching;
  const refreshAll = () => {
    void issues.refetch();
    void counts.refetch();
    if (p.view === "history") void history.refetch();
  };

  return (
    <div className="flex flex-col gap-6 w-full select-none pb-12 font-['Inter',sans-serif]">
      {/* 1. Page introduction */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 w-full">
        <div className="flex flex-col gap-1.5 flex-1">
          <span className="text-[10px] font-medium leading-[12px] text-[#707070] uppercase tracking-normal">Operations</span>
          <h1 className="text-[26px] font-semibold text-[#000000] leading-[145%]">Needs attention</h1>
          <p className="text-[13px] font-normal text-[#666666] leading-[145%]">Resolve issues before they affect orders, inventory or sales.</p>
        </div>

        <div className="flex flex-row items-center justify-between sm:justify-end gap-3 w-full sm:w-auto shrink-0">
        <button
          type="button"
          onClick={refreshAll}
          className="box-border flex flex-row items-center px-[10px] gap-[6px] h-[32px] min-h-[44px] sm:min-h-0 bg-white border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
        >
          <RotateCw className={`w-[14px] h-[14px] text-[#666666] stroke-[1.5px] ${refreshing ? "animate-spin" : ""}`} />
          <span className="text-[12px] font-normal leading-[145%] text-[#666666]">Refresh</span>
        </button>
        <div className="flex flex-col items-end gap-1" data-testid="queue-summary">
          <span className="text-[13px] font-semibold text-[#000000] leading-[145%]">
            {counts.isPending ? "Loading issues..." : counts.isError ? "Issue count unavailable" : `${openCount} open ${openCount === 1 ? "issue" : "issues"}`}
          </span>
          <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
            {counts.isPending ? "Checking for updates" : counts.data ? `Updated ${ago(counts.data.updatedAt, now)}` : ""}
            {canWrite && !counts.isPending && (
              <>
                {counts.data ? " · " : ""}
                <button type="button" disabled={actions.refresh.isPending} onClick={() => actions.refresh.mutate()} className="font-medium text-[#000000] hover:underline disabled:opacity-50 py-1 sm:py-0 inline-block">
                  {actions.refresh.isPending ? "Checking..." : "Check now"}
                </button>
              </>
            )}
          </span>
        </div>
        </div>
      </div>

      {/* 2. Tabs and filters */}
      <div className="flex flex-col gap-4 w-full">
        <QueueTabs
          view={p.view}
          tab={p.tab}
          counts={counts.data}
          historyTotal={history.data?.counts.all}
          onTab={(tab) => setFilters({ tab })}
          onView={(view) => {
            resetView();
            p.update({ view: view === "history" ? "history" : undefined, issue: undefined }, { keepPage: true });
          }}
        />
        {p.view === "queue" && (
          <QueueFilters area={p.area} priority={p.priority} status={p.status} due={p.due} matching={total} onChange={setFilters} />
        )}
      </div>

      {/* 3. Queue, history, or their states */}
      {p.view === "history" ? (
        <HistoryView
          status={p.historyStatus}
          page={p.historyPage}
          data={history.data}
          loading={history.isPending}
          fetching={history.isFetching}
          error={history.error}
          canWrite={canWrite}
          unsnoozingId={actions.unsnooze.isPending ? (actions.unsnooze.variables ?? null) : null}
          onStatus={(hstatus) => p.update({ hstatus })}
          onPage={(hpage) => p.update({ hpage: String(hpage) }, { keepPage: true })}
          onOpen={openIssue}
          onUnsnooze={(id) => actions.unsnooze.mutate(id)}
          onRetry={() => history.refetch()}
        />
      ) : issues.isPending ? (
        <QueueSkeleton />
      ) : issues.isError && !issues.data ? (
        <QueueError error={issues.error} onRetry={() => issues.refetch()} />
      ) : rows.length === 0 && !notice ? (
        <QueueEmpty
          filtered={filtered}
          onClear={() => setFilters({ tab: undefined, area: undefined, priority: undefined, status: undefined, due: undefined })}
          onDashboard={() => navigate(ROUTES.DASHBOARD)}
          onActivity={() => navigate(ROUTES.REPORTS)}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 w-full relative">
            {p.status === "in_progress" && (
              <QueueNotice notice={{ tone: "info", heading: "These issues are being worked on", description: "In-progress issues stay in the queue until they are marked resolved." }} onHistory={() => undefined} />
            )}
            {notice && <QueueNotice notice={notice} onHistory={() => p.update({ view: "history" }, { keepPage: true })} onDismiss={() => setNotice(null)} />}

            {canWrite && selected.length > 0 && (
              <BulkBar
                count={selected.length}
                busy={actions.bulk.isPending}
                members={members}
                onResolve={bulkResolve}
                onSnooze={bulkSnooze}
                onAssign={bulkAssign}
                onClear={() => setRawSelected([])}
              />
            )}

            {rows.length > 0 ? (
              <IssueList issues={rows} selected={selected} canWrite={canWrite} onToggle={toggleRow} onToggleAll={toggleAll} onOpen={openIssue} />
            ) : (
              <QueueEmpty filtered={filtered} onClear={() => setFilters({ tab: undefined, area: undefined, priority: undefined, status: undefined, due: undefined })} onDashboard={() => navigate(ROUTES.DASHBOARD)} onActivity={() => navigate(ROUTES.REPORTS)} />
            )}

            {issues.data && rows.length > 0 && (
              <Pager page={issues.data.page} pages={issues.data.pages} shown={rows.length} total={issues.data.total} fetching={issues.isFetching} onPage={(page) => { setRawSelected([]); p.update({ page: String(page) }, { keepPage: true }); }} />
            )}
          </div>

          {/* 4. Recommended action banner: only when the server has one */}
          {p.status !== "in_progress" && recommendation.data && <RecommendationBanner recommendation={recommendation.data} onAction={go} />}
        </>
      )}

      {/* 5. Issue drawer (?issue=<id>) */}
      {p.issueId && <IssueDrawer id={p.issueId} canWrite={canWrite} members={members} actions={actions} onGo={go} onClose={closeIssue} />}
    </div>
  );
}
