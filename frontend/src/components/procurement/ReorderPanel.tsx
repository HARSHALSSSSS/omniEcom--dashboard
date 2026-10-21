import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useCan } from "@/hooks/useCan";
import { useCreateFromSuggestions, useProcurementWarehouses, useReorderSuggestions } from "@/hooks/useProcurement";
import { formatINR, formatNumber } from "@/utils/format";
import type { FromSuggestionsResult } from "@/types/procurement";
import { LoadError, SELECT, StateBox, TableSkeleton } from "./procurementUi";

interface ReorderPanelProps {
  onOpenOrder: (id: string) => void;
  onOpenSuppliers: () => void;
}

const cover = (days: number | null): string => (days === null ? "—" : days < 1 ? "< 1 day" : `${Math.round(days)} days`);

/** products running low (from real sales velocity), minus what is already on order, matched to a supplier; one click makes the draft orders */
export function ReorderPanel({ onOpenOrder, onOpenSuppliers }: ReorderPanelProps) {
  const query = useReorderSuggestions();
  const warehouses = useProcurementWarehouses();
  const create = useCreateFromSuggestions();
  const canWrite = useCan("procurement:write");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [warehouseId, setWarehouseId] = useState("");
  const [result, setResult] = useState<FromSuggestionsResult | null>(null);

  const items = useMemo(() => query.data ?? [], [query.data]);
  const orderable = useMemo(() => items.filter((i) => i.supplier !== null), [items]);
  // a refreshed list drops selections that no longer exist
  useEffect(() => setSelected((prev) => new Set([...prev].filter((id) => items.some((i) => i.variantId === id)))), [items]);
  useEffect(() => {
    if (warehouseId || !warehouses.data) return;
    const pick = warehouses.data.find((w) => w.isDefault) ?? warehouses.data[0];
    if (pick) setWarehouseId(pick.id);
  }, [warehouses.data, warehouseId]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const allOn = orderable.length > 0 && orderable.every((i) => selected.has(i.variantId));
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(orderable.map((i) => i.variantId)));

  const targetIds = selected.size > 0 ? [...selected] : undefined;
  const run = (dryRun: boolean) =>
    create.mutate(
      { warehouseId: warehouseId || undefined, variantIds: targetIds, dryRun },
      {
        onSuccess: (res) => {
          setResult(res);
          if (!dryRun) {
            setSelected(new Set());
            toast({ title: res.orders.length === 1 ? "Draft purchase order created" : `${res.orders.length} draft purchase orders created`, description: "Review each draft, then approve it to send it to the supplier.", variant: "success" });
          }
        },
        onError: (e) => toast({ title: dryRun ? "Could not preview the orders" : "Could not create the draft orders", description: errorMessage(e), variant: "destructive" }),
      },
    );

  if (query.isLoading) return <TableSkeleton rows={5} label="Loading reorder suggestions" />;
  if (query.isError && !query.data) return <LoadError title="Reorder suggestions could not be loaded." message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  if (items.length === 0) {
    return <StateBox title="Nothing to reorder right now." description="Products appear here when their stock will not cover the days ahead at the current sales speed, after counting what is already on order." />;
  }

  const noWrite = canWrite ? undefined : "You need purchasing permission to do this";
  const scope = selected.size > 0 ? `${selected.size} selected` : `all ${orderable.length} with a supplier`;

  return (
    <div className="space-y-3">
      <div role="toolbar" aria-label="Reorder actions" className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
        <span className="text-xs font-semibold" aria-live="polite">
          {selected.size > 0 ? `${selected.size} selected` : `${items.length} suggestions`}
        </span>
        {(warehouses.data?.length ?? 0) > 1 && (
          <select aria-label="Receive into" className={SELECT} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {(warehouses.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
        <Button type="button" size="sm" variant="outline" className="text-xs" disabled={create.isPending || orderable.length === 0} onClick={() => run(true)}>
          Preview orders
        </Button>
        <Button type="button" size="sm" className="text-xs" disabled={!canWrite || create.isPending || orderable.length === 0} title={noWrite} loading={create.isPending && create.variables?.dryRun === false} onClick={() => run(false)}>
          Create draft orders ({scope})
        </Button>
        {selected.size > 0 && (
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline">
            Clear selection
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground">
                <th scope="col" className="w-10 px-4 py-3">
                  <Checkbox aria-label="Select all suggestions with a supplier" checked={allOn} disabled={orderable.length === 0} onCheckedChange={toggleAll} />
                </th>
                <th scope="col" className="px-4 py-3">Product</th>
                <th scope="col" className="px-4 py-3 text-right">Available</th>
                <th scope="col" className="px-4 py-3 text-right">Sells / day</th>
                <th scope="col" className="px-4 py-3 text-right">Stock cover</th>
                <th scope="col" className="px-4 py-3 text-right">Suggested</th>
                <th scope="col" className="px-4 py-3 text-right">Already on order</th>
                <th scope="col" className="px-4 py-3 text-right">To order</th>
                <th scope="col" className="px-4 py-3">Supplier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((i) => (
                <tr key={i.variantId} className="align-top">
                  <td className="px-4 py-3.5">
                    <Checkbox aria-label={`Select ${i.sku}`} checked={selected.has(i.variantId)} disabled={i.supplier === null} onCheckedChange={() => toggle(i.variantId)} />
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-foreground">{i.title ?? i.sku}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{i.sku}</p>
                  </td>
                  <td className="px-4 py-3.5 text-right">{formatNumber(i.available)}</td>
                  <td className="px-4 py-3.5 text-right">{i.unitsPerDay.toFixed(1)}</td>
                  <td className={`px-4 py-3.5 text-right ${i.daysOfCover !== null && i.daysOfCover < 7 ? "font-semibold text-rose-700" : ""}`}>{cover(i.daysOfCover)}</td>
                  <td className="px-4 py-3.5 text-right">{formatNumber(i.suggestedUnits)}</td>
                  <td className="px-4 py-3.5 text-right text-muted-foreground">{formatNumber(i.onOrderUnits)}</td>
                  <td className="px-4 py-3.5 text-right font-semibold text-foreground">{formatNumber(i.netUnits)}</td>
                  <td className="px-4 py-3.5">
                    {i.supplier ? (
                      <>
                        <p className="font-medium text-foreground">{i.supplier.name}{i.supplier.isPreferred ? " (preferred)" : ""}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatINR(i.supplier.costMinor)} each · MOQ {i.supplier.minOrderQuantity} · {i.supplier.leadTimeDays} days
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] text-amber-700">
                        No supplier sells this yet.{" "}
                        <button type="button" onClick={onOpenSuppliers} className="font-medium underline underline-offset-2">
                          Add it to a price list
                        </button>
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={result !== null} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          {result && (
            <>
              <DialogHeader>
                <DialogTitle>{result.dryRun ? "Preview: orders that would be created" : "Draft purchase orders created"}</DialogTitle>
                <DialogDescription>
                  {result.dryRun ? "Nothing was created. One draft per supplier is made when you confirm." : "They are drafts: approve each one to send it to the supplier and expect the stock."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-xs">
                {result.orders.length === 0 && <p className="text-muted-foreground">No order could be made from this selection.</p>}
                {result.orders.map((o) => (
                  <div key={`${o.supplierId}-${o.id ?? "preview"}`} className="space-y-1 rounded-lg border border-border p-3">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-foreground">{o.supplierName}</span>
                      <span className="font-mono">{formatINR(o.totalMinor)}</span>
                    </div>
                    <p className="text-muted-foreground">
                      {formatNumber(o.lines)} {o.lines === 1 ? "line" : "lines"} · {formatNumber(o.units)} units before GST
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">{o.skus.join(", ")}</p>
                    {o.id && o.poNumber && (
                      <button
                        type="button"
                        className="font-mono font-semibold text-blue-700 hover:underline"
                        onClick={() => {
                          setResult(null);
                          onOpenOrder(o.id as string);
                        }}
                      >
                        Open {o.poNumber}
                      </button>
                    )}
                  </div>
                ))}
                {result.unassigned.length > 0 && (
                  <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    <p className="font-semibold">No supplier for {result.unassigned.length} {result.unassigned.length === 1 ? "product" : "products"}</p>
                    <p className="font-mono text-[11px]">{result.unassigned.map((u) => `${u.sku} (${formatNumber(u.suggestedUnits)})`).join(", ")}</p>
                    <p className="text-[11px]">Add them to a supplier's price list, then reorder again.</p>
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                {result.dryRun && result.orders.length > 0 && canWrite && (
                  <Button type="button" size="sm" loading={create.isPending} onClick={() => run(false)}>
                    Create these drafts
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" onClick={() => setResult(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
