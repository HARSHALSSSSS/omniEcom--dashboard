import { useState } from "react";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { CompetitorsTab } from "@/components/pricing/competitors/CompetitorsTab";
import { HistoryTab } from "@/components/pricing/history/HistoryTab";
import { PoliciesTab } from "@/components/pricing/policies/PoliciesTab";
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
  proposals: "Price proposals",
  policies: "Strategy rules",
  competitors: "Competitor prices",
  history: "Audit log",
};
const VIEWS: readonly PricingView[] = ["proposals", "policies", "competitors", "history"];

export default function PricingPage() {
  const url = usePricingUrlState();
  const { view, update } = url;
  const canRead = useCan("pricing:read");
  const canWrite = useCan("pricing:write");
  const canApprove = useCan("pricing:approve");
  const overview = usePricingOverview();
  const [generating, setGenerating] = useState(false);

  const channels = overview.data?.channels ?? [];
  const count = (v: PricingView): number | undefined => {
    const o = overview.data;
    if (!o) return undefined;
    if (v === "proposals") return o.pendingProposals;
    if (v === "policies") return o.activePolicies + o.pausedPolicies;
    return undefined;
  };

  if (!canRead) {
    return (
      <div className="w-full space-y-6 pb-24">
        <PageHeader eyebrow="COMMERCE PRICING" title="Pricing Control Center" />
        <StateBox title="You do not have access to pricing." description="Ask an admin to give your role the pricing permission." />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader
        eyebrow="COMMERCE PRICING"
        title="Pricing Control Center"
        description="Review price proposals across your sales channels, set the policies that create them and keep an audit trail of every price change."
        actions={
          <Button size="sm" className="gap-2" disabled={!canWrite} title={canWrite ? undefined : NO_WRITE_REASON} onClick={() => setGenerating(true)}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Generate proposals
          </Button>
        }
      />

      <PricingKpis
        overview={overview.data}
        loading={overview.isLoading}
        error={overview.error}
        onRetry={() => void overview.refetch()}
        onOpenPending={() => update({ view: null, tab: null })}
        onOpenPolicies={() => update({ view: "policies" })}
      />

      <div role="tablist" aria-label="Pricing sections" className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/60 p-1">
        {VIEWS.map((v) => {
          const selected = v === view;
          const n = count(v);
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => update({ view: v === "proposals" ? null : v })}
              className={cn("rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors", selected ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {VIEW_LABELS[v]}
              {n !== undefined && <span className="ml-1.5 font-mono">{formatNumber(n)}</span>}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={VIEW_LABELS[view]}>
        {view === "proposals" && <ProposalsTab url={url} channels={channels} canApprove={canApprove} canWrite={canWrite} onGenerate={() => setGenerating(true)} />}
        {view === "policies" && <PoliciesTab channels={channels} canWrite={canWrite} />}
        {view === "competitors" && <CompetitorsTab url={url} channels={channels} canWrite={canWrite} />}
        {view === "history" && <HistoryTab url={url} channels={channels} />}
      </div>

      <GenerateDialog open={generating} channels={channels} onClose={() => setGenerating(false)} />
    </div>
  );
}
