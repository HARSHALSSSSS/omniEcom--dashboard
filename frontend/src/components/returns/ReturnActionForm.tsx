import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useReturnWarehouses } from "@/hooks/useReturns";
import type { ActionInput, ActionKey, NextAction, ReceiveItem } from "@/types/returns";
import { fromMinor, toMinor } from "./returnFormat";

export type FormKind = ActionKey | "reject" | "cancel";

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

const FIELD = "h-9 w-full rounded-lg border border-border bg-card px-2.5 text-xs";

const CHECKLIST: ReadonlyArray<{ key: string; label: string; defaultValue: boolean }> = [
  { key: "packagingIntact", label: "Packaging intact", defaultValue: true },
  { key: "productUsable", label: "Product usable", defaultValue: true },
  { key: "accessoriesPresent", label: "Accessories present", defaultValue: true },
  { key: "visibleDamage", label: "Visible damage", defaultValue: false },
  { key: "productMismatch", label: "Product does not match the order", defaultValue: false },
  { key: "missingQuantity", label: "Quantity missing", defaultValue: false },
];

const inputOf = (action: NextAction | null, name: string): ActionInput | undefined => action?.inputs.find((i) => i.name === name);

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="font-semibold text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
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
  const resultOptions = inputOf(action, "result")?.options ?? [];
  const kindInput = inputOf(action, "kind");
  const modeInput = inputOf(action, "mode");
  const amountInput = inputOf(action, "amountMinor");
  const shortInput = inputOf(action, "acceptShort");

  const [warehouseId, setWarehouseId] = useState(typeof inputOf(action, "warehouseId")?.default === "string" ? (inputOf(action, "warehouseId")?.default as string) : "");
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.returnItemId, String(i.quantity)])));
  const [result, setResult] = useState(resultOptions[0]?.value ?? "pass");
  const [checks, setChecks] = useState<Record<string, boolean>>(() => Object.fromEntries(CHECKLIST.map((c) => [c.key, c.defaultValue])));
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

  const body = (): Record<string, unknown> => {
    const withNote = note.trim() ? { note: note.trim() } : {};
    switch (kind) {
      case "approve":
        return { ...withNote, ...(warehouseId ? { warehouseId } : {}) };
      case "receive":
        return { warehouseId, items: receiveItems, ...withNote };
      case "inspection":
        return { checklist: checks, result, ...withNote };
      case "disposition":
        return { kind: dispositionKind, ...withNote };
      case "refund":
        return action?.href.endsWith("/refund/retry") ? {} : { mode, ...(amountMinor !== undefined && amountMinor !== null ? { amountMinor } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}) };
      case "complete":
        return { ...(acceptShort ? { acceptShort: true } : {}), ...withNote };
      default:
        return withNote;
    }
  };

  const isRetry = kind === "refund" && action?.href.endsWith("/refund/retry");
  const showNote = kind !== "refund";

  return (
    <form
      aria-label={action?.label ?? (kind === "reject" ? "Reject return" : "Cancel return")}
      className="space-y-3 rounded-lg border border-border bg-muted/20 p-3 text-xs"
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
          <legend className="font-semibold text-foreground">Units received</legend>
          {items.map((i) => (
            <div key={i.returnItemId} className="flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] text-muted-foreground">{i.sku ?? "No SKU"} (up to {i.quantity})</span>
              <Input
                type="number"
                min={0}
                max={i.quantity}
                aria-label={`Quantity received for ${i.sku ?? "item"}`}
                value={quantities[i.returnItemId] ?? ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuantities((q) => ({ ...q, [i.returnItemId]: e.target.value }))}
                className="h-8 w-20 text-xs"
              />
            </div>
          ))}
        </fieldset>
      )}

      {kind === "inspection" && (
        <>
          <Field label="Result">
            <select aria-label="Inspection result" value={result} onChange={(e) => setResult(e.target.value)} className={FIELD}>
              {resultOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="space-y-1.5">
            <legend className="font-semibold text-foreground">Checklist</legend>
            {CHECKLIST.map((c) => (
              <label key={c.key} className="flex items-center gap-2">
                <input type="checkbox" checked={checks[c.key]} onChange={(e) => setChecks((s) => ({ ...s, [c.key]: e.target.checked }))} className="h-4 w-4 accent-[#1D4ED8]" />
                {c.label}
              </label>
            ))}
          </fieldset>
        </>
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
            <Input aria-label="Refund amount" inputMode="decimal" value={amount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)} className="h-9 text-xs" />
          </Field>
          {amountMinor === null && <p className="text-rose-700">Enter the amount in rupees, for example 1499.00.</p>}
          <Field label="Reference (optional)">
            <Input aria-label="Refund reference" maxLength={120} value={reference} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReference(e.target.value)} className="h-9 text-xs" />
          </Field>
        </>
      )}
      {isRetry && <p className="text-muted-foreground">The failed refund is tried again. A marketplace refund asks the marketplace once more; a manual one goes back to ready.</p>}

      {kind === "complete" && shortInput && (
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={acceptShort} onChange={(e) => setAcceptShort(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1D4ED8]" />
          <span>
            Accept the units that never arrived
            {shortInput.note && <span className="block text-[11px] text-muted-foreground">{shortInput.note}</span>}
          </span>
        </label>
      )}

      {showNote && (
        <Field label={kind === "reject" ? "Reason (required)" : "Note (optional)"}>
          <Textarea aria-label={kind === "reject" ? "Rejection reason" : "Note"} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="text-xs" />
        </Field>
      )}

      {error && (
        <p role="alert" className="text-rose-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={busy} onClick={onClose}>
          Close
        </Button>
        <Button type="submit" size="sm" className="h-8 text-xs" disabled={invalid || busy}>
          {busy ? "Working..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
