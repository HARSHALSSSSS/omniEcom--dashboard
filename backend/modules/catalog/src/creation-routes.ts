import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { created, ok, paged, pageWindow, vendorTx } from '@oms/module-kit';
import { IdParamSchema, pagedEnvelope, successEnvelope } from '@oms/contracts';
import { requestEffects } from './effects';
import * as brands from './brands';
import * as cr from './creation';
import * as forms from './form-options';
import {
  BrandBodySchema, BrandListQuerySchema, BrandSchema, ContinueBodySchema, CreationDtoSchema, CreationReadinessSchema, DraftCreateSchema, DraftListItemSchema, DraftListQuerySchema, DraftPatchSchema,
  FormOptionsSchema, PreviewBodySchema, SkuCheckQuerySchema, SkuCheckSchema, SkuVerifyBodySchema, SkuVerifySchema, StandardCategoryQuerySchema, StandardCategorySchema, StepBodySchema, ValidateStepSchema,
} from './creation-schemas';

/**
 * Product creation flow (Figma "Product creation flow"): form options, brands, SKU checks, drafts with autosave, the readiness panel and the
 * step validation. Reads need products:read, everything that changes data needs products:write (discarding a draft included: it only applies to drafts).
 */
export const creationRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const CREATION = ['Product creation'];
  const BRANDS = ['Brands'];
  const Msg = z.object({ message: z.string() });
  const names: cr.NamesFn = (code) => (c.connectors.has(code) ? c.connectors.get(code).displayName : code);

  // ================================================================== form options
  r.get('/products/form-options', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: CREATION, summary: 'Options and limits for the product editor',
      description: 'Product types, GST slabs, countries (India first), materials (a curated list plus the business\'s own), accepted units (the API stores mm and grams), field limits and the image rules.',
      response: { 200: successEnvelope(FormOptionsSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => forms.formOptions(tx, vendorId))));

  r.get('/products/standard-categories', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: CREATION, summary: 'Suggestions for the "standard product category" field',
      description: 'Distinct values already used by the business\'s products. `q` matches as a prefix first, then anywhere in the value.',
      querystring: StandardCategoryQuerySchema,
      response: { 200: successEnvelope(z.array(StandardCategorySchema)) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => forms.standardCategorySuggestions(tx, vendorId, req.query.q, req.query.limit))));

  // ================================================================== brands
  r.get('/brands', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: BRANDS, summary: 'List the business\'s brands',
      description: 'Confirmed brands first, then alphabetical. A brand typed on a product is added unconfirmed. `productCount` is the number of live products using the brand.',
      querystring: BrandListQuerySchema,
      response: { 200: successEnvelope(z.array(BrandSchema)) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => brands.listBrands(tx, vendorId, { q: req.query.q, confirmed: req.query.confirmed, limit: req.query.limit }))));

  r.post('/brands', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: BRANDS, summary: 'Create (and confirm) a brand',
      description: 'An explicit create is confirmed. 409 `CONFLICT` (`details.rule = duplicate_brand`, `details.existing`) when the name already exists, ignoring case and repeated spaces.',
      body: BrandBodySchema,
      response: { 201: successEnvelope(BrandSchema) },
    },
  }, async (req, reply) => {
    const dto = await vendorTx(req, (tx, vendorId) => brands.createBrand(tx, vendorId, req.body.name, requestEffects(tx, req)));
    return created(req, reply, dto, `/api/v1/brands?q=${encodeURIComponent(dto.name)}`);
  });

  r.post('/brands/:id/confirm', {
    config: { access: { permission: 'products:write' } },
    schema: { tags: BRANDS, summary: 'Confirm a brand', description: 'Marks the brand as confirmed. Idempotent: an already confirmed brand is returned unchanged.', params: IdParamSchema, response: { 200: successEnvelope(BrandSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => brands.confirmBrand(tx, vendorId, req.params.id, requestEffects(tx, req)))));

  r.delete('/brands/:id', {
    config: { access: { permission: 'products:write' } },
    schema: { tags: BRANDS, summary: 'Delete a brand', description: '409 `CONFLICT` (`details.rule = in_use`) while any live product uses the brand.', params: IdParamSchema, response: { 200: successEnvelope(Msg) } },
  }, async (req) => {
    await vendorTx(req, (tx, vendorId) => brands.deleteBrand(tx, vendorId, req.params.id, requestEffects(tx, req)));
    return ok(req, { message: 'Brand deleted' });
  });

  // ================================================================== master SKU
  r.get('/products/sku-check', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: CREATION, summary: 'Is this Master SKU free?',
      description: 'Compares ignoring case. `conflict` is the product that already uses the code; `similar` lists variants whose SKU equals the code (a warning, not an error); `suggestion` is the next free `CODE-2`, `CODE-3`... when taken. `excludeProductId` ignores the product being edited. Read-only: use POST /products/{id}/sku/verify to record the check.',
      querystring: SkuCheckQuerySchema,
      response: { 200: successEnvelope(SkuCheckSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => cr.skuCheck(tx, vendorId, req.query.code, req.query.excludeProductId))));

  r.post('/products/:id/sku/verify', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: CREATION, summary: 'Verify a Master SKU for a product',
      description: 'Checks that the code is valid and free (ignoring the product itself) and records it as the verified code, so the readiness tag "Verify" turns into done once the product has that code. 409 `CONFLICT` (`details.rule = duplicate_product_code`) when another product has it.',
      params: IdParamSchema, body: SkuVerifyBodySchema,
      response: { 200: successEnvelope(SkuVerifySchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => cr.verifySku(tx, vendorId, req.params.id, req.body.code, requestEffects(tx, req)))));

  // ================================================================== drafts
  r.post('/products/drafts', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: CREATION, summary: 'Create a draft product',
      description: 'Needs only a title (1-200 characters). Without a `productCode` a unique `DRAFT-XXXXXXXX` placeholder is generated (`creation.codeIsPlaceholder = true`); Continue needs a real code. A duplicate code is a 409 `CONFLICT` (`details.rule = duplicate_product_code`). Counts toward the plan limit like any product. Returns the creation view (product, wizard state, readiness).',
      body: DraftCreateSchema,
      response: { 201: successEnvelope(CreationDtoSchema) },
    },
  }, async (req, reply) => {
    const dto = await vendorTx(req, (tx, vendorId) => cr.createDraft(tx, vendorId, req.body as cr.DraftInput, requestEffects(tx, req), names));
    return created(req, reply, dto, `/api/v1/products/${dto.product.id}/creation`);
  });

  r.get('/products/drafts', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: CREATION, summary: 'My unfinished drafts',
      description: 'Draft products, newest save first (`sort=-savedAt`, also `title`, `productCode`). `q` matches the title and the code. `readinessPercent` is the creation readiness of each row.',
      querystring: DraftListQuerySchema,
      response: { 200: pagedEnvelope(DraftListItemSchema) },
    },
  }, async (req) => {
    const q = req.query;
    const win = pageWindow(q);
    const out = await vendorTx(req, (tx, vendorId) => cr.listDrafts(tx, vendorId, { q: q.q, sort: q.sort[0], ...win }));
    return paged(req, out.items, q, out.total);
  });

  r.get('/products/:id/creation', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: CREATION, summary: 'The creation view of a product',
      description: 'The editor view of the product (including category name, brand record and primary image state), the wizard state (`currentStep`, `completedSteps`, `savedAt`, `version` to send with the next save, `codeIsPlaceholder`) and the readiness checklist.',
      params: IdParamSchema, response: { 200: successEnvelope(CreationDtoSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => cr.getCreationDto(tx, vendorId, req.params.id, names))));

  r.patch('/products/:id/draft', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: CREATION, summary: 'Save a draft (autosave)',
      description: 'Partial update of a draft. `version` is required (409 `VERSION_CONFLICT` with `details.currentVersion` when stale). Only for products in status draft (409 `CONFLICT`, `details.rule = not_a_draft`). Send `productCode: null` or "" to go back to a generated placeholder code. A duplicate code is a 409 `CONFLICT` (`details.rule = duplicate_product_code`). Returns the creation view with the new `version` and `savedAt`.',
      params: IdParamSchema, body: DraftPatchSchema,
      response: { 200: successEnvelope(CreationDtoSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => cr.patchDraft(tx, vendorId, req.params.id, req.body as cr.DraftPatchInput, requestEffects(tx, req), names))));

  r.delete('/products/:id/draft', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: CREATION, summary: 'Discard a draft',
      description: 'Soft delete of a draft. 409 `CONFLICT` when the product is not a draft (`not_a_draft`), has stock (`has_stock`), marketplace listings (`has_listings`) or is referenced by orders (`has_orders`).',
      params: IdParamSchema, response: { 200: successEnvelope(Msg) },
    },
  }, async (req) => {
    await vendorTx(req, (tx, vendorId) => cr.discardDraft(tx, vendorId, req.params.id, requestEffects(tx, req)));
    return ok(req, { message: 'Draft discarded' });
  });

  // ================================================================== readiness + step validation
  r.get('/products/:id/creation-readiness', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: CREATION, summary: 'Creation readiness of a saved product',
      description: 'Checklist of the "Product readiness" panel: 5 required and 3 recommended items with a state (done, pending, verify, confirm, duplicate, uploading, placeholder), the percent (done + placeholder items of 8), the publication blockers with a fix target, hints and the connected channels. Not the marketplace readiness (GET /products/{id}/readiness).',
      params: IdParamSchema, response: { 200: successEnvelope(CreationReadinessSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => cr.savedReadiness(tx, vendorId, req.params.id, names))));

  r.post('/products/creation-readiness', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: CREATION, summary: 'Creation readiness of unsaved form values',
      description: 'Stateless: evaluates the values of the form (including a candidate master code, so a duplicate shows before saving) with the same rules as the saved view. With `productId` the values are laid over that product. Writes nothing.',
      body: PreviewBodySchema, response: { 200: successEnvelope(CreationReadinessSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => cr.previewReadiness(tx, vendorId, req.body.productId, req.body.values, names))));

  r.post('/products/:id/validate-step', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: CREATION, summary: 'Validate the basic step',
      description: 'Checks ONLY the basic step (title of 3+ characters, category, product type, a real unique Master SKU, field rules, description limit) on the saved product with the optional unsaved `values` laid over it. Saves nothing except recording a free Master SKU as verified. `errors` block Continue, `warnings` do not.',
      params: IdParamSchema, body: StepBodySchema, response: { 200: successEnvelope(ValidateStepSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => cr.validateBasicStep(tx, vendorId, req.params.id, req.body.values, requestEffects(tx, req), names))));

  r.post('/products/:id/creation/continue', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: CREATION, summary: 'Continue from the basic step',
      description: 'Saves `values` as a draft save (`version` required, 409 `VERSION_CONFLICT` when stale), validates ONLY the basic step and, when it passes, marks it completed and moves `currentStep` to `variants`. When it fails: 422 `VALIDATION_FAILED` with `details.errors`/`details.warnings`/`details.creation`; the valid values were still saved (a duplicate or invalid field is left out of the save).',
      params: IdParamSchema, body: ContinueBodySchema, response: { 200: successEnvelope(CreationDtoSchema) },
    },
  }, async (req) => {
    const res = await vendorTx(req, (tx, vendorId) => cr.continueBasicStep(tx, vendorId, req.params.id, { version: req.body.version, values: req.body.values }, requestEffects(tx, req), names));
    if (!res.ok) throw new cr.StepValidationError({ step: 'basic', errors: res.errors, warnings: res.warnings, creation: res.dto });
    return ok(req, res.dto);
  });

};
