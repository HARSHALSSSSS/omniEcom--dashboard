import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/useToast";
import { useQuickAdjust, useWarehouses } from "@/hooks/useVariants";
import { errorMessage } from "@/api/errors";
import type { StockReason, VariantGridItem } from "@/types/variants";
import { formatNumber } from "@/utils/format";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

export type StockMode = "adjust" | "receive";

const REASONS: { value: StockReason; label: string; sign: "both" | "plus" | "minus" }[] = [
  { value: "audit_correction", label: "Stock count correction", sign: "both" },
  { value: "manual_addition", label: "Add stock (received)", sign: "plus" },
  { value: "damaged", label: "Damaged", sign: "minus" },
  { value: "shrinkage", label: "Loss / shrinkage", sign: "minus" },
];

interface Props {
  productId: string;
  variant: VariantGridItem | null;
  mode: StockMode;
  onClose: () => void;
}

/** quick stock change of one variant: POST /inventory/quick-adjust (receive = manual_addition). Needs inventory:write. */
export function StockDialog({ productId, variant, mode, onClose }: Props) {
  return (
    <Dialog open={variant !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {variant && <StockForm key={`${variant.id}:${mode}`} productId={productId} variant={variant} mode={mode} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function StockForm({ productId, variant, mode, onClose }: { productId: string; variant: VariantGridItem; mode: StockMode; onClose: () => void }) {
  const warehouses = useWarehouses(true);
  const adjust = useQuickAdjust(productId);
  const [reason, setReason] = useState<StockReason>(mode === "receive" ? "manual_addition" : "audit_correction");
  const [direction, setDirection] = useState<"plus" | "minus">("plus");
  const [qty, setQty] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  // one key per dialog: a retry after a network blip never moves the stock twice
  const key = useMemo(() => `variants-ui-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`, []);

  const ruleSign = REASONS.find((r) => r.value === reason)?.sign ?? "both";
  const sign = ruleSign === "both" ? direction : ruleSign;
  const n = /^\d+$/.test(qty.trim()) ? Number(qty.trim()) : NaN;
  let qtyError: string | null = null;
  if (qty.trim() !== "") {
    if (!Number.isInteger(n) || n < 1) qtyError = "Enter a whole number of units, 1 or more";
    else if (n > 10_000_000) qtyError = "That is too many units";
    else if (sign === "minus" && n > variant.stock.available) qtyError = `Only ${formatNumber(variant.stock.available)} units are available to remove`;
  }
  const ready = qty.trim() !== "" && !qtyError;
  const delta = ready ? (sign === "minus" ? -n : n) : 0;
  const reasons = mode === "receive" ? REASONS.filter((r) => r.value === "manual_addition") : REASONS;

  const acquire = useSubmitLock();
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!ready) return;
    setServerError(null);
    const release = acquire();
    if (!release) return;
    try {
      const res = await adjust.mutateAsync({ variantId: variant.id, reason, quantityDelta: delta, warehouseId: warehouseId || undefined, notes: notes.trim() || undefined, idempotencyKey: key });
      toast({ title: mode === "receive" ? "Stock received" : "Stock adjusted", description: `${variant.sku}: ${formatNumber(res.result.newAvailable)} available in ${res.warehouse.name}.`, variant: "success" });
      onClose();
    } catch (e) {
      setServerError(errorMessage(e, "Could not change the stock."));
    } finally {
      release();
    }
  };

  const title = mode === "receive" ? "Receive stock" : "Adjust stock";
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {variant.name} ({variant.sku}): {formatNumber(variant.stock.available)} available now, low stock at {formatNumber(variant.stock.threshold)} or fewer.
        </DialogDescription>
      </DialogHeader>

      {serverError && (
        <p role="alert" className="rounded-lg border border-[#F2B8B5] bg-[#FDE7E7] p-3 text-[12px] text-[#B42318]">
          {serverError}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="sd-warehouse" className="text-[12px] font-medium">
          Warehouse
        </label>
        <select id="sd-warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="">Default warehouse</option>
          {(warehouses.data ?? []).map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      {mode === "adjust" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="sd-reason" className="text-[12px] font-medium">
            Reason
          </label>
          <select id="sd-reason" value={reason} onChange={(e) => setReason(e.target.value as StockReason)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            {reasons.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "adjust" && ruleSign === "both" && (
        <fieldset className="flex gap-4 text-[12px]">
          <legend className="text-[12px] font-medium mb-1">Direction</legend>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="sd-dir" checked={direction === "plus"} onChange={() => setDirection("plus")} /> Add units
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="sd-dir" checked={direction === "minus"} onChange={() => setDirection("minus")} /> Remove units
          </label>
        </fieldset>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="sd-qty" className="text-[12px] font-medium">
          Units
        </label>
        <Input id="sd-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} error={!!qtyError} aria-invalid={!!qtyError} aria-describedby={qtyError ? "sd-qty-error" : undefined} autoComplete="off" />
        {qtyError ? (
          <p id="sd-qty-error" role="alert" className="text-[11px] text-[#B42318]">
            {qtyError}
          </p>
        ) : (
          ready && <p className="text-[11px] text-[#666666]">Available after: {formatNumber(variant.stock.available + delta)}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sd-notes" className="text-[12px] font-medium">
          Note (optional)
        </label>
        <Input id="sd-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" disabled={adjust.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={adjust.isPending} disabled={!ready}>
          {title}
        </Button>
      </DialogFooter>
    </form>
  );
}
