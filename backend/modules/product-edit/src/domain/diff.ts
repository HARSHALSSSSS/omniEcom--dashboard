import {
  isPlaceholderCode, nameKey, normalizeFields, sanitizeDescription, TITLE_MIN_STEP,
  type CustomAttribute, type FieldIssue, type NormalizedFields, type ProductRow, type RawFields,
} from '@oms/mod-catalog';
import type { ContentField } from '../infrastructure/listings-port';

/**
 * THE diff of the edit flow (docs/figma/51-edit-build-brief.md, point (a)): `change-impact` and `edit/save` both call `computeChange`, so
 * "what changed" can never differ between the preview and the save. The baseline is the stored product; the `changes` payload goes through the
 * strict field rules of the creation flow (normalizeFields), and every value is then compared in its canonical form (plain text for
 * descriptions, millimetres / grams for physical data, case-insensitive brand names, attributes by name). A value equal to the baseline is
 * not a change. Pure: no database access.
 */
export const CHANGE_KEYS = [
  'productCode', 'title', 'productType', 'categoryId', 'brand', 'description', 'material', 'dimensions', 'weight', 'countryOfOrigin',
  'hsnCode', 'gstRateBps', 'customAttributes', 'tags', 'standardCategory', 'manufacturer',
] as const;
export type ChangeKey = (typeof CHANGE_KEYS)[number];

export const FIELD_LABELS: Record<ChangeKey, string> = {
  productCode: 'Master SKU', title: 'Product name', productType: 'Product type', categoryId: 'Category', brand: 'Brand', description: 'Description',
  material: 'Material', dimensions: 'Dimensions', weight: 'Weight', countryOfOrigin: 'Country of origin', hsnCode: 'HSN code',
  gstRateBps: 'Tax information', customAttributes: 'Custom attributes', tags: 'Tags', standardCategory: 'Standard category', manufacturer: 'Manufacturer',
};

/** which master content a listing inherits (the LISTINGS contract). Keys that no listing reads are absent. */
const CONTENT_FIELD: Partial<Record<ChangeKey, ContentField>> = {
  title: 'title', description: 'description', brand: 'brand', categoryId: 'category', productType: 'productType', material: 'material',
  dimensions: 'dimensions', weight: 'weight', countryOfOrigin: 'countryOfOrigin', hsnCode: 'hsnCode', gstRateBps: 'gstRate', customAttributes: 'customAttributes', tags: 'tags', manufacturer: 'brand',
};
export const ALL_CONTENT_FIELDS: ContentField[] = ['title', 'description', 'brand', 'category', 'productType', 'material', 'dimensions', 'weight', 'countryOfOrigin', 'hsnCode', 'gstRate', 'customAttributes', 'tags'];

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export interface ChangedField {
  field: ChangeKey;
  label: string;
  message: string;
  before: Json;
  after: Json;
  /** the plain text did not change, only the formatting of the description */
  formattingOnly?: boolean;
}

export interface ChangeSet {
  /** field problems (normalizeFields rules + the rules of a product that is no longer a draft) */
  issues: Array<FieldIssue & { length?: number; max?: number }>;
  /** the columns to write: only keys whose value differs from the stored product */
  fields: NormalizedFields;
  items: ChangedField[];
  contentFields: ContentField[];
  category: { fromId: string | null; toId: string | null } | null;
  categoryChanged: boolean;
  typeChanged: boolean;
  /** the master code would change */
  codeChange: { from: string; to: string } | null;
  /** the master code would change on a product that is no longer a draft (E1): the save answers 409 code_locked */
  codeLocked: boolean;
}

/** the columns each change key writes (to leave out a key that carries a problem) */
const COLUMNS: Record<ChangeKey, Array<keyof NormalizedFields>> = {
  productCode: ['productCode'], title: ['title'], productType: ['productType'], categoryId: ['categoryId'], brand: ['brand'], description: ['description', 'descriptionHtml'],
  material: ['material'], dimensions: ['lengthMm', 'widthMm', 'heightMm'], weight: ['weightGrams'], countryOfOrigin: ['countryOfOrigin'], hsnCode: ['hsnCode'], gstRateBps: ['gstRateBps'],
  customAttributes: ['customAttributes'], tags: ['tags'], standardCategory: ['standardCategory'], manufacturer: ['manufacturer'],
};
const rootOf = (field: string) => field.replace(/[.[].*$/, '');

/** a field with a problem is not part of the change (the preview shows the problem next to the impact of the rest; the save refuses everything) */
export function withIssues(change: ChangeSet, more: FieldIssue[]): ChangeSet {
  const issues = [...change.issues, ...more];
  const bad = new Set(issues.map((i) => rootOf(i.field)));
  const items = change.items.filter((i) => !bad.has(i.field));
  const fields: NormalizedFields = { ...change.fields };
  for (const i of change.items) if (bad.has(i.field)) for (const col of COLUMNS[i.field]) delete fields[col];
  const content = new Set(items.flatMap((i) => (CONTENT_FIELD[i.field] && !i.formattingOnly ? [CONTENT_FIELD[i.field]!] : [])));
  const categoryChanged = fields.categoryId !== undefined;
  return {
    issues, fields, items,
    contentFields: ALL_CONTENT_FIELDS.filter((f) => content.has(f)),
    category: categoryChanged ? change.category : null,
    categoryChanged,
    typeChanged: fields.productType !== undefined,
    codeChange: fields.productCode !== undefined ? change.codeChange : null,
    codeLocked: change.codeLocked,
  };
}

const productTypeOf = (p: ProductRow): 'physical' | 'digital' | 'service' => (((p.attributes ?? {}) as Record<string, unknown>).productType ?? 'physical') as 'physical' | 'digital' | 'service';
const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
const attrKey = (a: CustomAttribute) => JSON.stringify([nameKey(a.name), a.value, a.confirmed ? 1 : 0]);

export function computeChange(before: ProductRow, raw: RawFields): ChangeSet {
  const placeholder = before.status === 'draft' && isPlaceholderCode(before.productCode) ? before.productCode : null;
  const previous = (before.customAttributes ?? []) as CustomAttribute[];
  const { fields: f, issues } = normalizeFields(raw, { strict: true, previousAttributes: previous, currentPlaceholderCode: placeholder });

  // a product that is no longer a draft keeps the "continue" rules of the creation flow
  if (before.status !== 'draft') {
    if (raw.title !== undefined && f.title !== undefined && [...f.title].length < TITLE_MIN_STEP) issues.push({ field: 'title', code: 'title_too_short', message: `The product name needs at least ${TITLE_MIN_STEP} characters` });
    if (raw.categoryId === null) issues.push({ field: 'categoryId', code: 'category_required', message: 'An active product needs a category' });
  }

  const out: NormalizedFields = {};
  const items: ChangedField[] = [];
  const content = new Set<ContentField>();
  const mark = (field: ChangeKey, b: Json, a: Json, extra: { formattingOnly?: boolean } = {}) => {
    const label = FIELD_LABELS[field];
    items.push({ field, label, message: `${label} changed`, before: b, after: a, ...extra });
    const cf = CONTENT_FIELD[field];
    if (cf && !extra.formattingOnly) content.add(cf);
  };

  if (f.productCode !== undefined && f.productCode !== before.productCode) { out.productCode = f.productCode; mark('productCode', before.productCode, f.productCode); }
  if (f.title !== undefined && f.title !== before.title) { out.title = f.title; mark('title', before.title, f.title); }
  if (f.productType !== undefined && f.productType !== productTypeOf(before)) { out.productType = f.productType; mark('productType', productTypeOf(before), f.productType); }

  const fromCategory = before.categoryId ?? null;
  let category: ChangeSet['category'] = null;
  if (f.categoryId !== undefined && !same(f.categoryId, before.categoryId)) {
    out.categoryId = f.categoryId;
    category = { fromId: fromCategory, toId: f.categoryId ?? null };
    mark('categoryId', fromCategory, f.categoryId ?? null);
  }

  // brand: names are the same brand when they only differ by case / spacing (the stored spelling wins)
  if (f.brand !== undefined) {
    const differs = f.brand === null ? before.brand != null && before.brand !== '' : !before.brand || nameKey(f.brand) !== nameKey(before.brand);
    if (differs) { out.brand = f.brand; mark('brand', before.brand ?? null, f.brand); }
  }

  // description: compared as PLAIN TEXT (what listings read); the html only counts when it was sent and differs in formatting
  if (f.description !== undefined) {
    const plainChanged = !same(f.description, before.description);
    if (plainChanged) {
      out.description = f.description;
      out.descriptionHtml = f.descriptionHtml ?? null;
      mark('description', before.description ?? null, f.description);
    } else if (raw.descriptionHtml !== undefined) {
      const baselineHtml = before.descriptionHtml ?? (before.description ? sanitizeDescription(before.description).html : null);
      if (!same(f.descriptionHtml, baselineHtml)) {
        out.descriptionHtml = f.descriptionHtml ?? null;
        mark('description', before.description ?? null, f.description ?? null, { formattingOnly: true });
      }
    }
  }

  for (const key of ['material', 'standardCategory', 'manufacturer', 'countryOfOrigin', 'hsnCode', 'gstRateBps'] as const) {
    if (f[key] !== undefined && !same(f[key], before[key])) {
      (out as Record<string, unknown>)[key] = f[key];
      mark(key, before[key] ?? null, f[key] ?? null);
    }
  }

  if (f.tags !== undefined && JSON.stringify(f.tags) !== JSON.stringify(before.tags ?? [])) { out.tags = f.tags; mark('tags', before.tags ?? [], f.tags); }

  if (f.lengthMm !== undefined || f.widthMm !== undefined || f.heightMm !== undefined) {
    const nextDims = f.lengthMm == null || f.widthMm == null || f.heightMm == null ? null : { length: f.lengthMm, width: f.widthMm, height: f.heightMm };
    const prevDims = before.lengthMm != null && before.widthMm != null && before.heightMm != null ? { length: before.lengthMm, width: before.widthMm, height: before.heightMm } : null;
    if (JSON.stringify(nextDims) !== JSON.stringify(prevDims)) {
      out.lengthMm = f.lengthMm ?? null; out.widthMm = f.widthMm ?? null; out.heightMm = f.heightMm ?? null;
      mark('dimensions', prevDims ? { ...prevDims, unit: 'mm' } : null, nextDims ? { ...nextDims, unit: 'mm' } : null);
    }
  }
  if (f.weightGrams !== undefined && !same(f.weightGrams, before.weightGrams)) { out.weightGrams = f.weightGrams; mark('weight', before.weightGrams ?? null, f.weightGrams); }

  if (f.customAttributes !== undefined) {
    const a = f.customAttributes.map(attrKey).sort();
    const b = previous.map(attrKey).sort();
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.customAttributes = f.customAttributes;
      mark('customAttributes', previous.map((x) => ({ ...x })), f.customAttributes.map((x) => ({ ...x })));
    }
  }

  const order = new Map(CHANGE_KEYS.map((k, i) => [k, i]));
  items.sort((x, y) => order.get(x.field)! - order.get(y.field)!);
  const codeLocked = out.productCode !== undefined && before.status !== 'draft';
  if (codeLocked) issues.push({ field: 'productCode', code: 'code_locked', message: 'The master code cannot be changed once the product is no longer a draft' });
  return withIssues({
    issues, fields: out, items,
    contentFields: ALL_CONTENT_FIELDS.filter((c) => content.has(c)),
    category,
    categoryChanged: category !== null,
    typeChanged: out.productType !== undefined,
    codeChange: out.productCode !== undefined ? { from: before.productCode, to: out.productCode } : null,
    codeLocked,
  }, []);
}

/** "Product name changed" / "Category changed" / "3 fields changed" */
export function summaryOf(items: ChangedField[]): string {
  if (items.length === 0) return 'No changes yet';
  if (items.length === 1) return items[0]!.message;
  return `${items.length} fields changed`;
}
