import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/constants/routes";
import type { StudioController } from "@/hooks/useListingStudio";
import type { ListingStudio } from "@/types/listingStudio";
import { formatDateTime, formatINR } from "@/utils/format";
import { ChannelField } from "./ChannelField";
import { fieldId, parseRupees } from "./form";

interface Props {
  s: ListingStudio;
  ctl: StudioController;
}

const Stat = ({ label, value, note }: { label: string; value: string; note?: string }) => (
  <div className="rounded-lg border border-border p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-2 text-lg font-bold text-foreground">{value}</p>
    {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
  </div>
);

const money = (minor: number | null) => (minor === null ? "Not set" : formatINR(minor));

/** price and MRP of this channel (a listing price overrides the product price), sale price and margin read-only, and the stock this channel may sell */
export function PricingStockTab({ s, ctl }: Props) {
  const v = ctl.values;
  if (!v) return null;
  const p = s.pricing;
  const st = s.stock;
  const ro = !ctl.canWrite;
  const err = ctl.fieldErrors;
  const priceCustom = p.variantPriceMinor !== null && parseRupees(v.price) !== p.variantPriceMinor;
  const mrpCustom = parseRupees(v.mrp) !== p.variantMrpMinor;
  const edit = (key: "price" | "mrp", value: string) => {
    ctl.setField(key, value);
    ctl.clearError(key);
  };

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-base font-semibold text-foreground">Channel Pricing &amp; Stock</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border p-4">
          <ChannelField id={fieldId("price")} label="Channel selling price (INR)" customised={priceCustom} modified={ctl.modified.includes("price")} resetLabel="Use product price" onReset={() => ctl.resetField("price")} readOnly={ro} error={err.price} hint={p.listingPriceOverride ? `Product price: ${money(p.variantPriceMinor)}` : "Follows the product price until you change it here."}>
            <Input id={fieldId("price")} inputMode="decimal" value={v.price} readOnly={ro} aria-invalid={!!err.price} aria-describedby={err.price ? `${fieldId("price")}-error` : undefined} onChange={(e) => edit("price", e.target.value)} className="text-xs font-bold" />
          </ChannelField>
        </div>
        <div className="rounded-lg border border-border p-4">
          <ChannelField id={fieldId("mrp")} label="MRP (INR)" customised={mrpCustom} modified={ctl.modified.includes("mrp")} resetLabel="Use product MRP" onReset={() => ctl.resetField("mrp")} readOnly={ro} error={err.mrp} hint={p.listingMrpOverride ? `Product MRP: ${money(p.variantMrpMinor)}` : "Follows the product MRP until you change it here."}>
            <Input id={fieldId("mrp")} inputMode="decimal" value={v.mrp} readOnly={ro} aria-invalid={!!err.mrp} onChange={(e) => edit("mrp", e.target.value)} className="text-xs font-bold" />
          </ChannelField>
        </div>
        <Stat
          label="Sale price"
          value={p.salePriceMinor === null ? "No sale running" : formatINR(p.salePriceMinor)}
          note={p.salePriceMinor === null ? undefined : p.saleEndsAt ? `Ends ${formatDateTime(p.saleEndsAt)}` : undefined}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Sale prices and price rules are managed in the{" "}
        <Link to={ROUTES.PRICING} className="font-medium text-primary underline-offset-2 hover:underline">
          Pricing module
        </Link>
        .
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="Cost price" value={money(p.costMinor)} />
        <Stat label="Gross margin" value={p.grossMarginMinor === null ? "Not available" : formatINR(p.grossMarginMinor)} />
        <Stat label="Discount" value={`${p.discountPercent}%`} />
      </div>

      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stock on this channel</h4>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Available" value={String(st.available)} note="In the warehouses of this account" />
        <Stat label="Sellable" value={String(st.sellable)} note="After allocation and safety buffer" />
        <Stat label="Pushed to marketplace" value={st.pushed === null ? "Not pushed yet" : String(st.pushed)} note={st.pushedAt ? formatDateTime(st.pushedAt) : undefined} />
        <Stat label="Push status" value={st.dirty ? "Update waiting" : "Up to date"} note={st.bufferOverride !== null || st.maxQuantityOverride !== null ? `Buffer ${st.bufferOverride ?? "default"}, max ${st.maxQuantityOverride ?? "none"}` : undefined} />
      </div>
    </div>
  );
}
