import { useEffect, useRef, useState } from "react";
import { useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { isApiError } from "@/api/errors";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreatePolicy, usePolicyPreview, useUpdatePolicy } from "@/hooks/usePricing";
import { toast } from "@/hooks/useToast";
import { formatNumber } from "@/utils/format";
import { PRICING_STRATEGIES, type PricingChannel, type PricingPolicy } from "@/types/pricing";
import { SELECT_CLASS } from "../PricingStates";
import { STRATEGY_HINTS, STRATEGY_LABELS, isVersionConflict } from "../pricingFormat";
import { EMPTY_POLICY, RULE_FIELD, SERVER_FIELD, policySchema, toFormValues, toWrite, type PolicyFormValues } from "./policyForm";

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-xs font-semibold">
      {label}
      {children}
      {hint && !error && <span className="block text-[11px] font-normal text-muted-foreground">{hint}</span>}
      {error && (
        <span role="alert" className="block text-[11px] font-normal text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}

interface PolicyDialogProps {
  open: boolean;
  /** null = a new policy */
  policy: PricingPolicy | null;
  channels: PricingChannel[];
  onClose: () => void;
  /** somebody else changed the policy first: the list reloads and this dialog closes */
  onConflict: () => void;
}

export function PolicyDialog({ open, policy, channels, onClose, onConflict }: PolicyDialogProps) {
  const create = useCreatePolicy();
  const update = useUpdatePolicy();
  const [formError, setFormError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isDirty },
  } = useForm<PolicyFormValues>({ resolver: zodResolver(policySchema), defaultValues: EMPTY_POLICY, mode: "onTouched" });

  useEffect(() => {
    if (!open) return;
    reset(policy ? toFormValues(policy) : EMPTY_POLICY);
    setFormError(null);
    setDiscarding(false);
  }, [open, policy, reset]);

  const strategy = watch("strategy");
  const accountId = watch("accountId");
  const preview = usePolicyPreview(accountId || null, open);
  const saving = create.isPending || update.isPending;
  const sending = useRef(false);
  const message = (name: FieldPath<PolicyFormValues>) => errors[name]?.message;
  /** closing with unsaved edits asks first */
  const requestClose = () => {
    if (saving) return;
    if (isDirty) setDiscarding(true);
    else onClose();
  };

  const onError = (e: unknown) => {
    if (policy && isVersionConflict(e)) {
      toast({ title: "Policy changed by someone else", description: "The latest version was loaded. Open it again to review.", variant: "destructive" });
      onConflict();
      return;
    }
    if (isApiError(e)) {
      let placed = false;
      for (const [path, text] of Object.entries(e.fields ?? {})) {
        const field = SERVER_FIELD[path];
        if (field) {
          setError(field, { type: "server", message: text });
          placed = true;
        }
      }
      const ruleField = e.rule ? RULE_FIELD[e.rule] : undefined;
      if (ruleField) {
        setError(ruleField, { type: "server", message: e.message });
        placed = true;
      }
      if (placed) return;
    }
    setFormError(isApiError(e) ? e.message : "Could not save the policy. Please try again.");
  };

  const submit = handleSubmit((values) => {
    // a double click fires the handler twice before the button can re-render as disabled: only the first goes out
    if (sending.current) return;
    sending.current = true;
    setFormError(null);
    const body = toWrite(values);
    if (policy) {
      update.mutate(
        { id: policy.id, patch: body, version: policy.version },
        {
          onSuccess: () => {
            toast({ title: "Policy saved", description: body.name });
            onClose();
          },
          onError,
          onSettled: () => {
            sending.current = false;
          },
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: () => {
          toast({ title: "Policy created", description: body.name });
          onClose();
        },
        onError,
        onSettled: () => {
          sending.current = false;
        },
      });
    }
  });

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && requestClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{policy ? "Edit pricing policy" : "New pricing policy"}</DialogTitle>
          <DialogDescription className="text-xs">A policy tells the system how to propose prices. The guardrails below always apply, whatever the strategy.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Name" error={message("name")}>
            <Input aria-label="Name" {...register("name")} error={Boolean(errors.name)} className="text-xs" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Channel" error={message("accountId")} hint={preview.data ? `Looks at ${formatNumber(preview.data.affectedVariants)} ${preview.data.affectedVariants === 1 ? "listing" : "listings"}` : undefined}>
              <select aria-label="Channel" className={`${SELECT_CLASS} w-full`} {...register("accountId")}>
                <option value="">All channels</option>
                {channels.map((c) => (
                  <option key={c.accountId} value={c.accountId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Strategy" hint={STRATEGY_HINTS[strategy]}>
              <select aria-label="Strategy" className={`${SELECT_CLASS} w-full`} {...register("strategy")}>
                {PRICING_STRATEGIES.map((s) => (
                  <option key={s} value={s}>
                    {STRATEGY_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-semibold text-muted-foreground">Guardrails (%)</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Margin floor" error={message("targetMarginMin")} hint="Never earn less than this">
                <Input aria-label="Margin floor" inputMode="decimal" {...register("targetMarginMin")} error={Boolean(errors.targetMarginMin)} className="text-xs" />
              </Field>
              <Field label="Max discount" error={message("maxDiscount")} hint="0 = never lower a price">
                <Input aria-label="Max discount" inputMode="decimal" {...register("maxDiscount")} error={Boolean(errors.maxDiscount)} className="text-xs" />
              </Field>
              <Field label="Auto-apply under" error={message("autoApproveUnder")} hint="0 = always review">
                <Input aria-label="Auto-apply under" inputMode="decimal" {...register("autoApproveUnder")} error={Boolean(errors.autoApproveUnder)} className="text-xs" />
              </Field>
            </div>
          </fieldset>

          {strategy === "automated_match" && (
            <div className="grid items-end gap-3 sm:grid-cols-2">
              <Field label="Undercut the competitor by (%)" error={message("undercut")} hint="Empty or 0 = match exactly">
                <Input aria-label="Undercut" inputMode="decimal" {...register("undercut")} error={Boolean(errors.undercut)} className="text-xs" />
              </Field>
              <label className="flex items-center gap-2 pb-2 text-xs font-semibold">
                <input type="checkbox" className="h-4 w-4 accent-[#1D4ED8]" {...register("allowIncrease")} />
                Also raise prices towards a higher competitor
              </label>
            </div>
          )}
          {strategy === "velocity_boost" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Slow = fewer than (units / 30 days)" error={message("slowUnits")} hint="Default 5">
                <Input aria-label="Slow units" inputMode="numeric" {...register("slowUnits")} error={Boolean(errors.slowUnits)} className="text-xs" />
              </Field>
              <Field label="Only with stock of at least" error={message("minStock")} hint="Default 10">
                <Input aria-label="Minimum stock" inputMode="numeric" {...register("minStock")} error={Boolean(errors.minStock)} className="text-xs" />
              </Field>
              <Field label="Cut the price by (%)" error={message("step")} hint="Default 5">
                <Input aria-label="Price cut" inputMode="decimal" {...register("step")} error={Boolean(errors.step)} className="text-xs" />
              </Field>
            </div>
          )}
          {strategy === "custom" && (
            <Field label="Target margin (%)" error={message("targetMargin")} hint="The margin the price should earn after cost and fees">
              <Input aria-label="Target margin" inputMode="decimal" {...register("targetMargin")} error={Boolean(errors.targetMargin)} className="text-xs" />
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Proposals stay open for (days)" error={message("expiresInDays")} hint="Default 7">
              <Input aria-label="Days open" inputMode="numeric" {...register("expiresInDays")} error={Boolean(errors.expiresInDays)} className="text-xs" />
            </Field>
            <Field label="Status">
              <select aria-label="Status" className={`${SELECT_CLASS} w-full`} {...register("status")}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </Field>
          </div>

          {formError && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {formError}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" size="sm" disabled={saving} onClick={requestClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              {policy ? "Save changes" : "Create policy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={discarding}
      onOpenChange={setDiscarding}
      title="Discard your changes?"
      description="The edits you made to this policy have not been saved."
      confirmText="Discard changes"
      variant="destructive"
      onConfirm={() => {
        setDiscarding(false);
        onClose();
      }}
    />
    </>
  );
}
