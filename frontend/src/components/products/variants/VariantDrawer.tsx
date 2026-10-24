import { useState, type ReactNode } from "react";
import { useFieldArray, useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/useToast";
import { useCreateVariant, useUpdateVariant, useVariantDetail } from "@/hooks/useVariants";
import { errorMessage, isApiError } from "@/api/errors";
import type { VariantDetail } from "@/types/variants";
import {
  createPayload,
  diffFromDetail,
  emptyForm,
  formFromDetail,
  leadTimeChange,
  serverFieldToForm,
  variantFormSchema,
  type VariantFormValues,
} from "./variantForm";
import { looksLikeBadGtin } from "./variantUtils";
import { useSubmitLock } from "@/hooks/useSubmitGuard";

const label = "text-[12px] font-medium text-[#000000]";
const hint = "text-[11px] text-[#666666]";
const err = "text-[11px] text-[#B42318]";

function Field({ id, title, error, help, children }: { id: string; title: string; error?: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={label}>
        {title}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className={err}>
          {error}
        </p>
      ) : (
        help && <p className={hint}>{help}</p>
      )}
    </div>
  );
}

const rupee = (node: ReactNode) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#666666]">₹</span>
    {node}
  </div>
);

interface FormProps {
  productId: string;
  base: VariantDetail | null;
  initial: VariantFormValues;
  leadBefore: number | null;
  readOnly: boolean;
  onDone: () => void;
  onReload: () => void;
}

function VariantForm({ productId, base, initial, leadBefore, readOnly, onDone, onReload }: FormProps) {
  const create = useCreateVariant(productId);
  const update = useUpdateVariant(productId);
  const [conflict, setConflict] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<VariantFormValues>({ resolver: zodResolver(variantFormSchema), defaultValues: initial, mode: "onTouched" });
  const options = useFieldArray({ control, name: "options" });
  const saving = create.isPending || update.isPending;
  const barcode = watch("barcode");

  const showServerError = (e: unknown) => {
    if (isApiError(e) && e.code === "VERSION_CONFLICT") {
      setConflict(true);
      return;
    }
    let placed = false;
    if (isApiError(e) && e.fields) {
      for (const [path, message] of Object.entries(e.fields)) {
        const field = serverFieldToForm(path);
        if (!field) continue;
        const shown = e.status === 409 && (field === "sku" || field === "barcode") ? `This ${field === "sku" ? "SKU" : "barcode"} is already used by another variant` : message;
        setError(field as FieldPath<VariantFormValues>, { type: "server", message: shown });
        placed = true;
      }
    }
    if (!placed) setFormError(errorMessage(e, "Could not save the variant."));
  };

  const acquire = useSubmitLock();
  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const release = acquire();
    if (!release) return;
    try {
      if (!base) {
        const v = await create.mutateAsync(createPayload(values));
        toast({ title: "Variant added", description: `${v.sku} is part of this product now.`, variant: "success" });
      } else {
        const patch = diffFromDetail(values, base);
        const lead = leadTimeChange(values.leadTime, leadBefore);
        if (Object.keys(patch).length === 0 && lead === undefined) {
          toast({ title: "Nothing to save", description: "No field was changed." });
        } else {
          await update.mutateAsync({ variantId: base.id, version: base.version, patch, leadTimeDays: lead });
          toast({ title: "Variant saved", description: `${patch.sku ?? base.sku} was updated.`, variant: "success" });
        }
      }
      onDone();
    } catch (e) {
      showServerError(e);
    } finally {
      release();
    }
  });

  const e = (k: keyof VariantFormValues) => (errors[k] as { message?: string } | undefined)?.message;

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <fieldset disabled={readOnly || saving} className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 flex flex-col gap-5">
        {conflict && (
          <div role="alert" className="flex gap-2 rounded-lg border border-[#F5C26B] bg-[#FFF8E6] p-3 text-[12px] text-[#7A4B00]">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <div className="flex flex-col gap-2 items-start">
              <span>Someone else changed this variant while you were editing. Reload it to see the latest values; your unsaved edits will be replaced.</span>
              <Button type="button" size="sm" variant="outline" onClick={onReload}>
                Reload latest
              </Button>
            </div>
          </div>
        )}
        {formError && (
          <div role="alert" className="rounded-lg border border-[#F2B8B5] bg-[#FDE7E7] p-3 text-[12px] text-[#B42318]">
            {formError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="vf-sku" title="SKU" error={e("sku")}>
            <Input id="vf-sku" {...register("sku")} error={!!e("sku")} aria-invalid={!!e("sku")} autoComplete="off" placeholder="e.g. TRV-1042-B-C" />
          </Field>
          <Field
            id="vf-barcode"
            title="Barcode (optional)"
            error={e("barcode")}
            help={looksLikeBadGtin(barcode.trim()) ? "The check digit does not match a valid EAN / UPC number. Double-check it." : "EAN, UPC or your own code. Unique per business."}
          >
            <Input id="vf-barcode" {...register("barcode")} error={!!e("barcode")} aria-invalid={!!e("barcode")} autoComplete="off" />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <span className={label}>Options</span>
          {options.fields.map((f, i) => {
            const nameError = errors.options?.[i]?.name?.message;
            const valueError = errors.options?.[i]?.value?.message;
            return (
            <div key={f.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
              <div className="flex flex-col gap-1">
                <Input aria-label={`Option ${i + 1} name`} placeholder="Name, e.g. Color" {...register(`options.${i}.name`)} error={!!nameError} />
                {nameError && <p role="alert" className={err}>{nameError}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <Input aria-label={`Option ${i + 1} value`} placeholder="Value, e.g. Black" {...register(`options.${i}.value`)} error={!!valueError} />
                {valueError && <p role="alert" className={err}>{valueError}</p>}
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove option ${i + 1}`} onClick={() => options.remove(i)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            );
          })}
          {errors.options?.message && <p role="alert" className={err}>{errors.options.message}</p>}
          {errors.options?.root?.message && <p role="alert" className={err}>{errors.options.root.message}</p>}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => options.append({ name: "", value: "" })}>
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden /> Add option
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field id="vf-mrp" title="MRP" error={e("mrp")}>
            {rupee(<Input id="vf-mrp" inputMode="decimal" className="pl-7" {...register("mrp")} error={!!e("mrp")} aria-invalid={!!e("mrp")} placeholder="0.00" />)}
          </Field>
          <Field id="vf-selling" title="Selling price" error={e("selling")}>
            {rupee(<Input id="vf-selling" inputMode="decimal" className="pl-7" {...register("selling")} error={!!e("selling")} aria-invalid={!!e("selling")} placeholder="0.00" />)}
          </Field>
          <Field id="vf-cost" title="Cost price" error={e("cost")} help="Used for margin; never shown on a channel.">
            {rupee(<Input id="vf-cost" inputMode="decimal" className="pl-7" {...register("cost")} error={!!e("cost")} aria-invalid={!!e("cost")} placeholder="0.00" />)}
          </Field>
          <Field id="vf-tax" title="GST rate (%)" error={e("tax")} help="Leave empty to use the product's rate.">
            <Input id="vf-tax" inputMode="decimal" {...register("tax")} error={!!e("tax")} aria-invalid={!!e("tax")} placeholder="e.g. 18" />
          </Field>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field id="vf-weight" title="Weight (g)" error={e("weight")}>
            <Input id="vf-weight" inputMode="numeric" {...register("weight")} error={!!e("weight")} aria-invalid={!!e("weight")} />
          </Field>
          <Field id="vf-length" title="Length (mm)" error={e("length")}>
            <Input id="vf-length" inputMode="numeric" {...register("length")} error={!!e("length")} aria-invalid={!!e("length")} />
          </Field>
          <Field id="vf-width" title="Width (mm)" error={e("width")}>
            <Input id="vf-width" inputMode="numeric" {...register("width")} error={!!e("width")} aria-invalid={!!e("width")} />
          </Field>
          <Field id="vf-height" title="Height (mm)" error={e("height")}>
            <Input id="vf-height" inputMode="numeric" {...register("height")} error={!!e("height")} aria-invalid={!!e("height")} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field id="vf-status" title="Status" error={e("status")} help="Inactive variants are archived and not sold.">
            <select id="vf-status" {...register("status")} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="active">Active</option>
              <option value="inactive">Inactive (archived)</option>
            </select>
          </Field>
          {base && (
            <Field id="vf-lead" title="Lead time (days)" error={e("leadTime")} help="Days to receive more stock. Empty uses the business default.">
              <Input id="vf-lead" inputMode="numeric" {...register("leadTime")} error={!!e("leadTime")} aria-invalid={!!e("leadTime")} />
            </Field>
          )}
        </div>
      </fieldset>

      <SheetFooter className="border-t border-[#EAEAEA] px-6 py-4 gap-2 sm:space-x-0">
        <Button type="button" variant="outline" onClick={onDone}>
          {readOnly ? "Close" : "Cancel"}
        </Button>
        {!readOnly && (
          <Button type="submit" loading={saving} disabled={conflict}>
            {base ? "Save changes" : "Add variant"}
          </Button>
        )}
      </SheetFooter>
    </form>
  );
}

interface DrawerProps {
  open: boolean;
  /** null = add a variant, otherwise edit (or view) this one */
  variantId: string | null;
  /** lead time of the grid row being edited (not part of GET /variants/{id}) */
  leadTimeDays: number | null;
  productId: string;
  optionNames: string[];
  readOnly: boolean;
  onClose: () => void;
}

export function VariantDrawer({ open, variantId, leadTimeDays, productId, optionNames, readOnly, onClose }: DrawerProps) {
  const detail = useVariantDetail(open ? variantId : null);
  const [nonce, setNonce] = useState(0);
  const editing = variantId !== null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:w-[560px] sm:max-w-[560px] p-0 flex flex-col gap-0">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle>{!editing ? "Add variant" : readOnly ? "Variant details" : "Edit variant"}</SheetTitle>
          <SheetDescription>
            {!editing ? "A new sellable SKU of this product. Prices are in rupees." : readOnly ? "You have read-only access to products." : "Change only what you need; untouched fields stay as they are."}
          </SheetDescription>
        </SheetHeader>
        {!editing ? (
          <VariantForm key="new" productId={productId} base={null} initial={emptyForm(optionNames)} leadBefore={null} readOnly={false} onDone={onClose} onReload={() => undefined} />
        ) : detail.isPending ? (
          <div className="px-6 flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : detail.isError ? (
          <div className="px-6 flex flex-col gap-3 items-start" role="alert">
            <p className="text-[12px] text-[#B42318]">{errorMessage(detail.error, "Could not load this variant.")}</p>
            <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <VariantForm
            key={`${detail.data.id}:${detail.data.version}:${nonce}`}
            productId={productId}
            base={detail.data}
            initial={formFromDetail(detail.data, leadTimeDays)}
            leadBefore={leadTimeDays}
            readOnly={readOnly}
            onDone={onClose}
            onReload={() => {
              setNonce((n) => n + 1);
              void detail.refetch();
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
