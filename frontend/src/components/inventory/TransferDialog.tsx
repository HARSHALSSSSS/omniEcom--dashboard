import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useTransferNow } from "@/hooks/useInventory";
import { formatNumber } from "@/utils/format";
import type { Warehouse } from "@/types/inventory";
import { InlineError } from "./inventoryUi";
import type { StockTarget } from "./stockTarget";

const SELECT = "h-9 w-full rounded-md border border-input bg-background px-3 text-xs";

interface TransferDialogProps {
  target: StockTarget | null;
  warehouses: Warehouse[];
  onClose: () => void;
}

/** POST /inventory/transfer-now: moves units between two warehouses immediately. Only offered with 2+ warehouses. */
export function TransferDialog({ target, warehouses, onClose }: TransferDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">{target && <TransferForm key={target.variantId} target={target} warehouses={warehouses} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function TransferForm({ target, warehouses, onClose }: { target: StockTarget; warehouses: Warehouse[]; onClose: () => void }) {
  const transfer = useTransferNow();
  const [from, setFrom] = useState(() => warehouses.find((w) => target.locations.some((l) => l.warehouseId === w.id && l.available > 0))?.id ?? warehouses[0]?.id ?? "");
  const [to, setTo] = useState(() => warehouses.find((w) => w.id !== from)?.id ?? "");
  const [qty, setQty] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const availableAtSource = target.locations.find((l) => l.warehouseId === from)?.available ?? 0;
  const n = /^\d+$/.test(qty.trim()) ? Number(qty.trim()) : NaN;
  let qtyError: string | null = null;
  if (qty.trim() !== "") {
    if (!Number.isInteger(n) || n < 1) qtyError = "Enter a whole number of units, 1 or more";
    else if (n > availableAtSource) qtyError = `Only ${formatNumber(availableAtSource)} units are available in the source warehouse`;
  }
  const ready = from !== "" && to !== "" && from !== to && qty.trim() !== "" && !qtyError;

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!ready) return;
    setServerError(null);
    try {
      const res = await transfer.mutateAsync({ variantId: target.variantId, fromWarehouseId: from, toWarehouseId: to, quantity: n });
      toast({ title: "Stock transferred", description: `${res.variant.sku}: ${formatNumber(n)} units moved (${res.transfer.number}).`, variant: "success" });
      onClose();
    } catch (e) {
      setServerError(errorMessage(e, "Could not transfer the stock."));
    }
  };

  const nameOf = (w: Warehouse) => `${w.name}${w.city ? `, ${w.city}` : ""}`;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Transfer Stock: {target.sku}</DialogTitle>
        <DialogDescription>{target.title}</DialogDescription>
      </DialogHeader>

      {serverError && <InlineError message={serverError} />}

      <div className="flex flex-col gap-1">
        <label htmlFor="tr-from" className="text-xs font-semibold">
          From warehouse
        </label>
        <select id="tr-from" value={from} onChange={(e) => {
            setFrom(e.target.value);
            if (e.target.value === to) setTo(warehouses.find((w) => w.id !== e.target.value)?.id ?? "");
          }}
          className={SELECT}
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {nameOf(w)}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground">{formatNumber(availableAtSource)} available here</p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="tr-to" className="text-xs font-semibold">
          To warehouse
        </label>
        <select id="tr-to" value={to} onChange={(e) => setTo(e.target.value)} className={SELECT}>
          {warehouses
            .filter((w) => w.id !== from)
            .map((w) => (
              <option key={w.id} value={w.id}>
                {nameOf(w)}
              </option>
            ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="tr-qty" className="text-xs font-semibold">
          Units
        </label>
        <Input id="tr-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} error={!!qtyError} aria-invalid={!!qtyError} aria-describedby={qtyError ? "tr-qty-error" : undefined} autoComplete="off" className="text-xs" />
        {qtyError && (
          <p id="tr-qty-error" role="alert" className="text-[11px] text-red-700">
            {qtyError}
          </p>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" size="sm" disabled={transfer.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={transfer.isPending} disabled={!ready}>
          Transfer Stock
        </Button>
      </DialogFooter>
    </form>
  );
}
