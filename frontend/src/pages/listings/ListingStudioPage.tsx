import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ExternalLink, UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusPill } from "@/components/common/StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LeaveDialog } from "@/components/products/edit/Dialogs";
import { ActivityTab } from "@/components/listings/studio/ActivityTab";
import { AttributesTab } from "@/components/listings/studio/AttributesTab";
import { CategoryDialog } from "@/components/listings/studio/CategoryDialog";
import { ConflictDialog } from "@/components/listings/studio/ConflictDialog";
import { ContentTab } from "@/components/listings/studio/ContentTab";
import { fieldId } from "@/components/listings/studio/form";
import { MediaTab, VariationsTab } from "@/components/listings/studio/MediaVariationsTabs";
import { OverviewTab } from "@/components/listings/studio/OverviewTab";
import { PreviewTab } from "@/components/listings/studio/PreviewTab";
import { PricingStockTab } from "@/components/listings/studio/PricingStockTab";
import { ReadinessTab } from "@/components/listings/studio/ReadinessTab";
import { ContentSyncPanel, FlowCard, JobBanner } from "@/components/listings/studio/StudioBanners";
import { ROUTES } from "@/constants/routes";
import { isApiError, errorMessage } from "@/api/errors";
import { useActivityTimeline, useStudioController } from "@/hooks/useListingStudio";
import { isJobDone, type ContentState, type ReadinessItem, type StudioActionKey } from "@/types/listingStudio";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "content", label: "Content & SEO" },
  { id: "attributes", label: "Attributes" },
  { id: "media", label: "Media Runway" },
  { id: "variations", label: "Variations" },
  { id: "pricing", label: "Pricing & Stock" },
  { id: "readiness", label: "Readiness Check" },
  { id: "preview", label: "Preview" },
  { id: "activity", label: "Activity Log" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const CONTENT_CHIP: Record<ContentState, { label: string; cls: string }> = {
  synced: { label: "Content synced", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  sync_pending: { label: "Content update queued", cls: "border-sky-200 bg-sky-50 text-sky-700" },
  needs_review: { label: "Category review needed", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  needs_republish: { label: "Republish needed", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  failed: { label: "Content update failed", cls: "border-rose-200 bg-rose-50 text-rose-700" },
};

function StudioSkeleton() {
  return (
    <div className="w-full space-y-6" aria-busy="true" aria-label="Loading the listing studio">
      <Skeleton className="h-24" />
      <Skeleton className="h-10 w-2/3" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Skeleton className="h-64 lg:col-span-8" />
        <Skeleton className="h-64 lg:col-span-4" />
      </div>
    </div>
  );
}

export default function ListingStudioPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ctl = useStudioController(id);
  const { studio: s, studioQuery, blocker } = ctl;
  const timeline = useActivityTimeline(id, s);

  const [tab, setTab] = useState<TabId>("overview");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const focusId = useRef<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);

  const go = useCallback((next: TabId, field?: string) => {
    focusId.current = field ?? null;
    setTab(next);
    setFocusTick((n) => n + 1);
  }, []);
  useEffect(() => {
    const target = focusId.current;
    if (!target) return;
    focusId.current = null;
    const el = document.getElementById(target);
    if (el) {
      el.scrollIntoView?.({ behavior: "smooth", block: "center" });
      el.focus();
    }
  }, [focusTick, tab]);

  if (studioQuery.isLoading) return <StudioSkeleton />;
  if (studioQuery.isError || !s) {
    const notFound = isApiError(studioQuery.error) && studioQuery.error.status === 404;
    return (
      <div role="alert" className="flex min-h-[320px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
        <h2 className="text-base font-semibold text-foreground">{notFound ? "Listing not found" : "Could not load this listing"}</h2>
        <p className="max-w-sm text-xs text-muted-foreground">{notFound ? "It may have been deleted, or the link is wrong." : errorMessage(studioQuery.error, "Something went wrong while loading the listing studio.")}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => navigate(ROUTES.LISTINGS)}>
            Back to Listings
          </Button>
          {!notFound && (
            <Button type="button" size="sm" onClick={() => void studioQuery.refetch()}>
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  const { listing, product, account } = s;
  const act = (key: StudioActionKey) => {
    const a = s.actions.find((x) => x.action === key);
    return { enabled: !!a?.enabled, reason: a ? a.disabledReason : "Not available for this listing", label: a?.label };
  };
  const readOnlyReason = "You have read-only access to listings.";
  const live = listing.status === "active" || listing.status === "pending";
  const jobRunning = !!ctl.jobAction && !ctl.jobPollFailed && !(ctl.job && isJobDone(ctl.job.status));
  const busy = ctl.saving || ctl.publishing || ctl.running || ctl.resolving || jobRunning;

  const edit = act("edit");
  const flow = act("publish_flow");
  const validate = act("validate");
  const refresh = act("refresh_status");
  const unpublish = act("unpublish");
  const reasonFor = (a: { enabled: boolean; reason: string | null }) => (!ctl.canWrite ? readOnlyReason : (a.reason ?? undefined));

  const resolving = listing.contentState === "needs_review";
  const categoryAllowed = ctl.canWrite && (resolving ? act("resolve_review").enabled : !live);
  const categoryReason = !ctl.canWrite ? readOnlyReason : categoryAllowed ? null : live && !resolving ? "The category of a live listing cannot be changed. Unpublish it to choose another category." : act("resolve_review").reason;

  const onFix = (item: ReadinessItem) => {
    const fix = item.fix;
    if (!fix) return;
    const field = fix.field ?? item.field;
    switch (fix.action) {
      case "edit_content":
        return go("content", fieldId(field && ["title", "description", "brand"].includes(field) ? field : "title"));
      case "fill_attribute":
        return go("attributes", field ? fieldId(`attr:${field}`) : undefined);
      case "set_price":
        return go("pricing", fieldId("price"));
      case "set_mrp":
        return go("pricing", fieldId("mrp"));
      case "map_category":
        return setCategoryOpen(true);
      case "upload_images":
        return navigate(`${ROUTES.PRODUCTS}/${listing.productId}?tab=media`);
      case "add_barcode":
        return navigate(`${ROUTES.PRODUCTS}/${listing.productId}/variants`);
      case "restock":
        return navigate(ROUTES.INVENTORY);
      case "reconnect_account":
        return navigate(ROUTES.MARKETPLACE_HUB_CONNECTORS);
      case "validate":
        return void ctl.run("validate");
      case "review_marketplace_feedback":
        return go("overview");
    }
  };

  const pickCategory = async (marketplaceCategoryId: string) => {
    const ok = resolving ? await ctl.resolveReview({ action: "set_category", marketplaceCategoryId }) : await ctl.setCategory(marketplaceCategoryId);
    if (ok) setCategoryOpen(false);
  };

  const chip = CONTENT_CHIP[listing.contentState];
  const rejected = listing.status === "rejected" || listing.status === "correction_required";
  const firstIssue = s.marketplaceIssues.find((i) => i.severity === "error") ?? s.marketplaceIssues[0];

  return (
    <div className="w-full space-y-6 pb-24">
      <PageHeader
        eyebrow={`CHANNEL STUDIO · ${account.marketplaceName.toUpperCase()}`}
        title={product.title}
        description={`Configure marketplace-specific tags, image specifications, and attributes for ${account.marketplaceName} (${account.displayName}).`}
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.LISTINGS)} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Listings
            </Button>
            <Button variant="outline" size="sm" loading={ctl.saving} disabled={!ctl.canWrite || !ctl.dirty || !edit.enabled || busy} title={reasonFor(edit)} onClick={() => void ctl.save()}>
              {live ? "Save Changes" : "Save Draft"}
            </Button>
            <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" loading={ctl.publishing} disabled={!ctl.canWrite || !flow.enabled || busy} title={reasonFor(flow)} onClick={() => void ctl.publish()}>
              {!ctl.publishing && <UploadCloud className="h-4 w-4" aria-hidden="true" />}
              {flow.label ?? "Publish to Channel"}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <StatusPill status={listing.table.screenStatus} />
        <span className={`rounded border px-1.5 py-0.5 font-medium ${chip.cls}`}>{chip.label}</span>
        <span className="text-muted-foreground">
          {account.marketplaceName} · {account.displayName}
        </span>
        <Link to={`${ROUTES.PRODUCTS}/${listing.productId}`} className="font-medium text-primary underline-offset-2 hover:underline">
          {product.title} <span className="font-mono text-muted-foreground">({product.sku})</span>
        </Link>
        {listing.externalListingId && (
          <span className="flex items-center gap-1.5 font-mono text-muted-foreground">
            {listing.externalListingId}
            {s.externalUrl && (
              <a href={s.externalUrl} target="_blank" rel="noreferrer" aria-label="Open the listing on the marketplace" className="text-primary">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" disabled={!ctl.canWrite || !validate.enabled || busy} title={reasonFor(validate)} onClick={() => void ctl.run("validate")}>
            Validate
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" disabled={!ctl.canWrite || !refresh.enabled || busy} title={reasonFor(refresh)} onClick={() => void ctl.run("refresh_status")}>
            Refresh status
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" disabled={!ctl.canWrite || !unpublish.enabled || busy} title={reasonFor(unpublish)} onClick={() => setConfirmUnpublish(true)}>
            Unpublish
          </Button>
        </span>
      </div>

      {!ctl.canWrite && (
        <p role="note" className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          {readOnlyReason} You can look at the listing, its readiness and its history, but not change it.
        </p>
      )}
      {ctl.banner && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-red-50 p-3 text-xs text-red-900">
          <p>{ctl.banner}</p>
          <button type="button" className="font-medium underline" onClick={ctl.dismissBanner}>
            Dismiss
          </button>
        </div>
      )}

      {rejected && (
        <div className="flex items-start justify-between rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-destructive shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-600" aria-hidden="true" />
            <div>
              <h4 className="text-sm font-bold text-rose-950">Publication Rejected by {account.marketplaceName}</h4>
              <p className="mt-0.5 text-xs text-rose-800">{firstIssue?.message ?? "Validation checks failed on marketplace ingestion."}</p>
            </div>
          </div>
          <Button size="sm" className="h-8 bg-rose-700 text-xs text-white hover:bg-rose-800" disabled={!ctl.canWrite || !flow.enabled || busy} title={reasonFor(flow)} onClick={() => void ctl.publish()}>
            Retry Now
          </Button>
        </div>
      )}

      <JobBanner ctl={ctl} />
      <FlowCard ctl={ctl} />
      <ContentSyncPanel s={s} ctl={ctl} act={act} onChooseCategory={() => setCategoryOpen(true)} />

      <div role="tablist" aria-label="Listing studio sections" className="flex items-center gap-1 overflow-x-auto border-b border-border pb-1 text-xs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`studio-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="studio-panel"
            onClick={() => go(t.id)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="studio-panel" role="tabpanel" aria-labelledby={`studio-tab-${tab}`}>
        {tab === "overview" && <OverviewTab s={s} canChangeCategory={categoryAllowed} categoryReason={categoryReason} dirty={ctl.dirty} onChangeCategory={() => setCategoryOpen(true)} onOpenReadiness={() => go("readiness")} />}
        {tab === "content" && <ContentTab s={s} ctl={ctl} />}
        {tab === "attributes" && <AttributesTab s={s} ctl={ctl} />}
        {tab === "media" && <MediaTab s={s} />}
        {tab === "variations" && <VariationsTab s={s} />}
        {tab === "pricing" && <PricingStockTab s={s} ctl={ctl} />}
        {tab === "readiness" && <ReadinessTab readiness={s.readiness} canWrite={ctl.canWrite} checking={studioQuery.isFetching} onFix={onFix} onRecheck={() => void studioQuery.refetch()} />}
        {tab === "preview" && <PreviewTab s={s} />}
        {tab === "activity" && <ActivityTab items={timeline.items} total={timeline.total} hasMore={timeline.hasMore} loading={timeline.loading} failed={timeline.failed} onLoadMore={() => void timeline.loadMore()} />}
      </div>

      <footer className="sticky bottom-0 z-30 border-t border-border bg-background/95 py-2 text-xs backdrop-blur">
        <p role="status" className={ctl.dirty ? "font-medium text-amber-700" : "text-muted-foreground"}>
          {ctl.dirty ? "Unsaved changes" : "All changes saved"}
        </p>
      </footer>

      <CategoryDialog open={categoryOpen} accountId={account.id} marketplaceName={account.marketplaceName} busy={ctl.resolving || ctl.saving} onClose={() => setCategoryOpen(false)} onPick={(cid) => void pickCategory(cid)} />
      <ConfirmDialog
        open={confirmUnpublish}
        onOpenChange={setConfirmUnpublish}
        title="Unpublish this listing?"
        description={`The listing is taken down from ${account.marketplaceName}. You can publish it again later.`}
        confirmText="Unpublish"
        variant="destructive"
        onConfirm={() => {
          setConfirmUnpublish(false);
          void ctl.run("unpublish");
        }}
      />
      <ConflictDialog open={!!ctl.conflict} hasMyEdits={ctl.dirty} onReload={(keep) => void ctl.reloadFromConflict(keep)} onClose={ctl.closeConflict} />
      <LeaveDialog open={blocker.state === "blocked"} saving={ctl.saving} onKeep={() => blocker.reset?.()} onDiscard={ctl.revertAll} onSave={() => void ctl.save().then((o) => o === "saved" && blocker.proceed?.())} />
    </div>
  );
}
