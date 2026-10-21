import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { useProductVariantCounts, useProductVariants } from "@/hooks/useProductDetail";
import { formatNumber } from "@/utils/format";
import type { ProductOverview, ProductTab } from "@/types/productDetail";
import { AsideRows, Divider, Empty, LINK_BTN, Notice, Row, SectionHead, TabError, TabLayout, TabSkeleton, TableShell } from "./shared";
import { optionColumns } from "./format";

interface Props {
  id: string;
  overview: ProductOverview;
  page: number;
  onPage: (page: number) => void;
  onTab: (tab: ProductTab) => void;
}

export function VariantsTab({ id, overview, page, onPage, onTab }: Props) {
  const navigate = useNavigate();
  const grid = useProductVariants(id, page, true);
  const counts = useProductVariantCounts(id, true);
  const manage = `${ROUTES.PRODUCTS}/${id}/variants`;
  const options = overview.variants.options;
  const cols = optionColumns(options);

  if (grid.isPending) return <TabSkeleton label="variants" />;
  const data = grid.data;
  if (!data) return <TabError label="variants" error={grid.error} onRetry={() => void grid.refetch()} />;
  const lowStock = (counts.data?.lowStock ?? 0) + (counts.data?.outOfStock ?? 0);
  const firstLow = data.items.find((v) => v.stock.status !== "healthy");
  const total = counts.data?.all ?? data.total;

  return (
    <TabLayout
      aside={
        <div className="w-full flex flex-col items-start gap-4">
          <SectionHead level={3} title="Variant structure" sub={`Sellable configurations linked to ${overview.product.title}.`} />
          <AsideRows
            rows={[
              ["Master SKU", overview.product.productCode],
              ...Object.entries(options).map(([name, values]) => [name, values.join(" · ")] as [string, string]),
              ["Variants", formatNumber(overview.variants.count)],
            ]}
          />
          <button type="button" onClick={() => navigate(manage)} className={`${LINK_BTN} pt-1`}>
            Manage variants →
          </button>
        </div>
      }
    >
      <div className="w-full flex flex-col items-start gap-4">
        <SectionHead
          title="Variants / SKUs"
          sub={`${formatNumber(total)} ${total === 1 ? "variant" : "variants"} linked to this master product.`}
          action={
            <button type="button" onClick={() => navigate(manage)} className={LINK_BTN}>
              Manage variants
            </button>
          }
        />

        {data.items.length === 0 ? (
          <Empty
            title="No variants yet"
            text="A sellable product needs at least one variant (a SKU with its price and stock)."
            action={
              <button type="button" onClick={() => navigate(manage)} className={LINK_BTN}>
                Add a variant →
              </button>
            }
          />
        ) : (
          <div className={`w-full ${grid.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={grid.isPlaceholderData}>
            <TableShell
              label="Variants"
              head={
                <>
                  <div className="flex-1 min-w-[140px]">Variant</div>
                  <div className="w-[140px]">SKU</div>
                  {cols.map((c) => (
                    <div key={c} className="w-[80px]">
                      {c}
                    </div>
                  ))}
                  <div className="w-[70px]">Inventory</div>
                  <div className="w-[90px] text-right">Status</div>
                </>
              }
            >
              {data.items.map((v) => (
                <Row key={v.id}>
                  <div className="flex-1 min-w-[140px] font-medium text-[#000000] break-words pr-2">{v.name}</div>
                  <div className="w-[140px] text-[#666666] font-normal break-all pr-2">{v.sku}</div>
                  {cols.map((c) => (
                    <div key={c} className="w-[80px] text-[#000000]">
                      {v.optionValues[c] ?? "-"}
                    </div>
                  ))}
                  <div className="w-[70px] text-[#000000]">{formatNumber(v.stock.available)}</div>
                  <div className="w-[90px] text-right text-[#000000]">
                    {v.lifecycle === "archived" ? "Inactive" : v.lifecycle === "draft" ? "Draft" : v.stock.status === "low" ? "Low stock" : v.stock.status === "out" ? "Out of stock" : "Active"}
                  </div>
                </Row>
              ))}
            </TableShell>
          </div>
        )}

        {data.pages > 1 ? (
          <div className="w-full flex flex-row items-center justify-between text-[12px] text-[#666666]">
            <span>
              Page {data.page} of {data.pages}
            </span>
            <span className="flex flex-row items-center gap-4">
              <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={LINK_BTN}>
                Previous
              </button>
              <button type="button" disabled={page >= data.pages} onClick={() => onPage(page + 1)} className={LINK_BTN}>
                Next
              </button>
            </span>
          </div>
        ) : null}

        <p className="text-[12px] font-normal leading-[17px] text-[#666666]">Each SKU represents a sellable configuration. Core information belongs to the master product.</p>
      </div>

      {lowStock > 0 ? (
        <Notice
          title={`${lowStock} low-stock ${lowStock === 1 ? "variant" : "variants"}`}
          text={firstLow ? `${firstLow.name} · ${firstLow.sku} · ${formatNumber(firstLow.stock.available)} available` : "Review stock for the affected SKUs."}
          action={
            <button type="button" onClick={() => onTab("inventory")} className={LINK_BTN}>
              View inventory →
            </button>
          }
        />
      ) : null}

      <Divider />

      <div className="w-full flex flex-col items-start gap-4">
        <SectionHead title="Inventory across variants" />
        <div className="w-full flex flex-row justify-between items-center text-[12px] leading-[17px]">
          <span className="text-[#000000]">
            {formatNumber(total)} {total === 1 ? "variant" : "variants"} · {formatNumber(overview.inventory.available)} units available
          </span>
          <button type="button" onClick={() => onTab("inventory")} className={LINK_BTN}>
            View inventory →
          </button>
        </div>
        <p className="text-[12px] font-normal leading-[17px] text-[#666666]">Variant inventory is tracked by SKU. Channel listings remain separate marketplace-specific representations.</p>
      </div>
    </TabLayout>
  );
}
