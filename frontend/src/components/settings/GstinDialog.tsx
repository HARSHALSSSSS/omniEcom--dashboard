import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isApiError } from "@/api/errors";
import { gstinErrorMessage, useGstinActions, useGstinCheck, useGstStates } from "@/hooks/useSettings";
import { Field, selectClass } from "./fields";
import type { Gstin, GstinCheck, GstinStatus } from "@/types/settings";

const PROBLEM_TEXT: Record<NonNullable<GstinCheck["problem"]>, string> = {
  format: "This is not in the GSTIN format: 15 characters, for example 27AABCN8412P1Z1.",
  state_code: "The first two digits are not a valid state or union territory code.",
  checksum: "The last character does not match the rest of the GSTIN. Check it for a typing mistake.",
};

const STATUS_OPTIONS: Array<{ value: GstinStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "cancelled", label: "Cancelled" },
];

/** what the live check says about the GSTIN being typed */
function CheckResult({ gstin, checking, check, failed, stateName }: { gstin: string; checking: boolean; check: GstinCheck | undefined; failed: boolean; stateName: string | null }) {
  if (!gstin) return null;
  if (gstin.length < 15) {
    return (
      <p className="text-[11px] text-muted-foreground" aria-live="polite">
        {gstin.length}/15 characters{stateName ? ` · ${stateName}` : ""}
      </p>
    );
  }
  if (checking) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-live="polite">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Checking this GSTIN
      </p>
    );
  }
  if (failed || !check) return <p className="text-[11px] text-muted-foreground">Could not check this GSTIN right now. You can still save it, the server checks it again.</p>;
  if (!check.valid) {
    return (
      <p role="alert" className="flex items-start gap-1.5 text-[11px] text-destructive">
        <XCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        <span>
          {PROBLEM_TEXT[check.problem ?? "format"]}
          {check.problem === "checksum" && check.expectedCheckChar ? ` The last character should be ${check.expectedCheckChar}.` : ""}
        </span>
      </p>
    );
  }
  return (
    <div className="space-y-1 text-[11px]" aria-live="polite">
      <p className="flex items-center gap-1.5 text-emerald-700">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Valid GSTIN{check.stateName ? ` · ${check.stateName} (${check.stateCode})` : ""}
      </p>
      {check.pan && check.panMatchesBusiness === true && <p className="text-muted-foreground">The PAN {check.pan} matches your business PAN.</p>}
      {check.pan && check.panMatchesBusiness === false && (
        <p role="alert" className="flex items-start gap-1.5 text-amber-700">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>The PAN {check.pan} inside this GSTIN does not match your business PAN, so it cannot be registered. Check the GSTIN or update your PAN in Business profile.</span>
        </p>
      )}
      {check.pan && check.panMatchesBusiness === null && <p className="text-muted-foreground">The PAN inside is {check.pan}. Your business has no PAN yet, so it is not compared.</p>}
    </div>
  );
}

/** Add or edit one GST registration, with the live GSTIN check */
export function GstinDialog({ editing, hasRegistrations, onClose }: { editing: Gstin | null; hasRegistrations: boolean; onClose: () => void }) {
  const actions = useGstinActions();
  const states = useGstStates();
  const [gstin, setGstin] = useState(editing?.gstin ?? "");
  const [legalName, setLegalName] = useState(editing?.legalName ?? "");
  const [tradeName, setTradeName] = useState(editing?.tradeName ?? "");
  const [address, setAddress] = useState(editing?.registeredAddress ?? "");
  const [status, setStatus] = useState<GstinStatus>(editing?.status ?? "active");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [makePrimary, setMakePrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // a short pause after typing, so a complete GSTIN is checked once and not on every keystroke
  const [debounced, setDebounced] = useState(gstin);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(gstin), 350);
    return () => clearTimeout(t);
  }, [gstin]);
  const changed = !editing || gstin !== editing.gstin;
  const settled = debounced === gstin;
  const check = useGstinCheck(debounced, changed);
  const stateName = useMemo(() => (gstin.length >= 2 ? (states.data?.find((s) => s.code === gstin.slice(0, 2))?.name ?? null) : null), [gstin, states.data]);

  const busy = actions.add.isPending || actions.update.isPending;
  const checking = gstin.length === 15 && changed && (!settled || check.isFetching);
  const blocked = changed && gstin.length === 15 && !checking && !!check.data && (!check.data.valid || check.data.panMatchesBusiness === false);
  const canSubmit = gstin.length === 15 && !blocked && !checking && !busy;
  const isFirst = !hasRegistrations && !editing;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setFieldError(null);
    try {
      if (editing) {
        await actions.update.mutateAsync({
          id: editing.id,
          body: {
            version: editing.version,
            ...(changed ? { gstin } : {}),
            legalName: legalName.trim() || null,
            tradeName: tradeName.trim() || null,
            registeredAddress: address.trim(),
            status,
            notes: notes.trim() || null,
          },
        });
      } else {
        await actions.add.mutateAsync({
          gstin,
          legalName: legalName.trim() || null,
          tradeName: tradeName.trim() || null,
          ...(address.trim() ? { registeredAddress: address.trim() } : {}),
          status,
          notes: notes.trim() || null,
          makePrimary: makePrimary && status === "active",
        });
      }
      onClose();
    } catch (err) {
      if (isApiError(err) && err.fields?.gstin) setFieldError(err.fields.gstin);
      setError(gstinErrorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit GST registration" : "Register a GSTIN"}</DialogTitle>
          <DialogDescription>One registration per state. The GSTIN is checked as you type, and the PAN inside it must match your business PAN.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
          <Field id="gstin-number" label="GSTIN" error={fieldError} hint={undefined}>
            <Input
              id="gstin-number"
              value={gstin}
              maxLength={15}
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase"
              error={!!fieldError || (blocked && !!check.data && !check.data.valid)}
              aria-describedby="gstin-check"
              onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/\s/g, ""))}
            />
          </Field>
          <div id="gstin-check">
            <CheckResult gstin={gstin} checking={checking} check={changed ? check.data : undefined} failed={changed && check.isError} stateName={stateName} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="gstin-legal" label="Legal name">
              <Input id="gstin-legal" value={legalName} maxLength={200} onChange={(e) => setLegalName(e.target.value)} />
            </Field>
            <Field id="gstin-trade" label="Trade name">
              <Input id="gstin-trade" value={tradeName} maxLength={200} onChange={(e) => setTradeName(e.target.value)} />
            </Field>
          </div>
          <Field id="gstin-address" label="Registered address" hint={`${address.length}/400`}>
            <Textarea id="gstin-address" rows={2} maxLength={400} value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="gstin-status" label="Status" hint={editing?.isPrimary && status !== "active" ? "The primary registration cannot be deactivated while others exist." : undefined}>
              <select id="gstin-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as GstinStatus)}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="gstin-notes" label="Notes">
              <Input id="gstin-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
          {!editing && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="h-4 w-4 accent-black" checked={isFirst || makePrimary} disabled={isFirst || status !== "active"} onChange={(e) => setMakePrimary(e.target.checked)} />
              {isFirst ? "This will be your primary GSTIN (the first registration always is)" : "Make this the primary GSTIN"}
            </label>
          )}
          {error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-red-50 p-3 text-xs text-red-900">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!canSubmit}>
              {editing ? "Save registration" : "Register GSTIN"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
