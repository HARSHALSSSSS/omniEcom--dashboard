import { isCountryCode } from './countries';
import { DESCRIPTION_MAX_CHARS, DESCRIPTION_MAX_INPUT, cleanDescriptionChars, sanitizeDescription, truncatePlainText } from './description';
import { normalizeDimensions, normalizeWeight, type DimensionsInput, type FieldProblem, type WeightInput } from './physical';
import type { ProductType } from './product-types';

/**
 * Field rules of the product editor (docs/figma/41-creation-build-brief.md section 2) in ONE place, shared by create / patch / draft /
 * continue / validate-step. Pure: no database access. A field that is not sent stays `undefined` (= keep), `null` = clear.
 */
export type FieldIssue = FieldProblem;

export const CODE_MAX = 64;
export const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;
export const PLACEHOLDER_CODE_PATTERN = /^DRAFT-[A-Z0-9]{8}$/i;
export const TITLE_MAX = 200;
export const TITLE_MIN_STEP = 3;
export const BRAND_MAX = 80;
export const MATERIAL_MAX = 80;
export const STANDARD_CATEGORY_MAX = 120;
export const GST_MAX_BPS = 2800;
export const HSN_LENGTHS = [4, 6, 8] as const;
export const CUSTOM_ATTRIBUTES_MAX = 20;
export const CUSTOM_ATTRIBUTE_NAME_MAX = 60;
export const CUSTOM_ATTRIBUTE_VALUE_MAX = 250;

export type { ProductType };
export interface CustomAttribute { name: string; value: string; confirmed: boolean }
export interface CustomAttributeInput { name: string; value: string; confirmed?: boolean }

/** trim + collapse every run of whitespace (and drop control characters) */
export const collapseSpaces = (s: string): string => cleanDescriptionChars(s).replace(/\s+/g, ' ').trim();
const len = (s: string) => [...s].length;

/** key used to compare brand names / attribute names / codes: lower-case with collapsed whitespace */
export const nameKey = (s: string): string => collapseSpaces(s).toLowerCase();

export const isPlaceholderCode = (code: string | null | undefined): boolean => !!code && PLACEHOLDER_CODE_PATTERN.test(code);

export type CodeProblem = 'empty' | 'too_long' | 'invalid_characters' | 'placeholder';
/** `reason` is set when the candidate cannot be used as a master code */
export function checkCode(raw: string | null | undefined): { code: string; reason: CodeProblem | null } {
  const code = (raw ?? '').trim();
  if (code === '') return { code, reason: 'empty' };
  if (len(code) > CODE_MAX) return { code, reason: 'too_long' };
  if (!CODE_PATTERN.test(code)) return { code, reason: 'invalid_characters' };
  if (isPlaceholderCode(code)) return { code, reason: 'placeholder' };
  return { code, reason: null };
}
export const CODE_REASON_MESSAGE: Record<CodeProblem, string> = {
  empty: 'Enter a Master SKU',
  too_long: `Master SKU can be at most ${CODE_MAX} characters`,
  invalid_characters: 'Master SKU may contain letters, digits and . _ - / only, and must start with a letter or digit',
  placeholder: 'DRAFT-XXXXXXXX codes are reserved for drafts without a Master SKU; choose your own code',
};

export interface RawFields {
  productCode?: string;
  title?: string;
  description?: string | null;
  descriptionHtml?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  countryOfOrigin?: string | null;
  categoryId?: string | null;
  hsnCode?: string | null;
  gstRateBps?: number | null;
  tags?: string[];
  productType?: ProductType;
  material?: string | null;
  standardCategory?: string | null;
  dimensions?: DimensionsInput | null;
  weight?: WeightInput | null;
  customAttributes?: CustomAttributeInput[] | null;
}

/** canonical values, only the keys that were sent */
export interface NormalizedFields {
  productCode?: string;
  title?: string;
  description?: string | null;
  descriptionHtml?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  countryOfOrigin?: string | null;
  categoryId?: string | null;
  hsnCode?: string | null;
  gstRateBps?: number | null;
  tags?: string[];
  productType?: ProductType;
  material?: string | null;
  standardCategory?: string | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  weightGrams?: number | null;
  customAttributes?: CustomAttribute[];
}

export interface NormalizeOptions {
  /** true: a title / brand / description over the limit is an error (HTTP callers); false: it is cut to the limit (imports, copies) */
  strict: boolean;
  /** the product's current custom attributes: unchanged facts keep their `confirmed` flag when the client re-sends the list */
  previousAttributes?: CustomAttribute[];
  /** the product's current code when it is a generated DRAFT-xxxx placeholder: sending it back unchanged is allowed */
  currentPlaceholderCode?: string | null;
}

const issue = (field: string, code: string, message: string): FieldIssue => ({ field, code, message });

function optionalText(raw: string | null | undefined, field: string, max: number, issues: FieldIssue[], strict: boolean): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const v = collapseSpaces(raw);
  if (v === '') { issues.push(issue(field, 'required', `${field} cannot be empty (send null to clear it)`)); return undefined; }
  if (len(v) > max) {
    if (!strict) return [...v].slice(0, max).join('').trim();
    issues.push(issue(field, 'too_long', `${field} can be at most ${max} characters`));
    return undefined;
  }
  return v;
}

export function descriptionIssue(length: number): FieldIssue & { length: number; max: number } {
  return { ...issue('description', 'description_too_long', `The description can be at most ${DESCRIPTION_MAX_CHARS} characters (it has ${length})`), length, max: DESCRIPTION_MAX_CHARS };
}

/** description / descriptionHtml (html wins when both are sent) -> { description (plain), descriptionHtml } */
export function normalizeDescription(raw: { description?: string | null; descriptionHtml?: string | null }, strict: boolean): { value: { description: string | null; descriptionHtml: string | null } | undefined; issues: Array<FieldIssue & { length?: number; max?: number }> } {
  const source = raw.descriptionHtml !== undefined ? raw.descriptionHtml : raw.description;
  if (source === undefined) return { value: undefined, issues: [] };
  if (source === null) return { value: { description: null, descriptionHtml: null }, issues: [] };
  if (strict && source.length > DESCRIPTION_MAX_INPUT) return { value: undefined, issues: [descriptionIssue(source.length)] };
  let s = sanitizeDescription(source);
  if (s.length > DESCRIPTION_MAX_CHARS) {
    if (strict) return { value: undefined, issues: [descriptionIssue(s.length)] };
    s = sanitizeDescription(truncatePlainText(s.text, DESCRIPTION_MAX_CHARS));
  }
  return { value: s.text === '' ? { description: null, descriptionHtml: null } : { description: s.text, descriptionHtml: s.html }, issues: [] };
}

export function normalizeCustomAttributes(input: CustomAttributeInput[] | null | undefined, previous: CustomAttribute[] = []): { value: CustomAttribute[] | undefined; issues: FieldIssue[] } {
  if (input === undefined) return { value: undefined, issues: [] };
  if (input === null) return { value: [], issues: [] };
  const issues: FieldIssue[] = [];
  if (input.length > CUSTOM_ATTRIBUTES_MAX) issues.push(issue('customAttributes', 'too_many', `At most ${CUSTOM_ATTRIBUTES_MAX} custom attributes are allowed`));
  const before = new Map(previous.map((a) => [nameKey(a.name), a]));
  const seen = new Set<string>();
  const out: CustomAttribute[] = [];
  input.slice(0, CUSTOM_ATTRIBUTES_MAX + 1).forEach((a, i) => {
    const name = collapseSpaces(a.name ?? '');
    const value = collapseSpaces(a.value ?? '');
    if (name === '' && value === '') return; // an untouched "add attribute" row
    const at = `customAttributes[${i}]`;
    let ok = true;
    if (name === '') { issues.push(issue(`${at}.name`, 'required', 'Attribute name is required')); ok = false; }
    else if (len(name) > CUSTOM_ATTRIBUTE_NAME_MAX) { issues.push(issue(`${at}.name`, 'too_long', `Attribute name can be at most ${CUSTOM_ATTRIBUTE_NAME_MAX} characters`)); ok = false; }
    if (value === '') { issues.push(issue(`${at}.value`, 'required', 'Attribute value is required')); ok = false; }
    else if (len(value) > CUSTOM_ATTRIBUTE_VALUE_MAX) { issues.push(issue(`${at}.value`, 'too_long', `Attribute value can be at most ${CUSTOM_ATTRIBUTE_VALUE_MAX} characters`)); ok = false; }
    if (!ok) return;
    const key = name.toLowerCase();
    if (seen.has(key)) { issues.push(issue(`${at}.name`, 'duplicate_name', `Attribute "${name}" is listed twice`)); return; }
    seen.add(key);
    const prev = before.get(key);
    out.push({ name, value, confirmed: a.confirmed ?? (prev !== undefined && prev.confirmed && prev.value === value) });
  });
  return { value: issues.length ? undefined : out, issues };
}

export function normalizeFields(raw: RawFields, opts: NormalizeOptions): { fields: NormalizedFields; issues: Array<FieldIssue & { length?: number; max?: number }> } {
  const issues: Array<FieldIssue & { length?: number; max?: number }> = [];
  const f: NormalizedFields = {};

  if (raw.title !== undefined) {
    const t = collapseSpaces(raw.title);
    if (t === '') issues.push(issue('title', 'required', 'Enter a product name'));
    else if (len(t) > TITLE_MAX && opts.strict) issues.push(issue('title', 'too_long', `The product name can be at most ${TITLE_MAX} characters`));
    else f.title = len(t) > TITLE_MAX ? [...t].slice(0, TITLE_MAX).join('').trim() : t;
  }

  if (raw.productCode !== undefined) {
    const c = checkCode(raw.productCode);
    const keepsPlaceholder = c.reason === 'placeholder' && opts.currentPlaceholderCode && opts.currentPlaceholderCode.toLowerCase() === c.code.toLowerCase();
    if (c.reason && !keepsPlaceholder) issues.push(issue('productCode', c.reason === 'empty' ? 'required' : c.reason === 'placeholder' ? 'placeholder_code' : c.reason === 'too_long' ? 'too_long' : 'invalid_code', CODE_REASON_MESSAGE[c.reason]));
    else f.productCode = keepsPlaceholder ? opts.currentPlaceholderCode! : c.code;
  }

  const d = normalizeDescription(raw, opts.strict);
  issues.push(...d.issues);
  if (d.value) { f.description = d.value.description; f.descriptionHtml = d.value.descriptionHtml; }

  const brand = optionalText(raw.brand, 'brand', BRAND_MAX, issues, opts.strict);
  if (brand !== undefined) f.brand = brand;
  const manufacturer = optionalText(raw.manufacturer, 'manufacturer', 150, issues, opts.strict);
  if (manufacturer !== undefined) f.manufacturer = manufacturer;
  const material = optionalText(raw.material, 'material', MATERIAL_MAX, issues, opts.strict);
  if (material !== undefined) f.material = material;
  const standardCategory = optionalText(raw.standardCategory, 'standardCategory', STANDARD_CATEGORY_MAX, issues, opts.strict);
  if (standardCategory !== undefined) f.standardCategory = standardCategory;

  if (raw.countryOfOrigin !== undefined) {
    if (raw.countryOfOrigin === null) f.countryOfOrigin = null;
    else {
      const cc = raw.countryOfOrigin.trim().toUpperCase();
      if (isCountryCode(cc)) f.countryOfOrigin = cc;
      else issues.push(issue('countryOfOrigin', 'unknown_country', `"${raw.countryOfOrigin}" is not an ISO 3166-1 alpha-2 country code`));
    }
  }

  if (raw.hsnCode !== undefined) {
    if (raw.hsnCode === null) f.hsnCode = null;
    else {
      const h = raw.hsnCode.trim();
      if (!/^[0-9]+$/.test(h)) issues.push(issue('hsnCode', 'invalid_hsn', 'HSN code must contain digits only'));
      else if (!(HSN_LENGTHS as readonly number[]).includes(h.length)) issues.push(issue('hsnCode', 'invalid_hsn', 'HSN code must have 4, 6 or 8 digits'));
      else f.hsnCode = h;
    }
  }

  if (raw.gstRateBps !== undefined) {
    if (raw.gstRateBps === null) f.gstRateBps = null;
    else if (!Number.isInteger(raw.gstRateBps) || raw.gstRateBps < 0 || raw.gstRateBps > GST_MAX_BPS) issues.push(issue('gstRateBps', 'invalid_gst', `GST rate must be a whole number of basis points between 0 and ${GST_MAX_BPS}`));
    else f.gstRateBps = raw.gstRateBps;
  }

  if (raw.categoryId !== undefined) f.categoryId = raw.categoryId;
  if (raw.tags !== undefined) f.tags = raw.tags;
  if (raw.productType !== undefined) f.productType = raw.productType;

  const dims = normalizeDimensions(raw.dimensions);
  issues.push(...dims.issues);
  if (dims.value === null) { f.lengthMm = null; f.widthMm = null; f.heightMm = null; }
  else if (dims.value) { f.lengthMm = dims.value.length; f.widthMm = dims.value.width; f.heightMm = dims.value.height; }

  const weight = normalizeWeight(raw.weight);
  issues.push(...weight.issues);
  if (weight.value !== undefined) f.weightGrams = weight.value;

  const attrs = normalizeCustomAttributes(raw.customAttributes, opts.previousAttributes);
  issues.push(...attrs.issues);
  if (attrs.value) f.customAttributes = attrs.value;

  return { fields: f, issues };
}
