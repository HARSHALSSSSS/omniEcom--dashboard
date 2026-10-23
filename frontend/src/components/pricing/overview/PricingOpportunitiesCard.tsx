import { useState, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { PricingPagination } from "@/components/pricing/PricingPagination";
import type { PriceProposal } from "@/types/pricing";

export interface PricingOpportunityItem {
  id: string;
  productTitle: string;
  sku: string;
  channel: string;
  currentPrice: number;
  proposedPrice: number;
  currentMarginPct: number;
  proposedMarginPct: number;
  reason: string;
}

interface PricingOpportunitiesCardProps {
  items?: PricingOpportunityItem[];
  realProposals?: PriceProposal[];
  onReviewProposal: (id: string) => void;
}

const DEFAULT_OPPORTUNITIES: PricingOpportunityItem[] = [
  {
    id: "p1",
    productTitle: "Cotton Oversized T-Shirt",
    sku: "NL-CT-001",
    channel: "Amazon",
    currentPrice: 649,
    proposedPrice: 699,
    currentMarginPct: 29.9,
    proposedMarginPct: 34.9,
    reason: "Below margin target",
  },
  {
    id: "p2",
    productTitle: "Home Storage Set",
    sku: "NL-HS-024",
    channel: "Amazon",
    currentPrice: 899,
    proposedPrice: 949,
    currentMarginPct: 28.3,
    proposedMarginPct: 32.0,
    reason: "Below margin target",
  },
  {
    id: "p3",
    productTitle: "Canvas Shoes",
    sku: "NL-CS-012",
    channel: "Flipkart",
    currentPrice: 1599,
    proposedPrice: 1649,
    currentMarginPct: 33.7,
    proposedMarginPct: 35.7,
    reason: "Build promotion headroom",
  },
];

export function PricingOpportunitiesCard({
  items,
  realProposals,
  onReviewProposal,
}: PricingOpportunitiesCardProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(3);

  // If real proposals exist in the backend, map them; otherwise use illustrative Figma defaults
  const allOpportunities: PricingOpportunityItem[] = useMemo(() => {
    if (realProposals && realProposals.length > 0) {
      return realProposals.map((p) => {
        const cur = p.currentPriceMinor / 100;
        const prop = p.proposedPriceMinor / 100;
        const deltaPct = (p.estMarginDeltaBps ?? 0) / 100;
        const curMargin = 30.0; // baseline estimation if cost missing
        return {
          id: p.id,
          productTitle: p.productTitle,
          sku: p.sku,
          channel: p.channelName || p.marketplace,
          currentPrice: cur,
          proposedPrice: prop,
          currentMarginPct: curMargin,
          proposedMarginPct: curMargin + deltaPct,
          reason:
            (typeof p.reasoning === "string"
              ? p.reasoning
              : ((p.reasoning as unknown) as { summary?: string } | undefined)?.summary) ||
            (p.strategy === "margin_floor" ? "Below margin target" : "Market alignment"),
        };
      });
    }
    return items ?? DEFAULT_OPPORTUNITIES;
  }, [realProposals, items]);

  const total = allOpportunities.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const paginatedOpportunities = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return allOpportunities.slice(start, start + pageSize);
  }, [allOpportunities, safePage, pageSize]);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
        <div>
          <h3 className="text-base font-bold text-foreground">Pricing opportunities</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total} {total === 1 ? "proposal" : "proposals"} · None applied
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-neutral-200 text-muted-foreground font-medium">
              <th className="pb-2 font-medium">Product / Channel</th>
              <th className="pb-2 font-medium">Current → Proposed</th>
              <th className="pb-2 font-medium">Est. margin / Reason</th>
              <th className="pb-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {paginatedOpportunities.map((item) => (
              <tr key={item.id} className="hover:bg-neutral-50/70 transition-colors">
                <td className="py-3">
                  <p className="font-semibold text-foreground">{item.productTitle}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {item.sku} · {item.channel}
                  </p>
                </td>
                <td className="py-3">
                  <p className="font-semibold text-foreground">
                    ₹{item.currentPrice.toLocaleString()} → ₹{item.proposedPrice.toLocaleString()}
                  </p>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 mt-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Proposed
                  </span>
                </td>
                <td className="py-3">
                  <p className="font-semibold text-foreground">
                    {item.currentMarginPct.toFixed(1)}% → {item.proposedMarginPct.toFixed(1)}%
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{item.reason}</p>
                </td>
                <td className="py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onReviewProposal(item.id)}
                    className="inline-flex items-center gap-1 font-semibold text-foreground hover:underline cursor-pointer text-xs"
                  >
                    <span>Review</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="pt-2 border-t border-neutral-100">
          <PricingPagination
            page={safePage}
            pages={pages}
            total={total}
            pageSize={pageSize}
            shown={paginatedOpportunities.length}
            noun="proposals"
            onPage={setPage}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            pageSizes={[3, 5, 10]}
          />
        </div>
      )}

      {/* Footnote */}
      <p className="text-[11px] text-muted-foreground pt-1">
        Estimates use unchanged example costs and fees. Review each proposal before applying.
      </p>
    </div>
  );
}
