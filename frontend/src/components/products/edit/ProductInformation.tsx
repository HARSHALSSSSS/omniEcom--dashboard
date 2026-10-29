import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, Lock, Sparkles, X } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import type { EditController } from "@/hooks/useProductEdit";
import { useBrands } from "@/hooks/useProductCreation";
import type { ProductType } from "@/types/productEdit";
import { ProductImage } from "@/components/products/detail/ProductImage";
import { cn } from "@/utils/cn";
import { PRODUCT_TYPE_OPTIONS } from "../productTypes";
import { AttributeStatus, CategoryAttributeFields } from "./CategoryAttributes";
import { CategoryAdd } from "@/components/products/CategoryAdd";
import { countryCodeFor, countryOptions } from "@/constants/countries";
import { DesignCombo, DesignSelect } from "./DesignSelect";
import { FieldShell } from "./FieldShell";
import { INPUT_CLASS, boxClass } from "./fieldStyles";
import { RichDescriptionEditor } from "./RichDescriptionEditor";
import { previousText, type FormKey, type FormValues } from "./form";

type TextKey = Exclude<keyof FormValues, "tags" | "customAttributes" | "productType" | "categoryAttrs">;

/** the design's four types: Physical, Digital, Service / Warranty, Bundle / Kit */
const TYPE_OPTIONS = PRODUCT_TYPE_OPTIONS;

interface Props {
  ctl: EditController;
  onImproveWithAi: () => void;
  /** the Improve with AI panel, shown under the description */
  aiPanel?: ReactNode;
  aiOpen?: boolean;
}

export function ProductInformation({ ctl, onImproveWithAi, aiPanel, aiOpen }: Props) {
  const { editor, values, base, modified, fieldErrors, canWrite, categoryName } = ctl;
  const [open, setOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const brands = useBrands();
  if (!editor || !values || !base) return null;

  const ro = !canWrite;
  const product = editor.product;
  const mod = (k: FormKey) => modified.includes(k);
  const prev = (k: FormKey) => previousText(base, k, categoryName);
  const edit = <K extends keyof FormValues>(key: K, value: FormValues[K], fk: FormKey) => {
    ctl.setField(key, value);
    ctl.clearError(fk);
  };
  const shell = (k: FormKey, id: string, label: string, children: ReactNode, hint?: ReactNode) => (
    <FieldShell id={id} label={label} modified={mod(k)} previous={prev(k)} onRevert={() => ctl.revert(k)} error={fieldErrors[k]} disabled={ro} hint={hint}>
      {children}
    </FieldShell>
  );
  const text = (
    key: TextKey,
    fk: FormKey,
    id: string,
    label: string,
    opts: { hint?: string; maxLength?: number; mono?: boolean; inputMode?: "decimal" | "numeric" | "text"; required?: boolean } = {},
  ) =>
    shell(
      fk,
      id,
      label,
      <div className={boxClass({ modified: mod(fk), error: !!fieldErrors[fk], disabled: ro })}>
        <input
          id={id}
          type="text"
          value={values[key]}
          disabled={ro}
          maxLength={opts.maxLength}
          inputMode={opts.inputMode}
          placeholder={opts.required ? undefined : "Not supplied"}
          autoComplete="off"
          aria-invalid={!!fieldErrors[fk] || undefined}
          aria-describedby={fieldErrors[fk] ? `${id}-error` : undefined}
          className={cn(INPUT_CLASS, opts.mono && "font-mono")}
          onChange={(e) => edit(key, e.target.value, fk)}
        />
      </div>,
      opts.hint,
    );

  // in tree order (by path), sub-categories indented, so the hierarchy reads at a glance; the dropdown is searchable
  const categories = [...(ctl.categories ?? [])].sort((a, b) => a.path.localeCompare(b.path));
  const hasCurrent = !values.categoryId || categories.some((c) => c.id === values.categoryId);
  const depthOf = (path: string) => path.split("/").length - 1;
  const categoryOptions = [
    { value: "", label: product.status === "draft" ? "No category" : "Select a category" },
    ...(hasCurrent ? [] : [{ value: values.categoryId, label: categoryName(values.categoryId) }]),
    ...categories.map((c) => ({ value: c.id, label: `${String.fromCharCode(160, 160).repeat(depthOf(c.path))}${c.name}`, ...(c.parentId ? { hint: c.path } : {}) })),
  ];
  const storedCountry = values.countryOfOrigin;
  const countrySelectOptions = [
    { value: "", label: "Not supplied" },
    ...countryOptions(storedCountry).map((c) => ({ value: c.code, label: c.name, hint: c.code })),
  ];
  const addTag = () => {
    const t = tagDraft.trim();
    if (t && !values.tags.some((x) => x.toLowerCase() === t.toLowerCase())) edit("tags", [...values.tags, t], "tags");
    setTagDraft("");
  };
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && tagDraft === "" && values.tags.length) {
      edit("tags", values.tags.slice(0, -1), "tags");
    }
  };
  const setAttr = (i: number, patch: Partial<FormValues["customAttributes"][number]>) =>
    edit("customAttributes", values.customAttributes.map((x, j) => (j === i ? { ...x, ...patch } : x)), "customAttributes");

  const locked = editor.locks.productCode.locked;
  const thumbs = editor.media.thumbnails;
  const configured = editor.attributes.configured;
  const channels = editor.inheritance.channels;
  const brandNames = (brands.data ?? []).map((b) => b.name);

  return (
    <div className="flex flex-col gap-4 flex-1 min-w-0 pr-2">
      <div className="flex flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 id="product-information" className="text-[18px] font-semibold text-[#000000] leading-[145%]">
            Product information
          </h2>
          <p className="text-[13px] font-normal text-[#666666] leading-[145%]">Changes made here update the master product and may affect connected listings.</p>
        </div>
        {modified.length > 1 && !ro && (
          <button type="button" onClick={ctl.revertAll} className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer shrink-0">
            Revert all
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-start gap-5 w-full">
        <div className="flex flex-col gap-2 w-full sm:w-[148px] shrink-0" role="group" aria-label="Product media">
          <ProductImage url={editor.media.primaryImageUrl} alt="Primary product" className="w-[148px] h-[148px] rounded-[4px] overflow-hidden border border-[#EAEAEA]" />
          <span className="text-[11px] font-normal text-[#666666] leading-[145%]">Primary image</span>

          {thumbs.length > 1 && (
            <div className="flex flex-row items-center gap-1.5 w-full">
              {thumbs.slice(1, 4).map((t) => (
                <ProductImage key={t.id} url={t.url} alt="Product thumbnail" className="w-[44px] h-[40px] rounded-[4px] overflow-hidden border border-[#EAEAEA]" />
              ))}
            </div>
          )}

          <p className="text-[11px] font-normal text-[#666666] leading-[145%]">
            {editor.media.total} {editor.media.total === 1 ? "image" : "images"}
          </p>
          <Link to={`${ROUTES.PRODUCTS}/${product.id}?tab=media`} className="text-[11px] font-normal text-[#000000] hover:underline cursor-pointer text-left pt-1">
            Manage media
          </Link>
        </div>

        <div className="flex flex-col gap-3 flex-1 min-w-0 w-full">
          {text("title", "title", "field-title", "Product name", { maxLength: 200, required: true })}

          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5 w-full">
            <div className="flex-1 min-w-0 w-full sm:w-auto">
              {shell(
                "productType",
                "field-type",
                "Product type",
                <DesignSelect
                  id="field-type"
                  value={values.productType}
                  options={TYPE_OPTIONS}
                  disabled={ro}
                  modified={mod("productType")}
                  error={!!fieldErrors.productType}
                  onChange={(v) => edit("productType", v as ProductType, "productType")}
                />,
              )}
            </div>

            <div className="flex-1 min-w-0 w-full sm:w-auto">
              {locked ? (
                <div className="flex flex-col gap-1.5 w-full" data-field="field-code">
                  <div className="flex flex-row items-center justify-between w-full">
                    <label htmlFor="field-code" className="text-[12px] font-normal text-[#000000] leading-[145%]">
                      Master SKU
                    </label>
                    <Lock className="w-3 h-3 text-[#666666]" aria-hidden="true" />
                  </div>
                  <div className="flex items-center h-10 px-3 bg-[#F5F5F5] border border-[#BDBDBD] rounded-[8px]">
                    <input
                      id="field-code"
                      value={values.productCode}
                      readOnly
                      aria-readonly="true"
                      aria-describedby="field-code-reason"
                      className="w-full text-[13px] font-mono text-[#000000] leading-[145%] select-all outline-none bg-transparent"
                    />
                  </div>
                  {fieldErrors.productCode && (
                    <span id="field-code-error" role="alert" className="text-[11px] font-medium text-[#B42318]">
                      {fieldErrors.productCode}
                    </span>
                  )}
                </div>
              ) : (
                text("productCode", "productCode", "field-code", "Master SKU", { mono: true, maxLength: 200, required: true })
              )}
            </div>
          </div>

          <span id="field-code-reason" className="text-[11px] font-normal text-[#666666] leading-[145%] -mt-1">
            {locked ? `Locked. ${editor.locks.productCode.reason ?? "Used as the primary internal product identifier."}` : "Used as the primary internal product identifier."}
          </span>

          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5 w-full">
            <div className="flex-1 min-w-0 w-full sm:w-auto">
              {shell(
                "categoryId",
                "field-category",
                "Category",
                <DesignSelect
                  id="field-category"
                  value={values.categoryId}
                  options={categoryOptions}
                  disabled={ro}
                  modified={mod("categoryId")}
                  error={!!fieldErrors.categoryId}
                  onChange={(v) => edit("categoryId", v, "categoryId")}
                />,
                ctl.categoriesError ? "The category list could not be loaded." : (
                  <CategoryAdd choices={categories.map((c) => ({ id: c.id, label: `${String.fromCharCode(160, 160).repeat(depthOf(c.path))}${c.name}` }))} disabled={ro} onCreated={(id) => edit("categoryId", id, "categoryId")} />
                ),
              )}
            </div>
            <div className="flex-1 min-w-0 w-full sm:w-auto">
              {shell(
                "brand",
                "field-brand",
                "Brand",
                <DesignCombo
                  id="field-brand"
                  value={values.brand}
                  suggestions={brandNames}
                  disabled={ro}
                  modified={mod("brand")}
                  error={!!fieldErrors.brand}
                  maxLength={500}
                  describedBy={fieldErrors.brand ? "field-brand-error" : undefined}
                  onChange={(v) => edit("brand", v, "brand")}
                />,
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 w-full pt-2">
        <div className="flex flex-row justify-between items-center w-full">
          <h3 className="text-[18px] font-semibold text-[#000000] leading-[145%]">Description</h3>
          <div className="flex flex-row items-center gap-3">
            {mod("description") && (
              <div className="flex items-center gap-2 text-[12px]">
                <span className="text-[11px] text-[#666666]">Modified</span>
                {!ro && (
                  <button type="button" onClick={() => ctl.revert("description")} aria-label="Revert Description" className="font-semibold text-[#000000] hover:underline cursor-pointer">
                    Revert
                  </button>
                )}
              </div>
            )}
            {!ro && (
              <button
                type="button"
                onClick={onImproveWithAi}
                className={cn("flex items-center gap-1.5 text-[12px] font-semibold px-2 py-1 rounded cursor-pointer transition-colors", aiOpen ? "bg-[#F5F5F5] text-[#000000]" : "text-[#000000] hover:bg-neutral-50")}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#C739FF]" aria-hidden="true" />
                <span>Improve with AI</span>
              </button>
            )}
          </div>
        </div>
        <RichDescriptionEditor
          id="field-description"
          value={values.description}
          disabled={ro}
          invalid={!!fieldErrors.description}
          modified={mod("description")}
          describedBy={fieldErrors.description ? "field-description-error" : undefined}
          onChange={(html) => edit("description", html, "description")}
        />
        {mod("description") && <span className="text-[11px] font-normal text-[#666666] leading-[145%]">Previously: {prev("description")}</span>}
        {fieldErrors.description && (
          <span id="field-description-error" role="alert" className="text-[11px] font-medium text-[#B42318]">
            {fieldErrors.description}
          </span>
        )}
        {aiPanel}
      </div>

      <div className="flex flex-col gap-4 w-full pt-4 border-t border-[#EAEAEA]">
        <div className="flex flex-row justify-between items-center w-full">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="additional-attributes"
            onClick={() => setOpen((o) => !o)}
            className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer flex items-center gap-1"
          >
            Additional attributes {open ? "–" : "+"}
          </button>
          <span className="text-[11px] font-normal text-[#666666] leading-[145%]">
            {configured} {configured === 1 ? "attribute" : "attributes"} configured
          </span>
        </div>

        {open && (
          <div id="additional-attributes" className="flex flex-col gap-4 w-full">
            {editor.attributes.note && <p className="text-[11px] font-normal text-[#666666] leading-[145%]">{editor.attributes.note}</p>}

            <AttributeStatus editor={editor} values={values} defs={ctl.attrDefs} />

            <CategoryAttributeFields ctl={ctl} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full">
              {text("material", "material", "field-material", "Material", { maxLength: 500 })}
              {shell(
                "countryOfOrigin",
                "field-country",
                "Country of origin",
                <DesignSelect
                  id="field-country"
                  value={countryCodeFor(storedCountry) ?? storedCountry}
                  options={countrySelectOptions}
                  disabled={ro}
                  searchable
                  modified={mod("countryOfOrigin")}
                  error={!!fieldErrors.countryOfOrigin}
                  onChange={(v) => edit("countryOfOrigin", v, "countryOfOrigin")}
                />,
                "Saved as the two-letter country code, for example IN",
              )}
              {text("hsnCode", "hsnCode", "field-hsn", "HSN code", { maxLength: 32, mono: true })}
              {text("gstPercent", "gstPercent", "field-gst", "Tax information (GST %)", { inputMode: "decimal", hint: "For example 18" })}
              {text("manufacturer", "manufacturer", "field-manufacturer", "Manufacturer", { maxLength: 500 })}
              {text("standardCategory", "standardCategory", "field-standard-category", "Standard category", { maxLength: 500 })}
              {shell(
                "dimensions",
                "field-dim-length",
                "Dimensions (cm)",
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  {(
                    [
                      ["dimLength", "Length"],
                      ["dimWidth", "Width"],
                      ["dimHeight", "Height"],
                    ] as const
                  ).map(([k, l], i) => (
                    <div key={k} className={cn(boxClass({ modified: mod("dimensions"), error: !!fieldErrors.dimensions, disabled: ro }), "flex-1 min-w-[70px]")}>
                      <input
                        id={i === 0 ? "field-dim-length" : undefined}
                        aria-label={`${l} in cm`}
                        placeholder={l}
                        inputMode="decimal"
                        disabled={ro}
                        value={values[k]}
                        className={INPUT_CLASS}
                        onChange={(e) => edit(k, e.target.value, "dimensions")}
                      />
                    </div>
                  ))}
                </div>,
              )}
              {text("weight", "weight", "field-weight", "Weight (kg)", { inputMode: "decimal" })}
            </div>

            {shell(
              "tags",
              "field-tags",
              "Tags",
              <div className={cn(boxClass({ modified: mod("tags"), error: !!fieldErrors.tags, disabled: ro }), "h-auto min-h-10 flex-wrap gap-1.5 py-1.5")}>
                {values.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-[4px] bg-[#F5F5F5] px-2 py-0.5 text-[12px] text-[#000000]">
                    {t}
                    {!ro && (
                      <button type="button" aria-label={`Remove tag ${t}`} onClick={() => edit("tags", values.tags.filter((x) => x !== t), "tags")} className="cursor-pointer">
                        <X className="h-3 w-3 text-[#666666]" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                ))}
                <input
                  id="field-tags"
                  className="min-w-[8rem] flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-[#666666]"
                  placeholder={ro ? "" : "Type a tag and press Enter"}
                  disabled={ro}
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={onTagKey}
                  onBlur={addTag}
                />
              </div>,
            )}

            {shell(
              "customAttributes",
              "field-custom-attributes",
              "Custom attributes",
              <div id="field-custom-attributes" className="flex flex-col gap-2">
                {values.customAttributes.map((a, i) => (
                  <div key={i} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className={cn(boxClass({ modified: mod("customAttributes"), disabled: ro }), "flex-1 min-w-0")}>
                      <input aria-label={`Attribute ${i + 1} name`} placeholder="Name" disabled={ro} value={a.name} onChange={(e) => setAttr(i, { name: e.target.value })} className={INPUT_CLASS} />
                    </div>
                    <div className={cn(boxClass({ modified: mod("customAttributes"), disabled: ro }), "flex-1 min-w-0")}>
                      <input aria-label={`Attribute ${i + 1} value`} placeholder="Value" disabled={ro} value={a.value} onChange={(e) => setAttr(i, { value: e.target.value })} className={INPUT_CLASS} />
                    </div>
                    <div className="flex items-center justify-between sm:justify-start gap-3">
                      <label className="flex shrink-0 items-center gap-1 text-[11px] text-[#666666]">
                        <input type="checkbox" disabled={ro} checked={a.confirmed} onChange={(e) => setAttr(i, { confirmed: e.target.checked })} className="accent-black" />
                        Confirmed
                      </label>
                      {!ro && (
                        <button type="button" aria-label={`Remove attribute ${i + 1}`} onClick={() => edit("customAttributes", values.customAttributes.filter((_, j) => j !== i), "customAttributes")} className="cursor-pointer">
                          <X className="h-4 w-4 text-[#666666]" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {!ro && (
                  <button
                    type="button"
                    onClick={() => edit("customAttributes", [...values.customAttributes, { name: "", value: "", confirmed: false }], "customAttributes")}
                    className="self-start text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer"
                  >
                    + Add attribute
                  </button>
                )}
              </div>,
              "Only confirmed attributes are sent to listings.",
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] font-normal text-[#666666] leading-[145%]">
        Price, MRP and stock are managed per variant, not on the master product.{" "}
        <Link to={`${ROUTES.PRODUCTS}/${product.id}/variants`} className="font-semibold text-[#000000] hover:underline">
          Manage variants
        </Link>
      </p>

      <div className="flex flex-col gap-2 pt-4 border-t border-[#EAEAEA] w-full">
        <span className="text-[12px] font-semibold text-[#000000] leading-[145%]">Master product</span>
        <div className="flex flex-col gap-1 text-[11px] leading-[145%]">
          <div className="flex items-center gap-1.5 text-[#666666]">
            <ArrowDown className="w-3 h-3 text-[#666666]" aria-hidden="true" />
            <span>Inherited by connected listings</span>
          </div>
          {channels.length > 0 ? (
            <div className="flex items-center gap-1.5 font-medium text-[#000000]" aria-label="Connected channels" role="group">
              <ArrowDown className="w-3 h-3 text-[#000000]" aria-hidden="true" />
              <span>
                {channels.map((c, i) => (
                  <span key={c.accountId}>
                    {i > 0 ? " · " : ""}
                    {c.name}
                    {c.independentFields.length > 0 && <span className="font-normal text-[#666666]"> (independent content)</span>}
                  </span>
                ))}
              </span>
            </div>
          ) : (
            <p className="text-[#666666]">{editor.inheritance.limited ? "This product has too many listings to show them here." : "No connected listings yet."}</p>
          )}
        </div>
        <p className="text-[11px] font-normal text-[#666666] leading-[145%]">{editor.inheritance.text}</p>
        <Link to={`${ROUTES.LISTINGS}?productId=${product.id}`} className="text-[12px] font-semibold text-[#000000] hover:underline cursor-pointer text-left pt-1">
          View affected listings
        </Link>
      </div>
    </div>
  );
}
