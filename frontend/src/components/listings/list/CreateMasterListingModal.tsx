import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, MinusCircle, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/api/errors";
import { ROUTES } from "@/constants/routes";
import { useBulkCreateListings, useProductSearch } from "@/hooks/useListings";
import { toast } from "@/hooks/useToast";
import { formatNumber } from "@/utils/format";
import type { BulkCreateResponse, ListingChannels, ProductChoice } from "@/types/listing";
import { studioPath } from "./listingFormat";

/** the API takes at most this many product x account pairs in one call */
export const CREATE_MAX_PAIRS = 500;

interface CreateMasterListingModalProps {
  open: boolean;
  onClose: () => void;
  channels: ListingChannels | undefined;
  /** the listings are created with listings:write */
  canWrite: boolean;
  /** products and accounts to start with (the dialog opens ticked) */
  initialProducts?: ProductChoice[];
}

const LABEL = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#707070]";

/** the design's "Create Master Listing" dialog: pick master products and the channels to prepare them for; each pair becomes a draft listing */
export function CreateMasterListingModal({ open, onClose, channels, canWrite, initialProducts }: CreateMasterListingModalProps) {
  const creator = useBulkCreateListings();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<ReadonlyMap<string, ProductChoice>>(new Map());
  const [accountIds, setAccountIds] = useState<ReadonlySet<string>>(new Set());
  const [result, setResult] = useState<BulkCreateResponse | null>(null);

  const search = useProductSearch(q, open && !result);
  const names = useMemo(() => new Map((channels?.marketplaces ?? []).map((m) => [m.code, m.name])), [channels]);
  const accounts = channels?.accounts ?? [];
  const connected = accounts.filter((a) => a.status === "active");

  // the dialog starts clean (or with the products it was opened for) every time it opens
  useEffect(() => {
    if (!open) return;
    setText("");
    setQ("");
    setResult(null);
    setProducts(new Map((initialProducts ?? []).map((p) => [p.id, p])));
    const only = connected.length === 1 ? connected[0] : undefined;
    setAccountIds(new Set(only ? [only.id] : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const toggleProduct = (p: ProductChoice) =>
    setProducts((prev) => {
      const next = new Map(prev);
      if (!next.delete(p.id)) next.set(p.id, p);
      return next;
    });
  const toggleAccount = (id: string) =>
    setAccountIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const variantTotal = [...products.values()].reduce((sum, p) => sum + p.variantCount, 0);
  const pairs = variantTotal * accountIds.size;
  const tooMany = pairs > CREATE_MAX_PAIRS;
  const ready = canWrite && products.size > 0 && accountIds.size > 0 && !tooMany && !creator.isPending;

  const submit = () =>
    creator.mutate(
      { productIds: [...products.keys()], accountIds: [...accountIds] },
      {
        onSuccess: setResult,
        onError: (e) => toast({ title: "Could not create listings", description: errorMessage(e), variant: "destructive" }),
      },
    );

  const found = search.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Create Master Listing</DialogTitle>
              <DialogDescription>
                {result.summary.created} {result.summary.created === 1 ? "draft" : "drafts"} created
                {result.summary.existing ? `, ${result.summary.existing} already listed` : ""}
                {result.summary.failed ? `, ${result.summary.failed} failed` : ""}.
              </DialogDescription>
            </DialogHeader>
            <ul aria-label="Results" className="mt-2 max-h-[320px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {result.results.map((r) => (
                <li key={`${r.variantId}:${r.accountId}`} className="flex items-start gap-2 px-3 py-2">
                  {r.status === "created" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Created" />
                  ) : r.status === "exists" ? (
                    <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Already listed" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-label="Did not succeed" />
                  )}
                  <div className="min-w-0 text-xs">
                    <p className="font-semibold text-foreground">
                      {r.productTitle ?? "Unknown product"} <span className="font-mono font-normal text-muted-foreground">{r.sku ?? r.variantId}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {r.accountName ?? "Unknown account"}
                      {r.marketplace ? ` · ${names.get(r.marketplace) ?? r.marketplace}` : ""} — {r.message}
                    </p>
                    {r.listingId && (
                      <Link to={studioPath(r.listingId)} onClick={onClose} className="font-semibold text-foreground underline underline-offset-2">
                        Open listing
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <DialogFooter className="mt-4">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => {
                  setResult(null);
                  setProducts(new Map());
                }}
              >
                Create more
              </Button>
              <Button size="sm" className="text-xs" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create Master Listing</DialogTitle>
              <DialogDescription>Choose master products and the channels to prepare them for. Each product variant gets a draft listing on every channel you tick; ones that already exist are left alone.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-xs">
              <div>
                <label htmlFor="create-product-search" className={LABEL}>
                  Master products *
                </label>
                <div className="flex h-[34px] items-center gap-2 rounded-lg bg-[#F5F5F5] px-2.5">
                  <Search className="h-3.5 w-3.5 shrink-0 text-[#666666]" aria-hidden />
                  <input
                    id="create-product-search"
                    type="search"
                    aria-label="Search master products"
                    placeholder="Search by product, SKU or barcode…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="w-full border-none bg-transparent text-[12px] text-[#000000] placeholder-[#666666] focus:outline-none"
                  />
                </div>
                <ul aria-label="Products" className="mt-2 max-h-[180px] divide-y divide-[#EAEAEA] overflow-y-auto rounded-lg border border-[#EAEAEA]">
                  {search.isLoading && !search.data ? (
                    <li className="px-3 py-3 text-[#666666]">Searching…</li>
                  ) : search.isError ? (
                    <li className="px-3 py-3 text-rose-700">Products could not be loaded.</li>
                  ) : found.length === 0 ? (
                    <li className="px-3 py-3 text-[#666666]">{q ? "No active product matches." : "No active products yet."}</li>
                  ) : (
                    found.map((p) => (
                      <li key={p.id}>
                        <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-[#FAFAFA]">
                          <input type="checkbox" aria-label={`Select ${p.title}`} checked={products.has(p.id)} onChange={() => toggleProduct(p)} className="h-3.5 w-3.5 cursor-pointer rounded border border-[#BDBDBD] accent-black" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium text-[#000000]">{p.title}</span>
                            <span className="block truncate font-mono text-[10px] text-[#666666]">
                              {p.sku} · {p.variantCount} {p.variantCount === 1 ? "variant" : "variants"}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))
                  )}
                </ul>
                {products.size > 0 && (
                  <p className="mt-1.5 text-[11px] text-[#666666]" aria-live="polite">
                    {products.size} {products.size === 1 ? "product" : "products"} selected ({formatNumber(variantTotal)} {variantTotal === 1 ? "variant" : "variants"})
                  </p>
                )}
              </div>

              <div>
                <span className={LABEL}>Channels *</span>
                {accounts.length === 0 ? (
                  <p className="rounded-lg border border-[#EAEAEA] px-3 py-3 text-[#666666]">
                    No marketplace account is connected yet.{" "}
                    <Link to={ROUTES.MARKETPLACE_HUB} onClick={onClose} className="font-semibold text-[#000000] underline">
                      Open marketplace hub
                    </Link>
                  </p>
                ) : (
                  <ul aria-label="Channels" className="divide-y divide-[#EAEAEA] rounded-lg border border-[#EAEAEA]">
                    {accounts.map((a) => {
                      const usable = a.status === "active";
                      return (
                        <li key={a.id}>
                          <label className={`flex items-center gap-2.5 px-3 py-2 ${usable ? "cursor-pointer hover:bg-[#FAFAFA]" : "cursor-not-allowed opacity-50"}`}>
                            <input
                              type="checkbox"
                              aria-label={`${names.get(a.marketplace) ?? a.marketplace} ${a.displayName}`}
                              checked={accountIds.has(a.id)}
                              disabled={!usable}
                              onChange={() => toggleAccount(a.id)}
                              className="h-3.5 w-3.5 cursor-pointer rounded border border-[#BDBDBD] accent-black disabled:cursor-not-allowed"
                            />
                            <span className="flex-1 truncate text-[12px] font-medium text-[#000000]">
                              {names.get(a.marketplace) ?? a.marketplace} <span className="font-normal text-[#666666]">· {a.displayName}</span>
                            </span>
                            {!usable && <span className="text-[10px] text-[#666666]">Not connected</span>}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {tooMany && (
                <p role="alert" className="text-[11px] text-rose-700">
                  That is {formatNumber(pairs)} listings; at most {CREATE_MAX_PAIRS} can be created at a time. Choose fewer products or channels.
                </p>
              )}
              {!canWrite && (
                <p className="text-[11px] text-[#666666]" role="note">
                  Your role can view listings but not change them.
                </p>
              )}
            </div>

            <DialogFooter className="mt-4 items-center">
              <span className="mr-auto text-[11px] text-[#666666]">{pairs > 0 ? `${formatNumber(pairs)} ${pairs === 1 ? "draft listing" : "draft listings"} to prepare` : ""}</span>
              <Button size="sm" variant="outline" className="text-xs" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" className="text-xs" disabled={!ready} onClick={submit}>
                {creator.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                    Creating…
                  </>
                ) : (
                  "Create listings"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
