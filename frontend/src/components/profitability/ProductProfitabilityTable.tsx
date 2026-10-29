import React, { useEffect, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DASH, money, percent } from "./profitFormat";
import type { ProductProfit, ProductProfitPage, ProductSort, StatusFilter } from "@/types/profitability";

export const STATUS_LABEL: Record<string, string> = { healthy: "Healthy", below_target: "Below target", low: "Low contribution", unknown: "Cost missing" };
const STATUS_CLASS: Record<string, string> = {
  healthy: "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  below_target: "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
  unknown: "border-border bg-muted text-muted-foreground",
};
const SORT_LABEL: Record<ProductSort, string> = { revenue: "Sort: revenue", contribution: "Sort: contribution", margin: "Sort: margin", units: "Sort: units sold" };

const FIELD = "h-9 sm:h-8 w-full sm:w-auto rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground";

interface ProductProfitabilityTableProps {
  page: ProductProfitPage | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  rangeLabel: string;
  marketplaces: Array<{ code: string; label: string }>;
  query: { q?: string; marketplace?: string; status?: StatusFilter; sort: ProductSort };
  filtered: boolean;
  selectedKey: string | null;
  onSelect: (p: ProductProfit) => void;
  onQuery: (patch: { pq?: string | null; mk?: string | null; ms?: string | null; ps?: string | null }) => void;
  onPage: (page: number) => void;
  onClear: () => void;
}

/** the products of the range with real figures; a figure nobody knows yet is a dash, and a product without a cost price says so */
export const ProductProfitabilityTable: React.FC<ProductProfitabilityTableProps> = ({ page, loading, error, onRetry, rangeLabel, marketplaces, query, filtered, selectedKey, onSelect, onQuery, onPage, onClear }) => {
  const [text, setText] = useState(query.q ?? "");
  useEffect(() => setText(query.q ?? ""), [query.q]);
  useEffect(() => {
    if (text.trim() === (query.q ?? "")) return;
    const t = setTimeout(() => onQuery({ pq: text.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = page?.groups ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="border-b border-border/70 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Product Profitability</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{filtered ? "Filtered products" : "All products"} · {query.marketplace ? (marketplaces.find((m) => m.code === query.marketplace)?.label ?? query.marketplace) : "all marketplaces"}</p>
          </div>
          <span className="text-xs font-medium text-muted-foreground shrink-0">{rangeLabel}</span>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5">
          <div className="relative w-full sm:min-w-[200px] sm:max-w-xs sm:flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input type="text" aria-label="Search product or SKU" placeholder="Search product / SKU" value={text} onChange={(e) => setText(e.target.value)} className="h-9 sm:h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs focus:outline-hidden focus:ring-1 focus:ring-ring" />
          </div>

          <select aria-label="Marketplace" className={FIELD} value={query.marketplace ?? ""} onChange={(e) => onQuery({ mk: e.target.value || null })}>
            <option value="">All marketplaces</option>
            {marketplaces.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>

          <select aria-label="Margin" className={FIELD} value={query.status ?? ""} onChange={(e) => onQuery({ ms: e.target.value || null })}>
            <option value="">Any margin</option>
            {Object.entries(STATUS_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>

          <select aria-label="Contribution sort" className={FIELD} value={query.sort} onChange={(e) => onQuery({ ps: e.target.value === "revenue" ? null : e.target.value })}>
            {Object.entries(SORT_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>

          {filtered && (
            <button type="button" onClick={onClear} className="h-9 sm:h-8 rounded-md px-2.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline text-left sm:text-center">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && !page ? (
        <div role="alert" className="flex items-center justify-between p-6 text-xs">
          <span className="text-rose-700">{error}</span>
          <Button size="sm" variant="outline" className="text-xs" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : loading && !page ? (
        <p role="status" className="p-6 text-xs text-muted-foreground">
          Loading products...
        </p>
      ) : rows.length === 0 ? (
        <div className="space-y-1 p-10 text-center">
          <p className="text-sm font-semibold text-foreground">{filtered ? "No product matches these filters" : "No products sold in this period"}</p>
          <p className="text-xs text-muted-foreground">{filtered ? "Try another search, marketplace or margin." : "Products appear here once they have orders in the dates you picked."}</p>
        </div>
      ) : (
        <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead>
              <tr className="border-b border-border/80 bg-muted/40 text-[11px] font-medium text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-3 py-2.5 font-medium">SKU</th>
                <th className="px-3 py-2.5 text-right font-medium">Revenue</th>
                <th className="px-3 py-2.5 text-right font-medium">Units</th>
                <th className="px-3 py-2.5 text-right font-medium">Product Cost</th>
                <th className="px-3 py-2.5 text-right font-medium">Fees</th>
                <th className="px-3 py-2.5 text-right font-medium">Shipping</th>
                <th className="px-3 py-2.5 text-right font-medium">Returns</th>
                <th className="px-3 py-2.5 text-right font-medium">Contribution</th>
                <th className="px-3 py-2.5 text-right font-medium">Margin</th>
                <th className="px-3 py-2.5 text-center font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((p) => {
                const status = p.marginStatus ?? "unknown";
                const cost = (c: { amountMinor: number | null }) => (c.amountMinor === null ? DASH : money(c.amountMinor));
                return (
                  <tr key={p.key} onClick={() => onSelect(p)} className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedKey === p.key ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      <span className="hover:underline">{p.title ?? p.label}</span>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{p.label}</td>
                    <td className="px-3 py-3 text-right font-medium text-foreground">{money(p.revenue.amountMinor)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{p.unitsSold}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground" title={p.missing.includes("productCost") ? "Some units have no cost price" : undefined}>
                      {cost(p.productCost)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{cost(p.marketplaceFees)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{cost(p.shipping)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{cost(p.refunds)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-blue-600 dark:text-blue-400">{p.contributionMinor === null ? DASH : money(p.contributionMinor)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-foreground">{percent(p.marginPercent)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(p);
                        }}
                        aria-label={`View ${p.title ?? p.label}`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground transition-colors hover:text-blue-600"
                      >
                        <span>View</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-border/60 bg-muted/20 p-4 text-[11px] text-muted-foreground">
        <span>
          {page ? `${rows.length} of ${page.groupsTotal} products` : ""}
          {page && page.statusCounts.unknown > 0 ? ` · ${page.statusCounts.unknown} without a complete cost picture show dashes` : ""}
          {page?.truncated ? " · more orders than the analysis limit: narrow the dates" : ""}
        </span>
        {page && page.pages > 1 && (
          <span className="inline-flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
            <Button size="sm" variant="outline" className="h-8 sm:h-7 text-xs" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}>
              Previous
            </Button>
            <span>
              Page {page.page} of {page.pages}
            </span>
            <Button size="sm" variant="outline" className="h-8 sm:h-7 text-xs" disabled={page.page >= page.pages} onClick={() => onPage(page.page + 1)}>
              Next
            </Button>
          </span>
        )}
      </div>
    </div>
  );
};
