import { useState, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PricingPagination } from "@/components/pricing/PricingPagination";
import { formatINR } from "@/utils/format";
import type { PriceProposal } from "@/types/pricing";
import { marginText } from "./marginText";

interface PricingOpportunitiesCardProps {
  /** the real pending proposals, biggest margin impact first */
  proposals?: PriceProposal[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onReviewProposal: (proposal: PriceProposal) => void;
}

export function PricingOpportunitiesCard({ proposals, loading, error, onRetry, onReviewProposal }: PricingOpportunitiesCardProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(3);

  const all = useMemo(() => proposals ?? [], [proposals]);
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const visible = useMemo(() => all.slice((safePage - 1) * pageSize, safePage * pageSize), [all, safePage, pageSize]);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
        <div>
          <h3 className="text-base font-bold text-foreground">Pricing opportunities</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loading ? "Loading proposals" : `${total} ${total === 1 ? "proposal" : "proposals"} awaiting review · None applied`}
          </p>
        </div>
      </div>

      {loading && (
        <div role="status" aria-label="Loading pricing opportunities" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center text-xs text-muted-foreground">
          <p>Pricing opportunities could not be loaded. {error}</p>
          {onRetry && (
            <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      )}

      {!loading && !error && total === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No price proposals are waiting for review. Create price proposals from your strategy rules to see opportunities here.
        </p>
      )}

      {/* Table */}
      {!loading && !error && total > 0 && (
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
              {visible.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50/70 transition-colors">
                  <td className="py-3">
                    <p className="font-semibold text-foreground">{p.productTitle}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {p.sku} · {p.channelName || p.marketplace}
                    </p>
                  </td>
                  <td className="py-3">
                    <p className="font-semibold text-foreground">
                      {formatINR(p.currentPriceMinor)} → {formatINR(p.proposedPriceMinor)}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 mt-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Proposed
                    </span>
                  </td>
                  <td className="py-3">
                    <p className="font-semibold text-foreground">
                      {marginText(p.currentMarginBps)} → {marginText(p.proposedMarginBps)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{p.reasonText}</p>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onReviewProposal(p)}
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
      )}

      {/* Pagination */}
      {!loading && !error && total > 0 && (
        <div className="pt-2 border-t border-neutral-100">
          <PricingPagination
            page={safePage}
            pages={pages}
            total={total}
            pageSize={pageSize}
            shown={visible.length}
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
        Margins are based on your costs and channel fees; a dash means the cost price is not set. Review each proposal before applying.
      </p>
    </div>
  );
}
