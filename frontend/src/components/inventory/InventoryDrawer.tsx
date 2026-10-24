import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightLeft, ArrowUpRight, History, SlidersHorizontal } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, isApiError } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useAllocations, useSetReorderLevel, useVariantPanel, useVariantStock } from "@/hooks/useInventory";
import { formatInZone, formatNumber, formatRelativeTime } from "@/utils/format";
import type { LedgerRow, VariantPanel, Warehouse } from "@/types/inventory";
import { AdjustPanel } from "./AdjustPanel";
import { InlineError, InventoryThumb } from "./inventoryUi";
import { HEALTH_ICON, HEALTH_LABEL, NO_WRITE_REASON, ONE_WAREHOUSE_REASON, TONE_HEX, TONE_OF_HEALTH } from "./inventoryLabels";
import { targetOfPanel, type StockTarget } from "./stockTarget";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

const RULE = "h-[1px] w-full bg-[#EAEAEA]";
const H4 = "text-[13px] font-semibold text-[#000000]";

function ReorderLevel({ variantId, warehouseId, current, canWrite }: { variantId: string; warehouseId: string; current: number | null; canWrite: boolean }) {
  const save = useSetReorderLevel();
  const [value, setValue] = useState(current === null ? "" : String(current));
  const [error, setError] = useState<string | null>(null);
  const valid = value.trim() === "" || /^\d{1,9}$/.test(value.trim());
  const dirty = value.trim() !== (current === null ? "" : String(current));

  const acquire = useSubmitLock();
  const onSave = async () => {
    const release = acquire();
    if (!release) return;
    setError(null);
    try {
      await save.mutateAsync({ variantId, warehouseId, reorderLevel: value.trim() === "" ? null : Number(value.trim()) });
      toast({ title: "Reorder level saved", variant: "success" });
    } catch (e) {
      setError(errorMessage(e, "Could not save the reorder level."));
    } finally {
      release();
    }
  };

  return (
    <div className="mt-1 flex items-center gap-2">
      <label htmlFor={`rl-${warehouseId}`} className="text-[11px] text-[#666666]">
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

interface ContextProps {
  variantId: string;
  canWrite: boolean;
  multiWarehouse: boolean;
  onAdjust: (target: StockTarget) => void;
  onTransfer: (target: StockTarget) => void;
}

function Context({ variantId, canWrite, multiWarehouse, onAdjust, onTransfer }: ContextProps) {
  const panel = useVariantPanel(variantId);
  const stock = useVariantStock(variantId);
  const allocations = useAllocations([variantId]);
  const data = panel.data;

  const notFound = panel.isError && isApiError(panel.error) && panel.error.status === 404;
  const title = data?.product.title ?? (panel.isError ? "Stock details" : "Loading...");

  return (
    <>
      <div className="box-border flex w-full shrink-0 flex-col items-start gap-1 border-b border-[#EAEAEA] px-5 py-4 pr-12">
        <span className="text-[10px] font-normal uppercase tracking-wide text-[#666666]">INVENTORY / PRODUCT CONTEXT</span>
        <SheetTitle className="m-0 w-full truncate text-[22px] font-semibold leading-tight text-[#000000]">{title}</SheetTitle>
        <SheetDescription className="sr-only">{data ? `SKU: ${data.product.sku}` : "Stock details of the product"}</SheetDescription>
      </div>

      <div className="flex w-full flex-1 flex-col items-start overflow-y-auto overflow-x-hidden">
        <div className="box-border flex w-full flex-col items-start gap-4 px-5 py-4 text-xs">
          {panel.isPending && (
            <div className="w-full space-y-3" role="status" aria-label="Loading stock details">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {panel.isError && (
            <div className="w-full space-y-3">
              <InlineError message={notFound ? "This item could not be found. It may have been removed." : `The stock details could not be loaded. ${errorMessage(panel.error)}`} />
              {!notFound && (
                <Button variant="outline" size="sm" onClick={() => void panel.refetch()}>
                  Retry
                </Button>
              )}
            </div>
          )}
          {data && (
            <>
              <div className="flex w-full flex-row items-center gap-3">
                <InventoryThumb url={data.product.thumbnailUrl} title={data.product.title} size={48} className="rounded-[6px]" />
                <div className="flex min-w-0 flex-col items-start">
                  <span className="w-full truncate text-[13px] font-semibold leading-snug text-[#000000]">{data.product.title}</span>
                  <span className="mt-0.5 text-[11px] font-normal text-[#666666]">{data.product.sku}</span>
                </div>
              </div>

              <div className="flex w-full flex-col items-start gap-2">
                <span className={H4}>Stock snapshot</span>
                <div className="grid w-full grid-cols-3 gap-2">
                  {(
                    [
                      ["Available", data.snapshot.available],
                      ["Reserved", data.snapshot.reserved],
                      ["Incoming", data.snapshot.incoming],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex flex-col items-start">
                      <span className="text-[11px] font-normal text-[#666666]">{label}</span>
                      <span className="text-[22px] font-semibold leading-tight text-[#000000]">{formatNumber(value)}</span>
                    </div>
                  ))}
                </div>
                <div className="grid w-full grid-cols-4 gap-2 pt-1">
                  {(
                    [
                      ["On hand", data.snapshot.onHand],
                      ["Returned", data.snapshot.returned],
                      ["Damaged", data.snapshot.damaged],
                      ["Quarantined", data.snapshot.quarantined],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex flex-col items-start">
                      <span className="text-[11px] font-normal text-[#666666]">{label}</span>
                      <span className="text-[12px] font-semibold text-[#000000]">{formatNumber(value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={RULE} />

              <section className="flex w-full flex-col items-start gap-1" aria-label="Inventory by location">
                <span className={`${H4} mb-0.5`}>Inventory by location</span>
                {data.byLocation.length === 0 && <p className="m-0 text-[#666666]">This item is not stocked in any warehouse yet.</p>}
                {data.byLocation.map((wh) => (
                  <div key={wh.warehouseId} className="w-full py-0.5">
                    <div className="flex h-6 w-full flex-row items-center justify-between text-[12px]">
                      <span className="font-normal text-[#666666]">
                        {wh.name} <span className="font-mono text-[10px]">{wh.code}</span>
                      </span>
                      <span className="font-semibold text-[#000000]">{formatNumber(wh.available)}</span>
                    </div>
                    <p className="m-0 text-[11px] text-[#737373]">
                      Reserved: {formatNumber(wh.reserved)} · On hand: {formatNumber(wh.onHand)}
                    </p>
                    {stock.isPending ? (
                      <Skeleton className="mt-2 h-7 w-48" />
                    ) : (
                      stock.data && (
                        <ReorderLevel
                          key={`${wh.warehouseId}:${stock.data.warehouses.find((s) => s.warehouseId === wh.warehouseId)?.version ?? 0}`}
                          variantId={data.product.variantId}
                          warehouseId={wh.warehouseId}
                          current={stock.data.warehouses.find((s) => s.warehouseId === wh.warehouseId)?.reorderLevel ?? null}
                          canWrite={canWrite}
                        />
                      )
                    )}
                  </div>
                ))}
              </section>

              <div className={RULE} />

              <section className="flex w-full flex-col items-start gap-1" aria-label="Channel availability">
                <span className={`${H4} mb-0.5`}>Channel availability</span>
                {data.channelAvailability.length === 0 && <p className="m-0 text-[#666666]">Not listed on any channel.</p>}
                {data.channelAvailability.map((c) => {
                  const alloc = allocations.data?.[0]?.channels.find((a) => a.listingId === c.listingId);
                  const qty = alloc ? formatNumber(alloc.allocated) : c.quantity === null ? "—" : formatNumber(c.quantity);
                  const status = c.status === "failed" ? { label: "Failed", color: TONE_HEX.bad } : c.status === "syncing" ? { label: "Syncing", color: TONE_HEX.warn } : { label: "Synced", color: TONE_HEX.good };
                  return (
                    <div key={c.listingId} className="w-full py-0.5">
                      <div className="flex min-h-6 w-full flex-row items-center justify-between text-[12px]">
                        <span className="font-normal text-[#666666]">{alloc?.channel.accountName ?? c.channel.name}</span>
                        <span className="flex items-center gap-2">
                          <span style={{ color: status.color }} className="text-[11px] font-medium">
                            {status.label}
                          </span>
                          <span className="font-semibold text-[#000000]">{qty}</span>
                        </span>
                      </div>
                      {c.lastError && <p className="m-0 text-[11px] text-red-700">{c.lastError}</p>}
                      {alloc?.mode === "paused" && <p className="m-0 text-[11px] text-[#737373]">Sync paused</p>}
                    </div>
                  );
                })}
              </section>

              <div className={RULE} />

              <section className="flex w-full flex-col items-start gap-1" aria-label="Health">
                {(() => {
                  const Icon = HEALTH_ICON[data.health.state];
                  const color = TONE_HEX[TONE_OF_HEALTH[data.health.state]];
                  return (
                    <div className="flex w-full flex-row items-center justify-between">
                      <span className={H4}>Health</span>
                      <div className="flex flex-row items-center gap-1.5">
                        <Icon style={{ color }} className="h-3.5 w-3.5 stroke-[2px]" aria-hidden />
                        <span style={{ color }} className="text-[11px] font-normal">
                          {HEALTH_LABEL[data.health.state]}
                        </span>
                      </div>
                    </div>
                  );
                })()}
                <span className="text-[12px] font-normal leading-snug text-[#444444]">{data.health.text}</span>
                <dl className="m-0 mt-2 flex w-full flex-col gap-1 text-[12px]">
                  {(
                    [
                      ["Days of coverage", data.metrics.coverDays === null ? "No sales data" : `${formatNumber(Math.round(data.metrics.coverDays * 10) / 10)} days`],
                      ["Units sold per day", `${formatNumber(Math.round(data.metrics.unitsPerDay * 100) / 100)} (last ${data.metrics.windowDays} days)`],
                      ["Lead time", `${data.metrics.leadTimeDays} days`],
                      ["Low stock at", data.metrics.lowStockThreshold === null ? "Not set" : `${formatNumber(data.metrics.lowStockThreshold)} units`],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <dt className="text-[#666666]">{label}</dt>
                      <dd className="m-0 font-semibold text-[#000000]">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <div className={RULE} />

              <section className="flex w-full flex-col items-start gap-2" aria-label="Recent movements">
                <span className={H4}>Recent movements</span>
                {data.recentMovements.length === 0 && <p className="m-0 text-[#666666]">No movements yet.</p>}
                {data.recentMovements.map((m, i) => (
                  <div key={`${m.at}-${i}`} className="flex w-full flex-row items-start gap-2.5">
                    <SlidersHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0 stroke-[1.5px] text-[#666666]" aria-hidden />
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-[10px] font-normal text-[#737373]" title={formatRelativeTime(m.at)}>
                        {formatInZone(m.at, { hour: "2-digit", minute: "2-digit", hour12: false })} · {formatRelativeTime(m.at)}
                      </span>
                      <span className="text-[12px] font-normal text-[#111111]">{m.text}</span>
                      {m.detail && <span className="text-[12px] font-semibold text-[#111111]">{m.detail}</span>}
                    </div>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </div>

      {data && <ContextActions panel={data} canWrite={canWrite} multiWarehouse={multiWarehouse} onAdjust={onAdjust} onTransfer={onTransfer} />}
    </>
  );
}

function ContextActions({ panel, canWrite, multiWarehouse, onAdjust, onTransfer }: { panel: VariantPanel } & Pick<ContextProps, "canWrite" | "multiWarehouse" | "onAdjust" | "onTransfer">) {
  const adjust = panel.actions.find((a) => a.key === "adjust_stock");
  const transfer = panel.actions.find((a) => a.key === "transfer");
  const adjustOff = !canWrite || adjust?.enabled === false;
  const transferOff = !canWrite || !multiWarehouse || transfer?.enabled === false;
  const transferReason = !canWrite ? NO_WRITE_REASON : !multiWarehouse ? ONE_WAREHOUSE_REASON : (transfer?.disabledReason ?? undefined);
  const target = targetOfPanel(panel);
  return (
    <div className="box-border flex w-full shrink-0 flex-col items-start gap-3 border-t border-[#EAEAEA] bg-white px-5 pb-6 pt-3.5">
      <div className="flex w-full flex-row items-center gap-2">
        <span className="block flex-1" title={adjustOff ? (adjust?.disabledReason ?? NO_WRITE_REASON) : undefined}>
          <button
            type="button"
            disabled={adjustOff}
            onClick={() => onAdjust(target)}
            className="flex h-[38px] w-full cursor-pointer flex-row items-center justify-center gap-2 rounded-lg border border-black bg-black px-3 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 stroke-[1.5px]" aria-hidden />
            <span className="text-[12px] font-semibold">Adjust stock</span>
          </button>
        </span>
        <span className="block flex-1" title={transferOff ? transferReason : undefined}>
          <button
            type="button"
            disabled={transferOff}
            onClick={() => onTransfer(target)}
            className="flex h-[38px] w-full cursor-pointer flex-row items-center justify-center gap-2 rounded-lg border border-[#EAEAEA] bg-white px-3 text-black transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowRightLeft className="h-3.5 w-3.5 stroke-[1.5px] text-[#666666]" aria-hidden />
            <span className="text-[12px] font-normal">Transfer</span>
          </button>
        </span>
      </div>
      <div className="flex w-full flex-row items-center justify-between pt-1 text-[12px]">
        <Link to={`/products/${panel.product.productId}`} className="flex flex-row items-center gap-1.5 text-black hover:underline">
          <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.5px] text-[#666666]" aria-hidden />
          <span>View product</span>
        </Link>
        <Link to={ROUTES.MARKETPLACE_HUB_HEALTH} className="flex flex-row items-center gap-1.5 text-black hover:underline">
          <History className="h-3.5 w-3.5 stroke-[1.5px] text-[#666666]" aria-hidden />
          <span>View sync history</span>
        </Link>
      </div>
    </div>
  );
}

interface InventoryDrawerProps {
  /** the variant whose context is open (`?drawer=variant:<id>`) */
  variantId: string | null;
  /** the Adjust stock form replaces the context while it is open */
  adjustOpen: boolean;
  adjustTarget: StockTarget | null;
  warehouses: Warehouse[];
  canWrite: boolean;
  multiWarehouse: boolean;
  onClose: () => void;
  onAdjust: (target: StockTarget) => void;
  onTransfer: (target: StockTarget) => void;
  onPickAdjust: (row: LedgerRow) => void;
  onAdjustCancel: () => void;
  onAdjustDone: () => void;
}

/** the side drawer of the Inventory screen: product context, and the Adjust stock form in place of it */
export function InventoryDrawer({ variantId, adjustOpen, adjustTarget, warehouses, canWrite, multiWarehouse, onClose, onAdjust, onTransfer, onPickAdjust, onAdjustCancel, onAdjustDone }: InventoryDrawerProps) {
  const open = variantId !== null || adjustOpen;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-[420px] max-w-full flex-col gap-0 overflow-hidden border-[#EAEAEA] bg-white p-0 shadow-[-6px_0_20px_rgba(0,0,0,0.03)]">
        {adjustOpen ? (
          <AdjustPanel target={adjustTarget} warehouses={warehouses} onPick={onPickAdjust} onCancel={onAdjustCancel} onDone={onAdjustDone} />
        ) : (
          variantId !== null && <Context key={variantId} variantId={variantId} canWrite={canWrite} multiWarehouse={multiWarehouse} onAdjust={onAdjust} onTransfer={onTransfer} />
        )}
      </SheetContent>
    </Sheet>
  );
}
