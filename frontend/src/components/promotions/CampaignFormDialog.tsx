import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { promotionsApi } from "@/api/promotions.api";
import { errorMessage, isApiError } from "@/api/errors";
import { useCampaignLifecycle, useCreateCampaign, useUpdateCampaign } from "@/hooks/usePromotions";
import { toast } from "@/hooks/useToast";
import { PROMOTION_TYPES, type PickerVariant, type PromotionAccount, type PromotionCampaign, type PromotionType } from "@/types/promotions";
import { EMPTY_FORM, campaignFormSchema, formFromCampaign, serverFieldErrors, toCampaignWrite, type CampaignFormValues } from "./campaignForm";
import { ProductSelector } from "./ProductSelector";
import { EMPTY_SELECTION, isEmptySelection, toSelection, type SelectorValue } from "./selection";
import { TYPE_HINTS, TYPE_LABELS, symbol } from "./promoFormat";

const SELECT = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-xs";

function Field({ label, error, hint, required, children, htmlFor }: { label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-[11px] font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
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
  campaign: PromotionCampaign | null;
  accounts: PromotionAccount[];
  initialVariantIds?: string[];
  initialVariants?: PickerVariant[];
  onSaved: (campaign: PromotionCampaign) => void;
}

export function CampaignFormDialog({ open, onOpenChange, campaign, accounts, initialVariantIds, initialVariants, onSaved }: Props) {
  const editing = campaign !== null;
  const create = useCreateCampaign();
  const update = useUpdateCampaign();
  const lifecycle = useCampaignLifecycle();
  const [base, setBase] = useState<PromotionCampaign | null>(campaign);
  const [selection, setSelection] = useState<SelectorValue>(EMPTY_SELECTION);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const form = useForm<CampaignFormValues>({ resolver: zodResolver(campaignFormSchema), defaultValues: EMPTY_FORM, mode: "onTouched" });
  const { register, handleSubmit, reset, watch, setValue, setError, formState } = form;
  const { errors, isDirty } = formState;

  useEffect(() => {
    if (!open) return;
    setBase(campaign);
    reset(campaign ? formFromCampaign(campaign) : EMPTY_FORM);

    if (initialVariants && initialVariants.length > 0 && !campaign) {
      setSelection({
        mode: "variants",
        variants: initialVariants,
        categoryIds: [],
      });
    } else if (initialVariantIds && initialVariantIds.length > 0 && !campaign) {
      setSelection({
        mode: "variants",
        variants: initialVariantIds.map((id) => ({
          id,
          productId: id,
          sku: id.slice(0, 8),
          productTitle: "Selected Product",
          optionValues: {},
          sellingPriceMinor: 0,
          status: "active",
        })),
        categoryIds: [],
      });
    } else {
      setSelection(EMPTY_SELECTION);
    }

    setFormError(null);
    setConflict(false);
  }, [open, campaign, initialVariantIds, initialVariants, reset]);

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

  const save = (andSchedule = false) =>
    handleSubmit(async (values) => {
      setFormError(null);
      const body = toCampaignWrite(values);
      if (andSchedule && (!body.startsAt || !body.endsAt)) {
        if (!body.startsAt) setError("startsAt", { type: "required", message: "A scheduled campaign needs a start" });
        if (!body.endsAt) setError("endsAt", { type: "required", message: "A scheduled campaign needs an end" });
        return;
      }
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
      }
    })();

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto p-6">
          <DialogHeader className="pb-3 border-b border-border">
            <DialogTitle className="text-lg font-bold">{editing ? "Edit Campaign" : "Create Campaign"}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Prepare a campaign draft. Nothing is published automatically.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => e.preventDefault()} noValidate className="space-y-6 pt-2 text-xs">
            {conflict && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                <span>This campaign was changed by someone else while you were editing.</span>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void loadLatest()}>
                  Load latest version
                </Button>
              </div>
            )}

            {/* Campaign basics */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campaign basics</h3>
                <span className="text-[11px] text-muted-foreground">* Required</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Field label="Campaign name" required htmlFor="promo-name" error={errors.name?.message}>
                    <Input id="promo-name" placeholder="Festive Home Sale" {...register("name")} error={Boolean(errors.name)} className="text-xs" />
                  </Field>
                </div>

                <div>
                  <Field label="Sales channel" required htmlFor="promo-channel">
                    <select
                      id="promo-channel"
                      className={SELECT}
                      value={accountIds[0] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setValue("accountIds", val ? [val] : [], { shouldDirty: true });
                      }}
                    >
                      <option value="">Every connected channel</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.displayName || a.marketplace.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-border/80 bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>Illustrative setup only. Campaign creation, promotion types and schedules depend on connector/API support and require verification.</span>
              </div>
            </section>

            {/* Products */}
            {!editing && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Products *</h3>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {selection.variants.length} selected · illustrative products
                  </span>
                </div>
                <ProductSelector value={selection} onChange={setSelection} disabled={busy} />
              </section>
            )}

            {/* Promotion details */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Promotion details</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Promotion type" required htmlFor="promo-type">
                  <select id="promo-type" className={SELECT} {...register("type")}>
                    {PROMOTION_TYPES.map((t: PromotionType) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </Field>

                {percent && (
                  <Field label="Proposed discount" required htmlFor="promo-percent" error={errors.percent?.message}>
                    <div className="relative">
                      <Input id="promo-percent" inputMode="decimal" placeholder="10" {...register("percent")} error={Boolean(errors.percent)} className="pr-8 text-xs font-mono" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">%</span>
                    </div>
                  </Field>
                )}

                {type === "flat_discount" && (
                  <Field label={`Proposed discount (${sym})`} required htmlFor="promo-flat" error={errors.flat?.message}>
                    <Input id="promo-flat" inputMode="decimal" placeholder="200" {...register("flat")} error={Boolean(errors.flat)} className="text-xs font-mono" />
                  </Field>
                )}

                {(type === "bogo" || type === "bundle") && (
                  <Field label={type === "bundle" ? "Items in the bundle" : "Buy quantity"} required htmlFor="promo-buy" error={errors.buyQuantity?.message}>
                    <Input id="promo-buy" inputMode="numeric" placeholder={type === "bundle" ? "3" : "2"} {...register("buyQuantity")} error={Boolean(errors.buyQuantity)} className="text-xs font-mono" />
                  </Field>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Proposed values only; not a verified channel offer. Confirm supported types, fees and rules before submission.
              </p>
            </section>

            {/* Schedule */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Schedule</h3>
                <span className="text-[11px] text-muted-foreground">India Standard Time (UTC+05:30)</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Starts" required htmlFor="promo-start" error={errors.startsAt?.message}>
                  <Input id="promo-start" type="datetime-local" {...register("startsAt")} error={Boolean(errors.startsAt)} className="text-xs" />
                </Field>
                <Field label="Ends" required htmlFor="promo-end" error={errors.endsAt?.message}>
                  <Input id="promo-end" type="datetime-local" {...register("endsAt")} error={Boolean(errors.endsAt)} className="text-xs" />
                </Field>
              </div>
            </section>

            {/* Notice / Guarantee Box */}
            <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3.5 text-xs">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
              <div className="space-y-0.5">
                <p className="font-semibold text-foreground">Creating saves a draft, not a live promotion.</p>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Submission is a separate action requiring connector support and your explicit confirmation. AI advice never automatically enrolls products.
                </p>
              </div>
            </div>

            {formError && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                {formError}
              </p>
            )}

            <DialogFooter className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row pt-3 border-t border-border">
              <span className="text-[11px] text-muted-foreground">Sample values · not submitted</span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={busy} onClick={() => requestClose(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 bg-foreground text-xs text-background hover:bg-foreground/90"
                  loading={busy}
                  disabled={conflict}
                  onClick={() => void save(false)}
                >
                  {editing ? "Save Changes" : "Create Campaign"}
                </Button>
              </div>
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
