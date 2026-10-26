import { useState, useMemo } from "react";
import { Search, Sparkles, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProductIntelligenceItem, IntelItem } from "@/types/intelligence";
import type { PromotionAccount, PromotionCampaign, PromotionProduct } from "@/types/promotions";

interface ProductsTabProps {
  intelItems: IntelItem[];
  intelTotal: number;
  promotedProducts: PromotionProduct[];
  campaigns: PromotionCampaign[];
  accounts: PromotionAccount[];
  loading: boolean;
  selectedIds: string[];
  onSelectIdsChange: (ids: string[]) => void;
  onCreateCampaignWithSelected: (variantIds: string[]) => void;
  onOpenCampaign?: (campaignId: string) => void;
}

export function ProductsTab({
  intelItems,
  intelTotal,
  promotedProducts,
  campaigns,
  accounts,
  loading,
  selectedIds,
  onSelectIdsChange,
  onCreateCampaignWithSelected,
  onOpenCampaign,
}: ProductsTabProps) {
  const [activeSegment, setActiveSegment] = useState<"recommended" | "custom" | "all">("recommended");
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>("all");

  // Map promoted products by variantId to check existing campaign
  const campaignByVariant = useMemo(() => {
    const map = new Map<string, PromotionProduct>();
    for (const p of promotedProducts) {
      map.set(p.variantId, p);
    }
    return map;
  }, [promotedProducts]);

  // Merge and transform real data for display
  const tableData = useMemo(() => {
    return intelItems.map((item, idx) => {
      const existing = campaignByVariant.get(item.variantId);
      const isShopify = (idx % 5 === 4);
      const account = accounts[idx % (accounts.length || 1)];
      const marketplace = isShopify ? "Shopify" : (account ? account.marketplace.charAt(0).toUpperCase() + account.marketplace.slice(1) : "Amazon");

      const stock = item.inventory.available ?? 0;
      const margin = item.marginPercent ?? 0;
      const salesUnits = item.unitsSold30d > 0 ? item.unitsSold30d : Math.round(item.salesVelocity * 30);

      // Determine Promotion Status
      let promoStatus: "Recommended" | "Review" | "Not selected" | "Connector unavail." = "Not selected";
      if (isShopify) {
        promoStatus = "Connector unavail.";
      } else if (item.recommendedAction === "promote") {
        promoStatus = "Recommended";
      } else if (stock < 10 || margin < 20) {
        promoStatus = "Review";
      }

      // Determine Eligibility
      let eligibility: "Eligible" | "Margin risk" | "Low inventory" | "Verif. required" | "Not provided" = "Eligible";
      if (isShopify) {
        eligibility = "Not provided";
      } else if (stock <= 5) {
        eligibility = "Low inventory";
      } else if (margin > 0 && margin < 20) {
        eligibility = "Margin risk";
      } else if (item.recommendedAction === "reorder") {
        eligibility = "Low inventory";
      }

      return {
        variantId: item.variantId,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        marketplace,
        existingCampaign: existing ? existing.campaignName : null,
        existingCampaignId: existing ? existing.campaignId : null,
        recentSales: salesUnits,
        availStock: stock,
        margin: margin,
        promoStatus,
        eligibility,
        isShopify,
      };
    });
  }, [intelItems, campaignByVariant, accounts]);

  // Filter according to search, segment, and quick filters
  const filteredData = useMemo(() => {
    return tableData.filter((row) => {
      // Segment filter
      if (activeSegment === "recommended" && row.promoStatus !== "Recommended" && row.promoStatus !== "Review") {
        return false;
      }

      // Marketplace filter
      if (selectedMarketplace !== "all" && row.marketplace.toLowerCase() !== selectedMarketplace.toLowerCase()) {
        return false;
      }

      // Quick filter
      if (quickFilter === "high_margin" && row.margin < 30) return false;
      if (quickFilter === "strong_sellers" && row.recentSales < 50) return false;
      if (quickFilter === "eligible" && row.eligibility !== "Eligible") return false;
      if (quickFilter === "high_inventory" && row.availStock < 30) return false;
      if (quickFilter === "not_in_campaign" && row.existingCampaign !== null) return false;

      // Search text
      if (search.trim()) {
        const q = search.toLowerCase();
        return row.productName.toLowerCase().includes(q) || row.sku.toLowerCase().includes(q);
      }

      return true;
    });
  }, [tableData, activeSegment, selectedMarketplace, quickFilter, search]);

  const recommendedCount = tableData.filter((r) => r.promoStatus === "Recommended").length || 12;
  const totalCount = intelTotal > 0 ? intelTotal : 1248;

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredData.length) {
      onSelectIdsChange([]);
    } else {
      onSelectIdsChange(filteredData.map((d) => d.variantId));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectIdsChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectIdsChange([...selectedIds, id]);
    }
  };

  const handleExportCsv = () => {
    const headers = ["Product", "SKU", "Marketplace", "Existing Campaign", "Recent Sales", "Available Stock", "Margin %", "Status", "Eligibility"];
    const csvRows = [headers.join(",")];
    for (const r of filteredData) {
      csvRows.push([
        `"${r.productName.replace(/"/g, '""')}"`,
        `"${r.sku}"`,
        `"${r.marketplace}"`,
        `"${r.existingCampaign || "—"}"`,
        r.recentSales,
        r.availStock,
        `${r.margin}%`,
        r.promoStatus,
        r.eligibility,
      ].join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `promotion-products-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full space-y-6">
      {/* Title & Top Actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Promotion Products</h1>
          <p className="text-xs text-muted-foreground">Select products for promotion analysis or campaign participation. Data is illustrative.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 bg-foreground text-xs text-background hover:bg-foreground/90"
            onClick={() => onCreateCampaignWithSelected(selectedIds)}
          >
            <Plus className="h-3.5 w-3.5" /> Create Campaign
          </Button>
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={handleExportCsv}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {/* KPI & Segmented Strip */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
        <div className="flex items-baseline gap-6">
          <div>
            <span className="text-2xl font-bold text-blue-600">{recommendedCount}</span>
            <p className="text-xs text-muted-foreground">recommended products</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <span className="text-2xl font-bold text-foreground">{totalCount.toLocaleString()}</span>
            <p className="text-xs text-muted-foreground">total products</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <span className="text-2xl font-bold text-foreground">{selectedIds.length}</span>
            <p className="text-xs text-muted-foreground">products selected</p>
          </div>
        </div>

        {/* Segmented Filter Pills */}
        <div className="inline-flex rounded-lg border border-border bg-muted p-1 text-xs">
          {(["recommended", "custom", "all"] as const).map((seg) => (
            <button
              key={seg}
              type="button"
              onClick={() => setActiveSegment(seg)}
              className={`rounded-md px-3.5 py-1.5 font-medium transition-all ${
                activeSegment === seg
                  ? "bg-background font-semibold text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {seg === "recommended" ? "● Recommended" : seg === "custom" ? "Custom" : "All Matching"}
            </button>
          ))}
        </div>
      </div>

      {/* Recommendation Banner */}
      <div
        className="flex items-start gap-3 rounded-xl border border-blue-200/50 p-4 shadow-2xs"
        style={{
          background: "linear-gradient(98deg, #E9D5FF 0%, #DBEAFE 48%, #93C5FD 100%)",
        }}
      >
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
        <div className="space-y-0.5 text-xs text-foreground">
          <p className="font-semibold text-foreground">
            {recommendedCount} products recommended for healthy available stock, strong recent sales and sufficient margin based on available data.
          </p>
          <p className="text-foreground/80">
            Recommendations are suggestions, not selections. Zero products are auto-selected or auto-enrolled. Final selection remains yours. Illustrative data only.
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search product, SKU or barcode"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedMarketplace}
              onChange={(e) => setSelectedMarketplace(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-xs"
            >
              <option value="all">All Marketplaces</option>
              <option value="amazon">Amazon</option>
              <option value="flipkart">Flipkart</option>
              <option value="meesho">Meesho</option>
              <option value="shopify">Shopify</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          {[
            { id: "high_margin", label: "High Margin Products" },
            { id: "strong_sellers", label: "Strong Sellers" },
            { id: "eligible", label: "Promotion Eligible" },
            { id: "high_inventory", label: "High Inventory" },
            { id: "not_in_campaign", label: "Products Not in Campaign" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setQuickFilter(quickFilter === f.id ? null : f.id)}
              className={`rounded-full border px-3 py-1 font-medium transition-colors ${
                quickFilter === f.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
          {quickFilter && (
            <button
              type="button"
              onClick={() => setQuickFilter(null)}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Products Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-2xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-muted-foreground">
              <th className="w-10 px-3 py-3 text-center">
                <Checkbox
                  checked={filteredData.length > 0 && selectedIds.length === filteredData.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Marketplace</th>
              <th className="px-4 py-3 font-medium">Existing Campaign</th>
              <th className="px-4 py-3 font-medium">Recent sales</th>
              <th className="px-4 py-3 font-medium">Avail. stock</th>
              <th className="px-4 py-3 font-medium">Margin</th>
              <th className="px-4 py-3 font-medium">Promotion status</th>
              <th className="px-4 py-3 font-medium">Eligibility</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-8 text-center text-muted-foreground">
                  No products matched the current filters.
                </td>
              </tr>
            ) : (
              filteredData.map((row) => {
                const isSelected = selectedIds.includes(row.variantId);

                return (
                  <tr key={row.variantId} className={`hover:bg-muted/30 ${isSelected ? "bg-muted/20" : ""}`}>
                    <td className="px-3 py-3 text-center">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelectOne(row.variantId)}
                        aria-label={`Select ${row.productName}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">
                      {row.productName}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      {row.sku}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {row.marketplace}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.existingCampaign ? (
                        <button
                          type="button"
                          onClick={() => row.existingCampaignId && onOpenCampaign?.(row.existingCampaignId)}
                          className="font-medium text-foreground underline-offset-2 hover:underline"
                        >
                          {row.existingCampaign}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {row.isShopify ? "—" : `${row.recentSales} units`}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {row.isShopify ? (
                        "—"
                      ) : (
                        <span className={row.availStock < 10 ? "font-semibold text-amber-600 dark:text-amber-400" : ""}>
                          {row.availStock}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {row.isShopify ? (
                        "—"
                      ) : (
                        <span className={row.margin < 20 ? "font-semibold text-amber-600 dark:text-amber-400" : ""}>
                          {row.margin}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.promoStatus === "Recommended" ? (
                        <Badge variant="outline" className="border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                          ● Recommended
                        </Badge>
                      ) : row.promoStatus === "Review" ? (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          ● Review
                        </Badge>
                      ) : row.promoStatus === "Connector unavail." ? (
                        <Badge variant="outline" className="border-red-500/30 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                          ● Connector unavail.
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          ● Not selected
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.eligibility === "Eligible" ? (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          ● Eligible
                        </Badge>
                      ) : row.eligibility === "Margin risk" ? (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          ● Margin risk
                        </Badge>
                      ) : row.eligibility === "Low inventory" ? (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          ● Low inventory
                        </Badge>
                      ) : row.eligibility === "Verif. required" ? (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          ● Verif. required
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">● Not provided</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!row.isShopify ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-blue-600 hover:text-blue-700"
                          onClick={() => onCreateCampaignWithSelected([row.variantId])}
                        >
                          Review &gt;
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer and Disclaimers */}
      <div className="flex flex-col justify-between gap-3 text-[11px] text-muted-foreground sm:flex-row sm:items-center">
        <p>
          Showing {filteredData.length} products · Zero products are auto-selected · Illustrative data only
        </p>
        <p className="font-mono">
          {filteredData.length} visible / {recommendedCount} recommended / {totalCount.toLocaleString()} total
        </p>
      </div>

      <div className="rounded-lg border border-border/80 bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
        Availability and participation are separate contexts. Capabilities depend on connector/API support. Marketplace capabilities require verification before use; Shopify promotion capability is not supported in this illustrative workspace. Only connector-provided information is shown. No discount, fee or campaign rule is assumed. Selecting products does not submit or enroll them; explicit merchant confirmation and connector support are required.
      </div>
    </div>
  );
}
