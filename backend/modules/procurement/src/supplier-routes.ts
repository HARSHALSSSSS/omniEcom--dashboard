import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IdParamSchema, PageQuerySchema, successEnvelope } from '@oms/contracts';
import { created, ok, pageWindow, vendorTx } from '@oms/module-kit';
import { fxFor, pagedWith } from './http';
import { createSupplier, deleteSupplier, getSupplierDetail, listSuppliers, listSupplierProducts, putSupplierProducts, removeSupplierProduct, toSupplierDto, updateSupplier } from './suppliers';
import { getSupplierRow } from './common';
import { SupplierCreateBody, SupplierDetailSchema, SupplierListQuery, SupplierProductBody, SupplierProductSchema, SupplierSchema, SupplierUpdateBody } from './schemas';

const PagedSuppliers = successEnvelope(z.object({ items: z.array(SupplierSchema), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(), counts: z.record(z.string(), z.number().int()).describe('Suppliers per status for the current search') }));
const PagedProducts = successEnvelope(z.object({ items: z.array(SupplierProductSchema), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int() }));

export const supplierRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Procurement'];

  r.post('/suppliers', {
    config: { access: { permission: 'procurement:write' } },
    schema: { tags: TAGS, summary: 'Create a supplier', description: 'The GSTIN is validated for format. The code is generated (SUP-ABC-01) when omitted and must be unique per business.', body: SupplierCreateBody, response: { 201: successEnvelope(SupplierSchema) } },
  }, async (req, reply) => {
    const dto = await vendorTx(req, async (tx, vendorId) => {
      const row = await createSupplier(tx, vendorId, fxFor(tx, req), req.body);
      return toSupplierDto(row, { delivered: 0, onTime: 0, unitsReceived: 0, unitsDamaged: 0, activeSkus: 0, openPurchaseOrders: 0, averageLeadTimeDays: null });
    });
    return created(req, reply, dto, `/api/v1/suppliers/${dto.id}`);
  });

  r.get('/suppliers', {
    config: { access: { permission: 'procurement:read' } },
    schema: {
      tags: TAGS, summary: 'List suppliers', description: 'Each row carries its scorecard derived from real receipts: on-time rate and rating are null until 3 purchase orders were fully received.',
      querystring: PageQuerySchema.extend(SupplierListQuery.shape), response: { 200: PagedSuppliers },
    },
  }, async (req) => {
    const { page, pageSize, q, sort } = req.query;
    const res = await vendorTx(req, (tx, vendorId) => listSuppliers(tx, vendorId, { page: pageWindow({ page, pageSize }), q, sort, status: req.query['filter[status]'] }));
    return pagedWith(req, res.items, { page, pageSize }, res.total, { counts: res.counts });
  });

  r.get('/suppliers/:id', {
    config: { access: { permission: 'procurement:read' } },
    schema: { tags: TAGS, summary: 'Get a supplier with its products and recent purchase orders', params: IdParamSchema, response: { 200: successEnvelope(SupplierDetailSchema) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => getSupplierDetail(tx, vendorId, req.params.id))));

  r.patch('/suppliers/:id', {
    config: { access: { permission: 'procurement:write' } },
    schema: { tags: TAGS, summary: 'Update a supplier', description: 'Send `version` for optimistic concurrency. `status`: active | inactive | blocked (inactive and blocked suppliers cannot get new purchase orders).', params: IdParamSchema, body: SupplierUpdateBody, response: { 200: successEnvelope(SupplierDetailSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    await updateSupplier(tx, vendorId, fxFor(tx, req), req.params.id, req.body);
    return getSupplierDetail(tx, vendorId, req.params.id);
  })));

  r.delete('/suppliers/:id', {
    config: { access: { permission: 'procurement:write' } },
    schema: { tags: TAGS, summary: 'Delete a supplier (soft)', description: 'Refused (409, rule has_open_purchase_orders) while the supplier has a draft or open purchase order.', params: IdParamSchema, response: { 200: successEnvelope(z.object({ id: z.string(), deleted: z.literal(true) })) } },
  }, async (req) => {
    await vendorTx(req, (tx, vendorId) => deleteSupplier(tx, vendorId, fxFor(tx, req), req.params.id));
    return ok(req, { id: req.params.id, deleted: true as const });
  });

  r.get('/suppliers/:id/products', {
    config: { access: { permission: 'procurement:read' } },
    schema: { tags: TAGS, summary: 'The supplier price list', querystring: PageQuerySchema.extend({ q: z.string().trim().min(1).max(200).optional() }), params: IdParamSchema, response: { 200: PagedProducts } },
  }, async (req) => {
    const { page, pageSize, q } = req.query;
    const res = await vendorTx(req, (tx, vendorId) => listSupplierProducts(tx, vendorId, req.params.id, { ...pageWindow({ page, pageSize }), q }));
    return pagedWith(req, res.items, { page, pageSize }, res.total, {});
  });

  r.put('/suppliers/:id/products', {
    config: { access: { permission: 'procurement:write' } },
    schema: {
      tags: TAGS, summary: 'Add or update products on the supplier price list',
      description: 'Upserts the given variants (cost, supplier SKU, lead time, minimum order quantity). `isPreferred` makes this supplier the preferred one for the variant and clears it on the others.',
      params: IdParamSchema, body: SupplierProductBody, response: { 200: PagedProducts },
    },
  }, async (req) => {
    const res = await vendorTx(req, async (tx, vendorId) => {
      await getSupplierRow(tx, vendorId, req.params.id);
      await putSupplierProducts(tx, vendorId, fxFor(tx, req), req.params.id, req.body.items);
      return listSupplierProducts(tx, vendorId, req.params.id, { limit: 100, offset: 0 });
    });
    return pagedWith(req, res.items, { page: 1, pageSize: 100 }, res.total, {});
  });

  r.delete('/suppliers/:id/products/:variantId', {
    config: { access: { permission: 'procurement:write' } },
    schema: { tags: TAGS, summary: 'Remove a product from the supplier price list', params: z.object({ id: z.uuid(), variantId: z.uuid() }), response: { 200: successEnvelope(z.object({ variantId: z.string(), removed: z.literal(true) })) } },
  }, async (req) => {
    await vendorTx(req, (tx, vendorId) => removeSupplierProduct(tx, vendorId, fxFor(tx, req), req.params.id, req.params.variantId));
    return ok(req, { variantId: req.params.variantId, removed: true as const });
  });
};
