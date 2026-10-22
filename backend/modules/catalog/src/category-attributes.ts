import type { Tx } from '@oms/database';
import { AppError } from '@oms/shared';
import { getCategoryAttributes, getProductAttributeValues, setProductAttributeValues, type AttributeType, type ProductValueInput, type RawValue } from '@oms/mod-attributes';
import type { FieldIssue } from './fields';

/**
 * The category-specific attributes of the Edit product screen ("Additional attributes": Capacity and Water resistance for bags, Fabric
 * composition and Care instructions for apparel...). They are the REAL attributes of the attribute system: the business defines them and assigns
 * them to categories (`PUT /categories/{id}/attributes`), the product stores one typed value per attribute (`product_attribute_values`). The
 * editor shows the product-level attributes of the product's category; a category change swaps the list.
 */
export interface CategoryAttributeField {
  attributeId: string;
  code: string;
  name: string;
  dataType: AttributeType;
  unit: string | null;
  isRequired: boolean;
  /** allowed values of an enum attribute (empty otherwise) */
  options: Array<{ value: string; label: string }>;
  /** the product's current value (null = not supplied) */
  value: RawValue;
}

export interface CategoryAttributeInput { attributeId: string; value: RawValue }

/** the product-level attributes expected for a category; an unknown / deleted category has none */
export async function categoryAttributeDefs(tx: Tx, vendorId: string, categoryId: string | null) {
  if (!categoryId) return [];
  try {
    return (await getCategoryAttributes(tx, vendorId, categoryId)).filter((c) => c.attribute.appliesTo === 'product');
  } catch (e) {
    if (e instanceof AppError && e.code === 'NOT_FOUND') return [];
    throw e;
  }
}

export async function categoryAttributeFields(tx: Tx, vendorId: string, productId: string, categoryId: string | null): Promise<CategoryAttributeField[]> {
  const defs = await categoryAttributeDefs(tx, vendorId, categoryId);
  if (defs.length === 0) return [];
  const values = (await getProductAttributeValues(tx, vendorId, productId)).filter((v) => v.variantId === null);
  return defs.map((d) => ({
    attributeId: d.attribute.id,
    code: d.attribute.code,
    name: d.attribute.name,
    dataType: d.attribute.dataType,
    unit: d.attribute.unit,
    isRequired: d.isRequired,
    options: d.attribute.values.map((v) => ({ value: v.value, label: v.label })),
    value: values.find((v) => v.attributeId === d.attribute.id)?.value ?? null,
  }));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** the value in the form it is stored in (null = clear), or the reason it is not valid for the attribute */
export function normalizeAttributeValue(field: Pick<CategoryAttributeField, 'dataType' | 'options' | 'name'>, raw: RawValue): { value: RawValue; problem?: string } {
  if (raw === null) return { value: null };
  if (typeof raw === 'string' && raw.trim() === '') return { value: null };
  switch (field.dataType) {
    case 'text': {
      if (typeof raw !== 'string') return { value: null, problem: `${field.name} must be text` };
      const t = raw.replace(/\s+/g, ' ').trim();
      return t.length > 2000 ? { value: null, problem: `${field.name} can be at most 2000 characters` } : { value: t };
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number.NaN;
      return Number.isFinite(n) ? { value: n } : { value: null, problem: `${field.name} must be a number` };
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return { value: raw };
      if (raw === 'true' || raw === 'false') return { value: raw === 'true' };
      return { value: null, problem: `${field.name} must be yes or no` };
    }
    case 'date':
      return typeof raw === 'string' && DATE.test(raw.trim()) && !Number.isNaN(Date.parse(raw.trim())) ? { value: raw.trim() } : { value: null, problem: `${field.name} must be a date (YYYY-MM-DD)` };
    case 'enum': {
      const hit = typeof raw === 'string' ? field.options.find((o) => o.value === raw.trim()) : undefined;
      return hit ? { value: hit.value } : { value: null, problem: `${field.name} must be one of: ${field.options.map((o) => o.value).join(', ') || '(no values defined)'}` };
    }
  }
}

export interface CategoryAttributeChange {
  /** the writes (only attributes whose value differs from the stored one) */
  entries: ProductValueInput[];
  /** name -> value, before and after, for the audit trail and the change summary */
  before: Record<string, RawValue>;
  after: Record<string, RawValue>;
  issues: FieldIssue[];
}

/**
 * Compares the proposed attribute values with the stored ones. `categoryId` is the category the product will have after the edit: only its
 * product-level attributes can be set. An unchanged value is not a change; an empty value clears the attribute.
 */
export async function planCategoryAttributes(tx: Tx, vendorId: string, productId: string, categoryId: string | null, input: CategoryAttributeInput[] | undefined): Promise<CategoryAttributeChange> {
  const out: CategoryAttributeChange = { entries: [], before: {}, after: {}, issues: [] };
  if (!input || input.length === 0) return out;
  const fields = await categoryAttributeFields(tx, vendorId, productId, categoryId);
  // a value stored for an attribute of the previous category is still known: re-sending it unchanged is not a change
  const stored = new Map((await getProductAttributeValues(tx, vendorId, productId)).filter((v) => v.variantId === null).map((v) => [v.attributeId, v.value]));
  const seen = new Set<string>();
  input.forEach((entry, i) => {
    const at = `categoryAttributes[${i}]`;
    const field = fields.find((f) => f.attributeId === entry.attributeId);
    if (!field) {
      out.issues.push({ field: `${at}.attributeId`, code: 'attribute_not_in_category', message: 'This attribute does not belong to the category of the product' });
      return;
    }
    if (seen.has(field.attributeId)) {
      out.issues.push({ field: `${at}.attributeId`, code: 'duplicate_attribute', message: `${field.name} is listed twice` });
      return;
    }
    seen.add(field.attributeId);
    const norm = normalizeAttributeValue(field, entry.value);
    if (norm.problem) {
      out.issues.push({ field: `${at}.value`, code: 'invalid_attribute_value', message: norm.problem });
      return;
    }
    const before = stored.get(field.attributeId) ?? null;
    if ((before ?? null) === norm.value) return;
    out.entries.push({ attributeId: field.attributeId, value: norm.value });
    out.before[field.name] = before ?? null;
    out.after[field.name] = norm.value;
  });
  return out;
}

/** writes planned values through the attribute system (typed validation again, inside the caller's transaction) */
export async function writeCategoryAttributeValues(tx: Tx, vendorId: string, productId: string, entries: ProductValueInput[]): Promise<void> {
  await setProductAttributeValues(tx, vendorId, productId, entries);
}
