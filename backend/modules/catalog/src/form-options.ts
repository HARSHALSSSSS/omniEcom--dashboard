import { and, eq, escapeLike, ilike, isNotNull, isNull, schema, sql, type Tx } from '@oms/database';
import { COUNTRIES } from './countries';
import { DESCRIPTION_MAX_CHARS } from './description';
import { BRAND_MAX, CODE_MAX, CUSTOM_ATTRIBUTES_MAX, CUSTOM_ATTRIBUTE_NAME_MAX, CUSTOM_ATTRIBUTE_VALUE_MAX, HSN_LENGTHS, MATERIAL_MAX, STANDARD_CATEGORY_MAX, TITLE_MAX, TITLE_MIN_STEP } from './fields';
import { DIMENSION_UNITS, MAX_DIMENSION_MM, MAX_WEIGHT_GRAMS, WEIGHT_UNITS } from './physical';

const P = schema.products;

export const PRODUCT_TYPES = ['physical', 'digital', 'service'] as const;
/** India GST slabs (basis points); any value 0-28 % is accepted, these are the ones offered in the select */
export const GST_SLABS = [0, 500, 1200, 1800, 2800].map((bps) => ({ bps, label: `${bps / 100}%` }));

/** curated, common materials (the business's own values are added on top) */
const MATERIALS = [
  'Aluminium', 'Bamboo', 'Brass', 'Canvas', 'Cardboard', 'Ceramic', 'Copper', 'Cotton', 'Denim', 'Fibre', 'Glass', 'Gold', 'Jute', 'Leather', 'Linen', 'Metal',
  'Nylon', 'Paper', 'Plastic', 'Polyester', 'Rubber', 'Silicone', 'Silk', 'Silver', 'Stainless steel', 'Steel', 'Stone', 'Synthetic leather', 'Wood', 'Wool',
];

/** image rules the editor shows next to the upload (they mirror the documents module) */
export const IMAGE_RULES = {
  maxBytes: 10 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  maxPerProduct: 20,
  minShortSidePx: 200,
  recommendedLongSidePx: 1000,
};

export interface FormOptions {
  productTypes: string[];
  gstSlabs: Array<{ bps: number; label: string }>;
  countries: Array<{ code: string; name: string }>;
  materials: Array<{ value: string; label: string }>;
  units: { dimension: 'cm'; weight: 'kg'; accepted: { dimension: string[]; weight: string[] } };
  limits: {
    titleMin: number; titleMax: number; descriptionMaxChars: number; brandMax: number; codeMax: number; hsnLengths: number[];
    materialMax: number; standardCategoryMax: number; gstMaxBps: number;
    customAttributes: { max: number; nameMax: number; valueMax: number };
    dimensionMaxMm: number; weightMaxGrams: number;
  };
  image: typeof IMAGE_RULES;
}

/** distinct non-empty values of a text column of the business's live products, most used first (bounded) */
async function usedValues(tx: Tx, vendorId: string, column: typeof P.material | typeof P.standardCategory, opts: { q?: string; limit: number }) {
  const like = opts.q ? `%${escapeLike(opts.q)}%` : undefined;
  return tx
    .select({ value: column, n: sql<number>`count(*)::int` })
    .from(P)
    .where(and(eq(P.vendorId, vendorId), isNull(P.deletedAt), isNotNull(column), like ? ilike(column, like) : undefined))
    .groupBy(column)
    .orderBy(sql`count(*) desc`, column)
    .limit(opts.limit);
}

export async function formOptions(tx: Tx, vendorId: string): Promise<FormOptions> {
  const used = await usedValues(tx, vendorId, P.material, { limit: 100 });
  const seen = new Set<string>();
  const materials: Array<{ value: string; label: string }> = [];
  for (const v of [...MATERIALS, ...used.map((u) => u.value!)]) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    materials.push({ value: v, label: v });
  }
  materials.sort((a, b) => a.label.localeCompare(b.label, 'en'));
  return {
    productTypes: [...PRODUCT_TYPES],
    gstSlabs: GST_SLABS,
    countries: COUNTRIES.map((c) => ({ code: c.code, name: c.name })),
    materials,
    units: { dimension: 'cm', weight: 'kg', accepted: { dimension: [...DIMENSION_UNITS], weight: [...WEIGHT_UNITS] } },
    limits: {
      titleMin: TITLE_MIN_STEP, titleMax: TITLE_MAX, descriptionMaxChars: DESCRIPTION_MAX_CHARS, brandMax: BRAND_MAX, codeMax: CODE_MAX, hsnLengths: [...HSN_LENGTHS],
      materialMax: MATERIAL_MAX, standardCategoryMax: STANDARD_CATEGORY_MAX, gstMaxBps: 2800,
      customAttributes: { max: CUSTOM_ATTRIBUTES_MAX, nameMax: CUSTOM_ATTRIBUTE_NAME_MAX, valueMax: CUSTOM_ATTRIBUTE_VALUE_MAX },
      dimensionMaxMm: MAX_DIMENSION_MM, weightMaxGrams: MAX_WEIGHT_GRAMS,
    },
    image: IMAGE_RULES,
  };
}

/** standard product categories already used by the business: prefix matches first, then "contains", then most used */
export async function standardCategorySuggestions(tx: Tx, vendorId: string, q: string | undefined, limit: number) {
  const rows = await usedValues(tx, vendorId, P.standardCategory, { q, limit: 200 });
  const needle = (q ?? '').trim().toLowerCase();
  const scored = rows.map((r) => ({ value: r.value!, productCount: Number(r.n), prefix: needle !== '' && r.value!.toLowerCase().startsWith(needle) }));
  scored.sort((a, b) => Number(b.prefix) - Number(a.prefix) || b.productCount - a.productCount || a.value.localeCompare(b.value, 'en'));
  return scored.slice(0, limit).map(({ value, productCount }) => ({ value, productCount }));
}
