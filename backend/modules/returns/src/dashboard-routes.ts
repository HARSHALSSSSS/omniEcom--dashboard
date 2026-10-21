import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IdParamSchema, PageQuerySchema, pagedEnvelope, successEnvelope } from '@oms/contracts';
import { Errors } from '@oms/shared';
import { ok, opCtxFromRequest, paged, pageWindow, requireVendor, vendorTx, effects, type OpCtx } from '@oms/module-kit';
import { assertWarehouseCapability } from '@oms/mod-warehouses';
import { type Tx, schema, and, eq } from '@oms/database';
import { DISPOSITION_KINDS, INSPECTION_RESULTS } from './domain';
import { EXPORT_MAX_ROWS, toCsv } from './csv';
import { SIGNALS, TABS, analytics, attentionList, eligibility, exportLedger, ledgerCounts, listLedger, listRefunds, overview, refundView, returnDetailView, returnSettings } from './dashboard';
import { applyDisposition, assignInspection, dispositionOptions, getInspection, saveInspection } from './inspection';
import { getReturnRow, retryRefund, returnDetail } from './service';
import { ReturnSchema } from './routes';
import { LEDGER_SORTS } from './ret-int-ledger';

const Multi = z.union([z.string(), z.array(z.string())]).optional();
const arr = (v: string | string[] | undefined): string[] | undefined => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);
const Loose = z.looseObject({});
const Checklist = z.object({ packagingIntact: z.boolean(), productUsable: z.boolean(), accessoriesPresent: z.boolean(), visibleDamage: z.boolean(), productMismatch: z.boolean(), missingQuantity: z.boolean() });

const LedgerQuerySchema = PageQuerySchema.extend({
  tab: z.enum(TABS).default('all'), q: z.string().trim().max(100).optional(),
  'filter[marketplace]': Multi, 'filter[signal]': Multi, 'filter[inspectionStatus]': Multi, 'filter[refundStatus]': Multi, 'filter[disposition]': Multi, 'filter[stage]': Multi,
  sort: z.enum(LEDGER_SORTS).default('-requestedAt'),
});
const FilterOnly = LedgerQuerySchema.omit({ page: true, pageSize: true });
type Q = z.infer<typeof LedgerQuerySchema>;
const filtersOf = (q: Partial<Q>) => ({
  q: q.q, marketplace: arr(q['filter[marketplace]']), signal: arr(q['filter[signal]']), inspectionStatus: arr(q['filter[inspectionStatus]']), refundStatus: arr(q['filter[refundStatus]']), disposition: arr(q['filter[disposition]']), stage: arr(q['filter[stage]']),
});

const LedgerItem = z.looseObject({
  id: z.string(), number: z.string(), orderId: z.string(), orderNumber: z.string(), product: z.object({ title: z.string().nullable(), sku: z.string().nullable(), itemCount: z.number().int() }),
  channel: z.object({ code: z.string(), name: z.string() }), reason: z.object({ code: z.string(), label: z.string() }), quantity: z.number().int(), receivedQuantity: z.number().int(), status: z.string(), displayStatus: z.string(),
  requestedAt: z.string(), receivedAt: z.string().nullable(), inspection: z.object({ status: z.string(), inspector: z.object({ id: z.string(), name: z.string().nullable() }).nullable() }),
  refund: z.object({ status: z.string(), amountMinor: z.number().int().nullable(), currency: z.string().nullable(), source: z.enum(['connector', 'manual']).nullable() }),
  disposition: z.string(), customer: z.object({ name: z.string().nullable(), email: z.string().nullable() }).nullable(), signals: z.array(z.string()), action: z.object({ key: z.string(), href: z.string() }),
});

const csvEscapeRows = (rows: Awaited<ReturnType<typeof exportLedger>>) => toCsv([
  ['Return', 'Order', 'Product', 'SKU', 'Marketplace', 'Reason', 'Quantity', 'Received quantity', 'Status', 'Requested', 'Received', 'Inspection', 'Inspector', 'Refund', 'Refund amount', 'Currency', 'Disposition', 'Signals'],
  ...rows.map((x) => [x.number, x.orderNumber, x.product.title, x.product.sku, x.channel.code, x.reason.label, x.quantity, x.receivedQuantity, x.displayStatus, x.requestedAt, x.receivedAt, x.inspection.status, x.inspection.inspector?.name ?? '',
    x.refund.status, x.refund.amountMinor == null ? '' : (x.refund.amountMinor / 100).toFixed(2), x.refund.currency, x.disposition, x.signals.join(' ')]),
]);

/** Returns workspace (screen 35): overview, ledger, inspection, dispositions, refund tracking, create-from-order, analytics, attention. */
export const returnsDashboardRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const TAGS = ['Returns'];
  async function run<T>(req: FastifyRequest, fn: (tx: Tx, ctx: OpCtx) => Promise<T>): Promise<T> {
    const vendorId = requireVendor(req);
    const ctx = opCtxFromRequest(req, vendorId);
    return vendorTx(req, (tx) => fn(tx, ctx));
  }
  const csv = (reply: FastifyReply, name: string, body: string) => { void reply.header('Content-Disposition', `attachment; filename="${name}"`).type('text/csv; charset=utf-8'); return body; };

  // ---- overview + ledger ------------------------------------------------------------------------
  r.get('/returns/overview', {
    config: { access: { permission: 'returns:read' } },
    schema: {
      tags: TAGS, summary: 'Returns workspace overview', description: 'Status line, create-return availability (Shopify connection only; the sandbox marketplace outside production), the stage counters (independent queues) and the needs-attention strip. Counts use the same predicates as the ledger tabs and `filter[signal]`.',
      response: { 200: successEnvelope(z.object({
        statusLine: z.object({ open: z.number().int(), awaitingInspection: z.number().int(), refundsPending: z.number().int() }),
        createReturn: z.object({ available: z.boolean(), reason: z.string().nullable(), allowedChannels: z.array(z.string()) }),
        stages: z.record(z.string(), z.looseObject({ count: z.number().int() })), stagesNote: z.string(),
        attention: z.array(z.object({ key: z.enum(SIGNALS), count: z.number().int() })),
      })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx) => overview(tx, req.server.container, requireVendor(req)))));

  r.get('/returns/ledger', {
    config: { access: { permission: 'returns:read' } },
    schema: { tags: TAGS, summary: 'Returns ledger (numbered pages)', description: 'Tabs `all|needs_attention|awaiting_receipt|awaiting_inspection|refund_pending|completed`, search over return / order / product / SKU, repeatable filters. Customer e-mail is masked here; the detail shows it in full.', querystring: LedgerQuerySchema, response: { 200: pagedEnvelope(LedgerItem) } },
  }, async (req) => {
    const w = pageWindow(req.query);
    const res = await vendorTx(req, (tx, vendorId) => listLedger(tx, req.server.container, vendorId, { ...filtersOf(req.query), tab: req.query.tab, sort: req.query.sort, page: req.query.page, pageSize: w.limit }));
    return paged(req, res.items, req.query, res.total);
  });
  r.get('/returns/counts', {
    config: { access: { permission: 'returns:read' } },
    schema: { tags: TAGS, summary: 'Counts for the ledger tabs', description: 'One grouped query. Honours search and filters (not the tab itself).', querystring: FilterOnly.omit({ tab: true }), response: { 200: successEnvelope(z.object({ all: z.number().int(), needs_attention: z.number().int(), awaiting_receipt: z.number().int(), awaiting_inspection: z.number().int(), refund_pending: z.number().int(), completed: z.number().int() })) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => ledgerCounts(tx, vendorId, filtersOf(req.query), await returnSettings(tx, vendorId)))));
  r.get('/returns/export', {
    config: { access: { permission: 'returns:read' } },
    schema: { tags: TAGS, summary: 'Export the ledger as CSV', description: `Same filters as the ledger. Max ${EXPORT_MAX_ROWS} rows (413 beyond). Cells that start with = + - @ are neutralised.`, querystring: FilterOnly, response: { 200: z.string().describe('text/csv') } },
  }, async (req, reply) => {
    const body = await run(req, async (tx, ctx) => {
      const rows = await exportLedger(tx, req.server.container, ctx.vendorId, { ...filtersOf(req.query), tab: req.query.tab }, EXPORT_MAX_ROWS);
      await effects(tx, ctx).audit({ action: 'returns.exported', resourceType: 'return', resourceId: 'ledger', metadata: { rows: rows.length, tab: req.query.tab } });
      return csvEscapeRows(rows);
    });
    return csv(reply, 'returns.csv', body);
  });

  // ---- attention ---------------------------------------------------------------------------------
  const AttentionRow = z.object({ returnId: z.string(), number: z.string(), orderNumber: z.string(), issue: z.enum(['inspection_overdue', 'refund_pending', 'quantity_mismatch', 'disposition_missing']), signals: z.array(z.string()), impact: z.string(), recommendedAction: z.object({ text: z.string(), href: z.string() }) });
  r.get('/returns/attention', {
    config: { access: { permission: 'returns:read' } },
    schema: { tags: TAGS, summary: 'Returns that need attention (computed live)', description: 'One row per affected return; `signals` lists every issue that applies, `issue` is the most pressing. Settings: returns.inspectionOverdueHours (default 24), returns.highValueMinor.', response: { 200: successEnvelope(z.object({ total: z.number().int(), items: z.array(AttentionRow) })) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => attentionList(tx, vendorId))));
  r.get('/returns/attention/export', {
    config: { access: { permission: 'returns:read' } },
    schema: { tags: TAGS, summary: 'Export the attention list as CSV', response: { 200: z.string().describe('text/csv') } },
  }, async (req, reply) => {
    const body = await run(req, async (tx, ctx) => {
      const list = await attentionList(tx, ctx.vendorId, EXPORT_MAX_ROWS);
      await effects(tx, ctx).audit({ action: 'returns.attention_exported', resourceType: 'return', resourceId: 'attention', metadata: { rows: list.total } });
      return toCsv([['Return', 'Order', 'Issue', 'Impact', 'Recommended action'], ...list.items.map((x) => [x.number, x.orderNumber, x.issue, x.impact, x.recommendedAction.text])]);
    });
    return csv(reply, 'returns-attention.csv', body);
  });

  // ---- refunds -----------------------------------------------------------------------------------
  r.get('/returns/refunds', {
    config: { access: { permission: 'returns:read' } },
    schema: {
      tags: TAGS, summary: 'Refund queue', description: 'Actionable refunds (after inspection) plus already processed ones, with footer counts. Pre-inspection returns are not in the actionable queue.',
      querystring: PageQuerySchema.extend({ q: z.string().trim().max(100).optional(), 'filter[status]': Multi, 'filter[marketplace]': Multi }),
      response: { 200: successEnvelope(z.object({ items: z.array(Loose), page: z.number().int(), pageSize: z.number().int(), total: z.number().int(), pages: z.number().int(), counts: z.object({ pending: z.number().int(), ready: z.number().int(), processing: z.number().int(), failed: z.number().int() }) })) },
    },
  }, async (req) => {
    pageWindow(req.query);
    const res = await vendorTx(req, (tx, vendorId) => listRefunds(tx, req.server.container, vendorId, { page: req.query.page, pageSize: req.query.pageSize, q: req.query.q, status: arr(req.query['filter[status]']), marketplace: arr(req.query['filter[marketplace]']) }));
    return { success: true as const, data: { items: res.items, page: req.query.page, pageSize: req.query.pageSize, total: res.total, pages: Math.max(1, Math.ceil(res.total / req.query.pageSize)), counts: res.counts }, requestId: req.id };
  });
  r.get('/returns/:id/refund', {
    config: { access: { permission: 'returns:read' } },
    schema: { tags: TAGS, summary: 'Refund detail', description: 'Amount and status as tracked (connector or manual), status timeline and the note that return approval is not refund approval.', params: IdParamSchema, response: { 200: successEnvelope(Loose) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => refundView(tx, req.server.container, vendorId, req.params.id))));
  r.post('/returns/:id/refund/retry', {
    config: { access: { permission: 'returns:refund' } },
    schema: { tags: TAGS, summary: 'Retry a failed refund', description: 'Only from `failed`. A connector refund asks the marketplace again (409 `not_supported_by_connector` when it cannot); a manual one goes back to `ready`.', params: IdParamSchema, response: { 200: successEnvelope(ReturnSchema) } },
  }, async (req) => ok(req, await run(req, async (tx, ctx) => { await retryRefund(tx, ctx, req.params.id); return returnDetail(tx, ctx.vendorId, req.params.id); })));

  // ---- create from an order ----------------------------------------------------------------------
  r.get('/returns/eligibility', {
    config: { access: { permission: 'returns:read' } },
    schema: {
      tags: TAGS, summary: 'Find an order and the units that can still be returned', description: '`order` is the order number (with or without `#`) or the marketplace order id. Only fulfilled orders of an allowed channel (Shopify; the sandbox marketplace outside production).',
      querystring: z.object({ order: z.string().trim().min(1).max(120) }), response: { 200: successEnvelope(Loose) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => eligibility(tx, req.server.container, vendorId, req.query.order))));

  // ---- analytics + sync --------------------------------------------------------------------------
  r.get('/returns/analytics', {
    config: { access: { permission: 'returns:read' } },
    schema: {
      tags: TAGS, summary: 'Why products are coming back', description: 'Reason shares of the last `sample` returns of the last `days` days, concentration and recommendation-only intelligence (reason > 15%, SKU with at least twice its previous 7-day return count).',
      querystring: z.object({ days: z.coerce.number().int().min(1).max(365).default(30), sample: z.coerce.number().int().min(1).max(500).default(100) }),
      response: { 200: successEnvelope(z.object({
        window: z.object({ returns: z.number().int(), days: z.number().int(), sample: z.number().int() }), reasons: z.array(z.object({ code: z.string(), label: z.string(), count: z.number().int(), sharePct: z.number() })),
        concentration: z.object({ products: z.number().int(), text: z.string() }), intelligence: z.array(z.object({ kind: z.enum(['reason_spike', 'sku_baseline']), text: z.string(), evidence: z.string(), action: z.object({ key: z.string(), label: z.string(), href: z.string() }) })),
        recommendationOnly: z.literal(true), note: z.string(),
      })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => analytics(tx, vendorId, req.query.days, req.query.sample))));
  r.post('/returns/sync', {
    config: { access: { permission: 'returns:write' } },
    schema: { tags: TAGS, summary: 'Sync returns from the marketplaces', description: 'No returns sync job exists yet (the sync engine has the `returns` type but no runner), so nothing is enqueued; the response says so and lists the connected accounts whose connector can fetch returns.', response: { 200: successEnvelope(z.object({ enqueued: z.boolean(), reason: z.string(), eligibleAccounts: z.number().int() })) } },
  }, async (req) => {
    const c = req.server.container;
    const accounts = await vendorTx(req, (tx, vendorId) => tx.select({ m: schema.marketplaceAccounts.marketplace }).from(schema.marketplaceAccounts).where(and(eq(schema.marketplaceAccounts.vendorId, vendorId), eq(schema.marketplaceAccounts.status, 'active'))));
    const eligible = accounts.filter((a) => c.connectors.has(a.m) && c.connectors.get(a.m).capabilities.returns.fetch).length;
    return ok(req, { enqueued: false, reason: 'returns_sync_not_available', eligibleAccounts: eligible });
  });

  // ---- one return ----------------------------------------------------------------------------------
  r.get('/returns/:id/detail', {
    config: { access: { permission: 'returns:read' } },
    schema: { tags: TAGS, summary: 'Return drawer: header, product, details, current state, full timeline (future steps pending) and actions', params: IdParamSchema, response: { 200: successEnvelope(Loose) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => returnDetailView(tx, req.server.container, vendorId, req.params.id))));

  // ---- inspection ----------------------------------------------------------------------------------
  const InspectionView = successEnvelope(Loose);
  r.post('/returns/inspection/assign', {
    config: { access: { permission: 'returns:write' } },
    schema: { tags: TAGS, summary: 'Assign inspection to a member (bulk)', description: 'Up to 100 returns. Returns that cannot be assigned (not received yet, inspection already finished, unknown id) are listed in `skipped` with a reason; nothing is decided or moved.', body: z.object({ ids: z.array(z.uuid()).min(1).max(100), userId: z.uuid() }), response: { 200: successEnvelope(z.object({ assigned: z.array(z.string()), skipped: z.array(z.object({ id: z.string(), reason: z.string() })) })) } },
  }, async (req) => ok(req, await run(req, (tx, ctx) => assignInspection(tx, ctx, req.body.ids, req.body.userId))));
  r.post('/returns/:id/inspection/assign', {
    config: { access: { permission: 'returns:write' } },
    schema: { tags: TAGS, summary: 'Assign inspection', description: '`userId` must be an active member of the business. Starts the inspection track (in progress); it never decides a refund or disposition.', params: IdParamSchema, body: z.object({ userId: z.uuid() }), response: { 200: InspectionView } },
  }, async (req) => ok(req, await run(req, async (tx, ctx) => {
    await getReturnRow(tx, ctx.vendorId, req.params.id);
    const res = await assignInspection(tx, ctx, [req.params.id], req.body.userId);
    if (res.skipped[0]) throw Errors.conflict(res.skipped[0].reason === 'inspection_finished' ? 'The inspection is already finished' : 'The return has not been received yet', { rule: res.skipped[0].reason });
    return getInspection(tx, ctx.vendorId, req.params.id);
  })));
  r.post('/returns/:id/inspection', {
    config: { access: { permission: 'returns:write' } },
    schema: {
      tags: TAGS, summary: 'Save an inspection', description: 'Appends the checklist to the inspection history, sets the inspection status (pass = passed, fail = failed, needs_review = requires_review) and the inspector, and computes the system condition (receipt matched / quantity mismatch) from received vs expected. NEVER approves a refund or selects a disposition.',
      params: IdParamSchema, body: z.object({ checklist: Checklist.extend({ custom: z.array(z.object({ label: z.string().trim().min(1).max(80), ok: z.boolean() })).max(20).optional() }), result: z.enum(INSPECTION_RESULTS), note: z.string().max(500).nullish() }), response: { 200: InspectionView },
    },
  }, async (req) => ok(req, await run(req, async (tx, ctx) => {
    const { custom, ...checklist } = req.body.checklist;
    await saveInspection(tx, ctx, req.params.id, { checklist, custom, result: req.body.result, note: req.body.note });
    return getInspection(tx, ctx.vendorId, req.params.id);
  })));
  r.get('/returns/:id/inspection', {
    config: { access: { permission: 'returns:read' } },
    schema: { tags: TAGS, summary: 'Latest inspection and its history', params: IdParamSchema, response: { 200: InspectionView } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => getInspection(tx, vendorId, req.params.id))));

  // ---- disposition ---------------------------------------------------------------------------------
  r.get('/returns/:id/disposition-options', {
    config: { access: { permission: 'returns:read' } },
    schema: { tags: TAGS, summary: 'What should happen to this returned stock?', description: 'A suggestion (quantity mismatch -> quarantine, passed -> sellable, failed -> damaged) and the six options. The suggestion is never applied.', params: IdParamSchema, response: { 200: successEnvelope(Loose) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => dispositionOptions(tx, vendorId, req.params.id))));
  r.post('/returns/:id/disposition', {
    config: { access: { permission: 'returns:write' } },
    schema: {
      tags: TAGS, summary: 'Confirm the disposition of the received units', description: 'Explicit operator decision (409 until the inspection is finished). sellable -> back on hand; damaged -> damaged bucket; quarantine / repair -> quarantined bucket (repair has reason `repair`); write_off / rejected -> leave the books (never sellable). All stock moves go through the inventory ledger. Without `items` every received, undecided unit gets the decision.',
      params: IdParamSchema, body: z.object({ kind: z.enum(DISPOSITION_KINDS), items: z.array(z.object({ returnItemId: z.uuid(), quantity: z.number().int().min(1).max(100_000) })).min(1).max(200).optional(), note: z.string().max(300).nullish() }), response: { 200: successEnvelope(ReturnSchema) },
    },
  }, async (req) => ok(req, await run(req, async (tx, ctx) => {
    await applyDisposition(tx, ctx, req.params.id, req.body, (wh) => assertWarehouseCapability(tx, req.ctx.principal, ctx.vendorId, wh, 'receive'));
    return returnDetail(tx, ctx.vendorId, req.params.id);
  })));
};
