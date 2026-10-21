import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/api/errors";
import { useVariantSearch } from "@/hooks/useProcurement";
import { formatINR, formatNumber } from "@/utils/format";
import type { VariantOffer } from "@/types/procurement";

interface PoLinePickerProps {
  supplierId: string | undefined;
  /** variants already on the order (a variant may appear once) */
  taken: ReadonlySet<string>;
  onAdd: (offer: VariantOffer) => void;
}

/** find a product by SKU, barcode or title; with a supplier chosen its price, MOQ and lead time are shown and its products come first */
export function PoLinePicker({ supplierId, taken, onAdd }: PoLinePickerProps) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [suppliedOnly, setSuppliedOnly] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const onlyThisSupplier = suppliedOnly && Boolean(supplierId);
  const search = useVariantSearch(supplierId, q, onlyThisSupplier);
  const items = search.data?.items ?? [];

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" aria-label="Find a product to add" placeholder="Find a product by SKU, barcode or title..." value={text} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)} className="pl-9 text-xs" />
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={suppliedOnly} disabled={!supplierId} onChange={(e) => setSuppliedOnly(e.target.checked)} />
          Only this supplier's products
        </label>
      </div>
      {search.isError ? (
        <p role="alert" className="text-xs text-red-700">
          Products could not be loaded. {errorMessage(search.error)}{" "}
          <button type="button" className="underline" onClick={() => void search.refetch()}>
            Retry
          </button>
        </p>
      ) : search.isLoading ? (
        <p className="text-xs text-muted-foreground" role="status">
          Searching products...
        </p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{q ? "No product matches this search." : onlyThisSupplier ? "This supplier has no products on its price list yet." : "No products yet."}</p>
      ) : (
        <ul aria-label="Matching products" className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {items.map((it) => {
            const added = taken.has(it.variantId);
            const cost = it.offer?.costMinor ?? it.variantCostMinor;
            return (
              <li key={it.variantId} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{it.title}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {it.sku} · {formatNumber(it.available)} available{it.incoming > 0 ? ` · ${formatNumber(it.incoming)} incoming` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {it.offer
                      ? `Supplier price ${formatINR(it.offer.costMinor)} · MOQ ${it.offer.minOrderQuantity}${it.offer.leadTimeDays !== null ? ` · ${it.offer.leadTimeDays} days` : ""}${it.offer.isPreferred ? " · preferred" : ""}`
                      : cost !== null
                        ? `Product cost ${formatINR(cost)} (not on this supplier's price list)`
                        : "No cost known: enter one"}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1 text-xs" disabled={added} onClick={() => onAdd(it)} aria-label={`Add ${it.sku}`}>
                  <Plus className="h-3 w-3" aria-hidden />
                  {added ? "Added" : "Add"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {search.data && search.data.total > items.length && <p className="text-[11px] text-muted-foreground">Showing the first {items.length} of {formatNumber(search.data.total)} products: refine the search to find others.</p>}
    </div>
  );
}
