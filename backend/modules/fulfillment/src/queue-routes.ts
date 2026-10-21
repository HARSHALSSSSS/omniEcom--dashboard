import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { schema } from '@oms/database';
import { PageQuerySchema, successEnvelope } from '@oms/contracts';
import { ok, pageWindow, vendorTx } from '@oms/module-kit';
import { allowedWarehouses } from '@oms/mod-warehouses';
import { STAGES } from './queue-domain';
import { exceptionsView, listQueue, workspace } from './queue';

const Loose = z.looseObject({});
const Counts = z.object({ awaiting_pick: z.number().int(), picking: z.number().int(), packing: z.number().int(), ready_to_ship: z.number().int(), all: z.number().int(), onHold: z.number().int(), exceptions: z.number().int() });
const pagedWith = <T extends z.ZodType, E extends z.ZodRawShape>(item: T, extra: E) =>
  successEnvelope(z.object({ items: z.array(item), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(), ...extra }));

/** Fulfillment workspace read models: the stage queue, the order drawer and the exceptions list. Writes stay on the existing endpoints. */
export const fulfillmentQueueRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Fulfillment'];

  r.get('/fulfillment/queue', {
    config: { access: { permission: 'fulfillment:read' } },
    schema: {
      tags: TAGS, summary: 'Fulfillment queue (orders by warehouse stage)',
      description: 'Orders in the warehouse by stage (`awaiting_pick`, `picking`, `packing`, `ready_to_ship`; a fulfillment on hold stays in the stage it was held from). Each row carries the SLA label, items with bin, warehouse, assignee, carrier and the next action. `counts` use the same filters except the stage, so the tabs always agree with the list. Users restricted to some warehouses only see those.',
      querystring: PageQuerySchema.extend({
        'filter[stage]': z.enum(STAGES).optional(), 'filter[warehouse]': z.uuid().optional(), 'filter[carrier]': z.string().trim().min(1).max(80).optional(),
        'filter[priority]': z.enum(schema.FULFILLMENT_PRIORITIES).optional(), 'filter[hasException]': z.enum(['true', 'false']).transform((v) => v === 'true').optional(), q: z.string().trim().max(100).optional(),
      }),
      response: { 200: pagedWith(Loose, { counts: Counts }) },
    },
  }, async (req) => {
    const w = pageWindow(req.query);
    const res = await vendorTx(req, async (tx, vendorId) => listQueue(tx, vendorId, await allowedWarehouses(tx, req.ctx.principal, vendorId), {
      page: req.query.page, pageSize: w.limit,
      filter: { stage: req.query['filter[stage]'], warehouseId: req.query['filter[warehouse]'], carrier: req.query['filter[carrier]'], priority: req.query['filter[priority]'], hasException: req.query['filter[hasException]'], q: req.query.q },
    }));
    return ok(req, { items: res.items, page: req.query.page, pageSize: req.query.pageSize, total: res.total, pages: Math.max(1, Math.ceil(res.total / req.query.pageSize)), counts: res.counts });
  });

  r.get('/fulfillment/workspace/:orderId', {
    config: { access: { permission: 'fulfillment:read' } },
    schema: {
      tags: TAGS, summary: 'Order drawer of the fulfillment screen',
      description: 'The order, its fulfillments (several when the order ships from more than one warehouse) and the focused one in detail: items with pick state and bin, packages, shipment, exceptions, history, and `actions[]` (start, pick_all, pack, ready, handover, exception) each with `enabled` / `disabledReason`. Perform an action with `POST /fulfillment/{orderId}/actions`.',
      params: z.object({ orderId: z.uuid() }), querystring: z.object({ fulfillmentId: z.uuid().optional() }), response: { 200: successEnvelope(Loose) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => workspace(tx, vendorId, await allowedWarehouses(tx, req.ctx.principal, vendorId), req.params.orderId, req.query.fulfillmentId))));

  r.get('/fulfillment/exceptions', {
    config: { access: { permission: 'fulfillment:read' } },
    schema: {
      tags: TAGS, summary: 'Exceptions of the fulfillment screen',
      description: 'Pick shortages, damaged / wrong items and other blockers with the order, fulfillment, warehouse, who raised them and how long they have been open. `counts` are over all exceptions of the business (not the filters). Resolve one with `POST /fulfillment-exceptions/{id}/resolve`.',
      querystring: PageQuerySchema.extend({ 'filter[status]': z.enum(schema.EXCEPTION_STATUSES).default('open'), 'filter[kind]': z.enum(schema.EXCEPTION_KINDS).optional(), 'filter[warehouse]': z.uuid().optional(), q: z.string().trim().max(100).optional() }),
      response: { 200: pagedWith(Loose, { counts: z.object({ open: z.number().int(), resolved: z.number().int(), dismissed: z.number().int() }) }) },
    },
  }, async (req) => {
    const w = pageWindow(req.query);
    const res = await vendorTx(req, async (tx, vendorId) => exceptionsView(tx, vendorId, await allowedWarehouses(tx, req.ctx.principal, vendorId), {
      status: req.query['filter[status]'], kind: req.query['filter[kind]'], warehouseId: req.query['filter[warehouse]'], q: req.query.q, page: req.query.page, pageSize: w.limit,
    }));
    return ok(req, { items: res.items, page: req.query.page, pageSize: req.query.pageSize, total: res.total, pages: Math.max(1, Math.ceil(res.total / req.query.pageSize)), counts: res.counts });
  });
};
