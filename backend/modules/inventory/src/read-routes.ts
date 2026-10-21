import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { eq, schema } from '@oms/database';
import { IsoDate, paginatedEnvelope, successEnvelope } from '@oms/contracts';
import { AppError } from '@oms/shared';
import { audit, ok, paginated, vendorTx } from '@oms/module-kit';
import { assertWarehouseCapability } from '@oms/mod-warehouses';
import { applyAdjustment, type AdjustmentInput } from './dashboard-ops';
import { DEFAULT_THRESHOLDS, vendorContext } from './dashboard-query';
import {
  FEED_KINDS, QUICK_REASONS, inventoryKpis, movementFeed, planQuickAdjust, resolveVariant, stockRow, transferNow,
} from './read-models';
import { toTransferDto } from './service';

const TAGS = ['Inventory Control Room'];
const Count = z.number().int();
const StockRowSchema = z.object({ warehouseId: z.string(), onHand: Count, reserved: Count, available: Count, incoming: Count, damaged: Count, returned: Count, quarantined: Count, reorderLevel: Count.nullable(), version: Count });
const Totals = z.object({ onHand: Count, reserved: Count, available: Count, incoming: Count, damaged: Count, returned: Count, quarantined: Count });

const KpiSchema = z.object({
  asOf: IsoDate, mode: z.enum(['simple', 'warehouse']), warehouseId: z.string().nullable(),
  totals: z.object({ skus: Count, unitsAvailable: Count, unitsOnHand: Count, unitsReserved: Count, unitsIncoming: Count, untrackedSkus: Count.describe('active variants without any stock record yet (not part of the ledger)') }),
  health: z.object({ healthy: Count, lowStock: Count, outOfStock: Count, excess: Count }).describe('a partition of totals.skus'),
  stockoutRiskCount: Count.describe('products whose cover is shorter than their lead time (also counts items already low)'),
  valuation: z.object({ amountMinor: z.number(), currency: z.string(), basis: z.literal('cost'), skusCosted: Count, skusWithoutCost: Count }),
  channelSync: z.object({
    state: z.enum(['fresh', 'stale', 'failed', 'never_synced', 'not_connected']), lastSuccessAt: IsoDate.nullable(), minutesSinceLastSuccess: Count.nullable(), label: z.string(),
    connectedChannels: Count, syncingChannels: Count, failedChannels: Count, skusNeedingReview: Count,
  }),
  reorder: z.object({
    show: z.boolean(), recommendationOnly: z.literal(true), title: z.string(), text: z.string(), lowStockCount: Count, stockoutRiskCount: Count, href: z.string(),
    items: z.array(z.object({ sku: z.string(), title: z.string(), available: Count, coverDays: z.number(), leadTimeDays: Count })),
  }),
}).meta({ id: 'InventoryKpis' });

const FeedItemSchema = z.object({
  id: Count, at: IsoDate, variantId: z.string(), sku: z.string(), productTitle: z.string(), warehouse: z.object({ id: z.string(), name: z.string() }),
  type: z.enum(FEED_KINDS), typeLabel: z.string(), movementType: z.enum(schema.MOVEMENT_TYPES),
  quantityDelta: Count.describe('signed: the change in sellable stock, else in the bucket named by quantityBucket'), quantityBucket: z.enum(['available', 'incoming', 'returned', 'damaged', 'quarantined']),
  resultingAvailable: Count, resultingOnHand: Count,
  reference: z.object({ type: z.string(), id: z.string().nullable(), label: z.string().nullable().describe('order or transfer number') }).nullable(), reason: z.string().nullable(),
  operator: z.object({ type: z.enum(['user', 'api_key', 'system', 'webhook']), id: z.string().nullable(), name: z.string() }),
}).meta({ id: 'InventoryFeedItem' });

const VariantRef = { variantId: z.uuid().optional(), sku: z.string().trim().min(1).max(100).optional() };
const QuickAdjustBody = z.object({
  ...VariantRef, warehouseId: z.uuid().optional().describe('default = the default (first active) warehouse'),
  reason: z.enum(QUICK_REASONS).describe('audit_correction (+/-), damaged (-), shrinkage (-), manual_addition (+)'),
  quantityDelta: z.number().int().min(-10_000_000).max(10_000_000).describe('signed units; never zero'), notes: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
}).meta({ id: 'InventoryQuickAdjustRequest' });

const TransferNowBody = z.object({
  ...VariantRef, fromWarehouseId: z.uuid().optional(), toWarehouseId: z.uuid().optional(), from: z.uuid().optional().describe('alias of fromWarehouseId'), to: z.uuid().optional().describe('alias of toWarehouseId'),
  quantity: z.number().int().min(1).max(10_000_000), notes: z.string().trim().max(500).optional(),
}).meta({ id: 'InventoryTransferNowRequest' });

export const inventoryReadRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const actorOf = (req: FastifyRequest) => ({ type: (req.ctx.principal?.actorType ?? 'system') as 'user' | 'api_key' | 'system' | 'webhook', id: req.ctx.principal?.actorId ?? null });

  r.get('/inventory/kpis', {
    config: { access: { permission: 'inventory:read' } },
    schema: {
      tags: TAGS, summary: 'KPI tiles of the Inventory screen',
      description: 'One call for the tile strip. The four health counts partition `totals.skus` (tracked variants): out_of_stock = nothing available; low_stock = at/below the reorder level or cover shorter than the lead time; excess = more than 90 days of cover (or unsold and untouched for `agingDays`); healthy = the rest. Valuation = on-hand units x variant cost price (variants without a cost are counted in `skusWithoutCost`, never guessed). Channel freshness comes from the last successful inventory sync job.',
      querystring: z.object({ warehouseId: z.uuid().optional(), agingDays: z.coerce.number().int().min(0).max(3650).default(DEFAULT_THRESHOLDS.agingDays) }),
      response: { 200: successEnvelope(KpiSchema) },
    },
  }, async (req) => ok(req, await vendorTx(req, async (tx, vendorId) => inventoryKpis(tx, vendorId, await vendorContext(tx, vendorId), { warehouseId: req.query.warehouseId, thresholds: { ...DEFAULT_THRESHOLDS, agingDays: req.query.agingDays } }))));

  r.get('/inventory/movements/feed', {
    config: { access: { permission: 'inventory:read' } },
    schema: {
      tags: TAGS, summary: 'Human movement feed (newest first)',
      description: 'The "Recent stock movements" list: SKU, product, warehouse, readable type, signed quantity, resulting available, reference (order / transfer number), reason and operator name. Keyset paging: pass `meta.nextCursor` as `cursor`. The raw ledger stays at GET /inventory/movements.',
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().regex(/^\d{1,18}$/).optional(), q: z.string().trim().max(100).optional().describe('SKU or product title'),
        'filter[variantId]': z.uuid().optional(), 'filter[warehouseId]': z.uuid().optional(), 'filter[type]': z.enum(FEED_KINDS).optional(), 'filter[from]': z.coerce.date().optional(), 'filter[to]': z.coerce.date().optional(),
      }),
      response: { 200: paginatedEnvelope(FeedItemSchema) },
    },
  }, async (req) => {
    const q = req.query;
    const page = await vendorTx(req, (tx, vendorId) => movementFeed(tx, vendorId, {
      limit: q.limit, cursor: q.cursor ? Number(q.cursor) : undefined, q: q.q, variantId: q['filter[variantId]'], warehouseId: q['filter[warehouseId]'], kind: q['filter[type]'], from: q['filter[from]'], to: q['filter[to]'],
    }));
    return paginated(req, page.items, { limit: q.limit, nextCursor: page.nextCursor });
  });

  r.post('/inventory/quick-adjust', {
    config: { access: { permission: 'inventory:write' } },
    schema: {
      tags: TAGS, summary: 'Adjust stock in one call (SKU or variant, default warehouse, screen reasons)',
      description: 'audit_correction = a correction either way, damaged = sellable -> damaged (negative delta), shrinkage = loss (negative delta), manual_addition = stock added (positive delta). One ledger movement; never below zero or below what is reserved. Repeating the same `idempotencyKey` changes nothing.',
      body: QuickAdjustBody,
      response: { 200: successEnvelope(z.object({
        duplicate: z.boolean(), movement: z.object({ id: Count }), variant: z.object({ id: z.string(), sku: z.string(), title: z.string() }), warehouse: z.object({ id: z.string(), name: z.string() }),
        type: z.enum(['correction', 'damage', 'manual']), result: z.object({ currentAvailable: Count, adjustment: Count, newAvailable: Count }), stock: StockRowSchema, totals: Totals,
      })) },
    },
  }, async (req) => {
    const b = req.body;
    const out = await vendorTx(req, async (tx, vendorId) => {
      const plan = await planQuickAdjust(tx, vendorId, b);
      await assertWarehouseCapability(tx, req.ctx.principal, vendorId, plan.warehouseId, 'adjust');
      const mv = await applyAdjustment(tx, vendorId, actorOf(req), { ...plan.adjustment, variantId: plan.variant.id, warehouseId: plan.warehouseId, idempotencyKey: b.idempotencyKey ?? null } as AdjustmentInput);
      if (!mv.duplicate) await audit(tx, req, { action: `inventory.quick_adjust.${b.reason}`, resourceType: 'inventory', resourceId: mv.stock.id, after: { movementId: mv.movementId, reason: b.reason, delta: b.quantityDelta, onHand: mv.stock.quantityOnHand, reserved: mv.stock.quantityReserved } });
      const { row, totals } = await stockRow(tx, vendorId, plan.variant.id, plan.warehouseId);
      const [w] = await tx.select({ name: schema.warehouses.name }).from(schema.warehouses).where(eq(schema.warehouses.id, plan.warehouseId));
      return {
        duplicate: mv.duplicate, movement: { id: mv.movementId }, variant: plan.variant, warehouse: { id: plan.warehouseId, name: w?.name ?? '' }, type: plan.adjustment.type as 'correction' | 'damage' | 'manual',
        result: { currentAvailable: mv.availableBefore, adjustment: mv.availableAfter - mv.availableBefore, newAvailable: mv.availableAfter },
        stock: { warehouseId: plan.warehouseId, onHand: row!.onHand, reserved: row!.reserved, available: row!.available, incoming: row!.incoming, damaged: row!.damaged, returned: row!.returned, quarantined: row!.quarantined, reorderLevel: row!.reorderLevel, version: row!.version },
        totals,
      };
    });
    return ok(req, out);
  });

  r.post('/inventory/transfer-now', {
    config: { access: { permission: 'inventory:write' } },
    schema: {
      tags: TAGS, summary: 'Move stock between two warehouses immediately',
      description: 'Creates, ships and receives one transfer document in a single transaction (the staged flow POST /inventory/transfers stays). The ledger shows transfer_out + incoming + receive movements; the source can never go below what is reserved (409 INSUFFICIENT_STOCK). `from` / `to` are accepted as aliases of `fromWarehouseId` / `toWarehouseId`.',
      body: TransferNowBody,
      response: { 200: successEnvelope(z.object({
        transfer: z.object({ id: z.string(), number: z.string(), status: z.enum(schema.TRANSFER_STATUSES), fromWarehouseId: z.string(), toWarehouseId: z.string(), notes: z.string().nullable(), items: z.array(z.object({ variantId: z.string(), sku: z.string(), quantity: Count, receivedQuantity: Count })) }),
        variant: z.object({ id: z.string(), sku: z.string(), title: z.string() }), source: StockRowSchema.nullable(), destination: StockRowSchema.nullable(), totals: Totals,
      })) },
    },
  }, async (req) => {
    const b = req.body;
    const from = b.fromWarehouseId ?? b.from;
    const to = b.toWarehouseId ?? b.to;
    if (!from || !to) throw new AppError('BAD_REQUEST', 'Provide the source and destination warehouse (fromWarehouseId / toWarehouseId)', { details: { rule: 'warehouses_required' } });
    const out = await vendorTx(req, async (tx, vendorId) => {
      const variant = await resolveVariant(tx, vendorId, b);
      await assertWarehouseCapability(tx, req.ctx.principal, vendorId, from, 'adjust');
      await assertWarehouseCapability(tx, req.ctx.principal, vendorId, to, 'receive');
      const t = await transferNow(tx, vendorId, actorOf(req), { variantId: variant.id, fromWarehouseId: from, toWarehouseId: to, quantity: b.quantity, notes: b.notes });
      const dto = toTransferDto(t);
      await audit(tx, req, { action: 'inventory.transfer_now', resourceType: 'stock_transfer', resourceId: dto.id, after: { number: dto.number, sku: variant.sku, quantity: b.quantity, from, to } });
      const src = await stockRow(tx, vendorId, variant.id, from);
      const dst = await stockRow(tx, vendorId, variant.id, to);
      const pick = (x: typeof src.row) => (x ? { warehouseId: x.warehouseId, onHand: x.onHand, reserved: x.reserved, available: x.available, incoming: x.incoming, damaged: x.damaged, returned: x.returned, quarantined: x.quarantined, reorderLevel: x.reorderLevel, version: x.version } : null);
      return { transfer: { id: dto.id, number: dto.number, status: dto.status, fromWarehouseId: dto.fromWarehouseId, toWarehouseId: dto.toWarehouseId, notes: dto.notes, items: dto.items }, variant, source: pick(src.row), destination: pick(dst.row), totals: dst.totals };
    });
    return ok(req, out);
  });
};
