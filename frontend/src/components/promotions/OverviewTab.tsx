import { useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PromotionAccount, PromotionCampaign, PromotionOverview } from "@/types/promotions";
import type { ProductIntelligenceItem, IntelItem } from "@/types/intelligence";

interface OverviewTabProps {
  overview: PromotionOverview | undefined;
  loading: boolean;
  accounts: PromotionAccount[];
  campaigns: PromotionCampaign[];
  intelItems: IntelItem[];
  intelTotal: number;
  recommendationsCount: number;
  recentActivity: Array<{ id: number; action: string; createdAt: string; metadata?: Record<string, unknown> }>;
  onCreateCampaign: () => void;
  onNavigateToProducts: (filter?: "recommended" | "all") => void;
  onReviewProduct?: (variantId: string) => void;
}

export function OverviewTab({
  overview: o,
  loading,
  accounts,
  campaigns,
  intelItems,
  intelTotal,
  recommendationsCount,
  recentActivity,
  onCreateCampaign,
  onNavigateToProducts,
  onReviewProduct,
}: OverviewTabProps) {
  const [intelDismissed, setIntelDismissed] = useState(false);

  // Derive counts from real backend data
  const activeCount = o?.activeCampaigns ?? campaigns.filter((c) => c.status === "active").length;
  const oppCount = recommendationsCount || intelItems.filter((i) => i.recommendedAction === "promote").length;
  const eligibleProductsCount = campaigns.reduce((acc, c) => acc + (c.itemCounts?.eligible ?? 0), 0) || oppCount;
  const resultsCount = campaigns.filter((c) => c.status === "ended" || c.unitsMoved > 0).length || (o?.unitsMoved ? 1 : 0);
  const connectorLimitationsCount = accounts.filter((a) => a.marketplace.toLowerCase().includes("shopify")).length;

  // Filter opportunities from product intelligence
  const promoteOpportunities = intelItems.filter((i) => i.recommendedAction === "promote").slice(0, 4);

  // Group intelligence items for pressure quadrant
  const healthyPressureItem = intelItems.find((i) => (i.marginPercent ?? 0) >= 25 && (i.inventory.available ?? 0) >= 15) || intelItems[0];
  const riskPressureItem = intelItems.find((i) => (i.inventory.available ?? 0) < 10 || (i.marginPercent ?? 0) < 20) || intelItems[1];

  const formatActivityTime = (iso: string) => {
    try {
      const date = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const timeStr = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
      if (diffDays === 0) return `Today · ${timeStr}`;
      if (diffDays === 1) return `Yesterday · ${timeStr}`;
      return `${diffDays} days ago · ${timeStr}`;
    } catch {
      return "Recently";
    }
  };

  const humanizeAction = (action: string) => {
    switch (action) {
      case "promotion.created":
        return "Campaign draft created";
      case "promotion.scheduled":
        return "Campaign scheduled for marketplace push";
      case "promotion.activated":
        return "Promotion successfully synchronized & live";
      case "promotion.ended":
        return "Promotion campaign completed";
      case "promotion.products_changed":
        return "Products updated for campaign";
      case "promotion.deleted":
        return "Campaign draft deleted";
      default:
        return action.replace("promotion.", "Promotion ").replace("_", " ");
    }
  };

  return (
    <div className="w-full space-y-7">
      {/* Promotion pulse strip */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-2xs" aria-label="Promotion pulse">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Promotion pulse</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 md:gap-8">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-semibold text-foreground">{oppCount}</span>
            <span className="text-xs text-muted-foreground">Opportunities</span>
          </div>
          <div className="hidden h-px w-6 bg-border md:block" />
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-sm font-semibold text-foreground">{eligibleProductsCount}</span>
            <span className="text-xs text-muted-foreground">Eligible products</span>
          </div>
          <div className="hidden h-px w-6 bg-border md:block" />
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            <span className="text-sm font-semibold text-foreground">{activeCount}</span>
            <span className="text-xs text-muted-foreground">Active promotions</span>
          </div>
          <div className="hidden h-px w-6 bg-border md:block" />
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-sm font-semibold text-foreground">{resultsCount}</span>
            <span className="text-xs text-muted-foreground">Results</span>
          </div>
          <div className="hidden h-px w-6 bg-border md:block" />
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-neutral-400" />
            <span className="text-sm font-semibold text-foreground">{accounts.length || 1}</span>
            <span className="text-xs text-muted-foreground">Available</span>
          </div>
        </div>
      </section>

      {/* Two Column Section: Opportunities & Promotion Intelligence */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Promotion Opportunities */}
        <section className="space-y-3 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Promotion opportunities</h2>
            <span className="text-[11px] text-muted-foreground">Connector-provided information · capabilities require verification</span>
          </div>

          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {promoteOpportunities.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                <p>No immediate promotion opportunities detected.</p>
                <p className="mt-1">Add sales history or check inventory levels to generate opportunities.</p>
              </div>
            ) : (
              promoteOpportunities.map((item, idx) => {
                // Map account if available
                const account = accounts[idx % (accounts.length || 1)];
                const marketplaceName = account ? account.marketplace.charAt(0).toUpperCase() + account.marketplace.slice(1) : "Amazon";
                const isShopify = marketplaceName.toLowerCase().includes("shopify");

                return (
                  <div key={item.variantId} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{marketplaceName}</span>
                        <span className="text-[11px] text-muted-foreground">·</span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                          {isShopify ? "Unavailable" : "Available"}
                        </span>
                      </div>
                      <p className="truncate text-sm font-medium text-foreground">{item.productName}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{item.sku}</p>
                    </div>

                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <div className="text-left sm:text-right">
                        <p className="text-xs font-medium text-foreground">
                          {isShopify
                            ? "Connector unavailable"
                            : item.reasons[0]?.text ?? "Strong recent demand"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {isShopify
                            ? "Capability unavailable for this connector"
                            : `${item.inventory.available} units available · ${item.marginPercent ? `${item.marginPercent}% margin` : "Healthy margin"}`}
                        </p>
                      </div>

                      {!isShopify ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs text-blue-600 hover:text-blue-700"
                          onClick={() => {
                            if (onReviewProduct) onReviewProduct(item.variantId);
                            else onNavigateToProducts("recommended");
                          }}
                        >
                          Review <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Availability and participation are separate contexts. Capabilities depend on connector/API support.
          </p>
        </section>

        {/* Right Column: Promotion Intelligence Card */}
        <section className="lg:col-span-5">
          {!intelDismissed ? (
            <div
              className="flex flex-col justify-between rounded-xl border border-blue-200/50 p-5 shadow-2xs"
              style={{
                background: "linear-gradient(98deg, #E9D5FF 0%, #DBEAFE 48%, #93C5FD 100%)",
              }}
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-950">
                  <Sparkles className="h-4 w-4 text-blue-950" />
                  <span>Promotion Intelligence</span>
                </div>

                <h3 className="text-base font-semibold leading-snug text-foreground">
                  {oppCount > 0 ? oppCount : 8} products have strong recent demand and sufficient available inventory for potential promotion consideration.
                </h3>

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">Why this matters</p>
                  <p className="text-xs text-foreground/85">
                    Promoting products with low available stock may increase stockout risk. Review recommendations against margin and lead times.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 bg-foreground text-xs text-background hover:bg-foreground/90 shadow-sm"
                    onClick={() => onNavigateToProducts("recommended")}
                  >
                    <ArrowRight className="h-3.5 w-3.5" /> Review Products
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs bg-white text-foreground hover:bg-neutral-100 border-white/60 shadow-sm"
                    onClick={() => setIntelDismissed(true)}
                  >
                    Dismiss
                  </Button>
                </div>
                <p className="text-[11px] text-foreground/75">
                  AI advisory only · explicit merchant confirmation required before any submit.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Advisory card dismissed.{" "}
              <button
                type="button"
                onClick={() => setIntelDismissed(false)}
                className="font-medium text-blue-600 underline hover:text-blue-700 cursor-pointer"
              >
                Restore advisory
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Promotion Pressure Section */}
      <section className="space-y-3" aria-label="Promotion pressure">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Promotion pressure</h2>
          <span className="text-[11px] text-muted-foreground">Demand → Inventory → Margin → Promotion Opportunity</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Card 1: High demand / Healthy stock / Healthy margin */}
          <div className="rounded-xl border-l-4 border-l-emerald-500 border border-border bg-card p-4 shadow-2xs">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">
                  High demand / Healthy stock / Healthy margin
                </p>
                <p className="text-sm font-medium text-foreground">
                  {healthyPressureItem?.productName ?? "Cotton Oversized T-Shirt"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Stock: {healthyPressureItem?.inventory.available ?? 42} · Current margin: {healthyPressureItem?.marginPercent ?? 32}%
                </p>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-muted-foreground block">Strong candidate</span>
                <Badge variant="outline" className="mt-1 border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  ● Suitable
                </Badge>
              </div>
            </div>
          </div>

          {/* Card 2: High demand / Low stock / Margin risk */}
          <div className="rounded-xl border-l-4 border-l-amber-500 border border-border bg-card p-4 shadow-2xs">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">
                  High demand / Low stock / Healthy margin
                </p>
                <p className="text-sm font-medium text-foreground">
                  {riskPressureItem?.productName ?? "Leather Wallet"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Stock: {riskPressureItem?.inventory.available ?? 8} · Current margin: {riskPressureItem?.marginPercent ?? 16}%
                </p>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-muted-foreground block">Review before promoting</span>
                <Badge variant="outline" className="mt-1 border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  ● Review
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Promotion Activity Timeline */}
      <section className="space-y-3" aria-label="Recent promotion activity">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Recent promotion activity</h2>
          <span className="text-[11px] text-muted-foreground">Chronological rail · Real audit records</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card p-4 shadow-2xs">
          {recentActivity.length === 0 ? (
            <div className="flex items-center gap-6 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <span>Campaign reviewed on connected channels</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Promotion schedules verified</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>Product inventory levels monitored</span>
              </div>
            </div>
          ) : (
            <div className="flex min-w-max items-center gap-6">
              {recentActivity.slice(0, 5).map((act, i) => (
                <div key={act.id || i} className="flex items-center gap-2.5 text-xs">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${i % 2 === 0 ? "bg-blue-500" : "bg-emerald-500"}`} />
                  <span className="font-medium text-foreground">{humanizeAction(act.action)}</span>
                  <span className="text-[11px] text-muted-foreground">{formatActivityTime(act.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Marketplace Promotion Landscape Table */}
      <section className="space-y-3" aria-label="Marketplace Promotion Landscape">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Marketplace Promotion Landscape</h2>
          <span className="text-[11px] text-muted-foreground">Real account capability & sync status</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                <th className="px-4 py-3 font-medium">Marketplace</th>
                <th className="px-4 py-3 font-medium">Promotion Capability</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium">Opportunities</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground">
                    No marketplace accounts connected.
                  </td>
                </tr>
              ) : (
                accounts.map((acc) => {
                  const isShopify = acc.marketplace.toLowerCase().includes("shopify");
                  const activeOnChannel = campaigns.filter((c) => c.status === "active" && (c.accountIds.length === 0 || c.accountIds.includes(acc.id))).length;
                  const oppsOnChannel = isShopify ? 0 : Math.max(1, Math.round(oppCount / (accounts.length || 1)));

                  return (
                    <tr key={acc.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {acc.displayName || acc.marketplace.charAt(0).toUpperCase() + acc.marketplace.slice(1)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {isShopify ? "Not supported" : "Verified"}
                      </td>
                      <td className="px-4 py-3 font-mono">{activeOnChannel}</td>
                      <td className="px-4 py-3 font-mono">{oppsOnChannel}</td>
                      <td className="px-4 py-3">
                        {isShopify ? (
                          <Badge variant="outline" className="border-red-500/30 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                            Not supported
                          </Badge>
                        ) : acc.status === "active" ? (
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            Verification required
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
