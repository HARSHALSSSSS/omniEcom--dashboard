import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { created, ok, strictRateLimit, vendorTx } from '@oms/module-kit';
import { IdParamSchema, IsoDate, successEnvelope } from '@oms/contracts';
import { schema } from '@oms/database';
import { DESCRIPTION_MAX_INPUT } from './description';
import { requestEffects } from './effects';
import * as ai from './ai-description-service';

const SuggestionBase = z.object({
  id: z.uuid(), productId: z.uuid(), mode: z.enum(schema.AI_DESCRIPTION_MODES), text: z.string(), html: z.string(), basis: z.array(z.string()), needsFacts: z.boolean(), unchanged: z.boolean(),
  status: z.enum(schema.AI_SUGGESTION_STATUSES), applied: z.boolean(), note: z.string(), explanation: z.string(), provider: z.string(), createdAt: IsoDate, expiresAt: IsoDate, decidedAt: IsoDate.nullable(),
});
const AlternativeSchema = SuggestionBase.extend({}).meta({ id: 'ProductAiSuggestionAlternative' });
const SuggestionSchema = SuggestionBase.extend({ alternatives: z.array(AlternativeSchema).optional() }).meta({ id: 'ProductAiSuggestion' });

const AppliedSchema = z.object({
  suggestion: SuggestionSchema,
  text: z.string(), html: z.string(),
  product: z.object({ id: z.uuid(), description: z.string().nullable(), descriptionHtml: z.string().nullable(), status: z.string(), version: z.number().int(), updatedAt: IsoDate }).optional(),
}).meta({ id: 'ProductAiSuggestionApplied' });

const SuggestionParams = z.object({ id: z.uuid(), suggestionId: z.uuid() });

/** "Improve with AI" suggestions for the product description: suggest -> preview -> apply / dismiss. Nothing is applied automatically. */
export const productAiRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Products', 'AI'];
  const limiter = strictRateLimit(app, 20);

  r.post('/products/:id/ai/description', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: TAGS,
      summary: 'Suggest a product description (rewrite, concise or benefits)',
      description: 'Writes ONLY from facts that exist on the product (name, category, confirmed brand, material, country of origin, dimensions, weight, confirmed custom attributes); never invents features. '
        + '`text` is the editor content (may be unsaved, plain or the editor HTML, max 2,000 plain-text characters) and defaults to the saved description. `rewrite` needs text (409 `nothing_to_rewrite`). '
        + '`concise` with text condenses that text (strictly shorter, only words of the text plus because / if / can, or `unchanged: true`); without text it writes a short sentence from name and category. '
        + '`alsoSuggest` (max one mode, different from `mode`) stores a second suggestion and returns it in `alternatives` with its own id. Every suggestion carries an `explanation`. '
        + 'Draft or active products only (409 `product_not_editable`). 403 `feature_disabled` when the AI flag or the business AI setting is off. 20 requests per minute. The suggestion is stored; apply or dismiss it afterwards.',
      params: IdParamSchema,
      body: z.object({ mode: z.enum(schema.AI_DESCRIPTION_MODES), text: z.string().max(DESCRIPTION_MAX_INPUT).optional(), alsoSuggest: z.array(z.enum(schema.AI_DESCRIPTION_MODES)).max(1).optional() }),
      response: { 201: successEnvelope(SuggestionSchema) },
    },
  }, async (req, reply) => {
    await limiter(req);
    const dto = await vendorTx(req, (tx, vendorId) => ai.generateSuggestion(tx, vendorId, req.params.id, { mode: req.body.mode, text: req.body.text, alsoSuggest: req.body.alsoSuggest, actorId: req.ctx.principal?.actorId ?? null }, requestEffects(tx, req)));
    return created(req, reply, dto, `/api/v1/products/${req.params.id}/ai/description/${dto.id}`);
  });

  r.get('/products/:id/ai/description', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: TAGS, summary: 'Latest description suggestions of a product (newest first)', params: IdParamSchema,
      querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }),
      response: { 200: successEnvelope(z.array(SuggestionSchema)) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => ai.listSuggestions(tx, vendorId, req.params.id, req.query.limit))));

  r.post('/products/:id/ai/description/:suggestionId/apply', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: TAGS,
      summary: 'Apply a description suggestion',
      description: 'persist true (default): writes `description` (plain text) and `descriptionHtml`, increments the product `version` and marks the suggestion applied, in one transaction. `version` is the product version the seller saw (required, 400 `version_required`; 409 `VERSION_CONFLICT`). '
        + 'persist false: only records the acceptance (audit `product.ai_description_accepted`) and returns `{ suggestion, text, html }`; the product is NOT written and `version` is not needed (the editor saves the text with its own Save). '
        + 'Draft or active products only. 409 `suggestion_expired` after 7 days, 409 `already_decided` when it was applied or dismissed before (details.rule).',
      params: SuggestionParams,
      body: z.object({ version: z.number().int().min(1).optional(), persist: z.boolean().default(true) }),
      response: { 200: successEnvelope(AppliedSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => ai.applySuggestion(tx, vendorId, req.params.id, req.params.suggestionId, { version: req.body.version, persist: req.body.persist }, requestEffects(tx, req)))));

  r.post('/products/:id/ai/description/:suggestionId/dismiss', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: TAGS, summary: 'Dismiss a description suggestion', description: 'Idempotent. An already applied suggestion cannot be dismissed (409 `already_decided`).',
      params: SuggestionParams, response: { 200: successEnvelope(SuggestionSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => ai.dismissSuggestion(tx, vendorId, req.params.id, req.params.suggestionId, requestEffects(tx, req)))));
};
