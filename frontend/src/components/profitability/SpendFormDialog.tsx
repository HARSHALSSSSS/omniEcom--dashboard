import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { errorMessage, isApiError } from "@/api/errors";
import { useCreateSpend, useUpdateSpend } from "@/hooks/useProfitability";
import { currencySymbol } from "@/utils/format";
import type { SpendAccount, SpendRow } from "@/types/profitability";
import { isoDay } from "./profitFormat";
import { NOT_TIED, emptySpendForm, formFromSpend, serverFieldErrors, spendFormSchema, toSpendWrite, type SpendFormValues } from "./spendForm";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: React.ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-[11px] font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

const SELECT = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** the row being corrected; null records new spend */
  row: SpendRow | null;
  accounts: SpendAccount[];
  onSaved: (row: SpendRow, created: boolean) => void;
}

/** record advertising spend for a day (optionally for one marketplace account), or correct a recorded row */
export function SpendFormDialog({ open, onOpenChange, row, accounts, onSaved }: Props) {
  const editing = row !== null;
  const create = useCreateSpend();
  const update = useUpdateSpend();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const today = isoDay(new Date());

  const form = useForm<SpendFormValues>({ resolver: zodResolver(spendFormSchema), defaultValues: emptySpendForm(today), mode: "onTouched" });
  const { register, handleSubmit, reset, setError, formState } = form;
  const { errors, isDirty } = formState;
  const busy = create.isPending || update.isPending;

  // every time the dialog opens it starts from the row (or a blank form for today)
  useEffect(() => {
    if (!open) return;
    reset(row ? formFromSpend(row) : emptySpendForm(isoDay(new Date())));
    setFormError(null);
  }, [open, row, reset]);

  const requestClose = (next: boolean) => {
    if (next) return onOpenChange(true);
    if (busy) return;
    if (isDirty) return setConfirmDiscard(true);
    onOpenChange(false);
  };

  const acquire = useSubmitLock();
  const save = handleSubmit(async (values) => {
    setFormError(null);
    const body = toSpendWrite(values);
    const release = acquire();
    if (!release) return;
    try {
      const saved = row ? await update.mutateAsync({ id: row.id, body }) : await create.mutateAsync(body);
      onOpenChange(false);
      onSaved(saved, !row);
    } catch (e) {
      if (isApiError(e)) {
        const fields = serverFieldErrors(e);
        fields.forEach((f) => setError(f.field, { type: "server", message: f.message }));
        if (fields.length > 0) return setFormError("Some fields need a correction.");
        if (e.status === 404) return setFormError("This row no longer exists. Close the dialog and refresh.");
      }
      setFormError(errorMessage(e));
    } finally {
      release();
    }
  });

  // an account that was disconnected since still has to show for the row that uses it
  const options = row?.accountId && !accounts.some((a) => a.id === row.accountId) ? [...accounts, { id: row.accountId, marketplace: row.marketplace ?? "", displayName: row.accountName ?? "Removed account", status: "" }] : accounts;

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Correct advertising spend" : "Record advertising spend"}</DialogTitle>
            <DialogDescription>Spend feeds the advertising step of the waterfall. A day with no ads can be recorded as 0.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void save(e)} noValidate className="space-y-4 text-xs">
            {formError && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2.5 text-red-800">
                {formError}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date" htmlFor="spend-date" error={errors.spendDate?.message}>
                <Input id="spend-date" type="date" max={today} {...register("spendDate")} error={Boolean(errors.spendDate)} />
              </Field>
              <Field label={`Amount (${currencySymbol()})`} htmlFor="spend-amount" error={errors.amount?.message}>
                <Input id="spend-amount" inputMode="decimal" placeholder="1250.50" {...register("amount")} error={Boolean(errors.amount)} />
              </Field>
            </div>
            <Field label="Marketplace account" htmlFor="spend-account" error={errors.accountId?.message} hint="Leave as not tied when the spend is not for one marketplace: it counts in the total but in no channel row.">
              <select id="spend-account" className={SELECT} {...register("accountId")}>
                <option value={NOT_TIED}>Not tied to an account</option>
                {options.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName}
                    {a.marketplace ? ` (${a.marketplace})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Campaign (optional)" htmlFor="spend-campaign" error={errors.campaign?.message} hint="Spend is identified by date, account and campaign.">
              <Input id="spend-campaign" placeholder="e.g. Sponsored products" {...register("campaign")} error={Boolean(errors.campaign)} />
            </Field>
            <Field label="Notes (optional)" htmlFor="spend-notes" error={errors.notes?.message}>
              <Textarea id="spend-notes" rows={2} {...register("notes")} />
            </Field>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="w-full sm:w-auto h-10 sm:h-9" disabled={busy} onClick={() => requestClose(false)}>
                Cancel
              </Button>
              <Button type="submit" className="w-full sm:w-auto h-10 sm:h-9" loading={busy}>
                {editing ? "Save changes" : "Record spend"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard your changes?"
        description="What you typed has not been saved."
        confirmText="Discard"
        variant="destructive"
        onConfirm={() => {
          setConfirmDiscard(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
