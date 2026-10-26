import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Download, RefreshCw, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadText } from "@/components/pricing/pricingFormat";
import { ROUTES } from "@/constants/routes";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { AddProductsDialog } from "@/components/promotions/AddProductsDialog";
import { CampaignDrawer } from "@/components/promotions/CampaignDrawer";
import { CampaignFormDialog } from "@/components/promotions/CampaignFormDialog";
import { OverviewTab } from "@/components/promotions/OverviewTab";
import { ProductsTab } from "@/components/promotions/ProductsTab";
import { CampaignsTab } from "@/components/promotions/CampaignsTab";
import { ACTION_LABELS, WRITE_REASON, overviewCsv, prefillFor } from "@/components/promotions/promoFormat";
import { campaignsQueryOf, candidatesQueryOf, usePromotionsUrlState } from "@/components/promotions/promoParams";
import { errorMessage, isApiError } from "@/api/errors";
import { useCan } from "@/hooks/useCan";
import {
  useCampaignLifecycle,
  useDeleteCampaign,
  useDuplicateCampaign,
  usePromotionCandidates,
  usePromotionAccounts,
  usePromotionCampaigns,
  usePromotionOverview,
  useProcessPromotions,
} from "@/hooks/usePromotions";
import { toast } from "@/hooks/useToast";
import type { CampaignPrefill, CandidatesQuery, PromotionCampaign, PromotionCandidate, PromotionLifecycleAction } from "@/types/promotions";
import { formatNumber } from "@/utils/format";

/** the few recommended products the Overview lists as opportunities */
const OPPORTUNITIES_QUERY: CandidatesQuery = { segment: "recommended", page: 1, pageSize: 5 };

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
  const productCandidates = usePromotionCandidates(candidatesQueryOf(url), view === "products" && url.segment !== "custom");
  const candidates = usePromotionCandidates(OPPORTUNITIES_QUERY, view === "overview");
  const navigate = useNavigate();

  // Mutations
  const lifecycle = useCampaignLifecycle();
  const remove = useDeleteCampaign();
  const duplicate = useDuplicateCampaign();
  const process = useProcessPromotions();

  // UI state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PromotionCampaign | null>(null);
  const [prefill, setPrefill] = useState<CampaignPrefill | null>(null);
  /** the seller's own selection on the Products tab: product + channel, kept across pages and filters */
  const [selectedProducts, setSelectedProducts] = useState<Map<string, PromotionCandidate>>(new Map());
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [addFor, setAddFor] = useState<PromotionCampaign | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const accountList = useMemo(() => accounts.data ?? [], [accounts.data]);
  const campaignList = useMemo(() => campaigns.data?.items ?? [], [campaigns.data?.items]);

  // the header counts come from the overview only: no figure is shown before it is loaded
  const o = overview.data;
  const statusBar = o
    ? `${o.activeCampaigns} active campaign${o.activeCampaigns === 1 ? "" : "s"} · ${formatNumber(o.eligibleProducts)} eligible product${o.eligibleProducts === 1 ? "" : "s"} · ${formatNumber(o.opportunities)} opportunit${o.opportunities === 1 ? "y" : "ies"} · ${o.connectorLimitations} connector limitation${o.connectorLimitations === 1 ? "" : "s"}`
    : overview.isError
      ? "Counts unavailable"
      : "Loading counts…";

  const exportOverview = () => {
    if (!o) return;
    downloadText(`promotions-overview-${new Date().toISOString().slice(0, 10)}.csv`, overviewCsv(o));
  };

  const openCampaign = (id: string | null) => update({ open: id });

  /** a new campaign; with rows (products of ONE channel) the dialog starts from their real prices, the channel and a margin-safe discount */
  const startCreate = (rows: PromotionCandidate[] = []) => {
    setEditing(null);
    setPrefill(rows.length > 0 ? prefillFor(rows) : null);
    setFormOpen(true);
  };

  const startEdit = (c: PromotionCampaign) => {
    setEditing(c);
    setPrefill(null);
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
            {view !== "products" && (
              <>
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
              disabled={!o}
              title={o ? "Download the overview figures and the channel table" : "The overview is not loaded yet"}
              onClick={exportOverview}
            >
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
              </>
            )}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" aria-label="More options">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px] text-xs">
                <DropdownMenuItem
                  onSelect={() => {
                    void overview.refetch();
                    void candidates.refetch();
                  }}
                >
                  Reload the numbers
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate(ROUTES.PRICING)}>Open Pricing</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate(ROUTES.LISTINGS)}>Open Listings</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
            <span>{statusBar}</span>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {view === "overview" && (
        <OverviewTab
          overview={overview.data}
          loading={overview.isLoading}
          error={overview.error}
          onRetry={() => void overview.refetch()}
          candidates={candidates.data}
          candidatesLoading={candidates.isLoading}
          candidatesError={candidates.error}
          onRetryCandidates={() => void candidates.refetch()}
          canWrite={canWrite}
          onReviewProduct={(row) => startCreate([row])}
          onNavigateToProducts={() => update({ view: "products" })}
        />
      )}

      {view === "products" && (
        <ProductsTab
          url={url}
          update={update}
          data={productCandidates.data}
          loading={productCandidates.isLoading}
          error={productCandidates.error}
          onRetry={() => void productCandidates.refetch()}
          accounts={accountList}
          selected={selectedProducts}
          onSelectedChange={setSelectedProducts}
          canWrite={canWrite}
          onCreateCampaign={(rows) => startCreate(rows)}
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
        prefill={prefill}
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
