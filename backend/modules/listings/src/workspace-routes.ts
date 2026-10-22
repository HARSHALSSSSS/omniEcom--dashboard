import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IdParamSchema, PageQuerySchema, SearchQuerySchema, sortQuery, successEnvelope } from '@oms/contracts';
import { ok, requireVendor, vendorTx } from '@oms/module-kit';
import { SyncJobSchema, toSyncJobDto } from '@oms/mod-sync';
import { getListingRow } from './context';
import { ctxFromRequest } from './ctx';
import { extraInputOf, extraPredicates, ListExtraQuery } from './list-filters';
import { hasComputed, tableComputed } from './list-readiness';
import { LISTING_STATUS_VALUES } from './schemas';
import { bulkAction, BULK_ACTIONS, publishFlow } from './workspace-edit';
import { getListingDto } from './service';
import { ActionSchema, ActivityPageSchema, BulkResultSchema, CountsSchema, FlowStepSchema, ReadinessSchema, ScreenStatusSchema, TableBlockSchema } from './workspace-schemas';
import * as ws from './workspace-service';

const Pass = z.record(z.string(), z.unknown());
const IdsBody = z.object({ ids: z.array(z.uuid()).min(1).max(100) });

/**
 * The listings workspace: the Listings screen (overview, numbered table, not-listed candidates, bulk actions) and the Listing Studio
 * (composite studio read model, readiness, activity, one-call publish). Receives the Listing schema of routes.ts (no import cycle).
 */
export const workspaceRoutes = (ListingSchema: z.ZodObject): FastifyPluginAsync => async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Listings Workspace'];
  const ctxOf = (req: FastifyRequest) => ctxFromRequest(req, requireVendor(req));
  const Row = ListingSchema.extend({ table: TableBlockSchema });
  const Flow = z.object({
    listingId: z.string(), outcome: z.enum(['queued', 'blocked', 'failed', 'not_applicable']).describe('queued: the publish job runs (202); blocked: validation or approval stopped it; failed: a step failed; not_applicable: already live'),
    steps: z.array(FlowStepSchema), job: SyncJobSchema.nullable(), alreadyQueued: z.boolean(), listing: ListingSchema,
  }).meta({ id: 'ListingPublishFlow' });

  r.get('/listings/overview', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'Counts for the Listings screen: tabs, marketplaces, content states',
      description: 'byScreenStatus feeds the tab strip (live, ready, needs_review, syncing, failed, blocked and not_listed = products that could still be listed on a connected account). byStatus is the lifecycle status verbatim, byContentState the master-content propagation state. Optional filters narrow every counter.',
      querystring: z.object({ 'filter[accountId]': z.uuid().optional(), 'filter[marketplace]': z.string().max(40).optional() }),
      response: { 200: successEnvelope(z.object({
        totals: z.object({ listings: z.number().int(), live: z.number().int(), needsAttention: z.number().int(), notListed: z.number().int() }),
        byScreenStatus: z.record(z.string(), z.number().int()), byStatus: z.record(z.string(), z.number().int()), byContentState: z.record(z.string(), z.number().int()),
        byMarketplace: z.array(z.object({ marketplace: z.string(), name: z.string(), total: z.number().int(), live: z.number().int(), needsAttention: z.number().int(), notListed: z.number().int() })),
      }).meta({ id: 'ListingsOverview' })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx) => ws.overview(ctxOf(req), tx, { accountId: req.query['filter[accountId]'], marketplace: req.query['filter[marketplace]'] }))));

  r.get('/listings/table', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'The Listings screen table (numbered pages, with totals and tab counts)',
      description: 'Same listings as GET /listings (cursor) but numbered pages and every row carries the `table` block (thumbnail, category, marketplace name, effective price/MRP/sale price, channel stock, readiness percent and top blocker, marketplace id and URL, last sync). `counts` are per tab and ignore the tab filter itself. The cursor list stays for integrations (`include=table` gives it the same block). `filter[marketplace]` also takes a channel group code (`social` = Social Commerce: meesho + shopify). Extra filters: issue, categoryId, productStatus, potential (SQL) and readiness, inventory (evaluated per listing, so slower on large catalogues).',
      querystring: PageQuerySchema.extend(SearchQuerySchema.shape).extend({
        'filter[screenStatus]': ScreenStatusSchema.optional(), 'filter[status]': z.enum(LISTING_STATUS_VALUES).optional(), 'filter[accountId]': z.uuid().optional(), 'filter[marketplace]': z.string().max(40).optional(),
        'filter[contentState]': z.enum(['synced', 'sync_pending', 'needs_review', 'needs_republish', 'failed']).optional(), 'filter[source]': z.enum(['created', 'imported']).optional(),
        'filter[attention]': z.enum(['true', 'false']).optional().describe('true = needs_review + failed + blocked'),
        ...ListExtraQuery,
        sort: sortQuery(['updatedAt', 'createdAt', 'title', 'sku', 'price', 'status'] as const),
      }),
      response: { 200: successEnvelope(z.object({ items: z.array(Row), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(), counts: CountsSchema }).meta({ id: 'ListingsTablePage' })) },
    },
  }, async (req) => {
    const q = req.query;
    const extra = extraInputOf(q);
    const filter = {
      screenStatus: q['filter[screenStatus]'], status: q['filter[status]'], accountId: q['filter[accountId]'], marketplace: q['filter[marketplace]'], contentState: q['filter[contentState]'],
      source: q['filter[source]'], attention: q['filter[attention]'] === 'true', q: q.q, extra: extraPredicates(ctxOf(req), extra),
    };
    const out = await vendorTx(req, (tx) => (hasComputed(extra) ? tableComputed(ctxOf(req), tx, filter, extra, q, q.sort?.[0]) : ws.table(ctxOf(req), tx, filter, q, q.sort?.[0])));
    return ok(req, { items: out.items, page: q.page, pageSize: q.pageSize, total: out.total, pages: Math.max(1, Math.ceil(out.total / q.pageSize)), counts: out.counts });
  });

  r.get('/listings/not-listed', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'Products that are not listed yet on a connected account (the "Not listed" tab)',
      description: 'One row per active variant and connected account of a marketplace that accepts listings through the API, without a listing. Start one with POST /listings.',
      querystring: PageQuerySchema.extend(SearchQuerySchema.shape).extend({ 'filter[accountId]': z.uuid().optional(), 'filter[marketplace]': z.string().max(40).optional(), 'filter[categoryId]': ListExtraQuery['filter[categoryId]'] }),
      response: { 200: successEnvelope(z.object({
        items: z.array(z.object({ variantId: z.string(), productId: z.string(), sku: z.string(), barcode: z.string().nullable(), productTitle: z.string(), priceMinor: z.number().nullable(), mrpMinor: z.number().nullable(), accountId: z.string(), accountName: z.string(), marketplace: z.string(), marketplaceName: z.string() })),
        page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(),
      }).meta({ id: 'NotListedPage' })) },
    },
  }, async (req) => {
    const q = req.query;
    const out = await vendorTx(req, (tx) => ws.notListed(ctxOf(req), tx, { accountId: q['filter[accountId]'], marketplace: q['filter[marketplace]'], categoryId: q['filter[categoryId]'], q: q.q }, q));
    return ok(req, { items: out.items, page: q.page, pageSize: q.pageSize, total: out.total, pages: Math.max(1, Math.ceil(out.total / q.pageSize)) });
  });

  r.get('/listings/:id/readiness', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'Readiness checklist of a listing',
      description: 'Grouped checks (content, media, attributes, price, stock, category mapping, plus marketplace feedback when the marketplace reported something), each pass | warn | fail with the field and a fix action. Built from the live validation: the marketplace is asked for the category requirements. percent = (pass + warn/2) / checks.',
      params: IdParamSchema,
      response: { 200: successEnvelope(ReadinessSchema.extend({ listingId: z.string(), evaluatedAt: z.string(), marketplace: z.string() })) },
    },
  }, async (req) => ok(req, await ws.readiness(ctxOf(req), req.params.id)));

  r.get('/listings/:id/studio', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'Everything the Listing Studio shows, in one call',
      description: 'listing (with the table block), product, account, content (master vs channel value with an override flag per field), marketplace preview (customer view + request payload), readiness checklist, pricing, channel stock, marketplace category with its required attributes and their values, media, variations of the product on this account, content-sync state, marketplace feedback, the first page of the activity timeline and `actions[]` (each with `enabled` and `disabledReason`).',
      params: IdParamSchema,
      response: { 200: successEnvelope(z.object({
        listing: Row, product: Pass, account: Pass, content: Pass, preview: Pass, readiness: ReadinessSchema, pricing: Pass, stock: Pass, category: Pass,
        media: z.array(Pass), variations: z.array(Pass), contentSync: Pass, marketplaceIssues: z.array(Pass), externalUrl: z.string().nullable(), activity: ActivityPageSchema, actions: z.array(ActionSchema),
      }).meta({ id: 'ListingStudio' })) },
    },
  }, async (req) => ok(req, (await ws.studio(ctxOf(req), req.params.id)) as never));

  r.get('/listings/:id/activity', {
    config: { access: { permission: 'listings:read' } },
    schema: {
      tags: TAGS, summary: 'Activity timeline of a listing (audit trail), newest first',
      params: IdParamSchema, querystring: PageQuerySchema,
      response: { 200: successEnvelope(ActivityPageSchema.extend({ page: z.number().int(), pageSize: z.number().int(), pages: z.number().int() })) },
    },
  }, async (req) => {
    const q = req.query;
    const out = await vendorTx(req, async (tx, vendorId) => { await getListingRow(tx, vendorId, req.params.id); return ws.activity(tx, vendorId, req.params.id, q); });
    return ok(req, { ...out, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(out.total / q.pageSize)) });
  });

  r.post('/listings/:id/publish-flow', {
    config: { access: { permission: 'listings:write' } },
    schema: {
      tags: TAGS, summary: 'Validate, approve and publish in one call',
      description: 'Runs the three steps of the listing flow and reports each one. 202 when the publish job was queued; 200 when it stopped earlier (`outcome` blocked: validation errors, failed: a step was refused, not_applicable: already live) with the step that stopped it. The separate validate / approve / publish endpoints stay.',
      params: IdParamSchema,
      response: { 200: successEnvelope(Flow), 202: successEnvelope(Flow) },
    },
  }, async (req, reply) => {
    const res = await publishFlow(ctxOf(req), req.params.id);
    if (res.outcome === 'queued') reply.code(202);
    const listing = await vendorTx(req, async (tx, vendorId) => getListingDto(tx, vendorId, req.params.id));
    return ok(req, { ...res, job: res.job ? toSyncJobDto(res.job) : null, listing });
  });

  r.post('/listings/bulk-publish', {
    config: { access: { permission: 'listings:write' } },
    schema: {
      tags: TAGS, summary: 'Publish many listings (validate, approve, publish each)',
      description: 'At most 100 ids. Always HTTP 200: every listing has its own result (`done` with the job id, `failed` with the reason, `skipped` when already live); one failure never stops the rest.',
      body: IdsBody, response: { 200: successEnvelope(BulkResultSchema) },
    },
  }, async (req) => ok(req, await bulkAction(ctxOf(req), 'publish', req.body.ids)));

  r.post('/listings/bulk-actions', {
    config: { access: { permission: 'listings:write' } },
    schema: {
      tags: TAGS, summary: 'Bulk action on listings: validate | publish | unpublish | retry | sync_inventory',
      description: 'At most 100 ids, partial success inside HTTP 200 (per-item `status` done | skipped | failed). retry: rejected / correction-required listings go through the publish flow again, a failed content update is re-sent, a pending listing is re-checked. sync_inventory flags the active listings and queues one stock job per account.',
      body: IdsBody.extend({ action: z.enum(BULK_ACTIONS) }), response: { 200: successEnvelope(BulkResultSchema) },
    },
  }, async (req) => ok(req, await bulkAction(ctxOf(req), req.body.action, req.body.ids)));
};
