import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { promotionsApi } from "@/api/promotions.api";
import { errorMessage, isApiError } from "@/api/errors";
import { useCampaignLifecycle, useCreateCampaign, useUpdateCampaign } from "@/hooks/usePromotions";
import { toast } from "@/hooks/useToast";
import { PROMOTION_TYPES, type PromotionAccount, type PromotionCampaign, type PromotionType } from "@/types/promotions";
import { EMPTY_FORM, campaignFormSchema, formFromCampaign, serverFieldErrors, toCampaignWrite, type CampaignFormValues } from "./campaignForm";
import { ProductSelector } from "./ProductSelector";
import { EMPTY_SELECTION, isEmptySelection, toSelection, type SelectorValue } from "./selection";
import { TYPE_HINTS, TYPE_LABELS, symbol } from "./promoFormat";

const SELECT = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm";

function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** the draft being edited; null creates a new campaign */
  campaign: PromotionCampaign | null;
  accounts: PromotionAccount[];
  /** called once the campaign is saved (and scheduled, when asked) */
  onSaved: (campaign: PromotionCampaign) => void;
}

/** create a draft (with its products) or edit a draft's terms, dates, budget and channels */
export function CampaignFormDialog({ open, onOpenChange, campaign, accounts, onSaved }: Props) {
  const editing = campaign !== null;
  const create = useCreateCampaign();
  const update = useUpdateCampaign();
  const lifecycle = useCampaignLifecycle();
  const [base, setBase] = useState<PromotionCampaign | null>(campaign);
  const [selection, setSelection] = useState<SelectorValue>(EMPTY_SELECTION);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // a double click can fire the save twice before the buttons re-render as disabled: only the first call goes out
  const saving = useRef(false);

  const form = useForm<CampaignFormValues>({ resolver: zodResolver(campaignFormSchema), defaultValues: EMPTY_FORM, mode: "onTouched" });
  const { register, handleSubmit, reset, watch, setValue, setError, formState } = form;
  const { errors, isDirty } = formState;

  // every time the dialog opens it starts from the campaign (or a blank form)
  useEffect(() => {
    if (!open) return;
    setBase(campaign);
    reset(campaign ? formFromCampaign(campaign) : EMPTY_FORM);
    setSelection(EMPTY_SELECTION);
    setFormError(null);
    setConflict(false);
  }, [open, campaign, reset]);

  const type = watch("type");
  const accountIds = watch("accountIds");
  const busy = create.isPending || update.isPending || lifecycle.isPending;
  const dirty = isDirty || (!editing && !isEmptySelection(selection));
  const percent = type === "percentage_discount" || type === "bundle";
  const sym = useMemo(symbol, []);

  const requestClose = (next: boolean) => {
    if (next) return onOpenChange(true);
    if (busy) return;
    if (dirty) return setConfirmDiscard(true);
    onOpenChange(false);
  };

  const applyServerError = (e: unknown) => {
    if (isApiError(e)) {
      if (e.code === "VERSION_CONFLICT") {
        setConflict(true);
        return;
      }
      const fields = serverFieldErrors(e);
      fields.forEach((f) => setError(f.field, { type: "server", message: f.message }));
      if (fields.length > 0) return setFormError("Some fields need a correction.");
    }
    setFormError(errorMessage(e));
  };

  const loadLatest = async () => {
    if (!base) return;
    try {
      const latest = await promotionsApi.campaign(base.id);
      setBase(latest);
      reset(formFromCampaign(latest));
      setConflict(false);
      setFormError(null);
    } catch (e) {
      setFormError(errorMessage(e));
    }
  };

  const save = (andSchedule: boolean) =>
    handleSubmit(async (values) => {
      setFormError(null);
      const body = toCampaignWrite(values);
      if (andSchedule && (!body.startsAt || !body.endsAt)) {
        if (!body.startsAt) setError("startsAt", { type: "required", message: "A scheduled campaign needs a start" });
        if (!body.endsAt) setError("endsAt", { type: "required", message: "A scheduled campaign needs an end" });
        return;
      }
      if (saving.current) return;
      saving.current = true;
      try {
        let saved: PromotionCampaign;
        if (base) {
          saved = await update.mutateAsync({ id: base.id, body: { ...body, version: base.version } });
        } else {
          const res = await create.mutateAsync({ ...body, selection: toSelection(selection) });
          saved = res.campaign;
          const skipped = res.products?.skipped.length ?? 0;
          if (skipped > 0) toast({ title: `${skipped} product${skipped === 1 ? "" : "s"} could not be added`, description: "They have no selling price or were not found.", variant: "warning" });
        }
        if (andSchedule) {
          try {
            const res = await lifecycle.mutateAsync({ id: saved.id, action: "schedule", version: saved.version });
            saved = res.campaign;
          } catch (e) {
            toast({ title: "Saved as a draft, but not scheduled", description: errorMessage(e), variant: "destructive" });
          }
        }
        onOpenChange(false);
        onSaved(saved);
      } catch (e) {
        applyServerError(e);
      } finally {
        saving.current = false;
      }
    })();

  const toggleAccount = (id: string) => setValue("accountIds", accountIds.includes(id) ? accountIds.filter((x) => x !== id) : [...accountIds, id], { shouldDirty: true });

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit draft campaign" : "New campaign"}</DialogTitle>
            <DialogDescription>
              {editing ? "Changing prices, channels or dates re-checks every product." : "A campaign is saved as a draft first. Check which products can run, then schedule it."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => e.preventDefault()} noValidate className="space-y-5 text-xs">
            {conflict && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                <span>This campaign was changed by someone else while you were editing.</span>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void loadLatest()}>
                  Load latest version
                </Button>
              </div>
            )}

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Campaign name" htmlFor="promo-name" error={errors.name?.message}>
                  <Input id="promo-name" placeholder="e.g. Diwali Mega Fest" {...register("name")} error={Boolean(errors.name)} />
                </Field>
              </div>
              <Field label="Campaign code (optional)" htmlFor="promo-code" error={errors.code?.message} hint="Internal reference, generated when left blank. It is not sent to marketplaces as a coupon.">
                <Input id="promo-code" placeholder="e.g. FESTIVE20" className="font-mono uppercase" {...register("code")} error={Boolean(errors.code)} />
              </Field>
              <Field label="Description (optional)" htmlFor="promo-desc" error={errors.description?.message}>
                <Textarea id="promo-desc" rows={2} {...register("description")} />
              </Field>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-foreground">Discount</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Discount type" htmlFor="promo-type" hint={TYPE_HINTS[type]}>
                  <select id="promo-type" className={SELECT} {...register("type")}>
                    {PROMOTION_TYPES.map((t: PromotionType) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </Field>
                {percent && (
                  <Field label={type === "bundle" ? "Bundle discount (%)" : "Discount (%)"} htmlFor="promo-percent" error={errors.percent?.message}>
                    <Input id="promo-percent" inputMode="decimal" placeholder="15" {...register("percent")} error={Boolean(errors.percent)} />
                  </Field>
                )}
                {type === "flat_discount" && (
                  <Field label={`Amount off (${sym})`} htmlFor="promo-flat" error={errors.flat?.message}>
                    <Input id="promo-flat" inputMode="decimal" placeholder="200" {...register("flat")} error={Boolean(errors.flat)} />
                  </Field>
                )}
                {(type === "bogo" || type === "bundle") && (
                  <Field label={type === "bundle" ? "Items in the bundle" : "Buy quantity"} htmlFor="promo-buy" error={errors.buyQuantity?.message}>
                    <Input id="promo-buy" inputMode="numeric" placeholder={type === "bundle" ? "3" : "2"} {...register("buyQuantity")} error={Boolean(errors.buyQuantity)} />
                  </Field>
                )}
                {type === "bogo" && (
                  <Field label="Get quantity (free)" htmlFor="promo-get" error={errors.getQuantity?.message}>
                    <Input id="promo-get" inputMode="numeric" placeholder="1" {...register("getQuantity")} error={Boolean(errors.getQuantity)} />
                  </Field>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-foreground">Schedule and budget</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Starts" htmlFor="promo-start" error={errors.startsAt?.message} hint="Business time zone. A start in the past runs as soon as it is scheduled.">
                  <Input id="promo-start" type="datetime-local" {...register("startsAt")} error={Boolean(errors.startsAt)} />
                </Field>
                <Field label="Ends" htmlFor="promo-end" error={errors.endsAt?.message}>
                  <Input id="promo-end" type="datetime-local" {...register("endsAt")} error={Boolean(errors.endsAt)} />
                </Field>
                <Field label={`Discount budget (${sym}, optional)`} htmlFor="promo-budget" error={errors.budget?.message} hint="The campaign ends by itself once the discount given reaches this. Leave blank for no limit.">
                  <Input id="promo-budget" inputMode="decimal" placeholder="50000" {...register("budget")} error={Boolean(errors.budget)} />
                </Field>
                <Field label={`Minimum order (${sym}, optional)`} htmlFor="promo-min" error={errors.minOrder?.message} hint="For your reference: marketplaces cannot enforce a minimum order on a sale price.">
                  <Input id="promo-min" inputMode="decimal" placeholder="0" {...register("minOrder")} error={Boolean(errors.minOrder)} />
                </Field>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-foreground">Marketplaces</h3>
              {accounts.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No marketplace account is connected yet. Connect one in the marketplace hub to run a campaign.</p>
              ) : (
                <>
                  <div role="group" aria-label="Marketplace accounts" className="flex flex-wrap gap-2">
                    {accounts.map((a) => {
                      const on = accountIds.includes(a.id);
                      const usable = a.status === "active" || on;
                      return (
                        <label key={a.id} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${on ? "border-primary bg-primary/5" : "border-border"} ${usable ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>
                          <input type="checkbox" checked={on} disabled={!usable} onChange={() => toggleAccount(a.id)} className="h-3.5 w-3.5 accent-[#1D4ED8]" />
                          <span className="font-medium">{a.displayName}</span>
                          {a.status !== "active" && <span className="text-[10px] text-muted-foreground">{a.status}</span>}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{accountIds.length === 0 ? "Runs on every connected account." : `Runs on ${accountIds.length} selected account${accountIds.length === 1 ? "" : "s"}.`}</p>
                </>
              )}
              {errors.accountIds?.message && (
                <p role="alert" className="text-[11px] text-destructive">
                  {errors.accountIds.message}
                </p>
              )}
            </section>

            {!editing && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-foreground">Products</h3>
                <ProductSelector value={selection} onChange={setSelection} disabled={busy} />
                <p className="text-[11px] text-muted-foreground">You can also add or change products from the campaign after saving.</p>
              </section>
            )}

            {formError && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                {formError}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => requestClose(false)}>
                Cancel
              </Button>
              <Button type="button" variant="outline" loading={busy} disabled={conflict} onClick={() => void save(false)}>
                {editing ? "Save changes" : "Save draft"}
              </Button>
              <Button type="button" loading={busy} disabled={conflict} onClick={() => void save(true)}>
                Save &amp; schedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard your changes?"
        description="The campaign has not been saved. Leaving now loses what you entered."
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
