import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { toAppPath } from "@/lib/links";
import { formatNumber } from "@/utils/format";
import { productTypeLabel } from "../productTypes";
import type { FieldRow, OverviewProduct, ProductOverview } from "@/types/productDetail";
import { Empty, KeyValue, LINK_BTN, Row, TableShell } from "./shared";
import { fieldLabel, fieldStateLabel, listingStatusLabel, optionColumns, relative } from "./format";
import type { ActionState, DetailActions } from "./useDetailActions";


/** "Edit information" style link to the edit screen, disabled when the product cannot be edited */
export function EditLink({ actions, productId, label }: { actions: DetailActions; productId: string; label: string }) {
  const navigate = useNavigate();
  const s = actions.state.edit;
  return (
    <button type="button" disabled={!s.enabled} title={s.enabled ? undefined : s.reason} onClick={() => navigate(`${ROUTES.PRODUCTS}/${productId}/edit`)} className={LINK_BTN}>
      {label}
    </button>
  );
}

export function ProductInformation({ product }: { product: OverviewProduct }) {
  return (
    <>
      <dl className="w-full grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 pt-1">
        <KeyValue label="Product name" value={product.title} />
        <KeyValue label="Product type" value={productTypeLabel(product.productType)} />
        <KeyValue label="Category" value={product.category?.name ?? "Not set"} />
        <KeyValue label="Master SKU" value={product.productCode} />
        <KeyValue label="Brand" value={product.brand ?? "Not set"} />
      </dl>
      <div className="w-full flex flex-col items-start gap-1 pt-1">
        <span className="text-[12px] font-normal leading-[17px] text-[#666666]">Description</span>
        <p className="text-[12px] font-normal leading-[17px] text-[#000000] whitespace-pre-line">{product.description?.trim() || "No description yet."}</p>
      </div>
    </>
  );
}

export function VariantsTable({ variants }: { variants: ProductOverview["variants"] }) {
  if (variants.items.length === 0) {
    return <Empty title="No variants yet" text="Add at least one sellable variant (size, color, ...) to this product." />;
  }
  const cols = optionColumns(variants.options);
  return (
    <TableShell
      label="Variants"
      head={
        <>
          <div className="flex-1 min-w-[140px]">Variant</div>
          <div className="w-[130px]">SKU</div>
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
      {variants.items.map((v) => (
        <Row key={v.variantId}>
          <div className="flex-1 min-w-[140px] font-medium text-[#000000] break-words pr-2">{v.name}</div>
          <div className="w-[130px] text-[#666666] font-normal break-all pr-2">{v.sku}</div>
          {cols.map((c) => (
            <div key={c} className="w-[80px] text-[#000000]">
              {v.optionValues[c] ?? "-"}
            </div>
          ))}
          <div className="w-[70px] text-[#000000]">{formatNumber(v.available)}</div>
          <div className="w-[90px] text-right text-[#000000]">
            {v.status === "inactive" ? "Inactive" : v.stockStatus === "low" ? "Low stock" : v.stockStatus === "out" ? "Out of stock" : "Active"}
          </div>
        </Row>
      ))}
    </TableShell>
  );
}

export function ChannelsTable({ overview, onPublish, publish }: { overview: ProductOverview; onPublish: () => void; publish: ActionState }) {
  const navigate = useNavigate();
  const items = overview.channels.items;
  if (items.length === 0) {
    return (
      <Empty
        title="Not published yet"
        text="This master product has not been published to a sales channel."
        action={
          <button
            type="button"
            disabled={!publish.enabled}
            title={publish.enabled ? undefined : publish.reason}
            onClick={onPublish}
            className="box-border flex flex-row justify-center items-center px-4 h-9 bg-[#FFFFFF] border border-[#666666] rounded-[8px] text-[12px] font-semibold text-[#000000] hover:bg-[#F5F5F5] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:text-[#999999] disabled:border-[#BDBDBD] disabled:hover:bg-transparent"
          >
            Publish product
          </button>
        }
      />
    );
  }
  return (
    <TableShell
      label="Sales channels"
      head={
        <>
          <div className="w-[120px]">Channel</div>
          <div className="flex-1">Listing status</div>
          <div className="w-[130px]">Last sync</div>
          <div className="w-[110px] text-right">Action</div>
        </>
      }
    >
      {items.map((c) => (
        <Row key={`${c.channel.code}-${c.channel.accountId ?? ""}`} height="h-[56px]">
          <div className="w-[120px] font-medium text-[#000000] break-words pr-2">{c.channel.name}</div>
          <div className="flex-1 text-[#666666]">Listing {listingStatusLabel(c.listingStatus)}</div>
          <div className="w-[130px] text-[#000000]">{relative(c.lastSyncAt)}</div>
          <div className="w-[110px] text-right">
            <button type="button" onClick={() => navigate(toAppPath(c.action.href))} className="text-[#000000] hover:underline font-normal cursor-pointer">
              {c.action.key === "review" ? "Review →" : "View listing →"}
            </button>
          </div>
        </Row>
      ))}
    </TableShell>
  );
}

export function ReadinessRows({ fields }: { fields: FieldRow[] }) {
  return (
    <dl className="w-full border-t border-[#EAEAEA] divide-y divide-[#EAEAEA]">
      {fields.map((f) => (
        <div key={f.key} className="w-full flex flex-row justify-between items-center py-2.5 text-[12px] leading-[17px]">
          <dt className="text-[#666666]">{fieldLabel(f.key)}</dt>
          <dd className="text-[#000000] font-normal">{fieldStateLabel(f.key, f.state)}</dd>
        </div>
      ))}
    </dl>
  );
}
