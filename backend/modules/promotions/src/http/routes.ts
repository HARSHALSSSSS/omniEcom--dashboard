import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { schema, type Tx } from '@oms/database';
import { Errors } from '@oms/shared';
import { IdParamSchema, IsoDate, PageQuerySchema, successEnvelope } from '@oms/contracts';
import { created, effects, ok, opCtxFromRequest, pageWindow, requireVendor, vendorTx, type OpCtx } from '@oms/module-kit';
import { SyncWork } from '@oms/mod-pricing';
import { createCampaign, deleteCampaign, duplicateCampaign, endReasons, listCampaigns, updateCampaign, vendorAccounts, campaignDetail } from '../application/campaigns';
import { evaluateItems, itemCounts, loadItems, removeItems, setItems } from '../application/items';
import { tick, transition } from '../application/lifecycle';
import { listPromotedProducts } from '../application/products';
import { overview } from '../application/results';
import type { Action } from '../domain/lifecycle';
import { isEditable, type Status } from '../domain/lifecycle';
import { loadCampaign, type CampaignRow } from '../infrastructure/queries';
import { CampaignDetailSchema, CampaignSchema, ItemSchema, campaignDto, itemDto } from './dto';

const TAGS = ['Promotions'];
const Minor = z.number().int().min(0).max(100_000_000_000);
const Selection = z.object({
  variantIds: z.array(z.uuid()).max(5000).optional().describe('Specific variants (kept even when they cannot run: the list then says why)'),
  categoryIds: z.array(z.uuid()).max(100).optional().describe('Categories including their sub-categories: active variants listed on a target account'),
  allActive: z.boolean().optional().describe('Every active variant listed on a target account'),
});
const Fields = {
  name: z.string().trim().min(1).max(120), code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'letters, digits, - and _ only'),
  description: z.string().trim().max(1000).nullish(), type: z.enum(schema.PROMOTION_TYPES),
  valueBps: z.number().int().nullish(), valueMinor: z.number().int().nullish(), buyQuantity: z.number().int().nullish(), getQuantity: z.number().int().nullish(),
  minOrderMinor: Minor, budgetMinor: Minor, startsAt: z.coerce.date().nullish(), endsAt: z.coerce.date().nullish(), accountIds: z.array(z.uuid()).max(50),
};
const CreateBody = z.object({ ...Fields, code: Fields.code.optional(), minOrderMinor: Fields.minOrderMinor.optional(), budgetMinor: Fields.budgetMinor.optional(), accountIds: Fields.accountIds.optional(), selection: Selection.optional() });
const PatchBody = z.object({ ...Fields, version: z.number().int().describe('The campaign version you read (409 VERSION_CONFLICT when stale)') }).partial().required({ version: true });
const VersionBody = z.object({ version: z.number().int().optional().describe('Optional lock: refused with 409 when the campaign changed since you read it') });
const SetResult = z.object({ total: z.number().int(), added: z.number().int(), removed: z.number().int(), skipped: z.array(z.object({ variantId: z.string(), reason: z.string() })), droppedNoListing: z.number().int() });
const ProductCounts = z.object({ all: z.number().int(), eligible: z.number().int(), pending_sync: z.number().int(), live: z.number().int(), ineligible: z.number().int(), ended: z.number().int() });
const ProductList = z.object({ items: z.array(ItemSchema), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(), counts: ProductCounts });
const Pushed = z.array(z.object({ accountId: z.string(), skipped: z.string().optional() })).describe('Price pushes queued; `skipped` when the connector cannot take prices');

/** Promotions: discount campaigns applied as scheduled sale prices through the pricing module, with results from real orders. */
export const promotionRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  /** one request = one transaction; price pushes are queued only after it commits */
  async function run<T>(req: FastifyRequest, fn: (tx: Tx, ctx: OpCtx, work: SyncWork) => Promise<T>): Promise<{ out: T; pushed: Awaited<ReturnType<SyncWork['flush']>> }> {
    const vendorId = requireVendor(req);
    const work = new SyncWork();
    const ctx = opCtxFromRequest(req, vendorId);
    const out = await vendorTx(req, (tx) => fn(tx, ctx, work));
    return { out, pushed: await work.flush(req.server.container, vendorId) };
  }
  /** the campaign as the screen shows it (counts, channels, end reason) */
  const present = async (tx: Tx, vendorId: string, rows: CampaignRow[]) => {
    const [accounts, counts, reasons] = await Promise.all([vendorAccounts(tx, vendorId), itemCounts(tx, vendorId, rows.map((c) => c.id)), endReasons(tx, vendorId, rows.filter((c) => c.status === 'ended' || c.status === 'cancelled').map((c) => c.id))]);
    return rows.map((c) => campaignDto(c, accounts, counts.get(c.id), reasons.get(c.id) ?? null));
  };

  r.get('/promotions/overview', {
    config: { access: { permission: 'promotions:read' } },
    schema: {
      tags: TAGS, summary: 'Tiles of the Promotions page',
      description: 'Active and scheduled campaigns, revenue, discount spend against budget and units moved (cached results of campaigns that ran). `velocityLiftBps` compares the promoted variants\' sales rate during their campaigns with the 14 days before each; null when no campaign ran a full day with at least 5 baseline units.',
      response: { 200: successEnvelope(z.object({
        currency: z.string(), activeCampaigns: z.number().int(), scheduledCampaigns: z.number().int(), draftCampaigns: z.number().int(), endedCampaigns: z.number().int(),
        revenueMinor: z.number().int(), spendMinor: z.number().int(), budgetMinor: z.number().int(), budgetUsedBps: z.number().int().nullable(), unitsMoved: z.number().int(),
        velocityLiftBps: z.number().int().nullable(), velocityCampaigns: z.number().int(), statsUpdatedAt: IsoDate.nullable(),
      }).meta({ id: 'PromotionOverview' })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => overview(tx, vendorId, new Date()))));

  r.get('/promotions/campaigns', {
    config: { access: { permission: 'promotions:read' } },
    schema: {
      tags: TAGS, summary: 'Campaign ledger', description: '`counts` are per status for the tabs (they follow `q` and `filter[type]`, not the status filter).',
      querystring: PageQuerySchema.extend({ 'filter[status]': z.enum(schema.PROMOTION_STATUSES).optional(), 'filter[type]': z.enum(schema.PROMOTION_TYPES).optional(), q: z.string().trim().min(1).max(100).optional() }),
      response: { 200: successEnvelope(z.object({ items: z.array(CampaignSchema), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(), counts: z.record(z.string(), z.number().int()) })) },
    },
  }, async (req) => {
    const q = req.query;
    const out = await vendorTx(req, async (tx, vendorId) => {
      const l = await listCampaigns(tx, vendorId, { status: q['filter[status]'], type: q['filter[type]'], q: q.q }, pageWindow(q));
      return { items: await present(tx, vendorId, l.rows), total: l.total, counts: l.counts };
    });
    return ok(req, { items: out.items, page: q.page, pageSize: q.pageSize, total: out.total, pages: Math.max(1, Math.ceil(out.total / q.pageSize)), counts: out.counts });
  });

  r.post('/promotions/campaigns', {
    config: { access: { permission: 'promotions:write' } },
    schema: {
      tags: TAGS, summary: 'Create a draft campaign',
      description: 'Terms by type: percentage_discount needs `valueBps` (1-9500), flat_discount `valueMinor`, bogo `buyQuantity` + `getQuantity`, bundle `valueBps` + `buyQuantity` (2-10 items). A marketplace takes one price per listing, so bogo and bundle are applied as their effective unit price. `code` is generated when omitted (unique ignoring case, 409 `duplicate_code`). `selection` adds products: variants, categories (with sub-categories) or all active products that are listed on a target account. `accountIds` empty = every connected account.',
      body: CreateBody, response: { 201: successEnvelope(z.object({ campaign: CampaignSchema, products: SetResult.nullable() })) },
    },
  }, async (req, reply) => {
    const { selection, ...input } = req.body;
    const { out } = await run(req, async (tx, ctx) => {
      const res = await createCampaign(tx, ctx, input, selection, new Date());
      return { products: res.items, campaign: (await present(tx, ctx.vendorId, [res.row]))[0]! };
    });
    return created(req, reply, out, `/api/v1/promotions/campaigns/${out.campaign.id}`);
  });

  r.get('/promotions/campaigns/:id', {
    config: { access: { permission: 'promotions:read' } },
    schema: { tags: TAGS, summary: 'One campaign with its results and velocity lift', params: IdParamSchema, response: { 200: successEnvelope(CampaignDetailSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const { row, velocity } = await campaignDetail(tx, vendorId, req.params.id, new Date());
    return { ...(await present(tx, vendorId, [row]))[0]!, velocity };
  })));

  r.patch('/promotions/campaigns/:id', {
    config: { access: { permission: 'promotions:write' } },
    schema: { tags: TAGS, summary: 'Edit a draft campaign', description: 'Draft only (409 `campaign_not_editable`). `version` is required. Prices, accounts and dates re-check every product.', params: IdParamSchema, body: PatchBody, response: { 200: successEnvelope(CampaignSchema) } },
  }, async (req) => {
    const { out } = await run(req, async (tx, ctx) => (await present(tx, ctx.vendorId, [await updateCampaign(tx, ctx, req.params.id, req.body, new Date())]))[0]!);
    return ok(req, out);
  });

  r.delete('/promotions/campaigns/:id', {
    config: { access: { permission: 'promotions:write' } },
    schema: { tags: TAGS, summary: 'Delete a draft campaign', params: IdParamSchema, querystring: z.object({ version: z.coerce.number().int().optional() }), response: { 200: successEnvelope(z.object({ id: z.string() })) } },
  }, async (req) => {
    await run(req, (tx, ctx) => deleteCampaign(tx, ctx, req.params.id, req.query.version));
    return ok(req, { id: req.params.id });
  });

  const lifecycle = (action: Action, summary: string, description: string) => r.post(`/promotions/campaigns/:id/${action}`, {
    config: { access: { permission: 'promotions:write' } },
    schema: { tags: TAGS, summary, description: `${description} Repeating the call on a campaign that is already there changes nothing (\`changed: false\`). A wrong state is 409 \`invalid_transition\`.`, params: IdParamSchema, body: VersionBody.optional(), response: { 200: successEnvelope(z.object({ campaign: CampaignSchema, changed: z.boolean(), pushed: Pushed })) } },
  }, async (req) => {
    const { out, pushed } = await run(req, async (tx, ctx, work) => {
      const res = await transition(tx, ctx, work, req.params.id, action, { version: req.body?.version });
      return { campaign: (await present(tx, ctx.vendorId, [res.row]))[0]!, changed: res.changed };
    });
    return ok(req, { ...out, pushed });
  });
  lifecycle('schedule', 'Schedule a draft campaign', 'Needs a start, an end in the future and at least one eligible product. The sale prices are put on the marketplace prices with the campaign window and start by themselves. A start that has already passed activates it right away.');
  lifecycle('activate', 'Start a campaign now', 'The window starts now. 409 `no_eligible_items` when no product can run (the product list says why).');
  lifecycle('end', 'End a running campaign', 'Removes the sale prices, freezes the results and ends the campaign (`ended_manually`).');
  lifecycle('cancel', 'Cancel a draft or scheduled campaign', 'Removes any scheduled sale prices.');

  r.post('/promotions/campaigns/:id/duplicate', {
    config: { access: { permission: 'promotions:write' } },
    schema: { tags: TAGS, summary: 'Copy a campaign as a new draft', description: 'Same terms, accounts and products (re-priced and re-checked); no dates, no results; the code becomes `<CODE>-COPY`.', params: IdParamSchema, response: { 201: successEnvelope(CampaignSchema) } },
  }, async (req, reply) => {
    const { out } = await run(req, async (tx, ctx) => (await present(tx, ctx.vendorId, [await duplicateCampaign(tx, ctx, req.params.id, new Date())]))[0]!);
    return created(req, reply, out, `/api/v1/promotions/campaigns/${out.id}`);
  });

  r.post('/promotions/campaigns/:id/evaluate', {
    config: { access: { permission: 'promotions:write' } },
    schema: { tags: TAGS, summary: 'Re-check every product of a campaign', description: 'Re-reads prices, listings, cost, margin floors, other campaigns and existing sales and stores the result on the products. Scheduling and activating do this too.', params: IdParamSchema, response: { 200: successEnvelope(z.object({ campaign: CampaignSchema })) } },
  }, async (req) => {
    const { out } = await run(req, async (tx, ctx) => {
      const c = await loadCampaign(tx, ctx.vendorId, req.params.id, true);
      if (c.status === 'draft') await evaluateItems(tx, ctx, c, new Date());
      return { campaign: (await present(tx, ctx.vendorId, [c]))[0]! };
    });
    return ok(req, out);
  });

  r.get('/promotions/campaigns/:id/products', {
    config: { access: { permission: 'promotions:read' } },
    schema: {
      tags: TAGS, summary: 'Products of a campaign', params: IdParamSchema,
      querystring: PageQuerySchema.extend({ 'filter[status]': z.enum(schema.PROMOTION_ITEM_STATUSES).optional(), q: z.string().trim().min(1).max(100).optional() }),
      response: { 200: successEnvelope(ProductList) },
    },
  }, async (req) => {
    const q = req.query;
    const out = await vendorTx(req, async (tx, vendorId) => {
      await loadCampaign(tx, vendorId, req.params.id);
      const l = await listPromotedProducts(tx, vendorId, { campaignId: req.params.id, status: q['filter[status]'], q: q.q }, pageWindow(q));
      const accounts = await vendorAccounts(tx, vendorId);
      return { items: l.rows.map((x) => itemDto(x, accounts)), total: l.total, counts: l.counts };
    });
    return ok(req, { items: out.items, page: q.page, pageSize: q.pageSize, total: out.total, pages: Math.max(1, Math.ceil(out.total / q.pageSize)), counts: out.counts as z.infer<typeof ProductCounts> });
  });

  r.put('/promotions/campaigns/:id/products', {
    config: { access: { permission: 'promotions:write' } },
    schema: {
      tags: TAGS, summary: 'Set the products of a draft campaign',
      description: '`mode: replace` (default) makes the selection the whole set; `add` keeps the current products. Unknown or price-less variants come back in `skipped`; categories and "all active" drop variants that are not listed on a target account (`droppedNoListing`). At most 5000 products. Draft only.',
      params: IdParamSchema, body: Selection.extend({ mode: z.enum(['replace', 'add']).default('replace') }), response: { 200: successEnvelope(SetResult) },
    },
  }, async (req) => {
    const { mode, ...sel } = req.body;
    const { out } = await run(req, async (tx, ctx) => {
      const c = await loadCampaign(tx, ctx.vendorId, req.params.id, true);
      assertDraft(c);
      const res = await setItems(tx, ctx, c, sel, mode, new Date());
      await effects(tx, ctx).audit({ action: 'promotion.products_changed', resourceType: 'promotion_campaign', resourceId: c.id, after: { mode, total: res.total, added: res.added, removed: res.removed } });
      return res;
    });
    return ok(req, out);
  });

  r.delete('/promotions/campaigns/:id/products', {
    config: { access: { permission: 'promotions:write' } },
    schema: { tags: TAGS, summary: 'Remove products from a draft campaign', params: IdParamSchema, querystring: z.object({ variantIds: z.string().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.uuid()).min(1).max(200)).describe('Comma separated variant ids') }), response: { 200: successEnvelope(z.object({ removed: z.number().int(), total: z.number().int() })) } },
  }, async (req) => {
    const { out } = await run(req, async (tx, ctx) => {
      const c = await loadCampaign(tx, ctx.vendorId, req.params.id, true);
      assertDraft(c);
      const removed = await removeItems(tx, ctx.vendorId, c.id, req.query.variantIds);
      return { removed, total: (await loadItems(tx, ctx.vendorId, c.id)).length };
    });
    return ok(req, out);
  });

  r.get('/promotions/products', {
    config: { access: { permission: 'promotions:read' } },
    schema: {
      tags: TAGS, summary: 'Promoted SKUs across campaigns',
      description: 'Original and promotional price, status (eligible, pending_sync, live, ineligible with the reason) and the channels of every campaign product. Finished items are hidden unless `filter[status]=ended`. `counts` follow the other filters, not the status filter.',
      querystring: PageQuerySchema.extend({ 'filter[status]': z.enum(schema.PROMOTION_ITEM_STATUSES).optional(), 'filter[campaignId]': z.uuid().optional(), 'filter[accountId]': z.uuid().optional(), q: z.string().trim().min(1).max(100).optional() }),
      response: { 200: successEnvelope(ProductList) },
    },
  }, async (req) => {
    const q = req.query;
    const out = await vendorTx(req, async (tx, vendorId) => {
      const l = await listPromotedProducts(tx, vendorId, { status: q['filter[status]'], campaignId: q['filter[campaignId]'], accountId: q['filter[accountId]'], q: q.q }, pageWindow(q));
      const accounts = await vendorAccounts(tx, vendorId);
      return { items: l.rows.map((x) => itemDto(x, accounts)), total: l.total, counts: l.counts };
    });
    return ok(req, { items: out.items, page: q.page, pageSize: q.pageSize, total: out.total, pages: Math.max(1, Math.ceil(out.total / q.pageSize)), counts: out.counts as z.infer<typeof ProductCounts> });
  });

  r.post('/promotions/process', {
    config: { access: { permission: 'promotions:write' } },
    schema: { tags: TAGS, summary: 'Run the campaign scheduler now', description: 'Normally done every minute by the scheduler: starts due campaigns, ends finished ones (or those whose budget is used up) and refreshes results. Safe to repeat.', response: { 200: successEnvelope(z.object({ activated: z.number().int(), ended: z.number().int(), refreshed: z.number().int() })) } },
  }, async (req) => ok(req, await tick(req.server.container)));
};

function assertDraft(c: CampaignRow): void {
  if (!isEditable(c.status as Status)) throw Errors.conflict('Only a draft campaign can change its products', { rule: 'campaign_not_editable', status: c.status });
}

