import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useQuickAdjust } from "@/hooks/useInventory";
import { formatNumber } from "@/utils/format";
import type { AdjustReason, Warehouse } from "@/types/inventory";
import { InlineError } from "./inventoryUi";
import { REASON_LABEL } from "./inventoryLabels";
import type { StockTarget } from "./stockTarget";

const REASONS: Array<{ value: AdjustReason; sign: "both" | "plus" | "minus" }> = [
  { value: "audit_correction", sign: "both" },
  { value: "damaged", sign: "minus" },
  { value: "shrinkage", sign: "minus" },
  { value: "manual_addition", sign: "plus" },
];

const SELECT = "h-9 w-full rounded-md border border-input bg-background px-3 text-xs";

interface AdjustDialogProps {
  target: StockTarget | null;
  warehouses: Warehouse[];
  onClose: () => void;
}

/** POST /inventory/quick-adjust: one ledger movement in one warehouse. Needs inventory:write. */
export function AdjustDialog({ target, warehouses, onClose }: AdjustDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">{target && <AdjustForm key={target.variantId} target={target} warehouses={warehouses} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function AdjustForm({ target, warehouses, onClose }: { target: StockTarget; warehouses: Warehouse[]; onClose: () => void }) {
  const adjust = useQuickAdjust();
  const [warehouseId, setWarehouseId] = useState(() => {
    const stocked = target.locations.find((l) => l.available > 0)?.warehouseId;
    return warehouses.find((w) => w.id === stocked)?.id ?? warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? "";
  });
  const [reason, setReason] = useState<AdjustReason>("audit_correction");
  const [direction, setDirection] = useState<"plus" | "minus">("plus");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  // one key per dialog: a retry after a network blip never moves the stock twice
  const key = useMemo(() => `inventory-ui-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`, []);

  const ruleSign = REASONS.find((r) => r.value === reason)?.sign ?? "both";
  const sign = ruleSign === "both" ? direction : ruleSign;
  const here = target.locations.find((l) => l.warehouseId === warehouseId);
  const availableHere = here?.available ?? 0;
  const n = /^\d+$/.test(qty.trim()) ? Number(qty.trim()) : NaN;
  let qtyError: string | null = null;
  if (qty.trim() !== "") {
    if (!Number.isInteger(n) || n < 1) qtyError = "Enter a whole number of units, 1 or more";
    else if (n > 10_000_000) qtyError = "That is too many units";
    else if (sign === "minus" && n > availableHere) qtyError = `Only ${formatNumber(availableHere)} units are available to remove in this warehouse`;
  }
  const ready = warehouseId !== "" && qty.trim() !== "" && !qtyError;
  const delta = ready ? (sign === "minus" ? -n : n) : 0;

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!ready) return;
    setServerError(null);
    try {
      const res = await adjust.mutateAsync({ variantId: target.variantId, warehouseId, reason, quantityDelta: delta, notes: notes.trim() || undefined, idempotencyKey: key });
      toast({
        title: res.duplicate ? "Already applied" : "Stock adjusted",
        description: `${res.variant.sku}: ${formatNumber(res.result.newAvailable)} available in ${res.warehouse.name}.`,
        variant: "success",
      });
      onClose();
    } catch (e) {
      // 409 (below what is reserved / would go negative) and 400 come back with a readable message
      setServerError(errorMessage(e, "Could not change the stock."));
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Adjust Stock: {target.sku}</DialogTitle>
        <DialogDescription>{target.title}</DialogDescription>
      </DialogHeader>

      <div className="flex justify-between rounded-lg border border-border bg-muted/20 p-3 text-xs">
        <span>Current Available:</span>
        <span className="font-mono font-bold">{formatNumber(target.available)} units</span>
      </div>

      {serverError && <InlineError message={serverError} />}

      <div className="flex flex-col gap-1">
        <label htmlFor="adj-warehouse" className="text-xs font-semibold">
          Warehouse
        </label>
        <select id="adj-warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={warehouses.length <= 1} className={SELECT}>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {w.city ? `, ${w.city}` : ""}
            </option>
          ))}
        </select>
        {warehouses.length > 0 && here && <p className="text-[11px] text-muted-foreground">{formatNumber(availableHere)} available here</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="adj-reason" className="text-xs font-semibold">
          Reason for adjustment
        </label>
        <select id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value as AdjustReason)} className={SELECT}>
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {REASON_LABEL[r.value]}
            </option>
          ))}
        </select>
      </div>

      {ruleSign === "both" && (
        <fieldset className="flex gap-4 text-xs">
          <legend className="mb-1 text-xs font-semibold">Direction</legend>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="adj-dir" checked={direction === "plus"} onChange={() => setDirection("plus")} /> Add units
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="adj-dir" checked={direction === "minus"} onChange={() => setDirection("minus")} /> Remove units
          </label>
        </fieldset>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="adj-qty" className="text-xs font-semibold">
          Units
        </label>
        <Input id="adj-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} error={!!qtyError} aria-invalid={!!qtyError} aria-describedby={qtyError ? "adj-qty-error" : undefined} autoComplete="off" className="text-xs" />
        {qtyError ? (
          <p id="adj-qty-error" role="alert" className="text-[11px] text-red-700">
            {qtyError}
          </p>
        ) : (
          ready && <p className="text-[11px] text-muted-foreground">Available here after: {formatNumber(availableHere + delta)}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="adj-notes" className="text-xs font-semibold">
          Note (optional)
        </label>
        <Input id="adj-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className="text-xs" />
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" size="sm" disabled={adjust.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={adjust.isPending} disabled={!ready}>
          Apply Adjustment
        </Button>
      </DialogFooter>
    </form>
  );
}
