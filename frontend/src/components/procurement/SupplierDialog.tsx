import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { procurementApi } from "@/api/procurement.api";
import { errorMessage, isApiError } from "@/api/errors";
import { toast } from "@/hooks/useToast";
import { useCreateSupplier, useUpdateSupplier } from "@/hooks/useProcurement";
import { SUPPLIER_STATUSES, type Supplier, type SupplierDetail, type SupplierStatus, type SupplierWrite } from "@/types/procurement";
import { SUPPLIER_STATUS_LABEL } from "./procurementFormat";
import { Field, FIELD_SELECT, InlineError } from "./procurementUi";
import { fieldError } from "./procurementErrors";
import { VersionConflictDialog } from "./VersionConflictDialog";
import { isVersionConflict } from "./procurementErrors";

export type SupplierFormTarget = { kind: "create" } | { kind: "edit"; supplier: Supplier | SupplierDetail };

interface FormState {
  name: string;
  code: string;
  contactPerson: string;
  email: string;
  phone: string;
  gstin: string;
  city: string;
  state: string;
  paymentTerms: string;
  leadTimeDays: string;
  status: SupplierStatus;
  notes: string;
}

const blank: FormState = { name: "", code: "", contactPerson: "", email: "", phone: "", gstin: "", city: "", state: "", paymentTerms: "", leadTimeDays: "14", status: "active", notes: "" };
const fromSupplier = (s: Supplier): FormState => ({
  name: s.name,
  code: s.code,
  contactPerson: s.contactPerson ?? "",
  email: s.email ?? "",
  phone: s.phone ?? "",
  gstin: s.gstin ?? "",
  city: s.city ?? "",
  state: s.state ?? "",
  paymentTerms: s.paymentTerms ?? "",
  leadTimeDays: String(s.leadTimeDays),
  status: s.status,
  notes: s.notes ?? "",
});

/** the shape the GST portal documents (the server also checks the check character) */
const GSTIN_SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  target: SupplierFormTarget | null;
  onClose: () => void;
  onSaved: (supplier: Supplier, mode: "create" | "edit") => void;
}

/** add a supplier (POST /suppliers) or edit one (PATCH /suppliers/{id}, with the version it was read at) */
export function SupplierDialog({ target, onClose, onSaved }: Props) {
  const [dirty, setDirty] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);

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

  return (
    <>
      <Dialog open={target !== null} onOpenChange={(o) => !o && requestClose()}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto" onInteractOutside={(e) => dirty && e.preventDefault()}>
          {target && (
            <SupplierForm
              key={target.kind === "edit" ? target.supplier.id : "new"}
              supplier={target.kind === "edit" ? target.supplier : null}
              onDirty={setDirty}
              onCancel={requestClose}
              onSaved={(s, mode) => {
                setDirty(false);
                onSaved(s, mode);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={askDiscard} onOpenChange={setAskDiscard} title="Discard your changes?" description="This supplier has changes that are not saved yet. Closing now throws them away." confirmText="Discard changes" cancelText="Keep editing" variant="destructive" onConfirm={finish} />
    </>
  );
}

function SupplierForm({ supplier, onDirty, onCancel, onSaved }: { supplier: Supplier | null; onDirty: (d: boolean) => void; onCancel: () => void; onSaved: Props["onSaved"] }) {
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const initial = useRef<FormState>(supplier ? fromSupplier(supplier) : blank);
  const [form, setForm] = useState<FormState>(initial.current);
  const version = useRef(supplier?.version ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverFields, setServerFields] = useState<Record<string, string> | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const busy = create.isPending || update.isPending;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial.current);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
    setServerFields((f) => (f && f[key] ? { ...f, [key]: "" } : f));
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const name = form.name.trim();
    if (name.length < 2) next.name = "Enter the supplier's name (at least 2 characters)";
    const code = form.code.trim();
    if (code && !/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/.test(code)) next.code = "2 to 30 letters, digits, - or _";
    if (form.email.trim() && !EMAIL.test(form.email.trim())) next.email = "Enter a valid e-mail address";
    const gstin = form.gstin.trim().toUpperCase();
    if (gstin && !GSTIN_SHAPE.test(gstin)) next.gstin = "A GSTIN has 15 characters, for example 27AABCT3521Q1Z8";
    const lead = form.leadTimeDays.trim();
    if (lead !== "" && !(/^\d{1,3}$/.test(lead) && Number(lead) <= 365)) next.leadTimeDays = "Whole days, 0 to 365";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const body = (): SupplierWrite => {
    const text = (v: string) => v.trim() || null;
    return {
      name: form.name.trim(),
      ...(form.code.trim() ? { code: form.code.trim() } : {}),
      contactPerson: text(form.contactPerson),
      email: text(form.email),
      phone: text(form.phone),
      gstin: form.gstin.trim() ? form.gstin.trim().toUpperCase() : null,
      city: text(form.city),
      state: text(form.state),
      paymentTerms: text(form.paymentTerms),
      leadTimeDays: form.leadTimeDays.trim() === "" ? 0 : Number(form.leadTimeDays),
      status: form.status,
      notes: text(form.notes),
    };
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setServerError(null);
    setServerFields(null);
    if (!validate()) return;
    try {
      if (supplier) {
        const saved = await update.mutateAsync({ id: supplier.id, body: { ...body(), version: version.current } });
        toast({ title: "Supplier saved", description: `${saved.name} was updated.`, variant: "success" });
        onSaved(saved, "edit");
      } else {
        const saved = await create.mutateAsync(body());
        toast({ title: "Supplier added", description: `${saved.name} is ${saved.code}. Add the products it sells on its price list.`, variant: "success" });
        onSaved(saved, "create");
      }
    } catch (e) {
      if (isVersionConflict(e)) {
        setConflict(true);
        return;
      }
      setServerFields(isApiError(e) ? e.fields : null);
      // a duplicate code or a GSTIN refusal names its field: the message goes under it, the banner stays for the rest
      const named = isApiError(e) && e.fields !== null && Object.keys(e.fields).some((k) => k in blank);
      setServerError(named ? null : errorMessage(e, "Could not save the supplier."));
    }
  };

  const reload = async (keepMine: boolean) => {
    if (!supplier) return;
    setReloading(true);
    try {
      const latest = await procurementApi.getSupplier(supplier.id);
      version.current = latest.version;
      if (!keepMine) {
        const next = fromSupplier(latest);
        initial.current = next;
        setForm(next);
      }
      setConflict(false);
    } catch (e) {
      setConflict(false);
      setServerError(errorMessage(e, "Could not load the latest version."));
    } finally {
      setReloading(false);
    }
  };

  const err = (name: keyof FormState, ...paths: string[]) => errors[name] || fieldError(serverFields, name, ...paths);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{supplier ? `Edit ${supplier.name}` : "Add supplier"}</DialogTitle>
        <DialogDescription>{supplier ? "Inactive and blocked suppliers cannot get new purchase orders." : "A supplier sells you products. Its price list, lead time and delivery record feed your purchase orders."}</DialogDescription>
      </DialogHeader>
      {serverError && <InlineError message={serverError} />}

      <Field id="sup-name" label="Supplier / company name" required error={err("name")}>
        <Input id="sup-name" value={form.name} maxLength={160} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("name", e.target.value)} error={Boolean(err("name"))} placeholder="e.g. Deccan Mills Private Limited" className="text-xs" autoComplete="off" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="sup-code" label="Supplier code" hint={supplier ? undefined : "Optional. Generated when left empty."} error={err("code")}>
          <Input id="sup-code" value={form.code} maxLength={30} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("code", e.target.value)} error={Boolean(err("code"))} className="text-xs uppercase" autoComplete="off" />
        </Field>
        <Field id="sup-gstin" label="GSTIN" error={err("gstin")}>
          <Input id="sup-gstin" value={form.gstin} maxLength={15} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("gstin", e.target.value.toUpperCase())} error={Boolean(err("gstin"))} placeholder="27AABCT3521Q1Z8" className="font-mono text-xs" autoComplete="off" />
        </Field>
        <Field id="sup-contact" label="Contact person" error={err("contactPerson")}>
          <Input id="sup-contact" value={form.contactPerson} maxLength={120} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("contactPerson", e.target.value)} className="text-xs" />
        </Field>
        <Field id="sup-email" label="E-mail" error={err("email")}>
          <Input id="sup-email" type="email" value={form.email} maxLength={200} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("email", e.target.value)} error={Boolean(err("email"))} className="text-xs" />
        </Field>
        <Field id="sup-phone" label="Phone" error={err("phone")}>
          <Input id="sup-phone" value={form.phone} maxLength={30} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("phone", e.target.value)} className="text-xs" />
        </Field>
        <Field id="sup-terms" label="Payment terms" error={err("paymentTerms")}>
          <Input id="sup-terms" value={form.paymentTerms} maxLength={100} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("paymentTerms", e.target.value)} placeholder="e.g. Net 30" className="text-xs" />
        </Field>
        <Field id="sup-city" label="City" error={err("city")}>
          <Input id="sup-city" value={form.city} maxLength={100} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("city", e.target.value)} className="text-xs" />
        </Field>
        <Field id="sup-state" label="State" error={err("state")}>
          <Input id="sup-state" value={form.state} maxLength={100} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("state", e.target.value)} className="text-xs" />
        </Field>
        <Field id="sup-lead" label="Standard lead time (days)" hint="Order to delivery. A product on the price list can override it." error={err("leadTimeDays")}>
          <Input id="sup-lead" inputMode="numeric" value={form.leadTimeDays} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("leadTimeDays", e.target.value)} error={Boolean(err("leadTimeDays"))} className="text-xs" autoComplete="off" />
        </Field>
        {supplier && (
          <Field id="sup-status" label="Status">
            <select id="sup-status" className={FIELD_SELECT} value={form.status} onChange={(e) => set("status", e.target.value as SupplierStatus)}>
              {SUPPLIER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SUPPLIER_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field id="sup-notes" label="Notes" error={err("notes")}>
        <Textarea id="sup-notes" rows={2} maxLength={2000} value={form.notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set("notes", e.target.value)} className="text-xs" />
      </Field>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={busy}>
          {supplier ? "Save changes" : "Add supplier"}
        </Button>
      </DialogFooter>
      <VersionConflictDialog open={conflict} noun="supplier" hasMyEdits={dirty} busy={reloading} onReload={(keep) => void reload(keep)} onClose={() => setConflict(false)} />
    </form>
  );
}
