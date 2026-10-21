import { useState } from "react";
import { Link } from "react-router-dom";
import { ContextDrawer } from "@/components/common/ContextDrawer";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, isApiError } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useAllocations, useSetReorderLevel, useVariantPanel, useVariantStock } from "@/hooks/useInventory";
import { formatNumber, formatRelativeTime } from "@/utils/format";
import type { VariantPanel } from "@/types/inventory";
import { InlineError, InventoryThumb, Pill } from "./inventoryUi";
import { HEALTH_LABEL, NO_WRITE_REASON, TONE_OF_HEALTH } from "./inventoryLabels";
import { targetOfPanel, type StockTarget } from "./stockTarget";

const H4 = "text-[11px] font-semibold uppercase tracking-wider text-foreground";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

function ReorderLevel({ variantId, warehouseId, current, canWrite }: { variantId: string; warehouseId: string; current: number | null; canWrite: boolean }) {
  const save = useSetReorderLevel();
  const [value, setValue] = useState(current === null ? "" : String(current));
  const [error, setError] = useState<string | null>(null);
  const valid = value.trim() === "" || /^\d{1,9}$/.test(value.trim());
  const dirty = value.trim() !== (current === null ? "" : String(current));

  const onSave = async () => {
    setError(null);
    try {
      await save.mutateAsync({ variantId, warehouseId, reorderLevel: value.trim() === "" ? null : Number(value.trim()) });
      toast({ title: "Reorder level saved", variant: "success" });
    } catch (e) {
      setError(errorMessage(e, "Could not save the reorder level."));
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      <label htmlFor={`rl-${warehouseId}`} className="text-[11px] text-muted-foreground">
        Reorder level
      </label>
      <Input
        id={`rl-${warehouseId}`}
        inputMode="numeric"
        placeholder="Not set"
        value={value}
        disabled={!canWrite}
        title={canWrite ? undefined : NO_WRITE_REASON}
        error={!valid}
        aria-invalid={!valid}
        onChange={(e) => setValue(e.target.value)}
        className="h-7 w-20 text-xs"
      />
      {canWrite && (
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!valid || !dirty} loading={save.isPending} onClick={onSave}>
          Save
        </Button>
      )}
      {error && (
        <span role="alert" className="text-[11px] text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}

interface InventoryDrawerProps {
  variantId: string | null;
  onClose: () => void;
  canWrite: boolean;
  multiWarehouse: boolean;
  onAdjust: (target: StockTarget) => void;
  onTransfer: (target: StockTarget) => void;
}

export function InventoryDrawer({ variantId, onClose, canWrite, multiWarehouse, onAdjust, onTransfer }: InventoryDrawerProps) {
  const panel = useVariantPanel(variantId);
  const stock = useVariantStock(variantId);
  const allocations = useAllocations(variantId ? [variantId] : []);
  const data = panel.data;

  const notFound = panel.isError && isApiError(panel.error) && panel.error.status === 404;
  const title = data?.product.title ?? (panel.isError ? "Stock details" : "Loading...");

  return (
    <ContextDrawer
      open={variantId !== null}
      onClose={onClose}
      title={title}
      description={data ? `SKU: ${data.product.sku}` : undefined}
      footer={data && <DrawerActions panel={data} canWrite={canWrite} multiWarehouse={multiWarehouse} onAdjust={onAdjust} onTransfer={onTransfer} />}
    >
      {panel.isPending && variantId !== null && (
        <div className="space-y-3" role="status" aria-label="Loading stock details">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {panel.isError && (
        <div className="space-y-3">
          <InlineError message={notFound ? "This item could not be found. It may have been removed." : `The stock details could not be loaded. ${errorMessage(panel.error)}`} />
          {!notFound && (
            <Button variant="outline" size="sm" onClick={() => void panel.refetch()}>
              Retry
            </Button>
          )}
        </div>
      )}
      {data && (
        <div className="space-y-6 text-xs">
          <div className="flex items-center gap-3">
            <InventoryThumb url={data.product.thumbnailUrl} title={data.product.title} size={56} />
            <div className="space-y-1">
              <Pill tone={TONE_OF_HEALTH[data.health.state]}>{HEALTH_LABEL[data.health.state]}</Pill>
              <p className="text-muted-foreground">{data.health.text}</p>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
            <Stat label="Total Available" value={`${formatNumber(data.snapshot.available)} units`} />
            <Stat label="Total Reserved" value={`${formatNumber(data.snapshot.reserved)} units`} />
            <Stat label="On Hand Physical" value={`${formatNumber(data.snapshot.onHand)} units`} />
            <Stat label="Incoming" value={`${formatNumber(data.snapshot.incoming)} units`} />
            <Stat label="Returned" value={`${formatNumber(data.snapshot.returned)} units`} />
            <Stat label="Damaged" value={`${formatNumber(data.snapshot.damaged)} units`} />
            <Stat label="Quarantined" value={`${formatNumber(data.snapshot.quarantined)} units`} />
          </div>

          <div className="space-y-2 rounded-lg border border-border p-4">
            <Stat label="Days of Coverage" value={data.metrics.coverDays === null ? "No sales data" : `${formatNumber(Math.round(data.metrics.coverDays * 10) / 10)} days`} />
            <Stat label="Units sold per day" value={`${formatNumber(Math.round(data.metrics.unitsPerDay * 100) / 100)} (last ${data.metrics.windowDays} days)`} />
            <Stat label="Lead time" value={`${data.metrics.leadTimeDays} days`} />
            <Stat label="Low stock at" value={data.metrics.lowStockThreshold === null ? "Not set" : `${formatNumber(data.metrics.lowStockThreshold)} units`} />
          </div>

          <section className="space-y-3" aria-label="Warehouse allocation">
            <h4 className={H4}>Warehouse Allocation</h4>
            {data.byLocation.length === 0 && <p className="text-muted-foreground">This item is not stocked in any warehouse yet.</p>}
            {data.byLocation.map((wh) => (
              <div key={wh.warehouseId} className="space-y-1 rounded-lg border border-border p-3">
                <p className="font-semibold text-foreground">
                  {wh.name} <span className="font-mono text-[11px] font-normal text-muted-foreground">{wh.code}</span>
                </p>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Available: {formatNumber(wh.available)}</span>
                  <span>Reserved: {formatNumber(wh.reserved)}</span>
                  <span>On hand: {formatNumber(wh.onHand)}</span>
                </div>
                {stock.isPending ? (
                  <Skeleton className="mt-2 h-7 w-48" />
                ) : (
                  stock.data && <ReorderLevel key={`${wh.warehouseId}:${stock.data.warehouses.find((s) => s.warehouseId === wh.warehouseId)?.version ?? 0}`} variantId={data.product.variantId} warehouseId={wh.warehouseId} current={stock.data.warehouses.find((s) => s.warehouseId === wh.warehouseId)?.reorderLevel ?? null} canWrite={canWrite} />
                )}
              </div>
            ))}
          </section>

          <section className="space-y-3" aria-label="Channel availability">
            <h4 className={H4}>Active Channel Reserves</h4>
            {data.channelAvailability.length === 0 && <p className="text-muted-foreground">Not listed on any channel.</p>}
            <div className="grid grid-cols-2 gap-2">
              {data.channelAvailability.map((c) => {
                const alloc = allocations.data?.[0]?.channels.find((a) => a.listingId === c.listingId);
                return (
                  <div key={c.listingId} className="space-y-1 rounded border border-border p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">{alloc?.channel.accountName ?? c.channel.name}</p>
                    <p className="font-mono font-bold text-foreground">{alloc ? formatNumber(alloc.allocated) : c.quantity === null ? "—" : formatNumber(c.quantity)}</p>
                    <Pill tone={c.status === "failed" ? "bad" : c.status === "syncing" ? "warn" : "good"}>{c.status === "failed" ? "Failed" : c.status === "syncing" ? "Syncing" : "Synced"}</Pill>
                    {c.lastError && <p className="text-[10px] text-red-700">{c.lastError}</p>}
                    {alloc?.mode === "paused" && <p className="text-[10px] text-muted-foreground">Sync paused</p>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-2" aria-label="Recent movements">
            <h4 className={H4}>Recent Movements</h4>
            {data.recentMovements.length === 0 && <p className="text-muted-foreground">No movements yet.</p>}
            <ul className="divide-y divide-border rounded-lg border border-border">
              {data.recentMovements.map((m, i) => (
                <li key={`${m.at}-${i}`} className="p-2.5">
                  <p className="text-foreground">{m.text}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatRelativeTime(m.at)}
                    {m.detail ? ` · ${m.detail}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </ContextDrawer>
  );
}

function DrawerActions({ panel, canWrite, multiWarehouse, onAdjust, onTransfer }: { panel: VariantPanel } & Pick<InventoryDrawerProps, "canWrite" | "multiWarehouse" | "onAdjust" | "onTransfer">) {
  const adjust = panel.actions.find((a) => a.key === "adjust_stock");
  const transfer = panel.actions.find((a) => a.key === "transfer");
  const adjustOff = !canWrite || adjust?.enabled === false;
  const transferOff = !canWrite || transfer?.enabled === false;
  const target = targetOfPanel(panel);
  return (
    <div className="flex w-full flex-col gap-2">
      <span className="block" title={adjustOff ? (adjust?.disabledReason ?? NO_WRITE_REASON) : undefined}>
        <Button className="w-full bg-primary text-xs text-primary-foreground hover:bg-primary/90" disabled={adjustOff} onClick={() => onAdjust(target)}>
          Adjust Available Stock
        </Button>
      </span>
      {multiWarehouse && (
        <span className="block" title={transferOff ? (transfer?.disabledReason ?? NO_WRITE_REASON) : undefined}>
          <Button variant="outline" className="w-full text-xs" disabled={transferOff} onClick={() => onTransfer(target)}>
            Transfer Between Warehouses
          </Button>
        </span>
      )}
      <Link to={`/products/${panel.product.productId}`} className={buttonVariants({ variant: "ghost", className: "w-full text-xs" })}>
        View product
      </Link>
    </div>
  );
}
