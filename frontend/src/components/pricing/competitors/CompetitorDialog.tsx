import { useEffect, useState } from "react";
import { isApiError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAddCompetitor, useVariantSearch } from "@/hooks/usePricing";
import { toast } from "@/hooks/useToast";
import { parseRupees } from "@/components/listings/studio/form";
import type { PricingChannel, VariantOption } from "@/types/pricing";
import { SELECT_CLASS } from "../PricingStates";

interface CompetitorDialogProps {
  open: boolean;
  channels: PricingChannel[];
  onClose: () => void;
}

interface Errors {
  variant?: string;
  price?: string;
  observedAt?: string;
}

/** records what a competitor charges for one of your products; the price is typed in rupees and parsed as text */
export function CompetitorDialog({ open, channels, onClose }: CompetitorDialogProps) {
  const add = useAddCompetitor();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [variant, setVariant] = useState<VariantOption | null>(null);
  const [price, setPrice] = useState("");
  const [seller, setSeller] = useState("");
  const [accountId, setAccountId] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setDebounced("");
    setVariant(null);
    setPrice("");
    setSeller("");
    setAccountId("");
    setObservedAt("");
    setErrors({});
    setFormError(null);
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const found = useVariantSearch(variant ? "" : debounced);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const next: Errors = {};
    if (!variant) next.variant = "Pick the product this price is for";
    const minor = parseRupees(price);
    if (minor === null || minor < 1) next.price = "Enter the price in rupees, for example 1299 or 1299.50";
    let observed: string | null = null;
    if (observedAt) {
      const d = new Date(observedAt);
      if (Number.isNaN(d.getTime())) next.observedAt = "Enter a valid date and time";
      else if (d.getTime() > Date.now() + 5 * 60_000) next.observedAt = "The observation cannot be in the future";
      else observed = d.toISOString();
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !variant || minor === null) return;
    add.mutate(
      { variantId: variant.id, accountId: accountId || null, priceMinor: minor, sellerName: seller.trim() || null, observedAt: observed },
      {
        onSuccess: () => {
          toast({ title: "Competitor price recorded", description: `${variant.sku}: new proposals use it from the next run.` });
          onClose();
        },
        onError: (err) => {
          if (isApiError(err) && err.fields?.priceMinor) setErrors({ price: err.fields.priceMinor });
          else setFormError(isApiError(err) ? err.message : "Could not save the price. Please try again.");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !add.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record a competitor price</DialogTitle>
          <DialogDescription className="text-xs">Prices are entered by you: nothing is scraped. The newest price of a product is the one the match-competitor strategy follows.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="competitor-variant" className="text-xs font-semibold">
              Product
            </label>
            {variant ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{variant.productTitle}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{variant.sku}</span>
                </span>
                <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setVariant(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <Input id="competitor-variant" placeholder="Search by SKU or product title..." value={search} onChange={(e) => setSearch(e.target.value)} error={Boolean(errors.variant)} className="text-xs" autoComplete="off" />
                {debounced.length >= 2 && (
                  <ul aria-label="Matching products" className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                    {found.isLoading && <li className="px-3 py-2 text-xs text-muted-foreground">Searching...</li>}
                    {found.isError && <li className="px-3 py-2 text-xs text-destructive">The search failed. Try again.</li>}
                    {found.data?.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">No product matches.</li>}
                    {found.data?.map((v) => (
                      <li key={v.id}>
                        <button type="button" className="block w-full px-3 py-2 text-left text-xs hover:bg-muted" onClick={() => setVariant(v)}>
                          <span className="block truncate font-semibold">{v.productTitle}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">{v.sku}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {errors.variant && (
              <p role="alert" className="text-[11px] text-destructive">
                {errors.variant}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-xs font-semibold">
              Competitor price (₹)
              <Input aria-label="Competitor price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={Boolean(errors.price)} className="text-xs" />
              {errors.price && (
                <span role="alert" className="block text-[11px] font-normal text-destructive">
                  {errors.price}
                </span>
              )}
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Seller <span className="font-normal text-muted-foreground">(optional)</span>
              <Input aria-label="Seller" maxLength={120} value={seller} onChange={(e) => setSeller(e.target.value)} className="text-xs" />
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Seen on <span className="font-normal text-muted-foreground">(optional)</span>
              <select aria-label="Seen on" className={`${SELECT_CLASS} w-full`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Any channel</option>
                {channels.map((c) => (
                  <option key={c.accountId} value={c.accountId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              Observed at <span className="font-normal text-muted-foreground">(default: now)</span>
              <Input aria-label="Observed at" type="datetime-local" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} error={Boolean(errors.observedAt)} className="text-xs" />
              {errors.observedAt && (
                <span role="alert" className="block text-[11px] font-normal text-destructive">
                  {errors.observedAt}
                </span>
              )}
            </label>
          </div>

          {formError && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {formError}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" size="sm" disabled={add.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={add.isPending}>
              Record price
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
