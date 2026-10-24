import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { schema } from '@oms/database';
import { IdParamSchema, IsoDate, PageQuerySchema, pagedEnvelope, successEnvelope } from '@oms/contracts';
import { AppError } from '@oms/shared';
import { audit, created, ok, pageWindow, paged, vendorTx } from '@oms/module-kit';
import { assertWarehouseCapability } from '@oms/mod-warehouses';
import {
  DEFAULT_THRESHOLDS, HEALTHS, SIGNALS, STOCK_STATUSES, ledgerAll, ledgerCount, ledgerPage, overview, variantPanel, vendorContext, type LedgerFilters, type LedgerSort, type Thresholds,
} from './dashboard-query';
import {
  ADJUSTMENT_TYPES, BULK_ALL_MAX, bulkLimits, BULK_IDS_MAX, CSV_HEADER, EXPORT_MAX, addToGroup, affectedListings, applyAdjustment, channelSync, connectedAccountIds, createGroup, csvRow, deleteGroup,
  listGroups, masterSummary, previewAdjustment, removeFromGroup, runBulk, searchCatalogVariants, toCsv, type SyncAccount, type SyncOutcome,
} from './dashboard-ops';
import { channelRef } from './dashboard-query';
import { variantOverview } from './service';

const TAGS = ['Inventory Control Room'];
const HealthEnum = z.enum(HEALTHS);
const SignalEnum = z.enum(SIGNALS);
const StockStatusEnum = z.enum(STOCK_STATUSES);
const ToneEnum = z.enum(['neutral', 'good', 'warn', 'bad', 'info']);

const ChannelRef = z.object({ code: z.string(), name: z.string(), accountId: z.string().nullable(), availability: z.enum(['live', 'coming_soon']) });
const Action = z.object({ key: z.string(), label: z.string(), method: z.string(), href: z.string(), enabled: z.boolean(), disabledReason: z.string().nullable() });
const FeedItem = z.object({ at: IsoDate, type: z.string(), text: z.string(), detail: z.string().nullable(), ref: z.object({ type: z.string(), id: z.string() }).nullable() });

// ---- shared filters (query string uses filter[...]; JSON bodies use the plain keys)
const FilterFields = {
  warehouse: z.uuid().optional().describe('only stock held in this warehouse'),
  channel: z.string().trim().max(60).optional().describe('marketplace code (amazon_in, flipkart, ...) or marketplace account id: products with a live listing there'),
  health: z.enum([...HEALTHS, 'stockout_risk']).optional().describe('stockout_risk = attention or critical (cover shorter than the lead time)'),
  stockMin: z.coerce.number().int().optional(), stockMax: z.coerce.number().int().optional(),
  movement: z.enum(['received', 'adjusted', 'reserved', 'returned', 'synced']).optional().describe('type of the LAST movement of the product (synced = at least one successful channel push)'),
  stockStatus: StockStatusEnum.optional().describe('the tabs of the screen: healthy, low_stock, out_of_stock, excess (definitions in GET /inventory/kpis)'),
  signal: SignalEnum.optional(), group: z.uuid().optional().describe('saved group id'),
};
const FiltersBody = z.object({ q: z.string().trim().max(100).optional(), ...FilterFields }).strict().meta({ id: 'InventoryLedgerFilters' });
const Thresh = { agingDays: z.coerce.number().int().min(0).max(3650).default(DEFAULT_THRESHOLDS.agingDays), imbalancePct: z.coerce.number().min(1).max(100).default(DEFAULT_THRESHOLDS.imbalancePct) };
const filterQuery = z.object({
  q: z.string().trim().max(100).optional(),
  'filter[warehouse]': FilterFields.warehouse, 'filter[channel]': FilterFields.channel, 'filter[health]': FilterFields.health, 'filter[stockMin]': FilterFields.stockMin, 'filter[stockMax]': FilterFields.stockMax,
  'filter[movement]': FilterFields.movement, 'filter[signal]': FilterFields.signal, 'filter[stockStatus]': FilterFields.stockStatus, 'filter[group]': FilterFields.group, ...Thresh,
});
type FilterQuery = z.infer<typeof filterQuery>;
const filtersOfQuery = (q: FilterQuery): LedgerFilters => ({
  q: q.q, warehouse: q['filter[warehouse]'], channel: q['filter[channel]'], health: q['filter[health]'], stockMin: q['filter[stockMin]'], stockMax: q['filter[stockMax]'],
  movement: q['filter[movement]'], signal: q['filter[signal]'], group: q['filter[group]'], stockStatus: q['filter[stockStatus]'],
});
const thOf = (q: { agingDays?: number; imbalancePct?: number }): Thresholds => ({ agingDays: q.agingDays ?? DEFAULT_THRESHOLDS.agingDays, imbalancePct: q.imbalancePct ?? DEFAULT_THRESHOLDS.imbalancePct });

// ---- responses
const LedgerItemSchema = z.object({
  variantId: z.string(), productId: z.string(), thumbnailUrl: z.string().nullable(), title: z.string(), sku: z.string(), barcode: z.string().nullable(),
  available: z.number().int(), reserved: z.number().int(), incoming: z.number().int(), returned: z.number().int(), damaged: z.number().int(), quarantined: z.number().int(), onHand: z.number().int(),
  unitsPerDay: z.number(), coverDays: z.number().nullable(), leadTimeDays: z.number().int(),
  warehouse: z.object({ id: z.string(), name: z.string() }).nullable().describe('null in simple (single location) mode'),
  channelSync: z.enum(['healthy', 'attention', 'failed', 'not_listed']), health: HealthEnum, lastMovementAt: IsoDate.nullable(), borderTone: ToneEnum,
  stockStatus: StockStatusEnum.describe('healthy | low_stock | out_of_stock | excess (the tabs of the screen)'),
  category: z.object({ id: z.string(), name: z.string() }).nullable(),
  warehouses: z.array(z.object({
    warehouseId: z.string(), warehouseName: z.string(), city: z.string().nullable(), onHand: z.number().int(), reserved: z.number().int(), available: z.number().int(),
    safetyStock: z.number().int().nullable().describe('the reorder level of this location (null = none set)'),
  })),
}).meta({ id: 'InventoryLedgerItem' });

const OverviewSchema = z.object({
  asOf: z.string(), live: z.boolean(), mode: z.enum(['simple', 'warehouse']),
  pulse: z.object({ available: z.number().int(), reserved: z.number().int(), incoming: z.number().int(), returned: z.number().int(), damaged: z.number().int(), quarantined: z.number().int(), flow: z.object({ incomingToday: z.number().int() }) }),
  horizon: z.object({
    leadTimeBasis: z.enum(['variant', 'default']), defaultLeadTimeDays: z.number().int(), windowDays: z.number().int(), scaleMaxDays: z.number().int(),
    items: z.array(z.object({
      variantId: z.string(), productId: z.string(), title: z.string(), sku: z.string(), thumbnailUrl: z.string().nullable(), stock: z.number().int(), unitsPerDay: z.number(), coverDays: z.number().nullable(),
      leadTimeDays: z.number().int(), leadTimeSource: z.enum(['variant', 'default']), health: HealthEnum, action: z.object({ key: z.string(), label: z.string(), href: z.string() }),
    })),
  }),
  signals: z.array(z.object({ key: SignalEnum, count: z.number().int(), trend: z.array(z.number().int()).nullable().describe('7 daily points ending on asOf; null when the history cannot be derived'), tone: ToneEnum, href: z.string() })),
  advisory: z.object({
    title: z.string(), text: z.string(), recommendationOnly: z.literal(true), recommendationId: z.string().nullable(),
    items: z.array(z.object({ variantId: z.string(), title: z.string(), sku: z.string(), units: z.number().int(), coverDays: z.number(), leadTimeDays: z.number().int() })),
  }),
  distribution: z.object({
    byWarehouse: z.array(z.object({ warehouseId: z.string(), name: z.string(), units: z.number().int(), sharePct: z.number(), demandSharePct: z.number().nullable() })),
    insight: z.object({ text: z.string(), warehouseId: z.string(), advisoryOnly: z.literal(true) }).nullable(),
  }).optional().describe('warehouse mode only'),
  location: z.object({ id: z.string().nullable(), name: z.string() }).optional().describe('simple mode only'),
  recentMovements: z.array(FeedItem),
  ledger: z.object({ total: z.number().int() }).describe('0 = show the "Your inventory starts here" state'),
}).meta({ id: 'InventoryOverview' });

const ChannelSyncSchema = z.object({
  master: z.object({ available: z.number().int(), lastUpdateAt: IsoDate.nullable() }),
  channels: z.array(z.object({
    channel: ChannelRef, accountName: z.string(), state: z.enum(['healthy', 'syncing', 'attention', 'failed', 'not_connected']), lastSyncAt: IsoDate.nullable(), lastSyncLabel: z.enum(['reported', 'not_reported']),
    sentUnits: z.number().int(), listings: z.number().int(), affectedSkus: z.number().int(), affectedProducts: z.number().int(),
  })),
  incidents: z.array(z.object({
    id: z.string(), channel: ChannelRef, title: z.string(), reason: z.string(), affected: z.object({ skus: z.number().int(), variants: z.number().int(), products: z.number().int() }), lastFailedAt: IsoDate.nullable(),
    actions: z.array(Action.extend({ body: z.record(z.string(), z.unknown()).nullable() })),
  })),
  operations: z.object({
    syncing: z.object({ channels: z.number().int(), skus: z.number().int(), progress: z.object({ done: z.number().int(), total: z.number().int() }).nullable() }),
    lastSuccessAt: IsoDate.nullable(), requireReview: z.object({ skus: z.number().int(), channels: z.number().int() }), failed: z.object({ channels: z.number().int() }),
  }),
}).meta({ id: 'InventoryChannelSync' });

const AffectedSchema = z.object({
  variantId: z.string(), listingId: z.string(), sku: z.string(), title: z.string(), masterAvailable: z.number().int(), channelQuantity: z.number().int().nullable(), requestedQuantity: z.number().int().nullable(),
  lastError: z.object({ code: z.string().nullable(), message: z.string().nullable() }).nullable(), lastTriedAt: IsoDate.nullable(),
}).meta({ id: 'InventoryAffectedListing' });

const PanelSchema = z.object({
  product: z.object({ productId: z.string(), variantId: z.string(), title: z.string(), sku: z.string(), thumbnailUrl: z.string().nullable() }),
  snapshot: z.object({ available: z.number().int(), reserved: z.number().int(), incoming: z.number().int(), onHand: z.number().int(), returned: z.number().int(), damaged: z.number().int(), quarantined: z.number().int() }),
  byLocation: z.array(z.object({ warehouseId: z.string(), name: z.string(), code: z.string(), available: z.number().int(), onHand: z.number().int(), reserved: z.number().int(), incoming: z.number().int(), returned: z.number().int(), damaged: z.number().int(), quarantined: z.number().int() })),
  channelAvailability: z.array(z.object({ channel: ChannelRef, listingId: z.string(), quantity: z.number().int().nullable(), status: z.enum(['healthy', 'syncing', 'failed']), lastError: z.string().nullable(), lastTriedAt: IsoDate.nullable() })),
  health: z.object({ state: HealthEnum, tone: ToneEnum, text: z.string() }),
  metrics: z.object({ unitsPerDay: z.number(), coverDays: z.number().nullable(), leadTimeDays: z.number().int(), windowDays: z.number().int(), lowStockThreshold: z.number().int().nullable() }),
  recentMovements: z.array(FeedItem), actions: z.array(Action),
}).meta({ id: 'InventoryVariantPanel' });

const AdjustBody = z.object({
  variantId: z.uuid(), warehouseId: z.uuid(), type: z.enum(ADJUSTMENT_TYPES).describe('damage: available -> damaged (direction increase restores); return: customer return; shrinkage: a loss, removes units (direction decrease only); opening_stock: the first units of a variant in a warehouse (adds units only; creates the stock row); correction / manual / other: change on-hand'),
  quantity: z.number().int().min(1).max(10_000_000).optional(), direction: z.enum(['increase', 'decrease']).optional().describe('required for correction / manual / other'),
  setOnHand: z.number().int().min(0).max(10_000_000).optional().describe('correction only: a physical count (the ledger records the difference)'),
  disposition: z.enum(['hold', 'restock']).optional().describe('return only: hold = returned bucket until inspected (default), restock = sellable immediately'),
  reason: z.string().trim().min(2).max(300), note: z.string().trim().max(500).optional().describe('required for type "other"'), idempotencyKey: z.string().trim().min(8).max(100).optional(),
}).meta({ id: 'InventoryAdjustmentRequest' });

const PreviewSchema = z.object({
  currentAvailable: z.number().int(), adjustment: z.number().int(), newAvailable: z.number().int(), warnings: z.array(z.object({ code: z.string(), message: z.string() })),
  buckets: z.object({ onHand: z.number().int(), reserved: z.number().int(), incoming: z.number().int(), returned: z.number().int(), damaged: z.number().int(), quarantined: z.number().int() }),
}).meta({ id: 'InventoryAdjustmentPreview' });

const SelectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('ids'), ids: z.array(z.uuid()).min(1).max(BULK_IDS_MAX) }),
  z.object({ mode: z.literal('all_matching'), filters: FiltersBody.default({}) }),
]).meta({ id: 'InventorySelection' });

const BulkBody = z.object({
  selection: SelectionSchema, action: z.enum(['adjust', 'transfer', 'export', 'sync', 'group']),
  params: z.object({
    type: z.enum(ADJUSTMENT_TYPES).optional(), quantity: z.number().int().min(1).max(10_000_000).optional(), direction: z.enum(['increase', 'decrease']).optional(), reason: z.string().trim().min(2).max(300).optional(),
    note: z.string().trim().max(500).optional(), setOnHand: z.number().int().min(0).max(10_000_000).optional(), disposition: z.enum(['hold', 'restock']).optional(), warehouseId: z.uuid().optional(),
    fromWarehouseId: z.uuid().optional(), toWarehouseId: z.uuid().optional(), notes: z.string().max(500).optional(), groupId: z.uuid().optional(), groupName: z.string().trim().min(1).max(80).optional(),
  }).strict().default({}),
}).meta({ id: 'InventoryBulkRequest' });

const GroupSchema = z.object({ id: z.string(), name: z.string(), itemCount: z.number().int(), createdAt: IsoDate, updatedAt: IsoDate }).meta({ id: 'InventoryGroup' });

const BulkResultSchema = z.object({
  action: z.string(), total: z.number().int(), succeeded: z.number().int(), failed: z.number().int(),
  results: z.array(z.object({ variantId: z.string(), sku: z.string().nullable(), ok: z.boolean(), error: z.object({ code: z.string(), message: z.string() }).optional() })),
  transfer: z.object({ id: z.string(), number: z.string(), status: z.string(), items: z.number().int() }).optional(),
  group: GroupSchema.optional(),
  export: z.object({ filename: z.string(), contentType: z.string(), rows: z.number().int(), csv: z.string() }).optional(),
  jobs: z.array(z.object({ accountId: z.string(), jobId: z.string().nullable(), status: z.enum(['queued', 'already_queued', 'failed']), error: z.object({ code: z.string(), message: z.string() }).nullable() })).optional(),
  jobId: z.null().describe('bulk actions run inline (bounded at 5,000 products); no background job is created').optional(),
}).meta({ id: 'InventoryBulkResult' });

const STATUS_CODE: Record<number, 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'BAD_REQUEST'> = { 404: 'NOT_FOUND', 403: 'FORBIDDEN', 409: 'CONFLICT', 400: 'BAD_REQUEST', 422: 'BAD_REQUEST' };

export const inventoryDashboardRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const actorOf = (req: FastifyRequest) => ({ type: (req.ctx.principal?.actorType ?? 'system') as 'user' | 'api_key' | 'system' | 'webhook', id: req.ctx.principal?.actorId ?? null });
  const canWrite = (req: FastifyRequest) => req.ctx.principal?.permissions.has('inventory:write') ?? false;

  /**
   * Queues the inventory sync of one marketplace account by calling the listings route `POST /marketplace-accounts/{id}/inventory-sync`
   * with the caller's own credentials. (The listings module depends on inventory, so inventory cannot import it.)
   */
  const syncAccountFor = (req: FastifyRequest): SyncAccount => async (accountId): Promise<SyncOutcome> => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    for (const h of ['authorization', 'x-api-key']) { const v = req.headers[h]; if (typeof v === 'string') headers[h] = v; }
    const res = await app.inject({ method: 'POST', url: `/api/v1/marketplace-accounts/${accountId}/inventory-sync`, headers, payload: '{}' });
    let body: { data?: { job?: { id?: string }; alreadyQueued?: boolean }; error?: { code?: string; message?: string } } = {};
    try { body = JSON.parse(res.body || '{}'); } catch { /* not json */ }
    if (res.statusCode === 202) return { status: 202, jobId: body.data?.job?.id ?? null, alreadyQueued: !!body.data?.alreadyQueued, error: null };
    return { status: res.statusCode, jobId: null, alreadyQueued: false, error: { code: body.error?.code ?? 'ERROR', message: body.error?.message ?? 'The sync request was refused' } };
  };

  // ================================================================== overview
  r.get('/inventory/overview', {
    config: { access: { permission: 'inventory:read' } },
    schema: {
      tags: TAGS,
      summary: 'Inventory control room: stock pulse, horizon, signals, advisory, distribution, recent movements',
      description: 'One call for the top of the page. `available = on hand - reserved`, summed over active warehouses; returned / damaged / quarantined are separate buckets. Velocity = units on non-cancelled orders over the last 14 days; `coverDays` is null when nothing sold. Lead time = variant lead time, else the business default (settings `inventory.defaultLeadTimeDays`, else 7). In simple mode `location` replaces `distribution`.',
      querystring: z.object({
        asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('business-day (YYYY-MM-DD); default today in the business time zone; not in the future. Quantities are current; the day scopes flow, trend and recent movements.'),
        warehouseId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(10).describe('horizon rows'), movements: z.coerce.number().int().min(1).max(50).default(8), ...Thresh,
      }),
      response: { 200: successEnvelope(OverviewSchema) },
    },
  }, async (req) => {
    const q = req.query;
    return ok(req, (await vendorTx(req, async (tx, vendorId) => overview(tx, vendorId, await vendorContext(tx, vendorId), { asOf: q.asOf, warehouseId: q.warehouseId, limit: q.limit, movementsLimit: q.movements, thresholds: thOf(q) }))) as never);
  });

  // ================================================================== channel sync
  r.get('/inventory/channel-sync', {
    config: { access: { permission: 'inventory:read' } },
    schema: {
      tags: TAGS, summary: 'Channel synchronisation: master stock, state per marketplace account, incidents',
      description: 'State: `syncing` (an inventory job is queued/running/retrying), `failed` (the last job failed), `attention` (SKUs whose last push was rejected or differs from what we computed), `not_connected`, else `healthy`. `sentUnits` = units last pushed to live listings.',
      response: { 200: successEnvelope(ChannelSyncSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => channelSync(tx, vendorId, { master: await masterSummary(tx, vendorId) }))));

  r.get('/inventory/channel-sync/:accountId/affected', {
    config: { access: { permission: 'inventory:read' } },
    schema: {
      tags: TAGS, summary: 'SKUs whose last channel push was rejected or differs', params: z.object({ accountId: z.uuid() }), querystring: PageQuerySchema,
      response: { 200: pagedEnvelope(AffectedSchema) },
    },
  }, async (req) => {
    const w = pageWindow(req.query);
    const out = await vendorTx(req, (tx, vendorId) => affectedListings(tx, vendorId, req.params.accountId, w));
    return paged(req, out.items, req.query, out.total);
  });

  r.post('/inventory/channel-sync', {
    config: { access: { permission: 'inventory:write' } },
    schema: {
      tags: TAGS, summary: 'Sync inventory to the channels (all connected accounts, or one)',
      description: 'Without `accountId` an inventory sync is queued for every connected account ("Sync all"); with it, for that account only ("Retry sync"). Returns 202 with one job per account. Needs `listings:write` as well (it queues the same job as `POST /marketplace-accounts/{id}/inventory-sync`).',
      body: z.object({ accountId: z.uuid().optional() }).default({}),
      response: { 202: successEnvelope(z.object({ requested: z.number().int(), queued: z.number().int(), results: z.array(z.object({ accountId: z.string(), channel: ChannelRef, jobId: z.string().nullable(), status: z.enum(['queued', 'already_queued', 'failed']), error: z.object({ code: z.string(), message: z.string() }).nullable() })) })) },
    },
  }, async (req, reply) => {
    const accounts = await vendorTx(req, async (tx, vendorId) => {
      const as = await connectedAccountIds(tx, vendorId, req.body.accountId);
      await audit(tx, req, { action: 'inventory.channel_sync', resourceType: 'marketplace_account', resourceId: req.body.accountId, after: { accounts: as.length } });
      return as;
    });
    const sync = syncAccountFor(req);
    const results = [];
    for (const a of accounts) {
      const o = await sync(a.id);
      if (req.body.accountId && o.error) throw new AppError(STATUS_CODE[o.status] ?? 'CONFLICT', o.error.message, { details: { upstreamCode: o.error.code } });
      results.push({ accountId: a.id, channel: channelRef(a.marketplace, a.id), jobId: o.jobId, status: o.error ? ('failed' as const) : o.alreadyQueued ? ('already_queued' as const) : ('queued' as const), error: o.error });
    }
    reply.code(202);
    return ok(req, { requested: results.length, queued: results.filter((x) => x.status !== 'failed').length, results });
  });

  // ================================================================== ledger
  r.get('/inventory/ledger', {
    config: { access: { permission: 'inventory:read' } },
    schema: {
      tags: TAGS, summary: 'Inventory ledger table (one row per product variant with stock)',
      description: 'Numbered pages. Filters: `q` (SKU / product / barcode), `filter[warehouse|channel|health|stockMin|stockMax|movement|signal|group]`. Default order = most urgent first. `channelSync` reflects the product\'s live listings (`not_listed` when it has none). `warehouse` is null in simple mode.',
      querystring: PageQuerySchema.extend(filterQuery.shape).extend({ sort: z.enum(['health', 'sku', '-sku', 'available', '-available', 'coverDays', '-coverDays', 'lastMovement', '-lastMovement']).default('health') }),
      response: { 200: pagedEnvelope(LedgerItemSchema) },
    },
  }, async (req) => {
    const q = req.query;
    pageWindow(q);
    const out = await vendorTx(req, async (tx, vendorId) => ledgerPage(tx, vendorId, await vendorContext(tx, vendorId), { filters: filtersOfQuery(q), sort: q.sort as LedgerSort, page: q.page, pageSize: q.pageSize, thresholds: thOf(q) }));
    return paged(req, out.items, q, out.total);
  });

  r.post('/inventory/ledger/selection-count', {
    config: { access: { permission: 'inventory:read' } },
    schema: { tags: TAGS, summary: 'How many products a filter selects ("24 products selected")', body: z.object({ filters: FiltersBody.default({}) }), response: { 200: successEnvelope(z.object({ total: z.number().int() })) } },
  }, async (req) => ok(req, { total: await vendorTx(req, async (tx, vendorId) => ledgerCount(tx, vendorId, await vendorContext(tx, vendorId), req.body.filters)) }));

  r.get('/inventory/variants/:id/panel', {
    config: { access: { permission: 'inventory:read' } },
    schema: {
      tags: TAGS, summary: 'Product context panel: snapshot, stock by location, channel availability, health, recent movements, actions', params: IdParamSchema,
      response: { 200: successEnvelope(PanelSchema) },
    },
  }, async (req) => ok(req, (await vendorTx(req, async (tx, vendorId) => variantPanel(tx, vendorId, await vendorContext(tx, vendorId), req.params.id, { write: canWrite(req) }))) as never));

  // ================================================================== export
  r.get('/inventory/export', {
    config: { access: { permission: 'inventory:read' } },
    schema: {
      tags: TAGS, summary: 'Export the ledger as CSV (same filters as the ledger)',
      description: `text/csv attachment, one row per product variant; 413 beyond ${EXPORT_MAX} rows (narrow the filters). Cells starting with = + - @ are neutralised.`,
      querystring: filterQuery, response: { 200: z.string().describe('text/csv') },
    },
  }, async (req, reply) => {
    const csv = await vendorTx(req, async (tx, vendorId) => {
      const all = await ledgerAll(tx, vendorId, await vendorContext(tx, vendorId), filtersOfQuery(req.query), bulkLimits.exportMax, thOf(req.query));
      if (all.tooMany) throw new AppError('PAYLOAD_TOO_LARGE', `More than ${bulkLimits.exportMax} rows match. Narrow the filters.`, { details: { max: bulkLimits.exportMax } });
      await audit(tx, req, { action: 'inventory.export', resourceType: 'inventory', after: { rows: all.items.length } });
      return toCsv([CSV_HEADER, ...all.items.map(csvRow)]);
    });
    reply.header('Content-Disposition', `attachment; filename="inventory-${new Date().toISOString().slice(0, 10)}.csv"`).type('text/csv; charset=utf-8');
    return csv;
  });

  // ================================================================== adjustments
  const adjustPreflight = async (tx: Parameters<Parameters<typeof vendorTx>[1]>[0], req: FastifyRequest, vendorId: string, warehouseId: string) => {
    await assertWarehouseCapability(tx, req.ctx.principal, vendorId, warehouseId, 'adjust');
  };

  r.get('/inventory/catalog-variants', {
    config: { access: { permission: 'inventory:read' } },
    schema: {
      tags: TAGS, summary: 'Search the catalog for variants, also those without a stock row',
      description: 'Variants of the business by SKU, barcode or product name. A brand-new variant has no stock row, so it is not in `GET /inventory/ledger`; use `unstocked=true` to list only those and give them opening stock with `POST /inventory/adjustments` (`type: opening_stock`). `stocked` says whether the variant has a stock row in any warehouse.',
      querystring: z.object({ q: z.string().trim().max(100).optional(), unstocked: z.enum(['true', 'false']).optional().describe('true = only variants without any stock row'), limit: z.coerce.number().int().min(1).max(50).default(8) }),
      response: { 200: successEnvelope(z.array(z.object({ variantId: z.string(), productId: z.string(), sku: z.string(), title: z.string(), variantName: z.string().nullable(), barcode: z.string().nullable(), stocked: z.boolean() })).meta({ id: 'InventoryCatalogVariants' })) },
    },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => searchCatalogVariants(tx, vendorId, { q: req.query.q, unstockedOnly: req.query.unstocked === 'true', limit: req.query.limit }))));

  r.post('/inventory/adjustments/preview', {
    config: { access: { permission: 'inventory:write' } },
    schema: {
      tags: TAGS, summary: 'Preview an adjustment (nothing is written)',
      description: 'Runs the real adjustment inside a rolled-back savepoint: it fails with exactly the errors the write would (never negative, never below reserved) and otherwise returns `currentAvailable`, `adjustment`, `newAvailable` and warnings for that location.',
      body: AdjustBody, response: { 200: successEnvelope(PreviewSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    await adjustPreflight(tx, req, vendorId, req.body.warehouseId);
    return previewAdjustment(tx, vendorId, actorOf(req), req.body);
  })));

  r.post('/inventory/adjustments', {
    config: { access: { permission: 'inventory:write' } },
    schema: {
      tags: TAGS, summary: 'Adjust stock by type (damage / return / correction / manual / shrinkage / other / opening_stock)',
      description: 'One ledger movement in the audit trail. `damage` moves available -> damaged (direction `increase` restores); `return` records a customer return (held in the returned bucket unless `disposition: restock`); `shrinkage` writes off lost units as its own movement type (a loss: `quantity` units leave on-hand, `direction` may only be `decrease`); `opening_stock` adds `quantity` units as the first stock of a variant that has none in that warehouse yet (it creates the stock row; increase only, a warehouse is required); `correction` / `manual` / `other` change on-hand by `quantity` in `direction`, or `correction` can pass a physical count `setOnHand`. `other` requires a `note`.',
      body: AdjustBody,
      response: { 200: successEnvelope(z.object({ duplicate: z.boolean(), movement: z.object({ id: z.number().int() }), type: z.enum(ADJUSTMENT_TYPES), result: PreviewSchema.pick({ currentAvailable: true, adjustment: true, newAvailable: true, warnings: true }), stock: z.object({ warehouseId: z.string(), onHand: z.number().int(), reserved: z.number().int(), available: z.number().int(), incoming: z.number().int(), damaged: z.number().int(), returned: z.number().int(), quarantined: z.number().int() }) })) },
    },
  }, async (req) => {
    const out = await vendorTx(req, async (tx, vendorId) => {
      await adjustPreflight(tx, req, vendorId, req.body.warehouseId);
      const mv = await applyAdjustment(tx, vendorId, actorOf(req), req.body);
      if (!mv.duplicate) await audit(tx, req, { action: `inventory.adjustment.${req.body.type}`, resourceType: 'inventory', resourceId: mv.stock.id, after: { movementId: mv.movementId, type: req.body.type, onHand: mv.stock.quantityOnHand, reserved: mv.stock.quantityReserved } });
      const row = (await variantOverview(tx, vendorId, req.body.variantId)).warehouses.find((w) => w.warehouseId === req.body.warehouseId)!;
      return {
        duplicate: mv.duplicate, movement: { id: mv.movementId }, type: req.body.type,
        result: { currentAvailable: mv.availableBefore, adjustment: mv.availableAfter - mv.availableBefore, newAvailable: mv.availableAfter, warnings: [] as Array<{ code: string; message: string }> },
        stock: { warehouseId: row.warehouseId, onHand: row.onHand, reserved: row.reserved, available: row.available, incoming: row.incoming, damaged: row.damaged, returned: row.returned, quarantined: row.quarantined },
      };
    });
    return ok(req, out);
  });

  // ================================================================== bulk + groups
  r.post('/inventory/bulk', {
    config: { access: { permission: 'inventory:write' } },
    schema: {
      tags: TAGS, summary: 'Bulk action on a selection (adjust / transfer / export / sync / group)',
      description: `\`selection.mode = ids\` takes at most ${BULK_IDS_MAX} variants; \`all_matching\` takes the ledger filters and processes up to ${BULK_ALL_MAX} variants (413 beyond: narrow the filters). Every variant is its own unit of work (its own savepoint), so one failure never blocks the others: the response lists \`{ variantId, ok, error? }\` per variant. \`adjust\`: params = adjustment fields (+ optional warehouseId, default = the location holding most stock); \`transfer\`: fromWarehouseId, toWarehouseId, quantity (creates ONE draft transfer for the variants that have enough stock); \`export\`: returns the CSV inline; \`sync\`: queues an inventory sync for every channel account the selection is listed on; \`group\`: groupId or groupName (created if missing).`,
      body: BulkBody, response: { 200: successEnvelope(BulkResultSchema) },
    },
  }, async (req) => {
    const b = req.body;
    const out = await vendorTx(req, async (tx, vendorId) => {
      const vctx = await vendorContext(tx, vendorId);
      const res = await runBulk(tx, {
        vendorId, vctx, actor: actorOf(req), createdBy: req.ctx.principal?.actorId ?? vendorId,
        sel: b.selection.mode === 'ids' ? { mode: 'ids', ids: b.selection.ids } : { mode: 'all_matching', filters: b.selection.filters },
        action: b.action, params: b.params, th: DEFAULT_THRESHOLDS,
      });
      await audit(tx, req, { action: `inventory.bulk_${b.action}`, resourceType: 'inventory', after: { mode: b.selection.mode, total: res.total, succeeded: res.succeeded, failed: res.failed } });
      return res;
    });
    const { syncAccounts, ...res } = out as typeof out & { syncAccounts?: string[] };
    let jobs: Array<{ accountId: string; jobId: string | null; status: 'queued' | 'already_queued' | 'failed'; error: SyncOutcome['error'] }> | undefined;
    if (syncAccounts) {
      jobs = [];
      const sync = syncAccountFor(req);
      for (const accountId of syncAccounts) {
        const o = await sync(accountId);
        jobs.push({ accountId, jobId: o.jobId, status: o.error ? 'failed' : o.alreadyQueued ? 'already_queued' : 'queued', error: o.error });
      }
    }
    return ok(req, { ...res, ...(jobs ? { jobs } : {}), jobId: null } as never);
  });

  r.get('/inventory/groups', {
    config: { access: { permission: 'inventory:read' } },
    schema: { tags: TAGS, summary: 'Saved groups (static lists of products)', response: { 200: successEnvelope(z.array(GroupSchema)) } },
  }, async (req) => ok(req, await vendorTx(req, (tx, vendorId) => listGroups(tx, vendorId))));

  r.post('/inventory/groups', {
    config: { access: { permission: 'inventory:write' } },
    schema: { tags: TAGS, summary: 'Create a saved group', body: z.object({ name: z.string().trim().min(1).max(80), variantIds: z.array(z.uuid()).max(BULK_IDS_MAX).optional() }), response: { 201: successEnvelope(GroupSchema) } },
  }, async (req, reply) => {
    const g = await vendorTx(req, async (tx, vendorId) => {
      const made = await createGroup(tx, vendorId, req.ctx.principal?.actorId ?? vendorId, req.body.name);
      const dto = req.body.variantIds?.length ? (await addToGroup(tx, vendorId, made.id, req.body.variantIds)).group : made;
      await audit(tx, req, { action: 'inventory.group_create', resourceType: 'inventory_group', resourceId: made.id, after: { name: made.name, items: dto.itemCount } });
      return dto;
    });
    return created(req, reply, g, `/api/v1/inventory/groups/${g.id}`);
  });

  r.post('/inventory/groups/:id/items', {
    config: { access: { permission: 'inventory:write' } },
    schema: {
      tags: TAGS, summary: 'Add products to a saved group', params: IdParamSchema, body: z.object({ variantIds: z.array(z.uuid()).min(1).max(BULK_IDS_MAX) }),
      response: { 200: successEnvelope(z.object({ group: GroupSchema, added: z.number().int(), alreadyInGroup: z.number().int() })) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const out = await addToGroup(tx, vendorId, req.params.id, req.body.variantIds);
    await audit(tx, req, { action: 'inventory.group_add', resourceType: 'inventory_group', resourceId: req.params.id, after: { added: out.added } });
    return out;
  })));

  r.delete('/inventory/groups/:id/items/:variantId', {
    config: { access: { permission: 'inventory:write' } },
    schema: { tags: TAGS, summary: 'Remove a product from a saved group', params: z.object({ id: z.uuid(), variantId: z.uuid() }), response: { 200: successEnvelope(GroupSchema) } },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => {
    const g = await removeFromGroup(tx, vendorId, req.params.id, req.params.variantId);
    await audit(tx, req, { action: 'inventory.group_remove', resourceType: 'inventory_group', resourceId: req.params.id, after: { variantId: req.params.variantId } });
    return g;
  })));

  r.delete('/inventory/groups/:id', {
    config: { access: { permission: 'inventory:write' } },
    schema: { tags: TAGS, summary: 'Delete a saved group (the products stay)', params: IdParamSchema, response: { 200: successEnvelope(z.object({ ok: z.literal(true) })) } },
  }, async (req) => {
    await vendorTx(req, async (tx, vendorId) => {
      await deleteGroup(tx, vendorId, req.params.id);
      await audit(tx, req, { action: 'inventory.group_delete', resourceType: 'inventory_group', resourceId: req.params.id });
    });
    return ok(req, { ok: true as const });
  });
};

void schema;
