import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { useProductInventory } from "@/hooks/useProductDetail";
import { toAppPath } from "@/lib/links";
import { formatNumber } from "@/utils/format";
import { AsideRows, Divider, Empty, LINK_BTN, Metric, Notice, Row, SectionHead, TabError, TabLayout, TabSkeleton, TableShell } from "./shared";
import { inventoryLabel } from "./format";
import type { ActionState } from "./useDetailActions";

export function InventoryTab({ id, updateState }: { id: string; updateState: ActionState }) {
  const navigate = useNavigate();
  const q = useProductInventory(id, true);

  if (q.isPending) return <TabSkeleton label="inventory" />;
  if (q.isError) return <TabError label="inventory" error={q.error} onRetry={() => void q.refetch()} />;
  const inv = q.data;
  const low = inv.lowStock;
  const first = low?.variants[0];
  const goInventory = () => navigate(ROUTES.INVENTORY);

  return (
    <TabLayout
      aside={
        <div className="w-full flex flex-col items-start gap-4">
          <SectionHead level={3} title="Inventory health" />
          <AsideRows
            rows={[
              ["Aggregate", inventoryLabel(inv.health.status)],
              ["Available", `${formatNumber(inv.totals.available)} units`],
              ["Low-stock variants", formatNumber(inv.totals.lowStockVariants)],
            ]}
          />
          <p className="text-[12px] font-normal leading-[17px] text-[#666666]">
            {inv.health.status === "healthy"
              ? "Aggregate inventory is healthy."
              : inv.health.status === "low"
                ? `Aggregate inventory is low. Variants at or below ${formatNumber(inv.health.lowStockThreshold)} units are flagged.`
                : "This product is out of stock."}
            {low && low.count === 1 && first ? ` ${first.name} is the only ${first.status === "out" ? "out-of-stock" : "low-stock"} variant.` : ""}
          </p>
          <button type="button" disabled={!updateState.enabled} title={updateState.enabled ? undefined : updateState.reason} onClick={goInventory} className={`${LINK_BTN} pt-1`}>
            Update inventory →
          </button>
        </div>
      }
    >
      <div className="w-full flex flex-col items-start gap-4">
        <SectionHead
          title="Product inventory"
          sub={`Stock for the ${inv.health.variants} sellable ${inv.health.variants === 1 ? "SKU" : "SKUs"} linked to this product.`}
          action={
            <button type="button" disabled={!updateState.enabled} title={updateState.enabled ? undefined : updateState.reason} onClick={goInventory} className={LINK_BTN}>
              Update inventory
            </button>
          }
        />
        <div className="w-full flex flex-row items-start pt-1">
          <Metric first label="Available" value={formatNumber(inv.totals.available)} />
          <Metric label="Reserved" value={formatNumber(inv.totals.reserved)} />
          <Metric label="Incoming" value={formatNumber(inv.totals.incoming)} />
          <Metric last label="Low-stock variants" value={formatNumber(inv.totals.lowStockVariants)} />
        </div>
      </div>

      <Divider />

      <div className="w-full flex flex-col items-start gap-4">
        <SectionHead title="Stock by variant" sub="Available inventory across all warehouses" />
        {inv.byVariant.length === 0 ? (
          <Empty title="No variants yet" text="Stock is tracked per variant. Add a variant to start tracking inventory." />
        ) : (
          <>
            <TableShell
              label="Stock by variant"
              head={
                <>
                  <div className="flex-1 min-w-[160px]">Variant</div>
                  <div className="w-[160px]">SKU</div>
                  <div className="w-[90px]">Available</div>
                  <div className="w-[90px]">Reserved</div>
                  <div className="w-[110px]">Status</div>
                </>
              }
            >
              {inv.byVariant.map((v) => (
                <Row key={v.variantId}>
                  <div className="flex-1 min-w-[160px] font-medium text-[#000000] break-words pr-2">{v.name}</div>
                  <div className="w-[160px] text-[#666666] font-normal break-all pr-2">{v.sku}</div>
                  <div className="w-[90px] text-[#000000]">{formatNumber(v.available)}</div>
                  <div className="w-[90px] text-[#000000]">{formatNumber(v.reserved)}</div>
                  <div className="w-[110px] text-[#000000]">{inventoryLabel(v.status)}</div>
                </Row>
              ))}
            </TableShell>
            <div className="w-full flex flex-row justify-between items-center text-[12px] leading-[17px] font-semibold text-[#000000]">
              <span>Total available</span>
              <span>{formatNumber(inv.totals.available)} units</span>
            </div>
          </>
        )}
      </div>

      <div className="w-full flex flex-col items-start gap-4">
        <SectionHead
          title="Warehouse"
          action={
            <button type="button" onClick={goInventory} className={LINK_BTN}>
              View inventory →
            </button>
          }
        />
        {inv.byWarehouse.length === 0 ? (
          <Empty title="No stock in any warehouse" text="Receive stock for this product's variants to see it by location." />
        ) : (
          <TableShell
            label="Stock by warehouse"
            head={
              <>
                <div className="flex-1">Location</div>
                <div className="w-[110px]">Available</div>
                <div className="w-[110px]">On hand</div>
                <div className="w-[110px]">Incoming</div>
              </>
            }
          >
            {inv.byWarehouse.map((w) => (
              <Row key={w.warehouseId}>
                <div className="flex-1 font-medium text-[#000000] break-words pr-2">{w.name}</div>
                <div className="w-[110px] text-[#000000]">{formatNumber(w.available)}</div>
                <div className="w-[110px] text-[#666666]">{formatNumber(w.onHand)}</div>
                <div className="w-[110px] text-[#666666]">{formatNumber(w.incoming)}</div>
              </Row>
            ))}
          </TableShell>
        )}
      </div>

      {low && first ? (
        <Notice
          title={low.count === 1 ? `${first.name} is ${first.status === "out" ? "out of stock" : "low on stock"}` : `${low.count} variants are low on stock`}
          text={low.count === 1 ? `${first.sku} · ${formatNumber(first.available)} available. Review this SKU independently of aggregate product health.` : `${first.name} and ${low.count - 1} more need restocking.`}
          action={
            <button type="button" onClick={() => navigate(toAppPath(`/inventory/variants/${first.variantId}`))} className={LINK_BTN}>
              View inventory →
            </button>
          }
        />
      ) : null}
    </TabLayout>
  );
}
