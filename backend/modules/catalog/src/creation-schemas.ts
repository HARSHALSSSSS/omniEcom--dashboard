import { z } from 'zod';
import { IsoDate, PageQuerySchema, SearchQuerySchema, sortQuery } from '@oms/contracts';
import { ProductBase, ProductSchema } from './schemas';
import { PRODUCT_TYPES } from './product-types';

// ---------------------------------------------------------------- inputs
/** every editor field optional and loosely typed: the rules (and their field-level error codes) are applied by the service */
const looseFields = z.object({
  productCode: z.string().trim().max(200).nullish().describe('Master SKU. Empty or null on a draft = no code chosen yet (a DRAFT-XXXXXXXX placeholder is kept)'),
  title: z.string().trim().max(1000).optional(),
  description: ProductBase.shape.description,
  descriptionHtml: ProductBase.shape.descriptionHtml,
  brand: z.string().trim().max(500).nullish(),
  manufacturer: z.string().trim().max(500).nullish(),
  countryOfOrigin: z.string().trim().max(32).nullish(),
  categoryId: z.uuid().nullish(),
  hsnCode: z.string().trim().max(32).nullish(),
  gstRateBps: z.number().nullish(),
  tags: ProductBase.shape.tags.optional(),
  productType: ProductBase.shape.productType,
  material: z.string().trim().max(500).nullish(),
  standardCategory: z.string().trim().max(500).nullish(),
  dimensions: ProductBase.shape.dimensions,
  weight: ProductBase.shape.weight,
  customAttributes: ProductBase.shape.customAttributes,
});

export const DraftCreateSchema = looseFields
  .extend({ title: z.string().trim().min(1).max(200).describe('The only required field of a draft (1-200 characters)') })
  .meta({ id: 'ProductDraftBody', description: 'Everything except the title is optional. Without a productCode a DRAFT-XXXXXXXX placeholder code is generated (codeIsPlaceholder = true).' });

export const DraftPatchSchema = looseFields
  .extend({
    title: z.string().trim().min(1).max(200).optional(),
    version: z.number().int().describe('Required optimistic lock: the `version` you read (409 VERSION_CONFLICT with the current version otherwise)'),
  })
  .meta({ id: 'ProductDraftPatch' });

export const StepValuesSchema = looseFields.meta({ id: 'ProductStepValues', description: 'Unsaved form values; the same fields as a draft save' });

export const StepBodySchema = z.object({ step: z.literal('basic'), values: StepValuesSchema.optional() }).meta({ id: 'ValidateStepBody' });
export const ContinueBodySchema = z.object({ step: z.literal('basic'), version: z.number().int(), values: StepValuesSchema.optional() }).meta({ id: 'ContinueStepBody' });

export const PreviewValuesSchema = z
  .object({
    productCode: z.string().max(200).nullish(),
    title: z.string().max(1000).nullish(),
    categoryId: z.uuid().nullish(),
    productType: z.enum(PRODUCT_TYPES).optional(),
    brand: z.string().max(200).nullish(),
    description: z.string().max(40_000).nullish(),
    descriptionHtml: z.string().max(40_000).nullish(),
    customAttributes: z.array(z.object({ name: z.string().max(200).optional(), value: z.string().max(1000).optional() })).max(50).nullish(),
  })
  .meta({ id: 'CreationReadinessValues', description: 'Unsaved form values; a key that is sent (even null) replaces the saved value' });
export const PreviewBodySchema = z.object({ productId: z.uuid().optional(), values: PreviewValuesSchema }).meta({ id: 'CreationReadinessBody' });

export const SkuCheckQuerySchema = z.object({ code: z.string().trim().max(200), excludeProductId: z.uuid().optional() });
export const SkuVerifyBodySchema = z.object({ code: z.string().trim().max(200) });

export const BrandListQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  confirmed: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const BrandBodySchema = z.object({ name: z.string().trim().min(1).max(200) });
export const StandardCategoryQuerySchema = z.object({ q: z.string().trim().min(1).max(100).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });
export const DraftListQuerySchema = PageQuerySchema.extend(SearchQuerySchema.shape).extend({ sort: sortQuery(['savedAt', 'title', 'productCode'] as const) });

// ---------------------------------------------------------------- outputs
export const BrandSchema = z.object({ id: z.string(), name: z.string(), confirmed: z.boolean(), confirmedAt: IsoDate.nullable(), productCount: z.number().int().optional(), createdAt: IsoDate }).meta({ id: 'Brand' });

export const FormOptionsSchema = z
  .object({
    productTypes: z.array(z.string()),
    gstSlabs: z.array(z.object({ bps: z.number().int(), label: z.string() })),
    countries: z.array(z.object({ code: z.string(), name: z.string() })),
    materials: z.array(z.object({ value: z.string(), label: z.string() })),
    units: z.object({ dimension: z.literal('cm'), weight: z.literal('kg'), accepted: z.object({ dimension: z.array(z.string()), weight: z.array(z.string()) }) }),
    limits: z.object({
      titleMin: z.number().int(), titleMax: z.number().int(), descriptionMaxChars: z.number().int(), brandMax: z.number().int(), codeMax: z.number().int(), hsnLengths: z.array(z.number().int()),
      materialMax: z.number().int(), standardCategoryMax: z.number().int(), gstMaxBps: z.number().int(),
      customAttributes: z.object({ max: z.number().int(), nameMax: z.number().int(), valueMax: z.number().int() }),
      dimensionMaxMm: z.number().int(), weightMaxGrams: z.number().int(),
    }),
    image: z.object({ maxBytes: z.number().int(), mimeTypes: z.array(z.string()), maxPerProduct: z.number().int(), minShortSidePx: z.number().int(), recommendedLongSidePx: z.number().int() }),
  })
  .meta({ id: 'ProductFormOptions' });

export const StandardCategorySchema = z.object({ value: z.string(), productCount: z.number().int() }).meta({ id: 'StandardCategorySuggestion' });

export const SkuCheckSchema = z
  .object({
    code: z.string(), normalized: z.string(), valid: z.boolean(), reason: z.string().nullable(), message: z.string().nullable(), available: z.boolean(),
    conflict: z.object({ type: z.literal('product'), id: z.string(), title: z.string(), code: z.string() }).nullable(),
    similar: z.array(z.object({ type: z.literal('variant'), sku: z.string(), productId: z.string() })),
    suggestion: z.string().nullable(),
  })
  .meta({ id: 'SkuCheck' });
export const SkuVerifySchema = SkuCheckSchema.extend({ verified: z.literal(true) }).meta({ id: 'SkuVerify' });

const STATE = z.enum(['done', 'pending', 'verify', 'confirm', 'duplicate', 'uploading', 'placeholder']);
const ReadinessItemSchema = z.object({ key: z.string(), label: z.string(), state: STATE, tag: z.string().optional() });
export const CreationReadinessSchema = z
  .object({
    percent: z.number().int(),
    required: z.array(ReadinessItemSchema),
    recommended: z.array(ReadinessItemSchema),
    blockers: z.array(z.object({ key: z.string(), state: STATE, message: z.string(), fixTarget: z.enum(['primary_image', 'master_sku', 'category', 'product_name']) })),
    hints: z.array(z.string()),
    channels: z.array(z.object({ code: z.string(), name: z.string() })),
    chain: z.array(z.string()),
  })
  .meta({ id: 'CreationReadiness' });

const ImageStateSchema = z.enum(['none', 'uploading', 'placeholder', 'ready']);
export const CategoryAttributeFieldSchema = z
  .object({
    attributeId: z.string(), code: z.string(), name: z.string(), dataType: z.enum(['text', 'number', 'boolean', 'date', 'enum']), unit: z.string().nullable(),
    isRequired: z.boolean(), options: z.array(z.object({ value: z.string(), label: z.string() })).describe('Allowed values of an enum attribute'),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).describe('The product\'s current value; null = not supplied'),
  })
  .meta({ id: 'ProductCategoryAttribute' });

export const ProductEditorSchema = ProductSchema.extend({
  categoryAttributes: z.array(CategoryAttributeFieldSchema).describe('The product-level attributes of the product\'s category (Capacity, Fabric composition...) with the product\'s values; empty when the category has none'),
  category: z.object({ id: z.string(), name: z.string() }).nullable(),
  brandRecord: z.object({ id: z.string(), name: z.string(), confirmed: z.boolean() }).nullable(),
  primaryImage: z.object({ state: ImageStateSchema, documentId: z.string().nullable(), url: z.string().nullable() }),
}).meta({ id: 'ProductEditor' });

export const CreationDtoSchema = z
  .object({
    product: ProductEditorSchema,
    creation: z.object({
      currentStep: z.enum(['basic', 'variants', 'inventory', 'listings', 'channels']),
      completedSteps: z.array(z.string()),
      savedAt: IsoDate,
      version: z.number().int().describe('The product version to send as `version` with the next save'),
      codeIsPlaceholder: z.boolean(),
    }),
    readiness: CreationReadinessSchema,
  })
  .meta({ id: 'ProductCreation' });

export const DraftListItemSchema = z
  .object({
    id: z.string(), title: z.string(), code: z.string(), codeIsPlaceholder: z.boolean(), thumbnailUrl: z.string().nullable(), savedAt: IsoDate,
    readinessPercent: z.number().int(), currentStep: z.enum(['basic', 'variants', 'inventory', 'listings', 'channels']), version: z.number().int(),
  })
  .meta({ id: 'ProductDraftListItem' });

const IssueSchema = z.object({ field: z.string(), code: z.string(), message: z.string() });
export const ValidateStepSchema = z.object({ valid: z.boolean(), errors: z.array(IssueSchema), warnings: z.array(IssueSchema), readiness: CreationReadinessSchema }).meta({ id: 'ValidateStepResult' });
