import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { formatNumber } from "@/utils/format";
import type { ProductOverview, ProductTab } from "@/types/productDetail";
import { ProductImage } from "./ProductImage";
import { ActivityRows } from "./ActivityTab";
import { ProductInformation, VariantsTable, ChannelsTable, ReadinessRows, EditLink } from "./sections";
import { Divider, Empty, LINK_BTN, Metric, SectionHead, AsideRows, TabLayout } from "./shared";
import { inventoryLabel, relative } from "./format";
import type { ActionState, DetailActions } from "./useDetailActions";

interface Props {
  overview: ProductOverview;
  actions: DetailActions;
  onTab: (tab: ProductTab) => void;
}

export function OverviewTab({ overview, actions, onTab }: Props) {
  const navigate = useNavigate();
  const { product, inventory, variants, channels, content, media, statusPanel, recentActivity } = overview;
  const { state } = actions;
  const editHref = `${ROUTES.PRODUCTS}/${product.id}/edit`;

  const quick: Array<{ label: string; s: ActionState; run: () => void }> = [
    { label: "Edit product", s: state.edit, run: () => navigate(editHref) },
    { label: "Manage variants", s: state.variants, run: () => navigate(`${ROUTES.PRODUCTS}/${product.id}/variants`) },
    { label: "Update inventory", s: state.inventory, run: () => onTab("inventory") },
    { label: "Manage listings", s: state.listings, run: () => onTab("listings") },
    { label: "Export product", s: state.export, run: actions.exportCsv },
  ];

  return (
    <TabLayout
      aside={
        <>
          <div className="w-full flex flex-col items-start gap-4">
            <SectionHead level={3} title="Product status" />
            <AsideRows
              rows={[
                ["Catalog", statusPanel.catalog === "ready" ? "Ready" : "Incomplete"],
                ["Inventory", inventoryLabel(statusPanel.inventory)],
                [
                  "Listings",
                  statusPanel.listings.state === "not_published" ? "Not published" : `${statusPanel.listings.active} Active · ${statusPanel.listings.attention} Attention`,
                ],
                ["Content", `${statusPanel.content.pct}% complete`],
                ...(statusPanel.syncLastAt ? [] : ([["Sync", "Not synced"]] as Array<[string, string]>)),
              ]}
            />
            {statusPanel.syncLastAt ? <div className="text-[12px] font-normal leading-[17px] text-[#666666]">Signals last synced {relative(statusPanel.syncLastAt)}.</div> : null}
            <button type="button" onClick={() => onTab("activity")} className={LINK_BTN}>
              View product activity →
            </button>
          </div>

          <Divider />

          <div className="w-full flex flex-col items-start gap-4">
            <SectionHead level={3} title="Quick actions" />
            <ul className="w-full flex flex-col items-start divide-y divide-[#EAEAEA] text-[12px] leading-[17px]">
              {quick.map((q) => (
                <li key={q.label} className="w-full">
                  <button
                    type="button"
                    disabled={!q.s.enabled}
                    title={q.s.enabled ? undefined : q.s.reason}
                    onClick={q.run}
                    className="w-full flex flex-row justify-between items-center py-2 hover:text-[#666666] transition-colors text-left cursor-pointer disabled:cursor-not-allowed disabled:text-[#999999]"
                  >
                    <span className={q.s.enabled ? "text-[#000000]" : "text-[#999999]"}>{q.label}</span>
                    <ChevronRight className="h-3 w-3 text-[#666666]" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <Divider />

          <div className="w-full flex flex-col items-start gap-2 text-[12px] leading-[17px]">
            <span className="font-semibold text-[#000000]">Master product</span>
            <p className="text-[#666666]">Single source of truth for product information.</p>
            <p className="text-[#666666]">Variants / SKUs are sellable configurations. Channel listings are marketplace-specific representations.</p>
          </div>
        </>
      }
    >
      <section aria-label="Product information" className="w-full flex flex-col items-start gap-4">
        <SectionHead title="Product information" sub="Master information · Single source of truth" action={<EditLink actions={actions} productId={product.id} label="Edit information" />} />
        <ProductInformation product={product} />
      </section>

      <Divider />

      <section aria-label="Product media" className="w-full flex flex-col items-start gap-4">
        <SectionHead
          title="Product media"
          sub={`${media.total} ${media.total === 1 ? "image" : "images"}`}
          action={
            <button type="button" onClick={() => onTab("media")} className={LINK_BTN}>
              Manage media
            </button>
          }
        />
        {media.items.length === 0 ? (
          <Empty title="No images yet" text="Add product images from the Media tab." />
        ) : (
          <ul className="w-full flex flex-row items-start gap-3 overflow-x-auto pb-1">
            {media.items.map((m) => (
              <li key={m.id} className="flex flex-col items-start gap-1.5 shrink-0">
                <ProductImage url={m.url} alt={m.fileName} className="w-[110px] h-[92px] rounded-[4px] border border-[#EAEAEA]" />
                {m.isPrimary ? <span className="text-[11px] font-normal leading-[16px] text-[#666666]">Primary image</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Divider />

      <section aria-label="Variants" className="w-full flex flex-col items-start gap-4">
        <SectionHead title="Variants" sub={`${variants.count} ${variants.count === 1 ? "variant" : "variants"} linked to this master product.`} />
        <VariantsTable variants={variants} />
        {variants.count > variants.items.length ? (
          <button type="button" onClick={() => onTab("variants")} className={`${LINK_BTN} pt-1`}>
            View all variants →
          </button>
        ) : null}
      </section>

      <Divider />

      <section aria-label="Inventory" className="w-full flex flex-col items-start gap-4">
        <SectionHead title="Inventory" />
        <div className="w-full flex flex-row items-start">
          <Metric first label="Available" value={formatNumber(inventory.available)} />
          <Metric label="Reserved" value={formatNumber(inventory.reserved)} />
          <Metric label="Incoming" value={formatNumber(inventory.incoming)} />
          <Metric last label="Low stock variants" value={formatNumber(inventory.lowStockVariants)} />
        </div>
        {inventory.byWarehouse.length === 0 ? (
          <p className="text-[12px] text-[#666666]">No stock recorded in any warehouse yet.</p>
        ) : (
          inventory.byWarehouse.map((w) => (
            <div key={w.warehouseId} className="w-full flex flex-row justify-between items-center text-[12px] pt-1">
              <span className="text-[#000000]">{w.warehouse}</span>
              <span className="text-[#666666]">{formatNumber(w.available)} available</span>
            </div>
          ))
        )}
        <button type="button" onClick={() => onTab("inventory")} className={LINK_BTN}>
          View inventory →
        </button>
      </section>

      <Divider />

      <section aria-label="Sales channels" className="w-full flex flex-col items-start gap-4">
        <SectionHead title="Sales channels" sub={channels.connected === 0 ? "0 connected channels" : "Where this master product is currently published."} />
        <ChannelsTable overview={overview} onPublish={() => actions.setPublishOpen(true)} publish={state.publish} />
        {channels.items.length > 0 ? (
          <p className="text-[12px] font-normal leading-[17px] text-[#666666]">Master product information is distributed. Marketplace-specific content can be managed independently for each channel.</p>
        ) : null}
      </section>

      <Divider />

      <section aria-label="Content readiness" className="w-full flex flex-col items-start gap-4">
        <SectionHead
          title="Content readiness"
          sub={`${content.pct}% complete`}
          action={<EditLink actions={actions} productId={product.id} label="Improve content" />}
        />
        <ReadinessRows fields={content.fields} />
      </section>

      <Divider />

      <section aria-label="Recent activity" className="w-full flex flex-col items-start gap-4">
        <SectionHead
          title="Recent activity"
          action={
            <button type="button" onClick={() => onTab("activity")} className={LINK_BTN}>
              View all activity →
            </button>
          }
        />
        <ActivityRows items={recentActivity} compact />
      </section>
    </TabLayout>
  );
}
