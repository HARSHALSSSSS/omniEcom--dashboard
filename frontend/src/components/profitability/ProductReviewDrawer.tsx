import React from "react";
import { Link } from "react-router-dom";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { ROUTES } from "@/constants/routes";
import { DASH, coveragePercent, money, missingList, percent } from "./profitFormat";
import { STATUS_LABEL } from "./ProductProfitabilityTable";
import type { Component, ProductProfit } from "@/types/profitability";

interface ProductReviewDrawerProps {
  product: ProductProfit | null;
  open: boolean;
  rangeLabel: string;
  marginTargetBps: number | null;
  /** marketplace code to its name */
  channelName: (code: string) => string;
  onClose: () => void;
}

const Row: React.FC<{ label: string; c: Component; negative?: boolean }> = ({ label, c, negative = true }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-muted-foreground">
      {label}
      {c.amountMinor !== null && (c.basis === "estimated" || c.coverage < 1) && <span className="ml-1 text-[10px]">({c.basis === "estimated" ? "estimated" : "partly known"}, {coveragePercent(c.coverage)})</span>}
    </span>
    <span className="font-medium tabular-nums text-foreground">{c.amountMinor === null ? DASH : `${negative ? "-" : ""}${money(Math.abs(c.amountMinor))}`}</span>
  </div>
);

/** one product of the range: what it earned, what is known about each cost and how each marketplace did; no advice, only figures */
export const ProductReviewDrawer: React.FC<ProductReviewDrawerProps> = ({ product, open, rangeLabel, marginTargetBps, channelName, onClose }) => {
  if (!product) return null;
  const status = product.marginStatus ?? "unknown";

  return (
    <ContextDrawer open={open} onClose={onClose} title={product.title ?? product.label} description={`${product.label} · ${rangeLabel}`} badge={<span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold">{STATUS_LABEL[status]}</span>}>
      <div role="group" aria-label="Product Review" className="space-y-5 text-xs">
        <div>
          <span className="text-[11px] text-muted-foreground">Revenue</span>
          <div className="text-2xl font-bold tabular-nums text-foreground">{money(product.revenue.amountMinor)}</div>
          <div className="text-[11px] text-muted-foreground">
            {product.unitsSold} units in {product.orders} {product.orders === 1 ? "order" : "orders"}
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border/70 p-3">
          <Row label="Product cost" c={product.productCost} />
          <Row label="Marketplace fees" c={product.marketplaceFees} />
          <Row label="Penalties" c={product.penalties} />
          <Row label="Shipping" c={product.shipping} />
          <Row label="Returns/refunds" c={product.refunds} />
        </div>

        <div className="flex items-end justify-between rounded-lg border border-border/70 p-3">
          <div>
            <span className="text-[11px] text-muted-foreground">Contribution</span>
            <div className="text-lg font-bold tabular-nums text-foreground">{product.contributionMinor === null ? DASH : money(product.contributionMinor)}</div>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-muted-foreground">Contribution margin</span>
            <div className="text-lg font-bold tabular-nums text-foreground">{percent(product.marginPercent)}</div>
          </div>
        </div>

        {product.contributionMinor === null ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            Not final: {missingList(product.missing)} {product.missing.length === 1 ? "is" : "are"} not fully recorded for this product. Known part so far: {money(product.knownPartMinor)}.
          </p>
        ) : marginTargetBps !== null ? (
          <p className="text-muted-foreground">Margin target {percent(marginTargetBps / 100)}: {STATUS_LABEL[status].toLowerCase()}.</p>
        ) : (
          <p className="text-muted-foreground">No margin target is set in the Pricing policies.</p>
        )}

        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">By marketplace</h3>
          {product.channels.length === 0 ? (
            <p className="text-muted-foreground">No marketplace figures.</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-[11px] text-muted-foreground">
                  <th className="py-1.5 font-medium">Marketplace</th>
                  <th className="py-1.5 text-right font-medium">Units</th>
                  <th className="py-1.5 text-right font-medium">Revenue</th>
                  <th className="py-1.5 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {product.channels.map((ch) => (
                  <tr key={ch.marketplace}>
                    <td className="py-1.5 font-medium text-foreground">{channelName(ch.marketplace)}</td>
                    <td className="py-1.5 text-right tabular-nums">{ch.units}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(ch.revenueMinor)}</td>
                    <td className="py-1.5 text-right tabular-nums">{percent(ch.marginPercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Link to={ROUTES.PRICING} className="inline-flex text-xs font-semibold text-foreground underline">
          Open Pricing
        </Link>
      </div>
    </ContextDrawer>
  );
};
