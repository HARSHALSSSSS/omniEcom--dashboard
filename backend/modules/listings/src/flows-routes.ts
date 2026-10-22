import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IdParamSchema, IsoDate, successEnvelope } from '@oms/contracts';
import { ok, requireVendor, vendorTx } from '@oms/module-kit';
import { ctxFromRequest } from './ctx';
import { BULLET_MAX, BULLETS_MAX, DESCRIPTION_MAX, TERM_MAX, TERMS_MAX, TITLE_MAX, bulkContentEdit } from './flows-bulk-content';
import { listingFlowDetails } from './flows-details';
import * as flows from './flows-service';
import { fixSuggestions } from './flows-suggest';
import { Scalar, ScreenStatusSchema, TableBlockSchema } from './workspace-schemas';

const FlowDetailsSchema = z.object({
  listingId: z.string(), productId: z.string(), variantId: z.string(), sku: z.string(), variantsCount: z.number().int(), marketplace: z.string(), marketplaceName: z.string(),
  category: z.object({
    marketplaceCategoryId: z.string().nullable(), marketplaceName: z.string().nullable().describe('The marketplace\'s own name of the category'),
    marketplacePath: z.string().nullable().describe('Full path in the marketplace tree, e.g. "Fashion > Apparel > Shirts"'),
    masterName: z.string().nullable(), masterPath: z.string().nullable().describe('Your own category with its parents, e.g. "Apparel > Tops > Shirts"'),
    fullPath: z.string().nullable().describe('The path to show: the marketplace path, else your own'), channelCategory: z.string().nullable().describe('Marketplace and category name, e.g. "Amazon Apparel"'),
  }),
  completeness: z.array(z.object({ key: z.enum(['title', 'images', 'sku', 'category', 'weight']), label: z.string(), status: z.enum(['pass', 'warn', 'fail']), detail: z.string(), field: z.string().nullable() })),
}).meta({ id: 'ListingFlowDetails' });

const CandidateSchema = z.object({
  value: Scalar, confidence: z.number(), source: z.enum(['product_attribute', 'variant_option', 'master_field', 'other_listing', 'other_channel', 'keyword_match', 'brand_default', 'category_default']), reason: z.string(),
});
const FixSuggestionsSchema = z.object({
  listingId: z.string(), version: z.number().int().describe('The listing version the suggestions were built for: send it back with the PATCH that applies one'), generatedAt: z.string(), engine: z.literal('rules'), note: z.string(),
  suggestions: z.array(CandidateSchema.extend({
    key: z.string(), kind: z.enum(['attribute', 'brand']), field: z.string(), label: z.string(), severity: z.enum(['fail', 'warn']).describe('fail: blocks publishing; warn: a recommendation'),
    confidenceLevel: z.enum(['high', 'medium', 'low']), alternatives: z.array(CandidateSchema),
    apply: z.object({ attributeOverrides: z.record(z.string(), Scalar).optional(), brand: z.string().optional() }).describe('The body to PATCH /listings/{id} (with `version`) to accept the suggestion'),
  })),
  unresolved: z.array(z.object({ key: z.string(), label: z.string(), reason: z.string() })).describe('Failing attributes the engine found nothing for: they need a value by hand'),
}).meta({ id: 'ListingFixSuggestions' });

const TextEditBody = (max: number) => z.discriminatedUnion('op', [
  z.object({ op: z.enum(['prefix', 'suffix', 'set']), value: z.string().min(1).max(max) }),
  z.object({ op: z.literal('replace'), find: z.string().min(1).max(500), value: z.string().max(max), caseSensitive: z.boolean().optional() }),
]);
const ListEditBody = (items: number, itemMax: number) => z.discriminatedUnion('op', [
  z.object({ op: z.enum(['set', 'add', 'remove']), values: z.array(z.string().trim().min(1).max(itemMax)).min(1).max(items) }),
  z.object({ op: z.literal('clear') }),
]);
const BulkContentBody = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  edits: z.object({
    title: TextEditBody(TITLE_MAX).optional().describe('prefix / suffix add text, replace swaps `find` for `value` (case-insensitive unless caseSensitive), set overwrites'),
    description: z.discriminatedUnion('op', [
      z.object({ op: z.enum(['append', 'prepend', 'set']), value: z.string().min(1).max(DESCRIPTION_MAX) }),
      z.object({ op: z.literal('replace'), find: z.string().min(1).max(500), value: z.string().max(DESCRIPTION_MAX), caseSensitive: z.boolean().optional() }),
    ]).optional(),
    bulletPoints: ListEditBody(BULLETS_MAX, BULLET_MAX).optional(), searchTerms: ListEditBody(TERMS_MAX, TERM_MAX).optional(),
    brand: z.discriminatedUnion('op', [z.object({ op: z.literal('set'), value: z.string().trim().min(1).max(200) }), z.object({ op: z.literal('clear') })]).optional(),
  }).refine((e) => Object.values(e).some((v) => v !== undefined), { message: 'Choose at least one change' }),
  dryRun: z.boolean().optional().describe('true: answer what would change for every listing without saving anything'),
  versions: z.record(z.uuid(), z.number().int()).optional().describe('Listing id -> the version your screen showed; a listing that changed since is reported as VERSION_CONFLICT and left alone'),
});
const BulkContentResultSchema = z.object({
  action: z.literal('edit_content'), dryRun: z.boolean(),
  summary: z.object({ total: z.number().int(), succeeded: z.number().int(), failed: z.number().int(), skipped: z.number().int() }),
  results: z.array(z.object({
    index: z.number().int(), id: z.string(), sku: z.string().nullable(), ok: z.boolean(), status: z.enum(['done', 'skipped', 'failed']), outcome: z.enum(['updated', 'preview', 'unchanged']).nullable(), message: z.string(),
    changedFields: z.array(z.string()), changes: z.record(z.string(), z.object({ before: z.unknown(), after: z.unknown() })).nullable().describe('Per changed field: the value shown before and after'),
    error: z.object({ code: z.string(), message: z.string() }).nullable(),
  })),
}).meta({ id: 'ListingBulkContentResult' });

const ChannelSchema = z.object({
  accountId: z.string(), accountName: z.string(), marketplace: z.string(), marketplaceName: z.string(),
  listingId: z.string().nullable().describe('The listing of the variant on this account; null = not listed there yet'),
  screenStatus: z.union([ScreenStatusSchema, z.literal('not_listed')]), readinessPercent: z.number().int().nullable(), lastSyncAt: IsoDate.nullable(), externalUrl: z.string().nullable(),
  current: z.boolean().describe('true for the account of the listing (or the target account) the screen is about'),
});

/**
 * Read models of the listing flow screens: other channels of a product, the "not listed yet" context and the bulk selection.
 * Writes stay on the existing endpoints (PATCH /listings/{id}, POST /listings, bulk-actions).
 */
export const flowsRoutes = (ListingSchema: z.ZodObject): FastifyPluginAsync => async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Listings Workspace'];
  const ctxOf = (req: FastifyRequest) => ctxFromRequest(req, requireVendor(req));

  r.get('/listings/:id/channels', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'The other channels of the product behind a listing',
      description: 'One row per connected account: the status and readiness of the same variant there, the last sync, or `not_listed` where it could still be listed. Feeds the blocker screen, the quick view and the sync screens.',
      params: IdParamSchema,
      response: { 200: successEnvelope(z.object({
        listingId: z.string(), productId: z.string(), productTitle: z.string(), variantId: z.string(), sku: z.string(), variantsCount: z.number().int(), channels: z.array(ChannelSchema),
      }).meta({ id: 'ListingChannels' })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx) => flows.listingChannels(ctxOf(req), tx, req.params.id))));

  r.get('/listings/unlisted-context', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'Context of a variant that is not listed yet on an account',
      description: 'The variant, the target account (and whether it accepts listings through the API), the stock the channel could sell, and where the variant is listed already. `existingListingId` is set when a listing exists meanwhile. Start the listing with POST /listings.',
      querystring: z.object({ variantId: z.uuid(), accountId: z.uuid() }),
      response: { 200: successEnvelope(z.object({
        variantId: z.string(), productId: z.string(), productTitle: z.string(), sku: z.string(), barcode: z.string().nullable(), categoryName: z.string().nullable(), variantsCount: z.number().int(), inventoryAvailable: z.number().int(),
        account: z.object({ id: z.string(), displayName: z.string(), marketplace: z.string(), marketplaceName: z.string(), status: z.string(), canCreateListings: z.boolean() }),
        existingListingId: z.string().nullable(), channels: z.array(ChannelSchema),
      }).meta({ id: 'ListingUnlistedContext' })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx) => flows.unlistedContext(ctxOf(req), tx, req.query.variantId, req.query.accountId))));

  r.get('/listings/selection', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'The listings of a bulk selection, with readiness and status',
      description: 'At most 100 comma-separated listing ids, answered in the order given with the same `table` block as GET /listings/table. Ids that do not exist (or belong to someone else) come back in `missingIds`.',
      querystring: z.object({ ids: z.string().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.uuid()).min(1).max(100)) }),
      response: { 200: successEnvelope(z.object({ items: z.array(ListingSchema.extend({ table: TableBlockSchema })), missingIds: z.array(z.string()) }).meta({ id: 'ListingSelection' })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx) => flows.selection(ctxOf(req), tx, req.query.ids))));

  r.get('/listings/:id/flow-details', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'Category paths and the completeness list of a listing (blocker screen, quick view)',
      description: 'The full marketplace category path ("Fashion > Apparel") and your own category path ("Apparel > Tops > Shirts"), the variant count and the fixed completeness rows Title, Images, SKU, Category and Weight (weight from the variant, else the product), each pass | warn | fail with a detail. The readiness groups stay on GET /listings/{id}/readiness.',
      params: IdParamSchema, response: { 200: successEnvelope(FlowDetailsSchema) },
    },
  }, async (req) => ok(req, await listingFlowDetails(ctxOf(req), req.params.id)));

  r.get('/listings/:id/fix-suggestions', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'Suggested values for the failing attributes of a listing ("Fix with AI")',
      description: 'For every missing or invalid category attribute (and a missing brand) a proposed value with a confidence and the reason: the product\'s own attributes and options, words of the title / tags / description matched against the marketplace category\'s allowed values, the other listings of the same product, and what the seller enters for the same brand or category. Deterministic and local: no external model. Nothing is saved: accept one by sending its `apply` body to PATCH /listings/{id} with the `version`, then validate.',
      params: IdParamSchema, response: { 200: successEnvelope(FixSuggestionsSchema) },
    },
  }, async (req) => ok(req, await fixSuggestions(ctxOf(req), req.params.id)));

  r.post('/listings/bulk-content', {
    config: { access: { permission: 'listings:write' } },
    schema: {
      tags: TAGS, summary: 'Edit the channel content of many listings at once',
      description: 'At most 100 ids. Title (prefix | suffix | replace | set), description (append | prepend | replace | set), bullet points and search terms (set | add | remove | clear) and brand (set | clear): the fields and rules of PATCH /listings/{id}, saved as overrides of the listing\'s marketplace (the master product is never touched; a live listing is queued for a content sync). Always HTTP 200 with a result per listing (`done`, `skipped` when nothing changes, `failed` with the reason, e.g. VERSION_CONFLICT when `versions` is sent and the listing changed). Listings of one product on one marketplace share their content, so the edit is applied once for them. `dryRun` returns the before / after without saving.',
      body: BulkContentBody, response: { 200: successEnvelope(BulkContentResultSchema) },
    },
  }, async (req) => ok(req, await bulkContentEdit(ctxOf(req), req.body)));
};
