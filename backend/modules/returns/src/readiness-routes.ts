import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IdParamSchema, successEnvelope } from '@oms/contracts';
import { ok, requireVendor, vendorTx } from '@oms/module-kit';
import { insights, nextActionsFor, summary } from './readiness';

const Loose = z.looseObject({});
const Days = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

/** Returns screen read models: KPI tiles, insights and the next steps of one return. */
export const returnsReadinessRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Returns'];

  r.get('/returns/summary', {
    config: { access: { permission: 'returns:read' } },
    schema: {
      tags: TAGS, summary: 'KPI tiles of the returns screen',
      description: 'Return requests (in the window and today), pending inspections (with how many are overdue), return rate (returned orders / orders placed in the window, with the previous window for the change; null without orders), refund exposure (what is still owed on returns that are not rejected or cancelled) and the count per stage. Nothing is compared with an industry average: there is no such data.',
      querystring: Days, response: { 200: successEnvelope(Loose) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => summary(tx, vendorId, req.query.days))));

  r.get('/returns/insights', {
    config: { access: { permission: 'returns:read' } },
    schema: {
      tags: TAGS, summary: 'Why and what comes back',
      description: 'Reasons breakdown, the most returned SKUs (with the return rate against units sold in the same window; null without sales), returns per channel and the trend (daily up to 31 days, weekly beyond; empty periods are zero). Rejected and cancelled requests are not counted.',
      querystring: Days, response: { 200: successEnvelope(Loose) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => insights(tx, vendorId, req.query.days))));

  r.get('/returns/:id/next-actions', {
    config: { access: { permission: 'returns:read' } },
    schema: {
      tags: TAGS, summary: 'The next steps of a return',
      description: 'approve, receive, inspection, disposition, refund, complete in order. Each step says whether it is done, enabled now, why not (`disabledReason`), the endpoint to call, the permission it needs (staff cannot confirm refunds) and the inputs it takes with defaults and options.',
      params: IdParamSchema, response: { 200: successEnvelope(Loose) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx) => nextActionsFor(tx, req.server.container, requireVendor(req), req.params.id))));
};
