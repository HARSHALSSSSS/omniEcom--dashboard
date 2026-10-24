import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, isApiError } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useActiveSuppliers, useCreatePurchaseOrder, useProcurementWarehouses, usePurchaseOrder, useUpdatePurchaseOrder } from "@/hooks/useProcurement";
import { formatCurrency, formatNumber } from "@/utils/format";
import type { PoWrite, PurchaseOrder, VariantOffer } from "@/types/procurement";
import { dayOf, dayToIso, gstLabel, minorToInput, parseMinor, parseQty, previewTotals } from "./procurementFormat";
import { Field, FIELD_SELECT, InlineError } from "./procurementUi";
import { fieldError } from "./procurementErrors";
import { PoLinePicker } from "./PoLinePicker";
import { VersionConflictDialog } from "./VersionConflictDialog";
import { isVersionConflict } from "./procurementErrors";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

export type PoFormTarget = { kind: "create"; supplierId?: string } | { kind: "edit"; id: string };

interface LineState {
  key: string;
  variantId: string;
  sku: string;
  title: string;
  qty: string;
  cost: string;
  taxRateBps: number;
  moq: number | null;
  /** null when the order was loaded (the picker knows the stock, the saved order does not) */
  available: number | null;
  incoming: number | null;
}
interface SupplierOption {
  id: string;
  name: string;
  city: string | null;
  paymentTerms: string | null;
}
interface FormState {
  supplierId: string;
  warehouseId: string;
  expected: string;
  shipping: string;
  paymentTerms: string;
  reference: string;
  notes: string;
  lines: LineState[];
}

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const fromOrder = (po: PurchaseOrder): FormState => ({
  supplierId: po.supplierId,
  warehouseId: po.warehouseId,
  expected: dayOf(po.expectedAt),
  shipping: po.shippingMinor ? minorToInput(po.shippingMinor) : "",
  paymentTerms: po.paymentTerms ?? "",
  reference: po.reference ?? "",
  notes: po.notes ?? "",
  lines: po.lines.map((l) => ({ key: l.id, variantId: l.variantId, sku: l.sku, title: l.title, qty: String(l.quantityOrdered), cost: minorToInput(l.unitCostMinor), taxRateBps: l.taxRateBps, moq: null, available: null, incoming: null })),
});
const blank = (supplierId = ""): FormState => ({ supplierId, warehouseId: "", expected: "", shipping: "", paymentTerms: "", reference: "", notes: "", lines: [] });

interface Props {
  target: PoFormTarget | null;
  onClose: () => void;
  onSaved: (po: PurchaseOrder, mode: "create" | "edit") => void;
}

/** create a draft purchase order, or edit one that is still a draft (POST /purchase-orders, PATCH /purchase-orders/{id}) */
export function PoFormDialog({ target, onClose, onSaved }: Props) {
  const [dirty, setDirty] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);

  // a closed tab or reload with unsaved lines asks first
  useEffect(() => {
    if (!dirty || !target) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, target]);

  const finish = () => {
    setDirty(false);
    setAskDiscard(false);
    onClose();
  };
  const requestClose = () => (dirty ? setAskDiscard(true) : finish());
  const targetKey = target ? (target.kind === "edit" ? `edit-${target.id}` : `create-${target.supplierId ?? ""}`) : "none";

  return (
    <>
      <Dialog open={target !== null} onOpenChange={(o) => !o && requestClose()}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" onInteractOutside={(e) => dirty && e.preventDefault()}>
          {target && <Loader key={targetKey} target={target} onDirty={setDirty} onCancel={requestClose} onSaved={(po, mode) => { setDirty(false); onSaved(po, mode); }} />}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={askDiscard}
        onOpenChange={setAskDiscard}
        title="Discard your changes?"
        description="This purchase order has changes that are not saved yet. Closing now throws them away."
        confirmText="Discard changes"
        cancelText="Keep editing"
        variant="destructive"
        onConfirm={finish}
      />
    </>
  );
}

function Loader({ target, onDirty, onCancel, onSaved }: { target: PoFormTarget; onDirty: (d: boolean) => void; onCancel: () => void; onSaved: Props["onSaved"] }) {
  const edit = target.kind === "edit" ? target.id : null;
  const order = usePurchaseOrder(edit);
  if (edit) {
    if (order.isLoading) {
      return (
        <div role="status" aria-label="Loading purchase order" className="space-y-3">
          <DialogTitle className="sr-only">Edit purchase order</DialogTitle>
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      );
    }
    if (!order.data) {
      return (
        <div role="alert" className="space-y-3 text-sm">
          <DialogTitle>Purchase order could not be loaded</DialogTitle>
          <DialogDescription>{errorMessage(order.error)}</DialogDescription>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void order.refetch()}>
              Retry
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Close
            </Button>
          </div>
        </div>
      );
    }
    if (order.data.status !== "draft") {
      return (
        <div role="alert" className="space-y-3 text-sm">
          <DialogTitle>This purchase order can no longer be edited</DialogTitle>
          <DialogDescription>Only drafts can be changed; {order.data.poNumber} is {order.data.status.replace("_", " ")} now.</DialogDescription>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Close
          </Button>
        </div>
      );
    }
  }
  return (
    <PoForm
      order={order.data ?? null}
      presetSupplierId={target.kind === "create" ? target.supplierId : undefined}
      refetch={async () => (await order.refetch()).data ?? null}
      onDirty={onDirty}
      onCancel={onCancel}
      onSaved={onSaved}
    />
  );
}

interface FormProps {
  order: PurchaseOrder | null;
  presetSupplierId: string | undefined;
  refetch: () => Promise<PurchaseOrder | null>;
  onDirty: (d: boolean) => void;
  onCancel: () => void;
  onSaved: Props["onSaved"];
}

function PoForm({ order, presetSupplierId, refetch, onDirty, onCancel, onSaved }: FormProps) {
  const editing = order !== null;
  const suppliers = useActiveSuppliers();
  const warehouses = useProcurementWarehouses();
  const create = useCreatePurchaseOrder();
  const update = useUpdatePurchaseOrder();

  const initial = useRef<FormState>(order ? fromOrder(order) : blank(presetSupplierId));
  const [form, setForm] = useState<FormState>(initial.current);
  const version = useRef(order?.version ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<Record<string, string> | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [supplierChanged, setSupplierChanged] = useState(false);
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const supplierList = useMemo<SupplierOption[]>(() => {
    const list: SupplierOption[] = (suppliers.data ?? []).map((s) => ({ id: s.id, name: s.name, city: s.city, paymentTerms: s.paymentTerms }));
    // the supplier of an order being edited stays pickable even when it has been made inactive since
    return order && !list.some((s) => s.id === order.supplierId) ? [...list, { id: order.supplierId, name: order.supplierName, city: order.supplier.city, paymentTerms: order.paymentTerms }] : list;
  }, [suppliers.data, order]);

  // the receiving warehouse defaults to the business default once the warehouses are known
  useEffect(() => {
    const list = warehouses.data;
    if (!list || form.warehouseId) return;
    const pick = list.find((w) => w.isDefault) ?? list[0];
    if (pick) setForm((f) => (f.warehouseId ? f : { ...f, warehouseId: pick.id }));
  }, [warehouses.data, form.warehouseId]);

  // a supplier from the "new order for this supplier" button brings its payment terms
  useEffect(() => {
    if (editing || !presetSupplierId) return;
    const s = suppliers.data?.find((x) => x.id === presetSupplierId);
    if (s?.paymentTerms) setForm((f) => (f.paymentTerms ? f : { ...f, paymentTerms: s.paymentTerms ?? "" }));
  }, [editing, presetSupplierId, suppliers.data]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial.current);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e));
  };
  const setLine = (key: string, patch: Partial<LineState>) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  const changeSupplier = (id: string) => {
    const next = supplierList.find((s) => s.id === id);
    const prev = supplierList.find((s) => s.id === form.supplierId);
    setForm((f) => ({ ...f, supplierId: id, paymentTerms: !f.paymentTerms || f.paymentTerms === (prev?.paymentTerms ?? "") ? (next?.paymentTerms ?? "") : f.paymentTerms }));
    setErrors((e) => ({ ...e, supplier: "" }));
    if (form.lines.length > 0 && form.supplierId) setSupplierChanged(true);
  };

  const addLine = (offer: VariantOffer) => {
    const cost = offer.offer?.costMinor ?? offer.variantCostMinor;
    const moq = offer.offer?.minOrderQuantity ?? null;
    setForm((f) =>
      f.lines.some((l) => l.variantId === offer.variantId)
        ? f
        : { ...f, lines: [...f.lines, { key: newKey(), variantId: offer.variantId, sku: offer.sku, title: offer.title, qty: String(moq ?? 1), cost: cost === null ? "" : minorToInput(cost), taxRateBps: offer.taxRateBps, moq, available: offer.available, incoming: offer.incoming }] },
    );
    setErrors((e) => ({ ...e, lines: "" }));
  };

  // client checks mirror the server rules so the common mistakes never cost a round trip; the server stays the authority
  const rows = form.lines.map((l) => {
    const qty = parseQty(l.qty);
    const cost = parseMinor(l.cost);
    return {
      line: l,
      qty,
      cost,
      qtyError: qty === null || qty < 1 ? "Whole units, 1 or more" : l.moq !== null && qty < l.moq ? `Minimum order is ${l.moq}` : null,
      costError: cost === null ? "Enter the price per unit, like 1250 or 1250.50" : null,
      amount: qty !== null && cost !== null ? qty * cost : null,
    };
  });
  const shippingMinor = form.shipping.trim() === "" ? 0 : parseMinor(form.shipping);
  const totals = previewTotals(
    rows.flatMap((r) => (r.qty !== null && r.cost !== null ? [{ quantity: r.qty, unitCostMinor: r.cost, taxRateBps: r.line.taxRateBps }] : [])),
    shippingMinor ?? 0,
  );
  const currency = order?.currency ?? "INR";

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.supplierId) next.supplier = "Choose a supplier";
    if (!form.warehouseId) next.warehouse = warehouses.data?.length === 0 ? "There is no active warehouse to receive the goods" : "Choose where the goods will be received";
    if (form.lines.length === 0) next.lines = "Add at least one product";
    else if (rows.some((r) => r.qtyError || r.costError)) next.lines = "Fix the highlighted lines";
    if (shippingMinor === null) next.shipping = "Enter an amount like 250 or 250.50";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const busy = create.isPending || update.isPending;

  const body = (): PoWrite => ({
    supplierId: form.supplierId,
    warehouseId: form.warehouseId,
    expectedAt: form.expected ? dayToIso(form.expected) : null,
    shippingMinor: shippingMinor ?? 0,
    paymentTerms: form.paymentTerms.trim() || null,
    reference: form.reference.trim() || null,
    notes: form.notes.trim() || null,
    lines: rows.flatMap((r) => (r.qty !== null && r.cost !== null ? [{ variantId: r.line.variantId, quantity: r.qty, unitCostMinor: r.cost }] : [])),
  });

  const acquire = useSubmitLock();
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setServerError(null);
    setServerFields(null);
    if (!validate()) return;
    const payload = body();
    const release = acquire();
    if (!release) return;
    try {
      if (order) {
        const saved = await update.mutateAsync({ id: order.id, body: { ...payload, version: version.current } });
        toast({ title: "Purchase order saved", description: `${saved.poNumber} was updated.`, variant: "success" });
        onSaved(saved, "edit");
      } else {
        // one key per distinct body: a retry of the same attempt returns the first order, an edited form is a new attempt
        const text = JSON.stringify(payload);
        if (attempt.current?.body !== text) attempt.current = { body: text, key: `po-ui-${newKey()}` };
        const saved = await create.mutateAsync({ body: payload, idempotencyKey: attempt.current.key });
        toast({ title: "Draft purchase order created", description: `${saved.poNumber} is a draft: approve it to send it to the supplier.`, variant: "success" });
        onSaved(saved, "create");
      }
    } catch (e) {
      if (isVersionConflict(e)) {
        setConflict(true);
        return;
      }
      setServerFields(isApiError(e) ? e.fields : null);
      setServerError(errorMessage(e, "Could not save the purchase order."));
    } finally {
      release();
    }
  };

  const reload = async (keepMine: boolean) => {
    setReloading(true);
    try {
      const latest = await refetch();
      if (latest) {
        version.current = latest.version;
        if (!keepMine) {
          const next = fromOrder(latest);
          initial.current = next;
          setForm(next);
          setSupplierChanged(false);
        }
      }
      setConflict(false);
    } catch (e) {
      setServerError(errorMessage(e, "Could not load the latest version."));
      setConflict(false);
    } finally {
      setReloading(false);
    }
  };

  const supplierError = errors.supplier || fieldError(serverFields, "supplierId");
  const expectedError = fieldError(serverFields, "expectedAt");
  const lineServerError = (i: number, name: "quantity" | "unitCostMinor") => fieldError(serverFields, `lines.${i}.${name}`);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{order ? `Edit ${order.poNumber}` : "New purchase order"}</DialogTitle>
        <DialogDescription>
          {order ? "Drafts can be changed until they are approved. Saving re-prices the lines." : "Saved as a draft. Nothing is ordered and no stock changes until an administrator approves it."}
        </DialogDescription>
      </DialogHeader>

      {serverError && <InlineError message={serverError} />}
      {fieldError(serverFields, "lines") && !serverError && <InlineError message={fieldError(serverFields, "lines") ?? ""} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="po-supplier" label="Supplier" required error={supplierError}>
          <select id="po-supplier" className={FIELD_SELECT} value={form.supplierId} onChange={(e) => changeSupplier(e.target.value)} aria-invalid={Boolean(supplierError)} aria-describedby={supplierError ? "po-supplier-error" : undefined}>
            <option value="">Choose a supplier...</option>
            {supplierList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.city ? ` (${s.city})` : ""}
              </option>
            ))}
          </select>
          {suppliers.isError && <p className="text-[11px] text-red-700">Suppliers could not be loaded. {errorMessage(suppliers.error)}</p>}
          {!suppliers.isLoading && !suppliers.isError && supplierList.length === 0 && <p className="text-[11px] text-muted-foreground">No active supplier yet: add one on the Suppliers tab first.</p>}
        </Field>
        <Field id="po-warehouse" label="Receive into" required error={errors.warehouse || fieldError(serverFields, "warehouseId")}>
          <select id="po-warehouse" className={FIELD_SELECT} value={form.warehouseId} onChange={(e) => set("warehouseId", e.target.value)} aria-invalid={Boolean(errors.warehouse)}>
            <option value="">Choose a warehouse...</option>
            {(warehouses.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.city ? `, ${w.city}` : ""}
              </option>
            ))}
            {order && !(warehouses.data ?? []).some((w) => w.id === order.warehouseId) && <option value={order.warehouseId}>{order.warehouse.name}</option>}
          </select>
        </Field>
        <Field id="po-expected" label="Expected delivery" hint="Optional. Left empty, approval sets it from the supplier lead time." error={expectedError}>
          <Input id="po-expected" type="date" value={form.expected} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("expected", e.target.value)} className="text-xs" />
        </Field>
        <Field id="po-terms" label="Payment terms">
          <Input id="po-terms" value={form.paymentTerms} maxLength={100} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("paymentTerms", e.target.value)} placeholder="e.g. Net 30" className="text-xs" />
        </Field>
        <Field id="po-reference" label="Your reference">
          <Input id="po-reference" value={form.reference} maxLength={100} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("reference", e.target.value)} placeholder="Internal reference or supplier quote number" className="text-xs" />
        </Field>
        <Field id="po-shipping" label="Shipping charges" hint="Added to the total, not taxed" error={errors.shipping || fieldError(serverFields, "shippingMinor")}>
          <Input id="po-shipping" inputMode="decimal" value={form.shipping} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("shipping", e.target.value)} placeholder="0" error={Boolean(errors.shipping)} className="text-xs" autoComplete="off" />
        </Field>
      </div>

      <Field id="po-notes" label="Notes and delivery instructions">
        <Textarea id="po-notes" rows={2} maxLength={2000} value={form.notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set("notes", e.target.value)} placeholder="e.g. Pack in cartons of 20; deliver before the festive sale." className="text-xs" />
      </Field>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold">
          Products<span aria-hidden> *</span>
        </h3>
        <PoLinePicker supplierId={form.supplierId || undefined} taken={new Set(form.lines.map((l) => l.variantId))} onAdd={addLine} />
        {supplierChanged && (
          <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            The supplier changed: the unit costs on the lines below are the ones you had. Check them against the new supplier's prices.
          </p>
        )}
        {errors.lines && (
          <p role="alert" className="text-[11px] text-red-700">
            {errors.lines}
          </p>
        )}
        {form.lines.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] text-muted-foreground">
                  <th scope="col" className="px-3 py-2">Product</th>
                  <th scope="col" className="w-24 px-3 py-2">Quantity</th>
                  <th scope="col" className="w-32 px-3 py-2">Unit cost</th>
                  <th scope="col" className="w-16 px-3 py-2 text-right">GST</th>
                  <th scope="col" className="w-28 px-3 py-2 text-right">Amount</th>
                  <th scope="col" className="w-10 px-3 py-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ line: l, qtyError, costError, amount }, i) => {
                  const qtyErr = (errors.lines && qtyError) || lineServerError(i, "quantity");
                  const costErr = (errors.lines && costError) || lineServerError(i, "unitCostMinor");
                  return (
                    <tr key={l.key} className="align-top">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-foreground">{l.title}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {l.sku}
                          {l.available !== null ? ` · ${formatNumber(l.available)} available${l.incoming ? ` · ${formatNumber(l.incoming)} incoming` : ""}` : ""}
                          {l.moq !== null ? ` · MOQ ${l.moq}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <Input aria-label={`Quantity for ${l.sku}`} inputMode="numeric" value={l.qty} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLine(l.key, { qty: e.target.value })} error={Boolean(qtyErr)} className="h-8 text-xs" autoComplete="off" />
                        {qtyErr && <p role="alert" className="mt-0.5 text-[11px] text-red-700">{qtyErr}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <Input aria-label={`Unit cost for ${l.sku}`} inputMode="decimal" value={l.cost} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLine(l.key, { cost: e.target.value })} error={Boolean(costErr)} className="h-8 text-xs" autoComplete="off" />
                        {costErr && <p role="alert" className="mt-0.5 text-[11px] text-red-700">{costErr}</p>}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{gstLabel(l.taxRateBps)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-foreground">{amount === null ? "—" : formatCurrency(amount, currency)}</td>
                      <td className="px-3 py-2">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${l.sku}`} onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((x) => x.key !== l.key) }))}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {form.lines.length > 0 && (
          <dl aria-label="Order totals" className="ml-auto w-full max-w-xs space-y-1 text-xs">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{formatCurrency(totals.subtotalMinor, currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">GST</dt><dd>{formatCurrency(totals.taxMinor, currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd>{formatCurrency(totals.shippingMinor, currency)}</dd></div>
            <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold"><dt>Total</dt><dd>{formatCurrency(totals.totalMinor, currency)}</dd></div>
          </dl>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={busy}>
          {order ? "Save changes" : "Create draft"}
        </Button>
      </DialogFooter>

      <VersionConflictDialog open={conflict} noun="purchase order" hasMyEdits={dirty} busy={reloading} onReload={(keep) => void reload(keep)} onClose={() => setConflict(false)} />
    </form>
  );
}
