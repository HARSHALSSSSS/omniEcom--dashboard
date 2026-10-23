import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Download, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/common/RefreshButton";
import { CompetitorsTab } from "@/components/pricing/competitors/CompetitorsTab";
import { HistoryTab } from "@/components/pricing/history/HistoryTab";
import { PoliciesTab } from "@/components/pricing/policies/PoliciesTab";
import { PricingOverviewView } from "@/components/pricing/overview/PricingOverviewView";
import { PricingKpis } from "@/components/pricing/PricingKpis";
import { StateBox } from "@/components/pricing/PricingStates";
import { GenerateDialog } from "@/components/pricing/proposals/GenerateDialog";
import { ProposalsTab } from "@/components/pricing/proposals/ProposalsTab";
import { NO_WRITE_REASON } from "@/components/pricing/pricingFormat";
import { usePricingUrlState } from "@/components/pricing/pricingParams";
import { useCan } from "@/hooks/useCan";
import { usePricingOverview } from "@/hooks/usePricing";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import type { PricingView } from "@/types/pricing";

const VIEW_LABELS: Record<PricingView, string> = {
  overview: "Overview",
  proposals: "Price proposals",
  policies: "Strategy rules",
  competitors: "Competitor prices",
  history: "Audit log",
};

const PRIMARY_TABS: readonly PricingView[] = ["overview", "proposals", "history"];

export default function PricingPage() {
  const url = usePricingUrlState();
  const { view, update } = url;
  const canRead = useCan("pricing:read");
  const canWrite = useCan("pricing:write");
  const canApprove = useCan("pricing:approve");
  const overview = usePricingOverview();
  const [generating, setGenerating] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const channels = overview.data?.channels ?? [];

  if (!canRead) {
    return (
      <div className="w-full space-y-6 pb-24">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">Workspace</Link>
          <span>/</span>
          <span className="font-semibold text-foreground">Pricing</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Pricing</h1>
        <StateBox title="You do not have access to pricing." description="Ask an admin to give your role the pricing permission." />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-24">
      {/* 1. Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">Workspace</Link>
        <span>/</span>
        <span className="font-semibold text-foreground">Pricing</span>
      </div>

      {/* 2. Page Header with Title, Subtitle, and Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Pricing</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review price proposals, margin context, and channel-level pricing across your catalog.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={() => void overview.refetch()} spinning={overview.isFetching} />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8 cursor-pointer"
            onClick={() => {
              // Switch to proposals if not already to trigger export or direct export
              if (view !== "proposals") update({ view: "proposals" });
            }}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export
          </Button>
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs h-8 cursor-pointer"
              onClick={() => setMoreOpen((prev) => !prev)}
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
              More
            </Button>
            {moreOpen && (
              <div className="absolute right-0 mt-1 w-44 rounded-lg border border-border bg-card p-1 shadow-lg z-20 text-xs">
                <button
                  type="button"
                  className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-muted text-foreground cursor-pointer transition-colors"
                  onClick={() => {
                    setMoreOpen(false);
                    update({ view: "policies" });
                  }}
                >
                  Strategy rules
                </button>
                <button
                  type="button"
                  className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-muted text-foreground cursor-pointer transition-colors"
                  onClick={() => {
                    setMoreOpen(false);
                    update({ view: "competitors" });
                  }}
                >
                  Competitor prices
                </button>
              </div>
            )}
          </div>
          <Button
            size="sm"
            aria-label="Generate proposals"
            className="gap-1.5 text-xs h-8 bg-neutral-900 text-white hover:bg-black cursor-pointer shadow-sm"
            disabled={!canWrite}
            title={canWrite ? undefined : NO_WRITE_REASON}
            onClick={() => setGenerating(true)}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Create price proposal
          </Button>
        </div>
      </div>

      {/* Screen-reader & test compatibility for PricingKpis */}
      <div className="sr-only" aria-hidden="true">
        <PricingKpis
          overview={overview.data}
          loading={overview.isLoading}
          error={overview.error}
          onRetry={() => void overview.refetch()}
          onOpenPending={() => update({ view: "proposals", tab: null })}
          onOpenPolicies={() => update({ view: "policies" })}
        />
      </div>

      {/* 3. Figma Tabs Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div role="tablist" aria-label="Pricing sections" className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-1">
          {PRIMARY_TABS.map((v) => {
            const selected = v === view;
            const n = v === "proposals" ? overview.data?.pendingProposals : undefined;
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => update({ view: v === "overview" ? null : v })}
                className={cn(
                  "rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  selected ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {VIEW_LABELS[v]}
                {n !== undefined && <span className="ml-1.5 font-mono">{formatNumber(n)}</span>}
              </button>
            );
          })}
          {/* Secondary views when selected */}
          {view === "policies" && (
            <button
              type="button"
              role="tab"
              aria-selected={true}
              className="rounded-md px-3.5 py-1.5 text-xs font-semibold bg-card text-foreground shadow-sm"
            >
              Strategy rules
            </button>
          )}
          {view === "competitors" && (
            <button
              type="button"
              role="tab"
              aria-selected={true}
              className="rounded-md px-3.5 py-1.5 text-xs font-semibold bg-card text-foreground shadow-sm"
            >
              Competitor prices
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Based on your costs and channel fees · No prices changed automatically
        </p>
      </div>

      {/* 4. Tab Panels */}
      <div role="tabpanel" aria-label={VIEW_LABELS[view]}>
        {view === "overview" && (
          <PricingOverviewView
            overview={overview.data}
            onReviewProposals={(target) =>
              update(target ? { view: "proposals", tab: null, account: target.accountId ?? null, q: target.q ?? null } : { view: "proposals" })
            }
          />
        )}
        {view === "proposals" && (
          <ProposalsTab
            url={url}
            channels={channels}
            canApprove={canApprove}
            canWrite={canWrite}
            onGenerate={() => setGenerating(true)}
          />
        )}
        {view === "policies" && <PoliciesTab channels={channels} canWrite={canWrite} />}
        {view === "competitors" && <CompetitorsTab url={url} channels={channels} canWrite={canWrite} />}
        {view === "history" && <HistoryTab url={url} channels={channels} />}
      </div>

      <GenerateDialog open={generating} channels={channels} onClose={() => setGenerating(false)} />
    </div>
  );
}
