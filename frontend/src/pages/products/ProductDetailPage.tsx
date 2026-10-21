import { useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ActivityTab } from "@/components/products/detail/ActivityTab";
import { ContentTab } from "@/components/products/detail/ContentTab";
import { DetailBackLink, DetailHeader } from "@/components/products/detail/DetailHeader";
import { DetailSkeleton, ProductLoadError, ProductNotFound } from "@/components/products/detail/DetailStates";
import { DetailTabs } from "@/components/products/detail/DetailTabs";
import { isNotFound, panelId, tabId } from "@/components/products/detail/format";
import { AttentionBanner, HealthStrip } from "@/components/products/detail/HealthStrip";
import { InventoryTab } from "@/components/products/detail/InventoryTab";
import { ListingsTab } from "@/components/products/detail/ListingsTab";
import { MediaTab } from "@/components/products/detail/MediaTab";
import { OverviewTab } from "@/components/products/detail/OverviewTab";
import { PublishDialog } from "@/components/products/detail/PublishDialog";
import { VariantsTab } from "@/components/products/detail/VariantsTab";
import { useDetailActions } from "@/components/products/detail/useDetailActions";
import { useProductOverview } from "@/hooks/useProductDetail";
import { PRODUCT_TABS, type ActivityScope, type ProductTab } from "@/types/productDetail";

const SCOPES: ActivityScope[] = ["all", "master", "variants", "channels"];

const parseTab = (v: string | null): ProductTab => (PRODUCT_TABS as readonly string[]).includes(v ?? "") ? (v as ProductTab) : "overview";
const parseScope = (v: string | null): ActivityScope => (SCOPES as string[]).includes(v ?? "") ? (v as ActivityScope) : "all";
const parsePage = (v: string | null): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : 1;
};

/** /products/:id. Everything comes from GET /products/{id}/overview and the per-tab endpoints; the tab lives in the URL (?tab=). */
export default function ProductDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get("tab"));
  const scope = parseScope(params.get("scope"));
  const page = parsePage(params.get("page"));

  const overviewQ = useProductOverview(id);
  const overview = overviewQ.data;
  const actions = useDetailActions(id, overview);

  const setTab = useCallback(
    (next: ProductTab) => {
      const p = new URLSearchParams();
      if (next !== "overview") p.set("tab", next);
      setParams(p);
    },
    [setParams],
  );

  const setView = (patch: { scope?: ActivityScope; page?: number }) => {
    const p = new URLSearchParams(params);
    const nextScope = patch.scope ?? scope;
    const nextPage = patch.page ?? 1;
    if (nextScope === "all") p.delete("scope");
    else p.set("scope", nextScope);
    if (nextPage === 1) p.delete("page");
    else p.set("page", String(nextPage));
    setParams(p);
  };

  if (overviewQ.isPending) return <div className="w-full font-['Inter',sans-serif] pb-24"><DetailSkeleton /></div>;
  if (overviewQ.isError && !overview) {
    return isNotFound(overviewQ.error) ? <ProductNotFound /> : <ProductLoadError error={overviewQ.error} onRetry={() => void overviewQ.refetch()} />;
  }
  if (!overview) return <ProductNotFound />;

  return (
    <div className="w-full flex flex-col items-start gap-6 font-['Inter',sans-serif] text-[#000000] pb-24">
      <DetailBackLink title={overview.product.title} />
      <DetailHeader overview={overview} actions={actions} onTab={setTab} />
      <HealthStrip overview={overview} />
      <AttentionBanner banner={overview.attentionBanner} />

      <DetailTabs active={tab} onChange={setTab} />

      <div role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)} tabIndex={0} className="w-full outline-none">
        {tab === "overview" && <OverviewTab overview={overview} actions={actions} onTab={setTab} />}
        {tab === "variants" && <VariantsTab id={id} overview={overview} page={page} onPage={(p) => setView({ page: p })} onTab={setTab} />}
        {tab === "inventory" && <InventoryTab id={id} updateState={actions.state.inventory} />}
        {tab === "listings" && <ListingsTab id={id} overview={overview} actions={actions} />}
        {tab === "content" && <ContentTab id={id} overview={overview} actions={actions} onTab={setTab} />}
        {tab === "activity" && <ActivityTab id={id} overview={overview} scope={scope} page={page} onScope={(s) => setView({ scope: s })} onPage={(p) => setView({ page: p })} />}
        {tab === "media" && <MediaTab id={id} title={overview.product.title} />}
      </div>

      <ConfirmDialog
        open={actions.archiveOpen}
        onOpenChange={actions.setArchiveOpen}
        title="Archive this product?"
        description={`${overview.product.title} is hidden from the active catalog. Listings and stock stay as they are, and you can unarchive it later.`}
        confirmText="Archive"
        variant="destructive"
        loading={actions.archiving}
        onConfirm={actions.archiveOrRestore}
      />
      <PublishDialog productId={id} open={actions.publishOpen} onOpenChange={actions.setPublishOpen} />
    </div>
  );
}
