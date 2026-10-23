import { useState, useMemo } from "react";
import { ArrowRight, AlertCircle } from "lucide-react";
import { cn } from "@/utils/cn";
import { PricingPagination } from "@/components/pricing/PricingPagination";
import type { MarginContextItem } from "@/types/pricing";

interface MarginContextTableProps {
  items?: MarginContextItem[];
  onReviewCosts?: (channel: string) => void;
  onReviewProposals?: (channel: string) => void;
}

const DEFAULT_MARGIN_CONTEXT: MarginContextItem[] = [
  {
    channel: "Shopify",
    marketplace: "shopify",
    priceCount: 3,
    avgEstMarginPct: 44.6,
    belowTargetCount: 0,
    feeAssumptions: "Payment fee + example outbound shipping",
    nextActionType: "costs",
  },
  {
    channel: "Amazon",
    marketplace: "amazon",
    priceCount: 2,
    avgEstMarginPct: 29.1,
    belowTargetCount: 2,
    feeAssumptions: "Marketplace fee + example fulfillment cost",
    nextActionType: "proposals",
  },
  {
    channel: "Flipkart",
    marketplace: "flipkart",
    priceCount: 1,
    avgEstMarginPct: 33.7,
    belowTargetCount: 0,
    feeAssumptions: "Marketplace fee + example shipping cost",
    nextActionType: "costs",
  },
];

export function MarginContextTable({
  items = DEFAULT_MARGIN_CONTEXT,
  onReviewCosts,
  onReviewProposals,
}: MarginContextTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2">
        <h3 className="text-base font-bold text-foreground">Margin context</h3>
        <span className="text-xs text-muted-foreground font-medium">
          Example target ≥ 30% · All amounts in INR, excluding tax
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-neutral-200 text-muted-foreground">
              <th className="pb-2.5 font-medium">Channel</th>
              <th className="pb-2.5 font-medium">Avg. est. margin</th>
              <th className="pb-2.5 font-medium">Below target</th>
              <th className="pb-2.5 font-medium">Fee assumptions</th>
              <th className="pb-2.5 font-medium text-right">Next action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {paginatedItems.map((row) => {
              const isBelowTarget = row.avgEstMarginPct < 30;
              return (
                <tr key={row.channel} className="hover:bg-neutral-50/70 transition-colors">
                  <td className="py-3">
                    <p className="font-semibold text-foreground">{row.channel}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {row.priceCount} {row.priceCount === 1 ? "price" : "prices"}
                    </p>
                  </td>
                  <td className="py-3 font-semibold">
                    <span className={cn(isBelowTarget ? "text-amber-600 font-bold" : "text-foreground")}>
                      {row.avgEstMarginPct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3">
                    <span className={cn(row.belowTargetCount > 0 ? "font-semibold text-amber-700" : "text-muted-foreground")}>
                      {row.belowTargetCount} {row.belowTargetCount === 1 ? "price" : "prices"}
                    </span>
                  </td>
                  <td className="py-3 text-muted-foreground max-w-xs">
                    {row.feeAssumptions}
                  </td>
                  <td className="py-3 text-right">
                    {row.nextActionType === "proposals" ? (
                      <button
                        type="button"
                        onClick={() => onReviewProposals?.(row.channel)}
                        className="inline-flex items-center gap-1 font-semibold text-foreground hover:underline cursor-pointer text-xs"
                      >
                        <span>Review proposals</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onReviewCosts?.(row.channel)}
                        className="inline-flex items-center gap-1 font-semibold text-foreground hover:underline cursor-pointer text-xs"
                      >
                        <span>Review costs</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
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
            shown={paginatedItems.length}
            noun="channels"
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
      <p className="text-[11px] text-muted-foreground pt-1 border-t border-neutral-100">
        Est. contribution margin = (price - unit cost - fees & shipping) / price. Excludes tax, discounts, returns and overhead; channel averages are unweighted.
      </p>

      {/* Advisory Alert Callout */}
      <div className="flex items-start gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0 text-neutral-500 mt-0.5" />
        <p className="text-[11.5px] leading-relaxed">
          All prices, costs and recommendations are illustrative, not synced or verified. Confirm channel fees and unit costs before approval. No live changes applied.
        </p>
      </div>
    </div>
  );
}
