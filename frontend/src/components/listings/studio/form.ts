import type { ListingPatch, ListingStudio } from "@/types/listingStudio";

/** the editable surface of the studio: strings for every input, converted to the API shape only on save */
export interface FormValues {
  title: string;
  description: string;
  bullets: string[];
  searchTerms: string;
  brand: string;
  /** rupees, as typed ("2899", "2899.50") */
  price: string;
  mrp: string;
  attrs: Record<string, string>;
}

export type FormKey = "title" | "description" | "bulletPoints" | "searchTerms" | "brand" | "price" | "mrp" | `attr:${string}`;
export type FieldProblems = Partial<Record<FormKey, string>>;

// ------------------------------------------------------------------------------------------------ money
/** "2899.50" -> 289950 exactly (string parsing, never a float). null when the text is not an amount with at most 2 decimals. */
export function parseRupees(text: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ""));
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}

/** 289950 -> "2899.50" */
export function rupeesText(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

// ------------------------------------------------------------------------------------------------ baseline
export const splitTerms = (text: string): string[] => text.split(",").map((t) => t.trim()).filter(Boolean);
const cleanList = (list: string[]): string[] => list.map((b) => b.trim()).filter(Boolean);

export function toFormValues(s: ListingStudio): FormValues {
  return {
    title: s.content.title.effective,
    description: s.content.description.effective ?? "",
    bullets: [...s.content.bulletPoints.effective],
    searchTerms: s.content.searchTerms.effective.join(", "),
    brand: s.content.brand.effective ?? "",
    price: rupeesText(s.pricing.priceMinor),
    mrp: rupeesText(s.pricing.mrpMinor),
    attrs: Object.fromEntries(s.category.attributes.map((a) => [a.key, a.value === null ? "" : String(a.value)])),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** the fields whose value differs from the saved baseline */
export function modifiedKeys(base: FormValues, v: FormValues): FormKey[] {
  const out: FormKey[] = [];
  if (v.title.trim() !== base.title.trim()) out.push("title");
  if (v.description !== base.description) out.push("description");
  if (!same(cleanList(v.bullets), cleanList(base.bullets))) out.push("bulletPoints");
  if (!same(splitTerms(v.searchTerms), splitTerms(base.searchTerms))) out.push("searchTerms");
  if (v.brand.trim() !== base.brand.trim()) out.push("brand");
  if (v.price.trim() !== base.price.trim() && parseRupees(v.price) !== parseRupees(base.price)) out.push("price");
  if (v.mrp.trim() !== base.mrp.trim() && parseRupees(v.mrp) !== parseRupees(base.mrp)) out.push("mrp");
  for (const [k, val] of Object.entries(v.attrs)) if (val.trim() !== (base.attrs[k] ?? "").trim()) out.push(`attr:${k}`);
  return out;
}

export const isDirty = (base: FormValues, v: FormValues): boolean => modifiedKeys(base, v).length > 0;

// ------------------------------------------------------------------------------------------------ save payload
export interface BuiltChanges {
  changes: Omit<ListingPatch, "version">;
  problems: FieldProblems;
}

/**
 * Only what changed. A value that equals the master (content) or the product value (price) is sent as null: the override is
 * removed and the channel follows the master again.
 */
export function buildChanges(s: ListingStudio, base: FormValues, v: FormValues): BuiltChanges {
  const changes: Omit<ListingPatch, "version"> = {};
  const problems: FieldProblems = {};
  const keys = new Set(modifiedKeys(base, v));
  const c = s.content;

  if (keys.has("title")) {
    const t = v.title.trim();
    changes.title = t === "" || t === c.title.master.trim() ? null : t;
  }
  if (keys.has("description")) {
    changes.description = v.description.trim() === "" || v.description === (c.description.master ?? "") ? null : v.description;
  }
  if (keys.has("bulletPoints")) {
    const list = cleanList(v.bullets);
    if (list.length > 10) problems.bulletPoints = "At most 10 bullet points";
    else if (list.some((b) => b.length > 500)) problems.bulletPoints = "A bullet point can have at most 500 characters";
    else changes.bulletPoints = list.length === 0 ? null : list;
  }
  if (keys.has("searchTerms")) {
    const list = splitTerms(v.searchTerms);
    if (list.length > 50) problems.searchTerms = "At most 50 search terms";
    else if (list.some((t) => t.length > 100)) problems.searchTerms = "A search term can have at most 100 characters";
    else changes.searchTerms = list.length === 0 || same(list, c.searchTerms.master) ? null : list;
  }
  if (keys.has("brand")) {
    const b = v.brand.trim();
    changes.brand = b === "" || b === (c.brand.master ?? "").trim() ? null : b;
  }
  if (keys.has("price")) {
    const minor = parseRupees(v.price);
    if (minor === null) problems.price = "Enter an amount like 2899 or 2899.50";
    else if (minor <= 0) problems.price = "The price must be greater than zero";
    else changes.priceMinor = s.pricing.listingPriceOverride && minor === s.pricing.variantPriceMinor ? null : minor;
  }
  if (keys.has("mrp")) {
    if (v.mrp.trim() === "") changes.mrpMinor = null;
    else {
      const minor = parseRupees(v.mrp);
      if (minor === null) problems.mrp = "Enter an amount like 2999 or 2999.50";
      else if (minor <= 0) problems.mrp = "The MRP must be greater than zero";
      else changes.mrpMinor = s.pricing.listingMrpOverride && minor === s.pricing.variantMrpMinor ? null : minor;
    }
  }

  const overrides: Record<string, string | number | boolean | null> = {};
  for (const a of s.category.attributes) {
    const key = `attr:${a.key}` as FormKey;
    if (!keys.has(key)) continue;
    const text = (v.attrs[a.key] ?? "").trim();
    if (text === "") overrides[a.key] = null;
    else if (a.type === "number") {
      if (!Number.isFinite(Number(text))) problems[key] = "Enter a number";
      else overrides[a.key] = Number(text);
    } else if (a.type === "boolean") overrides[a.key] = text === "true";
    else if (a.maxLength !== null && text.length > a.maxLength) problems[key] = `At most ${a.maxLength} characters`;
    else overrides[a.key] = text;
  }
  if (Object.keys(overrides).length) changes.attributeOverrides = overrides;
  return { changes, problems };
}

// ------------------------------------------------------------------------------------------------ server errors
export const PRICE_ABOVE_MRP = "The selling price cannot be higher than the MRP.";

/** details.issues / details.errors paths of the API -> the input that owns them; what has no input is returned in `other` */
export function mapFieldErrors(fields: Record<string, string>): { byKey: FieldProblems; other: string[] } {
  const byKey: FieldProblems = {};
  const other: string[] = [];
  for (const [path, message] of Object.entries(fields)) {
    const head = path.split(".")[0] ?? path;
    if (path.startsWith("attributeOverrides.")) byKey[`attr:${path.slice("attributeOverrides.".length)}`] = message;
    else if (head === "priceMinor" || head === "price") byKey.price = message;
    else if (head === "mrpMinor" || head === "mrp") byKey.mrp = message;
    else if (head === "title" || head === "description" || head === "bulletPoints" || head === "searchTerms" || head === "brand") byKey[head] = message;
    else other.push(message);
  }
  return { byKey, other };
}

/** DOM id of an input, for the readiness "fix" actions that focus a field */
export const fieldId = (key: string): string => `studio-${key.replace(":", "-")}`;
