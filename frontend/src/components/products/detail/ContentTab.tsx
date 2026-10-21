import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { useProductContent } from "@/hooks/useProductDetail";
import type { ProductOverview, ProductTab } from "@/types/productDetail";
import { ProductImage } from "./ProductImage";
import { ProductInformation, ReadinessRows, EditLink } from "./sections";
import { Divider, Empty, LINK_BTN, Notice, Row, SectionHead, TabError, TabLayout, TabSkeleton, TableShell } from "./shared";
import { attributeLabel, attributeValue, contentStateLabel, fieldLabel, fieldStateLabel } from "./format";
import type { DetailActions } from "./useDetailActions";

const ATTRIBUTE_STATE = { complete: "Complete", missing: "Missing", needs_review: "Needs review" } as const;

export function ContentTab({ id, overview, actions, onTab }: { id: string; overview: ProductOverview; actions: DetailActions; onTab: (t: ProductTab) => void }) {
  const navigate = useNavigate();
  const q = useProductContent(id, true);

  if (q.isPending) return <TabSkeleton label="content" />;
  if (q.isError) return <TabError label="content" error={q.error} onRetry={() => void q.refetch()} />;
  const { readiness, masterAttributes, marketplaceContent } = q.data;
  const { product, media } = overview;
  const missing = masterAttributes.filter((a) => a.state !== "complete").length;
  const review = marketplaceContent.filter((m) => m.state === "needs_review");

  return (
    <TabLayout
      aside={
        <div className="w-full flex flex-col items-start gap-4">
          <SectionHead level={3} title="Content readiness" />
          <div className="text-[26px] font-semibold leading-[38px] text-[#000000] tracking-tight">{readiness.pct}% complete</div>
          <div role="progressbar" aria-label="Content completeness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readiness.pct} className="w-full h-1 bg-[#F5F5F5] rounded-full overflow-hidden">
            <div className="h-full bg-[#000000]" style={{ width: `${readiness.pct}%` }} />
          </div>
          <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
            {readiness.ready ? "Core master information is complete." : `${readiness.errors} ${readiness.errors === 1 ? "check needs" : "checks need"} attention before this product can be published.`}
            {review.length > 0 ? ` ${review.length === 1 ? "One channel's" : `${review.length} channels'`} marketplace content needs review.` : ""}
          </p>
          <div className="w-full border-t border-[#EAEAEA] divide-y divide-[#EAEAEA] text-[12px] leading-[17px]">
            {readiness.fields.map((f) => (
              <div key={f.key} className="w-full flex justify-between items-start gap-3 py-2.5">
                <span className="text-[#666666]">{fieldLabel(f.key)}</span>
                <span className="text-[#000000] font-normal text-right">
                  {f.key === "marketplace_content" && review.length > 0 ? `${review.length} ${review.length === 1 ? "channel needs" : "channels need"} review` : fieldStateLabel(f.key, f.state)}
                </span>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => navigate(`${ROUTES.PRODUCTS}/${id}/edit`)} disabled={!actions.state.edit.enabled} title={actions.state.edit.enabled ? undefined : actions.state.edit.reason} className={LINK_BTN}>
            Improve content →
          </button>
        </div>
      }
    >
      <div className="w-full flex flex-col items-start gap-4">
        <SectionHead title="Product information" sub="Master information · Single source of truth" action={<EditLink actions={actions} productId={id} label="Edit information" />} />
        <ProductInformation product={product} />
      </div>

      <Divider />

      <div className="w-full flex flex-col items-start gap-4">
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
      </div>

      <Divider />

      <div className="w-full flex flex-col items-start gap-4">
        <SectionHead
          title="Master attributes"
          sub={missing === 0 ? "Core product attributes are complete." : `${missing} ${missing === 1 ? "attribute needs" : "attributes need"} completion.`}
          action={<EditLink actions={actions} productId={id} label="Edit information" />}
        />
        <TableShell
          label="Master attributes"
          head={
            <>
              <div className="flex-1 min-w-[120px]">Attribute</div>
              <div className="flex-1 min-w-[120px]">Master value</div>
              <div className="flex-1 min-w-[120px]">Readiness</div>
            </>
          }
        >
          {masterAttributes.map((a) => (
            <Row key={a.attribute}>
              <div className="flex-1 min-w-[120px] font-medium text-[#000000]">{attributeLabel(a.attribute)}</div>
              <div className="flex-1 min-w-[120px] text-[#666666] font-normal break-words pr-2">{attributeValue(a.attribute, a.value, product.category?.name)}</div>
              <div className="flex-1 min-w-[120px] text-[#000000] font-normal">{ATTRIBUTE_STATE[a.state]}</div>
            </Row>
          ))}
        </TableShell>
        <ReadinessRows fields={readiness.fields.filter((f) => f.key !== "marketplace_content")} />
      </div>

      <Divider />

      <div className="w-full flex flex-col items-start gap-4">
        <SectionHead title="Marketplace content" sub="Channel-specific content is separate from your master information." />
        {marketplaceContent.length === 0 ? (
          <Empty title="Not published yet" text="No channel content exists yet. Publish the product to a sales channel to manage its marketplace content." />
        ) : (
          <ul className="w-full flex flex-col gap-3">
            {marketplaceContent.map((m) => (
              <li key={m.channel.code} className="w-full flex flex-col gap-1">
                {m.state === "needs_review" ? (
                  <Notice
                    title={`${m.channel.name} marketplace content needs review`}
                    text={m.issues.length ? m.issues.map((i) => i.message).join(" · ") : "Review the channel listing."}
                    action={
                      <button type="button" onClick={() => onTab("listings")} className={LINK_BTN}>
                        Review →
                      </button>
                    }
                  />
                ) : (
                  <div className="w-full flex flex-row justify-between items-center text-[12px] leading-[17px] border-b border-[#EAEAEA] py-2.5">
                    <span className="font-medium text-[#000000]">{m.channel.name}</span>
                    <span className="text-[#666666]">{contentStateLabel(m.state)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {review.length > 0 ? (
          <p className="text-[12px] font-normal leading-[17px] text-[#666666]">Resolve the review in its channel listing. Your master product remains catalog-ready.</p>
        ) : null}
      </div>
    </TabLayout>
  );
}
