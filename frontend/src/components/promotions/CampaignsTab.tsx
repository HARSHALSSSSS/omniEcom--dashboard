import { useState, useMemo } from "react";
import { Plus, RefreshCw, AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PromotionAccount, PromotionCampaign } from "@/types/promotions";

interface CampaignsTabProps {
  campaigns: PromotionCampaign[];
  accounts: PromotionAccount[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onCreateCampaign: () => void;
  onOpenCampaign: (campaignId: string) => void;
  onEditCampaign: (campaign: PromotionCampaign) => void;
}

export function CampaignsTab({
  campaigns,
  accounts,
  loading,
  refreshing,
  onRefresh,
  onCreateCampaign,
  onOpenCampaign,
  onEditCampaign,
}: CampaignsTabProps) {
  const [timeHorizon, setTimeHorizon] = useState<"past" | "now" | "next">("now");
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>("all");
  const [quickStatus, setQuickStatus] = useState<string | null>(null);

  // Group campaigns or channels
  const records = useMemo(() => {
    // If campaigns exist in backend, map them directly
    const list = campaigns.map((c, i) => {
      const channel = c.channels[0]?.marketplace ?? (accounts[i % (accounts.length || 1)]?.marketplace ?? "amazon");
      const marketplaceName = channel.charAt(0).toUpperCase() + channel.slice(1);
      const isShopify = marketplaceName.toLowerCase().includes("shopify");

      let statusBadge: "Available" | "Active" | "Draft" | "Ended" | "N/A" = "Available";
      if (isShopify) statusBadge = "N/A";
      else if (c.status === "active") statusBadge = "Active";
      else if (c.status === "scheduled" || c.status === "draft") statusBadge = "Available";
      else if (c.status === "ended") statusBadge = "Ended";

      const eligibleCount = c.itemCounts.eligible || c.itemCounts.total || (18 + i * 9);
      const participatingCount = c.itemCounts.live || (statusBadge === "Active" ? 42 : 0);

      return {
        id: c.id,
        raw: c,
        name: c.name,
        code: c.code,
        marketplace: marketplaceName,
        status: statusBadge,
        period: c.startsAt && c.endsAt ? `${c.startsAt.slice(0, 10)} to ${c.endsAt.slice(0, 10)}` : "Verification required",
        productsText: statusBadge === "Active" ? `${participatingCount} participating · Illustrative` : `${eligibleCount} eligible · Illustrative`,
        capability: isShopify ? "Not provided" : "Supported",
        subtitle: isShopify ? "Connector unavailable" : statusBadge === "Active" ? "Ending soon" : `${6 + i * 3} days indicated`,
        isShopify,
      };
    });

    // If fewer than 4 records, add connected channel record representation
    if (list.length < 4 && accounts.length > 0) {
      accounts.forEach((acc, idx) => {
        const mName = acc.marketplace.charAt(0).toUpperCase() + acc.marketplace.slice(1);
        if (!list.some((r) => r.marketplace.toLowerCase() === acc.marketplace.toLowerCase())) {
          const isShopify = mName.toLowerCase().includes("shopify");
          list.push({
            id: `channel-${acc.id}`,
            raw: null as unknown as PromotionCampaign,
            name: isShopify ? "Shopify Promotions" : `${mName} Seasonal Event`,
            code: `${acc.marketplace.toUpperCase()}-EVENT`,
            marketplace: mName,
            status: isShopify ? "N/A" : "Available",
            period: "Verification required",
            productsText: isShopify ? "—" : `${15 + idx * 7} eligible · Illustrative`,
            capability: isShopify ? "Not provided" : "Supported",
            subtitle: isShopify ? "Connector unavailable" : `${7 + idx * 2} days indicated`,
            isShopify,
          });
        }
      });
    }

    return list;
  }, [campaigns, accounts]);

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (selectedMarketplace !== "all" && r.marketplace.toLowerCase() !== selectedMarketplace.toLowerCase()) {
        return false;
      }
      if (quickStatus === "active" && r.status !== "Active") return false;
      if (quickStatus === "ending_soon" && !r.subtitle.includes("Ending soon")) return false;
      if (quickStatus === "past" && r.status !== "Ended") return false;

      if (timeHorizon === "past" && r.status !== "Ended") return false;
      if (timeHorizon === "now" && r.status === "Ended") return false;
      if (timeHorizon === "next" && r.status === "Active") return false;

      return true;
    });
  }, [records, selectedMarketplace, quickStatus, timeHorizon]);

  return (
    <div className="w-full space-y-6">
      {/* Header and Actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Promotions</h1>
          <p className="text-xs text-muted-foreground">Review promotion activity and manage campaigns supported by connected channels. Illustrative data only.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 bg-foreground text-xs text-background hover:bg-foreground/90"
            onClick={onCreateCampaign}
          >
            <Plus className="h-3.5 w-3.5" /> Create Campaign
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={onRefresh}
            loading={refreshing}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Sub-bar / Filters */}
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-3">
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

            <div className="flex items-center gap-1.5 text-xs">
              {[
                { id: "ending_soon", label: "Ending soon" },
                { id: "active", label: "Active" },
                { id: "past", label: "Past" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setQuickStatus(quickStatus === p.id ? null : p.id)}
                  className={`rounded-md border px-3 py-1 font-medium transition-colors ${
                    quickStatus === p.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <span className="text-xs text-muted-foreground font-mono">
            {filteredRecords.length} channel records · Illustrative data only
          </span>
        </div>

        {/* Warning Banner */}
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>Verification required before relying on any campaign schedule or type. Marketplace capabilities are unverified.</span>
        </div>

        {/* Time horizon toggle */}
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-lg border border-border bg-muted p-1 text-xs">
            {(["past", "now", "next"] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setTimeHorizon(h)}
                className={`rounded-md px-3.5 py-1.5 font-medium transition-all capitalize ${
                  timeHorizon === h
                    ? "bg-foreground font-semibold text-background shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {h}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Indicated durations are illustrative, not verified schedules
          </p>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-2xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-muted-foreground">
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 font-medium">Marketplace</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium">Products</th>
              <th className="px-4 py-3 font-medium">Capability</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No campaigns found for the selected view.
                </td>
              </tr>
            ) : (
              filteredRecords.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground">{r.subtitle}</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {r.marketplace}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "Available" ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600" /> Available
                      </span>
                    ) : r.status === "Active" ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" /> N/A
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.period}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.productsText}
                  </td>
                  <td className="px-4 py-3">
                    {r.capability === "Supported" ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Supported
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-600" /> Not provided
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!r.isShopify ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-blue-600 hover:text-blue-700"
                        onClick={() => {
                          if (r.raw?.id) onOpenCampaign(r.raw.id);
                          else onCreateCampaign();
                        }}
                      >
                        {r.status === "Active" ? "Manage >" : "View campaign >"}
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Showing all {filteredRecords.length} channel records</span>
        <span>No automatic enrollment occurs</span>
      </div>

      {/* Educational Guidance Cards at bottom */}
      <section className="space-y-3 pt-4 border-t border-border" aria-label="Before you manage a campaign">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Before you manage a campaign</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4 space-y-1 text-xs">
            <h4 className="font-semibold text-foreground">Availability is not participation</h4>
            <p className="text-muted-foreground leading-relaxed">
              Available campaigns and eligible products are opportunities to review, not enrollments. Participating products are shown separately.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-1 text-xs">
            <h4 className="font-semibold text-foreground">Connector-dependent capabilities</h4>
            <p className="text-muted-foreground leading-relaxed">
              Capabilities depend on connector/API support. "Supported" is an illustrative indication, not verified support for every action. Shopify capability is not provided.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-1 text-xs">
            <h4 className="font-semibold text-foreground">Review before submitting</h4>
            <p className="text-muted-foreground leading-relaxed">
              Submission requires connector support and explicit merchant confirmation. No discount, fee or campaign rule is assumed.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
