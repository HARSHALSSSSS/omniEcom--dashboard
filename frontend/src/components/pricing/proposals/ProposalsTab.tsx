import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { errorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { useBulkDecide, useDecideProposal, useProposals } from "@/hooks/usePricing";
import { toast } from "@/hooks/useToast";
import { StateBox, LoadError, ListSkeleton } from "../PricingStates";
import { ConflictDialog } from "../ConflictDialog";
import { PricingPagination } from "../PricingPagination";
import { DEFAULT_PAGE_SIZE, DEFAULT_SORT, DEFAULT_TAB, proposalsFiltered, type usePricingUrlState } from "../pricingParams";
import { decisionError, isDecidable, isVersionConflict } from "../pricingFormat";
import { exportProposals, exportToast } from "../pricingExport";
import type { DecisionAction, PriceProposal, PricingChannel } from "@/types/pricing";
import { BulkResultsDialog, type BulkResultsView } from "./BulkResultsDialog";
import { DecisionDialog, type DecisionTarget } from "./DecisionDialog";
import { ProposalBulkBar } from "./ProposalBulkBar";
import { ProposalDrawer } from "./ProposalDrawer";
import { ProposalFilters } from "./ProposalFilters";
import { ProposalFootnote, ProposalTable } from "./ProposalTable";
import { ProposalKpiStrip } from "./ProposalKpiStrip";
import { ProposalDetailReviewCard } from "./ProposalDetailReviewCard";

/** the API decides at most this many proposals per bulk call (the page size never exceeds it) */
const BULK_MAX = 100;

interface ProposalsTabProps {
  url: ReturnType<typeof usePricingUrlState>;
  channels: PricingChannel[];
  canApprove: boolean;
  canWrite: boolean;
  onGenerate: () => void;
}

export function ProposalsTab({ url, channels, canApprove, canWrite, onGenerate }: ProposalsTabProps) {
  const { proposals: query, update, clearFilters } = url;
  const list = useProposals(query);
  // the pending proposals (same channel filter) behind the "below margin target" tile
  const pendingQuery = useMemo(() => ({ tab: "pending_review" as const, accountId: query.accountId, sort: DEFAULT_SORT, page: 1, pageSize: 100 }), [query.accountId]);
  const pendingList = useProposals(pendingQuery);
  const decide = useDecideProposal();
  const bulk = useBulkDecide();

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  // the proposal shown in the review card (the first one until another is picked)
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionTarget | null>(null);
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [results, setResults] = useState<BulkResultsView | null>(null);
  const [exporting, setExporting] = useState(false);

  const rows = useMemo<PriceProposal[]>(() => list.data?.items ?? [], [list.data]);
  const open = rows.find((r) => r.id === openId) ?? null;

  const queryKey = JSON.stringify(query);
  // a selection belongs to the page it was made on
  useEffect(() => setSelected(new Set()), [queryKey]);

  // a page past the end (a shrinking result set, an old link) falls back to the last page
  useEffect(() => {
    const d = list.data;
    if (d && d.total > 0 && d.items.length === 0 && query.page > d.pages) update({ page: String(d.pages) }, { replace: true });
  }, [list.data, query.page, update]);

  const toggle = useCallback(
    (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );
  const selectableIds = useMemo(() => rows.filter(isDecidable).map((r) => r.id), [rows]);
  const toggleAll = useCallback(() => setSelected((prev) => (selectableIds.length > 0 && selectableIds.every((id) => prev.has(id)) ? new Set() : new Set(selectableIds))), [selectableIds]);

  const closeDecision = () => {
    setDecision(null);
    setDecisionMessage(null);
  };

  const confirm = (note: string) => {
    if (!decision) return;
    setDecisionMessage(null);
    if (decision.kind === "one") {
      const p = decision.proposal;
      decide.mutate(
        { id: p.id, action: decision.action, version: p.version, ...(note ? { note } : {}) },
        {
          onSuccess: (res) => {
            closeDecision();
            setOpenId(null);
            const skipped = res.pushed.some((x) => x.skipped);
            if (res.outcome === "unchanged") toast({ title: "Nothing changed", description: "This proposal was already decided." });
            else if (res.outcome === "rejected") toast({ title: "Proposal rejected", description: `The price of ${p.sku} stays as it is.` });
            else toast({ title: "Price applied", description: skipped ? `${p.sku} is saved here. This marketplace cannot take price updates through its API: change the price in the seller panel.` : `${p.sku} is queued to go live on ${p.channelName}.` });
          },
          onError: (e) => {
            if (isVersionConflict(e)) {
              closeDecision();
              setConflict(true);
            } else setDecisionMessage(decisionError(e));
          },
        },
      );
      return;
    }
    const labels = Object.fromEntries(rows.filter((r) => decision.ids.includes(r.id)).map((r) => [r.id, `${r.sku} · ${r.channelName}`]));
    bulk.mutate(
      { ids: decision.ids, action: decision.action, ...(note ? { note } : {}) },
      {
        onSuccess: (res) => {
          closeDecision();
          setResults({ result: res, labels });
          // what did not succeed stays selected so it can be retried or looked at
          setSelected(new Set(res.items.filter((i) => i.outcome !== "applied" && i.outcome !== "rejected" && i.outcome !== "unchanged").map((i) => i.id)));
        },
        onError: (e) => setDecisionMessage(decisionError(e)),
      },
    );
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      toast(exportToast(await exportProposals(query), "proposal"));
    } catch (e) {
      toast({ title: "Could not export", description: errorMessage(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const startDecision = (row: PriceProposal, action: DecisionAction) => {
    setDecisionMessage(null);
    setDecision({ kind: "one", action, proposal: row });
  };

  const filtered = proposalsFiltered(query);
  const total = list.data?.total ?? 0;
  const refreshing = list.isFetching && list.isPlaceholderData;
  const busyId = decide.isPending && decision?.kind === "one" ? decision.proposal.id : null;
  const pending = decide.isPending || bulk.isPending;

  const activeProposal = rows.find((r) => r.id === reviewId) ?? rows[0];

  const pendingRows = pendingList.data?.items;
  const belowTarget = pendingRows?.filter((r) => r.currentMarginBps !== null && r.targetMarginBps !== null && r.currentMarginBps < r.targetMarginBps).length;
  const targets = pendingRows?.flatMap((r) => (r.targetMarginBps === null ? [] : [r.targetMarginBps])) ?? [];
  const counts = list.data?.counts;

  return (
    <div className="space-y-6">
      {/* 1. Top KPI strip matching Figma Screen 2 */}
      <ProposalKpiStrip
        pendingCount={counts?.pending_review}
        belowTargetCount={belowTarget}
        belowTargetCapped={(pendingList.data?.total ?? 0) > (pendingRows?.length ?? 0)}
        targetMarginBps={pendingRows ? (targets.length ? Math.max(...targets) : null) : undefined}
        appliedCount={counts ? (counts.approved ?? 0) + (counts.auto_applied ?? 0) : undefined}
      />

      {/* 2. Proposal Filters */}
      <ProposalFilters
        query={query}
        counts={list.data?.counts}
        channels={channels}
        filtered={filtered}
        onTab={(tab) => update({ tab: tab === DEFAULT_TAB ? null : tab })}
        onSearch={(q) => update({ q }, { replace: true })}
        onAccount={(id) => update({ account: id })}
        onStrategy={(s) => update({ strategy: s })}
        onSort={(s) => update({ sort: s === DEFAULT_SORT ? null : s })}
        onClear={clearFilters}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Nothing changes on a marketplace until a proposal is approved.</p>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" loading={exporting} disabled={total === 0} onClick={() => void exportAll()}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Export CSV
        </Button>
      </div>

      {canApprove && selected.size > 0 && (
        <ProposalBulkBar count={selected.size} max={BULK_MAX} busy={pending} onAction={(action) => { setDecisionMessage(null); setDecision({ kind: "bulk", action, ids: [...selected] }); }} onClear={() => setSelected(new Set())} />
      )}

      {list.isLoading ? (
        <ListSkeleton label="Loading proposals" />
      ) : list.isError && !list.data ? (
        <LoadError what="Proposals" message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        filtered ? (
          <StateBox title="No proposals match these filters." description="Try a different search, channel or strategy.">
            <Button variant="outline" size="sm" className="text-xs" onClick={clearFilters}>
              Clear filters
            </Button>
          </StateBox>
        ) : (
          <StateBox
            title={query.tab === "pending_review" ? "No proposals are waiting for review." : "No proposals here."}
            description="Proposals come from your pricing policies and the competitor prices you record. Generate proposals to check every listing now."
          >
            {canWrite && (
              <Button size="sm" className="text-xs" onClick={onGenerate}>
                Generate proposals
              </Button>
            )}
          </StateBox>
        )
      ) : (
        <>
          <ProposalTable rows={rows} selected={selected} canApprove={canApprove} refreshing={refreshing} busyId={busyId} onToggle={toggle} onToggleAll={toggleAll} onOpen={(r) => {
              setOpenId(r.id);
              setReviewId(r.id);
            }} onDecide={startDecision} />
          <ProposalFootnote total={total} />
          <PricingPagination
            page={list.data?.page ?? query.page}
            pages={list.data?.pages ?? 1}
            total={total}
            pageSize={query.pageSize}
            shown={rows.length}
            noun="proposals"
            onPage={(p) => update({ page: p > 1 ? String(p) : null })}
            onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
          />

          {/* 3. Interactive PROPOSAL REVIEW detailed pane at bottom matching Figma */}
          {activeProposal && (
            <div className="pt-2">
              <ProposalDetailReviewCard
                key={activeProposal.id}
                proposal={activeProposal}
                currentIndex={rows.findIndex((r) => r.id === activeProposal.id) + 1 || 1}
                totalCount={rows.length}
                canApprove={canApprove}
                isSubmitting={pending}
                onNextProposal={() => {
                  const idx = rows.findIndex((r) => r.id === activeProposal.id);
                  setReviewId(rows[(idx + 1) % rows.length].id);
                }}
                onApproveProposal={() => startDecision(activeProposal, "approve")}
                onRejectProposal={() => startDecision(activeProposal, "reject")}
              />
            </div>
          )}
        </>
      )}

      <ProposalDrawer proposal={open} canApprove={canApprove} onClose={() => setOpenId(null)} onDecide={startDecision} />
      <DecisionDialog target={decision} pending={pending} error={decisionMessage} onConfirm={confirm} onClose={closeDecision} />
      <BulkResultsDialog view={results} onClose={() => setResults(null)} />
      <ConflictDialog
        open={conflict}
        what="proposal"
        onClose={() => setConflict(false)}
        onReload={() => {
          setConflict(false);
          void list.refetch();
        }}
      />
    </div>
  );
}
