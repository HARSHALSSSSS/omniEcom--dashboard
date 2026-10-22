import { z } from 'zod';
import { IsoDate } from '@oms/contracts';
import { PRODUCT_TYPES, ProductEditorSchema } from '@oms/mod-catalog';

// ---------------------------------------------------------------- inputs
/**
 * The editable fields: the same fields (and the same loose typing) as a draft save. Strict rules and their field-level error codes are applied by
 * the service with the creation flow's validation (400 `VALIDATION_FAILED`, `details.issues[{ path, code, message }]`). A key that is not sent
 * keeps its value; `null` clears (where the field is optional).
 */
export const EditChangesSchema = z
  .object({
    productCode: z.string().max(200).optional().describe('Master SKU. Locked once the product is not a draft: a different value is a 409 `code_locked`'),
    title: z.string().max(1000).optional(),
    productType: z.enum(PRODUCT_TYPES).optional().describe('physical, digital, service ("Service / Warranty") or bundle ("Bundle / Kit"). Changing it needs confirmation when listings are live'),
    categoryId: z.uuid().nullish().describe('Changing it needs confirmation when listings are live; an active product cannot clear it'),
    brand: z.string().max(500).nullish(),
    description: z.string().max(40_000).nullish().describe('Plain or simple HTML; compared as plain text'),
    descriptionHtml: z.string().max(40_000).nullish().describe('Rich description; wins over `description` when both are sent'),
    manufacturer: z.string().max(500).nullish(),
    material: z.string().max(500).nullish(),
    standardCategory: z.string().max(500).nullish(),
    countryOfOrigin: z.string().max(32).nullish(),
    hsnCode: z.string().max(32).nullish(),
    gstRateBps: z.number().nullish(),
    tags: z.array(z.string().max(100)).max(100).optional(),
    dimensions: z.object({ length: z.number(), width: z.number(), height: z.number(), unit: z.enum(['cm', 'mm', 'in']).optional() }).nullish(),
    weight: z.object({ value: z.number(), unit: z.enum(['kg', 'g', 'lb']).optional() }).nullish(),
    customAttributes: z.array(z.object({ name: z.string().max(200), value: z.string().max(1000), confirmed: z.boolean().optional() })).max(50).nullish(),
    categoryAttributes: z
      .array(z.object({ attributeId: z.uuid(), value: z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]).describe('null or an empty string clears the value') }))
      .max(100)
      .optional()
      .describe('Values of the category-specific attributes shown under "Additional attributes" (`product.categoryAttributes`). Only attributes of the product\'s category (after this edit) can be set; typed like the attribute (number, yes/no, date YYYY-MM-DD, one of the enum values).'),
  })
  .meta({ id: 'ProductEditChanges', description: 'The proposed values of the edit page. Values equal to the stored product are ignored.' });

export const ChangeImpactBodySchema = z.object({ changes: EditChangesSchema }).meta({ id: 'ProductChangeImpactBody' });
export const EditSaveBodySchema = z
  .object({
    version: z.number().int().describe('The `version` of the editor you loaded (409 VERSION_CONFLICT when someone saved first)'),
    changes: EditChangesSchema,
    confirm: z.boolean().optional().describe('true = the seller confirmed the impact (needed when `change-impact` said `requiresConfirmation`)'),
  })
  .meta({ id: 'ProductEditSaveBody' });
export const InsightKeyParamsSchema = z.object({ id: z.uuid(), key: z.string().min(1).max(64) });
export const DismissBodySchema = z.object({ until: z.iso.datetime().optional().describe('The insight may reappear after this moment; omit to hide it until restored') }).meta({ id: 'ProductInsightDismissBody' });

// ---------------------------------------------------------------- outputs
const Action = z.object({ label: z.string(), href: z.string() });

export const InsightSchema = z
  .object({
    key: z.enum(['description_short', 'few_images']),
    severity: z.literal('suggestion'),
    message: z.string(),
    detail: z.string(),
    actions: z.array(z.object({ key: z.string(), label: z.string(), method: z.enum(['GET', 'POST']), href: z.string(), body: z.record(z.string(), z.unknown()).optional() })),
    data: z.record(z.string(), z.unknown()),
  })
  .meta({ id: 'ProductInsight' });
const DismissedInsight = z.object({ key: z.enum(['description_short', 'few_images']), dismissedAt: IsoDate, until: IsoDate.nullable() });

const ReadinessItem = z.object({
  key: z.enum(['core_information', 'product_media', 'required_attributes', 'marketplace_content']),
  label: z.string(),
  state: z.enum(['done', 'pending']),
  detail: z.string().optional(),
  action: Action.optional(),
});
export const EditReadinessSchema = z
  .object({
    percent: z.number().int().describe('Equals `readiness.pct` of GET /products/{id}/content for the same product'),
    items: z.array(ReadinessItem),
    listings: z.object({ total: z.number().int(), needsReview: z.number().int(), syncPending: z.number().int(), failed: z.number().int(), needsRepublish: z.number().int(), rejected: z.number().int() }),
  })
  .meta({ id: 'ProductEditReadiness' });

const ChannelStatus = z.enum(['active', 'attention', 'pending', 'draft', 'unpublished']);
const ContentFieldSchema = z.string();

export const EditorSchema = z
  .object({
    product: ProductEditorSchema,
    version: z.number().int(),
    status: z.enum(['draft', 'active', 'archived']),
    locks: z.object({ productCode: z.object({ locked: z.boolean(), reason: z.string().nullable() }) }),
    meta: z.object({ productId: z.string(), createdAt: IsoDate, updatedAt: IsoDate, updatedBy: z.object({ id: z.string(), name: z.string() }).nullable() }),
    nav: z.array(z.object({ key: z.string(), label: z.string(), count: z.number().int().optional() })),
    attributes: z.object({
      configured: z.number().int(), customConfirmed: z.number().int(),
      slots: z.array(z.object({ key: z.enum(['material', 'dimensions', 'weight', 'countryOfOrigin', 'hsnCode', 'taxInformation']), label: z.string(), supplied: z.boolean() })).describe('The six core facts with Supplied / Not supplied'),
      categorySlots: z.array(z.object({ attributeId: z.string(), label: z.string(), supplied: z.boolean(), isRequired: z.boolean() })).describe('The category-specific attributes with Supplied / Not supplied'),
      note: z.string().nullable(),
    }),
    media: z.object({
      primaryImageUrl: z.string().nullable(),
      thumbnails: z.array(z.object({ id: z.string(), url: z.string(), isPrimary: z.boolean(), isPlaceholder: z.boolean() })),
      total: z.number().int(),
    }),
    inheritance: z.object({
      channels: z.array(z.object({ code: z.string(), name: z.string(), accountId: z.string(), listingId: z.string(), listings: z.number().int(), listingStatus: ChannelStatus, independentFields: z.array(ContentFieldSchema) })),
      text: z.string(),
      limited: z.boolean().describe('true when the product has more listings than one call processes: the channel list is left empty'),
    }),
    readiness: EditReadinessSchema,
    insights: z.array(InsightSchema),
    dismissedInsights: z.array(DismissedInsight),
  })
  .meta({ id: 'ProductEditView' });

export const ChangeImpactSchema = z
  .object({
    hasChanges: z.boolean(),
    items: z.array(z.object({ field: z.string(), label: z.string(), message: z.string(), formattingOnly: z.boolean().optional() })),
    summary: z.string(),
    detail: z.string().nullable(),
    listings: z.object({ potential: z.number().int(), live: z.number().int() }),
    channels: z.array(z.object({
      code: z.string(), name: z.string(), accountId: z.string(), accountName: z.string(), listingId: z.string(), listings: z.number().int(),
      effect: z.enum(['name_inherited', 'description_inherited', 'brand_inherited', 'attribute_inherited', 'type_inherited', 'may_need_remapping', 'independent', 'not_live', 'unaffected']),
      independentFields: z.array(ContentFieldSchema), supportsUpdate: z.boolean(),
      mappingState: z.enum(['mapped', 'needs_review']).optional(),
      suggested: z.object({ marketplaceCategoryId: z.string().nullable(), marketplaceCategoryName: z.string().nullable() }).optional(),
    })),
    independentNote: z.string().nullable(),
    notSentNote: z.string().nullable(),
    requiresConfirmation: z.boolean(),
    confirmation: z.object({
      title: z.string(), message: z.string(),
      mapping: z.object({ from: z.string().nullable(), to: z.string().nullable() }).optional(),
      channels: z.array(z.object({ code: z.string(), action: z.literal('category_mapping_review') })),
    }).optional(),
    errors: z.array(z.object({ field: z.string(), code: z.string(), message: z.string() })).describe('Fields of `changes` that would be rejected on save (ignored for the impact)'),
  })
  .meta({ id: 'ProductChangeImpact' });

export const EditSaveResultSchema = z
  .object({
    saved: z.boolean(),
    noChanges: z.boolean(),
    savedAt: IsoDate.optional(),
    version: z.number().int(),
    product: ProductEditorSchema.optional(),
    impact: z.object({
      listingsQueued: z.number().int(),
      channels: z.array(z.object({ code: z.string(), name: z.string(), accountId: z.string(), listingId: z.string(), listings: z.number().int(), state: z.enum(['sync_pending', 'needs_review', 'needs_republish', 'independent', 'unchanged', 'not_live']) })),
      text: z.string(),
      notSyncedYet: z.string().nullable(),
      independentNote: z.string().nullable(),
    }).optional(),
    readiness: EditReadinessSchema.optional(),
    insights: z.array(InsightSchema).optional(),
  })
  .meta({ id: 'ProductEditSaveResult' });

export const InsightListSchema = z.object({ items: z.array(InsightSchema), dismissed: z.array(DismissedInsight) }).meta({ id: 'ProductInsightList' });
export const InsightDecisionSchema = z
  .object({ key: z.enum(['description_short', 'few_images']), dismissed: z.boolean(), until: IsoDate.nullable(), insights: z.array(InsightSchema) })
  .meta({ id: 'ProductInsightDecision' });
