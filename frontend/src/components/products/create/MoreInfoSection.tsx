import type { UseFormReturn } from "react-hook-form";
import { useStandardCategories } from "@/hooks/useProductCreation";
import type { FormOptions } from "@/types/productCreation";
import type { CreateFormValues, FieldErrorsMap } from "./formModel";
import { SelectField, TextField, FieldShell } from "./fields";
import { boxClass, errorClass, ghostButton, hintClass } from "./fieldStyles";

interface Props {
  form: UseFormReturn<CreateFormValues>;
  values: CreateFormValues;
  options: FormOptions | undefined;
  errors: FieldErrorsMap;
  disabled: boolean;
}

/** "Add more product information": origin, size, weight, GST / HSN and custom attributes (screen 2 of the flow) */
export function MoreInfoSection({ form, values, options, errors, disabled }: Props) {
  const { register, setValue } = form;
  const suggestions = useStandardCategories("");
  const lim = options?.limits;
  const maxAttrs = lim?.customAttributes.max ?? 20;
  const slabs = options?.gstSlabs ?? [];
  const gstUnknown = values.gstRateBps !== "" && !slabs.some((s) => String(s.bps) === values.gstRateBps);
  const materialKnown = !values.material || (options?.materials ?? []).some((m) => m.value === values.material);
  const attrs = values.customAttributes;

  const setAttr = (index: number, patch: Partial<CreateFormValues["customAttributes"][number]>) => {
    const next = attrs.map((a, i) => (i === index ? { ...a, ...patch, confirmed: "confirmed" in patch ? (patch.confirmed as boolean) : false } : a));
    setValue("customAttributes", next, { shouldDirty: true });
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="flex flex-row items-start gap-5 w-full">
        <div className="flex flex-col gap-1.5 flex-1">
          <TextField
            id="cp-standardCategory"
            label="Product category"
            list="cp-standard-categories"
            maxLength={lim?.standardCategoryMax ?? 120}
            disabled={disabled}
            placeholder="e.g. Luggage & Travel Gear"
            error={errors.standardCategory}
            hint="Optional. Your standard product category, separate from the category above."
            {...register("standardCategory")}
          />
          <datalist id="cp-standard-categories">
            {(suggestions.data ?? []).map((s) => (
              <option key={s.value} value={s.value} />
            ))}
          </datalist>
        </div>

        <SelectField id="cp-material" label="Material" className="flex-1" disabled={disabled} empty={!values.material} error={errors.material} {...register("material")}>
          <option value="">Select material</option>
          {!materialKnown ? <option value={values.material}>{values.material}</option> : null}
          {(options?.materials ?? []).map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </SelectField>

        <SelectField id="cp-countryOfOrigin" label="Country of origin" className="flex-1" disabled={disabled} empty={!values.countryOfOrigin} error={errors.countryOfOrigin} {...register("countryOfOrigin")}>
          <option value="">Select country</option>
          {(options?.countries ?? []).map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </SelectField>
      </div>

      <FieldShell id="cp-dimLength" label="Dimensions" error={errors.dimLength ?? errors.dimWidth ?? errors.dimHeight} hint="Use the product's dimensions, not its shipping package.">
        <div className="flex flex-row items-center gap-2" role="group" aria-label="Dimensions">
          {(
            [
              ["dimLength", "Length"],
              ["dimWidth", "Width"],
              ["dimHeight", "Height"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className={boxClass(errors.dimLength ?? errors[key], "flex-1")}>
              <input
                id={key === "dimLength" ? "cp-dimLength" : `cp-${key}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                aria-label={label}
                aria-invalid={errors.dimLength || errors[key] ? true : undefined}
                aria-describedby={errors.dimLength || errors.dimWidth || errors.dimHeight ? "cp-dimLength-error" : "cp-dimLength-hint"}
                disabled={disabled}
                placeholder={label}
                className="w-full text-[13px] text-[#000000] leading-[145%] placeholder:text-[#666666] outline-none bg-transparent"
                {...register(key)}
              />
            </div>
          ))}
          <select aria-label="Dimension unit" disabled={disabled} className="h-[46px] px-2 bg-white border border-[#BDBDBD] rounded-[8px] text-[13px] outline-none focus:border-[#000000]" {...register("dimUnit")}>
            {(options?.units.accepted.dimension ?? ["cm", "mm", "in"]).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </FieldShell>

      <FieldShell id="cp-weightValue" label="Weight" error={errors.weightValue}>
        <div className="flex flex-row items-center gap-2">
          <div className={boxClass(errors.weightValue, "flex-1")}>
            <input
              id="cp-weightValue"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              disabled={disabled}
              placeholder="Enter weight"
              aria-invalid={errors.weightValue ? true : undefined}
              aria-describedby={errors.weightValue ? "cp-weightValue-error" : undefined}
              className="w-full text-[13px] text-[#000000] leading-[145%] placeholder:text-[#666666] outline-none bg-transparent"
              {...register("weightValue")}
            />
          </div>
          <select aria-label="Weight unit" disabled={disabled} className="h-[46px] px-2 bg-white border border-[#BDBDBD] rounded-[8px] text-[13px] outline-none focus:border-[#000000]" {...register("weightUnit")}>
            {(options?.units.accepted.weight ?? ["kg", "g", "lb"]).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </FieldShell>

      <div className="flex flex-row items-start gap-5 w-full">
        <SelectField id="cp-gstRateBps" label="GST / tax information" className="flex-1" disabled={disabled} empty={values.gstRateBps === ""} error={errors.gstRateBps} {...register("gstRateBps")}>
          <option value="">Select tax rate</option>
          {gstUnknown ? <option value={values.gstRateBps}>GST {Number(values.gstRateBps) / 100}%</option> : null}
          {slabs.map((s) => (
            <option key={s.bps} value={String(s.bps)}>
              {s.bps === 0 ? "GST 0% (Exempt)" : `GST ${s.label}`}
            </option>
          ))}
        </SelectField>
        <TextField
          id="cp-hsnCode"
          label="HSN code"
          mono
          className="flex-1"
          inputMode="numeric"
          maxLength={Math.max(...(lim?.hsnLengths ?? [8]))}
          disabled={disabled}
          placeholder="Enter HSN code"
          error={errors.hsnCode}
          hint={`${(lim?.hsnLengths ?? [4, 6, 8]).join(", ")} digits`}
          {...register("hsnCode")}
        />
      </div>

      <div className="w-full h-[1px] bg-[#EAEAEA] my-1" />

      <div className="flex flex-col gap-3 w-full" role="group" aria-labelledby="cp-attrs-title">
        <span id="cp-attrs-title" className="text-[13px] font-semibold text-[#000000] leading-[145%]">
          Custom attributes
        </span>
        <p className="text-[11px] text-[#666666] leading-[145%] -mt-1">Add a product-specific attribute to the master record. Confirm factual details before distributing them to listings.</p>
        <div className="flex flex-col gap-3 w-full">
          {attrs.map((attr, idx) => (
            <div key={idx} className="flex flex-row items-end gap-5 w-full">
              <TextField
                id={idx === 0 ? "cp-customAttributes" : `cp-attr-name-${idx}`}
                label="Attribute name"
                className="flex-1"
                value={attr.name}
                maxLength={lim?.customAttributes.nameMax ?? 60}
                disabled={disabled}
                placeholder="e.g. Collection"
                onChange={(e) => setAttr(idx, { name: e.target.value })}
              />
              <TextField
                id={`cp-attr-value-${idx}`}
                label="Attribute value"
                className="flex-1"
                value={attr.value}
                maxLength={lim?.customAttributes.valueMax ?? 250}
                disabled={disabled}
                placeholder="Enter value"
                onChange={(e) => setAttr(idx, { value: e.target.value })}
              />
              <label className="flex items-center gap-1.5 h-[45px] text-[11px] text-[#333333] shrink-0 cursor-pointer">
                <input type="checkbox" checked={attr.confirmed} disabled={disabled || !attr.name.trim() || !attr.value.trim()} onChange={(e) => setAttr(idx, { confirmed: e.target.checked })} />
                Confirmed
              </label>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove attribute ${idx + 1}`}
                className="h-[45px] text-[11px] text-[#666666] hover:text-[#000000] hover:underline cursor-pointer disabled:opacity-50"
                onClick={() => setValue("customAttributes", attrs.length > 1 ? attrs.filter((_, i) => i !== idx) : [{ name: "", value: "", confirmed: false }], { shouldDirty: true })}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {errors.customAttributes ? (
          <span role="alert" className={errorClass}>
            {errors.customAttributes}
          </span>
        ) : null}
        <div className="pt-1 flex items-center gap-3">
          <button
            type="button"
            disabled={disabled || attrs.length >= maxAttrs}
            title={attrs.length >= maxAttrs ? `At most ${maxAttrs} attributes` : undefined}
            className={ghostButton}
            onClick={() => setValue("customAttributes", [...attrs, { name: "", value: "", confirmed: false }], { shouldDirty: true })}
          >
            + Add attribute
          </button>
          <span className={hintClass}>
            {attrs.filter((a) => a.name.trim() && a.value.trim()).length} of {maxAttrs} used
          </span>
        </div>
      </div>
    </div>
  );
}
