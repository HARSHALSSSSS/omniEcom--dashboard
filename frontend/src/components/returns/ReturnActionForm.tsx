import { useState, type ReactNode } from "react";
import { useReturnWarehouses } from "@/hooks/useReturns";
import type { ActionInput, ActionKey, NextAction, ReceiveItem } from "@/types/returns";
import { DRAWER_BTN_DARK, DRAWER_BTN_LIGHT } from "./design";
import { fromMinor, toMinor } from "./returnFormat";

/** the steps that take a form here; the inspection has its own drawer */
export type FormKind = Exclude<ActionKey, "inspection"> | "reject" | "cancel";

interface ReturnActionFormProps {
  kind: FormKind;
  /** the step from GET /returns/{id}/next-actions (its inputs carry defaults and options); null for reject and cancel */
  action: NextAction | null;
  busy: boolean;
  error: string | null;
  submitLabel: string;
  onSubmit: (body: Record<string, unknown>) => void;
  onClose: () => void;
}

const FIELD = "h-[36px] w-full rounded-lg border border-[#EAEAEA] bg-white px-3 text-[12px] text-black focus:border-black focus:outline-none disabled:opacity-60";

const inputOf = (action: NextAction | null, name: string): ActionInput | undefined => action?.inputs.find((i) => i.name === name);

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] font-semibold text-black">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-[#666666]">{hint}</span>}
    </label>
  );
}

const defaultItems = (action: NextAction | null): Array<ReceiveItem & { sku: string | null }> => {
  const raw = inputOf(action, "items")?.default;
  return Array.isArray(raw) ? (raw as Array<ReceiveItem & { sku: string | null }>) : [];
};

/** the input form of one step; its fields, defaults and options come from the next-actions payload */
export function ReturnActionForm({ kind, action, busy, error, submitLabel, onSubmit, onClose }: ReturnActionFormProps) {
  const needsWarehouse = Boolean(inputOf(action, "warehouseId"));
  const { data: warehouses = [], isLoading: loadingWarehouses } = useReturnWarehouses(needsWarehouse);

  const items = defaultItems(action);
  const kindInput = inputOf(action, "kind");
  const modeInput = inputOf(action, "mode");
  const amountInput = inputOf(action, "amountMinor");
  const shortInput = inputOf(action, "acceptShort");

  const [warehouseId, setWarehouseId] = useState(typeof inputOf(action, "warehouseId")?.default === "string" ? (inputOf(action, "warehouseId")?.default as string) : "");
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.returnItemId, String(i.quantity)])));
  const [dispositionKind, setDispositionKind] = useState(typeof kindInput?.default === "string" ? kindInput.default : "");
  const [mode, setMode] = useState(typeof modeInput?.default === "string" ? modeInput.default : (modeInput?.options?.[0]?.value ?? "manual"));
  const [amount, setAmount] = useState(typeof amountInput?.default === "number" ? fromMinor(amountInput.default) : "");
  const [reference, setReference] = useState("");
  const [acceptShort, setAcceptShort] = useState(false);
  const [note, setNote] = useState("");

  const amountMinor = amount.trim() === "" ? undefined : toMinor(amount);
  const receiveItems: ReceiveItem[] = items.map((i) => ({ returnItemId: i.returnItemId, quantity: Math.floor(Number(quantities[i.returnItemId])) })).filter((i) => i.quantity > 0);
  const invalid =
    (kind === "receive" && (!warehouseId || receiveItems.length === 0 || items.some((i) => !(Number(quantities[i.returnItemId]) >= 0) || Number(quantities[i.returnItemId]) > i.quantity))) ||
    (kind === "disposition" && !dispositionKind) ||
    (kind === "reject" && note.trim().length < 2) ||
    (kind === "refund" && amountMinor === null);

  const isRetry = kind === "refund" && Boolean(action?.href.endsWith("/refund/retry"));

  const body = (): Record<string, unknown> => {
    const withNote = note.trim() ? { note: note.trim() } : {};
    switch (kind) {
      case "approve":
        return { ...withNote, ...(warehouseId ? { warehouseId } : {}) };
      case "receive":
        return { warehouseId, items: receiveItems, ...withNote };
      case "disposition":
        return { kind: dispositionKind, ...withNote };
      case "refund":
        return isRetry ? {} : { mode, ...(amountMinor !== undefined && amountMinor !== null ? { amountMinor } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}) };
      case "complete":
        return { ...(acceptShort ? { acceptShort: true } : {}), ...withNote };
      default:
        return withNote;
    }
  };

  const showNote = kind !== "refund";

  return (
    <form
      aria-label={action?.label ?? (kind === "reject" ? "Reject return" : "Cancel return")}
      className="space-y-3 rounded-lg border border-[#EAEAEA] bg-[#FAFAFA] p-3 text-[12px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) onSubmit(body());
      }}
    >
      {(kind === "approve" || kind === "receive") && needsWarehouse && (
        <Field label={kind === "receive" ? "Receive into warehouse" : "Receiving warehouse (optional)"} hint={inputOf(action, "warehouseId")?.note}>
          <select aria-label="Warehouse" value={warehouseId} disabled={loadingWarehouses} onChange={(e) => setWarehouseId(e.target.value)} className={FIELD}>
            <option value="">{loadingWarehouses ? "Loading warehouses..." : kind === "receive" ? "Choose a warehouse" : "No preference"}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
        </Field>
      )}

      {kind === "receive" && (
        <fieldset className="space-y-2">
          <legend className="text-[12px] font-semibold text-black">Units received</legend>
          {items.map((i) => (
            <div key={i.returnItemId} className="flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] text-[#666666]">
                {i.sku ?? "No SKU"} (up to {i.quantity})
              </span>
              <input
                type="number"
                min={0}
                max={i.quantity}
                aria-label={`Quantity received for ${i.sku ?? "item"}`}
                value={quantities[i.returnItemId] ?? ""}
                onChange={(e) => setQuantities((q) => ({ ...q, [i.returnItemId]: e.target.value }))}
                className="h-8 w-20 rounded-lg border border-[#EAEAEA] bg-white px-2 text-[12px] focus:border-black focus:outline-none"
              />
            </div>
          ))}
        </fieldset>
      )}

      {kind === "disposition" && (
        <Field label="What happens to the received units" hint={kindInput?.note ? `Suggested: ${kindInput.note}` : undefined}>
          <select aria-label="Disposition" value={dispositionKind} onChange={(e) => setDispositionKind(e.target.value)} className={FIELD}>
            <option value="">Choose a disposition</option>
            {(kindInput?.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
                {o.description ? ` (${o.description})` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      {kind === "refund" && !isRetry && (
        <>
          <Field label="Refund method">
            <select aria-label="Refund method" value={mode} onChange={(e) => setMode(e.target.value)} className={FIELD}>
              {(modeInput?.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount" hint={amountInput?.note}>
            <input aria-label="Refund amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={FIELD} />
          </Field>
          {amountMinor === null && <p className="text-[#DC2626]">Enter the amount as a number, for example 1499.00.</p>}
          <Field label="Reference (optional)">
            <input aria-label="Refund reference" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} className={FIELD} />
          </Field>
        </>
      )}
      {isRetry && <p className="text-[#666666]">The failed refund is tried again. A marketplace refund asks the marketplace once more; a manual one goes back to ready.</p>}

      {kind === "complete" && shortInput && (
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={acceptShort} onChange={(e) => setAcceptShort(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-black" />
          <span>
            Accept the units that never arrived
            {shortInput.note && <span className="block text-[11px] text-[#666666]">{shortInput.note}</span>}
          </span>
        </label>
      )}

      {showNote && (
        <Field label={kind === "reject" ? "Reason (required)" : "Note (optional)"}>
          <textarea
            aria-label={kind === "reject" ? "Rejection reason" : "Note"}
            value={note}
            maxLength={300}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            className="w-full resize-none rounded-lg border border-[#EAEAEA] bg-white p-3 text-[12px] text-black focus:border-black focus:outline-none"
          />
        </Field>
      )}

      {error && (
        <p role="alert" className="text-[#DC2626]">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={onClose} className={DRAWER_BTN_LIGHT}>
          Close
        </button>
        <button type="submit" disabled={invalid || busy} className={DRAWER_BTN_DARK}>
          {busy ? "Working..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
