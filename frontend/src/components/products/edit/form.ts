import type { CustomAttribute, EditChanges, EditorProduct, ProductType } from "@/types/productEdit";

/** The editable state of the page: strings for inputs, the baseline is the product as last loaded or saved. */
export interface FormValues {
  productCode: string;
  title: string;
  productType: ProductType;
  categoryId: string;
  brand: string;
  /** rich text as HTML */
  description: string;
  manufacturer: string;
  material: string;
  standardCategory: string;
  countryOfOrigin: string;
  hsnCode: string;
  /** percent, e.g. "18" (the API stores basis points) */
  gstPercent: string;
  tags: string[];
  dimLength: string;
  dimWidth: string;
  dimHeight: string;
  weight: string;
  customAttributes: CustomAttribute[];
}

/** field groups that modified markers and Revert work on (dimensions are one field of three inputs) */
export type FormKey =
  | "productCode"
  | "title"
  | "productType"
  | "categoryId"
  | "brand"
  | "description"
  | "manufacturer"
  | "material"
  | "standardCategory"
  | "countryOfOrigin"
  | "hsnCode"
  | "gstPercent"
  | "tags"
  | "dimensions"
  | "weight"
  | "customAttributes";

export const FORM_KEYS: FormKey[] = [
  "productCode",
  "title",
  "productType",
  "categoryId",
  "brand",
  "description",
  "manufacturer",
  "material",
  "standardCategory",
  "countryOfOrigin",
  "hsnCode",
  "gstPercent",
  "tags",
  "dimensions",
  "weight",
  "customAttributes",
];

export const FIELD_LABEL: Record<FormKey, string> = {
  productCode: "Master SKU",
  title: "Product name",
  productType: "Product type",
  categoryId: "Category",
  brand: "Brand",
  description: "Description",
  manufacturer: "Manufacturer",
  material: "Material",
  standardCategory: "Standard category",
  countryOfOrigin: "Country of origin",
  hsnCode: "HSN code",
  gstPercent: "Tax information (GST)",
  tags: "Tags",
  dimensions: "Dimensions",
  weight: "Weight",
  customAttributes: "Custom attributes",
};

export const DESCRIPTION_MAX = 2000;

// ------------------------------------------------------------------------------------------------ html helpers
const BLOCK_END = /<\/(p|div|li|ul|ol|h[1-6])>|<br\s*\/?>/gi;

/** plain text of editor HTML (parsed in an inert document: nothing loads or runs) */
export function htmlToPlain(html: string): string {
  if (!html) return "";
  const withBreaks = html.replace(BLOCK_END, (m) => `${m}\n`);
  const doc = new DOMParser().parseFromString(withBreaks, "text/html");
  return (doc.body.textContent ?? "").replace(new RegExp(String.fromCharCode(160), "g"), " ").replace(/\n{3,}/g, "\n\n").trim();
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** a plain description (older products have no HTML) as paragraphs */
export function plainToHtml(text: string): string {
  const t = text.trim();
  if (!t) return "";
  return t
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function baselineHtml(p: EditorProduct): string {
  return p.descriptionHtml ?? (p.description ? plainToHtml(p.description) : "");
}

const num = (n: number): string => (Number.isFinite(n) ? String(n) : "");

export function toFormValues(p: EditorProduct): FormValues {
  return {
    productCode: p.productCode,
    title: p.title,
    productType: p.productType,
    categoryId: p.categoryId ?? "",
    brand: p.brand ?? "",
    description: baselineHtml(p),
    manufacturer: p.manufacturer ?? "",
    material: p.material ?? "",
    standardCategory: p.standardCategory ?? "",
    countryOfOrigin: p.countryOfOrigin ?? "",
    hsnCode: p.hsnCode ?? "",
    gstPercent: p.gstRateBps == null ? "" : num(p.gstRateBps / 100),
    tags: [...p.tags],
    dimLength: p.dimensions ? num(p.dimensions.length) : "",
    dimWidth: p.dimensions ? num(p.dimensions.width) : "",
    dimHeight: p.dimensions ? num(p.dimensions.height) : "",
    weight: p.weight ? num(p.weight.value) : "",
    customAttributes: p.customAttributes.map((a) => ({ ...a })),
  };
}

// ------------------------------------------------------------------------------------------------ compare
const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
};

const canonical = (v: FormValues, key: FormKey): string => {
  switch (key) {
    case "description":
      return htmlToPlain(v.description) === "" ? "" : v.description;
    case "tags":
      return JSON.stringify(v.tags);
    case "dimensions":
      return JSON.stringify([numOrNull(v.dimLength), numOrNull(v.dimWidth), numOrNull(v.dimHeight)]);
    case "weight":
      return JSON.stringify(numOrNull(v.weight));
    case "gstPercent":
      return JSON.stringify(numOrNull(v.gstPercent));
    case "customAttributes":
      return JSON.stringify(v.customAttributes.map((a) => [a.name.trim(), a.value.trim(), a.confirmed]));
    default:
      return String(v[key]).trim();
  }
};

export const isModified = (base: FormValues, cur: FormValues, key: FormKey): boolean => canonical(base, key) !== canonical(cur, key);
export const modifiedKeys = (base: FormValues, cur: FormValues): FormKey[] => FORM_KEYS.filter((k) => isModified(base, cur, k));

/** put one field (or all of its inputs) back to the baseline */
export function revertField(cur: FormValues, base: FormValues, key: FormKey): FormValues {
  switch (key) {
    case "dimensions":
      return { ...cur, dimLength: base.dimLength, dimWidth: base.dimWidth, dimHeight: base.dimHeight };
    case "tags":
      return { ...cur, tags: [...base.tags] };
    case "customAttributes":
      return { ...cur, customAttributes: base.customAttributes.map((a) => ({ ...a })) };
    default:
      return { ...cur, [key]: base[key as keyof FormValues] } as FormValues;
  }
}

// ------------------------------------------------------------------------------------------------ payload
export type FieldProblems = Partial<Record<FormKey, string>>;

const orNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());

/** the request body: only fields that differ from the baseline; `problems` are input mistakes the server would reject anyway */
export function buildChanges(base: FormValues, cur: FormValues): { changes: EditChanges; problems: FieldProblems } {
  const changes: EditChanges = {};
  const problems: FieldProblems = {};
  for (const key of modifiedKeys(base, cur)) {
    switch (key) {
      case "productCode":
        changes.productCode = cur.productCode.trim();
        break;
      case "title":
        changes.title = cur.title.trim();
        break;
      case "productType":
        changes.productType = cur.productType;
        break;
      case "categoryId":
        changes.categoryId = cur.categoryId === "" ? null : cur.categoryId;
        break;
      case "brand":
      case "manufacturer":
      case "material":
      case "standardCategory":
      case "countryOfOrigin":
      case "hsnCode":
        changes[key] = orNull(cur[key]);
        break;
      case "description": {
        const plain = htmlToPlain(cur.description);
        changes.description = plain === "" ? null : plain;
        changes.descriptionHtml = plain === "" ? null : cur.description;
        break;
      }
      case "gstPercent": {
        const n = numOrNull(cur.gstPercent);
        if (n !== null && Number.isNaN(n)) problems.gstPercent = "Enter a number, for example 18";
        else changes.gstRateBps = n === null ? null : Math.round(n * 100);
        break;
      }
      case "tags":
        changes.tags = cur.tags;
        break;
      case "dimensions": {
        const parts = [numOrNull(cur.dimLength), numOrNull(cur.dimWidth), numOrNull(cur.dimHeight)];
        if (parts.every((p) => p === null)) changes.dimensions = null;
        else if (parts.some((p) => p === null || Number.isNaN(p))) problems.dimensions = "Enter length, width and height as numbers";
        else changes.dimensions = { length: parts[0] as number, width: parts[1] as number, height: parts[2] as number, unit: "cm" };
        break;
      }
      case "weight": {
        const n = numOrNull(cur.weight);
        if (n !== null && Number.isNaN(n)) problems.weight = "Enter the weight in kg as a number";
        else changes.weight = n === null ? null : { value: n, unit: "kg" };
        break;
      }
      case "customAttributes": {
        const list = cur.customAttributes.map((a) => ({ name: a.name.trim(), value: a.value.trim(), confirmed: a.confirmed }));
        if (list.some((a) => a.name === "" || a.value === "")) problems.customAttributes = "Every custom attribute needs a name and a value";
        else changes.customAttributes = list;
        break;
      }
    }
  }
  return { changes, problems };
}

/** server field path -> the field of this page */
export function formKeyOf(path: string): FormKey | null {
  const root = path.replace(/[.[].*$/, "");
  const map: Record<string, FormKey> = {
    productCode: "productCode",
    title: "title",
    productType: "productType",
    categoryId: "categoryId",
    brand: "brand",
    description: "description",
    descriptionHtml: "description",
    manufacturer: "manufacturer",
    material: "material",
    standardCategory: "standardCategory",
    countryOfOrigin: "countryOfOrigin",
    hsnCode: "hsnCode",
    gstRateBps: "gstPercent",
    tags: "tags",
    dimensions: "dimensions",
    lengthMm: "dimensions",
    widthMm: "dimensions",
    heightMm: "dimensions",
    weight: "weight",
    weightGrams: "weight",
    customAttributes: "customAttributes",
  };
  return map[root] ?? null;
}

/** split server field messages into this page's fields and the rest */
export function mapFieldErrors(fields: Record<string, string> | null): { byKey: FieldProblems; other: string[] } {
  const byKey: FieldProblems = {};
  const other: string[] = [];
  for (const [path, message] of Object.entries(fields ?? {})) {
    const key = formKeyOf(path);
    if (key && !byKey[key]) byKey[key] = message;
    else if (!key) other.push(`${path}: ${message}`);
  }
  return { byKey, other };
}

/** the baseline value of a field as text, for "Previously: ..." */
export function previousText(base: FormValues, key: FormKey, categoryName: (id: string) => string): string {
  switch (key) {
    case "description": {
      const t = htmlToPlain(base.description);
      return t === "" ? "(empty)" : t.length > 140 ? `${t.slice(0, 140)}…` : t;
    }
    case "categoryId":
      return base.categoryId ? categoryName(base.categoryId) : "(none)";
    case "dimensions":
      return base.dimLength ? `${base.dimLength} x ${base.dimWidth} x ${base.dimHeight} cm` : "(empty)";
    case "weight":
      return base.weight ? `${base.weight} kg` : "(empty)";
    case "gstPercent":
      return base.gstPercent ? `${base.gstPercent}%` : "(empty)";
    case "tags":
      return base.tags.length ? base.tags.join(", ") : "(none)";
    case "customAttributes":
      return base.customAttributes.length ? base.customAttributes.map((a) => `${a.name}: ${a.value}`).join(", ") : "(none)";
    default: {
      const v = String(base[key]).trim();
      return v === "" ? "(empty)" : v;
    }
  }
}
