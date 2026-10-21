import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { AddProductsDialog } from "@/components/promotions/AddProductsDialog";
import { CampaignDrawer } from "@/components/promotions/CampaignDrawer";
import { CampaignFormDialog } from "@/components/promotions/CampaignFormDialog";
import { CampaignsTable } from "@/components/promotions/CampaignsTable";
import { ProductsTable } from "@/components/promotions/ProductsTable";
import { PromoFilters } from "@/components/promotions/PromoFilters";
import { PromoOverview } from "@/components/promotions/PromoOverview";
import { EmptyCampaigns, EmptyProducts, LoadError, NoMatches, PromoPagination, TableSkeleton } from "@/components/promotions/PromoUi";
import { ACTION_LABELS, WRITE_REASON } from "@/components/promotions/promoFormat";
import { DEFAULT_PAGE_SIZE, campaignsQueryOf, isFiltered, productsQueryOf, usePromotionsUrlState } from "@/components/promotions/promoParams";
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
} from "@/hooks/usePromotions";
import { toast } from "@/hooks/useToast";
import type { PromotionCampaign, PromotionLifecycleAction } from "@/types/promotions";

type CampaignRef = Pick<PromotionCampaign, "id" | "name" | "code" | "version" | "status">;
type Confirm = { kind: "lifecycle"; campaign: CampaignRef; action: PromotionLifecycleAction } | { kind: "delete"; campaign: CampaignRef };

export default function PromotionsPage() {
  const url = usePromotionsUrlState();
  const { view, update, clearFilters, page, pageSize, open } = url;
  const canWrite = useCan("promotions:write");
  const campaignsView = view === "campaigns";

  const overview = usePromotionOverview();
  const accounts = usePromotionAccounts();
  const campaigns = usePromotionCampaigns(campaignsQueryOf(url), campaignsView);
  const products = usePromotedProducts(productsQueryOf(url), !campaignsView);
  // the products view filters by campaign: offer the campaigns (the first 100 are plenty for a select)
  const campaignOptions = usePromotionCampaigns({ page: 1, pageSize: 100 }, !campaignsView);
  const lifecycle = useCampaignLifecycle();
  const remove = useDeleteCampaign();
  const duplicate = useDuplicateCampaign();
  const process = useProcessPromotions();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PromotionCampaign | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [addFor, setAddFor] = useState<PromotionCampaign | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = campaignsView ? campaigns : products;
  const rows = campaignsView ? (campaigns.data?.items ?? []) : (products.data?.items ?? []);
  const counts = list.data?.counts as Record<string, number> | undefined;
  const filtered = isFiltered(url);
  const noun = campaignsView ? "campaigns" : "products";
  const refreshing = list.isFetching && list.isPlaceholderData;
  const accountList = useMemo(() => accounts.data ?? [], [accounts.data]);

  // a page past the end (a shrinking result set, an old link) falls back to the last page
  useEffect(() => {
    const d = list.data;
    if (d && d.total > 0 && d.items.length === 0 && page > d.pages) update({ page: String(d.pages) }, { replace: true });
  }, [list.data, page, update]);

  const openCampaign = (id: string | null) => update({ open: id });

  const startCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const startEdit = (c: PromotionCampaign) => {
    setEditing(c);
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
          else if (skipped.length > 0) toast({ title: `${c.name} ${ACTION_LABELS[action].done}`, description: `The sale price is saved, but ${skipped.length} marketplace connection${skipped.length === 1 ? " cannot" : "s cannot"} take prices automatically: ${skipped.map((s) => s.skipped).join("; ")}`, variant: "warning", duration: 9000 });
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
          // show the per-product reasons straight away instead of sending the seller to look for them
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
      onSuccess: (r) => toast({ title: "Campaigns refreshed", description: `${r.activated} started, ${r.ended} ended, ${r.refreshed} updated.`, variant: "success" }),
      onError: (e) => toast({ title: "Could not refresh campaigns", description: errorMessage(e), variant: "destructive" }),
    });

  const confirmText = confirm?.kind === "delete" ? { title: "Delete this draft?", body: `${confirm.campaign.name} and its product list will be removed. This cannot be undone.`, verb: "Delete draft", destructive: true } : confirm ? { title: ACTION_LABELS[confirm.action].title, body: ACTION_LABELS[confirm.action].body, verb: ACTION_LABELS[confirm.action].verb, destructive: ACTION_LABELS[confirm.action].destructive } : null;
  const asRef = (c: PromotionCampaign): CampaignRef => c;

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader
        eyebrow="GROWTH"
        title="Promotions & Discounts"
        description="Plan discount campaigns across your marketplaces. Sale prices are scheduled on the listings and results come from real orders."
        actions={
          <div className="flex items-center gap-3">
            <div role="tablist" aria-label="Promotions view" className="inline-flex items-center rounded-lg border border-border bg-muted p-1">
              {(["campaigns", "products"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => update({ view: v, status: null, type: null, campaign: null, account: null })}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-all ${view === v ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {v === "campaigns" ? "Campaigns" : "Promoted SKUs"}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" loading={process.isPending} disabled={!canWrite} title={canWrite ? "Start due campaigns, end finished ones and refresh the results now" : WRITE_REASON} onClick={refreshResults}>
              Refresh results
            </Button>
            <Button size="sm" disabled={!canWrite} title={canWrite ? undefined : WRITE_REASON} onClick={startCreate}>
              Create campaign
            </Button>
          </div>
        }
      />

      <PromoOverview overview={overview.data} loading={overview.isLoading} error={overview.isError} onRetry={() => void overview.refetch()} />

      <PromoFilters
        state={url}
        counts={counts}
        accounts={accountList}
        campaigns={campaignOptions.data?.items ?? []}
        filtered={filtered}
        onSearch={(q) => update({ q }, { replace: true })}
        onStatus={(status) => update({ status })}
        onType={(type) => update({ type })}
        onAccount={(id) => update({ account: id })}
        onCampaign={(id) => update({ campaign: id })}
        onClear={clearFilters}
      />

      {list.isLoading ? (
        <TableSkeleton label={`Loading ${noun}`} />
      ) : list.isError && !list.data ? (
        <LoadError noun={campaignsView ? "Campaigns" : "Promoted products"} message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        filtered ? (
          <NoMatches noun={noun} onClear={clearFilters} />
        ) : campaignsView ? (
          <EmptyCampaigns canWrite={canWrite} onCreate={startCreate} />
        ) : (
          <EmptyProducts />
        )
      ) : (
        <>
          {campaignsView ? (
            <CampaignsTable
              rows={campaigns.data?.items ?? []}
              canWrite={canWrite}
              refreshing={refreshing}
              busyId={busyId}
              onOpen={(c) => openCampaign(c.id)}
              onEdit={startEdit}
              onLifecycle={(c, action) => setConfirm({ kind: "lifecycle", campaign: asRef(c), action })}
              onDuplicate={(c) => runDuplicate(asRef(c))}
              onDelete={(c) => setConfirm({ kind: "delete", campaign: asRef(c) })}
            />
          ) : (
            <ProductsTable rows={products.data?.items ?? []} refreshing={refreshing} showCampaign onOpenCampaign={(id) => openCampaign(id)} />
          )}
          <PromoPagination
            page={list.data?.page ?? page}
            pages={list.data?.pages ?? 1}
            total={list.data?.total ?? 0}
            pageSize={pageSize}
            shown={rows.length}
            noun={noun}
            onPage={(p) => update({ page: p > 1 ? String(p) : null })}
            onPageSize={(size) => update({ size: size === DEFAULT_PAGE_SIZE ? null : String(size) })}
          />
        </>
      )}

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

      <CampaignFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        campaign={editing}
        accounts={accountList}
        onSaved={(c) => {
          toast({ title: editing ? "Campaign updated" : c.status === "draft" ? "Draft saved" : "Campaign scheduled", description: `${c.name} (${c.code})`, variant: "success" });
          openCampaign(c.id);
        }}
      />

      <AddProductsDialog campaign={addFor} onClose={() => setAddFor(null)} />

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
