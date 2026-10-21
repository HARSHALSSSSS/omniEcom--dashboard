import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Lock, Plus, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import type { EditController } from "@/hooks/useProductEdit";
import type { ProductType } from "@/types/productEdit";
import { cn } from "@/utils/cn";
import { FieldShell } from "./FieldShell";
import { RichDescriptionEditor } from "./RichDescriptionEditor";
import { previousText, type FormKey, type FormValues } from "./form";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

type TextKey = Exclude<keyof FormValues, "tags" | "customAttributes" | "productType">;

interface Props {
  ctl: EditController;
  onImproveWithAi: () => void;
}

export function ProductInformation({ ctl, onImproveWithAi }: Props) {
  const { editor, values, base, modified, fieldErrors, canWrite, categoryName } = ctl;
  const [open, setOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
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
    opts: { hint?: string; maxLength?: number; mono?: boolean; inputMode?: "decimal" | "numeric" | "text" } = {},
  ) =>
    shell(
      fk,
      id,
      label,
      <Input
        id={id}
        value={values[key]}
        disabled={ro}
        maxLength={opts.maxLength}
        inputMode={opts.inputMode}
        error={!!fieldErrors[fk]}
        aria-invalid={!!fieldErrors[fk] || undefined}
        aria-describedby={fieldErrors[fk] ? `${id}-error` : undefined}
        className={cn("text-sm", opts.mono && "font-mono")}
        onChange={(e) => edit(key, e.target.value, fk)}
      />,
      opts.hint,
    );

  const categories = ctl.categories ?? [];
  const hasCurrent = !values.categoryId || categories.some((c) => c.id === values.categoryId);
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

  return (
    <section aria-labelledby="product-information" className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="product-information" className="text-sm font-bold text-foreground">
            Product information
          </h2>
          <p className="text-xs text-muted-foreground">Changes made here update the master product and may affect connected listings.</p>
        </div>
        {modified.length > 1 && !ro && (
          <button type="button" onClick={ctl.revertAll} className="text-xs font-medium text-primary hover:underline">
            Revert all
          </button>
        )}
      </div>

      <div className="flex items-center gap-3" role="group" aria-label="Product media">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-[10px] text-muted-foreground">
          {editor.media.primaryImageUrl ? <img src={editor.media.primaryImageUrl} alt="Primary product" className="h-full w-full object-cover" /> : "No image"}
        </div>
        <div className="flex gap-2">
          {thumbs.slice(1, 3).map((t) => (
            <img key={t.id} src={t.url} alt="Product thumbnail" className="h-12 w-12 rounded-md border border-border object-cover" />
          ))}
        </div>
        <div className="text-xs">
          <p className="text-muted-foreground">
            {editor.media.total} {editor.media.total === 1 ? "image" : "images"}
          </p>
          <Link to={`${ROUTES.PRODUCTS}/${product.id}?tab=media`} className="font-medium text-primary hover:underline">
            Manage media
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">{text("title", "title", "field-title", "Product name", { maxLength: 200 })}</div>

        {shell(
          "productType",
          "field-type",
          "Product type",
          <select id="field-type" className={SELECT_CLASS} disabled={ro} value={values.productType} onChange={(e) => edit("productType", e.target.value as ProductType, "productType")}>
            <option value="physical">Physical product</option>
            <option value="digital">Digital product</option>
            <option value="service">Service</option>
          </select>,
        )}

        {locked ? (
          <FieldShell id="field-code" label="Master SKU" error={fieldErrors.productCode}>
            <div className="relative">
              <Input id="field-code" value={values.productCode} readOnly aria-readonly="true" aria-describedby="field-code-reason" className="bg-muted/50 pr-9 font-mono text-sm" />
              <Lock className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <p id="field-code-reason" className="text-[11px] text-muted-foreground">
              Locked. {editor.locks.productCode.reason}
            </p>
          </FieldShell>
        ) : (
          text("productCode", "productCode", "field-code", "Master SKU", { mono: true, maxLength: 200 })
        )}

        {shell(
          "categoryId",
          "field-category",
          "Category",
          <select id="field-category" className={SELECT_CLASS} disabled={ro} value={values.categoryId} onChange={(e) => edit("categoryId", e.target.value, "categoryId")}>
            <option value="">{product.status === "draft" ? "No category" : "Select a category"}</option>
            {!hasCurrent && <option value={values.categoryId}>{categoryName(values.categoryId)}</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>,
          ctl.categoriesError ? "The category list could not be loaded." : undefined,
        )}

        {text("brand", "brand", "field-brand", "Brand", { maxLength: 500 })}
      </div>

      {shell(
        "description",
        "field-description",
        "Description",
        <RichDescriptionEditor
          id="field-description"
          value={values.description}
          disabled={ro}
          invalid={!!fieldErrors.description}
          describedBy={fieldErrors.description ? "field-description-error" : undefined}
          onChange={(html) => edit("description", html, "description")}
        />,
      )}
      {!ro && (
        <button type="button" onClick={onImproveWithAi} className="-mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Improve with AI
        </button>
      )}

      <div className="rounded-lg border border-border">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="additional-attributes"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>Additional attributes</span>
          <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            {configured} {configured === 1 ? "attribute" : "attributes"} configured
            {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          </span>
        </button>
        {open && (
          <div id="additional-attributes" className="space-y-4 border-t border-border p-4">
            <ul className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3" aria-label="Attribute status">
              {editor.attributes.slots.map((s) => (
                <li key={s.key} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5">
                  <span>{s.label}</span>
                  <span className={s.supplied ? "text-emerald-700" : "text-muted-foreground"}>{s.supplied ? "Supplied" : "Not supplied"}</span>
                </li>
              ))}
            </ul>
            {editor.attributes.note && <p className="rounded-md bg-amber-50 p-2.5 text-[11px] text-amber-900">{editor.attributes.note}</p>}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {text("material", "material", "field-material", "Material", { maxLength: 500 })}
              {text("countryOfOrigin", "countryOfOrigin", "field-country", "Country of origin", { maxLength: 32, hint: "Country name or ISO code, for example IN" })}
              {text("hsnCode", "hsnCode", "field-hsn", "HSN code", { maxLength: 32, mono: true })}
              {text("gstPercent", "gstPercent", "field-gst", "Tax information (GST %)", { inputMode: "decimal", hint: "For example 18" })}
              {text("manufacturer", "manufacturer", "field-manufacturer", "Manufacturer", { maxLength: 500 })}
              {text("standardCategory", "standardCategory", "field-standard-category", "Standard category", { maxLength: 500 })}
              {shell(
                "dimensions",
                "field-dim-length",
                "Dimensions (cm)",
                <div className="flex items-center gap-2">
                  {(
                    [
                      ["dimLength", "Length"],
                      ["dimWidth", "Width"],
                      ["dimHeight", "Height"],
                    ] as const
                  ).map(([k, l], i) => (
                    <Input
                      key={k}
                      id={i === 0 ? "field-dim-length" : undefined}
                      aria-label={`${l} in cm`}
                      placeholder={l}
                      inputMode="decimal"
                      disabled={ro}
                      value={values[k]}
                      error={!!fieldErrors.dimensions}
                      onChange={(e) => edit(k, e.target.value, "dimensions")}
                    />
                  ))}
                </div>,
              )}
              {text("weight", "weight", "field-weight", "Weight (kg)", { inputMode: "decimal" })}
            </div>

            {shell(
              "tags",
              "field-tags",
              "Tags",
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input p-1.5">
                {values.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">
                    {t}
                    {!ro && (
                      <button type="button" aria-label={`Remove tag ${t}`} onClick={() => edit("tags", values.tags.filter((x) => x !== t), "tags")}>
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                ))}
                <input
                  id="field-tags"
                  className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm focus-visible:outline-none"
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
              <div id="field-custom-attributes" className="space-y-2">
                {values.customAttributes.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input aria-label={`Attribute ${i + 1} name`} placeholder="Name" disabled={ro} value={a.name} onChange={(e) => setAttr(i, { name: e.target.value })} />
                    <Input aria-label={`Attribute ${i + 1} value`} placeholder="Value" disabled={ro} value={a.value} onChange={(e) => setAttr(i, { value: e.target.value })} />
                    <label className="flex shrink-0 items-center gap-1 text-[11px]">
                      <input type="checkbox" disabled={ro} checked={a.confirmed} onChange={(e) => setAttr(i, { confirmed: e.target.checked })} />
                      Confirmed
                    </label>
                    {!ro && (
                      <button type="button" aria-label={`Remove attribute ${i + 1}`} onClick={() => edit("customAttributes", values.customAttributes.filter((_, j) => j !== i), "customAttributes")}>
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
                {!ro && (
                  <Button type="button" size="sm" variant="outline" onClick={() => edit("customAttributes", [...values.customAttributes, { name: "", value: "", confirmed: false }], "customAttributes")}>
                    <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Add attribute
                  </Button>
                )}
              </div>,
              "Only confirmed attributes are sent to listings.",
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Price, MRP and stock are managed per variant, not on the master product.{" "}
        <Link to={`${ROUTES.PRODUCTS}/${product.id}/variants`} className="font-medium text-primary hover:underline">
          Manage variants
        </Link>
      </p>

      <div className="rounded-lg bg-muted/40 p-4 text-xs">
        <p className="font-semibold text-foreground">Master product</p>
        <p className="mt-0.5 text-muted-foreground">Inherited by connected listings</p>
        {editor.inheritance.channels.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Connected channels">
            {editor.inheritance.channels.map((c) => (
              <li key={c.accountId} className="rounded-full border border-border bg-background px-2.5 py-0.5">
                {c.name}
                {c.independentFields.length > 0 && <span className="text-muted-foreground"> (independent content)</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted-foreground">{editor.inheritance.limited ? "This product has too many listings to show them here." : "No connected listings yet."}</p>
        )}
        <p className="mt-2 text-muted-foreground">{editor.inheritance.text}</p>
        <Link to={`${ROUTES.LISTINGS}?productId=${product.id}`} className="mt-2 inline-block font-medium text-primary hover:underline">
          View affected listings
        </Link>
      </div>
    </section>
  );
}
