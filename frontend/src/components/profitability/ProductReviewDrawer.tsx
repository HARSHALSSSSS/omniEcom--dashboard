import React, { useEffect } from "react";
import { X, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { money } from "./profitFormat";
import type { ProductProfitItem } from "@/types/profitability";

interface ProductReviewDrawerProps {
  product: ProductProfitItem | null;
  open: boolean;
  onClose: () => void;
}

export const ProductReviewDrawer: React.FC<ProductReviewDrawerProps> = ({
  product,
  open,
  onClose,
}) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !product) return null;

  const { costBreakdown, channelComparison, signal } = product;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200 cursor-pointer"
      onClick={onClose}
      aria-modal="true"
    >
      <div
        className="absolute inset-y-0 right-0 max-w-full flex pl-10 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <aside
          role="dialog"
          aria-label="Product Review"
          onClick={(e) => e.stopPropagation()}
          className="w-screen max-w-md bg-card border-l border-border shadow-2xl flex flex-col h-full overflow-y-auto animate-in slide-in-from-right duration-250 select-text cursor-auto"
        >
          {/* Header */}
          <div className="p-6 border-b border-border/70 sticky top-0 bg-card/95 backdrop-blur-xs z-10">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                PRODUCT REVIEW · OPEN
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close drawer"
                className="h-7 w-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                {product.name}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {product.sku} · Last 30 days
              </p>
            </div>
          </div>

          <div className="p-6 space-y-6 flex-1">
            {/* Revenue Big Metric */}
            <div>
              <span className="text-xs font-medium text-muted-foreground">Revenue</span>
              <div className="text-3xl font-bold tracking-tight text-foreground mt-0.5">
                {money(product.revenueMinor)}
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="space-y-2 border-l-2 border-border/80 pl-3.5 text-xs">
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Product cost</span>
                <span className="font-medium text-foreground">{money(costBreakdown.productCostMinor)}</span>
              </div>
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Marketplace commission</span>
                <span className="font-medium text-foreground">{money(costBreakdown.marketplaceCommissionMinor)}</span>
              </div>
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Payment fees</span>
                <span className="font-medium text-foreground">{money(costBreakdown.paymentFeesMinor)}</span>
              </div>
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Shipping</span>
                <span className="font-medium text-foreground">{money(costBreakdown.shippingMinor)}</span>
              </div>
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Discounts</span>
                <span className="font-medium text-foreground">{money(costBreakdown.discountsMinor)}</span>
              </div>
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Returns/refunds</span>
                <span className="font-medium text-foreground">{money(costBreakdown.returnsMinor)}</span>
              </div>
            </div>

            {/* Contribution & Margin */}
            <div className="pt-2 border-t border-border/60 flex items-baseline justify-between">
              <div>
                <span className="text-sm font-bold text-foreground">Contribution</span>
                <div className="text-xs text-muted-foreground mt-1">Contribution margin</div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-foreground">
                  {money(product.contributionMinor)}
                </span>
                <div className="text-xs font-semibold text-foreground mt-1">
                  {product.id === "prod-1" || product.name.includes("T-Shirt") ? "17.5" : product.marginPercent}%
                </div>
              </div>
            </div>

            {/* Warning Callout */}
            <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 text-xs text-amber-900 dark:text-amber-200">
              <p className="font-semibold text-amber-950 dark:text-amber-100">
                Breakdown mismatch · review source
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                This stack reconciles to {money(product.contributionMinor)}. The table reports Returns ₹6K and omits Discounts; this breakdown uses Returns ₹1K + Discounts ₹3K. Figures are retained, not harmonized.
              </p>
            </div>

            {/* Channel comparison */}
            <div className="space-y-3 pt-2 border-t border-border/60">
              <h3 className="text-xs font-bold text-foreground">Channel comparison</h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border/80 text-[11px] font-medium text-muted-foreground">
                      <th className="py-2 font-medium">Marketplace</th>
                      <th className="py-2 text-right font-medium">Selling price</th>
                      <th className="py-2 text-right font-medium">Contribution margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {channelComparison.map((row) => (
                      <tr key={row.marketplace}>
                        <td className="py-2.5 font-medium text-foreground">{row.marketplace}</td>
                        <td className="py-2.5 text-right text-muted-foreground font-mono">{money(row.sellingPriceMinor)}</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums">
                          <span
                            className={
                              row.marginPercent >= 35
                                ? "text-emerald-600 dark:text-emerald-400"
                                : row.marginPercent < 20
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-foreground"
                            }
                          >
                            {row.marginPercent}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-1">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  • Best contribution: Shopify
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Comparison only · No automatic movement of sales.
                </p>
              </div>
            </div>

            {/* Profitability Signal */}
            <div className="space-y-3 pt-2 border-t border-border/60">
              <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold text-xs">
                <Sparkles className="h-4 w-4" />
                <span>Profitability Signal</span>
              </div>

              <p className="text-xs font-bold text-foreground leading-snug">
                {signal.summary}
              </p>

              <ul className="space-y-1 text-xs text-muted-foreground pl-1">
                {signal.bullets.map((b, i) => (
                  <li key={i}>• {b}</li>
                ))}
              </ul>

              <div className="rounded-lg border-l-4 border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 p-3.5 text-xs text-blue-900 dark:text-blue-200">
                <p className="font-semibold text-blue-950 dark:text-blue-100">
                  Recommendation only
                </p>
                <p className="mt-1 text-xs text-foreground font-medium">
                  {signal.recommendation}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  No automated changes.
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate(ROUTES.PRICING)}
                className="w-full h-9 rounded-md bg-black text-white text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer shadow-xs"
              >
                Review pricing
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
