import type {
  DimensionUnit,
  DraftValues,
  FormOptions,
  PreviewValues,
  ProductEditor,
  ProductType,
  WeightUnit,
} from "@/types/productCreation";
import { htmlToPlain, isBlankHtml } from "./richText";

/** what the form holds (strings, because inputs are strings); mapped to the API body by `toDraftValues` */
export interface CreateFormValues {
  title: string;
  productType: ProductType;
  categoryId: string;
  brand: string;
  productCode: string;
  /** the editor HTML (the server sanitises it) */
  description: string;
  standardCategory: string;
  material: string;
  countryOfOrigin: string;
  dimLength: string;
  dimWidth: string;
  dimHeight: string;
  dimUnit: DimensionUnit;
  weightValue: string;
  weightUnit: WeightUnit;
  gstRateBps: string;
  hsnCode: string;
  customAttributes: Array<{ name: string; value: string; confirmed: boolean }>;
}

export type FormFieldKey = Exclude<keyof CreateFormValues, "customAttributes"> | "customAttributes";

export type FieldErrorsMap = Partial<Record<FormFieldKey, string>>;

export const EMPTY_ATTRIBUTE = { name: "", value: "", confirmed: false } as const;

export const emptyValues = (): CreateFormValues => ({
  title: "",
  productType: "physical",
  categoryId: "",
  brand: "",
  productCode: "",
  description: "",
  standardCategory: "",
  material: "",
  countryOfOrigin: "",
  dimLength: "",
  dimWidth: "",
  dimHeight: "",
  dimUnit: "cm",
  weightValue: "",
  weightUnit: "kg",
  gstRateBps: "",
  hsnCode: "",
  customAttributes: [{ ...EMPTY_ATTRIBUTE }],
});

/** a saved product back into the form (display units: cm and kg) */
export function valuesFromProduct(p: ProductEditor, codeIsPlaceholder: boolean): CreateFormValues {
  return {
    title: p.title,
    productType: p.productType,
    categoryId: p.categoryId ?? "",
    brand: p.brand ?? "",
    productCode: codeIsPlaceholder ? "" : p.productCode,
    description: p.descriptionHtml ?? (p.description ? escapeText(p.description) : ""),
    standardCategory: p.standardCategory ?? "",
    material: p.material ?? "",
    countryOfOrigin: p.countryOfOrigin ?? "",
    dimLength: p.dimensions ? String(p.dimensions.length) : "",
    dimWidth: p.dimensions ? String(p.dimensions.width) : "",
    dimHeight: p.dimensions ? String(p.dimensions.height) : "",
    dimUnit: "cm",
    weightValue: p.weight ? String(p.weight.value) : "",
    weightUnit: "kg",
    gstRateBps: p.gstRateBps != null ? String(p.gstRateBps) : "",
    hsnCode: p.hsnCode ?? "",
    customAttributes: p.customAttributes.length ? p.customAttributes.map((a) => ({ name: a.name, value: a.value, confirmed: a.confirmed })) : [{ ...EMPTY_ATTRIBUTE }],
  };
}

/** plain text -> the html the editor shows (a description that was only stored as text) */
function escapeText(text: string): string {
  const esc = text.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
  return esc
    .split("\n")
    .map((line) => `<p>${line || "<br>"}</p>`)
    .join("");
}

const parseNumber = (raw: string): number | null => {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

export interface MappedValues {
  values: DraftValues;
  /** problems only the form can see (an unfinished dimensions trio, a half-filled attribute row, a description over the limit) */
  localIssues: Partial<Record<FormFieldKey, string>>;
}

/**
 * The API body of the form. Fields the form cannot send yet (incomplete dimensions, an over-long description) are left out so the
 * rest still autosaves; `localIssues` tells the seller what to fix. Blank optional fields clear the saved value (null).
 */
export function toDraftValues(f: CreateFormValues, limits?: FormOptions["limits"]): MappedValues {
  const localIssues: MappedValues["localIssues"] = {};
  const values: DraftValues = {
    title: f.title.trim(),
    productType: f.productType,
    productCode: f.productCode.trim() || null,
    categoryId: f.categoryId || null,
    brand: f.brand.trim() || null,
    material: f.material.trim() || null,
    standardCategory: f.standardCategory.trim() || null,
    countryOfOrigin: f.countryOfOrigin || null,
    hsnCode: f.hsnCode.trim() || null,
  };
  const gst = parseNumber(f.gstRateBps);
  if (gst === null) values.gstRateBps = null;
  else if (!Number.isNaN(gst)) values.gstRateBps = gst;

  // description
  const max = limits?.descriptionMaxChars ?? 2000;
  const plain = htmlToPlain(f.description);
  if (isBlankHtml(f.description)) {
    values.description = null;
    values.descriptionHtml = null;
  } else if ([...plain].length > max) {
    localIssues.description = `The description can be at most ${max.toLocaleString("en-US")} characters (it has ${[...plain].length.toLocaleString("en-US")}).`;
  } else {
    values.descriptionHtml = f.description;
  }

  // dimensions: all three or none
  const dims = [f.dimLength, f.dimWidth, f.dimHeight].map(parseNumber);
  const dimFilled = dims.filter((d) => d !== null).length;
  if (dimFilled === 0) values.dimensions = null;
  else if (dimFilled === 3 && dims.every((d) => d !== null && !Number.isNaN(d))) {
    values.dimensions = { length: dims[0] as number, width: dims[1] as number, height: dims[2] as number, unit: f.dimUnit };
  } else localIssues.dimLength = dimFilled < 3 ? "Enter length, width and height (all three, or leave them empty)." : "Dimensions must be numbers.";

  // weight
  const w = parseNumber(f.weightValue);
  if (w === null) values.weight = null;
  else if (Number.isNaN(w)) localIssues.weightValue = "Weight must be a number.";
  else values.weight = { value: w, unit: f.weightUnit };

  // custom attributes: rows with both name and value; a row with only one of them is a local issue
  const rows = f.customAttributes.map((a) => ({ name: a.name.trim(), value: a.value.trim(), confirmed: a.confirmed }));
  const complete = rows.filter((r) => r.name && r.value);
  if (rows.some((r) => (r.name && !r.value) || (!r.name && r.value))) {
    localIssues.customAttributes = "Complete or clear the attribute rows that have only a name or only a value.";
  }
  values.customAttributes = complete.map((r) => ({ name: r.name, value: r.value, confirmed: r.confirmed }));
  return { values, localIssues };
}

/** the unsaved values the readiness preview needs */
export function toPreviewValues(f: CreateFormValues): PreviewValues {
  const blank = isBlankHtml(f.description);
  return {
    title: f.title.trim() || null,
    productCode: f.productCode.trim() || null,
    categoryId: f.categoryId || null,
    productType: f.productType,
    brand: f.brand.trim() || null,
    descriptionHtml: blank ? null : f.description,
    customAttributes: f.customAttributes.filter((a) => a.name.trim() && a.value.trim()).map((a) => ({ name: a.name.trim(), value: a.value.trim() })),
  };
}

/** does the form hold anything the seller typed or chose (besides the defaults)? */
export function hasContent(f: CreateFormValues): boolean {
  const d = emptyValues();
  return (
    f.title.trim() !== "" ||
    f.productCode.trim() !== "" ||
    f.categoryId !== "" ||
    f.brand.trim() !== "" ||
    !isBlankHtml(f.description) ||
    f.productType !== d.productType ||
    f.material !== "" ||
    f.standardCategory !== "" ||
    f.countryOfOrigin !== "" ||
    f.dimLength !== "" ||
    f.dimWidth !== "" ||
    f.dimHeight !== "" ||
    f.weightValue !== "" ||
    f.gstRateBps !== "" ||
    f.hsnCode !== "" ||
    f.customAttributes.some((a) => a.name.trim() || a.value.trim())
  );
}

/** a stable string of what would be saved (to know whether anything changed since the last save) */
export const snapshot = (f: CreateFormValues, limits?: FormOptions["limits"]): string => JSON.stringify(toDraftValues(f, limits).values);

// ------------------------------------------------------------------------------------------------ server errors
/** the form field an API field name belongs to */
export function formFieldFor(apiField: string): FormFieldKey | null {
  const f = apiField.replace(/^values\./, "");
  if (f === "description" || f === "descriptionHtml") return "description";
  if (f.startsWith("dimensions")) return f.endsWith(".width") ? "dimWidth" : f.endsWith(".height") ? "dimHeight" : f.endsWith(".unit") ? "dimUnit" : "dimLength";
  if (f.startsWith("weight")) return f.endsWith(".unit") ? "weightUnit" : "weightValue";
  if (f.startsWith("customAttributes")) return "customAttributes";
  const known: FormFieldKey[] = ["title", "productType", "categoryId", "brand", "productCode", "standardCategory", "material", "countryOfOrigin", "gstRateBps", "hsnCode"];
  return (known as string[]).includes(f) ? (f as FormFieldKey) : null;
}

/** maps `{ apiField: message }` (ApiError.fields or step errors) onto form fields; unknown fields come back in `rest` */
export function mapFieldErrors(fields: Record<string, string> | null | undefined): { byField: Partial<Record<FormFieldKey, string>>; rest: string[] } {
  const byField: Partial<Record<FormFieldKey, string>> = {};
  const rest: string[] = [];
  for (const [k, msg] of Object.entries(fields ?? {})) {
    const key = formFieldFor(k);
    if (key) byField[key] ??= msg;
    else rest.push(msg);
  }
  return { byField, rest };
}

/** fields that live in the "more product information" view */
export const MORE_INFO_FIELDS: FormFieldKey[] = [
  "standardCategory",
  "material",
  "countryOfOrigin",
  "dimLength",
  "dimWidth",
  "dimHeight",
  "weightValue",
  "gstRateBps",
  "hsnCode",
  "customAttributes",
];

/** the order errors are walked in to focus the first one */
export const FIELD_ORDER: FormFieldKey[] = ["title", "productType", "categoryId", "brand", "productCode", "description", ...MORE_INFO_FIELDS];

/** DOM id of a field (error scroll / focus, aria-describedby) */
export const fieldDomId = (key: FormFieldKey | "primary_image" | "master_sku" | "category" | "product_name"): string => {
  switch (key) {
    case "master_sku":
      return "cp-productCode";
    case "category":
      return "cp-categoryId";
    case "product_name":
      return "cp-title";
    case "primary_image":
      return "cp-primary-image";
    case "dimLength":
    case "dimWidth":
    case "dimHeight":
      return "cp-dimLength";
    default:
      return `cp-${key}`;
  }
};
