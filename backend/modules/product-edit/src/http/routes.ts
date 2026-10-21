import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ok, vendorTx } from '@oms/module-kit';
import { IdParamSchema, successEnvelope } from '@oms/contracts';
import { getProductRow, requestEffects, type RawFields } from '@oms/mod-catalog';
import { computeChange, withIssues } from '../domain/diff';
import { buildEditor } from '../application/editor';
import { computeImpact } from '../application/impact';
import { contextIssues, saveEdit } from '../application/save';
import { currentInsights, dismissInsight, restoreInsight } from '../application/insights';
import { requestContentSync, type ListingOpts } from '../infrastructure/listings-port';
import {
  ChangeImpactBodySchema, ChangeImpactSchema, DismissBodySchema, EditorSchema, EditSaveBodySchema, EditSaveResultSchema, InsightDecisionSchema, InsightKeyParamsSchema, InsightListSchema,
} from './schemas';

/**
 * Product edit flow (Figma "Edit product flow", docs/figma/50-edit-product-flow-analysis.md, decisions in 51-edit-build-brief.md): the editor
 * read, the change-impact preview, the atomic save with listing propagation and the suggested improvements. Reads need products:read; the save
 * and the dismissals need products:write (viewers can read and preview, not save).
 */
export const productEditRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const TAGS = ['Product edit'];
  /** the connector registry of this container + who is editing (the listings module audits listings that need a decision) */
  const listingOpts = (req: FastifyRequest): ListingOpts => ({ connectors: c.connectors, actor: { type: 'user', id: req.ctx.principal?.actorId ?? null }, requestId: req.id });
  const names = (code: string) => (c.connectors.has(code) ? c.connectors.get(code).displayName : code);

  r.get('/products/:id/edit', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: TAGS, summary: 'The editing page of a product in one call',
      description: 'The editor view of the product, the baseline `version` to send with the save, the master-code lock (`locks.productCode`), header meta (master code, created, last updated and by whom), the nav with counts, the attribute counter (supplied core facts + confirmed custom attributes) with its note, media thumbnails, the channels that inherit the master content (and the fields each manages independently), the readiness panel (`readiness.percent` equals the content readiness of GET /products/{id}/content) and the suggested improvements. Writes nothing.',
      params: IdParamSchema, response: { 200: successEnvelope(EditorSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => buildEditor(tx, vendorId, await getProductRow(tx, vendorId, req.params.id), names, listingOpts(req)))));

  r.post('/products/:id/change-impact', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: TAGS, summary: 'What would this edit affect? (preview, nothing is saved)',
      description: 'Compares `changes` with the stored product (values equal to it are ignored) and answers which connected listings would inherit each change, which channels manage that content independently, and whether the seller must confirm (a category or product-type change while listings are live: `requiresConfirmation`, with the modal text in `confirmation`). `errors` lists fields that the save would reject; they are left out of the impact. Updates are not sent to listings until the product is saved.',
      params: IdParamSchema, body: ChangeImpactBodySchema, response: { 200: successEnvelope(ChangeImpactSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const before = await getProductRow(tx, vendorId, req.params.id);
    const first = computeChange(before, req.body.changes as RawFields);
    const change = withIssues(first, await contextIssues(tx, vendorId, before, first));
    return (await computeImpact(tx, vendorId, before, change, listingOpts(req))).dto;
  })));

  r.post('/products/:id/edit/save', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: TAGS, summary: 'Save the edit page (atomic) and propagate to the connected listings',
      description: 'ONE transaction: the product is patched with the strict field rules of the creation flow, the connected listings are marked (inherited content -> `sync_pending`, a category change on live listings -> `needs_review`, no `listings.update` capability -> `needs_republish`, channel overrides are never touched), then audit `product.edited` and the events `product.updated` / `product.edited` are written. After the commit one content-sync job per account is requested. Errors: 400 `VALIDATION_FAILED` (`details.issues[{ path, code, message }]`), 409 `VERSION_CONFLICT` (`details.currentVersion`, `current` editor view, `updatedAt`, `updatedBy`), 409 `CONFLICT` with `details.rule` = `code_locked` (the master code of a non-draft), `confirmation_required` (with `details.impact`; repeat with `confirm: true`) or `needs_variant`, 413 when the product has more than 500 listings. A save without an effective change answers 200 `{ saved: false, noChanges: true }` and writes nothing. Honours the Idempotency-Key header.',
      params: IdParamSchema, body: EditSaveBodySchema, response: { 200: successEnvelope(EditSaveResultSchema) },
    },
  }, async (req) => {
    const res = await vendorTx(req, async (tx, vendorId) => ({
      vendorId,
      ...(await saveEdit(tx, vendorId, req.params.id, { version: req.body.version, changes: req.body.changes as RawFields, confirm: req.body.confirm }, requestEffects(tx, req), names, listingOpts(req))),
    }));
    // after the commit: one coalesced, idempotent content-sync job per account. A failure to enqueue never fails the save (the listing stays sync_pending and the sweep / retry picks it up)
    for (const accountId of res.accountsToSync) {
      try { await requestContentSync(c, res.vendorId, accountId, 'event'); } catch (e) { req.log.warn({ err: e, accountId }, 'content sync request failed; listings stay sync_pending'); }
    }
    return ok(req, res.outcome);
  });

  r.get('/products/:id/insights', {
    config: { access: { permission: 'products:read' } },
    schema: {
      tags: TAGS, summary: 'Suggested improvements of a product',
      description: 'Every suggestion that currently applies and is not dismissed (`items`), and those the seller dismissed that still apply (`dismissed`, to offer a restore). Keys: `description_short` (the plain-text description is shorter than the median of the business\'s other active products in the same category, at least 5 of them, else 150 characters) and `few_images` (fewer than 3 real images; a placeholder does not count). A suggestion whose condition no longer holds disappears on its own.',
      params: IdParamSchema, response: { 200: successEnvelope(InsightListSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const out = await currentInsights(tx, vendorId, await getProductRow(tx, vendorId, req.params.id));
    return { items: out.items, dismissed: out.dismissed.map((d) => ({ ...d })) };
  })));

  r.post('/products/:id/insights/:key/dismiss', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: TAGS, summary: 'Dismiss a suggested improvement',
      description: 'Per product and key. With `until` the suggestion may reappear after that moment (must be in the future); without it, it stays hidden until restored. Idempotent: dismissing again updates the dismissal. 404 for an unknown key.',
      params: InsightKeyParamsSchema, body: DismissBodySchema, response: { 200: successEnvelope(InsightDecisionSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const p = await getProductRow(tx, vendorId, req.params.id);
    const done = await dismissInsight(tx, vendorId, p, req.params.key, req.body.until ? new Date(req.body.until) : null, requestEffects(tx, req));
    return { ...done, insights: (await currentInsights(tx, vendorId, p)).items };
  })));

  r.post('/products/:id/insights/:key/restore', {
    config: { access: { permission: 'products:write' } },
    schema: {
      tags: TAGS, summary: 'Show a dismissed suggestion again',
      description: 'Removes the dismissal. Idempotent. 404 for an unknown key.',
      params: InsightKeyParamsSchema, response: { 200: successEnvelope(InsightDecisionSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const p = await getProductRow(tx, vendorId, req.params.id);
    const done = await restoreInsight(tx, vendorId, p, req.params.key, requestEffects(tx, req));
    return { ...done, insights: (await currentInsights(tx, vendorId, p)).items };
  })));
};
