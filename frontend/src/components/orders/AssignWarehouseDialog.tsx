import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWarehouseOptions } from "@/hooks/useOrders";

interface AssignWarehouseDialogProps {
  open: boolean;
  count: number;
  busy: boolean;
  onConfirm: (warehouseId: string) => void;
  onClose: () => void;
}

/** moves the selected orders (new or confirmed, not yet in fulfillment) to another warehouse */
export function AssignWarehouseDialog({ open, count, busy, onConfirm, onClose }: AssignWarehouseDialogProps) {
  const { data: warehouses = [], isLoading, isError } = useWarehouseOptions(open);
  const [id, setId] = useState("");
  useEffect(() => {
    if (open) setId("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign warehouse</DialogTitle>
          <DialogDescription>
            Move {count} {count === 1 ? "order" : "orders"} to another warehouse. Stock reservations move with them. Orders already in fulfillment cannot be moved.
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-1 text-xs">
          <span className="font-semibold text-foreground">Warehouse</span>
          <select aria-label="Warehouse" value={id} onChange={(e) => setId(e.target.value)} disabled={isLoading || isError} className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs">
            <option value="">{isLoading ? "Loading warehouses..." : isError ? "Warehouses could not be loaded" : "Choose a warehouse"}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code}){w.isDefault ? " - default" : ""}
              </option>
            ))}
          </select>
        </label>
        <DialogFooter className="mt-2 gap-2">
          <Button variant="outline" size="sm" className="text-xs" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" className="text-xs" disabled={!id || busy} onClick={() => onConfirm(id)}>
            {busy ? "Assigning..." : "Assign warehouse"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
