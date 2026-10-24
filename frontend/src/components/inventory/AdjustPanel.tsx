import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { errorMessage } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useAdjustStock, useAdjustmentPreview } from "@/hooks/useInventory";
import { formatNumber } from "@/utils/format";
import type { AdjustmentBody, CatalogVariant, LedgerRow, Warehouse } from "@/types/inventory";
import { AdjustFields } from "./adjustForm";
import { adjustFields, initialAdjustState, isAdjustReady, noteProblem, qtyProblem, reasonProblem, withType, type AdjustFormState } from "./adjustModel";
import { InlineError } from "./inventoryUi";
import { ProductField } from "./ProductField";
import type { StockTarget } from "./stockTarget";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

const FIELD = "w-full h-8 px-2.5 border border-[#E5E5E5] rounded-lg text-[12px] font-normal text-[#111111] focus:outline-none focus:border-black";
const LABEL = "text-[11px] font-semibold text-[#111111]";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

interface AdjustPanelProps {
  target: StockTarget | null;
  warehouses: Warehouse[];
  onPick: (row: LedgerRow) => void;
  /** a variant without a stock row was picked (it takes opening stock) */
  onPickCatalog?: (variant: CatalogVariant) => void;
  /** back to the product context (or closes the drawer when it was opened from the header) */
  onCancel: () => void;
  /** after the stock was changed */
  onDone: () => void;
}

/** "Adjust stock" as the design shows it, inside the side drawer. POST /inventory/adjustments, with a dry run (POST /inventory/adjustments/preview) for the numbers. Needs inventory:write. */
export function AdjustPanel({ target, warehouses, onPick, onPickCatalog, onCancel, onDone }: AdjustPanelProps) {
  return (
    <>
      <div className="box-border flex w-full shrink-0 flex-col items-start gap-0.5 border-b border-[#EAEAEA] px-5 py-3 pr-12">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737373]">INVENTORY / STOCK ADJUSTMENT</span>
        <SheetTitle className="m-0 text-[20px] font-bold leading-tight text-[#000000]">Adjust stock</SheetTitle>
        <SheetDescription className="sr-only">Change the available stock of one product in one warehouse. The change is recorded in the audit trail.</SheetDescription>
      </div>
      <AdjustForm key={target?.variantId ?? "none"} target={target} warehouses={warehouses} onPick={onPick} onPickCatalog={onPickCatalog} onCancel={onCancel} onDone={onDone} />
    </>
  );
}

function AdjustForm({ target, warehouses, onPick, onPickCatalog, onCancel, onDone }: AdjustPanelProps) {
  const adjust = useAdjustStock();
  const [warehouseId, setWarehouseId] = useState(() => {
    const stocked = target?.locations.find((l) => l.available > 0)?.warehouseId;
    return warehouses.find((w) => w.id === stocked)?.id ?? warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? "";
  });
  // a variant that has no stock yet starts on "Opening stock"
  const [state, setState] = useState<AdjustFormState>(() => (target && target.stocked === false ? withType(initialAdjustState(), "opening_stock") : initialAdjustState()));
  const [serverError, setServerError] = useState<string | null>(null);
  // one key per product: a retry after a network blip never moves the stock twice
  const key = useMemo(() => `inventory-ui-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`, []);

  const availableHere = target?.locations.find((l) => l.warehouseId === warehouseId)?.available ?? 0;
  const qtyError = qtyProblem(state, target ? availableHere : null);
  const noteError = noteProblem(state);
  const reasonError = reasonProblem(state);
  const ready = target !== null && warehouseId !== "" && isAdjustReady(state, availableHere);

  const body: AdjustmentBody | null = ready && target ? { variantId: target.variantId, warehouseId, ...adjustFields(state) } : null;
  const bodyKey = body ? JSON.stringify(body) : "";
  const settledKey = useDebounced(bodyKey, 350);
  const preview = useAdjustmentPreview(body && bodyKey === settledKey ? body : null);
  const warehouseName = warehouses.find((w) => w.id === warehouseId)?.name;

  const acquire = useSubmitLock();
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!body || !target) return;
    const release = acquire();
    if (!release) return;
    setServerError(null);
    try {
      const res = await adjust.mutateAsync({ ...body, idempotencyKey: key });
      toast({
        title: res.duplicate ? "Already applied" : "Stock adjusted",
        description: `${target.sku}: ${formatNumber(res.result.newAvailable)} available${warehouseName ? ` in ${warehouseName}` : ""}.`,
        variant: "success",
      });
      onDone();
    } catch (e) {
      // 409 (below what is reserved / would go negative) and 400 come back with a readable message
      setServerError(errorMessage(e, "Could not change the stock."));
    } finally {
      release();
    }
  };

  const p = preview.data;
  const sign = (n: number) => (n > 0 ? `+${formatNumber(n)}` : formatNumber(n));

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex w-full flex-1 flex-col items-start overflow-y-auto overflow-x-hidden">
        <div className="box-border flex w-full flex-col items-start gap-2.5 px-5 py-3">
          {serverError && <InlineError message={serverError} />}

          <div className="flex w-full flex-col items-start gap-1">
            <label htmlFor="adj-product" className={LABEL}>
              Product
            </label>
            <ProductField id="adj-product" value={target} onPick={onPick} onPickCatalog={onPickCatalog} />
          </div>

          <div className="flex w-full flex-col items-start gap-1">
            <label htmlFor="adj-sku" className={LABEL}>
              SKU
            </label>
            <input id="adj-sku" type="text" readOnly value={target?.sku ?? ""} className={`${FIELD} bg-[#FAFAFA]`} />
          </div>

          <div className="flex w-full flex-col items-start gap-1">
            <label htmlFor="adj-warehouse" className={LABEL}>
              Location
            </label>
            <div className="relative w-full">
              <select id="adj-warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={warehouses.length <= 1 || !target} className={`${FIELD} cursor-pointer appearance-none bg-white pr-8`}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.city ? `, ${w.city}` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 stroke-[1.5px] text-[#737373]" aria-hidden />
            </div>
            {target && <p className="m-0 text-[11px] text-[#737373]">{formatNumber(availableHere)} available here</p>}
          </div>

          <AdjustFields idPrefix="adj" state={state} onChange={setState} hideTypes={target?.stocked === false ? undefined : ["opening_stock"]} qtyError={qtyError} noteError={noteError} reasonError={reasonError} disabled={!target} />

          <div className="mt-1 flex w-full flex-col items-start gap-1.5 rounded-xl border border-[#F0F0F0] bg-[#F8F8F8] p-3" aria-live="polite">
            <span className="text-[12px] font-semibold text-[#000000]">{target ? `${target.title} stock adjustment preview` : "Stock adjustment preview"}</span>
            <div className="flex w-full flex-col gap-1.5 pt-0.5">
              <div className="flex w-full flex-row items-center justify-between text-[11px]">
                <span className="font-normal text-[#666666]">Current available:</span>
                <span className="font-semibold text-[#000000]">{p ? formatNumber(p.currentAvailable) : target ? formatNumber(availableHere) : "—"}</span>
              </div>
              <div className="flex w-full flex-row items-center justify-between text-[11px]">
                <span className="font-normal text-[#666666]">Adjustment:</span>
                <span className="font-semibold text-[#000000]">{p ? sign(p.adjustment) : "—"}</span>
              </div>
              <div className="my-0.5 h-[1px] w-full bg-[#EAEAEA]" />
              <div className="flex w-full flex-row items-center justify-between text-[11px]">
                <span className="font-normal text-[#666666]">New available:</span>
                <span className="font-semibold text-[#000000]">{p ? formatNumber(p.newAvailable) : "—"}</span>
              </div>
            </div>
            {p?.warnings.map((w) => (
              <p key={w.code} className="m-0 text-[11px] text-[#D97706]">
                {w.message}
              </p>
            ))}
            {preview.isError && <p role="alert" className="m-0 text-[11px] text-red-700">{errorMessage(preview.error, "This adjustment would be refused.")}</p>}
          </div>
        </div>
      </div>

      <div className="box-border flex w-full shrink-0 flex-col items-start gap-3 border-t border-[#EAEAEA] bg-white px-5 pb-5 pt-3">
        <div className="flex flex-row items-center gap-2 text-[11px] text-[#737373]">
          <ShieldCheck className="h-4 w-4 shrink-0 stroke-[1.5px] text-[#737373]" aria-hidden />
          <span>This action will be recorded in the inventory audit trail.</span>
        </div>
        <div className="flex w-full flex-row items-center gap-2.5">
          <button
            type="submit"
            disabled={!ready || adjust.isPending || preview.isError}
            className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-black bg-black px-5 text-[12px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {adjust.isPending ? "Updating..." : "Confirm adjustment"}
          </button>
          <button
            type="button"
            disabled={adjust.isPending}
            onClick={onCancel}
            className="h-10 cursor-pointer rounded-lg border border-[#E5E5E5] bg-white px-5 text-[12px] font-medium text-[#111111] transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
