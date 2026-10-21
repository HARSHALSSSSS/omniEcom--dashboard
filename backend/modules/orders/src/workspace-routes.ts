import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IdParamSchema, IsoDate, PageQuerySchema, pagedEnvelope, successEnvelope } from '@oms/contracts';
import { Errors } from '@oms/shared';
import { audit, ok, pageWindow, paged, vendorTx } from '@oms/module-kit';
import {
  ATTENTION_KEYS, PIPELINE_STAGES, SLA_STATES, TAB_KEYS, activity, deletePolicy, drawer, exportCsv, ledger, listPolicies, upsertPolicy, workspace,
  type LedgerFilters, type LedgerSort,
} from './workspace';

const Multi = (what: string) => z.union([z.string().max(60), z.array(z.string().max(60)).max(20)]).optional().describe(`${what}. Repeat the parameter or separate with commas for several values`);
const many = (v: string | string[] | undefined): string[] | undefined => {
  if (v === undefined) return undefined;
  const xs = (Array.isArray(v) ? v : [v]).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean);
  return xs.length ? xs : undefined;
};
const FilterQuery = z.object({
  q: z.string().trim().max(100).optional().describe('Order number, marketplace order id, customer name or SKU'),
  'filter[marketplace]': Multi('Marketplace codes'),
  'filter[status]': Multi('Order statuses'),
  'filter[slaState]': Multi(`SLA states: ${SLA_STATES.join(', ')}`),
  'filter[payment]': Multi('Payment method (prepaid, cod, unknown) or payment status (paid, pending, failed ...)'),
  'filter[fulfillmentStatus]': Multi('Latest fulfillment status, or `none`'),
  'filter[attention]': Multi(`Attention chips (OR): ${ATTENTION_KEYS.join(', ')}`),
  'filter[tab]': z.enum(TAB_KEYS).optional().describe('Lifecycle tab; the counts in GET /orders/workspace `tabs` use exactly these definitions'),
  'filter[date]': z.string().regex(/^(today|yesterday|\d{4}-\d{2}-\d{2})$/).optional().describe('A business-time-zone day: today, yesterday or YYYY-MM-DD'),
  'filter[placedFrom]': z.coerce.date().optional(),
  'filter[placedTo]': z.coerce.date().optional(),
  'filter[savedViewId]': z.string().max(64).optional().describe('Accepted and ignored: saved views are applied by the client'),
});
const SORTS = ['-placedAt', 'placedAt', '-value', 'value', 'sla', '-sla'] as const;
const SortQuery = z.object({ sort: z.enum(SORTS).default('-placedAt') });

type FQ = z.infer<typeof FilterQuery>;
function toFilters(q: FQ): LedgerFilters {
  const issues: Array<{ path: string; message: string }> = [];
  const check = (name: string, v: string[] | undefined, allowed: readonly string[]) => {
    for (const x of v ?? []) if (!allowed.includes(x)) issues.push({ path: name, message: `"${x}" is not one of ${allowed.join(', ')}` });
    return v;
  };
  const f: LedgerFilters = {
    q: q.q, marketplace: many(q['filter[marketplace]']), status: many(q['filter[status]']), slaState: check('filter[slaState]', many(q['filter[slaState]']), SLA_STATES),
    payment: many(q['filter[payment]']), fulfillmentStatus: many(q['filter[fulfillmentStatus]']), attention: check('filter[attention]', many(q['filter[attention]']), ATTENTION_KEYS),
    tab: q['filter[tab]'], date: q['filter[date]'], placedFrom: q['filter[placedFrom]'], placedTo: q['filter[placedTo]'],
  };
  if (issues.length) throw Errors.validation({ issues });
  return f;
}

const MarketplaceRef = z.object({ code: z.string(), name: z.string() });
const SlaState = z.enum(SLA_STATES);
const LedgerItemSchema = z.object({
  id: z.string(), number: z.string(), marketplace: MarketplaceRef, customerName: z.string().nullable(), itemCount: z.number().int().describe('Units on the order'), valueMinor: z.number().int(), currency: z.string(),
  payment: z.object({ status: z.string(), method: z.string() }), fulfillmentStatus: z.string().nullable().describe('Latest fulfillment status, null before a fulfillment exists'),
  sla: z.object({ state: SlaState, dueAt: IsoDate.nullable(), minutesRemaining: z.number().int().nullable(), label: z.string().nullable() }),
  status: z.string(), createdAt: IsoDate, placedAt: IsoDate, rowTone: z.enum(['red', 'amber', 'green', 'none']),
  inventoryIssue: z.object({ productTitle: z.string(), sku: z.string(), required: z.number().int(), available: z.number().int(), action: z.enum(['allocate', 'restock', 'map_sku']) }).nullable(),
  destination: z.object({ city: z.string().nullable(), state: z.string().nullable(), pincode: z.string().nullable() }),
  lineCount: z.number().int().describe('Order lines (itemCount is units)'), firstItem: z.object({ title: z.string(), sku: z.string(), imageUrl: z.string().nullable() }).nullable(),
  carrier: z.object({ name: z.string().nullable(), trackingNumber: z.string().nullable() }).nullable(), warehouse: z.object({ id: z.string(), name: z.string() }).nullable(),
  statusLabel: z.string(), paymentLabel: z.string(), priority: z.boolean().describe('flagged with POST /orders/bulk mark_priority'),
}).meta({ id: 'OrderLedgerItem' });

const PolicyBody = z.object({
  marketplace: z.string().trim().min(1).max(40), warehouseId: z.uuid().nullish(), handlingHours: z.number().int().min(1).max(720),
  cutoffTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'HH:MM (24 h)').nullish().describe('Business-time-zone cut-off: orders placed after it start counting the next day'),
});
const PolicySchema = z.object({ id: z.string(), marketplace: z.string(), warehouseId: z.string().nullable(), handlingHours: z.number().int(), cutoffTime: z.string().nullable(), createdAt: IsoDate, updatedAt: IsoDate }).meta({ id: 'OrderSlaPolicy' });

export const orderWorkspaceRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const reg = () => app.container.connectors;
  const TAGS = ['Orders'];
  const filters = toFilters;

  r.get('/orders/sla-policies', {
    config: { access: { permission: 'orders:read' } },
    schema: {
      tags: TAGS, summary: 'Dispatch SLA policies', description: 'Handling hours (and optional cut-off) per marketplace, optionally per warehouse. Resolution: marketplace + warehouse, then marketplace, then the business default (`sla.defaultHandlingHours`, 24 h).',
      response: { 200: successEnvelope(z.object({ defaultHandlingHours: z.number().int(), atRiskMinutes: z.number().int(), approachingMinutes: z.number().int(), timezone: z.string(), items: z.array(PolicySchema) })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => listPolicies(tx, vendorId))));

  r.put('/orders/sla-policies', {
    config: { access: { permission: 'orders:write' } },
    schema: {
      tags: TAGS, summary: 'Create or update a dispatch SLA policy', description: 'Upsert by (marketplace, warehouse). Applies to orders imported from now on.',
      body: PolicyBody, response: { 200: successEnvelope(PolicySchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const res = await upsertPolicy(tx, vendorId, req.body);
    await audit(tx, req, { action: res.created ? 'order.sla_policy_created' : 'order.sla_policy_updated', resourceType: 'marketplace_sla', resourceId: res.policy.id, after: res.policy });
    return res.policy;
  })));

  r.delete('/orders/sla-policies/:id', {
    config: { access: { permission: 'orders:write' } },
    schema: { tags: TAGS, summary: 'Delete a dispatch SLA policy', params: IdParamSchema, response: { 200: successEnvelope(PolicySchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const p = await deletePolicy(tx, vendorId, req.params.id);
    await audit(tx, req, { action: 'order.sla_policy_deleted', resourceType: 'marketplace_sla', resourceId: p.id, before: p });
    return p;
  })));

  const Count = z.number().int();
  r.get('/orders/workspace', {
    config: { access: { permission: 'orders:read' } },
    schema: {
      tags: TAGS, summary: 'Orders workspace: pulse, needs attention, sources, SLA pressure and tab counters',
      description: 'One call for the top of the Orders screen. `pulse` = orders placed on `asOf` (business time zone) by current status. Sources = orders placed in the last 24 h per marketplace. Tab counters use the same definitions as `GET /orders/ledger` filters (`filter[tab]`).',
      querystring: z.object({ asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
      response: {
        200: successEnvelope(z.object({
          asOf: z.string(), generatedAt: IsoDate,
          pulse: z.object({ today: Count, stages: z.array(z.object({ key: z.enum(PIPELINE_STAGES), count: Count })) }),
          needsAttention: z.object({ slaRisk: Count, unprocessed: Count, inventoryIssue: Count, paymentIssue: Count, cancellationRisk: Count, returns: Count }),
          sources: z.object({ total: Count, windowHours: Count, items: z.array(z.object({ channel: MarketplaceRef, orders: Count, sharePct: z.number() })) }),
          slaPressure: z.object({
            thresholds: z.object({ atRiskMinutes: Count, approachingMinutes: Count }),
            safe: z.object({ orders: Count, hintKey: z.string(), hint: z.string() }), approaching: z.object({ orders: Count, hintKey: z.string(), hint: z.string() }),
            atRisk: z.object({ orders: Count, hintKey: z.string(), hint: z.string() }), breached: z.object({ orders: Count, hintKey: z.string(), hint: z.string() }),
            summary: z.string(), reviewHref: z.string(),
          }),
          tabs: z.object({ all: Count, needsAttention: Count, new: Count, processing: Count, shipped: Count, delivered: Count, returnsDisputes: Count }),
        })),
      },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => workspace(tx, vendorId, reg(), req.query.asOf))));

  r.get('/orders/ledger', {
    config: { access: { permission: 'orders:read' } },
    schema: {
      tags: TAGS, summary: 'Orders ledger (numbered pages)',
      description: 'All marketplaces in one list with SLA state, payment, fulfillment and the inline inventory issue. Filters: `q`, `filter[marketplace|status|slaState|payment|fulfillmentStatus|attention|tab|date|placedFrom|placedTo]`. Sort: `-placedAt` (default), `placedAt`, `value`, `-value`, `sla` (most urgent first).',
      querystring: PageQuerySchema.extend(FilterQuery.shape).extend(SortQuery.shape),
      response: { 200: pagedEnvelope(LedgerItemSchema) },
    },
  }, async (req) => {
    const q = req.query;
    const win = pageWindow(q);
    const res = await vendorTx(req, (tx, vendorId) => ledger(tx, vendorId, reg(), filters(q), q.sort as LedgerSort, win));
    return paged(req, res.items, q, res.total);
  });

  r.get('/orders/export', {
    config: { access: { permission: 'orders:read' } },
    schema: {
      tags: TAGS, summary: 'Export orders as CSV', description: 'Same filters and sort as the ledger. At most 50,000 rows (413 beyond: narrow the filters). Cells that could be read as spreadsheet formulas are neutralised.',
      querystring: FilterQuery.extend(SortQuery.shape), response: { 200: z.any().describe('text/csv') },
    },
  }, async (req, reply) => {
    const q = req.query;
    const res = await vendorTx(req, async (tx, vendorId) => {
      const out = await exportCsv(tx, vendorId, reg(), filters(q), q.sort as LedgerSort);
      await audit(tx, req, { action: 'order.export', resourceType: 'order', metadata: { rows: out.rows, filters: Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)) } });
      return out;
    });
    reply.header('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`).header('X-Row-Count', String(res.rows)).type('text/csv; charset=utf-8');
    return res.csv;
  });

  r.get('/orders/activity', {
    config: { access: { permission: 'orders:read' } },
    schema: {
      tags: TAGS, summary: 'Recent order activity across marketplaces',
      description: 'Newest first: payment confirmed, moved to ready to dispatch, picking started, SLA risk detected (for orders currently at risk) and return requests.',
      querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(5) }),
      response: { 200: successEnvelope(z.array(z.object({ at: IsoDate, orderId: z.string(), orderNumber: z.string(), channel: MarketplaceRef, event: z.enum(['payment_confirmed', 'ready_to_dispatch', 'picking_started', 'sla_risk', 'return_requested']), text: z.string() }))) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => activity(tx, vendorId, reg(), req.query.limit)) as never));

  r.get('/orders/:id/drawer', {
    config: { access: { permission: 'orders:read' } },
    schema: {
      tags: TAGS, summary: 'Order side drawer', description: 'Everything the drawer shows in one call: SLA progress, customer (only what the channel provided), items, fulfillment, marketplace status, recent activity and the allowed actions.',
      params: IdParamSchema,
      response: {
        200: successEnvelope(z.object({
          id: z.string(), number: z.string(), status: z.string(), channel: MarketplaceRef, createdAt: IsoDate, placedAt: IsoDate,
          sla: z.object({ state: SlaState, dueAt: IsoDate.nullable(), minutesRemaining: z.number().int().nullable(), label: z.string().nullable(), progressPct: z.number().int().nullable(), stageLabel: z.string() }),
          customer: z.object({ name: z.string().nullable(), city: z.string().nullable(), state: z.string().nullable() }),
          value: z.object({ totalMinor: z.number().int(), currency: z.string(), paymentStatus: z.string(), paymentMethod: z.string() }),
          items: z.object({ units: z.number().int(), lines: z.array(z.object({ title: z.string(), sku: z.string(), qty: z.number().int() })) }),
          fulfillment: z.object({ warehouse: z.string().nullable(), picking: z.enum(['pending', 'in_progress', 'done']).nullable(), fulfillmentId: z.string().nullable(), status: z.string().nullable() }),
          marketplaceStatus: z.string().nullable(),
          activity: z.array(z.object({ at: IsoDate, text: z.string() })),
          actions: z.array(z.object({ key: z.enum(['open_fulfillment', 'cancel_order']), label: z.string(), method: z.string(), href: z.string().nullable(), enabled: z.boolean(), disabledReason: z.string().nullable() })),
        })),
      },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => drawer(tx, vendorId, reg(), req.params.id))));
};
