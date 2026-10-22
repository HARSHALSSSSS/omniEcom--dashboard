import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { schema, type Tx } from '@oms/database';
import { AppError, Errors } from '@oms/shared';
import { IdParamSchema, IsoDate, PageQuerySchema, successEnvelope } from '@oms/contracts';
import { created, effects, ok, opCtxFromRequest, pageWindow, requireVendor, vendorTx, type OpCtx } from '@oms/module-kit';
import { getFulfillment } from '@oms/mod-fulfillment';
import { allowedWarehouses, assertWarehouseCapability } from '@oms/mod-warehouses';
import { DECISION_STATUSES, MAX_BULK, MAX_EXPORT_ROWS, SLA_BANDS, candidateCount, candidateRows, flagsOfSelection, getCandidate, listDecisions, loadBase, loadOrderInfo, optionsDetail, recalculate, selectMethod, toCsv, toDecisionItem, type DecisionFilter } from './decision';
import { addMethod, capabilityDetail, getMethod, listMethods, patchMethod, verifyMethod, SELLER_PROVIDER } from './methods';
import { createShippingRule, duplicateShippingRule, listShippingRules, patchShippingRule, removeShippingRule, reorderShippingRules, SHIPPING_OPS } from './shipping-rules';
import { createShipment } from './service';
import { COMPARE_WINDOWS, EXCEPTION_KEYS, TRACKING_STATUSES_DERIVED, exceptionsCsv, exceptionsReport, listTracking, overview, refreshOpenShipments, trackingFailures, type ExceptionKey, type TrackingDerived } from './workspace';
import { getShippingSync, latestShippingSync, startShippingSync } from './sync-job';
import { SyncJobSchema, toSyncJobDto } from '@oms/mod-sync';
import { getProvider } from './providers';
import { bookPickupSlot, cancelPickupSlot, listPickupSlots } from './pickup';

/** what an order's shipping decision is about */
const Kind = z.enum(['marketplace', 'seller', 'third_party']);
/** what a configured method is: `custom` is a logistics provider the seller set up (chosen as a third-party method for an order) */
const MethodKindSchema = z.enum(['marketplace', 'seller', 'third_party', 'custom']);
const Cap = z.enum(['supported', 'requires_configuration', 'not_supported']);
const CapSet = z.object({ label: Cap, tracking: Cap, dispatchUpdate: Cap, statusSync: Cap });
const Action = z.object({ key: z.string(), label: z.string(), method: z.enum(['GET', 'POST']), href: z.string(), enabled: z.boolean().optional() });
const Obj = z.record(z.string(), z.unknown());
const Channel = z.object({ code: z.string(), name: z.string() });

const MethodSchema = z.object({
  id: z.string(), kind: MethodKindSchema, name: z.string(), label: z.string(), providerCode: z.string(),
  channel: z.object({ code: z.string().nullable(), name: z.string(), accountId: z.string().nullable(), availability: z.enum(['live', 'coming_soon']) }).nullable(),
  provider: z.object({ code: z.string(), label: z.string() }).nullable(), state: z.enum(['configured', 'requires_configuration', 'disabled']), active: z.boolean(), isDefault: z.boolean(), preferredFor: z.array(z.string()),
  lastSyncAt: IsoDate.nullable(), supportedOrderTypes: z.array(z.string()), capabilities: CapSet, verification: z.object({ state: z.enum(['verified', 'unverified']), verifiedAt: IsoDate.nullable() }),
  config: Obj, version: z.number().int(), createdAt: IsoDate,
}).meta({ id: 'ShippingMethod' });

const AvailableMethod = z.object({ kind: Kind, name: z.string(), available: z.boolean(), reason: z.string().optional() });
const Sla = z.object({ dueAt: IsoDate.nullable(), minutesRemaining: z.number().int().nullable(), band: z.enum(SLA_BANDS) });
const DecisionItem = z.object({
  fulfillmentId: z.string(), fulfillmentNumber: z.string(), orderId: z.string(), number: z.string(), channel: Channel, warehouse: z.object({ id: z.string(), code: z.string(), name: z.string() }), destination: z.object({ city: z.string().nullable(), state: z.string().nullable() }),
  valueMinor: z.number().int(), currency: z.string(), weightGrams: z.number().int().nullable(), itemCount: z.number().int(), availableMethods: z.array(AvailableMethod),
  selectedMethod: z.object({ kind: Kind, name: z.string(), providerId: z.string().nullable() }).nullable(), selectionConfirmed: z.boolean(), selectedBy: z.enum(['rule', 'preference', 'manual']).nullable(),
  recommendedMethod: z.object({ kind: Kind, name: z.string(), why: z.string(), source: z.string() }).nullable(), sla: Sla, status: z.enum(DECISION_STATUSES), shipmentId: z.string().nullable(), action: Action,
  pickup: z.object({ state: z.enum(['not_applicable', 'awaiting', 'booked']), methodId: z.string().nullable(), warehouseId: z.string(), slot: z.object({ id: z.string(), date: z.string(), windowStart: z.string(), windowEnd: z.string(), status: z.string() }).nullable() }).describe('awaiting: a confirmed carrier-collected method with no upcoming pickup slot for this warehouse and method (action book_slot)'),
  secondaryActions: z.array(Action).describe('Other things to do with the row: print_label (labelled), generate_label / enter_awb (method confirmed, no label yet)'),
}).meta({ id: 'ShippingDecisionItem' });
const DecisionList = successEnvelope(z.object({ items: z.array(DecisionItem), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(), counts: z.record(z.string(), z.number().int()) }));

const OptionsSchema = z.object({
  fulfillmentId: z.string(), orderId: z.string(), status: z.enum(DECISION_STATUSES), order: Obj,
  options: z.array(z.object({ kind: Kind, name: z.string(), recommended: z.boolean(), available: z.boolean(), managedBy: z.enum(['marketplace', 'merchant', 'provider']), providerId: z.string().nullable(), providers: z.array(z.object({ id: z.string(), name: z.string() })), selected: z.boolean(), reason: z.string().optional() })),
  recommendation: z.object({ kind: Kind, providerId: z.string().nullable(), name: z.string(), why: z.string(), source: z.string(), ruleId: z.string().nullable() }).nullable(),
  selection: z.object({ kind: Kind, providerId: z.string().nullable(), confirmed: z.boolean(), selectedBy: z.enum(['rule', 'preference', 'manual']).nullable(), confirmedAt: IsoDate.nullable() }).nullable(),
}).meta({ id: 'ShippingOptions' });

const PickupSlotSchema = z.object({
  id: z.string(), warehouse: z.object({ id: z.string(), code: z.string(), name: z.string() }), method: z.object({ id: z.string(), name: z.string(), kind: z.string(), providerCode: z.string() }),
  date: z.string(), windowStart: z.string(), windowEnd: z.string(), parcelCount: z.number().int(), status: z.enum(schema.PICKUP_SLOT_STATUSES), mode: z.enum(['provider', 'manual']), reference: z.string().nullable(), note: z.string().nullable(),
  cancellable: z.boolean(), cancelledAt: IsoDate.nullable(), createdAt: IsoDate,
}).meta({ id: 'ShippingPickupSlot' });

const RuleSchema = z.object({
  id: z.string(), name: z.string(), description: z.string().nullable(), status: z.enum(['enabled', 'disabled']), priority: z.number().int(), lastUpdatedAt: IsoDate, ordersAffected: z.number().int().nullable(),
  conditions: z.array(z.object({ combinator: z.enum(['if', 'and']), field: z.string(), op: z.string(), value: z.unknown() })), then: z.object({ prefer: z.object({ kind: Kind, providerId: z.string().nullable(), label: z.string() }) }), version: z.number().int(),
}).meta({ id: 'ShippingRule' });
const RuleBody = z.object({
  name: z.string().trim().min(2).max(120), description: z.string().max(500).nullish(), enabled: z.boolean().optional(),
  conditions: z.array(z.object({ field: z.string().min(1).max(60), op: z.enum(SHIPPING_OPS), value: z.unknown() })).min(1).max(20),
  then: z.object({ prefer: z.object({ kind: Kind, providerId: z.uuid().nullish() }) }),
});

const pageOf = <T>(items: T[], q: { page: number; pageSize: number }, total: number) => ({ items, page: q.page, pageSize: q.pageSize, total, pages: Math.max(1, Math.ceil(total / q.pageSize)) });

/** The Shipping workspace: methods + capabilities, per-order decision, overview, tracking, exceptions, shipping rules. */
export function registerWorkspaceRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Shipping'];
  const ctxOf = (req: FastifyRequest): OpCtx => opCtxFromRequest(req, requireVendor(req));
  const allowed = (req: FastifyRequest, tx: Tx, vendorId: string) => allowedWarehouses(tx, req.ctx.principal, vendorId);
  const can = (req: FastifyRequest, tx: Tx, warehouseId: string) => assertWarehouseCapability(tx, req.ctx.principal, requireVendor(req), warehouseId, 'dispatch');
  const asOfOf = (v?: string): Date => { if (!v) return new Date(); const d = new Date(v); if (Number.isNaN(d.getTime())) throw Errors.validation({ issues: [{ path: 'asOf', message: 'expected an ISO date or date-time' }] }); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(d.getTime() + 86_400_000 - 1) : d; };

  // ============================================================ methods
  r.get('/shipping/methods', {
    config: { access: { permission: 'shipping:read' } },
    schema: {
      tags: TAGS, summary: 'Shipping methods and the capability matrix', description: 'Marketplace shipping (per connected channel), seller shipping and third-party providers as one list. Capabilities come from the connector / provider catalogue and read `requires_configuration` until the method is verified.',
      response: { 200: successEnvelope(z.object({ items: z.array(MethodSchema), capabilityMatrix: z.array(z.object({ methodId: z.string().nullable(), method: z.enum(['marketplace', 'seller', 'third_party', 'unverified_connector']), name: z.string(), label: Cap, tracking: Cap, dispatchUpdate: Cap, statusSync: Cap })), summary: z.string(), activeMethods: z.number().int() })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => listMethods(tx, req.server.container, vendorId))));

  r.post('/shipping/methods', {
    config: { access: { permission: 'shipping:configure' } },
    schema: {
      tags: TAGS, summary: 'Add a shipping method (Add Provider)', description: 'marketplace: `channelCode` of a connected marketplace (provider code `marketplace:<code>`); seller: merchant-managed shipping; third_party: `providerCode` from the provider catalogue; custom: a logistics provider you configure yourself (`label` = its name, `config.trackingUrlTemplate` = its tracking page with {awb}, optional `awbPrefix`, `awbLength`, `defaultService`, `trackingApiUrl` and the credential `apiKey`, which is stored and never returned). The AWB it issues is entered when the label is created (POST /shipments with `manual.awb`). Created unverified: call POST /shipping/methods/{id}/verify.',
      body: z.object({ kind: MethodKindSchema, providerCode: z.string().min(2).max(40).optional(), channelCode: z.string().min(2).max(40).optional(), label: z.string().max(80).optional(), config: z.record(z.string(), z.unknown()).default({}), supportedOrderTypes: z.array(z.enum(['prepaid', 'cod'])).max(2).optional(), isDefault: z.boolean().optional() }),
      response: { 201: successEnvelope(MethodSchema) },
    },
  }, async (req, reply) => {
    const ctx = ctxOf(req);
    const dto = await vendorTx(req, async (tx, vendorId) => { const row = await addMethod(tx, ctx, req.body); return getMethod(tx, req.server.container, vendorId, row.id); });
    return created(req, reply, dto, `/api/v1/shipping/methods/${dto.id}`);
  });

  r.patch('/shipping/methods/:id', {
    config: { access: { permission: 'shipping:configure' } },
    schema: { tags: TAGS, summary: 'Set as default, disable / enable or configure a method', params: IdParamSchema, body: z.object({ isDefault: z.boolean().optional(), active: z.boolean().optional(), config: z.record(z.string(), z.unknown()).optional(), label: z.string().min(1).max(80).optional(), supportedOrderTypes: z.array(z.enum(['prepaid', 'cod'])).max(2).optional() }), response: { 200: successEnvelope(MethodSchema) } },
  }, async (req) => {
    const ctx = ctxOf(req);
    return ok(req, await vendorTx(req, async (tx, vendorId) => { await patchMethod(tx, ctx, req.params.id, req.body); return getMethod(tx, req.server.container, vendorId, req.params.id); }));
  });

  r.get('/shipping/methods/:id/capabilities', {
    config: { access: { permission: 'shipping:read' } },
    schema: { tags: TAGS, summary: 'View capability of a method', params: IdParamSchema, response: { 200: successEnvelope(z.object({ methodId: z.string(), kind: MethodKindSchema, name: z.string(), verified: z.boolean(), verifiedAt: IsoDate.nullable(), source: z.string(), capabilities: z.array(z.object({ key: z.string(), value: Cap, declared: z.boolean(), note: z.string() })), declared: Obj })) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => capabilityDetail(tx, req.server.container, vendorId, req.params.id))));

  r.post('/shipping/methods/:id/verify', {
    config: { access: { permission: 'shipping:configure' } },
    schema: {
      tags: TAGS, summary: 'Verify a method (safe capability check)', description: 'Checks what the connector / provider declares and what is connected. Nothing is booked and no courier is called. A successful check stores `verified` with the capabilities; until then the method reads `requires_configuration`.',
      params: IdParamSchema, body: z.object({}).default({}),
      response: { 200: successEnvelope(z.object({ ok: z.boolean(), checks: z.array(z.object({ key: z.string(), ok: z.boolean(), message: z.string() })), verification: z.object({ state: z.enum(['verified', 'unverified']), verifiedAt: IsoDate.nullable(), capabilities: z.record(z.string(), z.string()) }), method: MethodSchema })) },
    },
  }, async (req) => {
    const ctx = ctxOf(req);
    return ok(req, await vendorTx(req, async (tx, vendorId) => { const v = await verifyMethod(tx, ctx, req.params.id); return { ok: v.ok, checks: v.checks, verification: v.verification, method: await getMethod(tx, req.server.container, vendorId, req.params.id) }; }));
  });

  // ============================================================ orders to ship
  const FilterQuery = PageQuerySchema.extend({
    q: z.string().max(100).optional(), 'filter[marketplace]': z.string().max(40).optional(), 'filter[warehouse]': z.uuid().optional(), 'filter[method]': z.enum(['marketplace', 'seller', 'third_party', 'unassigned']).optional(),
    'filter[sla]': z.enum(SLA_BANDS).optional(), 'filter[status]': z.enum(DECISION_STATUSES).optional(),
  });
  const filterOf = (q: z.infer<typeof FilterQuery>): DecisionFilter => ({ q: q.q, marketplace: q['filter[marketplace]'], warehouse: q['filter[warehouse]'], method: q['filter[method]'], sla: q['filter[sla]'], status: q['filter[status]'] });

  r.get('/shipping/orders', {
    config: { access: { permission: 'shipping:read' } },
    schema: {
      tags: TAGS, summary: 'Orders to ship: the shipping decision per order', description: 'Packed / ready-to-ship fulfillments that have not been dispatched. `counts` are independent of the filters. SLA bands use the business settings sla.atRiskMinutes / sla.approachingMinutes against the order dispatch deadline.',
      querystring: FilterQuery, response: { 200: DecisionList },
    },
  }, async (req) => {
    const { limit, offset } = pageWindow(req.query);
    return ok(req, await vendorTx(req, async (tx, vendorId) => {
      const res = await listDecisions(tx, req.server.container, vendorId, await allowed(req, tx, vendorId), { filter: filterOf(req.query), limit, offset });
      return { ...pageOf(res.items, req.query, res.total), counts: res.counts };
    }));
  });

  r.get('/shipping/orders/export', {
    config: { access: { permission: 'shipping:read' } },
    schema: { tags: TAGS, summary: 'Export orders to ship (CSV)', description: 'Same filters as the list. At most 50,000 rows (413 beyond).', querystring: FilterQuery.omit({ page: true, pageSize: true }), response: { 200: z.string().describe('text/csv') } },
  }, async (req, reply) => {
    const ctx = ctxOf(req);
    const csv = await vendorTx(req, async (tx, vendorId) => {
      const al = await allowed(req, tx, vendorId);
      const base = await loadBase(tx, vendorId);
      const filter = filterOf(req.query as z.infer<typeof FilterQuery>);
      const total = await candidateCount(tx, vendorId, al, filter, base.th);
      if (total > MAX_EXPORT_ROWS) throw new AppError('PAYLOAD_TOO_LARGE', `The export has ${total} rows; the limit is ${MAX_EXPORT_ROWS}. Narrow the filters.`, { details: { total, max: MAX_EXPORT_ROWS } });
      const lines: Array<Array<string | number | null>> = [['Order', 'Marketplace', 'Warehouse', 'City', 'State', 'Value (minor)', 'Currency', 'Weight (g)', 'Available methods', 'Selected method', 'Confirmed', 'SLA band', 'Due at', 'Status']];
      for (let offset = 0; offset < total; offset += 1000) {
        const rows = await candidateRows(tx, vendorId, al, { filter, th: base.th, limit: 1000, offset });
        const infos = await loadOrderInfo(tx, vendorId, rows.map((x) => x.id));
        for (const row of rows) {
          const it = toDecisionItem(req.server.container, base, row, infos.get(row.id));
          lines.push([it.number, it.channel.name, it.warehouse.code, it.destination.city, it.destination.state, it.valueMinor, it.currency, it.weightGrams, it.availableMethods.filter((m) => m.available).map((m) => m.name).join(' / '), it.selectedMethod?.name ?? '', it.selectionConfirmed ? 'yes' : 'no', it.sla.band, it.sla.dueAt, it.status]);
        }
      }
      await effects(tx, ctx).audit({ action: 'shipping.orders_exported', resourceType: 'shipping', resourceId: vendorId, after: { rows: total } });
      return toCsv(lines);
    });
    reply.header('Content-Disposition', 'attachment; filename="orders-to-ship.csv"').type('text/csv; charset=utf-8');
    return csv;
  });

  r.get('/shipping/orders/:fulfillmentId/options', {
    config: { access: { permission: 'shipping:read' } },
    schema: { tags: TAGS, summary: 'Choose Shipping: options for one order', description: 'Available methods with reasons and the recommendation. Precedence: matching shipping rule, then the per-marketplace override, then the default method (fulfillment preferences).', params: z.object({ fulfillmentId: z.uuid() }), response: { 200: successEnvelope(OptionsSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    await can(req, tx, (await getFulfillment(tx, vendorId, req.params.fulfillmentId)).warehouseId);
    return optionsDetail(tx, req.server.container, vendorId, req.params.fulfillmentId);
  })));

  r.post('/shipping/orders/:fulfillmentId/selection', {
    config: { access: { permission: 'shipping:write' } },
    schema: {
      tags: TAGS, summary: 'Confirm the shipping method of an order', description: 'Idempotent. 409 `method_unavailable` when the method cannot be used for this order. Stores who selected it (rule / preference / manual) and when.',
      params: z.object({ fulfillmentId: z.uuid() }), body: z.object({ kind: Kind, providerId: z.uuid().nullish(), source: z.enum(['recommended', 'manual_override']).default('recommended') }),
      response: { 200: successEnvelope(OptionsSchema.extend({ unchanged: z.boolean() })) },
    },
  }, async (req) => {
    const ctx = ctxOf(req);
    return ok(req, await vendorTx(req, async (tx, vendorId) => {
      await can(req, tx, (await getFulfillment(tx, vendorId, req.params.fulfillmentId)).warehouseId);
      return selectMethod(tx, ctx, req.params.fulfillmentId, req.body);
    }));
  });

  const BulkBody = z.object({
    selection: z.object({ fulfillmentIds: z.array(z.uuid()).min(1).max(MAX_BULK) }).optional(), fulfillmentIds: z.array(z.uuid()).min(1).max(MAX_BULK).optional(),
    action: z.enum(['assign_method', 'generate_labels', 'recalculate']), params: z.object({ kind: Kind.optional(), providerId: z.uuid().nullish() }).default({}),
  }).refine((b) => Boolean(b.selection?.fulfillmentIds ?? b.fulfillmentIds), { message: 'provide selection.fulfillmentIds (max 200)', path: ['selection'] });

  r.post('/shipping/orders/bulk', {
    config: { access: { permission: 'shipping:write' } },
    schema: {
      tags: TAGS, summary: 'Bulk: assign a method, generate labels, recalculate', description: 'At most 200 orders. Every order gets its own result; one failing never stops the others. generate_labels only works where the method supports labels (others report `not_supported_by_connector`).',
      body: BulkBody, response: { 200: successEnvelope(z.object({ action: z.string(), requested: z.number().int(), succeeded: z.number().int(), failed: z.number().int(), results: z.array(z.object({ fulfillmentId: z.string(), number: z.string().nullable(), ok: z.boolean(), code: z.string().optional(), message: z.string().optional(), shipmentId: z.string().optional(), awb: z.string().nullable().optional(), recommendation: z.object({ kind: Kind, why: z.string() }).nullable().optional() })) })) },
    },
  }, async (req) => {
    const ctx = ctxOf(req);
    const ids = [...new Set(req.body.selection?.fulfillmentIds ?? req.body.fulfillmentIds ?? [])];
    const { action, params } = req.body;
    if (action === 'assign_method' && !params.kind) throw Errors.validation({ issues: [{ path: 'params.kind', message: 'required for assign_method' }] });
    const results: Array<{ fulfillmentId: string; number: string | null; ok: boolean; code?: string; message?: string; shipmentId?: string; awb?: string | null; recommendation?: { kind: 'marketplace' | 'seller' | 'third_party'; why: string } | null }> = [];
    for (const id of ids) {
      let number: string | null = null;
      try {
        const res = await bulkOne(req, ctx, id, action, params, (n) => { number = n; });
        results.push({ fulfillmentId: id, number, ok: true, ...res });
      } catch (e) {
        const err = e as AppError;
        results.push({ fulfillmentId: id, number, ok: false, code: (err.details as { rule?: string } | undefined)?.rule ?? String(err.code ?? 'error').toLowerCase(), message: err.message });
      }
    }
    const succeeded = results.filter((x) => x.ok).length;
    await vendorTx(req, (tx, vendorId) => effects(tx, ctx).audit({ action: `shipping.bulk_${action}`, resourceType: 'shipping', resourceId: vendorId, after: { requested: ids.length, succeeded } }));
    return ok(req, { action, requested: ids.length, succeeded, failed: ids.length - succeeded, results });
  });

  async function bulkOne(req: FastifyRequest, ctx: OpCtx, id: string, action: 'assign_method' | 'generate_labels' | 'recalculate', params: { kind?: 'marketplace' | 'seller' | 'third_party'; providerId?: string | null }, setNumber: (n: string) => void): Promise<Record<string, unknown>> {
    const vendorId = ctx.vendorId;
    if (action === 'assign_method') {
      return vendorTx(req, async (tx) => { const f = await getFulfillment(tx, vendorId, id); await can(req, tx, f.warehouseId); setNumber((await getCandidate(tx, vendorId, id)).orderNumber); const d = await selectMethod(tx, ctx, id, { kind: params.kind!, providerId: params.providerId, source: 'manual_override' }); return { recommendation: d.recommendation ? { kind: d.recommendation.kind, why: d.recommendation.why } : null }; });
    }
    if (action === 'recalculate') {
      return vendorTx(req, async (tx) => { const f = await getFulfillment(tx, vendorId, id); await can(req, tx, f.warehouseId); setNumber((await getCandidate(tx, vendorId, id)).orderNumber); const rec = await recalculate(tx, ctx, id); return { recommendation: rec ? { kind: rec.kind, why: rec.why } : null }; });
    }
    // generate_labels: only where the selected method supports labels
    const plan = await vendorTx(req, async (tx) => {
      const f = await getFulfillment(tx, vendorId, id); await can(req, tx, f.warehouseId);
      const cand = await getCandidate(tx, vendorId, id); setNumber(cand.orderNumber);
      const base = await loadBase(tx, vendorId);
      const m = cand.providerId ? base.methods.find((x) => x.id === cand.providerId) : undefined;
      return { cand, methods: base.methods, method: m };
    });
    const { cand } = plan;
    if (cand.shipmentId) return { shipmentId: cand.shipmentId, awb: null, code: 'already_labelled' };
    if (!cand.confirmedAt || !cand.kind) throw new AppError('CONFLICT', 'Confirm a shipping method first', { details: { rule: 'no_method_selected' } });
    const sel = flagsOfSelection(ctx.c, plan.methods, cand.kind, cand.providerId, cand.marketplace);
    if (!sel) throw new AppError('CONFLICT', 'The selected method is no longer available', { details: { rule: 'method_unavailable', kind: cand.kind } });
    if (!sel.flags.label) throw new AppError('CONFLICT', 'This method does not support labels', { details: { rule: 'not_supported_by_connector', kind: cand.kind } });
    // marketplace shipping: the marketplace issues the label itself (it appears when the marketplace confirms); nothing is booked from here
    if (cand.kind === 'marketplace') throw new AppError('CONFLICT', 'The marketplace issues this label; it appears here once the marketplace confirms it', { details: { rule: 'marketplace_label_pending', kind: cand.kind } });
    const providerCode = cand.kind === 'seller' ? SELLER_PROVIDER : (plan.method?.providerCode ?? '');
    try { getProvider(providerCode); } catch { throw new AppError('CONFLICT', 'The provider is not available', { details: { rule: 'not_supported_by_connector' } }); }
    const s = await createShipment(ctx, { fulfillmentId: id, providerCode });
    return { shipmentId: s.id, awb: s.awb };
  }

  // ============================================================ overview + sync
  r.get('/shipping/overview', {
    config: { access: { permission: 'shipping:read' } },
    schema: {
      tags: TAGS, summary: 'Shipping overview', description: 'Status line, pulse with `sinceLastSync` deltas, the decision field (first 5 orders), the availability comparison (with a "label generation" row while no verified method can make labels) and the attention breakdown. Deltas compare with an earlier moment (`compare`: `sync` = about an hour back, `24h`, `7d`): the stored hourly snapshot of the right age when there is one, otherwise the counts rebuilt from the fulfillment / shipment status history, so a fresh install has real deltas too. `comparison` says which (`source`, `at`, `windowHours`). `asOf` (ISO date or date-time) sets the reference time for the comparison and the SLA.',
      querystring: z.object({ asOf: z.string().max(40).optional(), compare: z.enum(COMPARE_WINDOWS).default('sync') }),
      response: { 200: successEnvelope(z.object({ asOf: IsoDate, generatedAt: IsoDate, baseline: IsoDate, comparison: z.object({ source: z.enum(['snapshot', 'history']), at: IsoDate, windowHours: z.number().int() }), statusLine: z.object({ connectedChannels: z.number().int(), activeMethods: z.number().int(), ordersNeedAttention: z.number().int() }), pulse: Obj, decisionField: z.array(Obj), availabilityComparison: z.array(Obj), attention: z.object({ total: z.number().int(), parts: z.record(z.string(), z.number().int()) }) })) },
    },
  }, async (req) => {
    const asOf = asOfOf(req.query.asOf);
    return ok(req, await vendorTx(req, async (tx, vendorId) => overview(tx, req.server.container, vendorId, await allowed(req, tx, vendorId), asOf, req.query.compare)));
  });

  const SyncDescription = 'A `tracking` job on the shared sync engine (see GET /sync/jobs/{id}): `status` queued | running | retrying | succeeded | partially_failed | failed | dead_lettered; `progress` { total, done, failed } counts the items (active methods to verify + open shipments to refresh) and moves while it runs; `payload.orders` is the number of orders it looks at; when it is over, `stats` hold orders, statuses, processed, updated, requireAttention and the method / tracking counts, `failureDetails` the shipments whose tracking failed.';
  r.post('/shipping/sync', {
    config: { access: { permission: 'shipping:write' } },
    schema: {
      tags: TAGS, summary: 'Sync Shipping (starts a background job)', description: `Verifies the active methods and refreshes tracking of open shipments in the background. Answers 202 with the job at once; follow it with GET /shipping/sync/{id}. A sync that is already running is returned instead of starting a second one. ${SyncDescription}`,
      body: z.object({}).default({}),
      response: { 202: successEnvelope(SyncJobSchema) },
    },
  }, async (req, reply) => {
    const ctx = ctxOf(req);
    const al = await vendorTx(req, (tx, vendorId) => allowed(req, tx, vendorId));
    const { job } = await startShippingSync(ctx, al);
    reply.code(202);
    return ok(req, toSyncJobDto(job));
  });

  r.get('/shipping/sync/latest', {
    config: { access: { permission: 'shipping:read' } },
    schema: { tags: TAGS, summary: 'The latest Sync Shipping job (null when none ran yet)', description: `Lets a reloaded page pick a running sync up again. ${SyncDescription}`, response: { 200: successEnvelope(SyncJobSchema.nullable()) } },
  }, async (req) => { const job = await vendorTx(req, (tx, vendorId) => latestShippingSync(tx, vendorId)); return ok(req, job ? toSyncJobDto(job) : null); });

  r.get('/shipping/sync/:id', {
    config: { access: { permission: 'shipping:read' } },
    schema: { tags: TAGS, summary: 'Progress of a Sync Shipping job', description: SyncDescription, params: IdParamSchema, response: { 200: successEnvelope(SyncJobSchema) } },
  }, async (req) => ok(req, toSyncJobDto(await vendorTx(req, (tx, vendorId) => getShippingSync(tx, vendorId, req.params.id)))));

  // ============================================================ pickup slots
  r.get('/shipping/pickup-slots', {
    config: { access: { permission: 'shipping:read' } },
    schema: {
      tags: TAGS, summary: 'Pickup slots (upcoming by default)', description: 'The pickup slots booked for shipping methods: date, time window, parcel count, status (confirmed = the provider scheduled it and gave a `reference`; manual = recorded here, arranged with the carrier by the seller; failed = the provider refused; cancelled). `scope=all` includes past and cancelled slots. `today` is the date where the business is.',
      querystring: z.object({ scope: z.enum(['upcoming', 'all']).default('upcoming'), 'filter[warehouse]': z.uuid().optional(), 'filter[method]': z.uuid().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }),
      response: { 200: successEnvelope(z.object({ items: z.array(PickupSlotSchema), today: z.string() })) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const res = await listPickupSlots(tx, req.server.container, vendorId, { scope: req.query.scope, warehouseId: req.query['filter[warehouse]'], methodId: req.query['filter[method]'], limit: req.query.limit });
    const al = await allowed(req, tx, vendorId);
    return al ? { ...res, items: res.items.filter((i) => al.includes(i.warehouse.id)) } : res;
  })));

  r.post('/shipping/pickup-slots', {
    config: { access: { permission: 'shipping:write' } },
    schema: {
      tags: TAGS, summary: 'Book a pickup slot (Book slot)', description: 'Asks a shipping method to collect `parcelCount` parcels from a warehouse on `date` between `windowStart` and `windowEnd` (HH:MM). A provider that can schedule pickups is called (status confirmed + reference, or failed with the reason); a marketplace, the sellers own shipping or a provider without pickup scheduling is recorded as a manual booking. The date cannot be in the past; two active slots of one method and warehouse cannot overlap (409 slot_overlap).',
      body: z.object({ warehouseId: z.uuid(), methodId: z.uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), windowStart: z.string().regex(/^\d{2}:\d{2}$/), windowEnd: z.string().regex(/^\d{2}:\d{2}$/), parcelCount: z.number().int().min(1).max(10_000), note: z.string().max(300).nullish() }),
      response: { 201: successEnvelope(PickupSlotSchema) },
    },
  }, async (req, reply) => {
    const dto = await bookPickupSlot(ctxOf(req), req.body, (tx, wh) => can(req, tx, wh));
    return created(req, reply, dto, `/api/v1/shipping/pickup-slots/${dto.id}`);
  });

  r.post('/shipping/pickup-slots/:id/cancel', {
    config: { access: { permission: 'shipping:write' } },
    schema: { tags: TAGS, summary: 'Cancel a pickup slot', description: 'A provider booking is cancelled with the provider first (if it refuses, the slot stays). 409 for a slot that is already cancelled or failed.', params: IdParamSchema, body: z.object({}).default({}), response: { 200: successEnvelope(PickupSlotSchema) } },
  }, async (req) => ok(req, await cancelPickupSlot(ctxOf(req), req.params.id, (tx, wh) => can(req, tx, wh))));

  // ============================================================ tracking
  r.get('/shipping/tracking', {
    config: { access: { permission: 'shipping:read' } },
    schema: {
      tags: TAGS, summary: 'Tracking: dispatched shipments with a derived status', description: 'tracking_active | awaiting_first_scan (dispatched, no scan after shipping.awaitingFirstScanHours, default 12) | in_transit | delivery_delayed (past the estimated delivery) | tracking_sync_failed | delivered.',
      querystring: PageQuerySchema.extend({ q: z.string().max(100).optional(), 'filter[marketplace]': z.string().max(40).optional(), 'filter[method]': z.string().max(40).optional().describe('provider code'), 'filter[status]': z.enum(TRACKING_STATUSES_DERIVED).optional() }),
      response: { 200: successEnvelope(z.object({ items: z.array(Obj), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(), counters: z.object({ stages: z.object({ dispatched: z.number().int(), inTransit: z.number().int(), delivered: z.number().int() }), byStatus: z.record(z.string(), z.number().int()) }) })) },
    },
  }, async (req) => {
    const { limit, offset } = pageWindow(req.query);
    return ok(req, await vendorTx(req, async (tx, vendorId) => {
      const res = await listTracking(tx, req.server.container, vendorId, await allowed(req, tx, vendorId), { filter: { q: req.query.q, marketplace: req.query['filter[marketplace]'], method: req.query['filter[method]'], status: req.query['filter[status]'] as TrackingDerived | undefined }, limit, offset });
      return { ...pageOf(res.items, req.query, res.total), counters: res.counters };
    }));
  });

  r.get('/shipping/tracking/failures', {
    config: { access: { permission: 'shipping:read' } },
    schema: { tags: TAGS, summary: 'Tracking sync failures (what failed, why, retry)', response: { 200: successEnvelope(z.array(z.object({ shipmentId: z.string(), orderId: z.string(), orderNumber: z.string(), awb: z.string().nullable(), failedAt: IsoDate.nullable(), whatFailed: z.string(), possibleReason: z.string(), action: z.object({ key: z.literal('retry'), label: z.string(), method: z.literal('POST'), href: z.string() }) }))) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => trackingFailures(tx, vendorId, await allowed(req, tx, vendorId)))));

  r.post('/shipping/tracking/sync', {
    config: { access: { permission: 'shipping:write' } },
    schema: {
      tags: TAGS, summary: 'Sync tracking of open shipments (bulk refresh)', description: 'Asks the providers for news on up to 200 open shipments. A failing shipment is recorded as `tracking_sync_failed` and never stops the others.',
      body: z.object({ shipmentIds: z.array(z.uuid()).max(200).optional() }).default({}),
      response: { 202: successEnvelope(z.object({ processed: z.number().int(), updated: z.number().int(), failed: z.number().int(), failures: z.array(z.object({ shipmentId: z.string(), message: z.string() })) })) },
    },
  }, async (req, reply) => {
    const ctx = ctxOf(req);
    const al = await vendorTx(req, (tx, vendorId) => allowed(req, tx, vendorId));
    const out = await refreshOpenShipments(ctx, al, req.body.shipmentIds);
    reply.code(202);
    return ok(req, out);
  });

  // ============================================================ exceptions
  r.get('/shipping/exceptions', {
    config: { access: { permission: 'shipping:read' } },
    schema: {
      tags: TAGS, summary: 'Shipping exceptions: six categories with what / why / what to do', description: 'Grouped: every category with its count, the first affected orders and the 3-part explanation. With `category` the affected orders of that one category are paged.',
      querystring: PageQuerySchema.extend({ category: z.enum(EXCEPTION_KEYS).optional() }),
      response: { 200: successEnvelope(z.object({ categories: z.array(z.object({ key: z.enum(EXCEPTION_KEYS), title: z.string(), count: z.number().int(), orders: z.array(Obj), whatHappened: z.string(), why: z.string(), whatCanIDoNow: z.string(), action: Action })), totalOrders: z.number().int(), categoryCount: z.number().int(), total: z.number().int(), page: z.number().int(), pageSize: z.number().int(), pages: z.number().int() })) },
    },
  }, async (req) => {
    const { limit, offset } = pageWindow(req.query);
    return ok(req, await vendorTx(req, async (tx, vendorId) => {
      const res = await exceptionsReport(tx, req.server.container, vendorId, await allowed(req, tx, vendorId), { category: req.query.category as ExceptionKey | undefined, limit, offset });
      return { ...res, page: req.query.page, pageSize: req.query.pageSize, pages: Math.max(1, Math.ceil(res.total / req.query.pageSize)) };
    }));
  });

  r.get('/shipping/exceptions/export', {
    config: { access: { permission: 'shipping:read' } },
    schema: { tags: TAGS, summary: 'Export shipping exceptions (CSV)', response: { 200: z.string().describe('text/csv') } },
  }, async (req, reply) => {
    const ctx = ctxOf(req);
    const csv = await vendorTx(req, async (tx, vendorId) => {
      const res = await exceptionsCsv(tx, req.server.container, vendorId, await allowed(req, tx, vendorId));
      await effects(tx, ctx).audit({ action: 'shipping.exceptions_exported', resourceType: 'shipping', resourceId: vendorId, after: { rows: res.rows } });
      return res.csv;
    });
    reply.header('Content-Disposition', 'attachment; filename="shipping-exceptions.csv"').type('text/csv; charset=utf-8');
    return csv;
  });

  // ============================================================ shipping rules
  r.get('/shipping/rules', {
    config: { access: { permission: 'rules:read' } },
    schema: {
      tags: TAGS, summary: 'Shipping rules (IF / AND / THEN)', description: '`priority` 1 is evaluated first. `ordersAffected` = open orders that match the rule now (a dry run, cached for 5 minutes).',
      response: { 200: successEnvelope(z.object({ items: z.array(RuleSchema), total: z.number().int(), max: z.number().int(), fields: z.array(z.string()), operators: z.array(z.string()) })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => listShippingRules(tx, ctxOf(req), vendorId))));

  r.post('/shipping/rules', {
    config: { access: { permission: 'shipping:configure' } },
    schema: { tags: TAGS, summary: 'Create a shipping rule', description: 'Fields and operators are whitelisted, thresholds must be real values (orderValueMinor in minor units, weightGrams in grams), at most 100 rules. The new rule gets the lowest priority.', body: RuleBody, response: { 201: successEnvelope(RuleSchema) } },
  }, async (req, reply) => {
    const ctx = ctxOf(req);
    const dto = await vendorTx(req, (tx) => createShippingRule(tx, ctx, req.body as never));
    return created(req, reply, dto, `/api/v1/shipping/rules/${dto.id}`);
  });

  r.put('/shipping/rules/order', {
    config: { access: { permission: 'shipping:configure' } },
    schema: { tags: TAGS, summary: 'Re-order shipping rules', description: 'Send every shipping rule id exactly once, highest priority first.', body: z.object({ ids: z.array(z.uuid()).max(100) }), response: { 200: successEnvelope(z.object({ items: z.array(RuleSchema), total: z.number().int(), max: z.number().int(), fields: z.array(z.string()), operators: z.array(z.string()) })) } },
  }, async (req) => { const ctx = ctxOf(req); return ok(req, await vendorTx(req, (tx) => reorderShippingRules(tx, ctx, req.body.ids))); });

  r.patch('/shipping/rules/:id', {
    config: { access: { permission: 'shipping:configure' } },
    schema: { tags: TAGS, summary: 'Update a shipping rule', params: IdParamSchema, body: RuleBody.partial(), response: { 200: successEnvelope(RuleSchema) } },
  }, async (req) => { const ctx = ctxOf(req); return ok(req, await vendorTx(req, (tx) => patchShippingRule(tx, ctx, req.params.id, req.body as never))); });

  r.delete('/shipping/rules/:id', {
    config: { access: { permission: 'shipping:configure' } },
    schema: { tags: TAGS, summary: 'Delete a shipping rule', params: IdParamSchema, response: { 200: successEnvelope(z.object({ id: z.string(), deleted: z.literal(true) })) } },
  }, async (req) => { const ctx = ctxOf(req); await vendorTx(req, (tx) => removeShippingRule(tx, ctx, req.params.id)); return ok(req, { id: req.params.id, deleted: true as const }); });

  r.post('/shipping/rules/:id/duplicate', {
    config: { access: { permission: 'shipping:configure' } },
    schema: { tags: TAGS, summary: 'Duplicate a shipping rule (the copy is disabled and last)', params: IdParamSchema, body: z.object({}).default({}), response: { 201: successEnvelope(RuleSchema) } },
  }, async (req, reply) => { const ctx = ctxOf(req); const dto = await vendorTx(req, (tx) => duplicateShippingRule(tx, ctx, req.params.id)); return created(req, reply, dto, `/api/v1/shipping/rules/${dto.id}`); });

  for (const [path, enabled] of [['enable', true], ['disable', false]] as const) {
    r.post(`/shipping/rules/:id/${path}`, {
      config: { access: { permission: 'shipping:configure' } },
      schema: { tags: TAGS, summary: `${enabled ? 'Enable' : 'Disable'} a shipping rule`, params: IdParamSchema, body: z.object({}).default({}), response: { 200: successEnvelope(RuleSchema) } },
    }, async (req) => { const ctx = ctxOf(req); return ok(req, await vendorTx(req, (tx) => patchShippingRule(tx, ctx, req.params.id, { enabled }))); });
  }
}
