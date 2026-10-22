import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { type Tx } from '@oms/database';
import { IdParamSchema, PageQuerySchema, successEnvelope } from '@oms/contracts';
import { AppError } from '@oms/shared';
import { ok, opCtxFromRequest, pageWindow, requireVendor, vendorTx, type OpCtx } from '@oms/module-kit';
import { FULFILLMENT_ACTIONS, Work, fulfillmentWorkspace } from '@oms/mod-fulfillment';
import { allowedWarehouses, assertWarehouseCapability } from '@oms/mod-warehouses';
import { SHIPMENT_STATUSES } from './domain';
import { GROUP_KEYS, bulkLabels, carriers, getShipmentRow, listShipmentRows, summary } from './screen';
import { MAX_BATCH, applyInTx, applyReady, batchCandidates, handoverGroup, planAction, type ActionDeps, type ActionInput, type BatchError } from './fulfillment-actions';

const Loose = z.looseObject({});
const Counts = z.object({ all: z.number().int(), pre_dispatch: z.number().int(), in_transit: z.number().int(), delivered: z.number().int(), ndr: z.number().int(), rto: z.number().int(), cancelled: z.number().int() });
const Dims = { weightGrams: z.number().int().min(1).max(1_000_000), lengthMm: z.number().int().min(1).max(100_000).optional(), widthMm: z.number().int().min(1).max(100_000).optional(), heightMm: z.number().int().min(1).max(100_000).optional(), boxType: z.string().max(60).optional() };
const Bool = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Shipping and fulfillment screen read models and the one-click fulfillment actions. */
export function registerScreenRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const ctxOf = (req: FastifyRequest): OpCtx => opCtxFromRequest(req, requireVendor(req));
  const allowed = (req: FastifyRequest, tx: Tx, vendorId: string) => allowedWarehouses(tx, req.ctx.principal, vendorId);
  const depsOf = (req: FastifyRequest, tx: Tx, ctx: OpCtx, scope: string[] | null): ActionDeps => ({ ctx, allowed: scope, can: (t, wh, cap) => assertWarehouseCapability(t, req.ctx.principal, ctx.vendorId, wh, cap) });

  r.get('/shipping/summary', {
    config: { access: { permission: 'shipping:read' } },
    schema: {
      tags: ['Shipping'], summary: 'Carrier ribbon of the shipping screen',
      description: 'Per carrier: AWBs issued, on-time % (delivered on or before the courier ETA; null without a sample), in transit, delivered, NDR, RTO and average delivery days (dispatch to delivery; null when nothing was delivered). `exceptions` counts shipments stuck right now (failed delivery attempts, parcels coming back). Window = shipments created in the last `days`.',
      querystring: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), response: { 200: successEnvelope(Loose) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => summary(tx, vendorId, await allowed(req, tx, vendorId), req.query.days))));

  r.get('/shipping/shipments', {
    config: { access: { permission: 'shipping:read' } },
    schema: {
      tags: ['Shipping'], summary: 'Shipments table of the shipping screen',
      description: 'Carrier, AWB, order, destination, payment, status with the last tracking event, ETA and whether a label can be printed. `filter[group]` = pre_dispatch | in_transit | delivered | ndr | rto | cancelled; `counts` use the same filters except the group.',
      querystring: PageQuerySchema.extend({
        q: z.string().trim().max(100).optional(), 'filter[carrier]': z.string().trim().min(1).max(80).optional(), 'filter[status]': z.enum(SHIPMENT_STATUSES).optional(), 'filter[group]': z.enum(GROUP_KEYS as [string, ...string[]]).optional(),
        'filter[warehouseId]': z.uuid().optional(), 'filter[payment]': z.enum(['cod', 'prepaid']).optional(), 'filter[labelAvailable]': Bool.optional(), 'filter[from]': z.coerce.date().optional(), 'filter[to]': z.coerce.date().optional(),
      }),
      response: { 200: successEnvelope(z.object({ items: z.array(Loose), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(), counts: Counts })) },
    },
  }, async (req) => {
    const w = pageWindow(req.query);
    const q = req.query;
    const res = await vendorTx(req, async (tx, vendorId) => listShipmentRows(tx, vendorId, await allowed(req, tx, vendorId), {
      page: q.page, pageSize: w.limit,
      filter: { q: q.q, carrier: q['filter[carrier]'], status: q['filter[status]'], group: q['filter[group]'] as never, warehouseId: q['filter[warehouseId]'], payment: q['filter[payment]'], labelAvailable: q['filter[labelAvailable]'], from: q['filter[from]'], to: q['filter[to]'] },
    }));
    return ok(req, { items: res.items, page: q.page, pageSize: q.pageSize, total: res.total, pages: Math.max(1, Math.ceil(res.total / q.pageSize)), counts: res.counts });
  });

  r.get('/shipping/shipments/:id', {
    config: { access: { permission: 'shipping:read' } },
    schema: {
      tags: ['Shipping'], summary: 'One shipment as a row of the shipments table',
      description: 'The same fields as an item of GET /shipping/shipments (carrier, AWB, order, destination, payment, status, last tracking event, ETA, label), found by id, so a shipment can be opened from a link, a reload or another screen. 404 outside the warehouses of the caller.',
      params: IdParamSchema, response: { 200: successEnvelope(Loose) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => getShipmentRow(tx, vendorId, await allowed(req, tx, vendorId), req.params.id))));

  r.get('/shipping/carriers', {
    config: { access: { permission: 'shipping:read' } },
    schema: { tags: ['Shipping'], summary: 'Configured carriers with status', description: 'Every configured shipping method / provider with its status (active, needs_configuration, disabled), capabilities and usage in the last 30 days, plus the providers that can still be added.', response: { 200: successEnvelope(Loose) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => carriers(tx, req.server.container, vendorId, await allowed(req, tx, vendorId)))));

  r.post('/shipping/labels/bulk', {
    config: { access: { permission: 'shipping:write' } },
    schema: {
      tags: ['Shipping'], summary: 'Print labels of several shipments',
      description: 'Up to 100 shipments, one result each (partial success inside HTTP 200). Text labels are merged into one printable PDF (`combined.content`, base64, 4x6 in pages); labels a courier delivers as a PDF are listed by url only. Cancelled shipments and shipments without a label are reported per item.',
      body: z.object({ shipmentIds: z.array(z.uuid()).min(1).max(100), combine: z.boolean().default(true) }), response: { 200: successEnvelope(Loose) },
    },
  }, async (req) => {
    const ctx = ctxOf(req);
    return ok(req, await vendorTx(req, async (tx, vendorId) => bulkLabels(tx, ctx, await allowed(req, tx, vendorId), { shipmentIds: req.body.shipmentIds, combine: req.body.combine })));
  });

  // ------------------------------------------------------------ one-click fulfillment actions
  r.post('/fulfillment/:orderId/actions', {
    config: { access: { permission: 'fulfillment:write' } },
    schema: {
      tags: ['Fulfillment'], summary: 'Run a fulfillment action on an order',
      description: '`start` (route the order, or start picking when routed), `pick_all`, `pack` (needs `weightGrams`), `ready` (books the label), `handover` (to the courier), `exception` (needs `kind`). It validates like the individual endpoints: picking and closing a package need prior barcode scans or `override: true` (a manual, audited step); a disallowed action is 409 `action_not_available` with the reason shown on the screen. Repeating a finished action answers 200 with `applied: false`. When the order ships from several warehouses send `fulfillmentId`.',
      params: z.object({ orderId: z.uuid() }),
      body: z.object({
        action: z.enum(FULFILLMENT_ACTIONS), fulfillmentId: z.uuid().optional(), override: z.boolean().optional(), weightGrams: Dims.weightGrams.optional(), lengthMm: Dims.lengthMm, widthMm: Dims.widthMm, heightMm: Dims.heightMm, boxType: Dims.boxType,
        providerCode: z.string().max(40).optional(), packageBarcodes: z.array(z.string().min(1).max(100)).max(200).optional(), kind: z.enum(['damaged', 'wrong_item', 'pack_issue', 'insufficient_stock', 'address_issue', 'other']).optional(), note: z.string().max(300).optional(),
      }),
      response: { 200: successEnvelope(Loose) },
    },
  }, async (req) => {
    const ctx = ctxOf(req);
    const input: ActionInput = { ...req.body, orderId: req.params.orderId };
    const plan = await vendorTx(req, async (tx, vendorId) => { const scope = await allowed(req, tx, vendorId); return { scope, plan: await planAction(tx, depsOf(req, tx, ctx, scope), input) }; });
    const fresh = (fid: string | undefined) => vendorTx(req, async (tx, vendorId) => fulfillmentWorkspace(tx, vendorId, await allowed(req, tx, vendorId), req.params.orderId, fid));
    if (plan.plan.done) return ok(req, { action: input.action, applied: false, alreadyDone: true, fulfillmentId: plan.plan.fid, result: {}, workspace: await fresh(plan.plan.fid ?? undefined) });
    let result: Record<string, unknown>;
    if (input.action === 'ready') {
      let deps: ActionDeps | null = null;
      await vendorTx(req, async (tx) => { deps = depsOf(req, tx, ctx, plan.scope); const f = plan.plan.ws.fulfillments.find((x) => x.id === plan.plan.fid)!; await deps.can(tx, f.warehouse.id, 'dispatch'); });
      result = await applyReady(deps!, input, plan.plan.fid!);
    } else {
      const w = new Work();
      result = await vendorTx(req, (tx) => applyInTx(tx, depsOf(req, tx, ctx, plan.scope), w, input, plan.plan.fid));
      await w.flush(req.server.container);
    }
    const ws = await fresh(plan.plan.fid ?? undefined).catch(() => fresh(undefined));
    return ok(req, { action: input.action, applied: true, alreadyDone: false, fulfillmentId: ws.fulfillment?.id ?? plan.plan.fid, result, workspace: ws });
  });

  r.post('/fulfillment/batch-handover', {
    config: { access: { permission: 'shipping:write' } },
    schema: {
      tags: ['Fulfillment'], summary: 'Hand a batch of orders over to one carrier (manifest)',
      description: `Up to ${MAX_BATCH} orders whose shipments have a label. Per warehouse and provider one manifest is created, closed and dispatched (all or nothing for that manifest); orders that cannot go (no shipment, other carrier, label not ready) are reported per order and the rest still go. \`carrier\` is the carrier name or provider code.`,
      body: z.object({ carrier: z.string().trim().min(1).max(80), orderIds: z.array(z.uuid()).min(1).max(MAX_BATCH) }), response: { 200: successEnvelope(Loose) },
    },
  }, async (req) => {
    const ctx = ctxOf(req);
    const ids = [...new Set(req.body.orderIds)];
    const cands = await vendorTx(req, async (tx, vendorId) => batchCandidates(tx, vendorId, await allowed(req, tx, vendorId), req.body.carrier, ids));
    const results = new Map<string, { orderId: string; orderNumber: string | null; shipmentId: string | null; ok: boolean; manifestId: string | null; error: { code: BatchError; message: string } | null }>();
    const TEXT: Record<BatchError, string> = { order_not_found: 'Order not found', no_shipment: 'The order has no shipment', carrier_mismatch: 'The shipment belongs to another carrier', not_label_ready: 'The shipment has no label ready for hand-over (already on a manifest or dispatched)', manifest_failed: 'The manifest could not be dispatched' };
    const groups = new Map<string, { warehouseId: string; providerCode: string; shipmentIds: string[]; orderIds: string[] }>();
    for (const c of cands) {
      if (c.error) { results.set(c.orderId, { orderId: c.orderId, orderNumber: c.orderNumber, shipmentId: null, ok: false, manifestId: null, error: { code: c.error, message: TEXT[c.error] } }); continue; }
      const s = c.shipment!; const key = `${s.warehouseId}:${s.providerCode}`;
      const g = groups.get(key) ?? { warehouseId: s.warehouseId, providerCode: s.providerCode, shipmentIds: [], orderIds: [] };
      g.shipmentIds.push(s.id); g.orderIds.push(c.orderId); groups.set(key, g);
    }
    const manifests: Array<Awaited<ReturnType<typeof handoverGroup>>> = [];
    for (const g of groups.values()) {
      const w = new Work();
      try {
        const m = await vendorTx(req, async (tx) => { await assertWarehouseCapability(tx, req.ctx.principal, ctx.vendorId, g.warehouseId, 'dispatch'); return handoverGroup(tx, ctx, w, g); });
        await w.flush(req.server.container);
        manifests.push(m);
        g.orderIds.forEach((orderId, i) => { const c = cands.find((x) => x.orderId === orderId)!; results.set(orderId, { orderId, orderNumber: c.orderNumber, shipmentId: g.shipmentIds[i]!, ok: true, manifestId: m.id, error: null }); });
      } catch (e) {
        const message = e instanceof AppError ? e.message : TEXT.manifest_failed;
        g.orderIds.forEach((orderId, i) => { const c = cands.find((x) => x.orderId === orderId)!; results.set(orderId, { orderId, orderNumber: c.orderNumber, shipmentId: g.shipmentIds[i]!, ok: false, manifestId: null, error: { code: 'manifest_failed', message } }); });
      }
    }
    const out = ids.map((id) => results.get(id)!);
    return ok(req, { carrier: req.body.carrier, manifests, results: out, summary: { requested: ids.length, handedOver: out.filter((x) => x.ok).length, failed: out.filter((x) => !x.ok).length } });
  });
}
