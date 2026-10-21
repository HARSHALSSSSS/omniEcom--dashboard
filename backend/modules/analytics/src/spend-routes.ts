import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IdParamSchema, IsoDate, PageQuerySchema, pagedEnvelope, successEnvelope } from '@oms/contracts';
import { AppError } from '@oms/shared';
import { audit, created, ok, pageWindow, paged, requireVendor, vendorTx } from '@oms/module-kit';
import { D, range } from './range';
import { createSpend, deleteSpend, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, importSpend, listSpend, MAX_SPEND_MINOR, spendSummary, updateSpend } from './spend';

const TAGS = ['Analytics'];
const Money = z.number().int();
const Spend = z.object({
  id: z.string(), spendDate: z.string(), accountId: z.string().nullable(), accountName: z.string().nullable(), marketplace: z.string().nullable(), amountMinor: Money, currency: z.string(), campaign: z.string().nullable(),
  source: z.string(), notes: z.string().nullable(), createdAt: IsoDate, updatedAt: IsoDate,
}).meta({ id: 'MarketingSpend' });
const SpendBody = z.object({
  spendDate: D, accountId: z.uuid().nullish().describe('Marketplace account the spend belongs to; empty = not attributable to one marketplace'),
  amountMinor: z.number().int().min(0).max(MAX_SPEND_MINOR).describe('Amount in paise; 0 is allowed (it records "no ads that day")'), campaign: z.string().trim().min(1).max(200).nullish(), notes: z.string().trim().max(500).nullish(),
});

/** Advertising spend entered by hand or imported; it feeds the advertising line of profitability. Writes need `pricing:write`, like the fee profiles. */
export const spendRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  app.addContentTypeParser('text/csv', { parseAs: 'buffer', bodyLimit: IMPORT_MAX_BYTES }, (_req, body, done) => done(null, body));

  r.get('/analytics/marketing-spend', {
    config: { access: { permission: 'analytics:read' } },
    schema: {
      tags: TAGS, summary: 'Marketing spend rows (newest first)', description: 'Filters: date range, account, `unallocated=true` for spend without an account, `q` on campaign / notes. `totalMinor` is not in the page envelope: use `/analytics/marketing-spend/summary` for totals.',
      querystring: PageQuerySchema.extend({ from: D.optional(), to: D.optional(), accountId: z.uuid().optional(), unallocated: z.coerce.boolean().optional(), q: z.string().trim().min(1).max(100).optional() }),
      response: { 200: pagedEnvelope(Spend) },
    },
  }, async (req) => {
    const w = pageWindow(req.query);
    const out = await vendorTx(req, (tx, vendorId) => listSpend(tx, vendorId, { from: req.query.from, to: req.query.to, accountId: req.query.accountId, unallocated: req.query.unallocated, q: req.query.q }, w));
    return paged(req, out.items, req.query, out.total);
  });

  r.get('/analytics/marketing-spend/summary', {
    config: { access: { permission: 'analytics:read' } },
    schema: {
      tags: TAGS, summary: 'Marketing spend totals for a range: by account, by campaign and by day', querystring: z.object({ from: D.optional(), to: D.optional() }),
      response: { 200: successEnvelope(z.object({
        range: z.object({ from: z.string(), to: z.string() }), rows: z.number().int(), totalMinor: Money,
        byAccount: z.array(z.object({ accountId: z.string().nullable(), accountName: z.string().nullable(), marketplace: z.string().nullable(), rows: z.number().int(), amountMinor: Money })),
        byCampaign: z.array(z.object({ campaign: z.string(), rows: z.number().int(), amountMinor: Money })), byDay: z.array(z.object({ day: z.string(), amountMinor: Money })),
      })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => spendSummary(tx, vendorId, range(req.query)))));

  r.post('/analytics/marketing-spend', {
    config: { access: { permission: 'pricing:write' } },
    schema: { tags: TAGS, summary: 'Record advertising spend', body: SpendBody, response: { 201: successEnvelope(Spend) } },
  }, async (req, reply) => {
    const row = await vendorTx(req, async (tx, vendorId) => {
      const x = await createSpend(tx, vendorId, req.body, req.ctx.principal?.actorId ?? null);
      await audit(tx, req, { action: 'analytics.marketing_spend_created', resourceType: 'marketing_spend', resourceId: x.id, after: { spendDate: x.spendDate, accountId: x.accountId, amountMinor: x.amountMinor, campaign: x.campaign } });
      return x;
    });
    return created(req, reply, row, `/api/v1/analytics/marketing-spend/${row.id}`);
  });

  r.patch('/analytics/marketing-spend/:id', {
    config: { access: { permission: 'pricing:write' } },
    schema: { tags: TAGS, summary: 'Correct a spend row', description: 'Omitted fields stay; `accountId: null` makes the row unallocated.', params: IdParamSchema, body: SpendBody.partial(), response: { 200: successEnvelope(Spend) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const { before, after } = await updateSpend(tx, vendorId, req.params.id, req.body);
    await audit(tx, req, { action: 'analytics.marketing_spend_updated', resourceType: 'marketing_spend', resourceId: req.params.id, before: { spendDate: before.spendDate, accountId: before.accountId, amountMinor: before.amountMinor, campaign: before.campaign }, after: { spendDate: after.spendDate, accountId: after.accountId, amountMinor: after.amountMinor, campaign: after.campaign } });
    return after;
  })));

  r.delete('/analytics/marketing-spend/:id', {
    config: { access: { permission: 'pricing:write' } },
    schema: { tags: TAGS, summary: 'Delete a spend row', params: IdParamSchema, response: { 200: successEnvelope(z.object({ id: z.string(), deleted: z.literal(true) })) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const before = await deleteSpend(tx, vendorId, req.params.id);
    await audit(tx, req, { action: 'analytics.marketing_spend_deleted', resourceType: 'marketing_spend', resourceId: before.id, before: { spendDate: before.spendDate, accountId: before.accountId, amountMinor: before.amountMinor, campaign: before.campaign } });
    return { id: before.id, deleted: true as const };
  })));

  r.post('/analytics/marketing-spend/import', {
    config: { access: { permission: 'pricing:write' } },
    schema: {
      tags: TAGS, summary: 'Import advertising spend from a CSV file',
      description: `Body: raw text/csv (max 1 MB, ${IMPORT_MAX_ROWS} rows). Columns: date (YYYY-MM-DD or DD/MM/YYYY), amount (rupees with up to two decimals, or paise with unit=paise), optional account (account id, name, seller id or a marketplace with one account; empty = unallocated), campaign, notes. A row is identified by date + account + campaign: importing the same file again changes nothing and a corrected amount updates the row. Each row stands on its own; dryRun=true reports without saving.`,
      querystring: z.object({ unit: z.enum(['rupees', 'paise']).default('rupees'), dryRun: z.coerce.boolean().default(false) }),
      response: { 200: successEnvelope(z.object({ rows: z.number().int(), created: z.number().int(), updated: z.number().int(), unchanged: z.number().int(), failed: z.number().int(), dryRun: z.boolean(), errors: z.array(z.object({ row: z.number().int(), field: z.string().nullable(), message: z.string() })).describe('First 100 row errors') })) },
    },
  }, async (req) => {
    const vendorId = requireVendor(req);
    const body = req.body as Buffer | undefined;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new AppError('BAD_REQUEST', 'Send the CSV as the request body with Content-Type: text/csv');
    const out = await vendorTx(req, async (tx) => {
      const res = await importSpend(tx, vendorId, body.toString('utf8'), { unit: req.query.unit, dryRun: req.query.dryRun, actorId: req.ctx.principal?.actorId ?? null });
      if (!res.dryRun && res.created + res.updated > 0) await audit(tx, req, { action: 'analytics.marketing_spend_imported', resourceType: 'marketing_spend', resourceId: vendorId, after: { created: res.created, updated: res.updated, failed: res.failed } });
      return res;
    });
    return ok(req, out);
  });
};
