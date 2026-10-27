import React, { useState } from "react";
import { Search, ChevronDown, ArrowUp, AlertCircle, ArrowRight } from "lucide-react";
import { FIGMA_PRODUCTS } from "./figmaProfitData";
import { money } from "./profitFormat";
import type { ProductProfitItem } from "@/types/profitability";

interface ProductProfitabilityTableProps {
  products?: ProductProfitItem[];
  selectedProduct: ProductProfitItem | null;
  onSelectProduct: (product: ProductProfitItem) => void;
}

export const ProductProfitabilityTable: React.FC<ProductProfitabilityTableProps> = ({
  products = FIGMA_PRODUCTS,
  selectedProduct,
  onSelectProduct,
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-border/70">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Product Profitability</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              All products · All marketplaces · Any contribution
            </p>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            Last 30 days · INR
          </span>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2.5 mt-4">
          {/* Search box */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search product / SKU"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-border bg-background focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Filter dropdown buttons */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted text-foreground"
          >
            <span>Marketplace</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted text-foreground"
          >
            <span>Margin</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted text-foreground"
          >
            <span>Contribution</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted text-foreground"
          >
            <span>Category</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted text-foreground"
          >
            <span>Date range: 30d</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted text-foreground ml-auto"
          >
            <span>Saved view</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border/80 bg-muted/40 text-[11px] font-medium text-muted-foreground">
              <th className="py-2.5 px-4 font-medium">Product</th>
              <th className="py-2.5 px-3 font-medium">SKU</th>
              <th className="py-2.5 px-3 font-medium text-right">Revenue</th>
              <th className="py-2.5 px-3 font-medium text-right">Units</th>
              <th className="py-2.5 px-3 font-medium text-right">Product Cost</th>
              <th className="py-2.5 px-3 font-medium text-right">Fees</th>
              <th className="py-2.5 px-3 font-medium text-right">Shipping</th>
              <th className="py-2.5 px-3 font-medium text-right">Returns</th>
              <th className="py-2.5 px-3 font-medium text-right">Contribution</th>
              <th className="py-2.5 px-3 font-medium text-right">Margin</th>
              <th className="py-2.5 px-3 font-medium text-center">Status</th>
              <th className="py-2.5 px-4 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filtered.map((item) => {
              const isSelected = selectedProduct?.id === item.id;
              const formatShortLakh = (minor: number) => {
                const rupees = minor / 100;
                if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(1)}L`;
                if (rupees >= 1_000) return `₹${Math.round(rupees / 1_000)}K`;
                return money(minor);
              };

              return (
                <tr
                  key={item.id}
                  onClick={() => onSelectProduct(item)}
                  className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                    isSelected ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                  }`}
                >
                  <td className="py-3 px-4 font-medium text-foreground">
                    <span className="hover:underline">{item.name}</span>
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-muted-foreground">
                    {item.sku}
                  </td>
                  <td className="py-3 px-3 text-right font-medium text-foreground">
                    {formatShortLakh(item.revenueMinor)}
                  </td>
                  <td className="py-3 px-3 text-right text-muted-foreground tabular-nums">
                    {item.units}
                  </td>
                  <td className="py-3 px-3 text-right text-muted-foreground tabular-nums">
                    {formatShortLakh(item.productCostMinor)}
                  </td>
                  <td className="py-3 px-3 text-right text-muted-foreground tabular-nums">
                    {formatShortLakh(item.feesMinor)}
                  </td>
                  <td className="py-3 px-3 text-right text-muted-foreground tabular-nums">
                    {formatShortLakh(item.shippingMinor)}
                  </td>
                  <td className="py-3 px-3 text-right text-muted-foreground tabular-nums">
                    {formatShortLakh(item.returnsMinor)}
                  </td>
                  <td className="py-3 px-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                    <span className="inline-flex items-center gap-0.5">
                      {formatShortLakh(item.contributionMinor)}
                      {item.marginPercent >= 15 && <ArrowUp className="h-3 w-3 stroke-[2.5]" />}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-semibold text-foreground tabular-nums">
                    {item.marginPercent}%
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${
                        item.status === "Healthy"
                          ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                          : "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProduct(item);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:text-blue-600 transition-colors"
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

      {/* Reconciliation footnotes */}
      <div className="p-4 bg-muted/20 border-t border-border/60 space-y-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-blue-600 dark:text-blue-400">
          <span className="inline-flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            <span>Black T-Shirt: calculated ₹18K vs reported ₹21K - ₹3K difference.</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            <span>Running Shoes: calculated ₹24K vs reported ₹26K - ₹2K difference.</span>
          </span>
        </div>

        <div className="flex items-center justify-between text-muted-foreground pt-1 border-t border-border/30">
          <span>8 cap-cited products · Travel Duffel reconciles</span>
          {selectedProduct && (
            <span className="font-medium text-foreground inline-flex items-center gap-1">
              {selectedProduct.name} selected · Context review open
              <span className="text-[10px]">▲</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
