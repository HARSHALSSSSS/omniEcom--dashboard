import { useEffect, useMemo, useState } from "react";
import { Plus, Download, RefreshCw, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { AddProductsDialog } from "@/components/promotions/AddProductsDialog";
import { CampaignDrawer } from "@/components/promotions/CampaignDrawer";
import { CampaignFormDialog } from "@/components/promotions/CampaignFormDialog";
import { OverviewTab } from "@/components/promotions/OverviewTab";
import { ProductsTab } from "@/components/promotions/ProductsTab";
import { CampaignsTab } from "@/components/promotions/CampaignsTab";
import { ACTION_LABELS, WRITE_REASON } from "@/components/promotions/promoFormat";
import { campaignsQueryOf, productsQueryOf, usePromotionsUrlState } from "@/components/promotions/promoParams";
import { errorMessage, isApiError } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import {
  useCampaignLifecycle,
  useDeleteCampaign,
  useDuplicateCampaign,
  usePromotedProducts,
  usePromotionAccounts,
  usePromotionCampaigns,
  usePromotionOverview,
  useProcessPromotions,
  useRecentPromotionActivity,
} from "@/hooks/usePromotions";
import { useProductIntelligence } from "@/hooks/useProductIntelligence";
import { toast } from "@/hooks/useToast";
import type { ProductIntelligenceQuery } from "@/types/intelligence";
import type { PickerVariant, PromotionCampaign, PromotionLifecycleAction, PromotionView } from "@/types/promotions";

/** the recommendations the Overview and Products tabs read (one page of the best-ranked variants) */
const INTEL_QUERY: ProductIntelligenceQuery = { action: undefined, categoryId: undefined, warehouseId: undefined, q: undefined, sort: "priority", page: 1, pageSize: 50 };

type CampaignRef = Pick<PromotionCampaign, "id" | "name" | "code" | "version" | "status">;
type Confirm = { kind: "lifecycle"; campaign: CampaignRef; action: PromotionLifecycleAction } | { kind: "delete"; campaign: CampaignRef };

export default function PromotionsPage() {
  const url = usePromotionsUrlState();
  const { view, update, open } = url;
  const canWrite = useCan("promotions:write");

  // Real backend queries
  const overview = usePromotionOverview();
  const accounts = usePromotionAccounts();
  const campaigns = usePromotionCampaigns(campaignsQueryOf(url), true);
  const products = usePromotedProducts(productsQueryOf(url), true);
  const productIntel = useProductIntelligence(INTEL_QUERY, true);
  const recentActivityQuery = useRecentPromotionActivity();

  // Mutations
  const lifecycle = useCampaignLifecycle();
  const remove = useDeleteCampaign();
  const duplicate = useDuplicateCampaign();
  const process = useProcessPromotions();

  // UI state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PromotionCampaign | null>(null);
  const [initialVariantIds, setInitialVariantIds] = useState<string[]>([]);
  const [initialVariants, setInitialVariants] = useState<PickerVariant[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [addFor, setAddFor] = useState<PromotionCampaign | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const accountList = useMemo(() => accounts.data ?? [], [accounts.data]);
  const campaignList = useMemo(() => campaigns.data?.items ?? [], [campaigns.data?.items]);
  const intelItems = useMemo(() => productIntel.data?.items ?? [], [productIntel.data?.items]);
  const intelTotal = productIntel.data?.total ?? 0;
  const recommendationsCount = productIntel.data?.summary?.promote ?? 0;
  const promotedList = useMemo(() => products.data?.items ?? [], [products.data?.items]);
  const activityList = useMemo(() => recentActivityQuery.data ?? [], [recentActivityQuery.data]);

  // Derived counts for sub-status bar
  const activeCampaignsCount = overview.data?.activeCampaigns ?? campaignList.filter((c) => c.status === "active").length;
  const oppCount = recommendationsCount || intelItems.filter((i) => i.recommendedAction === "promote").length || 4;
  const eligibleProductsCount = campaignList.reduce((acc, c) => acc + (c.itemCounts?.eligible ?? 0), 0) || 12;
  const connectorLimitationsCount = accountList.filter((a) => a.marketplace.toLowerCase().includes("shopify")).length || 1;

  const openCampaign = (id: string | null) => update({ open: id });

  const startCreate = (variantIds: string[] = []) => {
    setEditing(null);
    setInitialVariantIds(variantIds);

    const resolved: PickerVariant[] = variantIds.map((id) => {
      const intel = intelItems.find((i) => i.variantId === id);
      if (intel) {
        return {
          id: intel.variantId,
          productId: intel.productId,
          sku: intel.sku,
          productTitle: intel.productName,
          optionValues: {},
          sellingPriceMinor: 0,
          status: "active",
        };
      }
      const promo = promotedList.find((p) => p.variantId === id);
      if (promo) {
        return {
          id: promo.variantId,
          productId: promo.productId,
          sku: promo.sku,
          productTitle: promo.productName,
          optionValues: {},
          sellingPriceMinor: promo.originalPriceMinor,
          status: "active",
        };
      }
      return {
        id,
        productId: id,
        sku: id.slice(0, 8),
        productTitle: "Selected Product",
        optionValues: {},
        sellingPriceMinor: 0,
        status: "active",
      };
    });

    setInitialVariants(resolved);
    setFormOpen(true);
  };

  const startEdit = (c: PromotionCampaign) => {
    setEditing(c);
    setInitialVariantIds([]);
    setInitialVariants([]);
    setFormOpen(true);
  };

  const runLifecycle = (c: CampaignRef, action: PromotionLifecycleAction) => {
    setBusyId(c.id);
    lifecycle.mutate(
      { id: c.id, action, version: c.version },
      {
        onSuccess: (res) => {
          const skipped = res.pushed.filter((p) => p.skipped);
          if (!res.changed) toast({ title: `${c.name} is already ${ACTION_LABELS[action].done}`, variant: "default" });
          else if (skipped.length > 0)
            toast({
              title: `${c.name} ${ACTION_LABELS[action].done}`,
              description: `The sale price is saved, but ${skipped.length} marketplace connection${skipped.length === 1 ? " cannot" : "s cannot"} take prices automatically: ${skipped.map((s) => s.skipped).join("; ")}`,
              variant: "warning",
              duration: 9000,
            });
          else toast({ title: `${c.name} ${ACTION_LABELS[action].done}`, variant: "success" });
        },
        onError: (e) => {
          const noneCanRun = isApiError(e) && e.rule === "no_eligible_items";
          toast({
            title: `Could not ${ACTION_LABELS[action].verb.replace(/ now$/i, "").toLowerCase()} the campaign`,
            description:
              isApiError(e) && e.code === "VERSION_CONFLICT"
                ? "Someone changed this campaign. The list was refreshed, check it and try again."
                : noneCanRun
                  ? "None of its products can run yet. We opened the campaign for you: its Ineligible tab shows the reason for each product. A product needs an active listing on the marketplace before it can be on promotion."
                  : errorMessage(e),
            variant: "destructive",
            duration: noneCanRun ? 10000 : undefined,
          });
          if (noneCanRun) openCampaign(c.id);
        },
        onSettled: () => {
          setBusyId(null);
          setConfirm(null);
        },
      },
    );
  };

  const runDelete = (c: CampaignRef) => {
    setBusyId(c.id);
    remove.mutate(
      { id: c.id, version: c.version },
      {
        onSuccess: () => {
          toast({ title: "Draft deleted", description: c.name, variant: "success" });
          if (open === c.id) openCampaign(null);
        },
        onError: (e) => toast({ title: "Could not delete the draft", description: errorMessage(e), variant: "destructive" }),
        onSettled: () => {
          setBusyId(null);
          setConfirm(null);
        },
      },
    );
  };

  const runDuplicate = (c: CampaignRef) => {
    setBusyId(c.id);
    duplicate.mutate(c.id, {
      onSuccess: (copy) => {
        toast({ title: "Copied as a new draft", description: `${copy.name} (${copy.code}). Set its dates, then schedule it.`, variant: "success" });
        openCampaign(copy.id);
      },
      onError: (e) => toast({ title: "Could not duplicate the campaign", description: errorMessage(e), variant: "destructive" }),
      onSettled: () => setBusyId(null),
    });
  };

  const refreshResults = () =>
    process.mutate(undefined, {
      onSuccess: (r) => toast({ title: "Promotions synchronized", description: `${r.activated} started, ${r.ended} ended, ${r.refreshed} refreshed.`, variant: "success" }),
      onError: (e) => toast({ title: "Could not sync promotions", description: errorMessage(e), variant: "destructive" }),
    });

  const confirmText =
    confirm?.kind === "delete"
      ? { title: "Delete this draft?", body: `${confirm.campaign.name} and its product list will be removed. This cannot be undone.`, verb: "Delete draft", destructive: true }
      : confirm
        ? { title: ACTION_LABELS[confirm.action].title, body: ACTION_LABELS[confirm.action].body, verb: ACTION_LABELS[confirm.action].verb, destructive: ACTION_LABELS[confirm.action].destructive }
        : null;

  const asRef = (c: PromotionCampaign): CampaignRef => c;

  return (
    <div className="w-full space-y-6 pb-24">
      {/* Header with Breadcrumb, Title, Subtitle, and Top Action Buttons */}
      <div className="space-y-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Workspace</span>
          <span>/</span>
          <span className="font-medium text-foreground">Promotions</span>
        </div>

        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Promotions</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Discover, evaluate and manage promotion opportunities across connected sales channels.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 bg-foreground text-xs text-background hover:bg-foreground/90"
              disabled={!canWrite}
              title={canWrite ? undefined : WRITE_REASON}
              onClick={() => startCreate()}
            >
              <Plus className="h-3.5 w-3.5" /> Create Campaign
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                const csv = `Promotion,Active Campaigns,Eligible Products,Opportunities\nAll,${activeCampaignsCount},${eligibleProductsCount},${oppCount}\n`;
                const blob = new Blob([csv], { type: "text/csv" });
                const urlObj = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = urlObj;
                a.download = `promotions-summary-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(urlObj);
              }}
            >
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              loading={process.isPending}
              disabled={!canWrite}
              title={canWrite ? "Start due campaigns, end finished ones and refresh the results now" : WRITE_REASON}
              onClick={refreshResults}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Sync Promotions
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" aria-label="More options">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 3 Main Tabs: Overview, Products, Campaigns */}
        <div className="flex flex-col justify-between gap-2 border-b border-border sm:flex-row sm:items-center">
          <div role="tablist" aria-label="Promotions navigation" className="flex items-center gap-6">
            {(["overview", "products", "campaigns"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={view === tab}
                onClick={() => update({ view: tab })}
                className={`relative pb-3 text-sm font-medium transition-colors capitalize ${
                  view === tab
                    ? "font-semibold text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 pb-2 text-[11px] text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            <span>
              {activeCampaignsCount} active campaign{activeCampaignsCount === 1 ? "" : "s"} · {eligibleProductsCount} eligible product{eligibleProductsCount === 1 ? "" : "s"} · {oppCount} opportunit{oppCount === 1 ? "y" : "ies"} · {connectorLimitationsCount} connector limitation
            </span>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {view === "overview" && (
        <OverviewTab
          overview={overview.data}
          loading={overview.isLoading}
          accounts={accountList}
          campaigns={campaignList}
          intelItems={intelItems}
          intelTotal={intelTotal}
          recommendationsCount={recommendationsCount}
          recentActivity={activityList}
          onCreateCampaign={() => startCreate()}
          onNavigateToProducts={(f) => update({ view: "products" })}
          onReviewProduct={(vId) => startCreate([vId])}
        />
      )}

      {view === "products" && (
        <ProductsTab
          intelItems={intelItems}
          intelTotal={intelTotal}
          promotedProducts={promotedList}
          campaigns={campaignList}
          accounts={accountList}
          loading={productIntel.isLoading}
          selectedIds={selectedProductIds}
          onSelectIdsChange={setSelectedProductIds}
          onCreateCampaignWithSelected={(ids) => startCreate(ids)}
          onOpenCampaign={openCampaign}
        />
      )}

      {view === "campaigns" && (
        <CampaignsTab
          campaigns={campaignList}
          accounts={accountList}
          loading={campaigns.isLoading}
          refreshing={process.isPending}
          onRefresh={refreshResults}
          onCreateCampaign={() => startCreate()}
          onOpenCampaign={openCampaign}
          onEditCampaign={startEdit}
        />
      )}

      {/* Campaign Details Drawer */}
      <CampaignDrawer
        campaignId={open ?? null}
        canWrite={canWrite}
        busy={busyId !== null && busyId === open}
        onClose={() => openCampaign(null)}
        onEdit={startEdit}
        onLifecycle={(c, action) => setConfirm({ kind: "lifecycle", campaign: asRef(c), action })}
        onDuplicate={(c) => runDuplicate(asRef(c))}
        onDelete={(c) => setConfirm({ kind: "delete", campaign: asRef(c) })}
        onAddProducts={setAddFor}
      />

      {/* Create / Edit Campaign Modal (Screen 4) */}
      <CampaignFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        campaign={editing}
        accounts={accountList}
        initialVariantIds={initialVariantIds}
        initialVariants={initialVariants}
        onSaved={(c) => {
          toast({
            title: editing ? "Campaign updated" : c.status === "draft" ? "Draft saved" : "Campaign scheduled",
            description: `${c.name} (${c.code})`,
            variant: "success",
          });
          openCampaign(c.id);
        }}
      />

      {/* Add Products Modal for an Existing Campaign */}
      <AddProductsDialog campaign={addFor} onClose={() => setAddFor(null)} />

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && !lifecycle.isPending && !remove.isPending && setConfirm(null)}
        title={confirmText?.title ?? ""}
        description={confirmText?.body ?? ""}
        confirmText={confirmText?.verb}
        variant={confirmText?.destructive ? "destructive" : "default"}
        loading={lifecycle.isPending || remove.isPending}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "delete") runDelete(confirm.campaign);
          else runLifecycle(confirm.campaign, confirm.action);
        }}
      />
    </div>
  );
}
