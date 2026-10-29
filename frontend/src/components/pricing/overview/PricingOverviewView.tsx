import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage } from "@/api/errors";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError, StateBox } from "@/components/pricing/PricingStates";
import { ROUTES } from "@/constants/routes";
import { pricingApi } from "@/api/pricing.api";
import { useCan } from "@/hooks/useCan";
import { useMarginOverview, useProposals } from "@/hooks/usePricing";
import type { PriceProposal, PriceTableQuery, PriceTableRow, PricingOverview, ChannelMargin } from "@/types/pricing";
import { PricingPulseKpiBar } from "./PricingPulseKpiBar";
import { PricingOpportunitiesCard } from "./PricingOpportunitiesCard";
import { PricingIntelligenceCard } from "./PricingIntelligenceCard";
import { ProductChannelPricingTable } from "./ProductChannelPricingTable";
import { MarginContextTable } from "./MarginContextTable";
import { ChannelFeesDialog } from "./ChannelFeesDialog";

/** where the proposals tab should open: narrowed to a channel and/or a product (SKU search) */
export interface ReviewTarget {
  accountId?: string;
  q?: string;
}

interface PricingOverviewViewProps {
  overview?: PricingOverview | null;
  onReviewProposals: (target?: ReviewTarget) => void;
  /** the price table's current filters, for Export */
  onTableQueryChange?: (query: Omit<PriceTableQuery, "page" | "pageSize">) => void;
}

/** the pending proposals shown as opportunities: the biggest margin impact first */
const OPPORTUNITIES = { tab: "pending_review", sort: "impact", page: 1, pageSize: 25 } as const;

export function PricingOverviewView({ overview, onReviewProposals, onTableQueryChange }: PricingOverviewViewProps) {
  const navigate = useNavigate();
  const canWrite = useCan("pricing:write");
  const [feesFor, setFeesFor] = useState<string | null>(null);
  const reviewCostsBusy = useRef(false);
  const margins = useMarginOverview();
  const pending = useProposals(OPPORTUNITIES);

  if (margins.isLoading) {
    return (
      <div role="status" aria-label="Loading pricing overview" className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (margins.isError || !margins.data) {
    return <LoadError what="The pricing overview" message={errorMessage(margins.error)} onRetry={() => void margins.refetch()} />;
  }

  const { channels, totals } = margins.data;

  if (channels.length === 0) {
    return (
      <StateBox title="No sales channels connected yet." description="Connect a marketplace or store to see your channel prices, margins and pricing opportunities.">
        <Link to={ROUTES.MARKETPLACE_HUB} className="inline-flex h-8 items-center rounded-md bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-black">
          Open Marketplace hub
        </Link>
      </StateBox>
    );
  }

  const reviewProposal = (p: PriceProposal) => onReviewProposals({ accountId: p.accountId, q: p.sku });
  const reviewPrice = (item: PriceTableRow) => {
    if (item.proposalState === "proposed") onReviewProposals({ accountId: item.accountId, q: item.sku });
  };
  // unit costs are edited on a product's variants: open the first product of this channel that has no cost price
  const reviewCosts = async (row: ChannelMargin) => {
    if (reviewCostsBusy.current) return;
    reviewCostsBusy.current = true;
    try {
      const page = await pricingApi.priceTable({ accountId: row.accountId, state: "unknown_cost", sort: "product", page: 1, pageSize: 1 });
      const first = page.items[0];
      navigate(first ? `${ROUTES.PRODUCTS}/${first.productId}/variants` : ROUTES.PRODUCTS);
    } catch {
      navigate(ROUTES.PRODUCTS);
    } finally {
      reviewCostsBusy.current = false;
    }
  };
  const editFees = (row: ChannelMargin) => setFeesFor(row.accountId);

  return (
    <div className="space-y-6">
      {/* 1. Pricing pulse KPI bar */}
      <PricingPulseKpiBar
        productsInView={totals.productsInView}
        productChannelPrices={totals.productChannelPrices}
        avgMarginBps={totals.avgMarginBps}
        belowTargetCount={totals.belowTargetCount}
        unknownCostCount={totals.unknownCostCount}
        targetMarginBps={totals.targetMarginBps}
        pricingOpportunitiesCount={overview?.opportunitiesCount}
        updatesAppliedCount={overview?.appliedLast30Days}
      />

      {/* 2. Opportunities & Intelligence (2-column layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8">
          <PricingOpportunitiesCard
            proposals={pending.data?.items}
            loading={pending.isLoading}
            error={pending.isError ? errorMessage(pending.error) : null}
            onRetry={() => void pending.refetch()}
            onReviewProposal={reviewProposal}
          />
        </div>
        <div className="lg:col-span-4">
          <PricingIntelligenceCard
            belowTargetCount={totals.belowTargetCount}
            unknownCostCount={totals.unknownCostCount}
            targetMarginBps={totals.targetMarginBps}
            productChannelPrices={totals.productChannelPrices}
            onReviewProposals={() => onReviewProposals()}
          />
        </div>
      </div>

      {/* 3. Product & channel pricing table (server paged, searched and sorted) */}
      <ProductChannelPricingTable channels={channels} totals={totals} onSelectPriceItem={reviewPrice} onQueryChange={onTableQueryChange} />

      {/* 4. Margin context */}
      <MarginContextTable
        items={channels}
        targetMarginBps={totals.targetMarginBps}
        onReviewProposals={(row) => onReviewProposals({ accountId: row.accountId })}
        onReviewCosts={(row) => void reviewCosts(row)}
        onReviewFees={editFees}
        onEditFees={editFees}
      />
      <ChannelFeesDialog channel={channels.find((c) => c.accountId === feesFor) ?? null} canWrite={canWrite} onClose={() => setFeesFor(null)} />
    </div>
  );
}
