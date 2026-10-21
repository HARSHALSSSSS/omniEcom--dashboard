import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IdParamSchema, PageQuerySchema, successEnvelope } from '@oms/contracts';
import { created, ok, pageWindow, vendorTx } from '@oms/module-kit';
import { actorOf, fxFor, pagedWith } from './http';
import { createPurchaseOrder, deleteDraft, duplicatePurchaseOrder, getPurchaseOrderDetail, listPurchaseOrders, updatePurchaseOrder } from './orders';
import { acknowledgePurchaseOrder, approvePurchaseOrder, cancelPurchaseOrder, receivePurchaseOrder } from './lifecycle';
import { procurementOverview, purchaseOrdersFromSuggestions, reorderSuggestions } from './overview';
import {
  AcknowledgeBody, ApproveBody, CancelBody, CancelResultSchema, Day2Date, FromSuggestionsBody, FromSuggestionsResultSchema, OverviewSchema, PoCreateBody, PoListQuery, PoSchema, PoSummarySchema, PoUpdateBody,
  ReceiptResultSchema, ReceiveBody, SuggestionSchema, VariantOfferSchema, VariantSearchQuery,
} from './schemas';
import { searchVariantsForPo } from './variant-search';

const PagedPos = successEnvelope(z.object({
  items: z.array(PoSummarySchema), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(),
  counts: z.record(z.string(), z.number().int()).describe('Purchase orders per status (and `all`) for the current filters except the status: the tab badges'),
}));

export const purchaseOrderRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Procurement'];

  r.get('/procurement/overview', {
    config: { access: { permission: 'procurement:read' } },
    schema: { tags: TAGS, summary: 'Procurement tiles', description: 'Open POs, units and value in transit, late and due-this-week POs, real average lead time per supplier (null without deliveries), warehouses and reorder suggestion count.', response: { 200: successEnvelope(OverviewSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => procurementOverview(tx, vendorId))));

  r.get('/procurement/reorder-suggestions', {
    config: { access: { permission: 'procurement:read' } },
    schema: { tags: TAGS, summary: 'Reorder suggestions', description: 'From inventory health (sales velocity, cover), minus what draft and open purchase orders already owe, with the preferred (else cheapest) active supplier.', response: { 200: successEnvelope(z.object({ items: z.array(SuggestionSchema) })) } },
  }, async (req) => ok(req, { items: await vendorTx(req, (tx, vendorId) => reorderSuggestions(tx, vendorId)) }));

  r.get('/procurement/variants', {
    config: { access: { permission: 'procurement:read' } },
    schema: {
      tags: TAGS, summary: 'Find products for a purchase order line',
      description: 'Active variants by SKU, barcode or title with stock position (available, on hand, incoming), the GST rate and, with `filter[supplierId]`, that supplier\'s price, minimum order quantity and lead time (its products first).',
      querystring: PageQuerySchema.extend(VariantSearchQuery.shape),
      response: { 200: successEnvelope(z.object({ items: z.array(VariantOfferSchema), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int() })) },
    },
  }, async (req) => {
    const { page, pageSize, q } = req.query;
    const res = await vendorTx(req, (tx, vendorId) => searchVariantsForPo(tx, vendorId, { ...pageWindow({ page, pageSize }), q, supplierId: req.query['filter[supplierId]'], onlySupplied: req.query['filter[supplied]'] }));
    return pagedWith(req, res.items, { page, pageSize }, res.total, {});
  });

  r.post('/purchase-orders', {
    config: { access: { permission: 'procurement:write' } },
    schema: {
      tags: TAGS, summary: 'Create a draft purchase order',
      description: 'Unit cost defaults to the supplier price list, then the variant cost; tax comes from the variant GST rate; totals are computed here in minor units. Quantities below the supplier minimum order are refused. Number: PO-YYYY-NNNN. A draft does nothing to stock until it is approved.',
      body: PoCreateBody, response: { 201: successEnvelope(PoSchema) },
    },
  }, async (req, reply) => {
    const dto = await vendorTx(req, async (tx, vendorId) => {
      const { row } = await createPurchaseOrder(tx, vendorId, fxFor(tx, req), actorOf(req), req.body);
      return getPurchaseOrderDetail(tx, vendorId, row.id);
    });
    return created(req, reply, dto, `/api/v1/purchase-orders/${dto.id}`);
  });

  r.post('/purchase-orders/from-suggestions', {
    config: { access: { permission: 'procurement:write' } },
    schema: { tags: TAGS, summary: 'Draft purchase orders from reorder suggestions', description: 'One draft per preferred supplier. `dryRun` shows what would be created. Variants without a supplier are listed in `unassigned`.', body: FromSuggestionsBody, response: { 200: successEnvelope(FromSuggestionsResultSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => purchaseOrdersFromSuggestions(tx, vendorId, fxFor(tx, req), actorOf(req), req.body))));

  r.get('/purchase-orders', {
    config: { access: { permission: 'procurement:read' } },
    schema: { tags: TAGS, summary: 'List purchase orders', querystring: PageQuerySchema.extend(PoListQuery.shape), response: { 200: PagedPos } },
  }, async (req) => {
    const { page, pageSize, q, sort } = req.query;
    const from = req.query['filter[orderDateFrom]'];
    const to = req.query['filter[orderDateTo]'];
    const res = await vendorTx(req, (tx, vendorId) => listPurchaseOrders(tx, vendorId, {
      page: pageWindow({ page, pageSize }), q, sort, status: req.query['filter[status]'], supplierId: req.query['filter[supplierId]'], warehouseId: req.query['filter[warehouseId]'],
      from: from ? Day2Date(from) : undefined, to: to ? Day2Date(to, 1) : undefined,
    }));
    return pagedWith(req, res.items, { page, pageSize }, res.total, { counts: res.counts });
  });

  r.get('/purchase-orders/:id', {
    config: { access: { permission: 'procurement:read' } },
    schema: { tags: TAGS, summary: 'Get a purchase order', description: 'Lines, receipts, supplier, warehouse and a timeline built from the audit trail and the receipts.', params: IdParamSchema, response: { 200: successEnvelope(PoSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => getPurchaseOrderDetail(tx, vendorId, req.params.id))));

  r.patch('/purchase-orders/:id', {
    config: { access: { permission: 'procurement:write' } },
    schema: { tags: TAGS, summary: 'Edit a draft purchase order', description: 'Drafts only (409 rule not_draft otherwise). `lines` replaces all lines and re-prices them. Send `version`.', params: IdParamSchema, body: PoUpdateBody, response: { 200: successEnvelope(PoSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    await updatePurchaseOrder(tx, vendorId, fxFor(tx, req), req.params.id, req.body);
    return getPurchaseOrderDetail(tx, vendorId, req.params.id);
  })));

  r.delete('/purchase-orders/:id', {
    config: { access: { permission: 'procurement:write' } },
    schema: { tags: TAGS, summary: 'Delete a draft purchase order', params: IdParamSchema, response: { 200: successEnvelope(z.object({ id: z.string(), deleted: z.literal(true) })) } },
  }, async (req) => {
    await vendorTx(req, (tx, vendorId) => deleteDraft(tx, vendorId, fxFor(tx, req), req.params.id));
    return ok(req, { id: req.params.id, deleted: true as const });
  });

  r.post('/purchase-orders/:id/approve', {
    config: { access: { permission: 'procurement:approve' } },
    schema: { tags: TAGS, summary: 'Approve and submit a purchase order', description: 'draft -> submitted. The ordered units become `incoming` in the receiving warehouse. Administrators only. The expected date defaults to today plus the longest lead time.', params: IdParamSchema, body: ApproveBody, response: { 200: successEnvelope(PoSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    await approvePurchaseOrder(tx, vendorId, fxFor(tx, req), actorOf(req), req.params.id, req.body);
    return getPurchaseOrderDetail(tx, vendorId, req.params.id);
  })));

  r.post('/purchase-orders/:id/acknowledge', {
    config: { access: { permission: 'procurement:write' } },
    schema: { tags: TAGS, summary: 'Record the supplier confirmation', description: 'submitted -> acknowledged, optionally with the date the supplier promised.', params: IdParamSchema, body: AcknowledgeBody, response: { 200: successEnvelope(PoSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    await acknowledgePurchaseOrder(tx, vendorId, fxFor(tx, req), req.params.id, req.body);
    return getPurchaseOrderDetail(tx, vendorId, req.params.id);
  })));

  r.post('/purchase-orders/:id/receive', {
    config: { access: { permission: 'procurement:write' } },
    schema: {
      tags: TAGS, summary: 'Receive goods (a purchase order can be received in several parts)',
      description: '`receivedQuantity` = units that arrived now (good + damaged), `damagedQuantity` = the damaged part. Good units go on hand, damaged units to the damaged bucket, both out of `incoming`. Receiving more than a line still owes is refused (409 rule over_receipt). Partial -> partially_received, complete -> received. Repeating a `receiptKey` returns the first receipt (`duplicate: true`) and moves nothing.',
      params: IdParamSchema, body: ReceiveBody, response: { 200: successEnvelope(ReceiptResultSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const res = await receivePurchaseOrder(tx, vendorId, fxFor(tx, req), actorOf(req), req.params.id, req.body);
    return { purchaseOrder: await getPurchaseOrderDetail(tx, vendorId, req.params.id), receiptId: res.receiptId, duplicate: res.duplicate };
  })));

  r.post('/purchase-orders/:id/cancel', {
    config: { access: { permission: 'procurement:write' } },
    schema: { tags: TAGS, summary: 'Cancel a purchase order', description: 'Needs a reason. Units that never arrived stop being `incoming`; units already received stay in stock.', params: IdParamSchema, body: CancelBody, response: { 200: successEnvelope(CancelResultSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const res = await cancelPurchaseOrder(tx, vendorId, fxFor(tx, req), actorOf(req), req.params.id, req.body);
    return { purchaseOrder: await getPurchaseOrderDetail(tx, vendorId, req.params.id), releasedUnits: res.releasedUnits };
  })));

  r.post('/purchase-orders/:id/duplicate', {
    config: { access: { permission: 'procurement:write' } },
    schema: { tags: TAGS, summary: 'Duplicate a purchase order into a new draft', params: IdParamSchema, response: { 201: successEnvelope(PoSchema) } },
  }, async (req, reply) => {
    const dto = await vendorTx(req, async (tx, vendorId) => {
      const { row } = await duplicatePurchaseOrder(tx, vendorId, fxFor(tx, req), actorOf(req), req.params.id);
      return getPurchaseOrderDetail(tx, vendorId, row.id);
    });
    return created(req, reply, dto, `/api/v1/purchase-orders/${dto.id}`);
  });
};
