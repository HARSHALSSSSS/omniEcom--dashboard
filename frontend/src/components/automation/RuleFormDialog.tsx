import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { automationApi } from "@/api/automation.api";
import { errorMessage, isApiError } from "@/api/errors";
import { useCreateRule, useUpdateRule } from "@/hooks/useAutomation";
import { MODE_HINTS, MODE_LABELS, STATUS_LABELS, WEEKDAYS, actionLabel, hourLabel, triggerLabel } from "./autoFormat";
import { ActionParamsEditor } from "./ActionParamsEditor";
import { ConditionsEditor } from "./ConditionsEditor";
import { Field, SELECT } from "./FormBits";
import { EMPTY_FORM, PARAM_SPECS, actionsFor, factsFor, formFromRule, initialParams, ruleFormSchema, serverFieldErrors, toRuleWrite, type RuleFormValues } from "./ruleForm";
import { RULE_MODES, type AutomationCatalog, type AutomationRule, type RuleStatus } from "@/types/automation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** the rule being edited; null creates a new one */
  rule: AutomationRule | null;
  catalog: AutomationCatalog | undefined;
  catalogLoading: boolean;
  onSaved: (rule: AutomationRule) => void;
}

/** the builder: when (trigger), only if (conditions), then (action and its parameters), and whether a person approves each run */
export function RuleFormDialog({ open, onOpenChange, rule, catalog, catalogLoading, onSaved }: Props) {
  const editing = rule !== null;
  const create = useCreateRule();
  const update = useUpdateRule();
  const [base, setBase] = useState<AutomationRule | null>(rule);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const form = useForm<RuleFormValues>({ resolver: zodResolver(ruleFormSchema), defaultValues: EMPTY_FORM, mode: "onTouched" });
  const { register, handleSubmit, reset, watch, setValue, setError, formState } = form;
  const { errors, isDirty } = formState;

  useEffect(() => {
    if (!open) return;
    setBase(rule);
    reset(rule ? formFromRule(rule) : EMPTY_FORM);
    setFormError(null);
    setConflict(false);
  }, [open, rule, reset]);

  const trigger = watch("triggerEvent");
  const actionType = watch("actionType");
  const mode = watch("mode");
  const busy = create.isPending || update.isPending;
  const actions = useMemo(() => actionsFor(catalog, trigger), [catalog, trigger]);
  const facts = useMemo(() => factsFor(catalog, trigger), [catalog, trigger]);
  const operators = useMemo(() => catalog?.operators ?? [], [catalog]);
  const triggerDescription = catalog?.triggers.find((t) => t.event === trigger)?.description;
  const actionDescription = actions.find((a) => a.type === actionType)?.description;
  // a rule whose action the catalog no longer lists still shows it, so editing it never silently swaps the action
  const actionOptions = actionType && !actions.some((a) => a.type === actionType) ? [...actions, { type: actionType, description: "", triggers: "*" as const, reversible: false }] : actions;

  const requestClose = (next: boolean) => {
    if (next) return onOpenChange(true);
    if (busy) return;
    if (isDirty) return setConfirmDiscard(true);
    onOpenChange(false);
  };

  const onTrigger = (event: string) => {
    setValue("triggerEvent", event, { shouldDirty: true, shouldValidate: true });
    // an action that does not fit the new trigger is dropped
    const fits = actionsFor(catalog, event);
    if (actionType && !fits.some((a) => a.type === actionType)) {
      setValue("actionType", "", { shouldDirty: true });
      setValue("params", {}, { shouldDirty: true });
    }
  };

  const onAction = (type: string) => {
    setValue("actionType", type, { shouldDirty: true, shouldValidate: true });
    setValue("params", initialParams(type), { shouldDirty: true });
  };

  const applyServerError = (e: unknown) => {
    if (isApiError(e)) {
      if (e.code === "VERSION_CONFLICT") return setConflict(true);
      const keys = (PARAM_SPECS[actionType] ?? []).map((s) => s.key);
      const fields = serverFieldErrors(e, keys);
      fields.forEach((f) => setError(f.field, { type: "server", message: f.message }));
      if (fields.length > 0) return setFormError("Some fields need a correction.");
      if (e.rule === "feature_disabled") return setFormError("Automation is not enabled for this business.");
    }
    setFormError(errorMessage(e));
  };

  const loadLatest = async () => {
    if (!base) return;
    try {
      const latest = await automationApi.rule(base.id);
      setBase(latest);
      reset(formFromRule(latest));
      setConflict(false);
      setFormError(null);
    } catch (e) {
      setFormError(errorMessage(e));
    }
  };

  const save = (status?: RuleStatus) =>
    handleSubmit(async (values) => {
      setFormError(null);
      const body = toRuleWrite(status ? { ...values, status } : values);
      try {
        const saved = base ? await update.mutateAsync({ id: base.id, body: { ...body, version: base.version } }) : await create.mutateAsync(body);
        onOpenChange(false);
        onSaved(saved);
      } catch (e) {
        applyServerError(e);
      }
    })();

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit rule" : "New automation rule"}</DialogTitle>
            <DialogDescription>When something happens, and your conditions hold, do one thing. Rules start as drafts and ask for approval until you say otherwise.</DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => e.preventDefault()} noValidate className="space-y-5 text-xs">
            {conflict && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                <span>This rule was changed by someone else while you were editing.</span>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void loadLatest()}>
                  Load latest version
                </Button>
              </div>
            )}

            <section className="grid gap-3 sm:grid-cols-2">
              <Field label="Rule name" htmlFor="rule-name" error={errors.name?.message}>
                <Input id="rule-name" placeholder="e.g. Draft a PO when stock runs low" {...register("name")} error={Boolean(errors.name)} />
              </Field>
              <Field label="Description (optional)" htmlFor="rule-desc" error={errors.description?.message}>
                <Textarea id="rule-desc" rows={1} {...register("description")} />
              </Field>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-foreground">When</h3>
              <Field label="Trigger" htmlFor="rule-trigger" error={errors.triggerEvent?.message} hint={triggerDescription}>
                <select id="rule-trigger" className={SELECT} value={trigger} disabled={catalogLoading || !catalog} onChange={(e) => onTrigger(e.target.value)}>
                  <option value="">{catalogLoading ? "Loading triggers..." : "Choose a trigger"}</option>
                  {trigger && !catalog?.triggers.some((t) => t.event === trigger) && <option value={trigger}>{trigger}</option>}
                  {catalog?.triggers.map((t) => (
                    <option key={t.event} value={t.event}>
                      {triggerLabel(t.event, catalog)}
                    </option>
                  ))}
                </select>
              </Field>

              {trigger === "schedule.cadence" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Repeats" htmlFor="rule-weekday" hint="In the business time zone.">
                    <select id="rule-weekday" className={SELECT} {...register("weekday")}>
                      <option value="">Every day</option>
                      {WEEKDAYS.map((d, i) => (
                        <option key={d} value={String(i + 1)}>
                          Every {d}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="At" htmlFor="rule-hour" error={errors.hour?.message}>
                    <select id="rule-hour" className={SELECT} {...register("hour")}>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={String(h)}>
                          {hourLabel(h)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
            </section>

            {trigger && <ConditionsEditor form={form} facts={facts} operators={operators.length > 0 ? operators : ["eq"]} />}
            {errors.conditions?.message && (
              <p role="alert" className="text-[11px] text-destructive">
                {errors.conditions.message}
              </p>
            )}

            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-foreground">Then</h3>
              <Field label="Action" htmlFor="rule-action" error={errors.actionType?.message} hint={trigger ? actionDescription : "Choose a trigger first: the actions depend on it."}>
                <select id="rule-action" className={SELECT} value={actionType} disabled={!trigger} onChange={(e) => onAction(e.target.value)}>
                  <option value="">Choose an action</option>
                  {actionOptions.map((a) => (
                    <option key={a.type} value={a.type}>
                      {actionLabel(a.type)}
                      {a.reversible ? " (can be rolled back)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <ActionParamsEditor form={form} actionType={actionType} />
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-foreground">Approval and status</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Each run" htmlFor="rule-mode" hint={MODE_HINTS[mode]}>
                  <select id="rule-mode" className={SELECT} {...register("mode")}>
                    {RULE_MODES.map((m) => (
                      <option key={m} value={m}>
                        {MODE_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Status" htmlFor="rule-status" hint="Only active rules react to events. A draft or disabled rule does nothing.">
                  <select id="rule-status" className={SELECT} {...register("status")}>
                    {(editing ? (["draft", "active", "disabled"] as const) : (["draft", "active"] as const)).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>

            {formError && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                {formError}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => requestClose(false)}>
                Cancel
              </Button>
              <Button type="button" loading={busy} disabled={conflict} onClick={() => void save()}>
                {editing ? "Save changes" : "Save rule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard your changes?"
        description="The rule has not been saved. Leaving now loses what you entered."
        confirmText="Discard"
        cancelText="Keep editing"
        variant="destructive"
        onConfirm={() => {
          setConfirmDiscard(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
