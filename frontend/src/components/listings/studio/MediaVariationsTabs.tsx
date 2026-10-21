import { Link } from "react-router-dom";
import { ProductImage } from "@/components/products/detail/ProductImage";
import { StatusPill } from "@/components/common/StatusPill";
import { ROUTES } from "@/constants/routes";
import type { ListingStudio } from "@/types/listingStudio";
import { formatINR } from "@/utils/format";

/** the product images the marketplace gets; they are managed on the product */
export function MediaTab({ s }: { s: ListingStudio }) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">Media Runway &amp; Image Compliance</h3>
        <Link to={`${ROUTES.PRODUCTS}/${s.listing.productId}?tab=media`} className="text-xs font-medium text-primary underline-offset-2 hover:underline">
          Manage images on the product
        </Link>
      </div>
      {s.media.length === 0 ? (
        <p className="text-xs text-muted-foreground">This product has no images yet. Marketplaces are likely to reject a listing without images.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Product images">
          {s.media.map((m) => (
            <li key={m.id} className="relative overflow-hidden rounded-xl border border-border">
              <ProductImage url={m.url} alt={m.fileName} className="h-44 w-full" />
              {m.isPrimary && <span className="absolute left-2 top-2 rounded bg-black/80 px-2 py-0.5 text-[10px] text-white">Primary</span>}
              {m.width !== null && m.height !== null && <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{m.width}x{m.height}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** the variants of the product and their listing on this account */
export function VariationsTab({ s }: { s: ListingStudio }) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-base font-semibold text-foreground">SKU Variations on {s.account.marketplaceName}</h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
            <tr>
              <th scope="col" className="py-3 pl-4 pr-3">SKU</th>
              <th scope="col" className="px-3 py-3">Variant Name</th>
              <th scope="col" className="px-3 py-3">Price</th>
              <th scope="col" className="px-3 py-3">Stock</th>
              <th scope="col" className="py-3 pl-3 pr-4">Listing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {s.variations.map((v) => (
              <tr key={v.variantId} className="hover:bg-muted/20">
                <td className="py-3 pl-4 pr-3 font-mono font-medium">
                  {v.sku}
                  {v.current && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">This listing</span>}
                </td>
                <td className="px-3 py-3">{v.optionValues && Object.keys(v.optionValues).length ? Object.values(v.optionValues).join(" / ") : "Default"}</td>
                <td className="px-3 py-3 font-semibold">{v.priceMinor === null ? "Not set" : formatINR(v.priceMinor)}</td>
                <td className="px-3 py-3 font-mono">{v.available}</td>
                <td className="py-3 pl-3 pr-4">
                  {v.listingId && !v.current ? (
                    <Link to={`${ROUTES.LISTINGS}/${v.listingId}`} className="inline-flex items-center gap-2 hover:underline">
                      <StatusPill status={v.listingStatus ?? "draft"} />
                    </Link>
                  ) : v.listingId ? (
                    <StatusPill status={v.listingStatus ?? "draft"} />
                  ) : (
                    <span className="text-muted-foreground">Not listed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
