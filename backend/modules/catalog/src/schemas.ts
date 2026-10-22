import { z } from 'zod';
import { HsnSchema, IsoDate, PaginationQuerySchema, SearchQuerySchema, SkuSchema, sortQuery } from '@oms/contracts';
import { PRODUCT_TYPES } from './product-types';

export const CodeSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/, 'letters, digits and . _ - / only');
export const GstRateSchema = z.number().int().min(0).max(4000).describe('GST rate in basis points (1800 = 18%)');
export const CountrySchema = z.string().trim().toUpperCase().length(2).describe('ISO 3166-1 alpha-2, e.g. IN');

export const DimensionsSchema = z
  .object({ length: z.number().int().positive().max(100_000), width: z.number().int().positive().max(100_000), height: z.number().int().positive().max(100_000) })
  .meta({ id: 'Dimensions', description: 'Millimetres' });

// ------------------------------------------------------------------ variants
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const VariantBase = z.object({
  sku: SkuSchema.meta({ example: 'ACME-TEE-BLK-M' }),
  barcode: z.string().trim().min(6).max(32).regex(/^[0-9A-Za-z-]+$/).nullish().describe('EAN/UPC/GTIN or internal barcode; unique per vendor'),
  optionValues: z.record(z.string().min(1).max(40), z.string().min(1).max(80)).describe('e.g. { "color": "Black", "size": "M" }'),
  currency: z.string().trim().toUpperCase().length(3),
  mrpMinor: money.nullish().describe('Maximum retail price in minor units (paise)'),
  sellingPriceMinor: money.nullish(),
  costPriceMinor: money.nullish(),
  taxRateBps: GstRateSchema.nullish().describe('Overrides the product GST rate for this variant'),
  weightGrams: z.number().int().positive().max(1_000_000).nullish(),
  dimensionsMm: DimensionsSchema.nullish(),
  status: z.enum(['active', 'inactive']),
});
/** Create: defaults apply. Update uses the default-free base so a PATCH can never reset untouched fields. */
export const VariantInputSchema = VariantBase.extend({
  optionValues: VariantBase.shape.optionValues.default({}),
  currency: VariantBase.shape.currency.default('INR'),
  status: VariantBase.shape.status.default('active'),
});
export const VariantUpdateSchema = VariantBase.partial().extend({ version: z.number().int().optional() });

export const VariantSchema = z
  .object({
    id: z.string(), productId: z.string(), sku: z.string(), barcode: z.string().nullable(), optionValues: z.record(z.string(), z.string()),
    currency: z.string(), mrpMinor: z.number().nullable(), sellingPriceMinor: z.number().nullable(), costPriceMinor: z.number().nullable(),
    taxRateBps: z.number().int().nullable(), weightGrams: z.number().int().nullable(), dimensionsMm: DimensionsSchema.nullable(),
    effectiveDimensionsMm: DimensionsSchema.nullable().describe('The variant\'s own dimensions, or the product\'s when the variant has none'),
    effectiveWeightGrams: z.number().int().nullable().describe('The variant\'s own weight, or the product\'s when the variant has none'),
    status: z.enum(['active', 'inactive']), version: z.number().int(), createdAt: IsoDate, updatedAt: IsoDate,
  })
  .meta({ id: 'Variant' });

export const VariantListItemSchema = VariantSchema.extend({ productCode: z.string(), productTitle: z.string() }).meta({ id: 'VariantListItem' });

export const VariantListQuerySchema = PaginationQuerySchema.extend(SearchQuerySchema.shape).extend({
  sku: z.string().trim().max(64).optional().describe('Exact SKU lookup'),
  barcode: z.string().trim().max(32).optional().describe('Exact barcode lookup'),
  'filter[status]': z.enum(['active', 'inactive']).optional(),
  'filter[productId]': z.uuid().optional(),
  sort: sortQuery(['sku', 'createdAt', 'updatedAt'] as const),
});

// ------------------------------------------------------------------ products
export const ProductAttributeInputSchema = z.object({
  attributeId: z.uuid(),
  variantId: z.uuid().nullish(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

// ---- product-level physical data, rich description, custom attributes (display units in, canonical mm / g out) ----
export const DimensionsInputSchema = z
  .object({
    length: z.number(), width: z.number(), height: z.number(),
    unit: z.enum(['cm', 'mm', 'in']).optional().describe('Default cm'),
  })
  .meta({ id: 'DimensionsEntry', description: 'Product (not package) dimensions: all three sides or none. Stored as integer millimetres (round half up), each side 1 mm - 100,000 mm.' });
export const WeightInputSchema = z
  .object({ value: z.number(), unit: z.enum(['kg', 'g', 'lb']).optional().describe('Default kg') })
  .meta({ id: 'WeightEntry', description: 'Product weight. Stored as integer grams (round half up), 1 g - 10,000,000 g.' });
export const CustomAttributeInputSchema = z
  .object({ name: z.string().max(200), value: z.string().max(1000), confirmed: z.boolean().optional() })
  .meta({ id: 'CustomAttributeEntry', description: 'Free-form name/value pair. Names 1-60 chars (unique ignoring case), values 1-250 chars. `confirmed` defaults to the existing flag when the fact is unchanged, else false: unconfirmed values are never sent to listings.' });
export const CustomAttributeSchema = z.object({ name: z.string(), value: z.string(), confirmed: z.boolean() }).meta({ id: 'CustomAttribute' });
export const DisplayDimensionsSchema = z.object({ length: z.number(), width: z.number(), height: z.number(), unit: z.literal('cm') }).meta({ id: 'DisplayDimensions' });
export const DisplayWeightSchema = z.object({ value: z.number(), unit: z.literal('kg') }).meta({ id: 'DisplayWeight' });
/** GST rate of a product: 0-28 % in basis points (variants keep their wider override range) */
export const ProductGstRateSchema = z.number().int().min(0).max(2800).describe('GST rate in basis points (1800 = 18%), 0-2800');

export const ProductBase = z.object({
  productCode: CodeSchema.meta({ example: 'ACME-TEE', description: 'Your stable style/parent code (Master SKU); unique per vendor, ignoring case' }),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(40_000).nullish().describe('Plain or simple-HTML text; sanitised. The plain-text form is limited to 2,000 characters (400 `description_too_long`).'),
  descriptionHtml: z.string().max(40_000).nullish().describe('Rich description (p, br, strong/b, em/i, ul, ol, li, a[href=http(s)/mailto]); sanitised, wins over `description` when both are sent. The plain-text form is always kept in `description`.'),
  brand: z.string().trim().min(1).max(80).nullish().describe('Saved to the business brand list (unconfirmed until confirmed)'),
  manufacturer: z.string().trim().min(1).max(150).nullish(),
  countryOfOrigin: CountrySchema.nullish(),
  categoryId: z.uuid().nullish(),
  hsnCode: HsnSchema.nullish().describe('HSN (goods) / SAC (services) code: digits only, 4, 6 or 8 digits'),
  gstRateBps: ProductGstRateSchema.nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(50),
  productType: z.enum(PRODUCT_TYPES).optional().describe('Stored in products.attributes.productType (default physical). `bundle` = "Bundle / Kit", `service` = "Service / Warranty"'),
  material: z.string().trim().min(1).max(80).nullish(),
  standardCategory: z.string().trim().min(1).max(120).nullish().describe('The seller\'s "standard product category" (free text with suggestions), separate from the category tree'),
  dimensions: DimensionsInputSchema.nullish(),
  weight: WeightInputSchema.nullish(),
  customAttributes: z.array(CustomAttributeInputSchema).max(50).nullish().describe('Replaces the whole list. At most 20 entries.'),
});
export const ProductInputSchema = ProductBase.extend({
  tags: ProductBase.shape.tags.default([]),
  status: z.enum(['draft', 'active']).default('draft'),
  variants: z.array(VariantInputSchema).max(100).optional().describe('Create variants together with the product'),
  attributeValues: z.array(ProductAttributeInputSchema).max(100).optional().describe('Product-level attribute values'),
});
export const ProductUpdateSchema = ProductBase.partial().extend({
  status: z.enum(['draft', 'active', 'archived']).optional(),
  version: z.number().int().optional().describe('Optimistic lock: send the version you read'),
});

export const ProductSchema = z
  .object({
    id: z.string(), productCode: z.string(), title: z.string(), description: z.string().nullable(), brand: z.string().nullable(),
    manufacturer: z.string().nullable(), countryOfOrigin: z.string().nullable(), categoryId: z.string().nullable(),
    hsnCode: z.string().nullable(), gstRateBps: z.number().int().nullable(), tags: z.array(z.string()),
    descriptionHtml: z.string().nullable(), dimensions: DisplayDimensionsSchema.nullable(), dimensionsMm: DimensionsSchema.nullable(),
    weight: DisplayWeightSchema.nullable(), weightGrams: z.number().int().nullable(), material: z.string().nullable(), standardCategory: z.string().nullable(),
    customAttributes: z.array(CustomAttributeSchema),
    productType: z.enum(PRODUCT_TYPES), status: z.enum(['draft', 'active', 'archived']),
    productCodeLocked: z.boolean().describe('true once the product is no longer a draft: the master code cannot change (409 code_locked)'),
    variantCount: z.number().int(), version: z.number().int(), createdAt: IsoDate, updatedAt: IsoDate,
  })
  .meta({ id: 'Product' });

export const AttributeValueOutSchema = z.object({
  attributeId: z.string(), code: z.string(), name: z.string(), dataType: z.string(), variantId: z.string().nullable(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

export const ProductDetailSchema = ProductSchema.extend({ variants: z.array(VariantSchema), attributeValues: z.array(AttributeValueOutSchema) }).meta({ id: 'ProductDetail' });

export const ProductListQuerySchema = PaginationQuerySchema.extend(SearchQuerySchema.shape).extend({
  'filter[status]': z.enum(['draft', 'active', 'archived']).optional(),
  'filter[categoryId]': z.uuid().optional(),
  'filter[brand]': z.string().trim().max(100).optional(),
  'filter[createdFrom]': z.iso.datetime().optional(),
  'filter[createdTo]': z.iso.datetime().optional(),
  sort: sortQuery(['createdAt', 'updatedAt', 'title', 'productCode'] as const),
});

// ------------------------------------------------------------------ bulk
export const BulkBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), items: z.array(ProductInputSchema).min(1).max(100) }),
  z.object({ action: z.literal('update_status'), ids: z.array(z.uuid()).min(1).max(500), status: z.enum(['draft', 'active', 'archived']) }),
  z.object({ action: z.literal('delete'), ids: z.array(z.uuid()).min(1).max(500) }),
]);
export const BulkResultSchema = z
  .object({
    action: z.string(),
    summary: z.object({ total: z.number().int(), succeeded: z.number().int(), failed: z.number().int() }),
    results: z.array(z.object({ index: z.number().int(), id: z.string().nullable(), ok: z.boolean(), error: z.object({ code: z.string(), message: z.string() }).nullable() })),
  })
  .meta({ id: 'BulkResult' });

// ------------------------------------------------------------------ marketplace data / readiness
export const MarketplaceDataSchema = z.object({ marketplace: z.string(), data: z.record(z.string(), z.unknown()), version: z.number().int(), updatedAt: IsoDate }).meta({ id: 'ProductMarketplaceData' });
export const MarketplaceDataBodySchema = z.object({ data: z.record(z.string(), z.unknown()) }).describe('Free-form, marketplace-specific payload (category ids, bullet points, search terms...). Never mixed into the core product.');

export const ReadinessSchema = z
  .object({
    productId: z.string(),
    marketplace: z.string().nullable(),
    ready: z.boolean(),
    errors: z.number().int(),
    warnings: z.number().int(),
    checks: z.array(z.object({ code: z.string(), ok: z.boolean(), severity: z.enum(['error', 'warning']), message: z.string(), variantId: z.string().nullable().optional() })),
  })
  .meta({ id: 'MarketplaceReadiness' });

// ------------------------------------------------------------------ data jobs
export const DataJobSchema = z
  .object({
    id: z.string(), kind: z.enum(['import', 'export']), entity: z.string(), status: z.string(), format: z.string(),
    stats: z.record(z.string(), z.number()), errors: z.array(z.object({ row: z.number().int(), message: z.string() })),
    hasInput: z.boolean(), hasOutput: z.boolean(),
    startedAt: IsoDate.nullable(), finishedAt: IsoDate.nullable(), createdAt: IsoDate,
  })
  .meta({ id: 'DataJob' });

export const UploadInstructionSchema = z
  .object({ strategy: z.enum(['presigned', 'api']), method: z.string(), url: z.string(), headers: z.record(z.string(), z.string()) })
  .meta({ id: 'UploadInstruction', description: 'presigned: PUT the bytes to `url` with `headers`; api: POST the bytes to `url` on this API with your bearer token' });

export const ExportBodySchema = z.object({
  status: z.enum(['draft', 'active', 'archived']).optional(),
  categoryId: z.uuid().optional(),
  q: z.string().trim().max(200).optional(),
});
