import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { useProductListings } from "@/hooks/useProductDetail";
import type { ProductOverview } from "@/types/productDetail";
import { AsideRows, Divider, Empty, LINK_BTN, Notice, Row, SectionHead, TabError, TabLayout, TabSkeleton, TableShell } from "./shared";
import { listingStatusLabel, relative } from "./format";
import type { DetailActions } from "./useDetailActions";

const listingPath = (listingId: string) => `${ROUTES.LISTINGS}/${listingId}`;

export function ListingsTab({ id, overview, actions }: { id: string; overview: ProductOverview; actions: DetailActions }) {
  const navigate = useNavigate();
  const q = useProductListings(id, true);
  const publish = actions.state.publish;

  if (q.isPending) return <TabSkeleton label="listings" />;
  if (q.isError) return <TabError label="listings" error={q.error} onRetry={() => void q.refetch()} />;
  const { summary, channels, items } = q.data;
  const attention = channels.find((c) => c.listingStatus === "attention");
  const attentionItem = attention ? items.find((i) => i.channel.code === attention.channel.code && i.status === "attention") : undefined;
  const title = overview.product.title;
  const names = channels.map((c) => c.channel.name);

  return (
    <TabLayout
      aside={
        <div className="w-full flex flex-col items-start gap-4">
          <SectionHead level={3} title="Listing status" />
          <AsideRows
            rows={[
              ["Connected channels", summary.connected],
              ["Active listings", summary.active],
              ["Needs attention", summary.attention],
            ]}
          />
          <div className="text-[12px] font-normal leading-[17px] text-[#666666]">{summary.lastSyncAt ? `Last synced ${relative(summary.lastSyncAt)}` : "Not synced yet"}</div>
          <button type="button" onClick={() => navigate(ROUTES.LISTINGS)} className={LINK_BTN}>
            Manage listings →
          </button>
          <Divider />
          <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
            Master catalog: {overview.statusPanel.catalog === "ready" ? "Ready" : "Incomplete"}.
            {attention ? ` The ${attention.channel.name} issue affects its channel listing, not core master information.` : ""}
          </p>
        </div>
      }
    >
      <div className="w-full flex flex-col items-start gap-4">
        <SectionHead
          title="Channel listings"
          sub="Where this master product is currently published."
          action={
            <button type="button" onClick={() => navigate(ROUTES.LISTINGS)} className={LINK_BTN}>
              Manage listings
            </button>
          }
        />

        {channels.length === 0 ? (
          <Empty
            title="Not published yet"
            text="This master product has not been published to a sales channel."
            action={
              <button
                type="button"
                disabled={!publish.enabled}
                title={publish.enabled ? undefined : publish.reason}
                onClick={() => actions.setPublishOpen(true)}
                className="box-border flex flex-row justify-center items-center px-4 h-9 bg-[#FFFFFF] border border-[#666666] rounded-[8px] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:text-[#999999] disabled:border-[#BDBDBD] disabled:hover:bg-transparent"
              >
                Publish product
              </button>
            }
          />
        ) : (
          <>
            <TableShell
              label="Channel listings"
              head={
                <>
                  <div className="w-[130px]">Channel</div>
                  <div className="flex-1 min-w-[160px]">Listing status</div>
                  <div className="w-[116px]">Last sync</div>
                  <div className="w-[104px] text-right">Action</div>
                </>
              }
            >
              {channels.map((c) => {
                const first = items.find((i) => i.channel.code === c.channel.code && i.channel.accountId === c.channel.accountId) ?? items.find((i) => i.channel.code === c.channel.code);
                return (
                  <Row key={`${c.channel.code}-${c.channel.accountId ?? ""}`} height="h-[56px]">
                    <div className="w-[130px] font-medium text-[#000000] break-words pr-2">{c.channel.name}</div>
                    <div className="flex-1 min-w-[160px] text-[#666666] font-normal">
                      Listing {listingStatusLabel(c.listingStatus)}
                      {c.listings > 1 ? ` · ${c.listings} listings` : ""}
                    </div>
                    <div className="w-[116px] text-[#000000] font-normal">{relative(c.lastSyncAt)}</div>
                    <div className="w-[104px] text-right">
                      {first ? (
                        <button type="button" onClick={() => navigate(listingPath(first.listingId))} className="font-normal text-[#000000] hover:underline cursor-pointer">
                          {c.listingStatus === "attention" ? "Review →" : "View listing →"}
                        </button>
                      ) : null}
                    </div>
                  </Row>
                );
              })}
            </TableShell>

            <SectionHead level={3} title="Variant listings" sub="One listing per variant and channel account." />
            <TableShell
              label="Variant listings"
              head={
                <>
                  <div className="w-[130px]">Channel</div>
                  <div className="flex-1 min-w-[140px]">SKU</div>
                  <div className="w-[130px]">Status</div>
                  <div className="w-[104px] text-right">Action</div>
                </>
              }
            >
              {items.map((l) => (
                <Row key={l.listingId}>
                  <div className="w-[130px] font-medium text-[#000000] break-words pr-2">{l.channel.name}</div>
                  <div className="flex-1 min-w-[140px] text-[#666666] break-all pr-2">{l.sku}</div>
                  <div className="w-[130px] text-[#000000]">{listingStatusLabel(l.status)}</div>
                  <div className="w-[104px] text-right">
                    <button type="button" onClick={() => navigate(listingPath(l.listingId))} className="font-normal text-[#000000] hover:underline cursor-pointer">
                      Open →
                    </button>
                  </div>
                </Row>
              ))}
            </TableShell>

            <p className="text-[12px] font-normal leading-[17px] text-[#666666]">Master product information stays centralized. Marketplace-specific content can be managed independently for each channel.</p>
          </>
        )}
      </div>

      {attention ? (
        <Notice
          title={`${attention.channel.name} listing needs attention`}
          text={`${attention.error ?? attentionItem?.error ?? "Review the listing and its marketplace content."}${attention.lastSyncAt ? ` · Last sync ${relative(attention.lastSyncAt)}` : ""}`}
          action={
            attentionItem ? (
              <button type="button" onClick={() => navigate(listingPath(attentionItem.listingId))} className={LINK_BTN}>
                Review →
              </button>
            ) : null
          }
        />
      ) : null}

      <Divider />

      <div className="w-full flex flex-col items-start gap-3">
        <SectionHead title="Publication model" />
        <span className="text-[12px] font-semibold leading-[17px] text-[#000000]">Master Product → Channel Listing → Marketplace</span>
        <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
          {title} remains the single source of truth. Marketplace-specific representations are managed independently
          {names.length > 0 ? ` on ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]}` : ""}.
        </p>
      </div>
    </TabLayout>
  );
}
