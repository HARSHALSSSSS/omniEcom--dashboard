import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { usePutSupplierProducts, useRemoveSupplierProduct, useSupplierProducts } from "@/hooks/useProcurement";
import { formatINR, formatNumber } from "@/utils/format";
import type { SupplierProduct, SupplierProductInput, VariantOffer } from "@/types/procurement";
import { minorToInput, parseMinor, parseQty } from "./procurementFormat";
import { InlineError } from "./procurementUi";
import { PoLinePicker } from "./PoLinePicker";

interface Draft {
  cost: string;
  moq: string;
  lead: string;
  sku: string;
  preferred: boolean;
}

const draftOf = (p: SupplierProduct): Draft => ({ cost: minorToInput(p.costMinor), moq: String(p.minOrderQuantity), lead: p.leadTimeDays === null ? "" : String(p.leadTimeDays), sku: p.supplierSku ?? "", preferred: p.isPreferred });

/** validated into the PUT body, or the first problem in plain words */
function toInput(variantId: string, d: Draft): { input: SupplierProductInput } | { problem: string } {
  const cost = parseMinor(d.cost);
  if (cost === null) return { problem: "Enter the price per unit, like 1250 or 1250.50" };
  const moq = d.moq.trim() === "" ? 1 : parseQty(d.moq);
  if (moq === null || moq < 1) return { problem: "The minimum order is a whole number, 1 or more" };
  const lead = d.lead.trim() === "" ? null : parseQty(d.lead, 365);
  if (d.lead.trim() !== "" && lead === null) return { problem: "Lead time is whole days, 0 to 365" };
  return { input: { variantId, costMinor: cost, minOrderQuantity: moq, leadTimeDays: lead, supplierSku: d.sku.trim() || null, isPreferred: d.preferred } };
}

const CELL = "h-8 text-xs";

function ProductRow({ supplierId, product, canWrite }: { supplierId: string; product: SupplierProduct; canWrite: boolean }) {
  const put = usePutSupplierProducts();
  const remove = useRemoveSupplierProduct();
  const [draft, setDraft] = useState<Draft>(draftOf(product));
  const [problem, setProblem] = useState<string | null>(null);
  // a refreshed list (somebody else's change, a preferred flag that moved) replaces what is shown
  useEffect(() => setDraft(draftOf(product)), [product]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(product));

  const patch = (p: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setProblem(null);
  };
  const save = () => {
    const r = toInput(product.variantId, draft);
    if ("problem" in r) {
      setProblem(r.problem);
      return;
    }
    put.mutate(
      { id: supplierId, items: [r.input] },
      {
        onSuccess: () => toast({ title: "Price list saved", description: `${product.sku} updated.`, variant: "success" }),
        onError: (e) => setProblem(errorMessage(e, "Could not save this product.")),
      },
    );
  };
  const del = () =>
    remove.mutate(
      { id: supplierId, variantId: product.variantId },
      {
        onSuccess: () => toast({ title: "Removed from the price list", description: product.sku, variant: "success" }),
        onError: (e) => toast({ title: "Could not remove the product", description: errorMessage(e), variant: "destructive" }),
      },
    );

  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        <p className="font-semibold text-foreground">{product.productTitle}</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {product.sku}
          {product.variantCostMinor !== null ? ` · product cost ${formatINR(product.variantCostMinor)}` : ""}
        </p>
        <Input aria-label={`Supplier SKU for ${product.sku}`} placeholder="Supplier's own SKU" value={draft.sku} maxLength={100} disabled={!canWrite} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ sku: e.target.value })} className={`${CELL} mt-1`} />
      </td>
      <td className="px-3 py-2">
        <Input aria-label={`Price for ${product.sku}`} inputMode="decimal" value={draft.cost} disabled={!canWrite} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ cost: e.target.value })} className={CELL} autoComplete="off" />
      </td>
      <td className="px-3 py-2">
        <Input aria-label={`Minimum order for ${product.sku}`} inputMode="numeric" value={draft.moq} disabled={!canWrite} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ moq: e.target.value })} className={CELL} autoComplete="off" />
      </td>
      <td className="px-3 py-2">
        <Input aria-label={`Lead time for ${product.sku}`} inputMode="numeric" value={draft.lead} placeholder="Default" disabled={!canWrite} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ lead: e.target.value })} className={CELL} autoComplete="off" />
      </td>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" aria-label={`Preferred supplier for ${product.sku}`} checked={draft.preferred} disabled={!canWrite} onChange={(e) => patch({ preferred: e.target.checked })} />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={!dirty || !canWrite} loading={put.isPending} onClick={save}>
            Save
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${product.sku}`} disabled={!canWrite || remove.isPending} onClick={del}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
        {problem && <p role="alert" className="mt-1 max-w-[160px] text-[11px] text-red-700">{problem}</p>}
      </td>
    </tr>
  );
}

function AddProduct({ supplierId, offer, onDone }: { supplierId: string; offer: VariantOffer; onDone: () => void }) {
  const put = usePutSupplierProducts();
  const [draft, setDraft] = useState<Draft>({ cost: offer.variantCostMinor === null ? "" : minorToInput(offer.variantCostMinor), moq: "1", lead: "", sku: "", preferred: false });
  const [problem, setProblem] = useState<string | null>(null);
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const r = toInput(offer.variantId, draft);
    if ("problem" in r) {
      setProblem(r.problem);
      return;
    }
    put.mutate(
      { id: supplierId, items: [r.input] },
      {
        onSuccess: () => {
          toast({ title: "Added to the price list", description: offer.sku, variant: "success" });
          onDone();
        },
        onError: (e) => setProblem(errorMessage(e, "Could not add this product.")),
      },
    );
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-2 rounded-lg border border-border bg-muted/20 p-3" aria-label={`Add ${offer.sku} to the price list`}>
      <p className="text-xs font-semibold">
        {offer.title} <span className="font-mono font-normal text-muted-foreground">{offer.sku}</span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
        <label className="text-[11px] text-muted-foreground">
          Price per unit
          <Input aria-label="Price per unit" inputMode="decimal" value={draft.cost} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ cost: e.target.value })} className={CELL} autoComplete="off" />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Minimum order
          <Input aria-label="Minimum order" inputMode="numeric" value={draft.moq} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ moq: e.target.value })} className={CELL} autoComplete="off" />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Lead time (days)
          <Input aria-label="Lead time in days" inputMode="numeric" value={draft.lead} placeholder="Default" onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ lead: e.target.value })} className={CELL} autoComplete="off" />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Supplier SKU
          <Input aria-label="Supplier SKU" value={draft.sku} maxLength={100} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ sku: e.target.value })} className={CELL} />
        </label>
      </div>
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={draft.preferred} onChange={(e) => patch({ preferred: e.target.checked })} /> Preferred supplier for this product
      </label>
      {problem && <p role="alert" className="text-[11px] text-red-700">{problem}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="text-xs" loading={put.isPending}>
          Add to price list
        </Button>
        <Button type="button" size="sm" variant="ghost" className="text-xs" disabled={put.isPending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** the supplier price list: cost, minimum order, lead time and preferred flag per product (GET/PUT/DELETE /suppliers/{id}/products) */
export function SupplierProducts({ supplierId, canWrite }: { supplierId: string; canWrite: boolean }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState<VariantOffer | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const list = useSupplierProducts(supplierId, q);
  const items = list.data?.items ?? [];

  return (
    <div className="space-y-3">
      {canWrite && (
        <>
          <PoLinePicker supplierId={supplierId} taken={new Set(items.map((i) => i.variantId))} onAdd={(o) => setAdding(o)} />
          {adding && <AddProduct key={adding.variantId} supplierId={supplierId} offer={adding} onDone={() => setAdding(null)} />}
        </>
      )}
      <Input type="search" aria-label="Search this price list" placeholder="Search the price list..." value={text} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)} className="text-xs" />
      {list.isError ? (
        <div role="alert">
          <InlineError message={`The price list could not be loaded. ${errorMessage(list.error)}`} />
          <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => void list.refetch()}>
            Retry
          </Button>
        </div>
      ) : list.isLoading ? (
        <p role="status" className="text-xs text-muted-foreground">
          Loading the price list...
        </p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{q ? "No product on the price list matches this search." : "This supplier has no products on its price list yet. Purchase orders for it need a unit cost on every line."}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[620px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] text-muted-foreground">
                  <th scope="col" className="px-3 py-2">Product</th>
                  <th scope="col" className="w-24 px-3 py-2">Price</th>
                  <th scope="col" className="w-20 px-3 py-2">Min order</th>
                  <th scope="col" className="w-24 px-3 py-2">Lead days</th>
                  <th scope="col" className="w-16 px-3 py-2 text-center">Preferred</th>
                  <th scope="col" className="w-28 px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((p) => (
                  <ProductRow key={p.id} supplierId={supplierId} product={p} canWrite={canWrite} />
                ))}
              </tbody>
            </table>
          </div>
          {list.data && list.data.total > items.length && <p className="text-[11px] text-muted-foreground">Showing the first {formatNumber(items.length)} of {formatNumber(list.data.total)}: search to find others.</p>}
        </>
      )}
    </div>
  );
}
